/**
 * 训练日程的内容数据：课程、特质、阶段、结局、模板。
 *
 * 结构参考：
 * - era 系列（Emuera/ERB）：训练指令（COM）按能力等级（ABL）解锁，能力随训练积累；素质（TALENT）在条件满足时获得；
 * - Free Cities：家规（rules）+ 每周报告；
 * - 美少女梦工场类养成：按天排日程，期满按属性给结局。
 */

import { computeDetailedEnding, type RpgEndingContext } from './tavernRpgEndings';

export * from './tavernRpgWeather';
export * from './tavernRpgEndings';
export * from './tavernRpgChains';

export type RpgStatKey = 'obedience' | 'endurance' | 'shame' | 'devotion';
export type RpgTraineeStats = Record<RpgStatKey, number>;

export type RpgGameMode = 'normal' | 'hardcore' | 'reversal';
export type RpgEndingRank = 'S' | 'A' | 'B' | 'C';

export interface RpgCheck {
  stat: RpgStatKey;
  dc: number;
}

export interface RpgChoice {
  text: string;
  check?: RpgCheck;
}

export interface RpgEnding {
  id?: string;
  day: number;
  title: string;
  summary: string;
  rank?: RpgEndingRank;
  quote?: string;
}

export type RpgLocationKind =
  | 'bedroom' | 'home' | 'bath' | 'playroom' | 'shop' | 'work' | 'cafe' | 'outdoor' | 'special';

export type RpgService = 'rest' | 'shop' | 'work';

export interface RpgItemEffect {
  /** 使用后恢复体力 */
  stamina?: number;
  /** 使用后减少压力 */
  stress?: number;
  /** 免罚：下一次检定失败时自动消耗，免除这次的硬件惩罚 */
  pardon?: boolean;
  /** 一次性：使用后从背包里扣掉（没有数值效果的券类物品） */
  consumable?: boolean;
}

export interface RpgShopItem {
  name: string;
  price: number;
  note: string;
  effect?: RpgItemEffect;
}

export const STAT_KEYS: RpgStatKey[] = ['obedience', 'endurance', 'shame', 'devotion'];
export const RPG_STAT_LABELS: Record<RpgStatKey, string> = { obedience: '服从', endurance: '耐受', shame: '羞耻', devotion: '依恋' };
/** 检定时的叫法：羞耻检定指「克服羞耻」，羞耻越低越容易成功 */
export const RPG_CHECK_LABELS: Record<RpgStatKey, string> = { obedience: '服从', endurance: '耐受', shame: '克服羞耻', devotion: '依恋' };
export const RPG_STAT_HINTS: Record<RpgStatKey, string> = {
  obedience: '听从指令的程度',
  endurance: '能坚持多久、承受多少',
  shame: '越低越放得开',
  devotion: '对调教者的信赖',
};
export const DEFAULT_TRAINEE: RpgTraineeStats = { obedience: 10, endurance: 10, shame: 70, devotion: 10 };

/** 等级按「有效值」算：羞耻反过来，越低越高 */
export const effectiveStat = (stat: RpgStatKey, value: number) => (stat === 'shame' ? 100 - value : value);
export const LEVEL_NAMES = ['生疏', '入门', '熟练', '精通', '娴熟', '极致'];
export const statLevel = (stat: RpgStatKey, value: number) => Math.max(0, Math.min(5, Math.floor(effectiveStat(stat, value) / 20)));

/** 整体训练阶段：四项有效值的平均 */
export const STAGES = [
  { min: 0, name: '初来乍到', hint: '还在适应，规矩和距离感都很生疏' },
  { min: 20, name: '学习规矩', hint: '开始记住规矩，偶尔会犯错' },
  { min: 40, name: '渐入佳境', hint: '能跟上大部分课程，对调教者有了信任' },
  { min: 60, name: '驯服听话', hint: '指令一下就能照做，很少需要提醒' },
  { min: 80, name: '完全托付', hint: '把自己完全交给调教者' },
];
export const stageIndex = (stats: RpgTraineeStats) => {
  const average = STAT_KEYS.reduce((sum, key) => sum + effectiveStat(key, stats[key]), 0) / STAT_KEYS.length;
  let index = 0;
  STAGES.forEach((stage, i) => { if (average >= stage.min) index = i; });
  return index;
};

// ─── 课程（era 的训练指令）──────────────────────────────────────────────────────

export interface RpgSensorChallenge {
  type: 'pressure' | 'heart_rate';
  targetValue: number;
  durationSeconds: number;
  label: string;
  instruction: string;
}

export interface RpgCourse {
  id: string;
  name: string;
  description: string;
  /** 可以进行的地点类型 */
  kinds: RpgLocationKind[];
  /** 检定属性与难度；没有检定的是放松类课程 */
  check?: { stat: RpgStatKey; dc: number };
  /** 体力消耗（负数表示恢复） */
  stamina: number;
  /** 压力变化 */
  stress: number;
  /** 成功（或无检定时）的属性变化 */
  gain: Partial<RpgTraineeStats>;
  points: number;
  /** 解锁条件：某项能力达到等级 */
  unlock?: { stat: RpgStatKey; level: number };
  /** 放松类：压力过高时仍然可以进行 */
  relief?: boolean;
  /** 具身硬件挑战：结合外设传感器或屏幕触控模拟 */
  sensorChallenge?: RpgSensorChallenge;
}

export const RPG_COURSES: RpgCourse[] = [
  { id: 'recite', name: '规矩复述', description: '把家规一条条背给调教者听', kinds: ['home', 'bedroom', 'playroom'], check: { stat: 'obedience', dc: 10 }, stamina: 4, stress: 1, gain: { obedience: 3 }, points: 5 },
  { id: 'posture', name: '礼仪站姿', description: '按要求站好，不许乱动', kinds: ['home', 'playroom'], check: { stat: 'endurance', dc: 10 }, stamina: 8, stress: 2, gain: { endurance: 3, obedience: 1 }, points: 5 },
  { id: 'service', name: '侍奉礼仪', description: '倒茶、整理衣物、端正地递东西', kinds: ['home', 'cafe', 'bath'], check: { stat: 'devotion', dc: 11 }, stamina: 8, stress: 1, gain: { devotion: 3, obedience: 1 }, points: 6 },
  { id: 'kneel', name: '跪姿练习', description: '保持端正的跪姿直到允许起身', kinds: ['home', 'playroom', 'bedroom'], check: { stat: 'endurance', dc: 12 }, stamina: 12, stress: 3, gain: { endurance: 4, obedience: 1 }, points: 8, unlock: { stat: 'endurance', level: 1 } },
  { id: 'command', name: '口令反应', description: '听到口令立刻做出约定的动作', kinds: ['home', 'playroom', 'outdoor'], check: { stat: 'obedience', dc: 12 }, stamina: 8, stress: 2, gain: { obedience: 4 }, points: 8, unlock: { stat: 'obedience', level: 1 } },
  { id: 'blindfold', name: '眼罩感官训练', description: '戴上眼罩，只凭声音和触碰跟随指引', kinds: ['playroom', 'bedroom'], check: { stat: 'shame', dc: 13 }, stamina: 10, stress: 4, gain: { shame: -4, devotion: 2 }, points: 10, unlock: { stat: 'devotion', level: 1 } },
  { id: 'errand', name: '外出小任务', description: '在外面完成调教者交代的小任务', kinds: ['outdoor', 'cafe'], check: { stat: 'shame', dc: 14 }, stamina: 10, stress: 5, gain: { shame: -5, obedience: 2 }, points: 12, unlock: { stat: 'shame', level: 2 } },
  { id: 'hold', name: '耐力保持', description: '在规定时间内一直保持指定的状态', kinds: ['playroom'], check: { stat: 'endurance', dc: 15 }, stamina: 20, stress: 7, gain: { endurance: 6 }, points: 15, unlock: { stat: 'endurance', level: 2 } },
  {
    id: 'pelvic_endurance',
    name: '括约肌耐力保持',
    description: '使用灵猫/排便压力传感器或屏幕长按，保持核心夹紧耐力',
    kinds: ['playroom', 'bedroom'],
    check: { stat: 'endurance', dc: 13 },
    stamina: 12,
    stress: 4,
    gain: { endurance: 5, obedience: 2 },
    points: 12,
    unlock: { stat: 'endurance', level: 1 },
    sensorChallenge: {
      type: 'pressure',
      targetValue: 25,
      durationSeconds: 10,
      label: '括约肌压力维持',
      instruction: '保持括约肌夹紧压力 >= 25 kPa（或长按屏幕发力按钮）持续 10 秒',
    },
  },
  {
    id: 'heart_calm',
    name: '心率平复自律',
    description: '在调教者的注视下深呼吸，控制心跳，保持镇定不破防',
    kinds: ['home', 'playroom', 'bedroom'],
    check: { stat: 'obedience', dc: 12 },
    stamina: 6,
    stress: -2,
    gain: { obedience: 4, devotion: 2 },
    points: 10,
    sensorChallenge: {
      type: 'heart_rate',
      targetValue: 95,
      durationSeconds: 10,
      label: '心率平复自律',
      instruction: '深呼吸调整呼吸节奏，将心率控制在 95 bpm 以下（或按住保持平稳呼吸）持续 10 秒',
    },
  },
  { id: 'trust', name: '信任练习', description: '闭上眼睛，把节奏完全交给调教者', kinds: ['playroom', 'bedroom'], check: { stat: 'devotion', dc: 15 }, stamina: 12, stress: 4, gain: { devotion: 5, shame: -2 }, points: 15, unlock: { stat: 'devotion', level: 2 } },
  { id: 'report', name: '晚间汇报', description: '向调教者汇报今天的表现和感受', kinds: ['bedroom', 'home'], check: { stat: 'devotion', dc: 9 }, stamina: 3, stress: -3, gain: { devotion: 3 }, points: 5 },
  { id: 'aftercare', name: '安抚时间', description: '被抱着、被夸奖，慢慢放松下来', kinds: ['bedroom', 'bath', 'home'], stamina: -5, stress: -20, gain: { devotion: 2 }, points: 0, relief: true },
  { id: 'bath', name: '沐浴放松', description: '泡个热水澡，把疲惫洗掉', kinds: ['bath'], stamina: -15, stress: -10, gain: {}, points: 0, relief: true },
];

export const getCourse = (id: string) => RPG_COURSES.find((course) => course.id === id) ?? null;

// ─── 特质（era 的素质）─────────────────────────────────────────────────────────

export interface RpgCounters {
  passes: RpgTraineeStats;
  fails: RpgTraineeStats;
  courses: number;
  violations: number;
  aftercare: number;
  /** 连续没有违反家规的天数 */
  cleanDays: number;
}

export interface RpgTrait {
  id: string;
  name: string;
  description: string;
  /** 对某项检定的修正 */
  modifiers: Partial<RpgTraineeStats>;
  condition: (counters: RpgCounters, stats: RpgTraineeStats) => boolean;
}

export const RPG_TRAITS: RpgTrait[] = [
  { id: 'docile', name: '乖巧', description: '服从检定成功 8 次', modifiers: { obedience: 1 }, condition: (c) => c.passes.obedience >= 8 },
  { id: 'tough', name: '坚韧', description: '耐受检定成功 8 次', modifiers: { endurance: 1 }, condition: (c) => c.passes.endurance >= 8 },
  { id: 'open', name: '放得开', description: '克服羞耻检定成功 6 次', modifiers: { shame: 1 }, condition: (c) => c.passes.shame >= 6 },
  { id: 'clingy', name: '黏人', description: '依恋达到 60', modifiers: { devotion: 1 }, condition: (_c, s) => s.devotion >= 60 },
  { id: 'stubborn', name: '倔强', description: '服从检定失败 6 次', modifiers: { obedience: -1, endurance: 1 }, condition: (c) => c.fails.obedience >= 6 },
  { id: 'disciplined', name: '守规矩', description: '连续 3 天没有违反家规', modifiers: { obedience: 1 }, condition: (c) => c.cleanDays >= 3 },
  { id: 'diligent', name: '勤勉', description: '累计完成 20 次课程', modifiers: { endurance: 1 }, condition: (c) => c.courses >= 20 },
];

export const getTrait = (id: string) => RPG_TRAITS.find((trait) => trait.id === id) ?? null;

// ─── 结局 ──────────────────────────────────────────────────────────────────────

export const computeEnding = (stats: RpgTraineeStats, traits: string[] = [], context?: RpgEndingContext) =>
  computeDetailedEnding(stats, traits, context);

// ─── 模板 ──────────────────────────────────────────────────────────────────────

export interface TemplateLocation {
  key: string;
  name: string;
  kind: RpgLocationKind;
  x: number;
  y: number;
  description: string;
  services?: RpgService[];
  catalog?: RpgShopItem[];
  pay?: number;
  /** 营业时段（0 清晨 1 白天 2 黄昏 3 深夜），不填为全天 */
  open?: number[];
}

export interface RpgQuestSeed {
  title: string;
  stat: RpgStatKey;
  op: 'gte' | 'lte';
  value: number;
  reward: number;
}

export interface RpgTemplate {
  id: string;
  name: string;
  tagline: string;
  premise: string;
  home: string;
  dayLimit: number;
  points: number;
  locations: TemplateLocation[];
  edges: Array<[string, string]>;
  goals: RpgQuestSeed[];
  rules: string[];
  inventory: Array<{ name: string; qty: number }>;
}

/** 兑换处的通用奖励 */
export const REWARD_CATALOG: RpgShopItem[] = [
  { name: '甜点', price: 10, note: '体力 +10', effect: { stamina: 10 } },
  { name: '休息券', price: 30, note: '体力 +30', effect: { stamina: 30 } },
  { name: '抱抱券', price: 25, note: '压力 -15', effect: { stress: 15 } },
  { name: '免罚券', price: 60, note: '下次检定失败时自动使用，免除电击', effect: { pardon: true } },
  { name: '撒娇券', price: 40, note: '可以向调教者提一个小要求（用完即消失）', effect: { consumable: true } },
];

export const RPG_TEMPLATES: RpgTemplate[] = [
  {
    id: 'contract',
    name: '契约训练',
    tagline: '30 天约定 · 公寓 · 街区',
    premise: '{{user}}自愿和{{char}}签下 30 天的训练契约，搬进{{char}}的公寓。每天的课程和规矩由{{char}}安排，{{user}}负责照做；约定的安全词一说出口，一切立刻停止。',
    home: 'bedroom',
    dayLimit: 30,
    points: 20,
    locations: [
      { key: 'bedroom', name: '卧室', kind: 'bedroom', x: 0, y: 0, services: ['rest'], description: '{{user}}睡的小卧室，墙上贴着今天的课表。' },
      { key: 'living', name: '客厅', kind: 'home', x: 0, y: -1, services: ['shop'], catalog: REWARD_CATALOG, description: '{{char}}常坐的沙发旁放着奖励柜，可以用积分兑换。' },
      { key: 'bath', name: '浴室', kind: 'bath', x: 1, y: 0, description: '带浴缸的浴室，水汽氤氲。' },
      { key: 'kitchen', name: '厨房', kind: 'work', x: -1, y: -1, services: ['work'], pay: 15, open: [0, 1, 2], description: '做家务能换积分，{{char}}会检查做得好不好。' },
      { key: 'training', name: '训练室', kind: 'playroom', x: 1, y: -1, description: '{{char}}上锁的房间，放着约定好的道具。' },
      { key: 'street', name: '街区', kind: 'outdoor', x: 0, y: -2, description: '公寓楼下热闹的街区。' },
      { key: 'cafe', name: '街角咖啡馆', kind: 'cafe', x: 1, y: -2, open: [1, 2], description: '{{char}}偶尔带你来坐坐，人来人往。只在白天和黄昏营业。' },
      { key: 'park', name: '河畔公园', kind: 'outdoor', x: 0, y: -3, open: [1, 2, 3], description: '傍晚有很多散步的人，清晨还没开门。' },
    ],
    edges: [['bedroom', 'living'], ['bedroom', 'bath'], ['living', 'kitchen'], ['living', 'training'], ['living', 'street'], ['street', 'cafe'], ['street', 'park']],
    goals: [
      { title: '学会规矩', stat: 'obedience', op: 'gte', value: 40, reward: 40 },
      { title: '坚持住', stat: 'endurance', op: 'gte', value: 40, reward: 40 },
      { title: '放下羞耻', stat: 'shame', op: 'lte', value: 40, reward: 60 },
      { title: '交出信任', stat: 'devotion', op: 'gte', value: 50, reward: 60 },
    ],
    rules: ['回答{{char}}的话要先说「是」', '进{{char}}的房间前先敲门请示', '每晚睡前汇报今天的表现'],
    inventory: [{ name: '契约书', qty: 1 }],
  },
  {
    id: 'manor',
    name: '庄园见习',
    tagline: '一个月教导期 · 庄园 · 小镇',
    premise: '{{user}}应聘成为{{char}}庄园里的见习仆从，自愿接受一个月的教导期。礼仪、规矩和侍奉之道都由{{char}}亲自教导，表现好会有奖励，犯错要受罚。',
    home: 'servant',
    dayLimit: 30,
    points: 20,
    locations: [
      { key: 'servant', name: '仆人房', kind: 'bedroom', x: 0, y: 0, services: ['rest'], description: '{{user}}的小房间，简单但干净。' },
      { key: 'hall', name: '大厅', kind: 'home', x: 0, y: -1, description: '练习仪态和迎客的地方，{{char}}常在这里检查你的姿态。' },
      { key: 'kitchen', name: '厨房', kind: 'work', x: -1, y: 0, services: ['work'], pay: 15, open: [0, 1, 2], description: '做好分内的差事能换积分。' },
      { key: 'steward', name: '管家室', kind: 'shop', x: -1, y: -1, services: ['shop'], catalog: REWARD_CATALOG, open: [0, 1, 2], description: '老管家负责登记积分和发放奖励，深夜不办公。' },
      { key: 'study', name: '书房', kind: 'home', x: 1, y: -1, description: '{{char}}的书房，进门前要先敲门请示。' },
      { key: 'bath', name: '浴场', kind: 'bath', x: 1, y: 0, description: '引了温泉水的大浴场。' },
      { key: 'cellar', name: '地下室', kind: 'playroom', x: 1, y: -2, description: '只有{{char}}有钥匙的房间，规矩最严。' },
      { key: 'garden', name: '花园', kind: 'outdoor', x: 0, y: -2, description: '玫瑰盛开的花园，有一架秋千。' },
    ],
    edges: [['servant', 'hall'], ['servant', 'kitchen'], ['servant', 'bath'], ['hall', 'steward'], ['hall', 'study'], ['hall', 'garden'], ['study', 'cellar']],
    goals: [
      { title: '礼仪入门', stat: 'obedience', op: 'gte', value: 40, reward: 40 },
      { title: '站得住', stat: 'endurance', op: 'gte', value: 40, reward: 40 },
      { title: '得到信任', stat: 'devotion', op: 'gte', value: 50, reward: 60 },
    ],
    rules: ['称呼{{char}}时要用敬语', '主人说话时不许插嘴', '每天清晨到大厅报到'],
    inventory: [{ name: '仆从名牌', qty: 1 }],
  },
];

// ─── 地点事件（进入地点时按概率触发，参考 era / DoL 的随机事件）────────────────

export interface RpgEventChoice {
  text: string;
  check?: { stat: RpgStatKey; dc: number };
}

export interface RpgLocationEvent {
  id: string;
  title: string;
  /** 交给 AI 描写的情境；{{char}} / {{user}} 会被替换 */
  text: string;
  kinds: RpgLocationKind[];
  /** 只在这些时段触发，不填为任意时段 */
  periods?: number[];
  choices: RpgEventChoice[];
}

export const RPG_LOCATION_EVENTS: RpgLocationEvent[] = [
  { id: 'bed_check', title: '床铺检查', text: '{{char}}掀开被子检查{{user}}的床铺有没有叠整齐。', kinds: ['bedroom'], periods: [0, 1], choices: [{ text: '立刻重新叠好', check: { stat: 'obedience', dc: 10 } }, { text: '小声解释' }] },
  { id: 'night_talk', title: '睡前谈心', text: '{{char}}坐在床边，想听{{user}}说说今天真实的感受。', kinds: ['bedroom'], periods: [3], choices: [{ text: '老实说出来', check: { stat: 'devotion', dc: 10 } }, { text: '害羞地岔开话题' }] },
  { id: 'quiz', title: '突击抽查', text: '{{char}}突然叫住{{user}}，要求当场背出一条家规。', kinds: ['home', 'bedroom'], choices: [{ text: '马上背出来', check: { stat: 'obedience', dc: 12 } }, { text: '请求再给一点时间' }] },
  { id: 'tea_time', title: '陪喝下午茶', text: '{{char}}让{{user}}陪着喝下午茶，全程要保持端正的坐姿。', kinds: ['home', 'cafe'], periods: [1, 2], choices: [{ text: '坐得笔直', check: { stat: 'endurance', dc: 11 } }, { text: '主动为她添茶' }] },
  { id: 'hair_wash', title: '帮忙洗头', text: '{{char}}靠在浴缸边，让{{user}}帮她洗头。', kinds: ['bath'], choices: [{ text: '认真又轻柔地洗', check: { stat: 'devotion', dc: 10 } }, { text: '紧张得手忙脚乱' }] },
  { id: 'steam', title: '雾气里的命令', text: '浴室里雾气弥漫，{{char}}隔着雾气下了一个口令，要{{user}}照做。', kinds: ['bath'], periods: [2, 3], choices: [{ text: '循着声音照做', check: { stat: 'shame', dc: 12 } }, { text: '先确认她说了什么' }] },
  { id: 'new_tool', title: '没见过的道具', text: '{{char}}拿出一件{{user}}没见过的道具，问{{user}}敢不敢试。', kinds: ['playroom'], choices: [{ text: '点头答应', check: { stat: 'shame', dc: 13 } }, { text: '先问清楚用途' }, { text: '摇头拒绝' }] },
  { id: 'freeze', title: '口令「定」', text: '{{char}}说出口令「定」，{{user}}必须保持当前姿势，直到被允许为止。', kinds: ['playroom', 'home'], choices: [{ text: '一动不动', check: { stat: 'endurance', dc: 13 } }, { text: '小声请求放松' }] },
  { id: 'extra_chore', title: '临时加活', text: '{{char}}临时多交代了一件差事，要{{user}}马上去做。', kinds: ['work', 'home'], periods: [0, 1, 2], choices: [{ text: '二话不说接下来', check: { stat: 'endurance', dc: 10 } }, { text: '讨价还价' }] },
  { id: 'reward_pick', title: '挑一件奖励', text: '{{char}}心情不错，让{{user}}从柜子里挑一件小奖励，但要先说出想要它的理由。', kinds: ['shop'], choices: [{ text: '诚实说出理由', check: { stat: 'devotion', dc: 11 } }, { text: '让她替自己挑' }] },
  { id: 'stranger', title: '有人搭讪', text: '一个陌生人过来搭讪，{{char}}就在一旁看着{{user}}怎么应对。', kinds: ['cafe', 'outdoor'], periods: [1, 2], choices: [{ text: '礼貌又坚定地拒绝', check: { stat: 'obedience', dc: 11 } }, { text: '求助地看向她' }] },
  { id: 'hand_hold', title: '人前牵手', text: '在人多的地方，{{char}}牵起{{user}}的手，要{{user}}跟紧、不许低头。', kinds: ['outdoor', 'cafe'], choices: [{ text: '红着脸跟上', check: { stat: 'shame', dc: 12 } }, { text: '把手握得更紧' }] },
  { id: 'rain', title: '突然下雨', text: '天突然下起雨，两个人只带了一把伞。', kinds: ['outdoor'], periods: [1, 2, 3], choices: [{ text: '把伞往她那边倾', check: { stat: 'devotion', dc: 10 } }, { text: '一起跑回去' }] },
  { id: 'strange_sound', title: '奇怪的声响', text: '这里传来奇怪的声响，{{char}}示意{{user}}去看看是什么。', kinds: ['special', 'outdoor'], choices: [{ text: '鼓起勇气过去', check: { stat: 'endurance', dc: 11 } }, { text: '躲到她身后' }] },
];
