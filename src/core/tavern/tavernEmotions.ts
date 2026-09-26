import { TavernCharacterCard, TavernEmotionKey } from './tavernTypes';
import { TavernCharacterStats } from './tavernStatusHud';

export interface TavernEmotionMeta {
  key: TavernEmotionKey;
  label: string;
  icon: string;
  description: string;
  themeColor: string;
}

export const CANONICAL_TAVERN_EMOTIONS: TavernEmotionMeta[] = [
  { key: 'neutral', label: '平静 / 默认', icon: '😐', description: '日常交代剧情与从容对谈', themeColor: 'text-slate-300' },
  { key: 'smile', label: '微笑 / 愉悦', icon: '😊', description: '心情舒畅、感到安心与欢喜', themeColor: 'text-emerald-400' },
  { key: 'blush', label: '害羞 / 脸红', icon: '😳', description: '娇羞避嫌、被调戏时轻咬下唇', themeColor: 'text-pink-400' },
  { key: 'aroused', label: '动情 / 沉沦', icon: '🥵', description: '快感失神、身体发软与呼吸急促', themeColor: 'text-rose-400' },
  { key: 'angry', label: '薄怒 / 严厉', icon: '😠', description: '傲娇气恼、严厉审视与不满抗议', themeColor: 'text-amber-500' },
  { key: 'sad', label: '委屈 / 泪光', icon: '🥺', description: '难过抽泣、心生愧疚与楚楚可怜', themeColor: 'text-sky-400' },
  { key: 'shocked', label: '震惊 / 错愕', icon: '😲', description: '心事被戳穿、突如其来的意外刺激', themeColor: 'text-purple-400' },
  { key: 'smug', label: '戏谑 / 坏笑', icon: '😏', description: '占了上风、狡黠挑弄与胜券在握', themeColor: 'text-violet-400' },
];

export const CANONICAL_TAVERN_EMOTION_MAP: Record<TavernEmotionKey, TavernEmotionMeta> = Object.fromEntries(
  CANONICAL_TAVERN_EMOTIONS.map((meta) => [meta.key, meta]),
) as Record<TavernEmotionKey, TavernEmotionMeta>;

export const TAVERN_EMOTION_KEYS: TavernEmotionKey[] = [
  'neutral',
  'smile',
  'blush',
  'aroused',
  'angry',
  'sad',
  'shocked',
  'smug',
];

const EMOTION_SYNONYM_MAP: Record<string, TavernEmotionKey> = {
  neutral: 'neutral',
  default: 'neutral',
  calm: 'neutral',
  smile: 'smile',
  happy: 'smile',
  joy: 'smile',
  pleased: 'smile',
  blush: 'blush',
  shy: 'blush',
  embarrassed: 'blush',
  aroused: 'aroused',
  horny: 'aroused',
  ecstasy: 'aroused',
  pleasure: 'aroused',
  angry: 'angry',
  rage: 'angry',
  annoyed: 'angry',
  sad: 'sad',
  cry: 'sad',
  crying: 'sad',
  sorrow: 'sad',
  shocked: 'shocked',
  surprised: 'shocked',
  astonished: 'shocked',
  smug: 'smug',
  tease: 'smug',
  teasing: 'smug',
  playful: 'smug',
};

const EMOTION_REGEX_MAP: Array<{ key: TavernEmotionKey; regex: RegExp }> = [
  // 动情沉沦优先级最高
  {
    key: 'aroused',
    regex: /(?:娇喘|急促喘息|身体发软|快感|眼神迷离|失神|沉沦|湿润|身体发烫|阵阵发麻|微电流涌过|呻吟|颤抖着|瘫软|潮红扩散|腿根打颤)/i,
  },
  // 害羞脸红
  {
    key: 'blush',
    regex: /(?:脸红|害羞|娇羞|羞耻|羞怯|绯红|咬唇|咬紧下唇|轻咬下唇|视线躲闪|耳尖泛红|耳根发红|双颊滚烫|脸颊发烫|两颊微红|别扭地移开|别过脸去|泛起红晕|红晕|羞得无地自容)/i,
  },
  // 震惊错愕
  {
    key: 'shocked',
    regex: /(?:震惊|错愕|瞪大|愣住|倒吸一口凉气|吃惊|慌乱|手足无措|惊呼|猝不及防|瞳孔地震)/i,
  },
  // 薄怒严厉
  {
    key: 'angry',
    regex: /(?:生气|瞪了|咬牙|薄怒|微怒|不满|冰冷地看着|冷哼|放肆|不知好歹|蹙起眉头|呵斥)/i,
  },
  // 委屈泪光
  {
    key: 'sad',
    regex: /(?:委屈|难过|抽泣|眼眶泛红|泪水|泪光|心痛|哽咽|自责|害怕被丢下|轻声呜咽|垂头丧气|黯然低头|失落地下头)/i,
  },
  // 戏谑坏笑
  {
    key: 'smug',
    regex: /(?:坏笑|嘴角上扬|玩味|轻蔑|戏谑|得意|狡黠|挑眉|自鸣得意|玩味地看着)/i,
  },
  // 微笑愉悦
  {
    key: 'smile',
    regex: /(?:微笑|轻笑|笑眯眯|笑意|温柔|欣慰|忍不住笑|展颜欢笑|笑意盈盈)/i,
  },
];

export interface EmotionDeductionResult {
  emotion: TavernEmotionKey;
  cleanedReply: string;
  source: 'tag' | 'hardware' | 'stats' | 'regex' | 'fallback';
}

/**
 * 三级情绪决策引擎：
 * 1. 显式内嵌标签 [emotion:blush] 或 <emotion:blush>，即时捕获并从气泡正文中静默剥离
 * 2. 硬件脉冲 / 生理状态机驱动（快感>=75%强制动情，羞耻>=70%脸红）
 * 3. 正则与动作关键词启发式分析
 * 4. 缺省回退为 neutral
 */
export function deduceTavernEmotion(params: {
  reply?: string;
  text?: string;
  stats?: TavernCharacterStats | null;
  biometrics?: Partial<TavernCharacterStats> | null;
  hardwareActive?: boolean;
  hasActivePulse?: boolean;
}): EmotionDeductionResult {
  const rawReply = params.reply ?? params.text ?? '';
  const stats = params.stats ?? (params.biometrics ? params.biometrics as TavernCharacterStats : undefined);
  const hardwareActive = params.hardwareActive ?? params.hasActivePulse ?? false;

  // 1. 显式内嵌标签捕获与清洗
  const tagMatch = /(?:<!--\s*EMOTION:\s*([a-zA-Z_-]+)\s*-->|\[\s*EMOTION:\s*([a-zA-Z_-]+)\s*\]|<\s*EMOTION:\s*([a-zA-Z_-]+)\s*>)/i.exec(rawReply);
  if (tagMatch) {
    const rawKey = (tagMatch[1] || tagMatch[2] || tagMatch[3] || '').toLowerCase().trim();
    const mapped = EMOTION_SYNONYM_MAP[rawKey];
    if (mapped) {
      const cleanedReply = rawReply
        .replace(/(?:<!--\s*EMOTION:\s*[a-zA-Z_-]+\s*-->|\[\s*EMOTION:\s*[a-zA-Z_-]+\s*\]|<\s*EMOTION:\s*[a-zA-Z_-]+\s*>)/gi, '')
        .trim();
      return {
        emotion: mapped,
        cleanedReply,
        source: 'tag',
      };
    }
  }

  // 2. 硬件脉冲触发
  if (hardwareActive) {
    return {
      emotion: 'aroused',
      cleanedReply: rawReply,
      source: 'hardware',
    };
  }

  // 3. 生理与好感度状态机驱动
  if (stats) {
    if (stats.arousal >= 75) {
      return { emotion: 'aroused', cleanedReply: rawReply, source: 'stats' };
    }
    if (stats.shame >= 70) {
      return { emotion: 'blush', cleanedReply: rawReply, source: 'stats' };
    }
    if (stats.obedience <= 15) {
      return { emotion: 'angry', cleanedReply: rawReply, source: 'stats' };
    }
    if (stats.favor >= 80 && stats.arousal < 45) {
      return { emotion: 'smile', cleanedReply: rawReply, source: 'stats' };
    }
  }

  // 4. 正则语义与动作关键词启发式推导
  for (const { key, regex } of EMOTION_REGEX_MAP) {
    if (regex.test(rawReply)) {
      return { emotion: key, cleanedReply: rawReply, source: 'regex' };
    }
  }

  // 5. 缺省回退
  return {
    emotion: 'neutral',
    cleanedReply: rawReply,
    source: 'fallback',
  };
}

/**
 * 解析当前角色卡应展示的表情立绘图片：
 * 优先匹配 card.expressions[emotion]
 * 若未配置，回退至 card.expressions.neutral
 * 若仍未配置，回退至 card.avatar，始终返回安全字符串（图片或Emoji）
 */
export function resolveActiveCardSprite(
  card: TavernCharacterCard | null | undefined,
  emotion: TavernEmotionKey = 'neutral',
): string {
  if (!card) return '';

  // 1. 指定情绪立绘
  if (card.expressions && typeof card.expressions[emotion] === 'string' && card.expressions[emotion]!.trim()) {
    return card.expressions[emotion]!.trim();
  }

  // 2. 默认平静立绘
  if (card.expressions && typeof card.expressions.neutral === 'string' && card.expressions.neutral!.trim()) {
    return card.expressions.neutral!.trim();
  }

  // 3. 主头像（图片或Emoji）
  return card.avatar || '';
}
