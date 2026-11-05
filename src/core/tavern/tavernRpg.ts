/**
 * 酒馆日程模式引擎
 *
 * 不是战斗 RPG：没有生命值和打怪，核心是「按天安排日程」——
 * 每天分清晨 / 白天 / 黄昏 / 深夜四个时段，在地图上的不同地点安排互动、打工、购物、休息；
 * 互动消耗角色体力，体力靠休息恢复；目标和酒馆状态栏的好感 / 服从 / 兴奋 / 羞耻挂钩，由系统自动判定。
 *
 * 设计取自几个成熟的开源 AI RPG 项目：
 * - Waidrin：地点是结构化状态；每轮给出推荐行动，同时允许自由输入；
 * - SillyTavern RPG Companion：每轮把状态注入提示词，再从回复里解析变化；
 * - rpg-mcp / RealmAI：骰子、金钱这类数值由引擎决定，AI 只负责叙述，状态变化必须经过校验。
 *
 * 因此：移动、购物、打工、休息、检定都由本地引擎完成，结果写进用户消息，AI 照着叙述；
 * AI 在回复末尾输出 <!--RPG:{...}-->，引擎逐项校验后再应用，不合规的部分丢弃并记入日志。
 */

/** 检定用的是酒馆状态栏里角色的四项属性 */
export type RpgStatKey = 'favor' | 'obedience' | 'arousal' | 'shame';
export type RpgCharacterStats = Record<RpgStatKey, number>;

export type RpgLocationKind =
  | 'bedroom' | 'home' | 'bath' | 'playroom' | 'shop' | 'work' | 'cafe' | 'outdoor' | 'special';

/** 地点提供的系统服务：rest 休息到第二天、shop 按价目表购物、work 打工赚钱 */
export type RpgService = 'rest' | 'shop' | 'work';

export interface RpgShopItem {
  name: string;
  price: number;
  note: string;
}

export interface RpgLocation {
  id: string;
  name: string;
  kind: RpgLocationKind;
  description: string;
  x: number;
  y: number;
  discovered: boolean;
  visited: boolean;
  services: RpgService[];
  catalog: RpgShopItem[];
  /** 打工一个时段的收入 */
  pay: number;
}

export interface RpgItem {
  name: string;
  qty: number;
}

export type RpgQuestStatus = 'active' | 'done' | 'failed';

/** 目标：有 condition 的由系统按状态栏数值自动判定；没有的是 AI 给出的剧情任务 */
export interface RpgQuest {
  title: string;
  objective: string;
  status: RpgQuestStatus;
  condition?: { stat: RpgStatKey; op: 'gte' | 'lte'; value: number };
  reward?: number;
}

export interface RpgCheck {
  stat: RpgStatKey;
  dc: number;
}

export interface RpgChoice {
  text: string;
  check?: RpgCheck;
}

export interface RpgLogEntry {
  at: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'warn';
}

export interface RpgHardwareSettings {
  /** 检定失败时电击；默认关闭，强度另受全局安全上限约束 */
  punishOnFail: boolean;
  punishLevel: number;
  punishSeconds: number;
  /** 检定成功时短暂震动奖励；默认关闭 */
  rewardOnSuccess: boolean;
}

export interface RpgCore {
  version: 2;
  templateId: string;
  worldName: string;
  premise: string;
  locations: RpgLocation[];
  edges: Array<[string, string]>;
  currentId: string;
  homeId: string;
  gold: number;
  /** 角色体力 0-100 */
  stamina: number;
  inventory: RpgItem[];
  quests: RpgQuest[];
  day: number;
  /** 约定期限（天），0 表示不限 */
  dayLimit: number;
  /** 0 清晨 1 白天 2 黄昏 3 深夜 */
  period: number;
  choices: RpgChoice[];
  log: RpgLogEntry[];
  turn: number;
  hardware: RpgHardwareSettings;
}

export interface TavernRpgState extends RpgCore {
  /** 每条 AI 回复应用前的状态，用于重新生成时回滚（只保留最近几条） */
  snapshots: Array<{ messageId: string; core: RpgCore }>;
}

export interface RpgCheckResult {
  stat: RpgStatKey;
  dc: number;
  roll: number;
  mod: number;
  total: number;
  success: boolean;
  critical: 'success' | 'fail' | null;
}

export const RPG_STAT_LABELS: Record<RpgStatKey, string> = { favor: '好感', obedience: '服从', arousal: '兴奋', shame: '羞耻' };
export const RPG_PERIOD_LABELS = ['清晨', '白天', '黄昏', '深夜'];
export const RPG_KIND_META: Record<RpgLocationKind, { icon: string; label: string }> = {
  bedroom: { icon: '🛏️', label: '卧室' },
  home: { icon: '🏠', label: '居所' },
  bath: { icon: '🛁', label: '浴室' },
  playroom: { icon: '🗝️', label: '私密房间' },
  shop: { icon: '🛍️', label: '商店' },
  work: { icon: '💼', label: '打工' },
  cafe: { icon: '☕', label: '店铺' },
  outdoor: { icon: '🌳', label: '户外' },
  special: { icon: '✨', label: '特殊' },
};
export const RPG_SERVICE_LABELS: Record<RpgService, string> = { rest: '休息', shop: '购物', work: '打工' };

export const RPG_LOW_STAMINA = 25;
const MAX_LOCATIONS = 40;
const MAX_ITEMS = 30;
const MAX_ACTIVE_QUESTS = 10;
const MAX_LOG = 40;
const MAX_SNAPSHOTS = 6;
const MAX_DISCOVER_PER_TURN = 2;
const STORAGE_PREFIX = 'ycy_tavern_rpg_';
export const RPG_ENABLED_KEY = 'ycy_tavern_rpg_enabled';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const toInt = (value: unknown, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : fallback;
};
const cleanText = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const normalizeName = (value: string) => value.replace(/[\s·・()（）「」『』“”"'【】[\]]/g, '').toLowerCase();

/** 属性 50 为基准，每 10 点 ±1 */
export const statModifier = (value: number) => clamp(Math.round((value - 50) / 10), -5, 5);

const LOCATION_KINDS = Object.keys(RPG_KIND_META) as RpgLocationKind[];
const KIND_ALIASES: Record<string, RpgLocationKind> = {
  卧室: 'bedroom', 寝室: 'bedroom', 居所: 'home', 客厅: 'home', 房间: 'home', 家: 'home', 书房: 'home', 厨房: 'home',
  浴室: 'bath', 浴场: 'bath', 温泉: 'bath', 私密房间: 'playroom', 游戏室: 'playroom', 密室: 'playroom',
  商店: 'shop', 市场: 'shop', 集市: 'shop', 打工: 'work', 工作: 'work', 店铺: 'cafe', 咖啡馆: 'cafe', 餐厅: 'cafe', 酒馆: 'cafe',
  户外: 'outdoor', 公园: 'outdoor', 街道: 'outdoor', 花园: 'outdoor', 海边: 'outdoor', 特殊: 'special',
};
const normalizeKind = (value: unknown): RpgLocationKind => {
  if (typeof value !== 'string') return 'special';
  const key = value.trim().toLowerCase();
  if ((LOCATION_KINDS as string[]).includes(key)) return key as RpgLocationKind;
  return KIND_ALIASES[value.trim()] ?? 'special';
};

const STAT_ALIASES: Record<string, RpgStatKey> = {
  favor: 'favor', 好感: 'favor', obedience: 'obedience', 服从: 'obedience',
  arousal: 'arousal', 兴奋: 'arousal', 快感: 'arousal', shame: 'shame', 羞耻: 'shame',
};
const normalizeStat = (value: unknown): RpgStatKey | null => {
  if (typeof value !== 'string') return null;
  return STAT_ALIASES[value.trim().toLowerCase()] ?? STAT_ALIASES[value.trim()] ?? null;
};

const DIRECTIONS: Record<string, [number, number]> = {
  北: [0, -1], 南: [0, 1], 东: [1, 0], 西: [-1, 0], 东北: [1, -1], 西北: [-1, -1], 东南: [1, 1], 西南: [-1, 1],
  n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1],
  上: [0, -1], 下: [0, 1], 左: [-1, 0], 右: [1, 0],
};
const RING: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

// ─── 模板 ──────────────────────────────────────────────────────────────────────

interface TemplateLocation {
  key: string;
  name: string;
  kind: RpgLocationKind;
  x: number;
  y: number;
  description: string;
  services?: RpgService[];
  catalog?: RpgShopItem[];
  pay?: number;
}

export interface RpgTemplate {
  id: string;
  name: string;
  tagline: string;
  premise: string;
  home: string;
  dayLimit: number;
  gold: number;
  locations: TemplateLocation[];
  edges: Array<[string, string]>;
  quests: RpgQuest[];
  inventory: RpgItem[];
}

export const RPG_TEMPLATES: RpgTemplate[] = [
  {
    id: 'contract',
    name: '契约同居',
    tagline: '30 天约定 · 公寓 · 街区',
    premise: '{{user}}和{{char}}自愿签下了为期 30 天的主从契约，搬进同一间公寓。每天怎么安排、教些什么，由{{user}}决定；{{char}}可以随时喊停。',
    home: 'bedroom',
    dayLimit: 30,
    gold: 120,
    locations: [
      { key: 'bedroom', name: '卧室', kind: 'bedroom', x: 0, y: 0, services: ['rest'], description: '两人共用的卧室，床头放着那份契约。' },
      { key: 'living', name: '客厅', kind: 'home', x: 0, y: -1, description: '沙发、地毯和一台老电视，适合聊天和日常规矩练习。' },
      { key: 'bath', name: '浴室', kind: 'bath', x: 1, y: 0, description: '带浴缸的浴室，水汽氤氲。' },
      { key: 'kitchen', name: '厨房', kind: 'home', x: -1, y: -1, description: '小小的开放式厨房，适合一起做饭。' },
      { key: 'playroom', name: '游戏室', kind: 'playroom', x: 1, y: -1, description: '上锁的小房间，放着你们约定好的道具。' },
      { key: 'street', name: '街区', kind: 'outdoor', x: 0, y: -2, description: '公寓楼下热闹的街区。' },
      { key: 'store', name: '杂货店', kind: 'shop', x: -1, y: -2, services: ['shop'], description: '什么都卖一点的杂货店。', catalog: [
        { name: '甜点', price: 10, note: '小小的奖励' },
        { name: '丝带眼罩', price: 25, note: '游戏道具' },
        { name: '按摩油', price: 30, note: '放松用' },
        { name: '项圈', price: 45, note: '契约的信物' },
        { name: '新衣服', price: 80, note: '换个心情' },
      ] },
      { key: 'cafe', name: '街角咖啡馆', kind: 'cafe', x: 1, y: -2, services: ['work'], pay: 40, description: '缺人手的咖啡馆，可以去打工赚点钱，也适合约会。' },
      { key: 'park', name: '河畔公园', kind: 'outdoor', x: 0, y: -3, description: '傍晚有很多散步的人。' },
    ],
    edges: [['bedroom', 'living'], ['bedroom', 'bath'], ['living', 'kitchen'], ['living', 'playroom'], ['living', 'street'], ['street', 'store'], ['street', 'cafe'], ['street', 'park']],
    quests: [
      { title: '建立信任', objective: '让好感达到 50', status: 'active', condition: { stat: 'favor', op: 'gte', value: 50 }, reward: 60 },
      { title: '学会规矩', objective: '让服从达到 40', status: 'active', condition: { stat: 'obedience', op: 'gte', value: 40 }, reward: 60 },
      { title: '坦诚相待', objective: '让羞耻降到 25 以下', status: 'active', condition: { stat: 'shame', op: 'lte', value: 25 }, reward: 80 },
    ],
    inventory: [{ name: '契约书', qty: 1 }],
  },
  {
    id: 'manor',
    name: '庄园见习',
    tagline: '一个月教导期 · 庄园 · 小镇',
    premise: '{{char}}主动应聘，来到{{user}}的庄园做见习女仆/执事，双方约定一个月的教导期。礼仪、规矩和相处之道，都由{{user}}亲自安排。',
    home: 'master',
    dayLimit: 30,
    gold: 200,
    locations: [
      { key: 'master', name: '主卧', kind: 'bedroom', x: 0, y: 0, services: ['rest'], description: '宽敞的主卧，壁炉烧得正旺。' },
      { key: 'study', name: '书房', kind: 'home', x: -1, y: 0, description: '满墙的书，适合教导礼仪和读书。' },
      { key: 'hall', name: '大厅', kind: 'home', x: 0, y: -1, description: '庄园的门面，迎客和练习仪态的地方。' },
      { key: 'bath', name: '浴场', kind: 'bath', x: 1, y: 0, description: '引了温泉水的大浴场。' },
      { key: 'cellar', name: '酒窖', kind: 'playroom', x: 1, y: -1, description: '凉爽安静的地下酒窖，只有你有钥匙。' },
      { key: 'garden', name: '花园', kind: 'outdoor', x: -1, y: -1, description: '玫瑰盛开的花园，有一架秋千。' },
      { key: 'market', name: '小镇集市', kind: 'shop', x: 0, y: -2, services: ['shop'], description: '每天都开的集市。', catalog: [
        { name: '红茶', price: 10, note: '下午茶' },
        { name: '缎带', price: 20, note: '装饰与游戏' },
        { name: '香薰蜡烛', price: 35, note: '放松用' },
        { name: '银铃铛', price: 50, note: '随叫随到' },
        { name: '定制制服', price: 90, note: '正式的工作服' },
      ] },
      { key: 'inn', name: '镇上旅店', kind: 'work', x: 1, y: -2, services: ['work'], pay: 50, description: '旅店老板常请人帮忙算账。' },
    ],
    edges: [['master', 'study'], ['master', 'bath'], ['master', 'hall'], ['hall', 'cellar'], ['hall', 'garden'], ['hall', 'market'], ['market', 'inn']],
    quests: [
      { title: '赢得信任', objective: '让好感达到 50', status: 'active', condition: { stat: 'favor', op: 'gte', value: 50 }, reward: 80 },
      { title: '礼仪合格', objective: '让服从达到 50', status: 'active', condition: { stat: 'obedience', op: 'gte', value: 50 }, reward: 100 },
    ],
    inventory: [{ name: '庄园钥匙', qty: 1 }],
  },
];

export const RPG_CUSTOM_TEMPLATE_ID = 'custom';

const expandNames = (text: string, names: { char: string; user: string }) =>
  text.replace(/\{\{char\}\}/g, names.char || '角色').replace(/\{\{user\}\}/g, names.user || '你');

const defaultHardware = (): RpgHardwareSettings => ({ punishOnFail: false, punishLevel: 15, punishSeconds: 2, rewardOnSuccess: false });

const makeLocation = (id: string, loc: Omit<TemplateLocation, 'key'>): RpgLocation => ({
  id,
  name: loc.name,
  kind: loc.kind,
  description: loc.description,
  x: loc.x,
  y: loc.y,
  discovered: false,
  visited: false,
  services: loc.services ? [...loc.services] : [],
  catalog: loc.catalog ? loc.catalog.map((item) => ({ ...item })) : [],
  pay: loc.pay ?? 0,
});

/** 新开一局。自定义模式只有住处一个地点，其余靠 AI 边走边生成 */
export const createRpgState = (
  templateId: string,
  names: { char: string; user: string },
  custom?: { worldName?: string; premise?: string; startName?: string; dayLimit?: number },
): TavernRpgState => {
  const template = RPG_TEMPLATES.find((item) => item.id === templateId);
  const base = {
    version: 2 as const,
    stamina: 100,
    day: 1,
    period: 0,
    choices: [] as RpgChoice[],
    turn: 0,
    hardware: defaultHardware(),
    snapshots: [] as TavernRpgState['snapshots'],
  };
  if (!template) {
    const homeId = newId('loc');
    const homeName = cleanText(custom?.startName, 12) || '住处';
    return {
      ...base,
      templateId: RPG_CUSTOM_TEMPLATE_ID,
      worldName: cleanText(custom?.worldName, 16) || '我们的日常',
      premise: cleanText(custom?.premise, 400) || `${names.user || '你'}和${names.char || '角色'}开始了一段新的日常。`,
      locations: [{ ...makeLocation(homeId, { name: homeName, kind: 'bedroom', x: 0, y: 0, description: '一切开始的地方，可以在这里休息。', services: ['rest'] }), discovered: true, visited: true }],
      edges: [],
      currentId: homeId,
      homeId,
      gold: 100,
      inventory: [],
      quests: [],
      dayLimit: clamp(toInt(custom?.dayLimit, 0), 0, 365),
      log: [{ at: Date.now(), text: `开始：${homeName}`, tone: 'info' }],
    };
  }

  const idByKey = new Map(template.locations.map((loc) => [loc.key, `${template.id}_${loc.key}`]));
  const homeId = idByKey.get(template.home)!;
  const state: TavernRpgState = {
    ...base,
    templateId: template.id,
    worldName: template.name,
    premise: expandNames(template.premise, names),
    locations: template.locations.map((loc) => makeLocation(idByKey.get(loc.key)!, loc)),
    edges: template.edges.map(([a, b]) => [idByKey.get(a)!, idByKey.get(b)!] as [string, string]),
    currentId: homeId,
    homeId,
    gold: template.gold,
    inventory: template.inventory.map((item) => ({ ...item })),
    quests: template.quests.map((quest) => ({ ...quest, condition: quest.condition ? { ...quest.condition } : undefined })),
    dayLimit: template.dayLimit,
    log: [{ at: Date.now(), text: `开始：${template.name}`, tone: 'info' }],
  };
  return revealAround(state, homeId);
};

// ─── 地图 ──────────────────────────────────────────────────────────────────────

export const getLocation = (state: RpgCore, id: string) => state.locations.find((loc) => loc.id === id) ?? null;

export const getNeighborIds = (state: RpgCore, id: string) =>
  state.edges.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));

/** 当前位置可以直接前往的地点（已发现的相邻地点） */
export const getReachableLocations = (state: RpgCore) =>
  getNeighborIds(state, state.currentId)
    .map((id) => getLocation(state, id))
    .filter((loc): loc is RpgLocation => Boolean(loc?.discovered));

/** 到过的地点 + 与之相邻的地点可见 */
const revealAround = <T extends RpgCore>(state: T, id: string): T => {
  const visible = new Set([id, ...getNeighborIds(state, id)]);
  return {
    ...state,
    locations: state.locations.map((loc) => (visible.has(loc.id)
      ? { ...loc, discovered: true, visited: loc.visited || loc.id === id }
      : loc)),
  };
};

const findLocationByName = (state: RpgCore, name: string) => {
  const target = normalizeName(name);
  if (!target) return null;
  return state.locations.find((loc) => normalizeName(loc.name) === target) ?? null;
};

const isOccupied = (state: RpgCore, x: number, y: number) => state.locations.some((loc) => loc.x === x && loc.y === y);

const placeNear = (state: RpgCore, origin: RpgLocation, direction: string): [number, number] => {
  const preferred = DIRECTIONS[direction.trim().toLowerCase()] ?? DIRECTIONS[direction.trim()];
  const order = preferred ? [preferred, ...RING.filter(([dx, dy]) => dx !== preferred[0] || dy !== preferred[1])] : RING;
  for (let radius = 1; radius <= 4; radius += 1) {
    for (const [dx, dy] of order) {
      const x = origin.x + dx * radius;
      const y = origin.y + dy * radius;
      if (!isOccupied(state, x, y)) return [x, y];
    }
  }
  return [origin.x + state.locations.length, origin.y];
};

export const appendRpgLog = <T extends RpgCore>(state: T, text: string, tone: RpgLogEntry['tone']): T => ({
  ...state,
  log: [...state.log, { at: Date.now(), text, tone }].slice(-MAX_LOG),
});

// ─── 系统动作：移动 / 购物 / 打工 / 休息 / 使用物品 ──────────────────────────────

export type RpgActionResult = { state: TavernRpgState; message?: string; error?: string };

/** 点地图移动：只能去相邻且已发现的地点，不耗时段 */
export const travelTo = (state: TavernRpgState, locationId: string): RpgActionResult => {
  const target = getLocation(state, locationId);
  if (!target || !target.discovered) return { state, error: '这个地点还没被发现。' };
  if (target.id === state.currentId) return { state, error: '已经在这里了。' };
  if (!getNeighborIds(state, state.currentId).includes(target.id)) return { state, error: `从这里去不了${target.name}，需要先经过相邻的地点。` };
  const moved = revealAround({ ...state, currentId: target.id }, target.id);
  return { state: appendRpgLog(moved, `前往 ${target.name}`, 'info'), message: `🧭 前往：${target.name}` };
};

export const buyItem = (state: TavernRpgState, itemName: string): RpgActionResult => {
  const here = getLocation(state, state.currentId);
  const item = here?.services.includes('shop') ? here.catalog.find((entry) => entry.name === itemName) : null;
  if (!item) return { state, error: '这里买不到这个。' };
  if (state.gold < item.price) return { state, error: `金币不够（需要 ${item.price}，只有 ${state.gold}）。` };
  const inventory = state.inventory.map((entry) => ({ ...entry }));
  const own = inventory.find((entry) => entry.name === item.name);
  if (own) own.qty = clamp(own.qty + 1, 1, 99);
  else if (inventory.length < MAX_ITEMS) inventory.push({ name: item.name, qty: 1 });
  else return { state, error: '背包满了。' };
  const next = appendRpgLog({ ...state, gold: state.gold - item.price, inventory }, `买了 ${item.name}（-${item.price}）`, 'info');
  return { state: next, message: `🧭 购买：${item.name}（花了 ${item.price} 金币）` };
};

/** 打工：耗掉一个时段换金币 */
export const doWork = (state: TavernRpgState): RpgActionResult => {
  const here = getLocation(state, state.currentId);
  if (!here?.services.includes('work') || here.pay <= 0) return { state, error: '这里没有活可以干。' };
  if (state.period >= 3) return { state, error: '太晚了，店已经关门。' };
  const next = appendRpgLog({ ...state, gold: state.gold + here.pay, period: state.period + 1 }, `在${here.name}打工（+${here.pay}）`, 'good');
  return { state: next, message: `🧭 打工：在${here.name}忙了一个时段，赚了 ${here.pay} 金币，现在是${RPG_PERIOD_LABELS[next.period]}` };
};

/** 休息：结束当天，第二天清晨体力回满 */
export const restUntilMorning = (state: TavernRpgState): RpgActionResult => {
  const here = getLocation(state, state.currentId);
  if (!here?.services.includes('rest')) return { state, error: '这里没法休息，回到卧室再睡吧。' };
  const finished = state.day;
  const next = appendRpgLog({ ...state, day: state.day + 1, period: 0, stamina: 100, choices: [] }, `第 ${finished} 天结束`, 'info');
  return { state: next, message: `🧭 休息：第 ${finished} 天结束，第 ${next.day} 天清晨，体力已恢复` };
};

export const itemUseAction = (state: TavernRpgState, itemName: string): RpgActionResult => {
  const own = state.inventory.find((entry) => entry.name === itemName);
  if (!own) return { state, error: '背包里没有这个。' };
  return { state, message: `🧭 使用：${own.name}` };
};

// ─── 检定 ──────────────────────────────────────────────────────────────────────

/** 体力过低时所有检定 -2 */
export const checkModifier = (state: RpgCore, stats: RpgCharacterStats, stat: RpgStatKey) =>
  statModifier(stats[stat] ?? 50) - (state.stamina < RPG_LOW_STAMINA ? 2 : 0);

export const rollCheck = (state: RpgCore, stats: RpgCharacterStats, check: RpgCheck, random: () => number = Math.random): RpgCheckResult => {
  const roll = clamp(Math.floor(random() * 20) + 1, 1, 20);
  const mod = checkModifier(state, stats, check.stat);
  const total = roll + mod;
  const critical = roll === 20 ? 'success' : roll === 1 ? 'fail' : null;
  const success = critical === 'success' ? true : critical === 'fail' ? false : total >= check.dc;
  return { stat: check.stat, dc: check.dc, roll, mod, total, success, critical };
};

export const formatCheckResult = (result: RpgCheckResult) => {
  const modText = result.mod === 0 ? '' : result.mod > 0 ? ` +${result.mod}` : ` ${result.mod}`;
  const verdict = result.critical === 'success' ? '大成功' : result.critical === 'fail' ? '大失败' : result.success ? '成功' : '失败';
  return `🎲 ${RPG_STAT_LABELS[result.stat]}检定：d20=${result.roll}${modText} = ${result.total} / 难度 ${result.dc} · ${verdict}`;
};

// ─── 目标 ──────────────────────────────────────────────────────────────────────

const meetsCondition = (condition: NonNullable<RpgQuest['condition']>, stats: RpgCharacterStats) => {
  const value = stats[condition.stat];
  return condition.op === 'gte' ? value >= condition.value : value <= condition.value;
};

/** 按状态栏数值判定目标，完成的发放奖励 */
export const evaluateGoals = (state: TavernRpgState, stats: RpgCharacterStats): { state: TavernRpgState; completed: RpgQuest[] } => {
  const completed: RpgQuest[] = [];
  const quests = state.quests.map((quest) => {
    if (quest.status !== 'active' || !quest.condition || !meetsCondition(quest.condition, stats)) return quest;
    const done = { ...quest, status: 'done' as const };
    completed.push(done);
    return done;
  });
  if (!completed.length) return { state, completed };
  let next: TavernRpgState = { ...state, quests, gold: state.gold + completed.reduce((sum, quest) => sum + (quest.reward ?? 0), 0) };
  for (const quest of completed) next = appendRpgLog(next, `目标达成：${quest.title}${quest.reward ? `（+${quest.reward} 金币）` : ''}`, 'good');
  return { state: next, completed };
};

// ─── 提示词 ────────────────────────────────────────────────────────────────────

export const buildRpgPrompt = (state: RpgCore, names: { char: string; user: string }) => {
  const user = names.user || '玩家';
  const char = names.char || '角色';
  const current = getLocation(state, state.currentId);
  const reachable = getReachableLocations(state);
  const activeQuests = state.quests.filter((quest) => quest.status === 'active');
  const inventory = state.inventory.map((item) => (item.qty > 1 ? `${item.name}×${item.qty}` : item.name)).join('、') || '空';
  const dayText = state.dayLimit ? `第 ${state.day} 天（共 ${state.dayLimit} 天）` : `第 ${state.day} 天`;
  const services = current?.services.length ? `（可${current.services.map((service) => RPG_SERVICE_LABELS[service]).join('、')}）` : '';

  const lines = [
    '【日程模式 · 当前状态（由系统维护，以此为准）】',
    `设定：${state.worldName} —— ${state.premise}`,
    `时间：${dayText} · ${RPG_PERIOD_LABELS[state.period] ?? '清晨'}`,
    current ? `所在地点：${current.name}${services} —— ${current.description}` : '',
    `相邻可去：${reachable.map((loc) => loc.name).join('、') || '（暂无，可在剧情中发现新地点）'}`,
    `${char}的体力：${state.stamina}/100${state.stamina < RPG_LOW_STAMINA ? '（已经很累了，应当休息，不适合继续高强度互动）' : ''}`,
    `${user}的金币：${state.gold}　背包：${inventory}`,
    `目标：${activeQuests.length ? activeQuests.map((quest) => `${quest.title}（${quest.objective}）`).join('；') : '暂无'}`,
    state.dayLimit && state.day > state.dayLimit ? `约定的 ${state.dayLimit} 天已经结束，可以回顾这段日子，或者商量是否续约。` : '',
  ].filter(Boolean);

  const rules = `【日程规则】
1. 这是按天经营的日常，不是战斗冒险。你继续扮演${char}，同时负责描写地点、时间和事件；根据所在地点和时段安排合适的互动，不要替${user}做决定。
2. 用户消息以「🧭」开头的是系统已经完成的动作（前往、购物、打工、休息、使用物品、开始），请直接描写结果；「🎲 检定」是系统掷骰的结果，必须按成败如实描写${char}的反应，不得改写。
3. 只能移动到「相邻可去」的地点。互动会消耗${char}的体力：轻松的聊天 0-5，日常练习 5-15，强度较高的互动 15-30；洗澡、吃东西、小憩可少量恢复。一次互动通常推进一个时段。
4. 尊重${char}的意愿和体力：体力低或者明确拒绝时要停下来照顾对方。
5. 每轮回复末尾（在 STATUS 标签之前）输出一条隐藏标签，只写本轮有变化的字段，choices 必填：
<!--RPG:{"stamina":"-10","gold":"+0","time":"+1","move":"地点名","discover":[{"name":"新地点","kind":"outdoor","dir":"北","desc":"一句话描述"}],"items":{"add":[{"name":"物品","qty":1}],"remove":["用掉的物品"]},"quests":[{"title":"剧情任务","objective":"当前目标","status":"active"}],"choices":[{"text":"推荐互动一"},{"text":"需要检定的互动","check":"obedience:12"},{"text":"推荐互动三"}]}-->
字段说明：stamina/gold 为增减量；time "+1" 表示推进一个时段；move 只在剧情中两人确实走到相邻地点时填写；kind 取 bedroom/home/bath/playroom/shop/work/cafe/outdoor/special；quests 的 status 取 active/done/failed；choices 给 3 个适合当前地点和时段的简短互动（每个不超过 20 字），需要看${char}是否愿意配合的写 check（favor/obedience/arousal/shame + 难度 8-20）。`;

  return `${lines.join('\n')}\n\n${rules}`;
};

// ─── 解析 ──────────────────────────────────────────────────────────────────────

export interface RpgUpdate {
  stamina?: number;
  gold?: number;
  move?: string;
  discover: Array<{ name: string; kind: RpgLocationKind; dir: string; desc: string; from: string | undefined }>;
  itemsAdd: RpgItem[];
  itemsRemove: RpgItem[];
  quests: RpgQuest[];
  time: number;
  choices: RpgChoice[];
}

const RPG_TAG_REGEX = /<!--\s*RPG\s*:?\s*(\{[\s\S]*?\})\s*-->/i;
const RPG_BLOCK_REGEX = /<!--\s*RPG\b[\s\S]*?-->/gi;
const RPG_UNCLOSED_REGEX = /<!--\s*RPG\b[\s\S]*$/i;
const RPG_ALT_BLOCK_REGEX = /<\s*RPG\s*>[\s\S]*?<\/\s*RPG\s*>/gi;
/** 流式输出时，尾部刚开始出现的 "<!-"、"<!--R" 之类碎片 */
const STREAMING_PARTIAL_COMMENT = /<!?-{0,2}\s*(?:R(?:P(?:G)?)?)?$/i;

/** 去掉回复里的日程标签（含流式中未闭合的部分） */
export const stripRpgTags = (text: string, isStreaming = false) => {
  if (!text) return '';
  let result = text.replace(RPG_BLOCK_REGEX, '').replace(RPG_ALT_BLOCK_REGEX, '').replace(RPG_UNCLOSED_REGEX, '');
  if (isStreaming) result = result.replace(STREAMING_PARTIAL_COMMENT, '');
  return result;
};

const parseDelta = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(typeof value === 'string' ? value.replace(/\s+/g, '') : value);
  return Number.isFinite(num) ? Math.round(num) : undefined;
};

const parseCheck = (value: unknown): RpgCheck | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const match = value.match(/([a-zA-Z一-龥]+)\s*[:：\s]\s*(\d{1,2})/);
    if (!match) return undefined;
    const stat = normalizeStat(match[1]);
    return stat ? { stat, dc: clamp(Number(match[2]), 5, 25) } : undefined;
  }
  if (typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    const stat = normalizeStat(raw.stat ?? raw.attr);
    const dc = toInt(raw.dc ?? raw.difficulty, NaN);
    return stat && Number.isFinite(dc) ? { stat, dc: clamp(dc, 5, 25) } : undefined;
  }
  return undefined;
};

const parseItem = (value: unknown): RpgItem | null => {
  if (typeof value === 'string') {
    const match = value.trim().match(/^(.+?)\s*[x×*]\s*(\d+)$/i);
    const name = cleanText(match ? match[1] : value, 16);
    return name ? { name, qty: match ? clamp(Number(match[2]), 1, 99) : 1 } : null;
  }
  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    const name = cleanText(raw.name, 16);
    return name ? { name, qty: clamp(toInt(raw.qty ?? raw.count ?? 1, 1), 1, 99) } : null;
  }
  return null;
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

/** 宽松地解析 JSON：容忍 +5 这种数值、单引号和尾逗号 */
const parseLooseJson = (payload: string): Record<string, unknown> | null => {
  const attempts = [
    payload,
    payload
      .replace(/:\s*\+(\d)/g, ':$1')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/'/g, '"'),
  ];
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // try next
    }
  }
  return null;
};

export const parseRpgUpdate = (rawReply: string): RpgUpdate | null => {
  if (!rawReply) return null;
  let payload = rawReply.match(RPG_TAG_REGEX)?.[1] ?? null;
  if (!payload) payload = rawReply.match(/<\s*RPG\s*>\s*(\{[\s\S]*?\})\s*<\/\s*RPG\s*>/i)?.[1] ?? null;
  // 输出被截断、没写 -->：取标签后的花括号
  if (!payload) payload = rawReply.match(/<!--\s*RPG\s*:?\s*(\{[\s\S]*\})/i)?.[1] ?? null;
  if (!payload) return null;
  const raw = parseLooseJson(payload);
  if (!raw) return null;

  const items = (raw.items && typeof raw.items === 'object' ? raw.items : {}) as Record<string, unknown>;
  const choices = asArray(raw.choices).map((choice): RpgChoice | null => {
    if (typeof choice === 'string') {
      const [text, check] = choice.split('|');
      const cleaned = cleanText(text, 30);
      return cleaned ? { text: cleaned, check: parseCheck(check) } : null;
    }
    if (choice && typeof choice === 'object') {
      const record = choice as Record<string, unknown>;
      const text = cleanText(record.text ?? record.action, 30);
      return text ? { text, check: parseCheck(record.check ?? (record.stat ? record : undefined)) } : null;
    }
    return null;
  }).filter((choice): choice is RpgChoice => Boolean(choice)).slice(0, 4);

  return {
    stamina: parseDelta(raw.stamina),
    gold: parseDelta(raw.gold),
    move: cleanText(raw.move, 16) || undefined,
    discover: asArray(raw.discover).map((entry): RpgUpdate['discover'][number] | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const name = cleanText(record.name, 12);
      if (!name) return null;
      return {
        name,
        kind: normalizeKind(record.kind),
        dir: cleanText(record.dir ?? record.direction, 4),
        desc: cleanText(record.desc ?? record.description, 60),
        from: cleanText(record.from, 12) || undefined,
      };
    }).filter((entry): entry is RpgUpdate['discover'][number] => Boolean(entry)),
    itemsAdd: asArray(items.add).map(parseItem).filter((item): item is RpgItem => Boolean(item)),
    itemsRemove: asArray(items.remove).map(parseItem).filter((item): item is RpgItem => Boolean(item)),
    quests: asArray(raw.quests).map((entry): RpgQuest | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const title = cleanText(record.title ?? record.name, 20);
      if (!title) return null;
      const status = record.status === 'done' || record.status === 'failed' ? record.status : 'active';
      return { title, objective: cleanText(record.objective ?? record.goal, 60), status };
    }).filter((quest): quest is RpgQuest => Boolean(quest)),
    time: clamp(parseDelta(raw.time) ?? 0, 0, 3),
    choices,
  };
};

// ─── 应用 ──────────────────────────────────────────────────────────────────────

export interface RpgApplyResult {
  state: TavernRpgState;
  notes: RpgLogEntry[];
}

const stripSnapshots = (state: TavernRpgState): RpgCore => {
  const { snapshots: _snapshots, ...core } = state;
  return core;
};

/** 记录应用这条回复之前的状态，重新生成时可以回滚 */
export const rememberSnapshot = (state: TavernRpgState, messageId: string): TavernRpgState => ({
  ...state,
  snapshots: [...state.snapshots.filter((item) => item.messageId !== messageId), { messageId, core: stripSnapshots(state) }].slice(-MAX_SNAPSHOTS),
});

export const restoreSnapshot = (state: TavernRpgState, messageId: string): TavernRpgState | null => {
  const snapshot = state.snapshots.find((item) => item.messageId === messageId);
  if (!snapshot) return null;
  return { ...snapshot.core, snapshots: state.snapshots.filter((item) => item.messageId !== messageId) };
};

/**
 * 校验并应用 AI 给出的状态变化。单轮变化有上限，防止模型一句话耗光体力或凭空暴富；
 * 金币只允许 AI 小额增减（小费、零食），大额收支走系统的购物和打工。
 */
export const applyRpgUpdate = (input: TavernRpgState, update: RpgUpdate | null): RpgApplyResult => {
  let state: TavernRpgState = { ...input, turn: input.turn + 1 };
  const notes: RpgLogEntry[] = [];
  const note = (text: string, tone: RpgLogEntry['tone']) => notes.push({ at: Date.now(), text, tone });

  if (!update) return { state: { ...state, choices: [] }, notes };

  // 1. 新地点：挂在当前位置（或指定的已知地点）旁边
  let discovered = 0;
  for (const entry of update.discover) {
    if (discovered >= MAX_DISCOVER_PER_TURN) break;
    const origin = (entry.from && findLocationByName(state, entry.from)) || getLocation(state, state.currentId);
    if (!origin || !origin.discovered) continue;
    const existing = findLocationByName(state, entry.name);
    if (existing) {
      const linked = state.edges.some(([a, b]) => (a === origin.id && b === existing.id) || (b === origin.id && a === existing.id));
      if (!linked && existing.id !== origin.id) state = { ...state, edges: [...state.edges, [origin.id, existing.id]] };
      if (!existing.discovered) {
        state = { ...state, locations: state.locations.map((loc) => (loc.id === existing.id ? { ...loc, discovered: true } : loc)) };
        note(`发现地点：${existing.name}`, 'info');
      }
      continue;
    }
    if (state.locations.length >= MAX_LOCATIONS) {
      note('地图已经很大了，新地点未加入', 'warn');
      break;
    }
    const [x, y] = placeNear(state, origin, entry.dir);
    const location: RpgLocation = {
      ...makeLocation(newId('loc'), { name: entry.name, kind: entry.kind, description: entry.desc || '还没去过的地方。', x, y }),
      discovered: true,
    };
    state = { ...state, locations: [...state.locations, location], edges: [...state.edges, [origin.id, location.id]] };
    discovered += 1;
    note(`发现新地点：${location.name}`, 'info');
  }

  // 2. 移动：只接受相邻地点
  if (update.move) {
    const target = findLocationByName(state, update.move);
    if (target && target.id !== state.currentId) {
      if (getNeighborIds(state, state.currentId).includes(target.id)) {
        state = revealAround({ ...state, currentId: target.id }, target.id);
        note(`来到 ${target.name}`, 'info');
      } else {
        note(`忽略了不相邻的移动：${target.name}`, 'warn');
      }
    }
  }

  // 3. 体力与金币
  if (update.stamina !== undefined && update.stamina !== 0) {
    const before = state.stamina;
    state = { ...state, stamina: clamp(before + clamp(update.stamina, -40, 60), 0, 100) };
    if (state.stamina !== before) note(`体力 ${state.stamina > before ? '+' : ''}${state.stamina - before}`, state.stamina > before ? 'good' : 'info');
  }
  if (update.gold !== undefined && update.gold !== 0) {
    const delta = clamp(update.gold, -100, 100);
    if (delta < 0 && state.gold + delta < 0) {
      note(`金币不足（需要 ${-delta}，只有 ${state.gold}）`, 'warn');
    } else {
      state = { ...state, gold: state.gold + delta };
      note(`金币 ${delta > 0 ? '+' : ''}${delta}`, delta > 0 ? 'good' : 'info');
    }
  }

  // 4. 物品：消耗只针对背包里真有的东西
  let inventory = state.inventory.map((item) => ({ ...item }));
  for (const item of update.itemsRemove) {
    const index = inventory.findIndex((own) => normalizeName(own.name) === normalizeName(item.name));
    if (index < 0) {
      note(`背包里没有「${item.name}」，忽略消耗`, 'warn');
      continue;
    }
    inventory[index].qty -= item.qty;
    note(`用掉 ${item.name}${item.qty > 1 ? `×${item.qty}` : ''}`, 'info');
    if (inventory[index].qty <= 0) inventory = inventory.filter((_, i) => i !== index);
  }
  for (const item of update.itemsAdd) {
    const own = inventory.find((entry) => normalizeName(entry.name) === normalizeName(item.name));
    if (own) {
      own.qty = clamp(own.qty + item.qty, 1, 99);
    } else if (inventory.length < MAX_ITEMS) {
      inventory.push({ ...item });
    } else {
      note(`背包满了，放不下「${item.name}」`, 'warn');
      continue;
    }
    note(`获得 ${item.name}${item.qty > 1 ? `×${item.qty}` : ''}`, 'good');
  }
  state = { ...state, inventory };

  // 5. 剧情任务（系统判定的目标不接受 AI 改动）
  let quests = state.quests.map((quest) => ({ ...quest }));
  for (const quest of update.quests) {
    const own = quests.find((entry) => normalizeName(entry.title) === normalizeName(quest.title));
    if (own) {
      if (own.status !== 'active' || own.condition) continue;
      if (quest.objective) own.objective = quest.objective;
      if (quest.status !== 'active') {
        own.status = quest.status;
        note(`任务${quest.status === 'done' ? '完成' : '失败'}：${own.title}`, quest.status === 'done' ? 'good' : 'bad');
      }
    } else if (quest.status === 'active') {
      if (quests.filter((entry) => entry.status === 'active').length >= MAX_ACTIVE_QUESTS) continue;
      quests.push(quest);
      note(`新任务：${quest.title}`, 'info');
    }
  }
  quests = [...quests.filter((quest) => quest.status === 'active'), ...quests.filter((quest) => quest.status !== 'active').slice(-12)];
  state = { ...state, quests };

  // 6. 时间：最多推进到深夜，跨天要回卧室休息
  if (update.time > 0) state = { ...state, period: Math.min(3, state.period + update.time) };

  state = { ...state, choices: update.choices };
  for (const entry of notes) state = appendRpgLog(state, entry.text, entry.tone);
  return { state, notes };
};

// ─── 存储 ──────────────────────────────────────────────────────────────────────

const normalizeHardware = (value: unknown): RpgHardwareSettings => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    punishOnFail: raw.punishOnFail === true,
    punishLevel: clamp(toInt(raw.punishLevel, 15), 1, 200),
    punishSeconds: clamp(toInt(raw.punishSeconds, 2), 1, 5),
    rewardOnSuccess: raw.rewardOnSuccess === true,
  };
};

export const normalizeRpgState = (value: unknown): TavernRpgState | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as TavernRpgState;
  if (raw.version !== 2 || !Array.isArray(raw.locations) || !raw.locations.length) return null;
  const ids = new Set(raw.locations.map((loc) => loc.id));
  const currentId = ids.has(raw.currentId) ? raw.currentId : raw.locations[0].id;
  return {
    ...raw,
    currentId,
    homeId: ids.has(raw.homeId) ? raw.homeId : currentId,
    locations: raw.locations.map((loc) => ({ ...loc, services: Array.isArray(loc.services) ? loc.services : [], catalog: Array.isArray(loc.catalog) ? loc.catalog : [], pay: toInt(loc.pay, 0) })),
    edges: (raw.edges || []).filter(([a, b]) => ids.has(a) && ids.has(b)),
    gold: Math.max(0, toInt(raw.gold, 0)),
    stamina: clamp(toInt(raw.stamina, 100), 0, 100),
    period: clamp(toInt(raw.period, 0), 0, 3),
    day: Math.max(1, toInt(raw.day, 1)),
    dayLimit: clamp(toInt(raw.dayLimit, 0), 0, 365),
    inventory: Array.isArray(raw.inventory) ? raw.inventory : [],
    quests: Array.isArray(raw.quests) ? raw.quests : [],
    choices: Array.isArray(raw.choices) ? raw.choices : [],
    log: Array.isArray(raw.log) ? raw.log.slice(-MAX_LOG) : [],
    snapshots: Array.isArray(raw.snapshots) ? raw.snapshots.slice(-MAX_SNAPSHOTS) : [],
    hardware: normalizeHardware(raw.hardware),
  };
};

export const loadRpgState = (cardId: string): TavernRpgState | null => {
  if (!cardId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${cardId}`);
    return raw ? normalizeRpgState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

export const saveRpgState = (cardId: string, state: TavernRpgState | null) => {
  if (!cardId) return;
  try {
    if (state) localStorage.setItem(`${STORAGE_PREFIX}${cardId}`, JSON.stringify(state));
    else localStorage.removeItem(`${STORAGE_PREFIX}${cardId}`);
  } catch (error) {
    console.error('Failed to save RPG state:', error);
  }
};

/** 日程模式总开关（酒馆设置里），默认关闭 */
export const isRpgModeEnabled = () => {
  try {
    return localStorage.getItem(RPG_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setRpgModeEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(RPG_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
};
