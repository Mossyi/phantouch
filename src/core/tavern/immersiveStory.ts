import {
  getTavernMemoryPendingMessages,
  normalizeTavernMemoryState,
  type TavernMemoryMessage,
} from './tavernMemory';

export const IMMERSIVE_START = '<<<YCY_IMMERSIVE>>>';
export const IMMERSIVE_END = '<<<END_YCY_IMMERSIVE>>>';

export interface ImmersiveStatus {
  time: string;
  place: string;
  outfit: string;
  mood: string;
  inner: string;
}

export interface ImmersiveGroupLine {
  name: string;
  line: string;
}

export interface ImmersiveStoryView {
  body: string;
  status: ImmersiveStatus;
  group: ImmersiveGroupLine[];
  sketch: string;
  moves: string[];
  structured: boolean;
}

export interface ImmersiveCastContext {
  protagonist: string;
  playerName: string;
  cardText: string;
}

export interface ImmersiveMemoryFacts {
  enabled: boolean;
  pinned: string;
  summary: string;
  summaryInjected: boolean;
  staleSummary: string;
  unplaced: string;
  pendingCount: number;
  autoEvery: number;
  autoOn: boolean;
}

const EMPTY_STATUS: ImmersiveStatus = { time: '', place: '', outfit: '', mood: '', inner: '' };

/** 排版附注。它不能改人设、世界书、安全规则，也不能变成硬件动作。 */
export const buildImmersiveStoryPrompt = (protagonist: string): string => [
  '【沉浸剧情展示格式】',
  '这只是聊天界面的附加排版，优先级低于角色卡、世界书、玩家当前消息和安全规则。不得改写人设、称呼或文风，不得替玩家决定台词或行动，不得声称执行了任何真实设备、强度、急停或授权。',
  `先用当前角色「${protagonist || '角色'}」的口吻写完可读正文。旁白和引号里的对白可以同时出现。`,
  '正文结束后另起一行，只追加一个标记块，正文里不要出现标记：',
  IMMERSIVE_START,
  '{"time":"","place":"","outfit":"","mood":"","inner":"","group":[],"sketch":"","moves":[]}',
  IMMERSIVE_END,
  'time、place、outfit、mood、inner、sketch 都是短文本，可以留空。不要输出分数、好感、服从、性欲或任何数值条。',
  'group 只填写当前角色卡正文里已经出现、且不是主角本人也不是玩家的人名，每项是 {"name":"","line":""}。没有这样的配角就用空数组，不要新造人物。',
  'moves 最多 3 条，写成玩家可以自己修改的下一步，使用玩家第一人称。这只是建议，不会自动发送。',
  '不要输出 HTML、脚本、图片或 Markdown。',
].join('\n');

export const immersiveCardText = (card: {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  introduction?: string;
  detailedDescription?: string;
  systemPromptAddon?: string;
}): string => [
  card.description,
  card.personality,
  card.scenario,
  card.introduction,
  card.detailedDescription,
  card.systemPromptAddon,
].filter((part) => typeof part === 'string' && part.trim()).join('\n');

const plain = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
};

const markerIndex = (text: string): number => {
  const exact = text.indexOf(IMMERSIVE_START);
  if (exact >= 0) return exact;
  const partial = text.search(/<<<\s*YCY_IMMERSIVE/);
  return partial;
};

export const immersiveStreamingText = (raw: string): string => {
  if (typeof raw !== 'string' || !raw) return '';
  const index = markerIndex(raw);
  const prose = index >= 0 ? raw.slice(0, index) : raw;
  return prose.replace(/<<<\s*YCY_IMMERSI?V?E?\s*$/i, '').trimEnd();
};

const parseBlock = (block: string): Record<string, unknown> | null => {
  const trimmed = block.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const allowedName = (name: string, context: ImmersiveCastContext): boolean => {
  const protagonist = context.protagonist.trim();
  const player = context.playerName.trim();
  if (!name || name === protagonist || name === player) return false;
  if (name.length < 2 || name.length > 16) return false;
  return context.cardText.includes(name);
};

const readView = (record: Record<string, unknown>, context: ImmersiveCastContext, prose: string): ImmersiveStoryView => {
  const embeddedBody = plain(record.body, 8_000);
  const status = {
    time: plain(record.time, 80),
    place: plain(record.place, 80),
    outfit: plain(record.outfit, 120),
    mood: plain(record.mood, 80),
    inner: plain(record.inner, 180),
  };
  const group: ImmersiveGroupLine[] = [];
  if (Array.isArray(record.group)) {
    for (const item of record.group) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const entry = item as Record<string, unknown>;
      const name = plain(entry.name, 16);
      const line = plain(entry.line, 180);
      if (!line || !allowedName(name, context) || group.some((existing) => existing.name === name && existing.line === line)) continue;
      group.push({ name, line });
      if (group.length >= 4) break;
    }
  }
  const moves: string[] = [];
  if (Array.isArray(record.moves)) {
    for (const item of record.moves) {
      const move = plain(item, 160);
      if (move.length < 2 || moves.includes(move)) continue;
      moves.push(move);
      if (moves.length >= 3) break;
    }
  }
  return {
    body: prose || embeddedBody,
    status,
    group,
    sketch: plain(record.sketch, 280),
    moves,
    structured: true,
  };
};

export const parseImmersiveStory = (raw: string, context: ImmersiveCastContext): ImmersiveStoryView => {
  const text = typeof raw === 'string' ? raw : '';
  const start = markerIndex(text);
  if (start < 0) {
    return { body: text.trim(), status: { ...EMPTY_STATUS }, group: [], sketch: '', moves: [], structured: false };
  }
  const prose = text.slice(0, start).trim();
  const after = text.slice(start + (text.startsWith(IMMERSIVE_START, start) ? IMMERSIVE_START.length : text.slice(start).match(/^<<<\s*YCY_IMMERSIVE>>>?/)?.[0].length || IMMERSIVE_START.length));
  const end = after.indexOf(IMMERSIVE_END);
  const block = end >= 0 ? after.slice(0, end) : '';
  const record = end >= 0 ? parseBlock(block) : null;
  if (!record) {
    return { body: prose, status: { ...EMPTY_STATUS }, group: [], sketch: '', moves: [], structured: false };
  }
  return readView(record, context, prose);
};

export const composeStoredImmersiveReply = (body: string, view: ImmersiveStoryView): string => {
  const payload = {
    time: view.status.time,
    place: view.status.place,
    outfit: view.status.outfit,
    mood: view.status.mood,
    inner: view.status.inner,
    group: view.group,
    sketch: view.sketch,
    moves: view.moves,
  };
  const prose = body.trim();
  return `${prose}\n\n${IMMERSIVE_START}\n${JSON.stringify(payload)}\n${IMMERSIVE_END}`;
};

/** 入库前把成功解析的结果收成我们自己的标记；坏结构只留正文。 */
export const finalizeImmersiveReply = (raw: string, context: ImmersiveCastContext): string => {
  const view = parseImmersiveStory(raw, context);
  if (!view.structured) return view.body;
  return composeStoredImmersiveReply(view.body, view);
};

export const readImmersiveMemoryFacts = (
  messages: TavernMemoryMessage[],
  memory: unknown,
): ImmersiveMemoryFacts => {
  const state = normalizeTavernMemoryState(memory);
  const pendingCount = getTavernMemoryPendingMessages(messages, state).length;
  const summaryInjected = state.enabled !== false && state.summaryValid !== false && Boolean(state.summary);
  return {
    enabled: state.enabled !== false,
    pinned: state.pinnedMemory,
    summary: summaryInjected ? state.summary : '',
    summaryInjected,
    staleSummary: state.summaryValid === false ? state.staleSummary || state.summary : '',
    unplaced: state.unplacedSummary || '',
    pendingCount,
    autoEvery: state.autoEveryMessages,
    autoOn: state.autoSummarize === true,
  };
};

export const storySegments = (body: string): Array<{ kind: 'narration' | 'dialogue'; text: string }> => {
  const text = body || '';
  const segments: Array<{ kind: 'narration' | 'dialogue'; text: string }> = [];
  const pattern = /「[^」]*」|“[^”]*”/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ kind: 'narration', text: text.slice(cursor, index) });
    segments.push({ kind: 'dialogue', text: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: 'narration', text: text.slice(cursor) });
  return segments.filter((segment) => segment.text.length > 0);
};
