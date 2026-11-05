/**
 * 训练日程的 AI 世界生成与「探索周边」。
 *
 * 做法参考 Waidrin：让模型按固定 JSON 结构生成世界、地点、连线，再由程序校验和修补，
 * 而不是让模型自由发挥后去猜。这里只用一次普通对话请求（不依赖受限解码），所以解析要宽松、
 * 校验要严格：缺少必需的地点就补，图不连通就接到住处，数值全部限幅。
 */
import {
  REWARD_CATALOG,
  RPG_PERIOD_LABELS,
  getLocation,
  getNeighborIds,
  normalizeCustomCourse,
  normalizeCustomEvent,
  type RpgCourse,
  type RpgLocationEvent,
  type RpgDiscoverEntry,
  type RpgLocationKind,
  type RpgShopItem,
  type RpgTemplate,
  type TavernRpgState,
  type TemplateLocation,
} from './tavernRpg';

export interface WorldGenInput {
  theme: string;
  details?: string;
  dayLimit: number;
}

export interface GeneratedWorld {
  template: RpgTemplate;
  courses: RpgCourse[];
  /** 这个世界专属的地点事件 */
  events: RpgLocationEvent[];
  /** 修补过程中做的改动，给用户看 */
  fixes: string[];
}

const KINDS: RpgLocationKind[] = ['bedroom', 'home', 'bath', 'playroom', 'shop', 'work', 'cafe', 'outdoor', 'special'];
const KIND_HINT = 'bedroom 卧室（可休息）/ home 居所 / bath 浴室 / playroom 训练室 / shop 兑换处 / work 做差事的地方 / cafe 店铺 / outdoor 户外 / special 特殊';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const toInt = (value: unknown, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : fallback;
};
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const normalizeName = (value: string) => value.replace(/[\s·・()（）「」『』“”"'【】[\]]/g, '').toLowerCase();
const kindOf = (value: unknown): RpgLocationKind => (KINDS.includes(value as RpgLocationKind) ? value as RpgLocationKind : 'special');
const periods = (value: unknown) => (Array.isArray(value) ? [...new Set(value.map((p) => toInt(p, -1)).filter((p) => p >= 0 && p <= 3))] : []);

export const WORLD_GEN_SYSTEM = '你是文字养成游戏的关卡设计师。你只输出一个 JSON 对象，不要输出任何解释、Markdown 或代码块标记。';

const SCHEMA = `{
  "worldName": "世界名，不超过 12 字",
  "premise": "背景，不超过 150 字：{{char}}为什么调教{{user}}、双方的约定，必须包含安全词",
  "locations": [
    { "id": "bedroom", "name": "地点名，不超过 8 字", "kind": "bedroom", "desc": "一句话描述，不超过 40 字", "dir": "相对上一个相连地点的方位：北/南/东/西/东北/西北/东南/西南", "open": [0,1,2,3] },
    { "id": "kitchen", "name": "...", "kind": "work", "desc": "...", "pay": 15, "open": [0,1,2] },
    { "id": "store", "name": "...", "kind": "shop", "desc": "...", "items": [{ "name": "物品名", "price": 30, "note": "效果说明", "effect": "stamina:20" }] }
  ],
  "links": [["bedroom","kitchen"], ["kitchen","store"]],
  "rules": ["家规，不超过 20 字"],
  "courses": [
    { "name": "课程名，不超过 8 字", "desc": "做什么，不超过 30 字", "kinds": ["playroom"], "stat": "obedience", "dc": 12, "stamina": 10, "stress": 3, "gain": { "obedience": 3 }, "points": 8, "unlockLevel": 1 }
  ],
  "events": [
    { "title": "事件名，不超过 8 字", "text": "进入地点时发生的情境，不超过 60 字，用 {{char}} 和 {{user}} 指代双方", "kinds": ["outdoor"], "periods": [2,3], "choices": [{ "text": "回应，不超过 12 字", "check": "shame:12" }, { "text": "另一种回应" }] }
  ]
}`;

/** 世界生成请求（发给文字模型的用户消息） */
export const buildWorldGenRequest = (
  input: WorldGenInput,
  names: { char: string; user: string },
  card: { description?: string; personality?: string; scenario?: string },
) => {
  const cardInfo = [card.description, card.personality, card.scenario].map((part) => text(part, 400)).filter(Boolean).join('\n');
  return `请为一个「按天安排的调教日程」游戏设计一个世界。
角色关系：${names.char}是调教者，${names.user}是自愿接受调教的一方。
主题：${text(input.theme, 60) || '由你根据角色设定决定'}
${input.details ? `补充要求：${text(input.details, 300)}\n` : ''}${cardInfo ? `调教者的角色设定（参考）：\n${cardInfo}\n` : ''}
设计要求：
1. 6 到 10 个地点，连成一张连通的图，第一个地点是${names.user}睡觉的地方（kind 必须是 bedroom）。
2. 至少一个 playroom（训练用的房间）、一个 shop（兑换奖励的地方，给 3-5 个物品）、一个 work（做差事赚积分，pay 10-30）。
3. kind 只能取：${KIND_HINT}。
4. open 是开放时段（0 ${RPG_PERIOD_LABELS[0]}、1 ${RPG_PERIOD_LABELS[1]}、2 ${RPG_PERIOD_LABELS[2]}、3 ${RPG_PERIOD_LABELS[3]}），全天开放的地点省略 open；卧室必须全天开放。
5. 物品 effect 只能写 "stamina:数值"（回体力 5-40）、"stress:数值"（减压力 5-30）、"pardon"（免罚券）或省略。
6. 2-4 条家规；2-3 门贴合这个世界的专属课程，stat 取 obedience/endurance/shame/devotion（shame 课程用来克服羞耻，gain 里写负数），dc 8-18，stamina 2-25，stress -5 到 8，points 0-20，unlockLevel 0-2。
7. 4-6 个贴合这个世界的地点事件（进入某类地点时可能发生的小插曲），每个给 2-3 个${names.user}的回应，需要检定的写 check（属性:难度）。
8. 所有文字用简体中文，地点名不要重复。

严格按下面的 JSON 结构输出：
${SCHEMA}`;
};

/** 从模型回复里取出 JSON：容忍代码块、前后说明文字、尾逗号 */
export const extractJsonObject = (raw: string): Record<string, unknown> | null => {
  if (!raw) return null;
  const cleaned = raw.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const body = cleaned.slice(start, end + 1);
  for (const attempt of [body, body.replace(/,\s*([}\]])/g, '$1')]) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // try next
    }
  }
  return null;
};

const parseEffect = (value: unknown): RpgShopItem['effect'] => {
  if (typeof value !== 'string') return undefined;
  if (/pardon|免罚/i.test(value)) return { pardon: true };
  const stamina = value.match(/stamina\s*[:：]\s*(\d+)/i);
  if (stamina) return { stamina: clamp(Number(stamina[1]), 5, 40) };
  const stress = value.match(/stress\s*[:：]\s*(\d+)/i);
  if (stress) return { stress: clamp(Number(stress[1]), 5, 30) };
  return undefined;
};

const DIRS: Record<string, [number, number]> = {
  北: [0, -1], 南: [0, 1], 东: [1, 0], 西: [-1, 0], 东北: [1, -1], 西北: [-1, -1], 东南: [1, 1], 西南: [-1, 1],
};
const RING: Array<[number, number]> = [[0, -1], [1, 0], [-1, 0], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];

/** 从住处出发按广度优先摆位置：尽量按 AI 给的方位放，被占了就找最近的空格 */
const layout = (nodes: Array<{ key: string; dir: string }>, links: Array<[string, string]>, home: string) => {
  const pos = new Map<string, [number, number]>([[home, [0, 0]]]);
  const taken = new Set(['0,0']);
  const queue = [home];
  const neighbors = (key: string) => links.flatMap(([a, b]) => (a === key ? [b] : b === key ? [a] : []));
  while (queue.length) {
    const key = queue.shift()!;
    const [x, y] = pos.get(key)!;
    for (const next of neighbors(key)) {
      if (pos.has(next)) continue;
      const preferred = DIRS[nodes.find((node) => node.key === next)?.dir ?? ''];
      const order = preferred ? [preferred, ...RING] : RING;
      let placed: [number, number] | null = null;
      for (let radius = 1; radius <= 4 && !placed; radius += 1) {
        for (const [dx, dy] of order) {
          const candidate: [number, number] = [x + dx * radius, y + dy * radius];
          if (!taken.has(candidate.join(','))) { placed = candidate; break; }
        }
      }
      placed ??= [x + pos.size, y];
      pos.set(next, placed);
      taken.add(placed.join(','));
      queue.push(next);
    }
  }
  return pos;
};

/** 校验并修补 AI 生成的世界，转成引擎模板 */
export const parseGeneratedWorld = (raw: string, input: WorldGenInput): GeneratedWorld | null => {
  const data = extractJsonObject(raw);
  if (!data || !Array.isArray(data.locations)) return null;
  const fixes: string[] = [];

  // 地点：去重、限长，key 统一成安全的短 id
  const seen = new Set<string>();
  const rawNodes = data.locations.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const name = text(record.name, 8);
    if (!name || seen.has(normalizeName(name))) return [];
    seen.add(normalizeName(name));
    const kind = kindOf(record.kind);
    const catalog = kind === 'shop' && Array.isArray(record.items)
      ? record.items.flatMap((item): RpgShopItem[] => {
        if (!item || typeof item !== 'object') return [];
        const r = item as Record<string, unknown>;
        const itemName = text(r.name, 8);
        if (!itemName) return [];
        const effect = parseEffect(r.effect);
        return [{ name: itemName, price: clamp(toInt(r.price, 30), 5, 120), note: text(r.note, 24) || (effect?.stamina ? `体力 +${effect.stamina}` : effect?.stress ? `压力 -${effect.stress}` : effect?.pardon ? '下次检定失败时自动使用' : '奖励'), effect }];
      }).slice(0, 6)
      : [];
    return [{
      key: `n${index}`,
      sourceId: text(record.id, 24),
      name,
      kind,
      desc: text(record.desc ?? record.description, 40) || name,
      dir: text(record.dir, 2),
      open: kind === 'bedroom' ? [] : periods(record.open).length >= 4 ? [] : periods(record.open),
      pay: kind === 'work' ? clamp(toInt(record.pay, 15), 10, 30) : 0,
      catalog,
    }];
  }).slice(0, 10);
  if (rawNodes.length < 3) return null;

  // 必需的地点：卧室（第一个）、训练室、兑换处、差事
  let home = rawNodes.find((node) => node.kind === 'bedroom');
  if (!home) {
    home = rawNodes[0];
    home.kind = 'bedroom';
    home.open = [];
    fixes.push(`把「${home.name}」设为卧室`);
  }
  const ensure = (kind: RpgLocationKind, name: string, desc: string, extra: Partial<typeof rawNodes[number]> = {}) => {
    if (rawNodes.some((node) => node.kind === kind)) return;
    rawNodes.push({ key: `n${rawNodes.length + 20}`, sourceId: '', name, kind, desc, dir: '', open: [], pay: 0, catalog: [], ...extra });
    fixes.push(`补上了${name}`);
  };
  ensure('playroom', '训练室', '进行课程的房间。');
  ensure('shop', '奖励柜', '用积分兑换奖励。', { catalog: REWARD_CATALOG.map((item) => ({ ...item })) });
  ensure('work', '杂务间', '做差事可以换积分。', { pay: 15, open: [0, 1, 2] });
  for (const node of rawNodes) {
    if (node.kind === 'shop' && node.catalog.length < 2) {
      node.catalog = REWARD_CATALOG.map((item) => ({ ...item }));
      fixes.push(`「${node.name}」的兑换品换成了默认奖励`);
    }
  }

  // 连线：认 AI 给的 id 或名字；不连通的接到住处
  const keyOf = (ref: unknown) => {
    const value = text(ref, 24);
    return rawNodes.find((node) => node.sourceId === value || normalizeName(node.name) === normalizeName(value))?.key;
  };
  const links: Array<[string, string]> = [];
  for (const link of Array.isArray(data.links) ? data.links : []) {
    if (!Array.isArray(link) || link.length < 2) continue;
    const a = keyOf(link[0]);
    const b = keyOf(link[1]);
    if (a && b && a !== b && !links.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) links.push([a, b]);
  }
  const reached = new Set([home.key]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [a, b] of links) {
      if (reached.has(a) !== reached.has(b)) { reached.add(a); reached.add(b); grew = true; }
    }
  }
  for (const node of rawNodes) {
    if (!reached.has(node.key)) {
      links.push([home.key, node.key]);
      reached.add(node.key);
      fixes.push(`「${node.name}」原本不连通，接到了${home.name}旁边`);
    }
  }

  const positions = layout(rawNodes, links, home.key);
  const locations: TemplateLocation[] = rawNodes.map((node) => {
    const [x, y] = positions.get(node.key) ?? [0, 0];
    return {
      key: node.key,
      name: node.name,
      kind: node.kind,
      x,
      y,
      description: node.desc,
      services: node.kind === 'bedroom' ? ['rest'] : node.kind === 'shop' ? ['shop'] : node.kind === 'work' ? ['work'] : [],
      catalog: node.kind === 'shop' ? node.catalog : undefined,
      pay: node.kind === 'work' ? node.pay : undefined,
      open: node.open.length ? node.open : undefined,
    };
  });

  const rules = (Array.isArray(data.rules) ? data.rules : []).map((rule) => text(rule, 30)).filter(Boolean).slice(0, 4);
  const courses = (Array.isArray(data.courses) ? data.courses : [])
    .slice(0, 3)
    .map((course, index) => normalizeCustomCourse({ ...(course as object), id: `ai_${index}` }, index))
    .filter((course): course is RpgCourse => Boolean(course))
    .map((course) => ({ ...course, kinds: course.kinds.filter((kind) => locations.some((loc) => loc.kind === kind)).length ? course.kinds : ['playroom' as RpgLocationKind] }));

  const events = (Array.isArray(data.events) ? data.events : [])
    .slice(0, 6)
    .map((event, index) => normalizeCustomEvent({ ...(event as object), id: `aie_${index}` }, index))
    .filter((event): event is RpgLocationEvent => Boolean(event))
    .filter((event) => event.kinds.some((kind) => locations.some((loc) => loc.kind === kind)));

  const template: RpgTemplate = {
    id: `ai${Date.now().toString(36)}`,
    name: text(data.worldName, 12) || text(input.theme, 12) || 'AI 生成的世界',
    tagline: 'AI 生成',
    premise: text(data.premise, 200) || `{{user}}自愿接受{{char}}的调教，约定的安全词一说出口，一切立刻停止。`,
    home: home.key,
    dayLimit: clamp(toInt(input.dayLimit, 30), 0, 365),
    points: 20,
    locations,
    edges: links,
    goals: [
      { title: '学会规矩', stat: 'obedience', op: 'gte', value: 40, reward: 40 },
      { title: '坚持住', stat: 'endurance', op: 'gte', value: 40, reward: 40 },
      { title: '交出信任', stat: 'devotion', op: 'gte', value: 50, reward: 60 },
    ],
    rules,
    inventory: [],
  };
  return { template, courses, events, fixes };
};

// ─── 探索周边 ──────────────────────────────────────────────────────────────────

export const buildExploreRequest = (state: TavernRpgState, names: { char: string; user: string }) => {
  const here = getLocation(state, state.currentId);
  const nearby = here ? getNeighborIds(state, here.id).map((id) => getLocation(state, id)?.name).filter(Boolean).join('、') : '';
  return `世界「${state.worldName}」：${state.premise}
现有地点：${state.locations.map((loc) => loc.name).join('、')}
${names.user}现在在「${here?.name ?? '住处'}」（${here?.description ?? ''}），相邻的有：${nearby || '无'}。
请在「${here?.name ?? '这里'}」附近设计 1-2 个新地点，贴合这个世界和${names.char}调教${names.user}的日常，名字不能和现有地点重复。
kind 只能取：${KIND_HINT}。open 是开放时段（0 清晨 1 白天 2 黄昏 3 深夜），全天开放就省略。
严格输出 JSON：{"locations":[{"name":"不超过 8 字","kind":"outdoor","desc":"一句话，不超过 40 字","dir":"北/南/东/西/东北/西北/东南/西南","open":[1,2]}]}`;
};

export const parseExploredLocations = (raw: string): RpgDiscoverEntry[] => {
  const data = extractJsonObject(raw);
  const list = Array.isArray(data?.locations) ? data!.locations : [];
  return list.flatMap((entry): RpgDiscoverEntry[] => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const name = text(record.name, 8);
    if (!name) return [];
    const kind = kindOf(record.kind);
    // 探索出来的地点不提供休息/兑换/差事服务，避免绕开系统经济
    return [{ name, kind: kind === 'bedroom' || kind === 'shop' || kind === 'work' ? 'special' : kind, dir: text(record.dir, 2), desc: text(record.desc ?? record.description, 40), from: undefined, open: periods(record.open).length >= 4 ? [] : periods(record.open) }];
  }).slice(0, 2);
};
