import { LLMConfig, ChatMessage, ToolActionLog, AIPersona } from '../../types';
import { LLM_TOOLS } from './toolDefinitions';
import { getPersonaPrompt } from './personaPrompts';
import { DeviceManager } from '../deviceManager';
import { isLocalApiBaseUrl, isVolcengineArkPlanApiBaseUrl, parseApiBaseUrl } from '../apiBaseUrl';
import { normalizeLlmConfig } from '../llmConfig';
import { fetchTextStreamWithTimeout, fetchTextWithTimeout } from '../httpClient';
import { stripThinkingArtifacts, deduplicateRepetitiveText } from '../tavern/tavernTextSanitizer';

export interface NormalizedLlmToolCall {
  id: string;
  name: string;
  argumentsJson: string | null;
}

export interface LlmGenerationOptions {
  topP: number;
  maxTokens: number;
  historyMessages: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export const normalizeLlmGenerationOptions = (value: unknown): LlmGenerationOptions => {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<LlmGenerationOptions>
    : {};
  const topP = Number(raw.topP);
  const maxTokens = Number(raw.maxTokens);
  const historyMessages = Number(raw.historyMessages);
  const freq = Number(raw.frequencyPenalty);
  const pres = Number(raw.presencePenalty);
  return {
    topP: Number.isFinite(topP) ? Math.min(1, Math.max(0.05, topP)) : 0.9,
    maxTokens: Number.isFinite(maxTokens) ? Math.min(8_192, Math.max(128, Math.round(maxTokens))) : 3_000,
    historyMessages: Number.isFinite(historyMessages) ? Math.min(2_000, Math.max(1, Math.round(historyMessages))) : 200,
    frequencyPenalty: Number.isFinite(freq) ? Math.min(2, Math.max(-2, freq)) : 0.2,
    presencePenalty: Number.isFinite(pres) ? Math.min(2, Math.max(-2, pres)) : 0.2,
  };
};

interface CompatibleAssistantMessage {
  content: string | null;
  tool_calls?: unknown[];
  reasoning_content?: string;
  reasoning_details?: unknown[];
  responses_output?: unknown[];
}

export const normalizeLlmRequestTemperature = (model: unknown, value: unknown): number => {
  const parsed = Number(value);
  const temperature = Number.isFinite(parsed) ? parsed : 0.7;
  const modelId = String(model || '').trim();
  if (/^minimax-m3(?:$|[-_.])/i.test(modelId)) {
    return Math.max(0.01, Math.min(1, temperature));
  }
  if (/^glm-5\.3(?:$|[-_.])/i.test(modelId)) {
    return Math.max(0, Math.min(1, temperature));
  }
  return Math.max(0, Math.min(2, temperature));
};

export const isMultimodalUnsupportedError = (err: any): boolean => {
  if (!err) return false;
  const msg = String(err?.message || err || '').toLowerCase();
  const status = Number(err?.status || err?.statusCode || 0);
  if (
    msg.includes('image') ||
    msg.includes('vision') ||
    msg.includes('multimodal') ||
    msg.includes('image_url') ||
    msg.includes('must be a string') ||
    msg.includes('must be string') ||
    msg.includes('expected a string') ||
    msg.includes('type array') ||
    msg.includes('not support') ||
    status === 400 ||
    status === 422 ||
    /400|422/.test(msg)
  ) {
    return true;
  }
  return false;
};

export const hasImageParts = (messages: any[]): boolean => {
  return messages.some((msg) => {
    if (Array.isArray(msg?.content)) {
      return msg.content.some((part: any) => part?.type === 'image_url' || part?.image_url);
    }
    return false;
  });
};

export const degradeApiMessagesToText = (messages: any[]): void => {
  for (const msg of messages) {
    if (Array.isArray(msg?.content)) {
      const textParts: string[] = [];
      let hadImage = false;
      for (const part of msg.content) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          textParts.push(part.text);
        } else if (part?.type === 'image_url' || part?.image_url) {
          hadImage = true;
        }
      }
      let baseText = textParts.join('\n').trim();
      if (hadImage) {
        baseText = baseText
          ? `${baseText}\n（[系统提示] 当前使用的模型不支持直接识别图片，本次已自动降级为纯文本交互）`
          : '（[系统提示] 用户发送了一张图片，但当前模型不支持图片识别，请告知用户并以文本继续对话）';
      }
      msg.content = baseText;
    }
  }
};

const normalizeReasoningDetails = (value: unknown): unknown[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  try {
    const serialized = JSON.stringify(value.slice(0, 20));
    if (serialized.length > 500_000) return undefined;
    return JSON.parse(serialized);
  } catch {
    return undefined;
  }
};

export const buildAssistantToolHistoryMessage = (
  message: CompatibleAssistantMessage,
  calls: NormalizedLlmToolCall[],
): Record<string, unknown> => {
  const historyMessage: Record<string, unknown> = {
    role: 'assistant',
    content: typeof message.content === 'string' ? message.content.slice(0, 500_000) : null,
    tool_calls: calls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.argumentsJson || '{}' },
    })),
  };
  if (typeof message.reasoning_content === 'string' && message.reasoning_content) {
    historyMessage.reasoning_content = message.reasoning_content.slice(0, 500_000);
  }
  const reasoningDetails = normalizeReasoningDetails(message.reasoning_details);
  if (reasoningDetails) historyMessage.reasoning_details = reasoningDetails;
  if (Array.isArray(message.responses_output) && message.responses_output.length > 0) {
    // Kept only in local request history. The Responses adapter replays these
    // provider-native items so reasoning and function calls remain valid.
    historyMessage.__responses_output = message.responses_output;
  }
  return historyMessage;
};

const getResponsesTools = (): Record<string, unknown>[] => LLM_TOOLS.map((tool) => ({
  type: 'function',
  name: tool.function.name,
  description: tool.function.description,
  parameters: tool.function.parameters,
}));

export const convertChatMessagesToResponsesInput = (messages: any[]): Record<string, unknown>[] => {
  const input: Record<string, unknown>[] = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    if (message.role === 'assistant' && Array.isArray(message.__responses_output)) {
      for (const item of message.__responses_output) {
        if (item && typeof item === 'object' && !Array.isArray(item)) input.push(item);
      }
      continue;
    }
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: String(message.tool_call_id || '').slice(0, 200),
        output: String(message.content || '').slice(0, 500_000),
      });
      continue;
    }
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      if (typeof message.content === 'string' && message.content) {
        input.push({ role: 'assistant', content: message.content.slice(0, 500_000) });
      }
      for (const call of message.tool_calls.slice(0, 20)) {
        const fn = call?.function;
        if (!fn || typeof fn.name !== 'string') continue;
        input.push({
          type: 'function_call',
          call_id: String(call.id || '').slice(0, 200),
          name: fn.name.slice(0, 100),
          arguments: typeof fn.arguments === 'string' ? fn.arguments.slice(0, 20_000) : '{}',
        });
      }
      continue;
    }
    if (['system', 'developer', 'user', 'assistant'].includes(message.role)) {
      if (Array.isArray(message.content)) {
        const textParts = message.content
          .filter((p: any) => p && typeof p.text === 'string')
          .map((p: any) => p.text)
          .join('\n');
        input.push({
          role: message.role,
          content: textParts.slice(0, 500_000),
        });
      } else {
        input.push({
          role: message.role,
          content: typeof message.content === 'string' ? message.content.slice(0, 500_000) : '',
        });
      }
    }
  }
  return input;
};

export const normalizeOpenAIResponsesMessage = (response: any): CompatibleAssistantMessage => {
  const output = Array.isArray(response?.output) ? response.output : [];
  let content = '';
  const toolCalls: Record<string, unknown>[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if ((part?.type === 'output_text' || part?.type === 'text') && typeof part.text === 'string') {
          content += part.text;
        }
      }
    }
    if (item.type === 'function_call' && typeof item.name === 'string') {
      toolCalls.push({
        id: String(item.call_id || item.id || `tool-${toolCalls.length}`).slice(0, 200),
        type: 'function',
        function: {
          name: item.name.slice(0, 100),
          arguments: typeof item.arguments === 'string' ? item.arguments.slice(0, 20_000) : '{}',
        },
      });
    }
  }
  if (!content && typeof response?.output_text === 'string') content = response.output_text;
  return {
    content,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    ...(output.length > 0 ? { responses_output: output } : {}),
  };
};

export interface LlmModelProbeResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export const probeVolcenginePlanModel = async (
  config: Pick<LLMConfig, 'baseUrl' | 'apiKey' | 'model'>,
  signal?: AbortSignal,
): Promise<LlmModelProbeResult> => {
  const startedAt = performance.now();
  const rawUrl = parseApiBaseUrl(config.baseUrl);
  if (!rawUrl || !isVolcengineArkPlanApiBaseUrl(rawUrl)) {
    return { ok: false, latencyMs: 0, message: '必须使用火山方舟 Plan 地址 /api/plan/v3' };
  }
  if (!config.apiKey.trim()) return { ok: false, latencyMs: 0, message: '尚未配置 Agent Plan API Key' };
  const model = config.model.trim();
  if (!model) return { ok: false, latencyMs: 0, message: '模型名称为空' };

  try {
    const { response, text } = await fetchTextWithTimeout(
      `${rawUrl}/responses`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          input: [{ role: 'user', content: '仅回复 OK' }],
          // Reasoning models can consume the first tokens internally before
          // emitting the requested text, so a tiny cap creates false failures.
          max_output_tokens: 512,
        }),
        signal,
      },
      { timeoutMs: 60_000, maxBytes: 1_000_000, timeoutMessage: `${model} 检测超过 60 秒` },
    );
    const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    if (!response.ok) {
      const detail = parsed?.error?.message || parsed?.message || text || `HTTP ${response.status}`;
      return { ok: false, latencyMs, message: `HTTP ${response.status}: ${String(detail).slice(0, 300)}` };
    }
    const normalized = normalizeOpenAIResponsesMessage(parsed);
    if (!normalized.content?.trim()) {
      const status = typeof parsed?.status === 'string' ? parsed.status : '响应无文本';
      return { ok: false, latencyMs, message: status === 'incomplete' ? '输出额度不足或响应未完成' : status };
    }
    return { ok: true, latencyMs, message: normalized.content.trim().slice(0, 80) };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return {
      ok: false,
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      message: error instanceof Error ? error.message.slice(0, 300) : '未知网络错误',
    };
  }
};

export const mergeLlmReplySegments = (current: string, incoming: string): string => {
  const previous = typeof current === 'string' ? current.trim() : '';
  const next = typeof incoming === 'string' ? incoming.trim() : '';
  if (!previous) return deduplicateRepetitiveText(next);
  if (!next) return deduplicateRepetitiveText(previous);
  if (previous === next || previous.includes(next)) return deduplicateRepetitiveText(previous);
  if (next.includes(previous)) return deduplicateRepetitiveText(next);

  // Some providers repeat the end of the pre-tool reply after a tool result.
  const maximumOverlap = Math.min(previous.length, next.length);
  for (let overlap = maximumOverlap; overlap >= 4; overlap -= 1) {
    if (previous.slice(-overlap) === next.slice(0, overlap)) {
      return deduplicateRepetitiveText(`${previous}${next.slice(overlap)}`);
    }
  }
  return deduplicateRepetitiveText(`${previous}\n\n${next}`);
};

export const normalizeLlmToolCalls = (
  value: unknown,
  maxCalls: number = 5,
): { calls: NormalizedLlmToolCall[]; exceeded: boolean } => {
  if (!Array.isArray(value)) return { calls: [], exceeded: false };
  const safeMax = Math.max(0, Math.min(20, Math.floor(maxCalls)));
  const usedIds = new Set<string>();
  const calls: NormalizedLlmToolCall[] = [];
  for (let index = 0; index < Math.min(value.length, safeMax); index++) {
    const item = value[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const fn = (item as Record<string, unknown>).function;
    if (!fn || typeof fn !== 'object' || Array.isArray(fn)) continue;
    const rawName = (fn as Record<string, unknown>).name;
    if (typeof rawName !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(rawName)) continue;
    const rawId = (item as Record<string, unknown>).id;
    let id = typeof rawId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(rawId)
      ? rawId
      : `tool-${index}`;
    if (usedIds.has(id)) id = `tool-${index}-${calls.length}`;
    usedIds.add(id);
    const rawArguments = (fn as Record<string, unknown>).arguments;
    calls.push({
      id,
      name: rawName,
      argumentsJson: typeof rawArguments === 'string' && rawArguments.length <= 20_000
        ? rawArguments
        : null,
    });
  }
  return { calls, exceeded: value.length > safeMax };
};

export class LLMClient {
  private config: LLMConfig;
  private deviceManager: DeviceManager;
  private hardwareToolsEnabled: boolean;
  private generation: LlmGenerationOptions;

  constructor(config: LLMConfig, options: { hardwareToolsEnabled?: boolean; generation?: Partial<LlmGenerationOptions> } = {}) {
    this.config = normalizeLlmConfig(config);
    this.deviceManager = DeviceManager.getInstance();
    this.hardwareToolsEnabled = options.hardwareToolsEnabled ?? true;
    this.generation = normalizeLlmGenerationOptions(options.generation);
  }

  updateConfig(config: Partial<LLMConfig>) {
    this.config = normalizeLlmConfig(config, this.config);
  }

  setHardwareToolsEnabled(enabled: boolean) {
    this.hardwareToolsEnabled = enabled === true;
  }

  /**
   * 发送聊天请求并处理 Function Calling 循环
   */
  async sendMessage(
    history: ChatMessage[],
    customPersonas: AIPersona[] = [],
    customSystemPrompt?: string,
    signal?: AbortSignal,
    onTextDelta?: (fullText: string) => void,
  ): Promise<{ reply: string; toolLogs: ToolActionLog[] }> {
    if (!this.config.apiKey && !isLocalApiBaseUrl(this.config.baseUrl)) {
      throw new Error('请先在【设置】页面配置 AI 模型的 API Key。');
    }

    const systemPrompt = getPersonaPrompt(this.config.selectedPersonaId, customPersonas, customSystemPrompt);
    const deviceState = this.deviceManager.getState();

    // 只有明确开启硬件联动的会话才能看到设备状态与工具。
    const hardwareContext = this.hardwareToolsEnabled
      ? `

【附加硬件联动能力】
这是附加到当前角色卡上的后台能力，不是新的人格、文风或剧情模式。角色卡、既有对话语气与用户当前话题始终优先。
- 先像未开启硬件联动时一样，生成完整、自然且符合人设的角色回复；不得用设备播报、控制说明或固定调教话术替代原回复。
- 仅在当前对话确实需要时调用工具，不要求每轮提及硬件，也不要为了调用工具改变语气、篇幅或剧情方向。
- 工具调用前已经说出的角色台词属于本轮正式回复。工具返回后不要重写或复述，只在剧情自然需要时追加一句简短后续。

【当前设备状态】
- 连接模式: ${deviceState.connectionMode} (状态: ${deviceState.connectionStatus})
- 电击器 EMS: 通道A=${deviceState.ems.strengthA}/200, 通道B=${deviceState.ems.strengthB}/200, 活跃波形=${deviceState.ems.activeWaveA || '无'}
- 飞机杯/跳蛋 马达: A(主抽插)=${deviceState.toy.motorA}/20, B(吮吸)=${deviceState.toy.motorB}/20, C(旋转)=${deviceState.toy.motorC}/20, 活跃模式=${deviceState.toy.activePattern || '手动'}
- 智能灌肠机: 蠕动泵=${deviceState.enema.peristalticState === 1 ? '注水' : deviceState.enema.peristalticState === 2 ? '抽水' : '停止'}, 抽水泵=${deviceState.enema.waterPumpState === 1 ? '开启' : '关闭'}, 压力A=${deviceState.enema.pressureA}, 压力B=${deviceState.enema.pressureB}, 电量=${deviceState.enema.battery}%
`
      : `

【纯文字模式】
本次会话未获得硬件权限。不得声称已经读取、控制或改变任何真实设备，也不得输出伪造的工具调用结果。`;
    const systemContext = `${systemPrompt}${hardwareContext}`;

    // 格式化 OpenAI 消息数组
    const apiMessages: any[] = [
      { role: 'system', content: systemContext }
    ];

    const historySlice = history.slice(-this.generation.historyMessages);
    // 找到当前请求切片中最后一条用户消息的索引
    let lastUserIndex = -1;
    for (let i = historySlice.length - 1; i >= 0; i--) {
      if (historySlice[i]?.role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    for (let index = 0; index < historySlice.length; index++) {
      const msg = historySlice[index];
      if (msg.role === 'user') {
        // 关键防护：仅最新一轮用户发言附带图片；历史轮次均转为纯文本，彻底杜绝非多模态模型被历史图片持续报错卡死
        const isLatestUserTurn = index === lastUserIndex;
        const msgImages = isLatestUserTurn && Array.isArray((msg as any).images)
          ? ((msg as any).images as unknown[]).filter((img): img is string => typeof img === 'string' && (img.startsWith('data:image/') || /^https?:\/\//i.test(img))).slice(0, 3)
          : [];
        if (msgImages.length > 0) {
          const rawText = String(msg.content ?? '').trim();
          const contentParts: any[] = [
            { type: 'text', text: (rawText || '（请查看附带的图片并结合剧情作出回应）').slice(0, 50_000) },
          ];
          for (const imgUrl of msgImages) {
            contentParts.push({
              type: 'image_url',
              image_url: { url: imgUrl },
            });
          }
          apiMessages.push({ role: 'user', content: contentParts });
        } else {
          apiMessages.push({ role: 'user', content: String(msg.content).slice(0, 50_000) });
        }
      } else if (msg.role === 'assistant') {
        apiMessages.push({ role: 'assistant', content: String(msg.content).slice(0, 50_000) });
      } else if (msg.role === 'system') {
        apiMessages.push({ role: 'system', content: String(msg.content).slice(0, 12_000) });
      }
    }

    const toolLogs: ToolActionLog[] = [];
    let preservedReply = '';
    let currentIteration = 0;
    let aiSafetyStopTriggered = false;
    const maxIterations = 5; // 防止无限递归工具调用

    while (currentIteration < maxIterations) {
      currentIteration++;

      if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
      // Tool calls stay buffered until the SSE response finishes, so incomplete JSON
      // can never reach a hardware action while ordinary text appears immediately.
      let message: CompatibleAssistantMessage | null = null;
      try {
        message = onTextDelta
          ? await this.streamOpenAICompatibleAPI(
              apiMessages,
              signal,
              (iterationText) => onTextDelta(mergeLlmReplySegments(preservedReply, iterationText)),
              this.hardwareToolsEnabled,
            )
          : await this.callOpenAICompatibleAPI(apiMessages, signal);
      } catch (firstError: any) {
        if (signal?.aborted) throw firstError;
        const hadImage = hasImageParts(apiMessages);
        if (hadImage && isMultimodalUnsupportedError(firstError)) {
          console.warn('⚠️ 远端模型不支持多模态视觉图片，已自动降级为纯文本重试:', firstError?.message);
          degradeApiMessagesToText(apiMessages);
          message = onTextDelta
            ? await this.streamOpenAICompatibleAPI(
                apiMessages,
                signal,
                (iterationText) => onTextDelta(mergeLlmReplySegments(preservedReply, iterationText)),
                this.hardwareToolsEnabled,
              )
            : await this.callOpenAICompatibleAPI(apiMessages, signal);
        } else {
          throw firstError;
        }
      }

      if (!message) {
        throw new Error('大模型未返回有效响应');
      }

      const normalizedToolCalls = normalizeLlmToolCalls(message.tool_calls, 5);
      if (normalizedToolCalls.exceeded) throw new Error('模型单轮工具调用超过 5 个，已拒绝执行');
      if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && normalizedToolCalls.calls.length === 0) {
        throw new Error('模型返回的工具调用结构无效');
      }

      // 如果有 Tool Calls
      if (normalizedToolCalls.calls.length > 0) {
        if (toolLogs.length + normalizedToolCalls.calls.length > 12) {
          throw new Error('模型本轮累计工具调用超过 12 个，已拒绝继续执行');
        }
        apiMessages.push(buildAssistantToolHistoryMessage(message, normalizedToolCalls.calls));
        if (typeof message.content === 'string' && message.content.trim()) {
          preservedReply = mergeLlmReplySegments(preservedReply, message.content);
        }

        for (const tc of normalizedToolCalls.calls) {
          const fnName = tc.name;
          let fnArgs: Record<string, any> = {};
          let argsValid = tc.argumentsJson !== null;
          try {
            const parsedArgs = tc.argumentsJson === null ? null : JSON.parse(tc.argumentsJson);
            if (!parsedArgs || typeof parsedArgs !== 'object' || Array.isArray(parsedArgs)) argsValid = false;
            else fnArgs = parsedArgs;
          } catch {
            argsValid = false;
          }

          // 执行工具动作
          const execResult = !argsValid
            ? { success: false, summary: '工具参数不是有效的 JSON 对象，未执行' }
            : aiSafetyStopTriggered && fnName !== 'get_device_status'
              ? { success: false, summary: '本轮已执行 AI 安全停止，后续硬件指令已忽略' }
              : await this.executeTool(fnName, fnArgs);
          if (fnName === 'emergency_stop' && execResult.success) {
            aiSafetyStopTriggered = true;
          }
          
          const log: ToolActionLog = {
            id: tc.id,
            toolName: fnName,
            args: fnArgs,
            summary: execResult.summary,
            timestamp: Date.now(),
            success: execResult.success
          };
          toolLogs.push(log);

          // 添加 Tool 结果消息给模型
          apiMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({
              success: execResult.success,
              result: execResult.summary,
              currentState: this.deviceManager.getState()
            })
          });
        }
      } else {
        // 普通文本回复
        if (typeof message.content !== 'string' || !message.content.trim()) {
          throw new Error('大模型未返回有效文本内容');
        }
        const combinedReply = mergeLlmReplySegments(preservedReply, message.content);
        return {
          reply: stripThinkingArtifacts(combinedReply, false).trim().slice(0, 200_000),
          toolLogs
        };
      }
    }

    throw new Error('模型连续工具调用达到 5 轮上限，已停止继续执行');
  }

  private async executeTool(name: string, args: Record<string, any>): Promise<{ success: boolean; summary: string }> {
    const numberArg = (key: string, fallback: number, min: number, max: number) => {
      const value = Number(args[key]);
      if (!Number.isFinite(value)) return fallback;
      return Math.min(max, Math.max(min, value));
    };
    const channelArg = (): 'A' | 'B' | 'AB' => {
      const value = String(args.channel || 'AB').toUpperCase();
      if (value !== 'A' && value !== 'B' && value !== 'AB') throw new Error('无效 EMS 通道');
      return value;
    };
    const commandResult = (summary: string) => ({
      success: !/(拒绝|未知|未找到|不支持|失败)/.test(summary),
      summary,
    });
    try {
      switch (name) {
        case 'set_ems_strength': {
          const channel = channelArg();
          const strength = numberArg('strength', 0, 0, 200);
          const res = await this.deviceManager.setEmsStrength(channel, strength);
          return commandResult(res);
        }
        case 'send_ems_wave': {
          const channel = channelArg();
          const waveName = String(args.wave_name || 'breathe').slice(0, 100);
          const res = await this.deviceManager.sendEmsWave(channel, waveName);
          return commandResult(res);
        }
        case 'set_toy_motor': {
          const mA = numberArg('motor_a', 0, 0, 20);
          const mB = numberArg('motor_b', 0, 0, 20);
          const mC = numberArg('motor_c', 0, 0, 20);
          const res = await this.deviceManager.setToyMotor(mA, mB, mC);
          return commandResult(res);
        }
        case 'toy_pattern': {
          const pName = String(args.pattern_name || 'gentle').slice(0, 100);
          const dur = numberArg('duration_sec', 30, 1, 3600);
          const res = await this.deviceManager.playToyPattern(pName, dur);
          return commandResult(res);
        }
        case 'toy_turbo': {
          const dur = numberArg('duration_sec', 5, 1, 60);
          const res = await this.deviceManager.triggerTurbo(dur);
          return commandResult(res);
        }
        case 'toy_edge': {
          const rounds = numberArg('rounds', 3, 1, 20);
          const res = await this.deviceManager.playToyPattern('edging_tease', rounds * 20);
          return commandResult(`开启边缘控射调教（${rounds} 轮）: ${res}`);
        }
        case 'enema_fill': {
          const dur = numberArg('duration_sec', 10, 1, 60);
          const res = await this.deviceManager.enemaFill(dur);
          return commandResult(res);
        }
        case 'enema_drain': {
          const dur = numberArg('duration_sec', 10, 1, 60);
          const res = await this.deviceManager.enemaDrain(dur);
          return commandResult(res);
        }
        case 'enema_pattern': {
          const pName = String(args.pattern_name || 'pre_fill').slice(0, 100);
          const res = await this.deviceManager.playEnemaPattern(pName);
          return commandResult(res);
        }
        case 'emergency_stop': {
          const res = await this.deviceManager.emergencyStop(true);
          return commandResult(`AI 安全停止已执行（未激活全局急停锁）：${res}`);
        }
        case 'get_device_status': {
          const state = this.deviceManager.getState();
          return { success: true, summary: `当前状态已同步: 电击A=${state.ems.strengthA} B=${state.ems.strengthB}, 马达=${state.toy.motorA}/${state.toy.motorB}/${state.toy.motorC}` };
        }
        default:
          return { success: false, summary: `未知工具指令: ${name}` };
      }
    } catch (e: any) {
      return { success: false, summary: `执行失败: ${e.message}` };
    }
  }

  private async callOpenAICompatibleAPI(messages: any[], signal?: AbortSignal): Promise<CompatibleAssistantMessage | null> {
    const rawUrl = parseApiBaseUrl(this.config.baseUrl);
    if (!rawUrl) throw new Error('API 地址无效，必须使用 HTTPS；仅本机 localhost 允许 HTTP');
    const useResponsesApi = isVolcengineArkPlanApiBaseUrl(rawUrl);
    const url = useResponsesApi
      ? (rawUrl.endsWith('/responses') ? rawUrl : `${rawUrl}/responses`)
      : (rawUrl.endsWith('/chat/completions') ? rawUrl : `${rawUrl}/chat/completions`);

    const body = useResponsesApi
      ? {
          model: this.config.model || 'doubao-seed-2.0-lite',
          input: convertChatMessagesToResponsesInput(messages),
          max_output_tokens: this.generation.maxTokens,
          ...(this.hardwareToolsEnabled ? { tools: getResponsesTools() } : {}),
        }
      : {
          model: this.config.model || 'deepseek-chat',
          messages,
          ...(this.hardwareToolsEnabled ? { tools: LLM_TOOLS } : {}),
          temperature: normalizeLlmRequestTemperature(this.config.model, this.config.temperature),
          top_p: this.generation.topP,
          max_tokens: this.generation.maxTokens,
          ...(this.generation.frequencyPenalty !== undefined ? { frequency_penalty: this.generation.frequencyPenalty } : {}),
          ...(this.generation.presencePenalty !== undefined ? { presence_penalty: this.generation.presencePenalty } : {}),
        };

    const { response: resp, text: responseText } = await fetchTextWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey.trim() ? { 'Authorization': `Bearer ${this.config.apiKey.trim()}` } : {}),
          ...(new URL(rawUrl).hostname.toLowerCase() === 'generativelanguage.googleapis.com'
            ? { 'x-goog-api-client': 'yiciyuan-openai/1.0.0' }
            : {}),
        },
        body: JSON.stringify(body),
        signal,
      },
      { timeoutMs: 45_000, maxBytes: 5_000_000, timeoutMessage: 'API 请求超过 45 秒' },
    );

    if (!resp.ok) {
      let errMsg = responseText.slice(0, 2000);
      try {
        const parsedError = JSON.parse(responseText);
        errMsg = typeof parsedError?.error?.message === 'string'
          ? parsedError.error.message.slice(0, 2000)
          : errMsg;
      } catch {}
      throw new Error(`API 请求失败 (${resp.status}): ${errMsg}`);
    }

    try {
      const parsed = JSON.parse(responseText);
      const rawMessage = useResponsesApi
        ? normalizeOpenAIResponsesMessage(parsed)
        : (Array.isArray(parsed?.choices) ? parsed.choices[0]?.message || null : null);
      if (rawMessage && typeof rawMessage.content === 'string') {
        rawMessage.content = stripThinkingArtifacts(rawMessage.content, false);
      }
      return rawMessage;
    } catch {
      throw new Error('API 返回的不是有效 JSON');
    }
  }

  private async streamOpenAICompatibleAPI(
    messages: any[],
    signal: AbortSignal | undefined,
    onTextDelta: (fullText: string) => void,
    includeTools: boolean,
  ): Promise<CompatibleAssistantMessage> {
    const rawUrl = parseApiBaseUrl(this.config.baseUrl);
    if (!rawUrl) throw new Error('API 地址无效，必须使用 HTTPS；仅本机 localhost 允许 HTTP');
    if (isVolcengineArkPlanApiBaseUrl(rawUrl)) {
      return this.streamOpenAIResponsesAPI(messages, signal, onTextDelta, includeTools, rawUrl);
    }
    const url = rawUrl.endsWith('/chat/completions') ? rawUrl : `${rawUrl}/chat/completions`;
    let buffer = '';
    let reply = '';
    let reasoningContent = '';
    const streamedReasoningDetails = new Map<number, Record<string, unknown>>();
    const streamedToolCalls = new Map<number, {
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }>();
    const consumeEvent = (event: string) => {
      const data = event.split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (!data || data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta;
        const content = delta?.content;
        if (typeof content === 'string' && content) {
          reply += content;
          onTextDelta(stripThinkingArtifacts(reply, true));
        }
        if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) {
          reasoningContent = `${reasoningContent}${delta.reasoning_content}`.slice(0, 500_000);
        }
        if (Array.isArray(delta?.reasoning_details)) {
          for (let detailIndex = 0; detailIndex < Math.min(delta.reasoning_details.length, 20); detailIndex++) {
            const detail = delta.reasoning_details[detailIndex];
            if (!detail || typeof detail !== 'object' || Array.isArray(detail)) continue;
            const index = Number.isInteger(Number(detail.index)) ? Number(detail.index) : detailIndex;
            if (index < 0 || index >= 20) continue;
            const current = streamedReasoningDetails.get(index) || {};
            const next = { ...current, ...detail } as Record<string, unknown>;
            if (typeof detail.text === 'string' && typeof current.text === 'string') {
              next.text = detail.text.startsWith(current.text)
                ? detail.text.slice(0, 500_000)
                : `${current.text}${detail.text}`.slice(0, 500_000);
            }
            streamedReasoningDetails.set(index, next);
          }
        }
        if (!Array.isArray(delta?.tool_calls)) return;
        for (const partialCall of delta.tool_calls) {
          const rawIndex = partialCall?.index;
          const index = rawIndex === undefined ? 0 : Number(rawIndex);
          if (!Number.isInteger(index) || index < 0 || index >= 5) continue;
          const current = streamedToolCalls.get(index) || {};
          if (typeof partialCall?.id === 'string') current.id = partialCall.id.slice(0, 200);
          if (typeof partialCall?.type === 'string') current.type = partialCall.type;
          const fn = partialCall?.function;
          if (fn && typeof fn === 'object') {
            current.function ||= {};
            if (typeof fn.name === 'string') {
              current.function.name = `${current.function.name || ''}${fn.name}`.slice(0, 100);
            }
            if (typeof fn.arguments === 'string') {
              current.function.arguments = `${current.function.arguments || ''}${fn.arguments}`.slice(0, 20_000);
            }
          }
          streamedToolCalls.set(index, current);
        }
      } catch {
        // Some compatible providers send keepalive records that are not JSON payloads.
      }
    };
    const consumeChunk = (chunk: string) => {
      buffer += chunk.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        consumeEvent(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    };

    const body = {
      model: this.config.model || 'deepseek-chat',
      messages,
      temperature: normalizeLlmRequestTemperature(this.config.model, this.config.temperature),
      top_p: this.generation.topP,
      max_tokens: this.generation.maxTokens,
      ...(this.generation.frequencyPenalty !== undefined ? { frequency_penalty: this.generation.frequencyPenalty } : {}),
      ...(this.generation.presencePenalty !== undefined ? { presence_penalty: this.generation.presencePenalty } : {}),
      stream: true,
      ...(includeTools ? { tools: LLM_TOOLS } : {}),
    };
    const { response: resp, text: responseText } = await fetchTextStreamWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey.trim() ? { Authorization: `Bearer ${this.config.apiKey.trim()}` } : {}),
          ...(new URL(rawUrl).hostname.toLowerCase() === 'generativelanguage.googleapis.com'
            ? { 'x-goog-api-client': 'yiciyuan-openai/1.0.0' }
            : {}),
        },
        body: JSON.stringify(body),
        signal,
      },
      consumeChunk,
      { timeoutMs: 90_000, maxBytes: 5_000_000, timeoutMessage: '流式 API 请求超过 90 秒' },
    );
    consumeChunk('\n\n');
    if (!resp.ok) {
      let errMsg = responseText.slice(0, 2000);
      try {
        const parsedError = JSON.parse(responseText);
        errMsg = typeof parsedError?.error?.message === 'string' ? parsedError.error.message.slice(0, 2000) : errMsg;
      } catch {}
      throw new Error(`API 流式请求失败 (${resp.status}): ${errMsg}`);
    }
    const tool_calls = [...streamedToolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, toolCall]) => toolCall);
    if (reply || tool_calls.length > 0) {
      const reasoning_details = [...streamedReasoningDetails.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, detail]) => detail);
      return {
        content: stripThinkingArtifacts(reply, false),
        ...(tool_calls.length > 0 ? { tool_calls } : {}),
        ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
        ...(reasoning_details.length > 0 ? { reasoning_details } : {}),
      };
    }
    try {
      const fallbackMessage = JSON.parse(responseText)?.choices?.[0]?.message;
      const fallback = fallbackMessage?.content;
      if (typeof fallback === 'string' && fallback) {
        onTextDelta(stripThinkingArtifacts(fallback, false));
      }
      return {
        content: typeof fallback === 'string' ? stripThinkingArtifacts(fallback, false) : '',
        ...(Array.isArray(fallbackMessage?.tool_calls) ? { tool_calls: fallbackMessage.tool_calls } : {}),
        ...(typeof fallbackMessage?.reasoning_content === 'string' ? { reasoning_content: fallbackMessage.reasoning_content } : {}),
        ...(Array.isArray(fallbackMessage?.reasoning_details) ? { reasoning_details: fallbackMessage.reasoning_details } : {}),
      };
    } catch {}
    return { content: '' };
  }

  private async streamOpenAIResponsesAPI(
    messages: any[],
    signal: AbortSignal | undefined,
    onTextDelta: (fullText: string) => void,
    includeTools: boolean,
    rawUrl: string,
  ): Promise<CompatibleAssistantMessage> {
    const url = rawUrl.endsWith('/responses') ? rawUrl : `${rawUrl}/responses`;
    let buffer = '';
    let reply = '';
    let completedResponse: any = null;
    let streamError = '';
    const streamedOutput = new Map<number, Record<string, any>>();

    const consumeEvent = (event: string) => {
      const data = event.split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (!data || data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed?.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
          reply += parsed.delta;
          onTextDelta(stripThinkingArtifacts(reply, true));
          return;
        }
        if (parsed?.type === 'response.output_item.added' || parsed?.type === 'response.output_item.done') {
          const index = Number(parsed.output_index);
          if (Number.isInteger(index) && index >= 0 && index < 100 && parsed.item && typeof parsed.item === 'object') {
            streamedOutput.set(index, parsed.item);
          }
          return;
        }
        if (parsed?.type === 'response.function_call_arguments.delta' && typeof parsed.delta === 'string') {
          const index = Number(parsed.output_index);
          if (Number.isInteger(index) && index >= 0 && index < 100) {
            const current = streamedOutput.get(index) || {
              type: 'function_call',
              id: parsed.item_id,
              call_id: parsed.call_id,
              name: parsed.name,
              arguments: '',
            };
            current.arguments = `${current.arguments || ''}${parsed.delta}`.slice(0, 20_000);
            streamedOutput.set(index, current);
          }
          return;
        }
        if (parsed?.type === 'response.completed' && parsed.response) {
          completedResponse = parsed.response;
          return;
        }
        if (parsed?.type === 'response.failed') {
          const message = parsed?.response?.error?.message || parsed?.error?.message;
          streamError = typeof message === 'string' ? message.slice(0, 2000) : '模型生成失败';
          return;
        }
        if (parsed?.type === 'error') {
          const message = parsed?.error?.message || parsed?.message;
          streamError = typeof message === 'string' ? message.slice(0, 2000) : '流式响应返回错误';
        }
      } catch {
        // Ignore provider keepalive records that are not JSON.
      }
    };
    const consumeChunk = (chunk: string) => {
      buffer += chunk.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        consumeEvent(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    };

    const body = {
      model: this.config.model || 'doubao-seed-2.0-lite',
      input: convertChatMessagesToResponsesInput(messages),
      max_output_tokens: this.generation.maxTokens,
      stream: true,
      ...(includeTools ? { tools: getResponsesTools() } : {}),
    };
    const { response: resp, text: responseText } = await fetchTextStreamWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey.trim() ? { Authorization: `Bearer ${this.config.apiKey.trim()}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      },
      consumeChunk,
      { timeoutMs: 90_000, maxBytes: 5_000_000, timeoutMessage: '火山方舟流式请求超过 90 秒' },
    );
    consumeChunk('\n\n');
    if (!resp.ok) {
      let errMsg = responseText.slice(0, 2000);
      try {
        const parsedError = JSON.parse(responseText);
        errMsg = typeof parsedError?.error?.message === 'string' ? parsedError.error.message.slice(0, 2000) : errMsg;
      } catch {}
      throw new Error(`火山方舟 Responses 请求失败 (${resp.status}): ${errMsg}`);
    }
    if (streamError) throw new Error(`火山方舟 Responses 请求失败: ${streamError}`);

    if (!completedResponse && streamedOutput.size === 0) {
      try {
        completedResponse = JSON.parse(responseText);
      } catch {}
    }
    const normalized = normalizeOpenAIResponsesMessage(completedResponse || {
      output: [...streamedOutput.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, item]) => item),
    });
    const rawContent = reply || normalized.content || '';
    const content = stripThinkingArtifacts(rawContent, false);
    if (!reply && content) onTextDelta(content);
    return { ...normalized, content };
  }
}
