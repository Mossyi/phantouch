import { stripInternalControlTags } from './tavernTextSanitizer';

export interface TavernCharacterStats {
  favor: number;      // 好感度 0-100
  obedience: number;  // 服从度 0-100
  arousal: number;    // 快感/兴奋度 0-100
  shame: number;      // 羞耻度 0-100
  mood: string;       // 当前心境
  lastUpdated?: number;
}

export const DEFAULT_TAVERN_CHARACTER_STATS: TavernCharacterStats = {
  favor: 30,
  obedience: 20,
  arousal: 0,
  shame: 40,
  mood: '初次相处',
};

const STATS_STORAGE_PREFIX = 'ycy_tavern_stats_';

const clampStat = (value: unknown, fallback: number): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
};


export const normalizeCharacterStats = (value: unknown): TavernCharacterStats => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_TAVERN_CHARACTER_STATS };
  }
  const raw = value as Record<string, unknown>;
  return {
    favor: clampStat(raw.favor, DEFAULT_TAVERN_CHARACTER_STATS.favor),
    obedience: clampStat(raw.obedience, DEFAULT_TAVERN_CHARACTER_STATS.obedience),
    arousal: clampStat(raw.arousal, DEFAULT_TAVERN_CHARACTER_STATS.arousal),
    shame: clampStat(raw.shame, DEFAULT_TAVERN_CHARACTER_STATS.shame),
    mood: typeof raw.mood === 'string' && raw.mood.trim()
      ? raw.mood.trim().slice(0, 30)
      : DEFAULT_TAVERN_CHARACTER_STATS.mood,
    lastUpdated: Number.isFinite(Number(raw.lastUpdated)) ? Number(raw.lastUpdated) : Date.now(),
  };
};

export const loadCharacterStats = (cardId: string): TavernCharacterStats => {
  if (!cardId) return { ...DEFAULT_TAVERN_CHARACTER_STATS };
  try {
    const raw = localStorage.getItem(`${STATS_STORAGE_PREFIX}${cardId}`);
    if (!raw) return { ...DEFAULT_TAVERN_CHARACTER_STATS };
    return normalizeCharacterStats(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TAVERN_CHARACTER_STATS };
  }
};

export const saveCharacterStats = (cardId: string, stats: TavernCharacterStats): void => {
  if (!cardId) return;
  try {
    const normalized = normalizeCharacterStats(stats);
    normalized.lastUpdated = Date.now();
    localStorage.setItem(`${STATS_STORAGE_PREFIX}${cardId}`, JSON.stringify(normalized));
  } catch (error) {
    console.error('Failed to save character stats:', error);
  }
};

export const resetCharacterStats = (cardId: string): TavernCharacterStats => {
  const initial = { ...DEFAULT_TAVERN_CHARACTER_STATS, lastUpdated: Date.now() };
  if (cardId) {
    try {
      localStorage.setItem(`${STATS_STORAGE_PREFIX}${cardId}`, JSON.stringify(initial));
    } catch {
      // ignore
    }
  }
  return initial;
};

export const deleteCharacterStats = (cardId: string): void => {
  if (!cardId) return;
  try {
    localStorage.removeItem(`${STATS_STORAGE_PREFIX}${cardId}`);
  } catch {
    // ignore
  }
};

export const getFavorStage = (favor: number): string => {
  if (favor < 25) return '冷淡防备';
  if (favor < 50) return '熟络交心';
  if (favor < 75) return '爱慕倾心';
  return '至死不渝';
};

export const getObedienceStage = (obedience: number): string => {
  if (obedience < 25) return '桀骜反叛';
  if (obedience < 50) return '半推半就';
  if (obedience < 75) return '温顺听话';
  return '绝对臣服';
};

export const getArousalStage = (arousal: number): string => {
  if (arousal < 25) return '清醒平静';
  if (arousal < 50) return '略感悸动微热';
  if (arousal < 75) return '情动娇喘敏感';
  return '欲火焚身·极度沉沦';
};

export const getShameStage = (shame: number): string => {
  if (shame < 25) return '坦然自若';
  if (shame < 50) return '略带羞赧动摇';
  if (shame < 75) return '面红耳赤欲泣';
  return '极度羞耻·理智崩溃';
};

/**
 * 提示词中注入的属性状态更新监控说明与当前实时身心状态约束
 */
export const buildStatusPromptInstruction = (current?: TavernCharacterStats): string => {
  const statusConstraint = current ? `
【角色当前实时状态与身心状态约束（重要！你接下来的言行反应、心理活动、神态描写与顺从程度必须严格呼应以下实时属性）】：
- 💖 好感度：${current.favor}/100（当前阶段：${getFavorStage(current.favor)}）
- ⛓️ 服从度：${current.obedience}/100（当前阶段：${getObedienceStage(current.obedience)}）
- ⚡ 快感 / 兴奋度：${current.arousal}/100（当前阶段：${getArousalStage(current.arousal)}）
- 😳 羞耻 / 动摇度：${current.shame}/100（当前阶段：${getShameStage(current.shame)}）
- 💭 当前内心心境：【${current.mood || '初识微怯'}】
【深度扮演准则】：
1. 你的语气、神态、肢体描写与对白反应，必须深度呼应上述好感、服从、快感与心境状态：
   - 服从度高时，温驯顺从、主动求宠、不敢违抗甚至渴望被支配；服从度低时，则牙尖嘴利、傲娇反抗或轻蔑挑衅；
   - 快感度高时，身体酥软敏感、呼吸紊乱急促、言语断续娇喘，表现出难以自抑的动情与渴望；快感度低时则清醒矜持；
   - 羞耻度高时，面红耳赤、遮掩闪躲、欲迎还拒；
   - 必须深度融入当前心境【${current.mood || '初识微怯'}】的具体心理与细节描写！
`.trim() : '';

  return `
${statusConstraint ? statusConstraint + '\n\n' : ''}【系统核心指令：实时好感与心理状态数值监控】
为了驱动界面实时 RPG 状态栏，你必须在每轮角色回复的最末尾，输出一条隐式状态变动标签（使用 HTML 注释格式，正文不可见）：
<!--STATUS:{"favor":"+2","obedience":"+5","arousal":"+10","shame":"-3","mood":"娇羞动情·身体微热"}-->
规则说明：
1. 属性包括：
   - favor: 好感度相对增减量（如 "+3", "-2"）
   - obedience: 服从度相对增减量（如 "+5", "-1"）
   - arousal: 快感/兴奋度相对增减量（如 "+10", "-5"）
   - shame: 羞耻/动摇度相对增减量（如 "+4", "-2"）
   - mood: 当前内心核心生动心境（不超过8个字，必须真实生动地体现当前角色细腻的情欲波动、娇羞挑逗、身体敏感反应或顺从渴望，例如：“身酥骨软·情热泛滥”、“娇喘动情·面赤心跳”、“媚眼含春·暗自渴求”、“温驯求宠·任君摆布”、“轻咬下唇·渴求更多”、“呼吸急促·暗颤沉沦”、“表面顺从·敏感微湿”）
2. 每轮回复必须在最末尾完整输出闭合的 <!--STATUS:...--> 标签，严禁遗漏！
`.trim();
};

/**
 * 基于对话上下文的情感与状态变动推断兜底（当模型未输出标准标签时启用）
 */
export const inferStatusDeltaFallback = (
  userInput: string,
  assistantReply: string,
  current: TavernCharacterStats,
): TavernCharacterStats => {
  const combined = `${userInput} ${assistantReply}`.toLowerCase();

  let dFavor = 0;
  let dObedience = 0;
  let dArousal = 0;
  let dShame = 0;
  let nextMood = current.mood;

  // 亲密/好感倾向
  if (/喜欢|可爱|温柔|谢谢|夸|好棒|爱你|摸摸|抱抱|亲亲|真好|开心|陪伴|乖|陪我|摸头|贴贴/.test(combined)) {
    dFavor += 2;
  }
  // 顺从/命令/支配倾向
  if (/听话|服从|主人|命令|惩罚|跪|规矩|遵命|调教|不敢了|任凭|低头|乖顺|求饶|摆布/.test(combined)) {
    dObedience += 2;
    dShame += 1;
  }
  // 敏感/快感/情欲倾向（大幅扩充色气敏感词捕捉）
  if (/敏感|喘息|潮红|快感|高潮|湿|颤抖|抚摸|摩擦|兴奋|深入|身体|脱|亲吻|轻咬|呻吟|酥麻|摸|揉|抱|吻|撩|欲|爱抚|挑逗|耳语|发软|微热|喘|咬|舌|紧贴|腰|腿|胸|羞耻|情欲|诱惑|低喘|索求/.test(combined)) {
    dArousal += 4;
    dShame += 2;
  }
  // 负面/抗拒倾向
  if (/讨厌|滚|走开|烦人|别碰我|生气|离我远点|去死/.test(combined)) {
    dFavor -= 2;
    dObedience -= 1;
    nextMood = '心生抵触·冷漠防备';
  }

  // 正常互动：只要有一轮发言，且未产生负向扣减，基础好感自然微增 +1
  if (dFavor === 0 && dObedience === 0 && dArousal === 0 && dShame === 0) {
    dFavor = 1;
  }

  // 动态推断生动色气心境短语
  if (dArousal > 0 || current.arousal > 30) {
    if (current.arousal >= 70 || dArousal >= 6) {
      nextMood = '身酥骨软·情热泛滥';
    } else if (current.arousal >= 45 || dArousal >= 4) {
      nextMood = '娇喘动情·面赤心跳';
    } else {
      nextMood = '娇羞悸动·身体微热';
    }
  } else if (current.shame > 55) {
    nextMood = '羞耻难抑·泛滥微颤';
  } else if (dObedience > 0 || current.obedience > 40) {
    nextMood = '温驯求宠·任君摆布';
  } else if (dFavor > 0 || current.favor > 40) {
    nextMood = '媚眼含春·暗自渴求';
  }

  return {
    favor: Math.max(0, Math.min(100, current.favor + dFavor)),
    obedience: Math.max(0, Math.min(100, current.obedience + dObedience)),
    arousal: Math.max(0, Math.min(100, current.arousal + dArousal)),
    shame: Math.max(0, Math.min(100, current.shame + dShame)),
    mood: nextMood,
    lastUpdated: Date.now(),
  };
};

/**
 * 正则提取并解析文本中的状态标签，返回干净正文与更新后的属性
 */
export const parseAndApplyStatusUpdate = (
  rawText: string,
  current: TavernCharacterStats,
  userInput?: string,
): { cleanedText: string; nextStats: TavernCharacterStats; updated: boolean } => {
  if (!rawText) {
    return { cleanedText: '', nextStats: current, updated: false };
  }

  // 匹配各种兼容格式：<!--STATUS:{...}-->、[STATUS:{...}]、<STATUS>{...}</STATUS>
  const statusRegex = /(?:<!--\s*STATUS(?:_UPDATE)?:\s*(\{.*?\})\s*-->|\[\s*STATUS(?:_UPDATE)?:\s*(\{.*?\})\s*\]|<\s*STATUS(?:_UPDATE)?\s*>\s*(\{.*?\})\s*<\/\s*STATUS(?:_UPDATE)?\s*>)/is;
  const match = rawText.match(statusRegex);

  const cleanedAll = stripInternalControlTags(rawText, false).trimEnd();

  if (!match) {
    // 未匹配到标签，但有用户发言上下文时，执行智能兜底推断，防止状态栏永远冻结
    if (userInput !== undefined && userInput.trim().length > 0) {
      const fallbackStats = inferStatusDeltaFallback(userInput, rawText, current);
      return { cleanedText: cleanedAll, nextStats: fallbackStats, updated: true };
    }
    return { cleanedText: cleanedAll, nextStats: current, updated: false };
  }

  const jsonPayload = match[1] || match[2] || match[3] || '';
  const cleanedText = cleanedAll;

  try {
    // 兼容容错：将带符号的数值（如 +5, -3）统一转换为带符号字符串，确保负数不被误当成绝对设定值
    const sanitizedPayload = jsonPayload
      .replace(/([{,]\s*"[^"]*")\s*:\s*([+-]\d+(?:\.\d+)?)/g, '$1:"$2"')
      .replace(/(^|[{,:\s])'/g, '$1"')
      .replace(/'(?=[}:,\s]|$)/g, '"')
      .replace(/,\s*\}/g, '}');
    const delta = JSON.parse(sanitizedPayload);
    if (!delta || typeof delta !== 'object') {
      if (userInput !== undefined && userInput.trim().length > 0) {
        const fallbackStats = inferStatusDeltaFallback(userInput, rawText, current);
        return { cleanedText, nextStats: fallbackStats, updated: true };
      }
      return { cleanedText, nextStats: current, updated: false };
    }

    const applyDelta = (currentVal: number, change: unknown): number => {
      if (change === undefined || change === null) return currentVal;
      if (typeof change === 'string') {
        const trimmed = change.trim();
        if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
          const deltaNum = Number(trimmed);
          if (Number.isFinite(deltaNum)) {
            return Math.max(0, Math.min(100, currentVal + deltaNum));
          }
        }
      }
      const directNum = Number(change);
      if (Number.isFinite(directNum)) {
        return Math.max(0, Math.min(100, Math.round(directNum)));
      }
      return currentVal;
    };

    const nextStats: TavernCharacterStats = {
      favor: applyDelta(current.favor, delta.favor),
      obedience: applyDelta(current.obedience, delta.obedience),
      arousal: applyDelta(current.arousal, delta.arousal),
      shame: applyDelta(current.shame, delta.shame),
      mood: typeof delta.mood === 'string' && delta.mood.trim()
        ? delta.mood.trim().slice(0, 30)
        : current.mood,
      lastUpdated: Date.now(),
    };

    return { cleanedText, nextStats, updated: true };
  } catch {
    if (userInput !== undefined && userInput.trim().length > 0) {
      const fallbackStats = inferStatusDeltaFallback(userInput, rawText, current);
      return { cleanedText, nextStats: fallbackStats, updated: true };
    }
    return { cleanedText, nextStats: current, updated: false };
  }
};
