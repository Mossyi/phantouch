export interface TavernCharacterCard {
  id: string;
  name: string;
  avatar: string; // Emoji 或 Base64 图片
  tag: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  mesExamples?: string;
  systemPromptAddon?: string;
  postHistoryInstructions?: string;
  alternateGreetings?: string[];
  creatorNotes?: string;
  worldBookEntries?: LorebookEntry[];
  // DZMM Studio-compatible presentation fields. They never grant hardware access.
  introduction?: string;
  detailedDescription?: string;
  suggestedReplies?: string[];
  galleryImages?: string[];
  voiceSettings?: TavernVoiceSettings;
  // 角色专属场景背景壁纸与可调节暗色遮罩（防刺眼、保高对比度）
  sceneWallpaper?: string;
  sceneWallpaperOverlay?: number;
  // 角色表情立绘差分集合（8套标准情绪立绘）
  expressions?: TavernCharacterExpressions;
  dzmmPublishMeta?: {
    visibility?: 'private' | 'unlisted' | 'public';
    category?: string;
  };
  hardwareEnchanted: boolean; // 是否开启“硬件支配附魔”
  creator?: string;
  source: 'preset' | 'imported_png' | 'imported_json' | 'dzmm_cloud' | 'ai_generated';
}

export type TavernEmotionKey =
  | 'neutral'   // 平静 / 默认
  | 'smile'     // 微笑 / 愉悦
  | 'blush'     // 害羞 / 脸红
  | 'aroused'   // 动情 / 沉沦 / 快感
  | 'angry'     // 薄怒 / 严厉
  | 'sad'       // 委屈 / 难过 / 哭泣
  | 'shocked'   // 震惊 / 错愕
  | 'smug';     // 戏谑 / 调侃 / 坏笑

export type TavernCharacterExpressions = Partial<Record<TavernEmotionKey, string>>;

export interface TavernVoiceSettings {
  enabled: boolean;
  engine?: 'siliconflow' | 'volcengine_tts';
  voiceId?: string;
  voiceName?: string;
  profileId?: string;
  speed?: number;
  pitch?: number;
  gain?: number;
}

export interface LorebookEntry {
  id: string;
  keywords: string[];
  secondaryKeywords?: string[];
  content: string;
  matchScope?: 'user' | 'assistant' | 'both';
  priority?: number;
  cooldownSec?: number;
  hardwareAction?: {
    type: 'ems_wave' | 'ems_strength' | 'toy_motor' | 'toy_pattern' | 'enema_fill' | 'enema_drain' | 'brake_stop';
    target?: string;
    value?: number;
    durationSec?: number;
    stopMode?: 'timed' | 'persistent';
  };
  enabled: boolean;
}

export interface TavernSession {
  characterId: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    isOOC?: boolean; // 戏外发言标记
    toolCalls?: any[];
    // Group scenes label each reply with the character that spoke it.
    speakerCardId?: string;
    // A message-level regenerate keeps alternatives locally; switching never replays hardware output.
    candidateReplies?: string[];
    activeCandidateIndex?: number;
    images?: string[];
    emotion?: TavernEmotionKey;
  }>;
}

export interface TavernGroupScene {
  hostCardId: string;
  participantIds: string[];
}

export interface TavernModelConfig {
  provider: 'system' | 'dzmm' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
  userName: string;
  rememberApiKey: boolean;
}

export interface TavernImageModelConfig {
  provider: 'system' | 'siliconflow' | 'volcengine_plan' | 'local_sd' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
  imageSize?: string;
  numInferenceSteps?: number;
  seed?: number;
  negativePrompt?: string;
  localSdBackend?: 'auto' | 'a1111' | 'comfyui';
  sdSampler?: string;
  sdScheduler?: string;
  sdCfgScale?: number;
  sdWidth?: number;
  sdHeight?: number;
  rememberApiKey: boolean;
}

export interface TavernPlayerPreset {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TavernPlayerProfile {
  identity: string;
  presets: TavernPlayerPreset[];
}
