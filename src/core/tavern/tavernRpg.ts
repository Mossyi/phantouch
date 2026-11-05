/**
 * 酒馆训练日程引擎
 *
 * 角色关系：AI 扮演的角色是调教者，主导每天的安排并下达指令；用户是被调教的一方。
 * 每天分清晨 / 白天 / 黄昏 / 深夜四个时段，在地图上的地点进行课程、做差事、兑换奖励、休息。
 *
 * 机制来源（见 tavernRpgContent.ts）：
 * - era 系列：课程（训练指令）按能力等级解锁；特质（素质）按累计表现获得并修正检定；
 * - Free Cities：家规与违规计数、每日报告；
 * - 养成类：系统每天排课表，期满按属性给结局，可以续约；
 * - Waidrin / SillyTavern RPG Companion / rpg-mcp：每轮注入状态、解析 AI 的隐藏标签，
 *   数值和骰子由本地引擎结算，AI 只负责叙述，状态变化经过校验和限幅。
 */
import {
  DEFAULT_TRAINEE,
  LEVEL_NAMES,
  REWARD_CATALOG,
  RPG_CHECK_LABELS,
  RPG_COURSES,
  RPG_LOCATION_EVENTS,
  RPG_STAT_LABELS,
  RPG_TEMPLATES,
  RPG_TRAITS,
  STAGES,
  STAT_KEYS,
  computeEnding,
  effectiveStat,
  getCourse,
  getTrait,
  stageIndex,
  statLevel,
  type RpgCounters,
  type RpgCourse,
  type RpgItemEffect,
  type RpgLocationEvent,
  type RpgLocationKind,
  type RpgSensorChallenge,
  type RpgService,
  type RpgShopItem,
  type RpgStatKey,
  type RpgTemplate,
  type RpgTraineeStats,
  type TemplateLocation,
} from './tavernRpgContent';

export * from './tavernRpgContent';

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
  pay: number;
  /** 营业时段，空数组表示全天 */
  open: number[];
}

export interface RpgItem {
  name: string;
  qty: number;
  effect?: RpgItemEffect;
}

export type RpgQuestStatus = 'active' | 'done' | 'failed';

/** 目标：有 condition 的由系统按训练属性自动判定；没有的是 AI 布置的剧情任务 */
export interface RpgQuest {
  title: string;
  objective: string;
  status: RpgQuestStatus;
  condition?: { stat: RpgStatKey; op: 'gte' | 'lte'; value: number };
  reward?: number;
  /** 调教者传唤的限时任务：在截止时段前到达目标地点 */
  target?: string;
  deadline?: { day: number; period: number };
}

export interface RpgMilestone {
  day: number;
  text: string;
}

export interface RpgRule {
  text: string;
  violations: number;
  /** 谁定的：用户自己加的，还是调教者在剧情里立的 */
  by: 'user' | 'trainer' | 'template';
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
  /** 违反家规时自动电击惩罚；默认关闭 */
  punishOnViolation: boolean;
  /** 调教者传唤超时未到时电击惩罚；默认关闭 */
  punishOnSummonOverdue: boolean;
  /** 做差事或前往公共场合时穿戴玩具微震；默认关闭 */
  wearToyOnErrands: boolean;
  /** 穿戴玩具震动档位 1-5，默认 2 */
  wearToyLevel: number;
  /** 课程具身感应硬件挑战；默认开启 */
  sensorChallengesEnabled: boolean;
}

export interface RpgPlanSlot {
  period: number;
  courseId: string;
  done: boolean;
}

export interface RpgDayTally {
  startTrainee: RpgTraineeStats;
  startPoints: number;
  passed: number;
  failed: number;
  violations: number;
  courses: number;
}

export interface RpgDailyReport {
  day: number;
  deltas: Partial<RpgTraineeStats>;
  points: number;
  bonus: number;
  passed: number;
  failed: number;
  violations: number;
  courses: number;
  planDone: number;
  planTotal: number;
}

export interface RpgEnding {
  day: number;
  title: string;
  summary: string;
}

export interface RpgCore {
  version: 4;
  /** 这一局的唯一 id（存档按它区分同名世界的不同局） */
  runId: string;
  /** 系统动作（课程/差事/休息）已经推进了时间，本轮忽略 AI 标签里的 time，避免重复推进 */
  timeLocked: boolean;
  templateId: string;
  worldName: string;
  premise: string;
  locations: RpgLocation[];
  edges: Array<[string, string]>;
  currentId: string;
  homeId: string;
  points: number;
  stamina: number;
  /** 压力 0-100：失败和高强度训练会累积，安抚和休息会消退 */
  stress: number;
  trainee: RpgTraineeStats;
  traits: string[];
  counters: RpgCounters;
  stage: number;
  /** AI 生成世界时设计的专属课程（数值已由系统限幅） */
  customCourses: RpgCourse[];
  /** AI 生成世界时设计的地点事件 */
  customEvents: RpgLocationEvent[];
  /** 事件 id → 上次触发的天数（冷却用） */
  eventsSeen: Record<string, number>;
  /** 地点 id → 上次触发事件的天数（每个地点每天最多一次） */
  eventDays: Record<string, number>;
  /** 刚触发的事件给出的回应选项，下一轮合并进 AI 的选项 */
  eventChoices: RpgChoice[];
  /** 训练回忆：阶段提升、特质、目标等里程碑，写进提示词让 AI 记得 */
  milestones: RpgMilestone[];
  rules: RpgRule[];
  inventory: RpgItem[];
  quests: RpgQuest[];
  day: number;
  dayLimit: number;
  period: number;
  plan: RpgPlanSlot[];
  today: RpgDayTally;
  reports: RpgDailyReport[];
  ending: RpgEnding | null;
  /** 需要 AI 在下一轮回应的剧情事件（阶段提升、获得特质、期满……），回复后清空 */
  pendingEvents: string[];
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

export const RPG_PERIOD_LABELS = ['清晨', '白天', '黄昏', '深夜'];
export const RPG_KIND_META: Record<RpgLocationKind, { icon: string; label: string }> = {
  bedroom: { icon: '🛏️', label: '卧室' },
  home: { icon: '🏠', label: '居所' },
  bath: { icon: '🛁', label: '浴室' },
  playroom: { icon: '🗝️', label: '训练室' },
  shop: { icon: '🎁', label: '兑换处' },
  work: { icon: '🧹', label: '差事' },
  cafe: { icon: '☕', label: '店铺' },
  outdoor: { icon: '🌳', label: '户外' },
  special: { icon: '✨', label: '特殊' },
};
export const RPG_SERVICE_LABELS: Record<RpgService, string> = { rest: '休息', shop: '兑换', work: '差事' };

export const RPG_LOW_STAMINA = 25;
export const RPG_HIGH_STRESS = 60;
export const RPG_MAX_STRESS = 85;
const WORK_STAMINA_COST = 10;
const FAIL_STRESS = 4;
const MAX_STAT_DELTA = 8;
const MAX_LOCATIONS = 40;
const MAX_ITEMS = 30;
const MAX_ACTIVE_QUESTS = 10;
const MAX_RULES = 8;
const MAX_LOG = 50;
const MAX_REPORTS = 30;
const MAX_MILESTONES = 30;
const EVENT_CHANCE = 0.35;
const EVENT_COOLDOWN_DAYS = 5;
const SUMMON_CHANCE = 0.3;
const SUMMON_REWARD = 10;
const MAX_SNAPSHOTS = 6;
const MAX_DISCOVER_PER_TURN = 2;
const PLAN_SLOT_BONUS = 10;
const PLAN_FULL_BONUS = 20;
const VIOLATION_POINTS = 5;
const STORAGE_PREFIX = 'ycy_tavern_rpg_';
export const RPG_ENABLED_KEY = 'ycy_tavern_rpg_enabled';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const toInt = (value: unknown, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : fallback;
};
const cleanText = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const normalizeName = (value: string) => value.replace(/[\s·・()（）「」『』“”"'【】[\]。，,.!！?？]/g, '').toLowerCase();
const zeroStats = (): RpgTraineeStats => ({ obedience: 0, endurance: 0, shame: 0, devotion: 0 });
const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/** 属性有效值 30 为基准，每 10 点 ±1（-3 … +5） */
export const statModifier = (stat: RpgStatKey, value: number) => clamp(Math.round((effectiveStat(stat, value) - 30) / 10), -3, 5);

const LOCATION_KINDS: RpgLocationKind[] = ['bedroom', 'home', 'bath', 'playroom', 'shop', 'work', 'cafe', 'outdoor', 'special'];
const KIND_ALIASES: Record<string, RpgLocationKind> = {
  卧室: 'bedroom', 寝室: 'bedroom', 仆人房: 'bedroom', 居所: 'home', 客厅: 'home', 房间: 'home', 家: 'home', 书房: 'home', 厨房: 'home',
  浴室: 'bath', 浴场: 'bath', 温泉: 'bath', 训练室: 'playroom', 游戏室: 'playroom', 密室: 'playroom', 地下室: 'playroom',
  兑换处: 'shop', 商店: 'shop', 差事: 'work', 打工: 'work', 店铺: 'cafe', 咖啡馆: 'cafe', 餐厅: 'cafe',
  户外: 'outdoor', 公园: 'outdoor', 街道: 'outdoor', 花园: 'outdoor', 阳台: 'outdoor', 特殊: 'special',
};
const normalizeKind = (value: unknown): RpgLocationKind => {
  if (typeof value !== 'string') return 'special';
  const key = value.trim().toLowerCase();
  if ((LOCATION_KINDS as string[]).includes(key)) return key as RpgLocationKind;
  return KIND_ALIASES[value.trim()] ?? 'special';
};

const STAT_ALIASES: Record<string, RpgStatKey> = {
  obedience: 'obedience', 服从: 'obedience', endurance: 'endurance', 耐受: 'endurance', 忍耐: 'endurance',
  shame: 'shame', 羞耻: 'shame', 克服羞耻: 'shame', devotion: 'devotion', 依恋: 'devotion', 信赖: 'devotion',
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

const expandNames = (text: string, names: { char: string; user: string }) =>
  text.replace(/\{\{char\}\}/g, names.char || '调教者').replace(/\{\{user\}\}/g, names.user || '你');

const defaultHardware = (): RpgHardwareSettings => ({
  punishOnFail: false,
  punishLevel: 15,
  punishSeconds: 2,
  rewardOnSuccess: false,
  punishOnViolation: false,
  punishOnSummonOverdue: false,
  wearToyOnErrands: false,
  wearToyLevel: 2,
  sensorChallengesEnabled: true,
});
const freshCounters = (): RpgCounters => ({ passes: zeroStats(), fails: zeroStats(), courses: 0, violations: 0, aftercare: 0, cleanDays: 0 });
const freshTally = (trainee: RpgTraineeStats, points: number): RpgDayTally => ({ startTrainee: { ...trainee }, startPoints: points, passed: 0, failed: 0, violations: 0, courses: 0 });

const makeLocation = (id: string, loc: Omit<TemplateLocation, 'key'>, names: { char: string; user: string }): RpgLocation => ({
  id,
  name: loc.name,
  kind: loc.kind,
  description: expandNames(loc.description, names),
  x: loc.x,
  y: loc.y,
  discovered: false,
  visited: false,
  services: loc.services ? [...loc.services] : [],
  catalog: loc.catalog ? loc.catalog.map((item) => ({ ...item, effect: item.effect ? { ...item.effect } : undefined })) : [],
  pay: loc.pay ?? 0,
  open: loc.open ? [...loc.open] : [],
});

const goalQuest = (seed: { title: string; stat: RpgStatKey; op: 'gte' | 'lte'; value: number; reward: number }): RpgQuest => ({
  title: seed.title,
  objective: `${RPG_STAT_LABELS[seed.stat]}${seed.op === 'gte' ? '达到' : '降到'} ${seed.value}${seed.op === 'lte' ? ' 以下' : ''}`,
  status: 'active',
  condition: { stat: seed.stat, op: seed.op, value: seed.value },
  reward: seed.reward,
});

export const appendRpgLog = <T extends RpgCore>(state: T, text: string, tone: RpgLogEntry['tone']): T => ({
  ...state,
  log: [...state.log, { at: Date.now(), text, tone }].slice(-MAX_LOG),
});

// ─── 地图 ──────────────────────────────────────────────────────────────────────

export const getLocation = (state: RpgCore, id: string) => state.locations.find((loc) => loc.id === id) ?? null;

export const getNeighborIds = (state: RpgCore, id: string) =>
  state.edges.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));

export const getReachableLocations = (state: RpgCore) =>
  getNeighborIds(state, state.currentId)
    .map((id) => getLocation(state, id))
    .filter((loc): loc is RpgLocation => Boolean(loc?.discovered));

export const isLocationOpen = (location: RpgLocation, period: number) => !location.open.length || location.open.includes(period);

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

// ─── 课程可用性与课表 ──────────────────────────────────────────────────────────

export interface CourseAvailability {
  course: RpgCourse;
  available: boolean;
  reason?: string;
}

/** 内置课程 + 这个世界的专属课程 */
export const allCourses = (state: RpgCore): RpgCourse[] => [...RPG_COURSES, ...(state.customCourses ?? [])];
export const findCourse = (state: RpgCore, id: string) => allCourses(state).find((course) => course.id === id) ?? null;

const COURSE_KINDS: RpgLocationKind[] = ['bedroom', 'home', 'bath', 'playroom', 'shop', 'work', 'cafe', 'outdoor', 'special'];
/** 校验并限幅一门自定义课程（AI 生成或存档读入），不合格返回 null */
export const normalizeCustomCourse = (value: unknown, index: number): RpgCourse | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const name = cleanText(raw.name, 10);
  if (!name) return null;
  const kinds = (Array.isArray(raw.kinds) ? raw.kinds : [raw.kinds]).map((kind) => normalizeKind(kind)).filter((kind, i, list) => COURSE_KINDS.includes(kind) && list.indexOf(kind) === i);
  const stat = normalizeStat((raw.check as Record<string, unknown> | undefined)?.stat ?? raw.stat);
  const relief = raw.relief === true || !stat;
  const gain: Partial<RpgTraineeStats> = {};
  const rawGain = (raw.gain && typeof raw.gain === 'object' ? raw.gain : {}) as Record<string, unknown>;
  for (const [key, delta] of Object.entries(rawGain)) {
    const target = normalizeStat(key);
    const amount = toInt(delta, 0);
    if (target && amount) gain[target] = clamp(amount, -6, 6);
  }
  if (!relief && stat && !gain[stat]) gain[stat] = stat === 'shame' ? -3 : 3;
  const unlockLevel = clamp(toInt(raw.unlockLevel ?? (raw.unlock as Record<string, unknown> | undefined)?.level, 0), 0, 3);
  return {
    id: typeof raw.id === 'string' && /^ai_[a-z0-9_]{1,24}$/.test(raw.id) ? raw.id : `ai_${index}`,
    name,
    description: cleanText(raw.description ?? raw.desc, 40) || name,
    kinds: kinds.length ? kinds : ['playroom'],
    check: relief || !stat ? undefined : { stat, dc: clamp(toInt((raw.check as Record<string, unknown> | undefined)?.dc ?? raw.dc, 12), 8, 18) },
    stamina: relief ? -clamp(Math.abs(toInt(raw.stamina, 10)), 0, 20) : clamp(toInt(raw.stamina, 10), 2, 25),
    stress: relief ? -clamp(Math.abs(toInt(raw.stress, 10)), 0, 20) : clamp(toInt(raw.stress, 3), -5, 8),
    gain,
    points: relief ? 0 : clamp(toInt(raw.points, 8), 0, 20),
    unlock: !relief && stat && unlockLevel > 0 ? { stat, level: unlockLevel } : undefined,
    relief,
  };
};

export const isCourseUnlocked = (state: RpgCore, course: RpgCourse) =>
  !course.unlock || statLevel(course.unlock.stat, state.trainee[course.unlock.stat]) >= course.unlock.level;

/** 当前地点可以进行的课程及不能进行的原因 */
export const getCoursesHere = (state: RpgCore): CourseAvailability[] => {
  const here = getLocation(state, state.currentId);
  if (!here) return [];
  return allCourses(state).filter((course) => course.kinds.includes(here.kind)).map((course) => {
    if (!isCourseUnlocked(state, course)) {
      return { course, available: false, reason: `需要${RPG_STAT_LABELS[course.unlock!.stat]} ${LEVEL_NAMES[course.unlock!.level]}（Lv${course.unlock!.level}）` };
    }
    if (!course.relief && state.stress >= RPG_MAX_STRESS) return { course, available: false, reason: '压力太大了，先安抚或休息' };
    if (course.stamina > 0 && state.stamina < course.stamina) return { course, available: false, reason: `体力不够（需要 ${course.stamina}）` };
    return { course, available: true };
  });
};

/** 系统排的今日课表：前三个时段挑解锁的课程，优先补最弱的属性；深夜安排汇报或安抚 */
export const buildDailyPlan = (state: RpgCore, random: () => number = Math.random): RpgPlanSlot[] => {
  const kinds = new Set(state.locations.filter((loc) => loc.discovered).map((loc) => loc.kind));
  const candidates = allCourses(state).filter((course) => !course.relief && course.check && isCourseUnlocked(state, course) && course.kinds.some((kind) => kinds.has(kind)) && course.id !== 'report');
  const weakness = (course: RpgCourse) => effectiveStat(course.check!.stat, state.trainee[course.check!.stat]) + random() * 15;
  const picked: RpgCourse[] = [];
  for (const course of [...candidates].sort((a, b) => weakness(a) - weakness(b))) {
    if (picked.length >= 3) break;
    if (!picked.some((entry) => entry.check!.stat === course.check!.stat) || candidates.length <= 3) picked.push(course);
  }
  for (const course of candidates) {
    if (picked.length >= 3) break;
    if (!picked.includes(course)) picked.push(course);
  }
  const night = kinds.has('bedroom') || kinds.has('home') ? (state.stress >= RPG_HIGH_STRESS ? 'aftercare' : 'report') : null;
  return [
    ...picked.map((course, period) => ({ period, courseId: course.id, done: false })),
    ...(night ? [{ period: 3, courseId: night, done: false }] : []),
  ];
};

// ─── 进度判定：目标、特质、阶段 ────────────────────────────────────────────────

const meetsCondition = (condition: NonNullable<RpgQuest['condition']>, stats: RpgTraineeStats) => {
  const value = stats[condition.stat];
  return condition.op === 'gte' ? value >= condition.value : value <= condition.value;
};

export interface RpgProgress {
  state: TavernRpgState;
  completed: RpgQuest[];
  newTraits: string[];
  stageUp: boolean;
}

/** 每次数值变化后调用：发目标奖励、授予特质、检查阶段提升，并把需要 AI 回应的事件排进队列 */
export const evaluateProgress = (input: TavernRpgState): RpgProgress => {
  let state = input;
  const completed: RpgQuest[] = [];
  const quests = state.quests.map((quest) => {
    if (quest.status !== 'active' || !quest.condition || !meetsCondition(quest.condition, state.trainee)) return quest;
    const done = { ...quest, status: 'done' as const };
    completed.push(done);
    return done;
  });
  const events = [...state.pendingEvents];
  const milestones: RpgMilestone[] = [];
  if (completed.length) {
    state = { ...state, quests, points: state.points + completed.reduce((sum, quest) => sum + (quest.reward ?? 0), 0) };
    for (const quest of completed) {
      state = appendRpgLog(state, `目标达成：${quest.title}${quest.reward ? `（+${quest.reward} 积分）` : ''}`, 'good');
      events.push(`训练目标「${quest.title}」达成，系统已发放 ${quest.reward ?? 0} 积分，请${'{{char}}'}给予肯定或小小的奖励。`);
      milestones.push({ day: state.day, text: `达成目标「${quest.title}」` });
    }
  }

  const newTraits = RPG_TRAITS.filter((trait) => !state.traits.includes(trait.id) && trait.condition(state.counters, state.trainee)).map((trait) => trait.id);
  if (newTraits.length) {
    state = { ...state, traits: [...state.traits, ...newTraits] };
    for (const id of newTraits) {
      const trait = getTrait(id)!;
      state = appendRpgLog(state, `获得特质：${trait.name}`, 'good');
      events.push(`你（${'{{user}}'}）获得了特质「${trait.name}」（${trait.description}），请让${'{{char}}'}注意到这个变化。`);
      milestones.push({ day: state.day, text: `获得特质「${trait.name}」` });
    }
  }

  const stage = stageIndex(state.trainee);
  const stageUp = stage > state.stage;
  if (stage !== state.stage) {
    state = { ...state, stage };
    if (stageUp) {
      state = appendRpgLog(state, `训练阶段提升：${STAGES[stage].name}`, 'good');
      events.push(`训练阶段提升为「${STAGES[stage].name}」（${STAGES[stage].hint}）。请安排一个小小的仪式或奖励来回应这一步。`);
      milestones.push({ day: state.day, text: `进入阶段「${STAGES[stage].name}」` });
    }
  }
  return {
    state: { ...state, pendingEvents: events.slice(-6), milestones: [...(state.milestones ?? []), ...milestones].slice(-MAX_MILESTONES) },
    completed,
    newTraits,
    stageUp,
  };
};

// ─── 开局 ──────────────────────────────────────────────────────────────────────

const freshCore = () => {
  const trainee = { ...DEFAULT_TRAINEE };
  return {
    version: 4 as const,
    runId: newId('run'),
    timeLocked: false,
    stamina: 100,
    stress: 0,
    trainee,
    traits: [] as string[],
    counters: freshCounters(),
    stage: stageIndex(trainee),
    customCourses: [] as RpgCourse[],
    customEvents: [] as RpgLocationEvent[],
    eventsSeen: {} as Record<string, number>,
    eventDays: {} as Record<string, number>,
    eventChoices: [] as RpgChoice[],
    milestones: [] as RpgMilestone[],
    day: 1,
    period: 0,
    plan: [] as RpgPlanSlot[],
    reports: [] as RpgDailyReport[],
    ending: null,
    pendingEvents: [] as string[],
    choices: [] as RpgChoice[],
    turn: 0,
    hardware: defaultHardware(),
    snapshots: [] as TavernRpgState['snapshots'],
  };
};

/** 从模板开局：内置模板和 AI 生成的世界都走这里 */
export const createRpgStateFromTemplate = (
  template: RpgTemplate,
  names: { char: string; user: string },
  extras: { courses?: RpgCourse[]; events?: RpgLocationEvent[] } = {},
): TavernRpgState => {
  const common = freshCore();
  const customCourses = extras.courses ?? [];
  const idByKey = new Map(template.locations.map((loc) => [loc.key, `${template.id}_${loc.key}`]));
  const homeId = idByKey.get(template.home) ?? `${template.id}_${template.locations[0].key}`;
  const state = revealAround<TavernRpgState>({
    ...common,
    customCourses,
    customEvents: extras.events ?? [],
    templateId: template.id,
    worldName: template.name,
    premise: expandNames(template.premise, names),
    locations: template.locations.map((loc) => makeLocation(idByKey.get(loc.key)!, loc, names)),
    edges: template.edges.map(([a, b]) => [idByKey.get(a)!, idByKey.get(b)!] as [string, string]),
    currentId: homeId,
    homeId,
    points: template.points,
    rules: template.rules.map((text) => ({ text: expandNames(text, names), violations: 0, by: 'template' as const })),
    inventory: template.inventory.map((item) => ({ ...item })),
    quests: template.goals.map(goalQuest),
    dayLimit: template.dayLimit,
    today: freshTally(common.trainee, template.points),
    log: [{ at: Date.now(), text: `开始：${template.name}`, tone: 'info' }],
  }, homeId);
  return { ...state, plan: buildDailyPlan(state) };
};

export const createRpgState = (
  templateId: string,
  names: { char: string; user: string },
  custom?: { worldName?: string; premise?: string; startName?: string; dayLimit?: number },
): TavernRpgState => {
  const template = RPG_TEMPLATES.find((item) => item.id === templateId);
  if (template) return createRpgStateFromTemplate(template, names);
  const common = freshCore();
  const homeId = newId('loc');
  const shopId = newId('loc');
  const roomId = newId('loc');
  const homeName = cleanText(custom?.startName, 12) || '住处';
  const state = revealAround<TavernRpgState>({
    ...common,
    templateId: 'custom',
    worldName: cleanText(custom?.worldName, 16) || '训练日常',
    premise: cleanText(custom?.premise, 400) || `${names.user || '你'}自愿接受${names.char || '调教者'}的训练，每天的安排由${names.char || '调教者'}决定。`,
    locations: [
      makeLocation(homeId, { name: homeName, kind: 'bedroom', x: 0, y: 0, description: '可以在这里休息到第二天。', services: ['rest'] }, names),
      makeLocation(roomId, { name: '训练室', kind: 'playroom', x: 0, y: -1, description: '进行课程的地方。' }, names),
      makeLocation(shopId, { name: '奖励柜', kind: 'shop', x: 1, y: 0, description: '用积分兑换奖励。', services: ['shop'], catalog: REWARD_CATALOG }, names),
    ],
    edges: [[homeId, shopId], [homeId, roomId]],
    currentId: homeId,
    homeId,
    points: 20,
    rules: [],
    inventory: [],
    quests: [goalQuest({ title: '学会规矩', stat: 'obedience', op: 'gte', value: 40, reward: 40 }), goalQuest({ title: '交出信任', stat: 'devotion', op: 'gte', value: 50, reward: 60 })],
    dayLimit: clamp(toInt(custom?.dayLimit, 0), 0, 365),
    today: freshTally(common.trainee, 20),
    log: [{ at: Date.now(), text: `开始：${homeName}`, tone: 'info' }],
  }, homeId);
  return { ...state, plan: buildDailyPlan(state) };
};

// ─── 检定 ──────────────────────────────────────────────────────────────────────

export const traitModifier = (state: RpgCore, stat: RpgStatKey) =>
  state.traits.reduce((sum, id) => sum + (getTrait(id)?.modifiers[stat] ?? 0), 0);

/** 修正 = 属性 + 特质 - 体力低 2 - 压力高 2 */
export const checkModifier = (state: RpgCore, stat: RpgStatKey) =>
  statModifier(stat, state.trainee[stat] ?? 0)
  + traitModifier(state, stat)
  - (state.stamina < RPG_LOW_STAMINA ? 2 : 0)
  - (state.stress >= RPG_HIGH_STRESS ? 2 : 0);

export const rollCheck = (state: RpgCore, check: RpgCheck, random: () => number = Math.random): RpgCheckResult => {
  const roll = clamp(Math.floor(random() * 20) + 1, 1, 20);
  const mod = checkModifier(state, check.stat);
  const total = roll + mod;
  const critical = roll === 20 ? 'success' : roll === 1 ? 'fail' : null;
  const success = critical === 'success' ? true : critical === 'fail' ? false : total >= check.dc;
  return { stat: check.stat, dc: check.dc, roll, mod, total, success, critical };
};

export const formatCheckResult = (result: RpgCheckResult) => {
  const modText = result.mod === 0 ? '' : result.mod > 0 ? ` +${result.mod}` : ` ${result.mod}`;
  const verdict = result.critical === 'success' ? '大成功' : result.critical === 'fail' ? '大失败' : result.success ? '成功' : '失败';
  return `🎲 ${RPG_CHECK_LABELS[result.stat]}检定：d20=${result.roll}${modText} = ${result.total} / 难度 ${result.dc} · ${verdict}`;
};

/** 判定具身感应挑战是否达成要求 */
export const evaluateSensorChallenge = (challenge: RpgSensorChallenge, actualValue: number): boolean => {
  if (challenge.type === 'pressure') {
    return actualValue >= challenge.targetValue;
  } else if (challenge.type === 'heart_rate') {
    return actualValue > 0 && actualValue <= challenge.targetValue;
  }
  return false;
};

/** 记录一次检定：计入特质计数和当天统计，失败会增加压力 */
export const recordCheck = (state: TavernRpgState, result: RpgCheckResult): TavernRpgState => {
  const counters = {
    ...state.counters,
    passes: { ...state.counters.passes, [result.stat]: state.counters.passes[result.stat] + (result.success ? 1 : 0) },
    fails: { ...state.counters.fails, [result.stat]: state.counters.fails[result.stat] + (result.success ? 0 : 1) },
  };
  const today = { ...state.today, passed: state.today.passed + (result.success ? 1 : 0), failed: state.today.failed + (result.success ? 0 : 1) };
  const next = { ...state, counters, today, stress: clamp(state.stress + (result.success ? 0 : FAIL_STRESS), 0, 100) };
  return appendRpgLog(next, formatCheckResult(result).replace(/^🎲\s*/, ''), result.success ? 'good' : 'bad');
};

// ─── 系统动作 ──────────────────────────────────────────────────────────────────

export type RpgActionResult = { state: TavernRpgState; message?: string; error?: string; check?: RpgCheckResult };

// ─── 地点事件 ──────────────────────────────────────────────────────────────────

export const allLocationEvents = (state: RpgCore): RpgLocationEvent[] => [...RPG_LOCATION_EVENTS, ...(state.customEvents ?? [])];

/** 到达地点时按概率触发事件：每个地点每天最多一次，同一事件 5 天内不重复 */
export const rollLocationEvent = (state: TavernRpgState, random: () => number = Math.random): { state: TavernRpgState; event: RpgLocationEvent | null } => {
  const here = getLocation(state, state.currentId);
  if (!here || state.eventDays?.[here.id] === state.day) return { state, event: null };
  if (random() >= EVENT_CHANCE) return { state, event: null };
  const candidates = allLocationEvents(state).filter((event) => event.kinds.includes(here.kind)
    && (!event.periods?.length || event.periods.includes(state.period))
    && !(state.eventsSeen?.[event.id] !== undefined && state.day - state.eventsSeen[event.id] < EVENT_COOLDOWN_DAYS));
  if (!candidates.length) return { state, event: null };
  const event = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  const choices: RpgChoice[] = event.choices.map((choice) => ({ text: choice.text, check: choice.check ? { ...choice.check } : undefined }));
  const next: TavernRpgState = {
    ...state,
    eventsSeen: { ...state.eventsSeen, [event.id]: state.day },
    eventDays: { ...state.eventDays, [here.id]: state.day },
    eventChoices: choices,
    pendingEvents: [...state.pendingEvents, `地点事件「${event.title}」：${event.text}请据此展开这一幕，并在 choices 里原样给出这些回应：${choices.map((choice) => choice.text).join(' / ')}。`].slice(-6),
  };
  return { state: appendRpgLog(next, `地点事件：${event.title}`, 'info'), event };
};

// ─── 调教者传唤（限时任务）────────────────────────────────────────────────────

const isPastDeadline = (deadline: { day: number; period: number }, day: number, period: number) =>
  day > deadline.day || (day === deadline.day && period > deadline.period);

export const activeSummon = (state: RpgCore) => state.quests.find((quest) => quest.status === 'active' && quest.target && quest.deadline) ?? null;

/** 过了截止时段还没到的传唤记为失败：压力 +3，并交给 AI 处理 */
export const expireSummons = (state: TavernRpgState): TavernRpgState => {
  let next = state;
  for (const quest of state.quests) {
    if (quest.status !== 'active' || !quest.deadline || !quest.target || !isPastDeadline(quest.deadline, state.day, state.period)) continue;
    const place = getLocation(state, quest.target)?.name ?? '指定地点';
    next = {
      ...next,
      quests: next.quests.map((entry) => (entry === quest ? { ...entry, status: 'failed' as const } : entry)),
      stress: clamp(next.stress + 3, 0, 100),
      pendingEvents: [...next.pendingEvents, `${'{{user}}'}没有按时到「${place}」报到，请让${'{{char}}'}追究这件事。`].slice(-6),
    };
    next = appendRpgLog(next, `没有按时到「${place}」报到（压力 +3）`, 'bad');
  }
  return next;
};

/** 计算从 before 到 after 状态中新过期的传唤任务数量 */
export const countNewlyExpiredSummons = (before: TavernRpgState, after: TavernRpgState): number => {
  const beforeActive = new Set(
    before.quests.filter((q) => q.status === 'active' && q.deadline && q.target).map((q) => `${q.target}_${q.deadline?.day}_${q.deadline?.period}`)
  );
  let count = 0;
  for (const q of after.quests) {
    if (q.status === 'failed' && q.deadline && q.target) {
      const key = `${q.target}_${q.deadline.day}_${q.deadline.period}`;
      if (beforeActive.has(key)) count += 1;
    }
  }
  return count;
};

/** 时间推进后，调教者可能传唤：在下一个时段结束前到某个地点报到 */
export const maybeSummon = (state: TavernRpgState, random: () => number = Math.random): TavernRpgState => {
  if (activeSummon(state) || state.period >= 3 || random() >= SUMMON_CHANCE) return state;
  const deadlinePeriod = Math.min(3, state.period + 1);
  const candidates = state.locations.filter((loc) => loc.discovered && loc.id !== state.currentId && isLocationOpen(loc, state.period) && isLocationOpen(loc, deadlinePeriod) && !loc.services.includes('shop'));
  if (!candidates.length) return state;
  const target = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  const quest: RpgQuest = {
    title: `到「${target.name}」报到`,
    objective: `${RPG_PERIOD_LABELS[deadlinePeriod]}结束前到${target.name}找调教者`,
    status: 'active',
    target: target.id,
    deadline: { day: state.day, period: deadlinePeriod },
    reward: SUMMON_REWARD,
  };
  const next: TavernRpgState = {
    ...state,
    quests: [quest, ...state.quests],
    pendingEvents: [...state.pendingEvents, `${'{{char}}'}传话：要${'{{user}}'}在${RPG_PERIOD_LABELS[deadlinePeriod]}结束前到「${target.name}」报到（系统限时任务，按时到达有奖励）。请在回复里自然地交代这件事。`].slice(-6),
  };
  return appendRpgLog(next, `调教者传唤：${RPG_PERIOD_LABELS[deadlinePeriod]}结束前到「${target.name}」`, 'warn');
};

/** 时段或日期变化后统一调用：先结算过期的传唤，再看会不会有新的传唤 */
export const afterTimeAdvance = (state: TavernRpgState, random: () => number = Math.random) => maybeSummon(expireSummons(state), random);

const completeSummonAt = (state: TavernRpgState, locationId: string): TavernRpgState => {
  const quest = state.quests.find((entry) => entry.status === 'active' && entry.target === locationId && entry.deadline && !isPastDeadline(entry.deadline, state.day, state.period));
  if (!quest) return state;
  const reward = quest.reward ?? SUMMON_REWARD;
  const next: TavernRpgState = {
    ...state,
    quests: state.quests.map((entry) => (entry === quest ? { ...entry, status: 'done' as const } : entry)),
    points: state.points + reward,
    trainee: { ...state.trainee, devotion: clamp(state.trainee.devotion + 1, 0, 100) },
    pendingEvents: [...state.pendingEvents, `${'{{user}}'}按时来「${getLocation(state, locationId)?.name ?? ''}」报到了（系统已奖励 ${reward} 积分、依恋 +1）。`].slice(-6),
  };
  return appendRpgLog(next, `按时报到（+${reward} 积分，依恋 +1）`, 'good');
};

export const travelTo = (state: TavernRpgState, locationId: string, random: () => number = Math.random): RpgActionResult => {
  const target = getLocation(state, locationId);
  if (!target || !target.discovered) return { state, error: '这个地点还没被发现。' };
  if (target.id === state.currentId) return { state, error: '已经在这里了。' };
  if (!getNeighborIds(state, state.currentId).includes(target.id)) return { state, error: `从这里去不了${target.name}，需要先经过相邻的地点。` };
  if (!isLocationOpen(target, state.period)) {
    return { state, error: `${target.name}${RPG_PERIOD_LABELS[state.period]}不开放（开放时段：${target.open.map((p) => RPG_PERIOD_LABELS[p]).join('、')}）。` };
  }
  const moved = appendRpgLog(revealAround({ ...state, currentId: target.id }, target.id), `前往 ${target.name}`, 'info');
  const reported = completeSummonAt(moved, target.id);
  const summoned = reported !== moved;
  const { state: next, event } = rollLocationEvent(reported, random);
  const lines = [`🧭 前往：${target.name}`];
  if (summoned) lines.push('（按调教者的传唤按时报到）');
  if (event) lines.push(`✨ 地点事件：${event.title}`);
  return { state: evaluateProgress(next).state, message: lines.join('\n') };
};

const addToInventory = (inventory: RpgItem[], item: RpgItem): RpgItem[] | null => {
  const next = inventory.map((entry) => ({ ...entry }));
  const own = next.find((entry) => normalizeName(entry.name) === normalizeName(item.name));
  if (own) {
    own.qty = clamp(own.qty + item.qty, 1, 99);
    if (item.effect && !own.effect) own.effect = { ...item.effect };
    return next;
  }
  if (next.length >= MAX_ITEMS) return null;
  next.push({ ...item, effect: item.effect ? { ...item.effect } : undefined });
  return next;
};

export const buyItem = (state: TavernRpgState, itemName: string): RpgActionResult => {
  const here = getLocation(state, state.currentId);
  const item = here?.services.includes('shop') ? here.catalog.find((entry) => entry.name === itemName) : null;
  if (!item) return { state, error: '这里换不到这个。' };
  if (here && !isLocationOpen(here, state.period)) return { state, error: '现在不办理兑换。' };
  if (state.points < item.price) return { state, error: `积分不够（需要 ${item.price}，只有 ${state.points}）。` };
  const inventory = addToInventory(state.inventory, { name: item.name, qty: 1, effect: item.effect });
  if (!inventory) return { state, error: '背包满了。' };
  const next = appendRpgLog({ ...state, points: state.points - item.price, inventory }, `兑换 ${item.name}（-${item.price} 积分）`, 'info');
  return { state: next, message: `🧭 兑换：用 ${item.price} 积分换了${item.name}` };
};

export const doWork = (state: TavernRpgState, random: () => number = Math.random): RpgActionResult => {
  const here = getLocation(state, state.currentId);
  if (!here?.services.includes('work') || here.pay <= 0) return { state, error: '这里没有差事可做。' };
  if (!isLocationOpen(here, state.period) || state.period >= 3) return { state, error: '这个时段不用做差事了，先去休息吧。' };
  if (state.stamina < WORK_STAMINA_COST) return { state, error: '体力不够了，先休息。' };
  const next = afterTimeAdvance(appendRpgLog({ ...state, points: state.points + here.pay, stamina: state.stamina - WORK_STAMINA_COST, period: state.period + 1, timeLocked: true }, `在${here.name}做差事（+${here.pay} 积分）`, 'good'), random);
  return { state: next, message: `🧭 差事：在${here.name}忙了一个时段（体力 -${WORK_STAMINA_COST}），等你检查，做好了能得 ${here.pay} 积分。现在是${RPG_PERIOD_LABELS[next.period]}` };
};

/** 进行一门课程：系统掷骰并结算所有数值，AI 只描写过程和反应 */
export const runCourse = (
  input: TavernRpgState,
  courseId: string,
  random: () => number = Math.random,
  options?: { challengePassed?: boolean }
): RpgActionResult => {
  const entry = getCoursesHere(input).find((item) => item.course.id === courseId);
  if (!entry) return { state: input, error: '这里不能进行这门课程。' };
  if (!entry.available) return { state: input, error: entry.reason };
  const { course } = entry;
  let state: TavernRpgState = input;
  let check: RpgCheckResult | undefined;
  let success = true;
  if (course.check) {
    check = rollCheck(state, course.check, random);
    if (options?.challengePassed !== undefined) {
      if (options.challengePassed) {
        success = true;
        check = { ...check, success: true, total: Math.max(check.total, check.dc) };
      } else {
        success = false;
        check = { ...check, success: false };
      }
    } else {
      success = check.success;
    }
    state = recordCheck(state, check);
  }
  const trainee = { ...state.trainee };
  const changes: string[] = [];
  const gain: Partial<RpgTraineeStats> = success ? course.gain : course.check ? { [course.check.stat]: course.check.stat === 'shame' ? -1 : 1 } : {};
  for (const key of STAT_KEYS) {
    const delta = gain[key];
    if (!delta) continue;
    const before = trainee[key];
    trainee[key] = clamp(before + delta, 0, 100);
    if (trainee[key] !== before) changes.push(`${RPG_STAT_LABELS[key]} ${formatSigned(trainee[key] - before)}`);
  }
  const points = success ? course.points : 0;
  const stamina = clamp(state.stamina - course.stamina, 0, 100);
  const stress = clamp(state.stress + course.stress, 0, 100);
  if (points) changes.push(`积分 +${points}`);
  if (stamina !== state.stamina) changes.push(`体力 ${formatSigned(stamina - state.stamina)}`);
  if (stress !== state.stress) changes.push(`压力 ${formatSigned(stress - state.stress)}`);

  const slotIndex = state.plan.findIndex((slot) => slot.courseId === course.id && !slot.done);
  const plan = slotIndex >= 0 ? state.plan.map((slot, i) => (i === slotIndex ? { ...slot, done: true } : slot)) : state.plan;
  state = {
    ...state,
    trainee,
    points: state.points + points,
    stamina,
    stress,
    plan,
    period: Math.min(3, state.period + 1),
    timeLocked: true,
    counters: { ...state.counters, courses: state.counters.courses + 1, aftercare: state.counters.aftercare + (course.id === 'aftercare' ? 1 : 0) },
    today: { ...state.today, courses: state.today.courses + 1 },
  };
  state = appendRpgLog(state, `课程：${course.name}${course.check ? (success ? '（成功）' : '（失败）') : ''}`, success ? 'good' : 'bad');
  state = evaluateProgress(afterTimeAdvance(state, random)).state;

  const lines = [`🧭 课程：${course.name}（${course.description}）${slotIndex >= 0 ? '· 今日课表' : ''}`];
  if (options?.challengePassed !== undefined) {
    lines.push(options.challengePassed ? '📊 具身硬件挑战：达成目标！检定判定通过' : '📊 具身硬件挑战：未达标，检定判定失败');
  }
  if (check) lines.push(formatCheckResult(check));
  lines.push(`系统已结算：${changes.join('、') || '无变化'}。现在是${RPG_PERIOD_LABELS[state.period]}`);
  return { state, message: lines.join('\n'), check };
};

/** 休息：结算当天（日报、课表奖励、家规记录），第二天清晨体力回满、压力下降，并排出新课表 */
export const restUntilMorning = (state: TavernRpgState, random: () => number = Math.random): RpgActionResult => {
  const here = getLocation(state, state.currentId);
  if (!here?.services.includes('rest')) return { state, error: '这里没法休息，回卧室再睡吧。' };
  const finished = state.day;
  const planDone = state.plan.filter((slot) => slot.done).length;
  const bonus = planDone * PLAN_SLOT_BONUS + (state.plan.length > 0 && planDone === state.plan.length ? PLAN_FULL_BONUS : 0);
  const deltas: Partial<RpgTraineeStats> = {};
  for (const key of STAT_KEYS) {
    const delta = state.trainee[key] - state.today.startTrainee[key];
    if (delta) deltas[key] = delta;
  }
  const report: RpgDailyReport = {
    day: finished,
    deltas,
    points: state.points + bonus - state.today.startPoints,
    bonus,
    passed: state.today.passed,
    failed: state.today.failed,
    violations: state.today.violations,
    courses: state.today.courses,
    planDone,
    planTotal: state.plan.length,
  };
  const cleanDays = state.today.violations === 0 ? state.counters.cleanDays + 1 : 0;
  let next: TavernRpgState = {
    ...state,
    day: finished + 1,
    period: 0,
    stamina: 100,
    stress: clamp(state.stress - 30, 0, 100),
    points: state.points + bonus,
    counters: { ...state.counters, cleanDays },
    reports: [...state.reports, report].slice(-MAX_REPORTS),
    choices: [],
    timeLocked: true,
  };
  next = appendRpgLog(next, `第 ${finished} 天结束${bonus ? `，课表奖励 +${bonus}` : ''}`, 'info');
  next = { ...next, today: freshTally(next.trainee, next.points) };
  next = { ...next, plan: buildDailyPlan(next, random) };
  next = afterTimeAdvance(next, random);
  next = evaluateProgress(next).state;

  if (next.dayLimit > 0 && finished >= next.dayLimit && !next.ending) {
    const ending = computeEnding(next.trainee, next.traits);
    next = appendRpgLog({ ...next, ending: { day: finished, ...ending } }, `契约期满：${ending.title}`, 'good');
    next = { ...next, pendingEvents: [...next.pendingEvents.slice(-5), `约定的 ${next.dayLimit} 天到了。结局评价：「${ending.title}」——${ending.summary} 请让${'{{char}}'}回顾这段训练，并问${'{{user}}'}是否愿意续约。`] };
  }

  const summary = [
    `完成课程 ${report.courses} 次`,
    `检定 ${report.passed} 成 ${report.failed} 败`,
    report.planTotal ? `课表 ${planDone}/${report.planTotal}` : '',
    report.violations ? `违反家规 ${report.violations} 次` : '没有违反家规',
    Object.entries(deltas).map(([key, value]) => `${RPG_STAT_LABELS[key as RpgStatKey]} ${formatSigned(value!)}`).join('、'),
    `积分 ${formatSigned(report.points)}${bonus ? `（含课表奖励 ${bonus}）` : ''}`,
  ].filter(Boolean).join('；');
  return { state: next, message: `🧭 休息：第 ${finished} 天结束。今日小结：${summary}。第 ${next.day} 天清晨，我的体力已恢复` };
};

/** 续约：期限再延长 30 天 */
export const renewContract = (state: TavernRpgState, days = 30): TavernRpgState =>
  appendRpgLog({ ...state, dayLimit: Math.max(state.dayLimit, state.day - 1) + days, ending: null }, `续约 ${days} 天`, 'good');

export const itemUseAction = (state: TavernRpgState, itemName: string): RpgActionResult => {
  const own = state.inventory.find((entry) => entry.name === itemName);
  if (!own) return { state, error: '背包里没有这个。' };
  if (own.effect?.pardon) return { state, error: '免罚券会在下次检定失败时自动使用。' };
  if (own.effect?.consumable || (!own.effect?.stamina && !own.effect?.stress && /券$/.test(own.name))) {
    const inventory = state.inventory
      .map((entry) => (entry.name === own.name ? { ...entry, qty: entry.qty - 1 } : entry))
      .filter((entry) => entry.qty > 0);
    return { state: appendRpgLog({ ...state, inventory }, `用掉 ${own.name}`, 'info'), message: `🧭 使用：${own.name}` };
  }
  if (own.effect?.stamina || own.effect?.stress) {
    const staminaGain = Math.min(100 - state.stamina, own.effect.stamina ?? 0);
    const stressDrop = Math.min(state.stress, own.effect.stress ?? 0);
    const inventory = state.inventory
      .map((entry) => (entry.name === own.name ? { ...entry, qty: entry.qty - 1 } : entry))
      .filter((entry) => entry.qty > 0);
    const parts = [staminaGain ? `体力 +${staminaGain}` : '', stressDrop ? `压力 -${stressDrop}` : ''].filter(Boolean).join('，') || '没有变化';
    const next = appendRpgLog({ ...state, stamina: state.stamina + staminaGain, stress: state.stress - stressDrop, inventory }, `用掉 ${own.name}（${parts}）`, 'good');
    return { state: next, message: `🧭 使用：${own.name}（${parts}）` };
  }
  return { state, message: `🧭 使用：${own.name}` };
};

export const consumePardon = (state: TavernRpgState): { state: TavernRpgState; used: boolean } => {
  const own = state.inventory.find((entry) => entry.effect?.pardon && entry.qty > 0);
  if (!own) return { state, used: false };
  const inventory = state.inventory
    .map((entry) => (entry === own ? { ...entry, qty: entry.qty - 1 } : entry))
    .filter((entry) => entry.qty > 0);
  return { state: appendRpgLog({ ...state, inventory }, `用掉一张${own.name}`, 'info'), used: true };
};

// ─── 家规 ──────────────────────────────────────────────────────────────────────

export const addRule = (state: TavernRpgState, text: string, by: RpgRule['by'] = 'user'): RpgActionResult => {
  const cleaned = cleanText(text, 40);
  if (!cleaned) return { state, error: '家规不能为空。' };
  if (state.rules.length >= MAX_RULES) return { state, error: `家规最多 ${MAX_RULES} 条。` };
  if (state.rules.some((rule) => normalizeName(rule.text) === normalizeName(cleaned))) return { state, error: '已经有这条家规了。' };
  const next = appendRpgLog({ ...state, rules: [...state.rules, { text: cleaned, violations: 0, by }] }, `新家规：${cleaned}`, 'info');
  return { state: next };
};

export const removeRule = (state: TavernRpgState, index: number): TavernRpgState => {
  const rule = state.rules[index];
  if (!rule) return state;
  return appendRpgLog({ ...state, rules: state.rules.filter((_, i) => i !== index) }, `撤销家规：${rule.text}`, 'info');
};

const findRule = (state: RpgCore, ref: unknown) => {
  if (typeof ref === 'number' || (typeof ref === 'string' && /^\d+$/.test(ref.trim()))) {
    const index = Number(ref) - 1;
    return state.rules[index] ? index : -1;
  }
  if (typeof ref !== 'string') return -1;
  const target = normalizeName(ref);
  if (!target) return -1;
  return state.rules.findIndex((rule) => {
    const name = normalizeName(rule.text);
    return name === target || name.includes(target) || target.includes(name);
  });
};

// ─── 提示词 ────────────────────────────────────────────────────────────────────

export const buildRpgPrompt = (state: RpgCore, names: { char: string; user: string }) => {
  const user = names.user || '玩家';
  const char = names.char || '调教者';
  const current = getLocation(state, state.currentId);
  const reachable = getReachableLocations(state);
  const activeQuests = state.quests.filter((quest) => quest.status === 'active');
  const inventory = state.inventory.map((item) => (item.qty > 1 ? `${item.name}×${item.qty}` : item.name)).join('、') || '空';
  const dayText = state.dayLimit ? `第 ${state.day} 天（共 ${state.dayLimit} 天）` : `第 ${state.day} 天`;
  const services = current?.services.length ? `（可${current.services.map((service) => RPG_SERVICE_LABELS[service]).join('、')}）` : '';
  const stats = STAT_KEYS.map((key) => `${RPG_STAT_LABELS[key]} ${state.trainee[key]}（${LEVEL_NAMES[statLevel(key, state.trainee[key])]}）`).join('　');
  const traits = state.traits.map((id) => getTrait(id)?.name).filter(Boolean).join('、');
  const courses = getCoursesHere(state).filter((entry) => entry.available).map((entry) => entry.course.name).join('、');
  const plan = state.plan.map((slot) => `${RPG_PERIOD_LABELS[slot.period]}·${findCourse(state, slot.courseId)?.name ?? slot.courseId}${slot.done ? '（已完成）' : ''}`).join('　');
  const rules = state.rules.map((rule, i) => `${i + 1}. ${rule.text}${rule.violations ? `（已违反 ${rule.violations} 次）` : ''}`).join('\n');
  const stressNote = state.stress >= RPG_MAX_STRESS
    ? '（压力已经到了极限：必须停止训练，先安抚和照顾 TA）'
    : state.stress >= RPG_HIGH_STRESS ? '（压力偏高：放慢节奏，多一些安抚）' : '';
  const fill = (text: string) => text.replace(/\{\{char\}\}/g, char).replace(/\{\{user\}\}/g, user);
  const summon = activeSummon(state);
  const milestones = (state.milestones ?? []).slice(-6).map((entry) => `第${entry.day}天${entry.text}`).join('；');
  const recent = state.reports.slice(-3).map((report) => `第${report.day}天课程 ${report.courses} 次、检定 ${report.passed} 成 ${report.failed} 败${report.violations ? `、违规 ${report.violations} 次` : ''}${report.planTotal ? `、课表 ${report.planDone}/${report.planTotal}` : ''}`).join('；');

  const lines = [
    '【训练日程 · 当前状态（由系统维护，以此为准）】',
    `设定：${state.worldName} —— ${state.premise}`,
    `时间：${dayText} · ${RPG_PERIOD_LABELS[state.period] ?? '清晨'}`,
    current ? `所在地点：${current.name}${services} —— ${current.description}` : '',
    `相邻可去：${reachable.map((loc) => `${loc.name}${isLocationOpen(loc, state.period) ? '' : '（此时不开放）'}`).join('、') || '（暂无，可在剧情中发现新地点）'}`,
    `${user}（被调教者）的训练阶段：${STAGES[state.stage]?.name ?? ''}　训练属性：${stats}${traits ? `　特质：${traits}` : ''}`,
    `${user}的体力：${state.stamina}/100${state.stamina < RPG_LOW_STAMINA ? '（已经很累了）' : ''}　压力：${state.stress}/100${stressNote}`,
    `${user}的积分：${state.points}　背包：${inventory}`,
    plan ? `今日课表（系统安排）：${plan}` : '',
    courses ? `这里可以进行的课程：${courses}` : '',
    rules ? `家规：\n${rules}` : '',
    `训练目标：${activeQuests.length ? activeQuests.map((quest) => `${quest.title}（${quest.objective}）`).join('；') : '暂无'}`,
    summon ? `限时传唤：${summon.objective}（没按时到要追究）` : '',
    milestones ? `训练回忆（重要的时刻，可以在对话里提起）：${milestones}` : '',
    recent ? `最近几天：${recent}` : '',
    state.pendingEvents.length ? `【本轮需要回应的事件】\n${state.pendingEvents.map((event) => `- ${fill(event)}`).join('\n')}` : '',
  ].filter(Boolean);

  const rulesText = `【训练规则】
1. 角色关系：你扮演的${char}是调教者，主导每天的日程和课程，根据地点、时段和课表给${user}下达指令、检查表现、给予奖励或惩罚；${user}是被调教的一方。只描写${char}的言行和环境，不要替${user}行动、说话或描写${user}的内心。
2. 用户消息以「🧭」开头的是系统已经完成的动作（前往、课程、兑换、差事、休息、使用物品、开始）；「🎲 检定」是系统掷骰的结果；「系统已结算」后面的数值已经生效。请直接按结果描写${char}的反应和评价，不得改写成败，也不要在标签里重复给这些数值；课程、差事、休息已经推进过时间，这一轮不要再写 time。
3. 只能移动到「相邻可去」且开放的地点。自由互动会消耗${user}的体力：口头规矩 0-5，日常练习 5-15，强度较高的训练 15-30。
4. 训练属性随表现缓慢变化（每项每轮 -3 到 +3，特别好或特别差最多 ±8）：服从=听从指令、耐受=能坚持多久、羞耻=越低越放得开、依恋=对${char}的信赖。做得好可以奖励积分（每轮最多 +30）。
5. ${user}违反家规时，在标签里记下违反了哪一条；你也可以在剧情里立新的家规（每轮最多一条）。
6. ${user}的体力低、压力高、说出安全词或明确拒绝时，立刻停止并照顾 TA，这比任何规矩都优先。
7. 每轮回复末尾（在 STATUS 标签之前）输出一条隐藏标签。只写本轮真正发生了变化的字段，没有变化的字段一律省略；choices 必填。一个典型的例子：
<!--RPG:{"train":{"obedience":"+1"},"stamina":"-5","choices":[{"text":"乖乖照做"},{"text":"坚持保持姿势","check":"endurance:12"},{"text":"小声求饶"}]}-->
可选字段（只在剧情里真的发生时才写，内容要换成实际的名字）：
- train：训练属性增减，键取 obedience/endurance/shame/devotion，如 {"shame":"-2"}
- stamina / stress / points：体力、压力、积分的增减，如 "-8"、"+3"
- time："+1" 表示剧情里过了一个时段
- move：剧情里走到了某个相邻地点，写它的名字
- discover：剧情里出现了新地点，[{"name":名字,"kind":类型,"dir":方位,"desc":一句话}]；kind 取 bedroom/home/bath/playroom/shop/work/cafe/outdoor/special
- items：{"add":[{"name":名字,"qty":数量}],"remove":[名字]}
- rules：{"add":[新家规原文]} 立规；{"violated":[序号]} 记违规——只有${user}这一轮真的违反了才写
- quests：剧情里临时布置的任务，[{"title":名字,"objective":要求,"status":"active/done/failed"}]
choices 是给${user}的 3 个回应选项（以${user}的口吻，每个不超过 20 字，不要重复），需要看${user}能不能做到的写 check（obedience/endurance/shame/devotion + 难度 8-20）。`;

  return `${lines.join('\n')}\n\n${rulesText}`;
};

// ─── 解析 ──────────────────────────────────────────────────────────────────────

export interface RpgUpdate {
  train: Partial<RpgTraineeStats>;
  stamina?: number;
  stress?: number;
  points?: number;
  move?: string;
  discover: Array<{ name: string; kind: RpgLocationKind; dir: string; desc: string; from: string | undefined }>;
  itemsAdd: RpgItem[];
  itemsRemove: RpgItem[];
  rulesAdd: string[];
  rulesViolated: Array<string | number>;
  quests: RpgQuest[];
  time: number;
  choices: RpgChoice[];
}

const RPG_TAG_REGEX = /<!--\s*RPG\s*:?\s*(\{[\s\S]*?\})\s*-->/i;
const RPG_BLOCK_REGEX = /<!--\s*RPG\b[\s\S]*?-->/gi;
const RPG_UNCLOSED_REGEX = /<!--\s*RPG\b[\s\S]*$/i;
const RPG_ALT_BLOCK_REGEX = /<\s*RPG\s*>[\s\S]*?<\/\s*RPG\s*>/gi;
const STREAMING_PARTIAL_COMMENT = /<!?-{0,2}\s*(?:R(?:P(?:G)?)?)?$/i;

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

/** 校验一个自定义地点事件（AI 生成世界或存档读入） */
export const normalizeCustomEvent = (value: unknown, index: number): RpgLocationEvent | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const title = cleanText(raw.title, 10);
  const text = cleanText(raw.text ?? raw.desc, 80);
  if (!title || !text) return null;
  const kinds = (Array.isArray(raw.kinds) ? raw.kinds : [raw.kinds]).map((kind) => normalizeKind(kind)).filter((kind, i, list) => list.indexOf(kind) === i);
  const periods = Array.isArray(raw.periods) ? [...new Set(raw.periods.map((p) => toInt(p, -1)).filter((p) => p >= 0 && p <= 3))] : [];
  const choices = (Array.isArray(raw.choices) ? raw.choices : []).slice(0, 3).flatMap((choice) => {
    if (typeof choice === 'string') {
      const [label, check] = choice.split('|');
      const cleaned = cleanText(label, 20);
      return cleaned ? [{ text: cleaned, check: parseCheck(check) }] : [];
    }
    if (!choice || typeof choice !== 'object') return [];
    const record = choice as Record<string, unknown>;
    const cleaned = cleanText(record.text, 20);
    return cleaned ? [{ text: cleaned, check: parseCheck(record.check ?? (record.stat ? record : undefined)) }] : [];
  });
  return {
    id: typeof raw.id === 'string' && /^aie_[a-z0-9_]{1,24}$/.test(raw.id) ? raw.id : `aie_${index}`,
    title,
    text,
    kinds: kinds.length ? kinds : ['special'],
    periods: periods.length && periods.length < 4 ? periods : undefined,
    choices: choices.length ? choices : [{ text: '照她说的做' }],
  };
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

/** 提示词示例里出现过的占位文字：模型照抄时要丢掉 */
const PLACEHOLDER_TEXTS = new Set(['地点名', '新地点', '一句话描述', '物品', '物品名', '用掉的物品', '新家规', '临时任务', '剧情任务', '要做到什么', '当前目标', '推荐互动一', '推荐互动三', '回应选项', '回应一', '回应二', '回应三'].map((text) => text));
const isPlaceholder = (text: string) => PLACEHOLDER_TEXTS.has(text.trim());

export const parseRpgUpdate = (rawReply: string): RpgUpdate | null => {
  if (!rawReply) return null;
  let payload = rawReply.match(RPG_TAG_REGEX)?.[1] ?? null;
  if (!payload) payload = rawReply.match(/<\s*RPG\s*>\s*(\{[\s\S]*?\})\s*<\/\s*RPG\s*>/i)?.[1] ?? null;
  if (!payload) payload = rawReply.match(/<!--\s*RPG\s*:?\s*(\{[\s\S]*\})/i)?.[1] ?? null;
  if (!payload) return null;
  const raw = parseLooseJson(payload);
  if (!raw) return null;

  const train: Partial<RpgTraineeStats> = {};
  const rawTrain = (raw.train && typeof raw.train === 'object' ? raw.train : {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(rawTrain)) {
    const stat = normalizeStat(key);
    const delta = parseDelta(value);
    if (stat && delta !== undefined) train[stat] = delta;
  }
  const items = (raw.items && typeof raw.items === 'object' ? raw.items : {}) as Record<string, unknown>;
  const rules = (raw.rules && typeof raw.rules === 'object' && !Array.isArray(raw.rules) ? raw.rules : {}) as Record<string, unknown>;
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
  }).filter((choice): choice is RpgChoice => Boolean(choice) && !isPlaceholder(choice!.text));

  return {
    train,
    stamina: parseDelta(raw.stamina),
    stress: parseDelta(raw.stress),
    points: parseDelta(raw.points ?? raw.gold),
    move: (() => { const move = cleanText(raw.move, 16); return move && !isPlaceholder(move) ? move : undefined; })(),
    discover: asArray(raw.discover).map((entry): RpgUpdate['discover'][number] | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const name = cleanText(record.name, 12);
      if (!name || isPlaceholder(name)) return null;
      return {
        name,
        kind: normalizeKind(record.kind),
        dir: cleanText(record.dir ?? record.direction, 4),
        desc: cleanText(record.desc ?? record.description, 60),
        from: cleanText(record.from, 12) || undefined,
      };
    }).filter((entry): entry is RpgUpdate['discover'][number] => Boolean(entry)),
    itemsAdd: asArray(items.add).map(parseItem).filter((item): item is RpgItem => Boolean(item) && !isPlaceholder(item!.name)),
    itemsRemove: asArray(items.remove).map(parseItem).filter((item): item is RpgItem => Boolean(item) && !isPlaceholder(item!.name)),
    rulesAdd: asArray(rules.add).map((text) => cleanText(text, 40)).filter((text) => text && !isPlaceholder(text)),
    rulesViolated: asArray(rules.violated).filter((ref): ref is string | number => typeof ref === 'string' || typeof ref === 'number'),
    quests: asArray(raw.quests).map((entry): RpgQuest | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const title = cleanText(record.title ?? record.name, 20);
      if (!title || isPlaceholder(title)) return null;
      const status = record.status === 'done' || record.status === 'failed' ? record.status : 'active';
      return { title, objective: cleanText(record.objective ?? record.goal, 60), status };
    }).filter((quest): quest is RpgQuest => Boolean(quest)),
    time: clamp(parseDelta(raw.time) ?? 0, 0, 3),
    choices: dedupeChoices(choices).slice(0, 4),
  };
};

// ─── 应用 ──────────────────────────────────────────────────────────────────────

/** 按文字去重（保留先出现的，带检定的优先），避免重复按钮和 React key 冲突 */
const dedupeChoices = (choices: RpgChoice[]) => {
  const result: RpgChoice[] = [];
  for (const choice of choices) {
    const key = normalizeName(choice.text);
    const index = result.findIndex((entry) => normalizeName(entry.text) === key);
    if (index < 0) result.push(choice);
    else if (!result[index].check && choice.check) result[index] = choice;
  }
  return result;
};

export type RpgDiscoverEntry = RpgUpdate['discover'][number] & { open?: number[] };

/** 把新地点挂到当前位置（或指定的已知地点）旁边；同名地点只补连线。AI 剧情发现和「探索周边」共用 */
export const discoverLocations = (input: TavernRpgState, entries: RpgDiscoverEntry[], max: number) => {
  let state = input;
  const notes: RpgLogEntry[] = [];
  const note = (text: string, tone: RpgLogEntry['tone']) => notes.push({ at: Date.now(), text, tone });
  const added: RpgLocation[] = [];
  for (const entry of entries) {
    if (added.length >= max) break;
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
      ...makeLocation(newId('loc'), { name: entry.name, kind: entry.kind, description: entry.desc || '还没去过的地方。', x, y, open: entry.open }, { char: '', user: '' }),
      discovered: true,
    };
    state = { ...state, locations: [...state.locations, location], edges: [...state.edges, [origin.id, location.id]] };
    added.push(location);
    note(`发现新地点：${location.name}`, 'info');
  }
  return { state, notes, added };
};

export interface RpgApplyResult {
  state: TavernRpgState;
  notes: RpgLogEntry[];
  progress: RpgProgress;
  /** AI 没有给出标签（这时保留上一轮的回应选项） */
  missingTag: boolean;
}

const stripSnapshots = (state: TavernRpgState): RpgCore => {
  const { snapshots: _snapshots, ...core } = state;
  return core;
};

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
 * 校验并应用 AI 给出的状态变化（单轮限幅），清掉已经交给 AI 的事件，再判定目标、特质和阶段。
 */
export const applyRpgUpdate = (input: TavernRpgState, update: RpgUpdate | null, random: () => number = Math.random): RpgApplyResult => {
  const eventChoices = input.eventChoices ?? [];
  const timeLocked = input.timeLocked === true;
  let state: TavernRpgState = { ...input, turn: input.turn + 1, pendingEvents: [], eventChoices: [], timeLocked: false };
  const notes: RpgLogEntry[] = [];
  const note = (text: string, tone: RpgLogEntry['tone']) => notes.push({ at: Date.now(), text, tone });

  if (!update) {
    state = appendRpgLog({ ...state, choices: eventChoices.length ? eventChoices : state.choices }, 'AI 这轮没有返回状态标签，保留上一轮的选项', 'warn');
    return { state, notes, progress: evaluateProgress(state), missingTag: true };
  }

  // 1. 新地点
  const found = discoverLocations(state, update.discover, MAX_DISCOVER_PER_TURN);
  state = found.state;
  notes.push(...found.notes);

  // 2. 移动
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

  // 3. 训练属性
  const trainee = { ...state.trainee };
  for (const key of STAT_KEYS) {
    const delta = update.train[key];
    if (!delta) continue;
    const before = trainee[key];
    trainee[key] = clamp(before + clamp(delta, -MAX_STAT_DELTA, MAX_STAT_DELTA), 0, 100);
    if (trainee[key] !== before) {
      const change = trainee[key] - before;
      const good = key === 'shame' ? change < 0 : change > 0;
      note(`${RPG_STAT_LABELS[key]} ${formatSigned(change)}`, good ? 'good' : 'info');
    }
  }
  state = { ...state, trainee };

  // 4. 体力、压力、积分
  if (update.stamina) {
    const before = state.stamina;
    state = { ...state, stamina: clamp(before + clamp(update.stamina, -40, 60), 0, 100) };
    if (state.stamina !== before) note(`体力 ${formatSigned(state.stamina - before)}`, state.stamina > before ? 'good' : 'info');
  }
  if (update.stress) {
    const before = state.stress;
    state = { ...state, stress: clamp(before + clamp(update.stress, -30, 15), 0, 100) };
    if (state.stress !== before) note(`压力 ${formatSigned(state.stress - before)}`, state.stress < before ? 'good' : 'info');
  }
  if (update.points) {
    const next = Math.max(0, state.points + clamp(update.points, -30, 30));
    if (next !== state.points) {
      note(`积分 ${formatSigned(next - state.points)}`, next > state.points ? 'good' : 'bad');
      state = { ...state, points: next };
    }
  }

  // 5. 物品
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
    const next = addToInventory(inventory, { name: item.name, qty: item.qty });
    if (!next) {
      note(`背包满了，放不下「${item.name}」`, 'warn');
      continue;
    }
    inventory = next;
    note(`获得 ${item.name}${item.qty > 1 ? `×${item.qty}` : ''}`, 'good');
  }
  state = { ...state, inventory };

  // 6. 家规：调教者每轮最多立一条；违规计数并扣分
  if (update.rulesAdd[0]) {
    const added = addRule(state, update.rulesAdd[0], 'trainer');
    if (!added.error) {
      state = added.state;
      note(`${'调教者'}立下新家规：${update.rulesAdd[0]}`, 'info');
    }
  }
  const violated = new Set<number>();
  for (const ref of update.rulesViolated.slice(0, 3)) {
    const index = findRule(state, ref);
    if (index >= 0) violated.add(index);
  }
  if (violated.size) {
    const rules = state.rules.map((rule, i) => (violated.has(i) ? { ...rule, violations: rule.violations + 1 } : rule));
    const penalty = Math.min(state.points, VIOLATION_POINTS * violated.size);
    state = {
      ...state,
      rules,
      points: state.points - penalty,
      stress: clamp(state.stress + 3 * violated.size, 0, 100),
      counters: { ...state.counters, violations: state.counters.violations + violated.size },
      today: { ...state.today, violations: state.today.violations + violated.size },
    };
    for (const index of violated) note(`违反家规：${state.rules[index].text}`, 'bad');
    if (penalty) note(`积分 -${penalty}`, 'bad');
  }

  // 7. 剧情任务（系统判定的目标不接受 AI 改动）
  let quests = state.quests.map((quest) => ({ ...quest }));
  for (const quest of update.quests) {
    const own = quests.find((entry) => normalizeName(entry.title) === normalizeName(quest.title));
    if (own) {
      // 系统判定的目标和传唤任务只由系统结算
      if (own.status !== 'active' || own.condition || own.target) continue;
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

  // 8. 时间：最多推进到深夜，跨天要回卧室休息
  if (update.time > 0 && !timeLocked) {
    const period = Math.min(3, state.period + update.time);
    if (period !== state.period) state = afterTimeAdvance({ ...state, period }, random);
  }

  // 地点事件给出的回应排在前面，AI 自己的选项补在后面
  const merged = dedupeChoices([...eventChoices, ...update.choices]).slice(0, 4);
  state = { ...state, choices: merged.length ? merged : state.choices };
  for (const entry of notes) state = appendRpgLog(state, entry.text, entry.tone);
  const progress = evaluateProgress(state);
  return { state: progress.state, notes, progress, missingTag: false };
};

// ─── 存储 ──────────────────────────────────────────────────────────────────────

const normalizeHardware = (value: unknown): RpgHardwareSettings => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    punishOnFail: raw.punishOnFail === true,
    punishLevel: clamp(toInt(raw.punishLevel, 15), 1, 200),
    punishSeconds: clamp(toInt(raw.punishSeconds, 2), 1, 5),
    rewardOnSuccess: raw.rewardOnSuccess === true,
    punishOnViolation: raw.punishOnViolation === true,
    punishOnSummonOverdue: raw.punishOnSummonOverdue === true,
    wearToyOnErrands: raw.wearToyOnErrands === true,
    wearToyLevel: clamp(toInt(raw.wearToyLevel, 2), 1, 5),
    sensorChallengesEnabled: raw.sensorChallengesEnabled !== false,
  };
};

const normalizeStats = (value: unknown, fallback: RpgTraineeStats): RpgTraineeStats => {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<RpgTraineeStats>;
  return Object.fromEntries(STAT_KEYS.map((key) => [key, clamp(toInt(raw[key], fallback[key]), 0, 100)])) as RpgTraineeStats;
};

export const normalizeRpgState = (value: unknown): TavernRpgState | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as TavernRpgState;
  if (raw.version !== 4 || !Array.isArray(raw.locations) || !raw.locations.length) return null;
  const ids = new Set(raw.locations.map((loc) => loc.id));
  const currentId = ids.has(raw.currentId) ? raw.currentId : raw.locations[0].id;
  const trainee = normalizeStats(raw.trainee, DEFAULT_TRAINEE);
  const counters = (raw.counters && typeof raw.counters === 'object' ? raw.counters : freshCounters()) as RpgCounters;
  const points = Math.max(0, toInt(raw.points, 0));
  const customCourses = (Array.isArray(raw.customCourses) ? raw.customCourses : []).slice(0, 4).map(normalizeCustomCourse).filter((course): course is RpgCourse => Boolean(course));
  const customEvents = (Array.isArray(raw.customEvents) ? raw.customEvents : []).slice(0, 8).map(normalizeCustomEvent).filter((event): event is RpgLocationEvent => Boolean(event));
  const numberRecord = (value: unknown) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([, day]) => Number.isFinite(Number(day))).map(([key, day]) => [key, Number(day)]));
  return {
    ...raw,
    runId: typeof raw.runId === 'string' && raw.runId ? raw.runId : `run_legacy_${raw.templateId ?? 'x'}_${raw.locations[0].id}`,
    timeLocked: raw.timeLocked === true,
    currentId,
    homeId: ids.has(raw.homeId) ? raw.homeId : currentId,
    locations: raw.locations.map((loc) => ({
      ...loc,
      services: Array.isArray(loc.services) ? loc.services : [],
      catalog: Array.isArray(loc.catalog) ? loc.catalog : [],
      pay: toInt(loc.pay, 0),
      open: Array.isArray(loc.open) ? loc.open.filter((p) => Number.isInteger(p) && p >= 0 && p <= 3) : [],
    })),
    edges: (raw.edges || []).filter(([a, b]) => ids.has(a) && ids.has(b)),
    points,
    stamina: clamp(toInt(raw.stamina, 100), 0, 100),
    stress: clamp(toInt(raw.stress, 0), 0, 100),
    trainee,
    traits: Array.isArray(raw.traits) ? raw.traits.filter((id) => getTrait(id)) : [],
    counters: {
      passes: normalizeStats(counters.passes, zeroStats()),
      fails: normalizeStats(counters.fails, zeroStats()),
      courses: Math.max(0, toInt(counters.courses, 0)),
      violations: Math.max(0, toInt(counters.violations, 0)),
      aftercare: Math.max(0, toInt(counters.aftercare, 0)),
      cleanDays: Math.max(0, toInt(counters.cleanDays, 0)),
    },
    stage: clamp(toInt(raw.stage, stageIndex(trainee)), 0, STAGES.length - 1),
    rules: Array.isArray(raw.rules) ? raw.rules.slice(0, MAX_RULES) : [],
    period: clamp(toInt(raw.period, 0), 0, 3),
    day: Math.max(1, toInt(raw.day, 1)),
    dayLimit: clamp(toInt(raw.dayLimit, 0), 0, 3650),
    plan: Array.isArray(raw.plan) ? raw.plan.filter((slot) => getCourse(slot.courseId) || customCourses.some((course) => course.id === slot.courseId)) : [],
    customCourses,
    customEvents,
    eventsSeen: numberRecord(raw.eventsSeen),
    eventDays: numberRecord(raw.eventDays),
    eventChoices: Array.isArray(raw.eventChoices) ? raw.eventChoices.slice(0, 4) : [],
    milestones: Array.isArray(raw.milestones) ? raw.milestones.filter((entry) => entry && typeof entry.text === 'string').slice(-MAX_MILESTONES) : [],
    today: raw.today && typeof raw.today === 'object' ? { ...raw.today, startTrainee: normalizeStats(raw.today.startTrainee, trainee) } : freshTally(trainee, points),
    reports: Array.isArray(raw.reports) ? raw.reports.slice(-MAX_REPORTS) : [],
    ending: raw.ending && typeof raw.ending === 'object' ? raw.ending : null,
    pendingEvents: Array.isArray(raw.pendingEvents) ? raw.pendingEvents.slice(-6) : [],
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

/** 保存当前进度；存储满了时先丢掉回滚快照再试一次，仍失败返回 false 让界面提示 */
export const saveRpgState = (cardId: string, state: TavernRpgState | null): boolean => {
  if (!cardId) return true;
  const key = `${STORAGE_PREFIX}${cardId}`;
  try {
    if (state) localStorage.setItem(key, JSON.stringify(state));
    else localStorage.removeItem(key);
    return true;
  } catch (error) {
    if (state?.snapshots.length) {
      try {
        localStorage.setItem(key, JSON.stringify({ ...state, snapshots: [] }));
        return true;
      } catch {
        // fall through
      }
    }
    console.error('Failed to save RPG state:', error);
    return false;
  }
};

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
