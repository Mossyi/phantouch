/**
 * 训练日程的四项本地规则：四档检定、对赌、导演转折、称号。
 * 不发起模型请求，也不改硬件开关。旧存档缺这些字段时按默认补上。
 *
 * 检定四档（d20 + 修正，自然 20 / 自然 1 优先）：
 * - 大成功：掷出 20。
 * - 成功：合计比难度高 3 点及以上。
 * - 勉强成功：合计刚好达到难度，或只高出 1～2 点。仍算通过，但压力 +3。
 * - 失败：合计低于难度。自然 1 记为大失败，数值结算与失败相同。
 *
 * 对赌（先从现有积分里扣下，上限就是当前积分）：
 * - 大成功返还 3 倍（净赚 2 倍）
 * - 成功返还 2 倍（净赚 1 倍）
 * - 勉强成功原数退回
 * - 失败或大失败没收
 * 不押（0）不改变连胜。连胜只算押了注并且大成功或成功。
 *
 * 导演转折：连续平静回合（没有检定、地点事件或单项属性变化达到 3）累加。
 * 默认第 3 个平静回合起显示倒计时，第 6 个平静回合推入一条变数并清零。可关闭。
 */

export type CheckTier = 'crit' | 'success' | 'costly' | 'fail' | 'critFail';

export const CHECK_TIER_LABEL: Record<CheckTier, string> = {
  crit: '大成功',
  success: '成功',
  costly: '勉强成功',
  fail: '失败',
  critFail: '大失败',
};

export const COSTLY_STRESS = 3;
export const WAGER_PRESETS = [0, 2, 5, 10] as const;
export const WAGER_MULTIPLIER: Record<CheckTier, number> = {
  crit: 3,
  success: 2,
  costly: 1,
  fail: 0,
  critFail: 0,
};

export const TENSION_WARN_AT = 3;
export const TENSION_LIMIT = 6;
export const CALM_STAT_DELTA = 3;

export interface CheckClassification {
  tier: CheckTier;
  success: boolean;
  critical: 'success' | 'fail' | null;
  total: number;
  cost: { stress: number };
}

export interface CheckChances {
  faces: 20;
  successFaces: number;
  successPercent: number;
  crit: number;
  success: number;
  costly: number;
  fail: number;
  critFail: number;
}

export interface WagerSettlement {
  stake: number;
  multiplier: number;
  returned: number;
  net: number;
  points: number;
}

export interface RollRecord {
  id: string;
  day: number;
  stat: string;
  dc: number;
  roll: number;
  mod: number;
  total: number;
  tier: CheckTier;
  stake: number;
  net: number;
}

export interface CardTwist {
  id: string;
  text: string;
  used: boolean;
}

export interface TensionState {
  enabled: boolean;
  calm: number;
  warnAt: number;
  limit: number;
  twists: CardTwist[];
  seen: string[];
}

export interface AchievementView {
  id: string;
  title: string;
  hint: string;
  unlocked: boolean;
}

export interface FunBook {
  rollHistory: RollRecord[];
  wagerStreak: number;
  wagerBest: number;
  tension: TensionState;
  unlocked: string[];
  equipped: string | null;
  toasts: string[];
  crits: number;
  checks: number;
  costly: number;
  twists: number;
  planClears: number;
  endingsSeen: string[];
}

export interface AchievementProbe {
  day: number;
  points: number;
  stage: number;
  gameMode: string;
  cleanDays: number;
  courses: number;
  traits: number;
  devotion: number;
  shame: number;
  crits: number;
  checks: number;
  costly: number;
  wagerBest: number;
  twists: number;
  planClears: number;
  endings: number;
}

interface AchievementDef {
  id: string;
  title: string;
  hint: string;
  met: (probe: AchievementProbe) => boolean;
}

export const RPG_ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_check', title: '初次应答', hint: '完成第一次检定', met: (probe) => probe.checks >= 1 },
  { id: 'first_crit', title: '天选的一次', hint: '第一次大成功', met: (probe) => probe.crits >= 1 },
  { id: 'first_costly', title: '擦线过关', hint: '第一次勉强成功', met: (probe) => probe.costly >= 1 },
  { id: 'clean_week', title: '守规的人', hint: '连续 7 天没有违反家规', met: (probe) => probe.cleanDays >= 7 },
  { id: 'wager_streak', title: '手气正旺', hint: '对赌连胜 3 次', met: (probe) => probe.wagerBest >= 3 },
  { id: 'points_100', title: '小金库', hint: '积分达到 100', met: (probe) => probe.points >= 100 },
  { id: 'stage_three', title: '渐入佳境', hint: '训练阶段到达第三阶', met: (probe) => probe.stage >= 2 },
  { id: 'devotion_80', title: '心里有人', hint: '依恋达到 80', met: (probe) => probe.devotion >= 80 },
  { id: 'shame_open', title: '放得开', hint: '羞耻降到 30 或以下', met: (probe) => probe.shame <= 30 },
  { id: 'traits_3', title: '习以为常', hint: '获得 3 个特质', met: (probe) => probe.traits >= 3 },
  { id: 'day_14', title: '住下来了', hint: '训练满 14 天', met: (probe) => probe.day >= 14 },
  { id: 'hardcore_3', title: '硬扛过来', hint: '硬核模式撑过 3 天', met: (probe) => probe.gameMode === 'hardcore' && probe.day >= 3 },
  { id: 'twist_1', title: '被生活撞见', hint: '经历一次导演转折', met: (probe) => probe.twists >= 1 },
  { id: 'plan_clear', title: '今天没落下', hint: '课表全勤一次', met: (probe) => probe.planClears >= 1 },
  { id: 'courses_10', title: '课已经上顺', hint: '完成 10 次课程', met: (probe) => probe.courses >= 10 },
  { id: 'endings_5', title: '故事收藏家', hint: '结局图鉴解锁 5 个', met: (probe) => probe.endings >= 5 },
];

export const BUILTIN_TWISTS = [
  { id: 'knock', text: '门外忽然有人来访，这一刻的安静被敲碎了。' },
  { id: 'rain_stop', text: '天气忽然变了，窗外的光线和刚才完全不一样。' },
  { id: 'letter', text: '一张没有署名的纸条出现在手边，只写了一句让人在意的话。' },
  { id: 'neighbor', text: '隔壁传来动静，有人好像在听你们这边。' },
  { id: 'memory', text: '一件旧东西忽然被翻出来，勾起一段还没说完的往事。' },
  { id: 'deadline', text: '一个原本还早的约定被提前，今天之内就要给答复。' },
];

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

export const classifyRoll = (roll: number, mod: number, dc: number): CheckClassification => {
  const face = Math.min(20, Math.max(1, Math.round(roll)));
  const total = face + mod;
  if (face === 1) return { tier: 'critFail', success: false, critical: 'fail', total, cost: { stress: 0 } };
  if (face === 20) return { tier: 'crit', success: true, critical: 'success', total, cost: { stress: 0 } };
  if (total >= dc + 3) return { tier: 'success', success: true, critical: null, total, cost: { stress: 0 } };
  if (total >= dc) return { tier: 'costly', success: true, critical: null, total, cost: { stress: COSTLY_STRESS } };
  return { tier: 'fail', success: false, critical: null, total, cost: { stress: 0 } };
};

export const checkChances = (mod: number, dc: number): CheckChances => {
  const counts: Record<CheckTier, number> = { crit: 0, success: 0, costly: 0, fail: 0, critFail: 0 };
  for (let face = 1; face <= 20; face += 1) counts[classifyRoll(face, mod, dc).tier] += 1;
  const successFaces = counts.crit + counts.success + counts.costly;
  return {
    faces: 20,
    successFaces,
    successPercent: Math.round((successFaces / 20) * 100),
    crit: counts.crit,
    success: counts.success,
    costly: counts.costly,
    fail: counts.fail,
    critFail: counts.critFail,
  };
};

export const formatTierLine = (tier: CheckTier, costStress = 0) => (
  tier === 'costly' && costStress > 0 ? `${CHECK_TIER_LABEL[tier]}（付出代价：压力 +${costStress}）` : CHECK_TIER_LABEL[tier]
);

export const capStake = (points: number, requested: number) => Math.max(0, Math.min(Math.floor(points), Math.floor(Number.isFinite(requested) ? requested : 0)));

export const settleWager = (points: number, requestedStake: number, tier: CheckTier): WagerSettlement => {
  const stake = capStake(points, requestedStake);
  const multiplier = WAGER_MULTIPLIER[tier];
  const returned = stake * multiplier;
  return { stake, multiplier, returned, net: returned - stake, points: points - stake + returned };
};

export const wagerNote = (settlement: WagerSettlement) => {
  if (!settlement.stake) return '';
  if (settlement.net > 0) return `押注 ${settlement.stake}，返还 ${settlement.returned}（净赚 ${settlement.net}）`;
  if (settlement.net === 0) return `押注 ${settlement.stake}，原数退回`;
  return `押注 ${settlement.stake}，没收`;
};

export const nextWagerStreak = (streak: number, stake: number, tier: CheckTier) => {
  if (!stake) return streak;
  return tier === 'crit' || tier === 'success' ? streak + 1 : 0;
};

const cleanTwist = (value: unknown, index: number): CardTwist | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 80) : '';
  if (!text) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 40) : `twist_${index}`;
  return { id, text, used: raw.used === true };
};

export const readCardTwists = (card: unknown): CardTwist[] => {
  const raw = asObject(card);
  const extensions = asObject(raw.extensions);
  const yiciyuan = asObject(extensions.yiciyuan);
  const list = raw.rpgTwists ?? yiciyuan.rpgTwists;
  if (!Array.isArray(list)) return [];
  const twists: CardTwist[] = [];
  list.slice(0, 8).forEach((item, index) => {
    const twist = cleanTwist(item, index);
    if (twist && !twists.some((entry) => entry.id === twist.id)) twists.push({ ...twist, used: false });
  });
  return twists;
};

export const emptyTension = (twists: CardTwist[] = []): TensionState => ({
  enabled: true,
  calm: 0,
  warnAt: TENSION_WARN_AT,
  limit: TENSION_LIMIT,
  twists,
  seen: [],
});

export const normalizeTension = (value: unknown, fallbackTwists: CardTwist[] = []): TensionState => {
  const raw = asObject(value);
  const twists = Array.isArray(raw.twists) ? raw.twists.map(cleanTwist).filter((item): item is CardTwist => Boolean(item)).slice(0, 8) : fallbackTwists;
  return {
    enabled: raw.enabled !== false,
    calm: clampInt(raw.calm, 0, 99, 0),
    warnAt: clampInt(raw.warnAt, 1, 12, TENSION_WARN_AT),
    limit: clampInt(raw.limit, 2, 20, TENSION_LIMIT),
    twists,
    seen: Array.isArray(raw.seen) ? raw.seen.filter((item): item is string => typeof item === 'string').slice(-24) : [],
  };
};

export const emptyFun = (twists: CardTwist[] = []): FunBook => ({
  rollHistory: [],
  wagerStreak: 0,
  wagerBest: 0,
  tension: emptyTension(twists),
  unlocked: [],
  equipped: null,
  toasts: [],
  crits: 0,
  checks: 0,
  costly: 0,
  twists: 0,
  planClears: 0,
  endingsSeen: [],
});

const normalizeRoll = (value: unknown): RollRecord | null => {
  const raw = asObject(value);
  if (typeof raw.stat !== 'string' || typeof raw.tier !== 'string' || !(raw.tier in CHECK_TIER_LABEL)) return null;
  return {
    id: typeof raw.id === 'string' ? raw.id.slice(0, 40) : `roll_${raw.day ?? 0}`,
    day: clampInt(raw.day, 1, 9999, 1),
    stat: raw.stat,
    dc: clampInt(raw.dc, 1, 40, 10),
    roll: clampInt(raw.roll, 1, 20, 1),
    mod: clampInt(raw.mod, -20, 20, 0),
    total: clampInt(raw.total, -20, 60, 0),
    tier: raw.tier as CheckTier,
    stake: clampInt(raw.stake, 0, 9999, 0),
    net: clampInt(raw.net, -9999, 9999, 0),
  };
};

export const normalizeFun = (value: unknown): FunBook => {
  const raw = asObject(value);
  const base = emptyFun();
  const unlocked = Array.isArray(raw.unlocked) ? raw.unlocked.filter((item): item is string => typeof item === 'string' && RPG_ACHIEVEMENTS.some((entry) => entry.id === item)) : [];
  const equipped = typeof raw.equipped === 'string' && unlocked.includes(raw.equipped) ? raw.equipped : null;
  return {
    rollHistory: Array.isArray(raw.rollHistory) ? raw.rollHistory.map(normalizeRoll).filter((item): item is RollRecord => Boolean(item)).slice(-8) : [],
    wagerStreak: clampInt(raw.wagerStreak, 0, 999, 0),
    wagerBest: clampInt(raw.wagerBest, 0, 999, 0),
    tension: normalizeTension(raw.tension),
    unlocked,
    equipped,
    toasts: Array.isArray(raw.toasts) ? raw.toasts.filter((item): item is string => typeof item === 'string').slice(-3) : base.toasts,
    crits: clampInt(raw.crits, 0, 9999, 0),
    checks: clampInt(raw.checks, 0, 9999, 0),
    costly: clampInt(raw.costly, 0, 9999, 0),
    twists: clampInt(raw.twists, 0, 9999, 0),
    planClears: clampInt(raw.planClears, 0, 9999, 0),
    endingsSeen: Array.isArray(raw.endingsSeen) ? raw.endingsSeen.filter((item): item is string => typeof item === 'string').slice(-30) : [],
  };
};

export const tensionCountdown = (tension: TensionState): number | null => {
  if (!tension.enabled || tension.calm < tension.warnAt || tension.calm >= tension.limit) return null;
  return tension.limit - tension.calm;
};

export interface TwistPick {
  id: string;
  text: string;
  source: 'card' | 'custom' | 'builtin';
}

export const pickTwist = (
  tension: TensionState,
  customEvents: Array<{ id: string; title: string; text: string }>,
): { tension: TensionState; twist: TwistPick } => {
  const card = tension.twists.find((twist) => !twist.used);
  if (card) {
    return {
      tension: { ...tension, twists: tension.twists.map((twist) => twist.id === card.id ? { ...twist, used: true } : twist), seen: [...tension.seen, card.id].slice(-24) },
      twist: { id: card.id, text: card.text, source: 'card' },
    };
  }
  const custom = customEvents.find((event) => event.text && !tension.seen.includes(event.id));
  if (custom) {
    return {
      tension: { ...tension, seen: [...tension.seen, custom.id].slice(-24) },
      twist: { id: custom.id, text: `${custom.title}：${custom.text}`, source: 'custom' },
    };
  }
  const builtin = BUILTIN_TWISTS.find((twist) => !tension.seen.includes(twist.id)) ?? BUILTIN_TWISTS[tension.seen.length % BUILTIN_TWISTS.length];
  return {
    tension: { ...tension, seen: [...tension.seen, builtin.id].slice(-24) },
    twist: { id: builtin.id, text: builtin.text, source: 'builtin' },
  };
};

export const advanceCalm = (tension: TensionState, calmTurn: boolean) => {
  if (!tension.enabled) return { tension, fired: false as const };
  if (!calmTurn) return { tension: { ...tension, calm: 0 }, fired: false as const };
  const calm = tension.calm + 1;
  if (calm >= tension.limit) return { tension: { ...tension, calm }, fired: true as const };
  return { tension: { ...tension, calm }, fired: false as const };
};

export const achievementProbe = (book: FunBook, extra: Omit<AchievementProbe, 'crits' | 'checks' | 'costly' | 'wagerBest' | 'twists' | 'planClears' | 'endings'>): AchievementProbe => ({
  ...extra,
  crits: book.crits,
  checks: book.checks,
  costly: book.costly,
  wagerBest: book.wagerBest,
  twists: book.twists,
  planClears: book.planClears,
  endings: book.endingsSeen.length,
});

export const syncAchievements = (book: FunBook, probe: AchievementProbe): { book: FunBook; unlockedNow: string[] } => {
  const unlockedNow = RPG_ACHIEVEMENTS.filter((entry) => !book.unlocked.includes(entry.id) && entry.met(probe)).map((entry) => entry.id);
  if (!unlockedNow.length) return { book, unlockedNow };
  const titles = unlockedNow.map((id) => RPG_ACHIEVEMENTS.find((entry) => entry.id === id)?.title).filter((title): title is string => Boolean(title));
  return {
    book: {
      ...book,
      unlocked: [...book.unlocked, ...unlockedNow],
      toasts: [...book.toasts, ...titles.map((title) => `获得称号：${title}`)].slice(-3),
    },
    unlockedNow,
  };
};

export const listAchievements = (unlocked: string[]): AchievementView[] => RPG_ACHIEVEMENTS.map((entry) => ({
  id: entry.id,
  title: entry.title,
  hint: entry.hint,
  unlocked: unlocked.includes(entry.id),
}));

export const equippedTitle = (book: FunBook) => (
  book.equipped ? RPG_ACHIEVEMENTS.find((entry) => entry.id === book.equipped)?.title ?? null : null
);
