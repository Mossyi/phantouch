export type BountyQuestCategory =
  | 'ems_endurance'
  | 'femboy_habit'
  | 'tavern_chat'
  | 'edging_brake'
  | 'tavern_diary'
  | 'tavern_card'
  | 'tavern_image';

export interface BountyQuest {
  id: string;
  title: string;
  category: BountyQuestCategory;
  tag: string;
  description: string;
  targetCount: number;
  currentCount: number;
  rewardExp: number;
  rewardTitle?: string;
  requiredLevel: number;
  status: 'available' | 'in_progress' | 'claimable' | 'completed';
  difficulty: '★☆☆' | '★★☆' | '★★★' | '★★★★' | '★★★★★';
  minimumStrength?: number;
  requiredWave?: string;
}

export interface BountyProfile {
  exp: number;
  level: number;
  rankTitle: string;
  nextLevelExp: number | null;
  progressToNextLevel: number;
  completedQuestCount: number;
}

const BOUNTY_RANKS = [
  { level: 1, title: '见习旅人', requiredExp: 0 },
  { level: 2, title: '酒馆熟客', requiredExp: 300 },
  { level: 3, title: '月影行者', requiredExp: 800 },
  { level: 4, title: '星火探险家', requiredExp: 1_600 },
  { level: 5, title: '秘境领航员', requiredExp: 2_800 },
  { level: 6, title: '传说赏金客', requiredExp: 4_500 },
  { level: 7, title: '深渊名宿', requiredExp: 6_800 },
] as const;

const CANONICAL_BOUNTY_QUESTS: readonly BountyQuest[] = [
  { id: 'quest_1', title: '深渊初啼：累计启动 15 次 20 档微电流', category: 'ems_endurance', tag: '电击耐受', description: '在酒馆或硬件调控中，累计启动 15 次 20 档以上的 EMS；每次实际下发成功后计数。', targetCount: 15, currentCount: 0, rewardExp: 300, rewardTitle: '【微电适应者】', requiredLevel: 1, status: 'in_progress', difficulty: '★☆☆', minimumStrength: 20 },
  { id: 'quest_2', title: '绝壁急刹：在酒馆中触发 3 次高潮急刹', category: 'edging_brake', tag: '生理急刹', description: '在边缘控制中达到临界状态，累计触发 3 次安全急刹协议。', targetCount: 3, currentCount: 0, rewardExp: 500, rewardTitle: '【绝顶断念者】', requiredLevel: 2, status: 'available', difficulty: '★★★' },
  { id: 'quest_3', title: '娇柔侍从：完成 1 次每日伪娘打卡日记', category: 'femboy_habit', tag: '身心重塑', description: '在酒馆日记页完成一次真实的每日训练记录。', targetCount: 1, currentCount: 0, rewardExp: 400, rewardTitle: '【初级女仆侍从】', requiredLevel: 1, status: 'in_progress', difficulty: '★★☆' },
  { id: 'quest_4', title: '深渊同调：完成 20 轮酒馆角色扮演', category: 'tavern_chat', tag: '酒馆语C', description: '在魅魔酒馆完成至少 20 轮真实的角色扮演对谈。', targetCount: 20, currentCount: 0, rewardExp: 600, rewardTitle: '【魅魔心腹】', requiredLevel: 1, status: 'in_progress', difficulty: '★★☆' },
  { id: 'quest_5', title: '狂暴突破：累计启动 10 次 50 档锯齿波', category: 'ems_endurance', tag: '极限惩教', description: '累计实际启动 10 次 50 档以上锯齿波；未满足波形与强度条件时不计数。', targetCount: 10, currentCount: 0, rewardExp: 1_000, rewardTitle: '【深渊金刚不坏】', requiredLevel: 5, status: 'available', difficulty: '★★★★★', minimumStrength: 50, requiredWave: 'sawtooth_grind' },
  { id: 'quest_6', title: '初入酒馆：完成 5 轮角色对谈', category: 'tavern_chat', tag: '冒险启程', description: '与任意已选角色完成 5 次成功回复，熟悉酒馆的叙事节奏。', targetCount: 5, currentCount: 0, rewardExp: 120, rewardTitle: '【初识酒馆】', requiredLevel: 1, status: 'in_progress', difficulty: '★☆☆' },
  { id: 'quest_7', title: '长夜漫谈：完成 50 轮角色对谈', category: 'tavern_chat', tag: '剧情沉浸', description: '在任意角色会话中累计获得 50 次成功回复。', targetCount: 50, currentCount: 0, rewardExp: 320, rewardTitle: '【夜谈常客】', requiredLevel: 2, status: 'available', difficulty: '★★☆' },
  { id: 'quest_8', title: '群星剧本：完成 120 轮角色对谈', category: 'tavern_chat', tag: '叙事远征', description: '持续推进不同剧情，累计完成 120 次成功角色回复。', targetCount: 120, currentCount: 0, rewardExp: 720, rewardTitle: '【群像编剧】', requiredLevel: 4, status: 'available', difficulty: '★★★★' },
  { id: 'quest_9', title: '月度札记：写下 3 篇酒馆日记', category: 'tavern_diary', tag: '记忆收集', description: '在日记页生成并保存 3 篇不同日期的记录。', targetCount: 3, currentCount: 0, rewardExp: 350, rewardTitle: '【月影记录者】', requiredLevel: 2, status: 'available', difficulty: '★★☆' },
  { id: 'quest_10', title: '七日信札：写下 7 篇酒馆日记', category: 'tavern_diary', tag: '长期远征', description: '以不同日期完成 7 篇酒馆日记，建立可回顾的冒险轨迹。', targetCount: 7, currentCount: 0, rewardExp: 780, rewardTitle: '【时光守望者】', requiredLevel: 4, status: 'available', difficulty: '★★★★' },
  { id: 'quest_11', title: '角色匠人：完成 1 张本地角色卡', category: 'tavern_card', tag: '工坊创作', description: '通过 AI 写卡、编辑保存或导入，整理一张可用的本地角色卡。', targetCount: 1, currentCount: 0, rewardExp: 260, rewardTitle: '【角色匠人】', requiredLevel: 2, status: 'available', difficulty: '★★☆' },
  { id: 'quest_12', title: '百面剧团：完成 3 张本地角色卡', category: 'tavern_card', tag: '角色收藏', description: '累计建立或整理 3 张不同的本地角色卡。', targetCount: 3, currentCount: 0, rewardExp: 540, rewardTitle: '【剧团收藏家】', requiredLevel: 4, status: 'available', difficulty: '★★★' },
  { id: 'quest_13', title: '画境初探：完成 1 次 AI 场景生图', category: 'tavern_image', tag: '幻境绘制', description: '在酒馆对话中成功生成并保存 1 张 AI 场景图。', targetCount: 1, currentCount: 0, rewardExp: 240, rewardTitle: '【画境旅人】', requiredLevel: 2, status: 'available', difficulty: '★★☆' },
  { id: 'quest_14', title: '镜中剧场：完成 3 次 AI 场景生图', category: 'tavern_image', tag: '视觉叙事', description: '为不同剧情累计生成 3 张可用的 AI 场景图。', targetCount: 3, currentCount: 0, rewardExp: 520, rewardTitle: '【幻境导演】', requiredLevel: 4, status: 'available', difficulty: '★★★' },
  { id: 'quest_15', title: '稳态操控：累计启动 8 次 35 档 EMS', category: 'ems_endurance', tag: '硬件实训', description: '累计 8 次实际执行成功、强度达到 35 档的 EMS 输出。', targetCount: 8, currentCount: 0, rewardExp: 560, rewardTitle: '【稳态操控者】', requiredLevel: 3, status: 'available', difficulty: '★★★', minimumStrength: 35 },
  { id: 'quest_16', title: '临界见习：触发 1 次安全急刹', category: 'edging_brake', tag: '自控训练', description: '完成一次已进入临界状态后的安全急刹，不要求额外硬件输出。', targetCount: 1, currentCount: 0, rewardExp: 280, rewardTitle: '【临界守望者】', requiredLevel: 2, status: 'available', difficulty: '★★☆' },
  { id: 'quest_17', title: '守界专家：触发 6 次安全急刹', category: 'edging_brake', tag: '边界掌控', description: '在边缘控制玩法中累计完成 6 次安全急刹协议。', targetCount: 6, currentCount: 0, rewardExp: 850, rewardTitle: '【边界掌控者】', requiredLevel: 5, status: 'available', difficulty: '★★★★★' },
];

const cloneCanonicalQuests = (): BountyQuest[] => CANONICAL_BOUNTY_QUESTS.map((quest) => ({ ...quest }));

const parseStoredQuestEntries = (value: unknown): unknown[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const raw = value as { version?: unknown; quests?: unknown };
  if ((raw.version !== 2 && raw.version !== 3) || !Array.isArray(raw.quests)) return [];
  return raw.quests;
};

export const normalizeStoredBountyQuests = (value: unknown): BountyQuest[] => {
  const canonicalById = new Map(CANONICAL_BOUNTY_QUESTS.map((quest) => [quest.id, quest]));
  const progressById = new Map<string, Record<string, unknown>>();
  for (const entry of parseStoredQuestEntries(value).slice(0, 100)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || !canonicalById.has(record.id) || progressById.has(record.id)) continue;
    progressById.set(record.id, record);
  }
  return CANONICAL_BOUNTY_QUESTS.map((canonical) => {
    const stored = progressById.get(canonical.id);
    if (!stored) return { ...canonical };
    const rawCount = typeof stored.currentCount === 'number' ? stored.currentCount : Number(stored.currentCount);
    const currentCount = Number.isFinite(rawCount) ? Math.max(0, Math.min(canonical.targetCount, Math.round(rawCount))) : 0;
    const completed = stored.status === 'completed' && currentCount >= canonical.targetCount;
    const claimable = !completed && currentCount >= canonical.targetCount;
    const accepted = stored.status === 'in_progress' || stored.status === 'claimable';
    return { ...canonical, currentCount: completed || claimable ? canonical.targetCount : currentCount, status: completed ? 'completed' : claimable ? 'claimable' : (accepted || canonical.status === 'in_progress' ? 'in_progress' : 'available') };
  });
};

const buildProfile = (quests: BountyQuest[]): BountyProfile => {
  const exp = quests.filter((quest) => quest.status === 'completed').reduce((total, quest) => total + quest.rewardExp, 0);
  const rank = [...BOUNTY_RANKS].reverse().find((item) => exp >= item.requiredExp) ?? BOUNTY_RANKS[0];
  const nextRank = BOUNTY_RANKS.find((item) => item.level === rank.level + 1);
  const progress = nextRank ? Math.round(((exp - rank.requiredExp) / (nextRank.requiredExp - rank.requiredExp)) * 100) : 100;
  return { exp, level: rank.level, rankTitle: rank.title, nextLevelExp: nextRank?.requiredExp ?? null, progressToNextLevel: Math.max(0, Math.min(100, progress)), completedQuestCount: quests.filter((quest) => quest.status === 'completed').length };
};

export class BountyQuestEngine {
  private static instance: BountyQuestEngine;
  private quests: BountyQuest[] = [];
  private readonly storageVersion = 3;
  private storageHandler: ((event: StorageEvent) => void) | null = null;
  private constructor() { this.load(); }
  static getInstance(): BountyQuestEngine { if (!BountyQuestEngine.instance) BountyQuestEngine.instance = new BountyQuestEngine(); return BountyQuestEngine.instance; }
  private reloadFromStorage() {
    try {
      const saved = localStorage.getItem('ycy_bounty_quests');
      if (saved) {
        const parsed = normalizeStoredBountyQuests(JSON.parse(saved));
        if (parsed.length) this.quests = parsed;
      }
    } catch {}
  }
  private load() {
    this.quests = cloneCanonicalQuests();
    this.reloadFromStorage();
    this.save();
    if (typeof window !== 'undefined' && !this.storageHandler) {
      this.storageHandler = (e) => {
        if (e.key === 'ycy_bounty_quests') this.reloadFromStorage();
      };
      window.addEventListener('storage', this.storageHandler);
    }
  }
  dispose() {
    if (typeof window !== 'undefined' && this.storageHandler) {
      window.removeEventListener('storage', this.storageHandler);
    }
    this.storageHandler = null;
  }
  save() { try { localStorage.setItem('ycy_bounty_quests', JSON.stringify({ version: this.storageVersion, quests: this.quests })); } catch {} }
  getQuests(): BountyQuest[] { this.reloadFromStorage(); return this.quests.map((quest) => ({ ...quest })); }
  getProfile(): BountyProfile { this.reloadFromStorage(); return buildProfile(this.quests); }
  canAcceptQuest(id: string): boolean { const quest = this.quests.find((item) => item.id === id); return Boolean(quest && quest.status === 'available' && this.getProfile().level >= quest.requiredLevel); }
  acceptQuest(id: string): boolean { this.reloadFromStorage(); const quest = this.quests.find((item) => item.id === id); if (!quest || !this.canAcceptQuest(id)) return false; quest.status = 'in_progress'; this.save(); return true; }
  incrementProgress(category: BountyQuestCategory, amount: number = 1, context?: { strength?: number; wave?: string }) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const strength = Number.isFinite(context?.strength) ? context!.strength! : 0;
    const increment = Math.max(1, Math.round(amount));
    for (const quest of this.quests) {
      if (quest.category !== category || quest.status !== 'in_progress') continue;
      if (quest.minimumStrength !== undefined && strength < quest.minimumStrength) continue;
      if (quest.requiredWave && quest.requiredWave !== context?.wave) continue;
      quest.currentCount = Math.min(quest.targetCount, quest.currentCount + increment);
      if (quest.currentCount >= quest.targetCount) quest.status = 'claimable';
    }
    this.save();
  }
  claimReward(id: string): { exp: number; title?: string; level: number; rankTitle: string } | null { this.reloadFromStorage(); const quest = this.quests.find((item) => item.id === id); if (!quest || quest.status !== 'claimable') return null; quest.status = 'completed'; this.save(); const profile = this.getProfile(); return { exp: quest.rewardExp, title: quest.rewardTitle, level: profile.level, rankTitle: profile.rankTitle }; }
}
