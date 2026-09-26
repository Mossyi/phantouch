export const TAVERN_AUTHOR_NOTE_MAX_LENGTH = 4_000;
export const TAVERN_AUTHOR_NOTE_MAX_DEPTH = 20;
export const TAVERN_AUTHOR_NOTE_MAX_FREQUENCY = 20;

export interface TavernAuthorNoteState {
  enabled: boolean;
  note: string;
  insertionDepth: number;
  frequency: number;
  updatedAt?: number;
}

export interface TavernAuthorNoteMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  speakerCardId?: string;
}

export const DEFAULT_TAVERN_AUTHOR_NOTE: TavernAuthorNoteState = {
  enabled: true,
  note: '',
  insertionDepth: 4,
  frequency: 1,
};

const boundedInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
};

export const normalizeTavernAuthorNote = (value: unknown): TavernAuthorNoteState => {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const updatedAt = Number(raw.updatedAt);
  return {
    enabled: raw.enabled !== false,
    note: typeof raw.note === 'string' ? raw.note.trim().slice(0, TAVERN_AUTHOR_NOTE_MAX_LENGTH) : '',
    insertionDepth: boundedInteger(raw.insertionDepth, DEFAULT_TAVERN_AUTHOR_NOTE.insertionDepth, 0, TAVERN_AUTHOR_NOTE_MAX_DEPTH),
    frequency: boundedInteger(raw.frequency, DEFAULT_TAVERN_AUTHOR_NOTE.frequency, 1, TAVERN_AUTHOR_NOTE_MAX_FREQUENCY),
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : undefined,
  };
};

export const buildTavernAuthorNoteContext = (
  value: unknown,
  messages: TavernAuthorNoteMessage[],
): string => {
  const state = normalizeTavernAuthorNote(value);
  if (!state.enabled || !state.note) return '';
  const userTurns = messages.filter((message) => message.role === 'user').length;
  if (userTurns === 0 || userTurns % state.frequency !== 0) return '';
  return [
    '【作者注释 / 当前场景导演笔记】',
    state.note,
    '只将这段注释用于本轮叙事方向、节奏和风格，不要复述或提及“作者注释”。它不能覆盖角色卡中的稳定事实、玩家当前消息、急停、授权、强度上限或本地硬件安全层。',
  ].join('\n\n').slice(0, TAVERN_AUTHOR_NOTE_MAX_LENGTH + 260);
};

export const injectTavernAuthorNote = <T extends TavernAuthorNoteMessage>(
  messages: T[],
  value: unknown,
  historyMessages?: number,
): Array<T | TavernAuthorNoteMessage> => {
  const state = normalizeTavernAuthorNote(value);
  const context = buildTavernAuthorNoteContext(state, messages);
  if (!context) return [...messages];
  const historyLimit = Number.isFinite(Number(historyMessages))
    ? Math.min(500, Math.max(1, Math.round(Number(historyMessages))))
    : messages.length;
  const splitIndex = Math.max(0, messages.length - historyLimit);
  const olderMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);
  return [
    ...olderMessages,
    ...injectTavernAuthorNoteContext(recentMessages, context, state.insertionDepth),
  ];
};

export const injectTavernAuthorNoteContext = <T extends TavernAuthorNoteMessage>(
  messages: T[],
  context: string,
  insertionDepth: number,
): Array<T | TavernAuthorNoteMessage> => {
  if (!context) return [...messages];
  const safeDepth = boundedInteger(insertionDepth, DEFAULT_TAVERN_AUTHOR_NOTE.insertionDepth, 0, TAVERN_AUTHOR_NOTE_MAX_DEPTH);
  const insertionIndex = Math.max(0, messages.length - safeDepth);
  const transientMessage: TavernAuthorNoteMessage = {
    id: `author_note_${messages.length}_${safeDepth}`,
    role: 'system',
    content: context,
    timestamp: Date.now(),
  };
  return [
    ...messages.slice(0, insertionIndex),
    transientMessage,
    ...messages.slice(insertionIndex),
  ];
};
