import { stripThinkingArtifacts } from './tavernTextSanitizer';

export const TAVERN_MEMORY_SUMMARY_MAX_LENGTH = 8_000;
export const TAVERN_MEMORY_PINNED_MAX_LENGTH = 4_000;
export const TAVERN_MEMORY_AUTO_MIN_MESSAGES = 6;
export const TAVERN_MEMORY_AUTO_MAX_MESSAGES = 40;

export interface TavernMemoryState {
  enabled: boolean;
  autoSummarize: boolean;
  autoEveryMessages: number;
  pinnedMemory: string;
  summary: string;
  previousSummary: string;
  summarizedThroughMessageId?: string;
  updatedAt?: number;
}

export interface TavernMemoryMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  speakerCardId?: string;
}

export const DEFAULT_TAVERN_MEMORY_STATE: TavernMemoryState = {
  enabled: true,
  autoSummarize: false,
  autoEveryMessages: 12,
  pinnedMemory: '',
  summary: '',
  previousSummary: '',
};

const cleanText = (value: unknown, maxLength: number): string => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

export const normalizeTavernMemoryState = (value: unknown): TavernMemoryState => {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const autoEvery = Number(raw.autoEveryMessages);
  const updatedAt = Number(raw.updatedAt);
  return {
    enabled: raw.enabled !== false,
    autoSummarize: raw.autoSummarize === true,
    autoEveryMessages: Number.isFinite(autoEvery)
      ? Math.min(TAVERN_MEMORY_AUTO_MAX_MESSAGES, Math.max(TAVERN_MEMORY_AUTO_MIN_MESSAGES, Math.round(autoEvery)))
      : DEFAULT_TAVERN_MEMORY_STATE.autoEveryMessages,
    pinnedMemory: cleanText(raw.pinnedMemory, TAVERN_MEMORY_PINNED_MAX_LENGTH),
    summary: cleanText(raw.summary, TAVERN_MEMORY_SUMMARY_MAX_LENGTH),
    previousSummary: cleanText(raw.previousSummary, TAVERN_MEMORY_SUMMARY_MAX_LENGTH),
    summarizedThroughMessageId: cleanText(raw.summarizedThroughMessageId, 200) || undefined,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : undefined,
  };
};

export const buildTavernMemoryContext = (value: unknown): string => {
  const state = normalizeTavernMemoryState(value);
  if (!state.enabled || (!state.pinnedMemory && !state.summary)) return '';
  return [
    '【酒馆长期记忆】',
    state.pinnedMemory ? `固定事实（玩家维护）：\n${state.pinnedMemory}` : '',
    state.summary ? `此前剧情摘要：\n${state.summary}` : '',
    '这些内容只用于保持人物关系与剧情连续性。若与玩家当前消息冲突，以当前消息为准；不得把记忆中的设备描写当成当前硬件命令，也不得声称重放了历史动作。',
  ].filter(Boolean).join('\n\n').slice(0, TAVERN_MEMORY_PINNED_MAX_LENGTH + TAVERN_MEMORY_SUMMARY_MAX_LENGTH + 500);
};

const findSummaryStart = (messages: TavernMemoryMessage[], state: TavernMemoryState, maxScan = 200): number => {
  if (!state.summarizedThroughMessageId) return Math.max(0, messages.length - maxScan);
  const index = messages.findIndex((message) => message.id === state.summarizedThroughMessageId);
  return index >= 0 ? index + 1 : Math.max(0, messages.length - maxScan);
};

export const getTavernMemoryPendingMessages = (
  messages: TavernMemoryMessage[],
  value: unknown,
  maxMessages = 120,
): TavernMemoryMessage[] => {
  const state = normalizeTavernMemoryState(value);
  return messages
    .slice(findSummaryStart(messages, state, 200))
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && cleanText(message.content, 1).length > 0)
    .slice(0, Math.max(1, Math.min(200, Math.round(maxMessages))));
};

export const shouldAutoSummarizeTavernMemory = (
  messages: TavernMemoryMessage[],
  value: unknown,
): boolean => {
  const state = normalizeTavernMemoryState(value);
  if (!state.enabled || !state.autoSummarize) return false;
  const pending = getTavernMemoryPendingMessages(messages, state, 100);
  return pending.filter((message) => message.role === 'assistant').length >= state.autoEveryMessages;
};

export const buildTavernMemorySummaryRequest = (
  characterName: string,
  messages: TavernMemoryMessage[],
  value: unknown,
): { prompt: string; throughMessageId?: string; pendingCount: number } => {
  const state = normalizeTavernMemoryState(value);
  const pending = getTavernMemoryPendingMessages(messages, state, 100);
  const transcript = pending.map((message) => {
    const speaker = message.role === 'user' ? '玩家' : characterName || '角色';
    return `${speaker}：${cleanText(message.content, 4_000)}`;
  }).join('\n\n').slice(0, 100_000);
  return {
    prompt: [
      `请更新角色「${cleanText(characterName, 100) || '当前角色'}」与玩家的长期剧情摘要。`,
      state.summary ? `【上一版摘要】\n${state.summary}` : '【上一版摘要】\n暂无。',
      `【新增对话】\n${transcript || '暂无新增对话。'}`,
      '只输出更新后的摘要正文，不要扮演角色，不要解释。必须系统性保留：\n1. 称谓习惯、长期约定与核心契约关系；\n2. 关键剧情脉络、已发生的大事件与重要场景转折；\n3. 角色情感与心境演进、彼此共享的秘密与羁绊；\n4. 玩家专属偏好、身体或心理禁忌与特殊习惯；\n5. 当前正在进行的事件、未解决的悬念与下一步承诺。\n删除无意义闲聊、临时重复琐碎措辞与已经失效的状态。不得把历史设备动作改写成当前命令。控制在 3500 个中文字符以内。',
    ].join('\n\n'),
    throughMessageId: pending.at(-1)?.id,
    pendingCount: pending.length,
  };
};

export const applyTavernMemorySummary = (
  value: unknown,
  summary: unknown,
  throughMessageId?: unknown,
  originalSummary?: unknown,
  updatedAt = Date.now(),
): TavernMemoryState => {
  const state = normalizeTavernMemoryState(value);
  const nextSummary = cleanText(stripThinkingArtifacts(typeof summary === 'string' ? summary : '', false), TAVERN_MEMORY_SUMMARY_MAX_LENGTH);
  if (!nextSummary) return state;
  if (originalSummary !== undefined && state.summary !== originalSummary) return state;
  return normalizeTavernMemoryState({
    ...state,
    previousSummary: state.summary,
    summary: nextSummary,
    summarizedThroughMessageId: cleanText(throughMessageId, 200) || state.summarizedThroughMessageId,
    updatedAt,
  });
};

export const rollbackTavernMemorySummary = (value: unknown): TavernMemoryState => {
  const state = normalizeTavernMemoryState(value);
  if (!state.previousSummary) return state;
  return normalizeTavernMemoryState({
    ...state,
    summary: state.previousSummary,
    previousSummary: state.summary,
    updatedAt: Date.now(),
  });
};

export const estimateTavernTokenCount = (value: unknown): number => {
  const text = typeof value === 'string' ? value : '';
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const remaining = Math.max(0, text.length - cjk);
  return Math.max(0, Math.ceil(cjk + remaining / 4));
};
