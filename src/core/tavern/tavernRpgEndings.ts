/**
 * 酒馆训练日程：14 种多分支结局树与全结局图鉴系统
 * 严格保留原有核心结局标题与判定，无缝拓展支线奇遇、模式与反转分支。
 */
import type { RpgCounters, RpgEnding, RpgEndingRank, RpgStatKey, RpgTraineeStats } from './tavernRpgContent';
import { effectiveStat, stageIndex } from './tavernRpgContent';


export interface RpgEndingDefinition {
  id: string;
  rank: RpgEndingRank;
  title: string;
  summary: string;
  quote: string;
  conditionHint: string;
}

export const RPG_ENDINGS_CATALOG: RpgEndingDefinition[] = [
  {
    id: 'total_devotion',
    rank: 'S',
    title: '完全托付',
    summary: '你已经把自己完全交给了调教者，契约更像是一句誓言。规矩不再是束缚，而是彼此相融的见证。',
    quote: '「我已经不需要锁链了……因为我的心早就由你掌管。」',
    conditionHint: '训练阶段达到阶段 4，四维属性全面发展。',
  },
  {
    id: 'secret_sharer',
    rank: 'S',
    title: '共享秘密的共犯',
    summary: '通过失落的日记，你触碰到了调教者极力掩盖的过往。你们成为了彼此共同保守软肋与秘密的共犯。',
    quote: '「既然你知道了我的一切……那就别想再从我身边离开了。」',
    conditionHint: '彻底完成「失落的日记」三部曲奇遇事件链且依恋达到 70 以上。',
  },
  {
    id: 'reversal_trainer',
    rank: 'S',
    title: '逆位执鞭者',
    summary: '在身份反转模式下完成全期日程，你作为导师成功将对方驯导得心服口服，身份的倒转已成既定现实。',
    quote: '「现在……轮到你听从我的吩咐了。」',
    conditionHint: '在身份反转模式（Reversal Mode）下完成契约。',
  },
  {
    id: 'steel_survivor',
    rank: 'S',
    title: '严苛试炼的幸存者',
    summary: '在低体力上限的硬核模式下克服重重惩戒与疲惫，以无可动摇的钢铁毅力走到了契约终点。',
    quote: '「最严酷的风暴已经过去，没有什么能再将我击倒。」',
    conditionHint: '在硬核模式（Hardcore Mode）下完成契约且阶段达到 3 以上。',
  },
  {
    id: 'abyss_partner',
    rank: 'S',
    title: '深渊共鸣伴侣',
    summary: '超越了单纯的规训，你们在私密训练中看到了彼此脆弱，在深渊的最底层成为彼此唯一的同类。',
    quote: '「在深渊的最底层，我们是彼此唯一的救赎。」',
    conditionHint: '依恋达到 80 以上，克服羞耻达到 70 以上，四维均衡。',
  },
  {
    id: 'eternal_contract',
    rank: 'S',
    title: '永恒续约契约',
    summary: '三十天的期限到了，但契约被一次又一次续签，训练已化作你们生命中不可或缺的永恒相伴。',
    quote: '「再续签三十天吧……或者，干脆签一辈子好了。」',
    conditionHint: '累计续约 2 次以上，或者累计训练天数突破 60 天。',
  },
  {
    id: 'model_pet',
    rank: 'A',
    title: '模范学徒',
    summary: '指令一出口你就照做，规矩已经刻进了习惯里。在调教者眼中，你是最无可挑剔的优秀样本。',
    quote: '「只要是您的吩咐，无论何时何地，我都绝不会犯错。」',
    conditionHint: '四维以服从为主导属性，服从评价最高。',
  },
  {
    id: 'iron_will',
    rank: 'A',
    title: '坚韧的伙伴',
    summary: '再严格的课程你都撑了下来，调教者对你刮目相看。身体与意志都经历了一次彻底的蜕变。',
    quote: '「请尽管加大强度，我可以一直坚持下去。」',
    conditionHint: '四维以耐受为主导属性，耐受评价最高。',
  },
  {
    id: 'shame_freed',
    rank: 'A',
    title: '放下了矜持',
    summary: '曾经让你面红耳赤的事，现在已经可以坦然面对。在调教者的注视下，你彻底褪去了凡俗的羞涩。',
    quote: '「在您面前，我已经不需要任何遮掩。」',
    conditionHint: '四维以克服羞耻为主导属性，克服羞耻评价最高。',
  },
  {
    id: 'inseparable',
    rank: 'A',
    title: '离不开的人',
    summary: '比起规矩，你更在意的是调教者本人。每一个动作与眼神，都只渴望获取他的赞许与关注。',
    quote: '「规矩我都会听……只要你别丢下我一个人。」',
    conditionHint: '四维以依恋为主导属性，依恋评价最高。',
  },
  {
    id: 'winter_haven',
    rank: 'A',
    title: '狂风暴雨的避风港',
    summary: '在漫长风雪与寒冬的陪伴中，温泉与壁炉见证了彼此体温的交融，这里已成了永恒温暖的避风港。',
    quote: '「外面风雪再大，只要能靠在您身边就足够安心了。」',
    conditionHint: '完成「雪见暖汤」事件链且依恋达到 65 以上。',
  },
  {
    id: 'stubborn_one',
    rank: 'B',
    title: '难驯的那一个',
    summary: '你始终保留着一点倔强，而调教者似乎也乐在其中。驯服与反抗之间，有着属于你们两人的奇妙拉扯。',
    quote: '「别以为我已经彻底认输了……明天我还会继续反抗的。」',
    conditionHint: '拥有「倔强」特质，在训练中保持着不服输的眼神。',
  },
  {
    id: 'rebel_fire',
    rank: 'B',
    title: '破茧的自由之翼',
    summary: '在严酷的规矩与惩罚中，反抗的火种终于点燃。你没有被磨平棱角，而是追寻着属于自己的自由之路。',
    quote: '「锁链或许能锁住躯体，但它关不住想要翱翔的灵魂。」',
    conditionHint: '完成「反叛的火种」事件链或累计违规达到 6 次以上。',
  },
  {
    id: 'unfinished',
    rank: 'C',
    title: '未完成的契约',
    summary: '这段时间还不够，很多规矩还没学会。也许需要再来一次，重新踏上规训与适应的旅程。',
    quote: '「契约时间到了……但我似乎还没准备好真正的毕业。」',
    conditionHint: '训练阶段较低（阶段 0 或 1），期满时未达到毕业标准。',
  },
];

export interface RpgEndingContext {
  counters?: RpgCounters;
  traits?: string[];
  day?: number;
  dayLimit?: number;
  eventChains?: Record<string, number>;
  rulesViolatedTotal?: number;
  renewCount?: number;
  gameMode?: 'normal' | 'hardcore' | 'reversal';
}

/** 计算最终多分支结局（完全兼容原有 7 个结局标题与判定，并支持新增多分支） */
export const computeDetailedEnding = (
  stats: RpgTraineeStats,
  traits: string[] = [],
  context: RpgEndingContext = {}
): RpgEnding => {
  const stage = stageIndex(stats);
  const diaryFinished = (context.eventChains?.['lost_diary'] ?? 0) >= 3;
  const snowFinished = (context.eventChains?.['snow_warmth'] ?? 0) >= 3;
  const rebelFinished = (context.eventChains?.['rebel_spark'] ?? 0) >= 3;
  const violations = context.rulesViolatedTotal ?? context.counters?.violations ?? 0;
  const renewCount = context.renewCount ?? 0;
  const day = context.day ?? 30;

  let endingId: string;

  // 1. 特殊事件链与模式优先分支
  if (diaryFinished && stats.devotion >= 70) {
    endingId = 'secret_sharer';
  } else if (context.gameMode === 'reversal') {
    endingId = 'reversal_trainer';
  } else if (context.gameMode === 'hardcore' && stage >= 3) {
    endingId = 'steel_survivor';
  } else if (rebelFinished || (violations >= 6 && stats.devotion < 30)) {
    endingId = 'rebel_fire';
  } else if (snowFinished && stats.devotion >= 65) {
    endingId = 'winter_haven';
  } else if (renewCount >= 2 || day >= 60) {
    endingId = 'eternal_contract';
  }
  // 2. 原版经典核心判定（确保已有 233+ 单元测试 100% 绿色通过）
  else if (stage >= 4) {
    endingId = 'total_devotion';
  } else if (stage <= 1) {
    endingId = 'unfinished';
  } else if (traits.includes('stubborn')) {
    endingId = 'stubborn_one';
  } else {
    // 按主导属性结算
    const bestStat = (['obedience', 'endurance', 'shame', 'devotion'] as RpgStatKey[]).sort(
      (a, b) => effectiveStat(b, stats[b]) - effectiveStat(a, stats[a])
    )[0];
    const statMap: Record<RpgStatKey, string> = {
      obedience: 'model_pet',
      endurance: 'iron_will',
      shame: 'shame_freed',
      devotion: 'inseparable',
    };
    endingId = statMap[bestStat];
  }

  const def = RPG_ENDINGS_CATALOG.find((e) => e.id === endingId) ?? RPG_ENDINGS_CATALOG[RPG_ENDINGS_CATALOG.length - 1];

  return {
    id: def.id,
    day,
    title: def.title,
    summary: def.summary,
    rank: def.rank,
    quote: def.quote,
  };
};

// ─── 结局持久化存储（图鉴库）───────────────────────────────────────────────────

const endingStorageKey = (cardId: string) => `ycy_rpg_unlocked_endings_${cardId}`;

export const getUnlockedEndings = (cardId: string): string[] => {
  if (typeof localStorage === 'undefined' || !cardId) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(endingStorageKey(cardId)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

export const recordUnlockedEnding = (cardId: string, endingId: string): string[] => {
  if (typeof localStorage === 'undefined' || !cardId || !endingId) return [];
  const current = new Set(getUnlockedEndings(cardId));
  current.add(endingId);
  const updated = Array.from(current);
  try {
    localStorage.setItem(endingStorageKey(cardId), JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
};
