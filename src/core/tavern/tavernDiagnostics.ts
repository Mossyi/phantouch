import { TavernGenerationConfig, normalizeTavernGenerationConfig } from './tavernGeneration';
import { isLocalApiBaseUrl, parseApiBaseUrl } from '../apiBaseUrl';
import { estimateTavernTokenCount } from './tavernMemory';
import { TavernTextRule, normalizeTavernTextRules, validateTavernRegexPattern } from './tavernTextRules';
import { TavernWorldbook, matchTavernWorldbooks, normalizeTavernWorldbooks } from './tavernWorldbooks';
import { buildTavernContextWindow } from './tavernContext';

export interface TavernDiagnosticMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface TavernDiagnosticPromptSection {
  name: string;
  characters: number;
  estimatedTokens: number;
}

export interface TavernDiagnosticReport {
  format: 'yiciyuan_tavern_diagnostics';
  version: 1;
  generatedAt: string;
  privacy: string;
  characterName: string;
  groupParticipants: number;
  model: {
    provider: 'system' | 'dzmm' | 'custom';
    model: string;
    configured: boolean;
  };
  generation: TavernGenerationConfig;
  prompt: {
    characters: number;
    estimatedTokens: number;
    sections: TavernDiagnosticPromptSection[];
  };
  history: {
    totalMessages: number;
    includedMessages: number;
    droppedMessages: number;
    characters: number;
    estimatedTokens: number;
  };
  features: {
    memoryCharacters: number;
    pinnedMemoryCharacters: number;
    authorNoteEnabled: boolean;
    activePlayerPresets: number;
    enabledWorldbooks: number;
    matchedWorldbookEntries: string[];
    enabledTextRules: Record<'user_prompt' | 'assistant_output' | 'tts', number>;
    invalidRegexRules: number;
  };
  totals: {
    estimatedInputTokens: number;
    requestedOutputTokens: number;
  };
  warnings: string[];
}

export interface TavernDiagnosticInput {
  prompt: unknown;
  messages: unknown;
  generation: unknown;
  characterName: unknown;
  groupParticipants?: unknown;
  provider?: unknown;
  model?: unknown;
  modelConfigured?: unknown;
  memorySummary?: unknown;
  pinnedMemory?: unknown;
  authorNoteEnabled?: unknown;
  activePlayerPresets?: unknown;
  worldbooks?: TavernWorldbook[] | unknown;
  worldbookScanMessages?: unknown;
  textRules?: TavernTextRule[] | unknown;
}

const cleanText = (value: unknown, maximum: number): string => (
  typeof value === 'string' ? value.trim().slice(0, maximum) : ''
);

const cleanCount = (value: unknown, minimum: number, maximum: number, fallback = minimum): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
};

export const isTavernModelChannelConfigured = (
  providerValue: unknown,
  baseUrlValue: unknown,
  modelValue: unknown,
  apiKeyValue: unknown,
): boolean => {
  const provider = providerValue === 'dzmm' || providerValue === 'custom' ? providerValue : 'system';
  const model = cleanText(modelValue, 200);
  const apiKey = cleanText(apiKeyValue, 1_000);
  if (!model) return false;
  if (provider === 'dzmm') return Boolean(apiKey);
  const baseUrl = parseApiBaseUrl(baseUrlValue);
  return Boolean(baseUrl && (apiKey || isLocalApiBaseUrl(baseUrl)));
};

export const inspectTavernPromptSections = (promptValue: unknown): TavernDiagnosticPromptSection[] => {
  const prompt = typeof promptValue === 'string' ? promptValue.slice(0, 100_000) : '';
  if (!prompt) return [];
  const matches = [...prompt.matchAll(/^【([^】\n]{1,80})】/gm)];
  if (matches.length === 0) {
    return [{ name: '角色主体与系统指令', characters: prompt.length, estimatedTokens: estimateTavernTokenCount(prompt) }];
  }
  const sections: TavernDiagnosticPromptSection[] = [];
  if ((matches[0].index || 0) > 0) {
    const prefix = prompt.slice(0, matches[0].index);
    sections.push({ name: '角色主体与系统指令', characters: prefix.length, estimatedTokens: estimateTavernTokenCount(prefix) });
  }
  matches.forEach((match, index) => {
    const start = match.index || 0;
    const end = matches[index + 1]?.index ?? prompt.length;
    const content = prompt.slice(start, end);
    sections.push({
      name: cleanText(match[1], 80) || `片段 ${index + 1}`,
      characters: content.length,
      estimatedTokens: estimateTavernTokenCount(content),
    });
  });
  return sections.slice(0, 40);
};

const normalizeMessages = (value: unknown): TavernDiagnosticMessage[] => (
  Array.isArray(value) ? value.slice(-500).flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const raw = candidate as Record<string, unknown>;
    const role = raw.role;
    const content = cleanText(raw.content, 50_000);
    return (role === 'user' || role === 'assistant' || role === 'system') && content ? [{ role, content }] : [];
  }) : []
);

export const buildTavernDiagnosticReport = (input: TavernDiagnosticInput): TavernDiagnosticReport => {
  const prompt = typeof input.prompt === 'string' ? input.prompt.slice(0, 100_000) : '';
  const generation = normalizeTavernGenerationConfig(input.generation);
  const messages = normalizeMessages(input.messages);
  const contextWindow = buildTavernContextWindow({
    messages,
    systemPrompt: prompt,
    generation,
    runtimeReserveTokens: input.provider === 'dzmm' ? 384 : 512,
  });
  const includedMessages = contextWindow.messages;
  const historyText = includedMessages.map((message) => message.content).join('\n');
  const worldbooks = normalizeTavernWorldbooks(input.worldbooks);
  const worldbookMatches = matchTavernWorldbooks(worldbooks, input.worldbookScanMessages ?? includedMessages);
  const textRules = normalizeTavernTextRules(input.textRules);
  const invalidRegexRules = textRules.filter((rule) => rule.mode === 'regex' && validateTavernRegexPattern(rule.pattern)).length;
  const provider = input.provider === 'dzmm' || input.provider === 'custom' ? input.provider : 'system';
  const promptTokens = estimateTavernTokenCount(prompt);
  const historyTokens = contextWindow.historyTokens;
  const warnings: string[] = [];
  if (!input.modelConfigured) warnings.push('当前模型通道尚未配置完整，真实试跑可能失败。');
  if (messages.length > includedMessages.length) warnings.push(`Token 预算会省略 ${messages.length - includedMessages.length} 条较早消息。`);
  if (contextWindow.truncatedMessages > 0) warnings.push(`${contextWindow.truncatedMessages} 条超长消息会保留头尾后截断。`);
  if (contextWindow.promptOverflowTokens > 0) warnings.push(`System Prompt 已超出可用输入预算约 ${contextWindow.promptOverflowTokens} tokens，最新消息也可能无法完整发送。`);
  if (prompt.length > 40_000) warnings.push('System Prompt 已超过 4 万字符，可能挤压可用对话上下文。');
  if (invalidRegexRules > 0) warnings.push(`${invalidRegexRules} 条正则规则无效，运行时会被跳过。`);
  if (worldbookMatches.length > 20) warnings.push('本轮命中超过 20 条世界书条目，建议收紧关键词以减少上下文消耗。');
  if (contextWindow.estimatedInputTokens + generation.maxTokens > generation.contextWindowTokens) warnings.push('估算的输入与最大输出超过所选模型上下文上限。');
  if (warnings.length === 0) warnings.push('未发现明显配置问题；Token 数为本地估算值，以服务商实际计费为准。');

  return {
    format: 'yiciyuan_tavern_diagnostics',
    version: 1,
    generatedAt: new Date().toISOString(),
    privacy: '本报告不包含 Prompt 正文、聊天正文、API Key、访问令牌或服务地址。',
    characterName: cleanText(input.characterName, 100) || '未命名角色',
    groupParticipants: cleanCount(input.groupParticipants, 1, 4, 1),
    model: {
      provider,
      model: cleanText(input.model, 200) || '未设置',
      configured: input.modelConfigured === true,
    },
    generation,
    prompt: {
      characters: prompt.length,
      estimatedTokens: promptTokens,
      sections: inspectTavernPromptSections(prompt),
    },
    history: {
      totalMessages: messages.length,
      includedMessages: includedMessages.length,
      droppedMessages: messages.length - includedMessages.length,
      characters: historyText.length,
      estimatedTokens: historyTokens,
    },
    features: {
      memoryCharacters: cleanText(input.memorySummary, 30_000).length,
      pinnedMemoryCharacters: cleanText(input.pinnedMemory, 20_000).length,
      authorNoteEnabled: input.authorNoteEnabled === true,
      activePlayerPresets: cleanCount(input.activePlayerPresets, 0, 20, 0),
      enabledWorldbooks: worldbooks.filter((book) => book.enabled).length,
      matchedWorldbookEntries: worldbookMatches.slice(0, 50).map((match) => `${match.bookName} / ${match.entry.name || match.entry.keywords[0]}`),
      enabledTextRules: {
        user_prompt: textRules.filter((rule) => rule.enabled && rule.targets.includes('user_prompt')).length,
        assistant_output: textRules.filter((rule) => rule.enabled && rule.targets.includes('assistant_output')).length,
        tts: textRules.filter((rule) => rule.enabled && rule.targets.includes('tts')).length,
      },
      invalidRegexRules,
    },
    totals: {
      estimatedInputTokens: contextWindow.estimatedInputTokens,
      requestedOutputTokens: generation.maxTokens,
    },
    warnings,
  };
};
