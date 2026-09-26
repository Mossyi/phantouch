import { estimateTavernTokenCount } from './tavernMemory';
import { normalizeTavernGenerationConfig } from './tavernGeneration';

export interface TavernContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface TavernContextWindowResult<T extends TavernContextMessage> {
  messages: T[];
  totalMessages: number;
  includedMessages: number;
  droppedMessages: number;
  truncatedMessages: number;
  promptTokens: number;
  historyTokens: number;
  estimatedInputTokens: number;
  inputBudgetTokens: number;
  contextWindowTokens: number;
  reservedOutputTokens: number;
  runtimeReserveTokens: number;
  promptOverflowTokens: number;
}

export interface TavernContextWindowInput<T extends TavernContextMessage> {
  messages: T[];
  systemPrompt: string;
  generation: unknown;
  runtimeReserveTokens?: number;
}

const MESSAGE_OVERHEAD_TOKENS = 6;
const CONTEXT_SAFETY_RESERVE_TOKENS = 128;

const boundedInteger = (value: unknown, fallback: number, minimum: number, maximum: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
};

const truncateTextToTokenBudget = (value: string, tokenBudget: number): string => {
  const source = String(value || '');
  if (!source || tokenBudget <= 0) return '';
  if (estimateTavernTokenCount(source) <= tokenBudget) return source;
  const marker = '\n…【中间内容因上下文预算已省略】…\n';
  let low = 1;
  let high = source.length;
  let best = '';
  while (low <= high) {
    const keptCharacters = Math.floor((low + high) / 2);
    const headLength = Math.ceil(keptCharacters * 0.6);
    const tailLength = Math.max(0, keptCharacters - headLength);
    const useMarker = tailLength > 0 && tokenBudget > 20;
    const candidate = tailLength > 0
      ? `${source.slice(0, headLength)}${useMarker ? marker : ''}${source.slice(-tailLength)}`
      : source.slice(0, headLength);
    if (estimateTavernTokenCount(candidate) <= tokenBudget) {
      best = candidate;
      low = keptCharacters + 1;
    } else {
      high = keptCharacters - 1;
    }
  }
  return best || source.slice(0, Math.max(1, Math.min(source.length, tokenBudget)));
};

export const buildTavernContextWindow = <T extends TavernContextMessage>(
  input: TavernContextWindowInput<T>,
): TavernContextWindowResult<T> => {
  const generation = normalizeTavernGenerationConfig(input.generation);
  const runtimeReserveTokens = boundedInteger(input.runtimeReserveTokens, 256, 0, 8_192);
  const contextWindowTokens = generation.contextWindowTokens;
  const reservedOutputTokens = generation.maxTokens;
  const inputBudgetTokens = Math.max(
    256,
    contextWindowTokens - reservedOutputTokens - runtimeReserveTokens - CONTEXT_SAFETY_RESERVE_TOKENS,
  );
  const promptTokens = estimateTavernTokenCount(input.systemPrompt);
  // Even an oversized character prompt must not turn a user request into a
  // system-only call. Keep a small final-turn allowance and report overflow.
  let remainingHistoryTokens = Math.max(256, inputBudgetTokens - promptTokens);
  const source = Array.isArray(input.messages)
    ? input.messages
      .filter((message) => message && ['user', 'assistant', 'system'].includes(message.role) && typeof message.content === 'string' && (message.content.trim() || Boolean((message as any).images?.length)))
      .slice(-generation.historyMessages)
    : [];
  const selected = new Map<number, T>();
  let truncatedMessages = 0;

  const includeMessage = (index: number, allowTruncation: boolean) => {
    if (selected.has(index) || remainingHistoryTokens <= MESSAGE_OVERHEAD_TOKENS) return;
    const message = source[index];
    const imageTokens = Array.isArray((message as any).images) ? ((message as any).images.length * 128) : 0;
    const contentTokens = estimateTavernTokenCount(message.content) + imageTokens;
    const fullTokens = contentTokens + MESSAGE_OVERHEAD_TOKENS;
    if (fullTokens <= remainingHistoryTokens) {
      selected.set(index, message);
      remainingHistoryTokens -= fullTokens;
      return;
    }
    if (!allowTruncation) return;
    const availableTextTokens = remainingHistoryTokens - MESSAGE_OVERHEAD_TOKENS - imageTokens;
    if (availableTextTokens <= 0) return;
    const truncated = truncateTextToTokenBudget(message.content, availableTextTokens);
    if (!truncated) return;
    selected.set(index, { ...message, content: truncated });
    remainingHistoryTokens -= estimateTavernTokenCount(truncated) + imageTokens + MESSAGE_OVERHEAD_TOKENS;
    truncatedMessages += 1;
  };

  let latestConversationIndex = -1;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    if (source[index].role !== 'system') {
      latestConversationIndex = index;
      break;
    }
  }
  const latestMessageReserve = latestConversationIndex >= 0
    ? Math.max(0, Math.min(256, remainingHistoryTokens))
    : 0;
  remainingHistoryTokens -= latestMessageReserve;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    if (source[index].role === 'system') includeMessage(index, true);
  }
  remainingHistoryTokens += latestMessageReserve;
  if (latestConversationIndex >= 0) includeMessage(latestConversationIndex, true);
  for (let index = source.length - 1; index >= 0; index -= 1) {
    if (source[index].role !== 'system') includeMessage(index, false);
  }

  const messages = [...selected.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, message]) => message);
  const historyTokens = messages.reduce(
    (total, message) => {
      const imgTokens = Array.isArray((message as any).images) ? ((message as any).images.length * 128) : 0;
      return total + estimateTavernTokenCount(message.content) + imgTokens + MESSAGE_OVERHEAD_TOKENS;
    },
    0,
  );
  return {
    messages,
    totalMessages: Array.isArray(input.messages) ? input.messages.length : 0,
    includedMessages: messages.length,
    droppedMessages: Math.max(0, (Array.isArray(input.messages) ? input.messages.length : 0) - messages.length),
    truncatedMessages,
    promptTokens,
    historyTokens,
    estimatedInputTokens: promptTokens + historyTokens + runtimeReserveTokens,
    inputBudgetTokens,
    contextWindowTokens,
    reservedOutputTokens,
    runtimeReserveTokens,
    promptOverflowTokens: Math.max(0, promptTokens - inputBudgetTokens),
  };
};
