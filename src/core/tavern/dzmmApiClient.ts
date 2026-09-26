import { TavernCharacterCard } from './tavernTypes';
import { fetchTextWithTimeout } from '../httpClient';
import { sanitizeTavernVisibleContent } from './tavernTextSanitizer';

export const DZMM_API_SETTINGS_URL = 'https://www.dzmm.ai/settings/api';
export const DZMM_CARD_CHAT_BASE_URL = 'https://api.sillytraven.dev/api/xiaoshuoai/ext/v2';

interface DZMMModel {
  id: string;
  object?: string;
  owned_by?: string;
}

interface DZMMChatOptions {
  apiToken: string;
  model: string;
  userName: string;
  card: TavernCharacterCard;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  context?: string;
  systemPrompt?: string;
  signal?: AbortSignal;
  onToken?: (fullText: string, delta: string) => void;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  historyMessages?: number;
}

export class DZMMApiClient {
  private static readonly sessionUserId = `yiciyuan_${
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }`;

  static async listCardChatModels(signal?: AbortSignal): Promise<DZMMModel[]> {
    const { response, text } = await fetchTextWithTimeout(
      `${DZMM_CARD_CHAT_BASE_URL}/models`,
      {
        headers: { Accept: 'application/json' },
        signal,
      },
      { timeoutMs: 15_000, maxBytes: 1_000_000, timeoutMessage: 'DZMM 模型列表请求超过 15 秒' },
    );

    if (!response.ok) {
      throw new Error(`获取 DZMM 模型列表失败: HTTP ${response.status}`);
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('DZMM 返回了非 JSON 格式的模型列表');
    }

    if (!payload || !Array.isArray(payload.data)) return [];

    return payload.data
      .filter((item: unknown): item is DZMMModel => Boolean(
        item && typeof item === 'object' && typeof (item as DZMMModel).id === 'string'
      ))
      .map((item: DZMMModel) => ({
        id: item.id.trim().slice(0, 200),
        object: typeof item.object === 'string' ? item.object.slice(0, 40) : undefined,
        owned_by: typeof item.owned_by === 'string' ? item.owned_by.slice(0, 80) : undefined,
      }))
      .filter((item: DZMMModel) => item.id.length > 0)
      .filter((item: DZMMModel, index: number, items: DZMMModel[]) => items.findIndex((entry) => entry.id === item.id) === index)
      .slice(0, 300);
  }

  static async chatWithCard(options: DZMMChatOptions): Promise<string> {
    const apiToken = typeof options.apiToken === 'string' ? options.apiToken.trim().slice(0, 1000) : '';
    if (!apiToken) throw new Error('缺少 DZMM API Token');
    const model = typeof options.model === 'string' ? options.model.trim().slice(0, 200) : '';
    if (!model) throw new Error('尚未选择 DZMM 模型');

    const cardText = (value: unknown, fallback: string, maxLength: number) => (
      typeof value === 'string' ? value.slice(0, maxLength) : fallback
    );
    const safeCardId = typeof options.card?.id === 'string'
      ? options.card.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120) || 'card'
      : 'card';
    const requestBody: Record<string, unknown> = {
      model,
      style: 'standard',
      user_name: typeof options.userName === 'string' ? options.userName.trim().slice(0, 40) || '旅人' : '旅人',
      user_id: this.sessionUserId,
      conversation_id: `yiciyuan_${safeCardId}`,
      request_id: `yiciyuan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      card: {
        name: cardText(options.card?.name, '未命名角色', 100),
        description: cardText(options.card?.description, '', 12_000),
        personality: cardText(options.card?.personality, '', 8_000),
        scenario: cardText(options.card?.scenario, '', 8_000),
        first_message: cardText(options.card?.firstMessage, '你好，旅人。', 12_000),
        system_prompt: cardText(options.systemPrompt || options.card?.systemPromptAddon, '保持角色设定，避免出戏。', 12_000),
      },
      context: typeof options.context === 'string' && options.context
        ? [{ title: '幻触本地世界书', content: options.context.slice(0, 12_000) }]
        : [],
      messages: (Array.isArray(options.messages) ? options.messages : [])
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant' || message.role === 'system') && typeof message.content === 'string')
        .slice(-Math.min(2_000, Math.max(1, Math.round(Number(options.historyMessages) || 200))))
        .map((message) => ({ role: message.role, content: message.content.slice(0, message.role === 'system' ? 12_000 : 16_000) })),
      max_tokens: Math.min(8_192, Math.max(128, Math.round(Number(options.maxTokens) || 3_000))),
      temperature: Math.min(2, Math.max(0, Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.8)),
      top_p: Math.min(1, Math.max(0.05, Number.isFinite(Number(options.topP)) ? Number(options.topP) : 0.9)),
      ...(options.frequencyPenalty !== undefined ? { frequency_penalty: options.frequencyPenalty } : {}),
      ...(options.presencePenalty !== undefined ? { presence_penalty: options.presencePenalty } : {}),
    };

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(new DOMException('请求已停止', 'AbortError'));
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 90_000);
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
      controller.abort();
    };

    let response: Response;
    try {
      response = await fetch(`${DZMM_CARD_CHAT_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      cleanup();
      if (timedOut) throw new Error('DZMM 请求超过 90 秒');
      throw error;
    }

    const readBoundedBody = async (maxBytes: number): Promise<string> => {
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > maxBytes) throw new Error('DZMM 响应超过安全大小限制');
      if (!response.body) return '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let total = 0;
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error('DZMM 响应超过安全大小限制');
        }
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    };

    if (!response.ok) {
      let detail = '';
      try {
        detail = (await readBoundedBody(100_000)).slice(0, 500);
      } finally {
        cleanup();
      }
      throw new Error(`DZMM Card Chat 请求失败（${response.status}）${detail ? `：${detail}` : ''}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      let text = '';
      try {
        text = await readBoundedBody(5_000_000);
      } finally {
        cleanup();
      }
      let payload: any;
      try { payload = JSON.parse(text); } catch { throw new Error('DZMM 返回的不是有效 JSON'); }
      const reply = payload?.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('DZMM 未返回有效回复');
      const result = sanitizeTavernVisibleContent(reply.trim().slice(0, 200_000), false);
      options.onToken?.(result, result);
      return result;
    }

    if (!response.body) {
      cleanup();
      throw new Error('DZMM 未返回可读取的响应流');
    }

    let reply = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    const processLine = (line: string) => {
      if (!line.startsWith('data:')) return;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') return;
      let event: any;
      try { event = JSON.parse(raw); } catch { return; }
      const content = event?.choices?.[0]?.delta?.content ?? event?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content) {
        reply += content;
        if (reply.length > 200_000) throw new Error('DZMM 回复文本超过安全限制');
        options.onToken?.(reply, content);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        lines.forEach(processLine);
      }
      pending += decoder.decode();
      if (pending) processLine(pending);
    } catch (error) {
      reader.cancel().catch(() => {});
      if (timedOut) throw new Error('DZMM 请求超过 90 秒');
      throw error;
    } finally {
      cleanup();
    }
    const cleanedReply = sanitizeTavernVisibleContent(reply, false);
    if (!cleanedReply) throw new Error('DZMM 未返回有效回复');
    return cleanedReply;
  }
}
