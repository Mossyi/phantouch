import { TavernCharacterCard, TavernCharacterExpressions, TavernEmotionKey, TavernGroupScene, TavernImageModelConfig, TavernModelConfig, TavernPlayerPreset, TavernPlayerProfile, TavernSession, TavernVoiceSettings } from './tavernTypes';
import { TAVERN_EMOTION_KEYS } from './tavernEmotions';
import {
  DEFAULT_SILICONFLOW_IMAGE_MODEL,
  DEFAULT_SILICONFLOW_IMAGE_SIZE,
  DEFAULT_SILICONFLOW_IMAGE_STEPS,
  LOCAL_SD_DEFAULT_BASE_URL,
  LOCAL_SD_DEFAULT_CFG_SCALE,
  LOCAL_SD_DEFAULT_BACKEND,
  LOCAL_SD_DEFAULT_HEIGHT,
  LOCAL_SD_DEFAULT_SAMPLER,
  LOCAL_SD_DEFAULT_WIDTH,
  isSiliconflowImageModel,
  normalizeLocalSdCfgScale,
  normalizeLocalSdBackend,
  normalizeLocalSdDimension,
  normalizeLocalSdSampler,
  normalizeLocalSdScheduler,
  normalizeLocalSdSteps,
  normalizeSiliconflowImageSeed,
  normalizeSiliconflowImageSize,
  normalizeSiliconflowImageSteps,
  normalizeSiliconflowNegativePrompt,
  SILICONFLOW_IMAGE_BASE_URL,
} from './tavernImageModels';
import { parseApiBaseUrl, parseLocalNetworkApiBaseUrl } from '../apiBaseUrl';
import { inferTavernVoiceEngine } from './tavernVoice';
import {
  createTavernPlayerPresetId,
  MAX_TAVERN_PLAYER_PRESETS,
  normalizeTavernPlayerPreset,
  normalizeTavernPlayerProfile,
} from './tavernPlayerPresets';
import { normalizeTavernMemoryState, TavernMemoryState } from './tavernMemory';
import { normalizeTavernAuthorNote, TavernAuthorNoteState } from './tavernAuthorNote';
import { normalizeTavernGenerationConfig, TavernGenerationConfig } from './tavernGeneration';
import {
  deleteTavernArchiveRecord,
  deleteTavernSessionRecord,
  loadTavernArchiveRecord,
  loadTavernSessionRecord,
  saveTavernArchiveRecord,
  saveTavernSessionRecord,
} from './tavernChatRepository';

import { PRESET_TAVERN_CARDS } from './presetCards';
export { PRESET_TAVERN_CARDS };

export const RETIRED_TAVERN_PRESET_CARD_IDS = new Set([
  'tavern_fallen_angel_academy',
  'tavern_femboy_system',
  'tavern_marcus_trainer',
  'tavern_tyrant_marcus',
  'tavern_demonic_caibu',
  'tavern_jack_spade_king',
]);


const DZMM_CARD_CHAT_BASE_URL = 'https://api.sillytraven.dev/api/xiaoshuoai/ext/v2';
const DZMM_DEFAULT_MODEL = 'nalang-max-0826-16k';

export const DEFAULT_TAVERN_MODEL_CONFIG: TavernModelConfig = {
  provider: 'system',
  apiKey: '',
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: 'deepseek-ai/DeepSeek-V3.2',
  userName: '旅人',
  rememberApiKey: false,
};

export const DEFAULT_TAVERN_IMAGE_MODEL_CONFIG: TavernImageModelConfig = {
  provider: 'system',
  apiKey: '',
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: 'Kwai-Kolors/Kolors',
  imageSize: DEFAULT_SILICONFLOW_IMAGE_SIZE,
  numInferenceSteps: DEFAULT_SILICONFLOW_IMAGE_STEPS,
  negativePrompt: '',
  localSdBackend: LOCAL_SD_DEFAULT_BACKEND,
  sdSampler: LOCAL_SD_DEFAULT_SAMPLER,
  sdScheduler: 'karras',
  sdCfgScale: LOCAL_SD_DEFAULT_CFG_SCALE,
  sdWidth: LOCAL_SD_DEFAULT_WIDTH,
  sdHeight: LOCAL_SD_DEFAULT_HEIGHT,
  rememberApiKey: false,
};

export const VOLCENGINE_PLAN_IMAGE_BASE_URL = 'https://ark.cn-beijing.volces.com/api/plan/v3';
// Seedream is the official model ID. The former extra "d" made Plan reject it.
export const VOLCENGINE_PLAN_IMAGE_MODEL = 'doubao-seedream-5.0-lite';

export const getTavernImageCredentialScope = (
  config: Pick<TavernImageModelConfig, 'provider' | 'baseUrl'>,
): string | null => {
  if (config.provider === 'system') return 'system';
  if (config.provider === 'siliconflow') return 'siliconflow';
  if (config.provider === 'volcengine_plan') return 'volcengine_plan';
  const baseUrl = config.provider === 'local_sd'
    ? parseLocalNetworkApiBaseUrl(config.baseUrl)
    : parseApiBaseUrl(config.baseUrl);
  if (config.provider === 'local_sd') return baseUrl ? `local_sd:${new URL(baseUrl).origin.toLowerCase()}` : null;
  return baseUrl ? new URL(baseUrl).origin.toLowerCase() : null;
};

export const getTavernCredentialScope = (
  config: Pick<TavernModelConfig, 'provider' | 'baseUrl'>,
): string | null => {
  if (config.provider === 'system') return 'system';
  const baseUrl = config.provider === 'dzmm'
    ? DZMM_CARD_CHAT_BASE_URL
    : parseApiBaseUrl(config.baseUrl);
  if (!baseUrl) return null;
  return new URL(baseUrl).origin.toLowerCase();
};

export type TavernStoredMessage = TavernSession['messages'][number] & {
  isSeseBoosted?: boolean;
  flashImage?: {
    url: string;
    // Original data is kept in memory for saving, but intentionally omitted from localStorage.
    downloadUrl?: string;
    caption: string;
    isBurned: boolean;
    kind?: 'flash' | 'generated' | 'ai';
  };
};

const normalizeCandidateReplies = (value: unknown, fallback: string): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const unique = [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 200_000))
    .filter(Boolean))]
    .slice(0, 6);
  if (unique.length < 2) return undefined;
  return unique.includes(fallback) ? unique : [fallback, ...unique].slice(0, 6);
};

export const normalizeTavernGroupScene = (value: unknown, hostCardId: string, availableCardIds: string[]): TavernGroupScene => {
  const safeHostCardId = safeTavernId(hostCardId) || availableCardIds[0] || 'tavern_host';
  const validIds = new Set(availableCardIds.map(safeTavernId).filter((id): id is string => Boolean(id)));
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<TavernGroupScene>
    : {};
  const participantIds = Array.isArray(raw.participantIds)
    ? raw.participantIds.map(safeTavernId).filter((id): id is string => Boolean(id && validIds.has(id)))
    : [];
  return {
    hostCardId: safeHostCardId,
    participantIds: [...new Set([safeHostCardId, ...participantIds])].slice(0, 4),
  };
};

export interface TavernChatArchive {
  id: string;
  cardId: string;
  title: string;
  kind: 'save' | 'branch' | 'auto' | 'checkpoint';
  createdAt: number;
  updatedAt: number;
  parentArchiveId?: string;
  sourceMessageId?: string;
  messages: TavernStoredMessage[];
}

export const MAX_TAVERN_CHAT_ARCHIVES = 40;

// Content budgets protect localStorage without discarding a conversation merely
// because it crossed an arbitrary message count.
const MAX_TAVERN_MESSAGE_SCAN_COUNT = 20_000;
const MAX_TAVERN_SESSION_CONTENT_CHARS = 1_500_000;
const MAX_TAVERN_SESSION_LOCAL_IMAGE_CHARS = 1_500_000;
const MAX_TAVERN_ARCHIVE_CONTENT_CHARS = 750_000;

export interface TavernChatArchiveImportResult {
  imported: number;
  skipped: number;
  total: number;
}

const safeTavernId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{1,160}$/.test(trimmed) ? trimmed : null;
};

const tavernSessionUpdatedKey = (cardId: string) => `ycy_tavern_session_updated_${cardId}`;
const tavernArchiveLibraryUpdatedKey = (cardId: string) => `ycy_tavern_archive_library_updated_${cardId}`;
const tavernSessionDeletedKey = (cardId: string) => `ycy_tavern_session_deleted_${cardId}`;

const getLocalTavernSessionUpdatedAt = (cardId: string): number => {
  try {
    const value = Number(localStorage.getItem(tavernSessionUpdatedKey(cardId)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

const getLocalTavernSessionDeletedAt = (cardId: string): number => {
  try {
    const value = Number(localStorage.getItem(tavernSessionDeletedKey(cardId)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

const clearLocalTavernSessionDeleted = (cardId: string) => {
  try {
    localStorage.removeItem(tavernSessionDeletedKey(cardId));
  } catch {}
};

const getLocalTavernArchiveUpdatedAt = (cardId: string): number => {
  try {
    const value = Number(localStorage.getItem(tavernArchiveLibraryUpdatedKey(cardId)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

const normalizeAvatar = (value: unknown): string => {
  if (typeof value !== 'string') return '🎴';
  const avatar = value.trim();
  if (!avatar || avatar.startsWith('blob:')) return '🎴';
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(avatar)) {
    return avatar.length <= 300_000 ? avatar : '🎴';
  }
  try {
    const url = new URL(avatar);
    if (url.protocol === 'https:' && avatar.length <= 2048) return avatar;
  } catch {}
  if (/^[a-z][a-z0-9+.-]*:/i.test(avatar)) return '🎴';
  return avatar.slice(0, 32) || '🎴';
};

const normalizeImageList = (value: unknown, maxItems = 8): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const images = [...new Set(value.map(normalizeAvatar).filter((item) => /^(?:https:|data:image\/)/i.test(item)))].slice(0, maxItems);
  return images.length > 0 ? images : undefined;
};

export const normalizeAttachedImages = (value: unknown, maxItems = 3): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const images = [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => {
      if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(item)) {
        return item.length <= 800_000;
      }
      try {
        const url = new URL(item);
        return (url.protocol === 'https:' || url.protocol === 'http:') && item.length <= 2048;
      } catch {
        return false;
      }
    }))].slice(0, maxItems);
  return images.length > 0 ? images : undefined;
};

const normalizeTextList = (value: unknown, maxItems: number, maxLength: number): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean))]
    .slice(0, maxItems);
  return items.length > 0 ? items : undefined;
};

const normalizeVoiceSettings = (value: unknown): TavernVoiceSettings | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const enabled = raw.enabled === true || raw.enable === true;
  const voiceId = typeof raw.voiceId === 'string' ? raw.voiceId.trim().slice(0, 200)
    : typeof raw.voice_id === 'string' ? raw.voice_id.trim().slice(0, 200) : '';
  const voiceName = typeof raw.voiceName === 'string' ? raw.voiceName.trim().slice(0, 100)
    : typeof raw.voice_name === 'string' ? raw.voice_name.trim().slice(0, 100) : '';
  const profileId = typeof raw.profileId === 'string' ? raw.profileId.trim().slice(0, 100)
    : typeof raw.profile_id === 'string' ? raw.profile_id.trim().slice(0, 100) : '';
  const requestedEngine = raw.engine === 'siliconflow' || raw.engine === 'volcengine_tts'
    ? raw.engine
    : raw.provider === 'siliconflow' || raw.provider === 'volcengine_tts'
      ? raw.provider
      : undefined;
  const engine = requestedEngine || inferTavernVoiceEngine(voiceId);
  const speed = Number(raw.speed);
  const pitch = Number(raw.pitch);
  const gain = Number(raw.gain);
  if (!enabled && !voiceId && !voiceName && !profileId && !Number.isFinite(speed) && !Number.isFinite(pitch) && !Number.isFinite(gain)) return undefined;
  return {
    enabled,
    engine,
    voiceId: voiceId || undefined,
    voiceName: voiceName || undefined,
    profileId: profileId || undefined,
    speed: Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : undefined,
    pitch: Number.isFinite(pitch) ? Math.min(2, Math.max(0.5, pitch)) : undefined,
    gain: Number.isFinite(gain) ? Math.min(10, Math.max(-10, gain)) : undefined,
  };
};

export const normalizeTavernModelConfig = (value: unknown): TavernModelConfig => {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<TavernModelConfig>
    : {};
  const requestedProvider: TavernModelConfig['provider'] = ['system', 'dzmm', 'custom'].includes(String(raw.provider))
    ? raw.provider as TavernModelConfig['provider']
    : 'system';
  const isLegacyUnverifiedDzmm = raw.baseUrl === 'https://api.dzmm.ai/v1';
  const configuredBaseUrl = parseApiBaseUrl(raw.baseUrl);
  // A damaged custom endpoint must not silently fall back to a different host while retaining its key.
  const provider: TavernModelConfig['provider'] = isLegacyUnverifiedDzmm
    || (requestedProvider === 'custom' && !configuredBaseUrl)
    ? 'system'
    : requestedProvider;
  const rememberApiKey = provider !== 'system' && raw.rememberApiKey === true && !isLegacyUnverifiedDzmm;
  const defaultModel = provider === 'dzmm' ? DZMM_DEFAULT_MODEL : DEFAULT_TAVERN_MODEL_CONFIG.model;

  return {
    provider,
    apiKey: rememberApiKey && typeof raw.apiKey === 'string' ? raw.apiKey.trim().slice(0, 1000) : '',
    baseUrl: provider === 'dzmm'
      ? DZMM_CARD_CHAT_BASE_URL
      : isLegacyUnverifiedDzmm ? DEFAULT_TAVERN_MODEL_CONFIG.baseUrl : configuredBaseUrl || DEFAULT_TAVERN_MODEL_CONFIG.baseUrl,
    model: isLegacyUnverifiedDzmm
      ? defaultModel
      : typeof raw.model === 'string' && raw.model.trim()
        ? raw.model.trim().slice(0, 200)
        : defaultModel,
    userName: typeof raw.userName === 'string' && raw.userName.trim()
      ? raw.userName.trim().slice(0, 40)
      : DEFAULT_TAVERN_MODEL_CONFIG.userName,
    rememberApiKey,
  };
};

export const normalizeTavernImageModelConfig = (value: unknown): TavernImageModelConfig => {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<TavernImageModelConfig>
    : {};
  const requestedProvider: TavernImageModelConfig['provider'] = raw.provider === 'custom'
    ? 'custom'
    : raw.provider === 'siliconflow'
      ? 'siliconflow'
    : raw.provider === 'volcengine_plan'
      ? 'volcengine_plan'
    : raw.provider === 'local_sd'
      ? 'local_sd'
      : 'system';
  const configuredBaseUrl = requestedProvider === 'local_sd'
    ? parseLocalNetworkApiBaseUrl(raw.baseUrl)
    : parseApiBaseUrl(raw.baseUrl);
  const provider: TavernImageModelConfig['provider'] = (requestedProvider === 'custom' || requestedProvider === 'local_sd') && !configuredBaseUrl
    ? 'system'
    : requestedProvider;
  const hasDedicatedKey = provider === 'custom' || provider === 'siliconflow';
  const rememberApiKey = hasDedicatedKey && raw.rememberApiKey === true;
  return {
    provider,
    apiKey: hasDedicatedKey && rememberApiKey && typeof raw.apiKey === 'string' ? raw.apiKey.trim().slice(0, 1000) : '',
    baseUrl: provider === 'siliconflow'
      ? SILICONFLOW_IMAGE_BASE_URL
      : provider === 'volcengine_plan'
      ? VOLCENGINE_PLAN_IMAGE_BASE_URL
      : provider === 'local_sd'
      ? configuredBaseUrl || LOCAL_SD_DEFAULT_BASE_URL
      : configuredBaseUrl || DEFAULT_TAVERN_IMAGE_MODEL_CONFIG.baseUrl,
    model: provider === 'siliconflow'
      ? isSiliconflowImageModel(raw.model) ? raw.model : DEFAULT_SILICONFLOW_IMAGE_MODEL
      : provider === 'volcengine_plan'
      ? VOLCENGINE_PLAN_IMAGE_MODEL
      : provider === 'local_sd'
      ? typeof raw.model === 'string' ? raw.model.trim().slice(0, 200) : ''
      : typeof raw.model === 'string' && raw.model.trim()
      ? raw.model.trim().slice(0, 200)
      : DEFAULT_TAVERN_IMAGE_MODEL_CONFIG.model,
    imageSize: normalizeSiliconflowImageSize(raw.imageSize),
    numInferenceSteps: provider === 'local_sd'
      ? normalizeLocalSdSteps(raw.numInferenceSteps)
      : normalizeSiliconflowImageSteps(raw.numInferenceSteps),
    seed: normalizeSiliconflowImageSeed(raw.seed),
    negativePrompt: normalizeSiliconflowNegativePrompt(raw.negativePrompt),
    localSdBackend: normalizeLocalSdBackend(raw.localSdBackend),
    sdSampler: normalizeLocalSdSampler(raw.sdSampler),
    sdScheduler: normalizeLocalSdScheduler(raw.sdScheduler),
    sdCfgScale: normalizeLocalSdCfgScale(raw.sdCfgScale),
    sdWidth: normalizeLocalSdDimension(raw.sdWidth, LOCAL_SD_DEFAULT_WIDTH),
    sdHeight: normalizeLocalSdDimension(raw.sdHeight, LOCAL_SD_DEFAULT_HEIGHT),
    rememberApiKey,
  };
};

export const normalizeSceneWallpaper = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('data:image/')) {
    return trimmed.length <= 600_000 ? trimmed : undefined;
  }
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://localhost') || trimmed.startsWith('http://127.0.0.1')) {
    return trimmed.length <= 2048 ? trimmed : undefined;
  }
  return undefined;
};

export const normalizeSceneWallpaperOverlay = (value: unknown): number | undefined => {
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return Math.max(0.2, Math.min(0.9, Math.round(num * 100) / 100));
};

export const normalizeExpressions = (value: unknown): TavernCharacterExpressions | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const result: TavernCharacterExpressions = {};
  let count = 0;
  for (const key of TAVERN_EMOTION_KEYS) {
    const val = raw[key];
    if (typeof val === 'string' && val.trim()) {
      const trimmed = val.trim();
      if (trimmed.startsWith('data:image/') && trimmed.length <= 400_000) {
        result[key] = trimmed;
        count++;
      } else if ((trimmed.startsWith('https://') || trimmed.startsWith('http://')) && trimmed.length <= 2048) {
        result[key] = trimmed;
        count++;
      }
    }
  }
  return count > 0 ? result : undefined;
};

export const normalizeTavernCard = (value: unknown): TavernCharacterCard | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const card = value as Partial<TavernCharacterCard>;
  const id = safeTavernId(card.id);
  if (!id || typeof card.name !== 'string') return null;
  const sources: TavernCharacterCard['source'][] = ['preset', 'imported_png', 'imported_json', 'dzmm_cloud', 'ai_generated'];
  const worldBookEntries = Array.isArray(card.worldBookEntries)
    ? card.worldBookEntries.slice(0, 200).map((entry, index) => {
        if (!entry || !Array.isArray(entry.keywords) || typeof entry.content !== 'string') return null;
        const keywords = entry.keywords.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, 100)).filter(Boolean).slice(0, 30);
        if (keywords.length === 0 || !entry.content.trim()) return null;
        return {
          id: typeof entry.id === 'string' ? entry.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) || `cardbook_${index}` : `cardbook_${index}`,
          keywords,
          secondaryKeywords: Array.isArray(entry.secondaryKeywords) ? entry.secondaryKeywords.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, 100)).filter(Boolean).slice(0, 30) : undefined,
          content: entry.content.trim().slice(0, 4000),
          enabled: entry.enabled !== false,
        };
      }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : undefined;
  return {
    id,
    name: card.name.trim().slice(0, 100) || '未命名酒馆角色',
    avatar: normalizeAvatar(card.avatar),
    tag: typeof card.tag === 'string' ? card.tag.slice(0, 120) : '酒馆角色',
    description: typeof card.description === 'string' ? card.description.slice(0, 12000) : '',
    personality: typeof card.personality === 'string' ? card.personality.slice(0, 8000) : '',
    scenario: typeof card.scenario === 'string' ? card.scenario.slice(0, 8000) : '',
    firstMessage: typeof card.firstMessage === 'string' ? card.firstMessage.slice(0, 12000) : '你好，旅人。',
    mesExamples: typeof card.mesExamples === 'string' ? card.mesExamples.slice(0, 12000) : undefined,
    systemPromptAddon: typeof card.systemPromptAddon === 'string' ? card.systemPromptAddon.slice(0, 12000) : undefined,
    postHistoryInstructions: typeof card.postHistoryInstructions === 'string' ? card.postHistoryInstructions.slice(0, 12000) : undefined,
    alternateGreetings: Array.isArray(card.alternateGreetings) ? card.alternateGreetings.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 12000)).slice(0, 20) : undefined,
    creatorNotes: typeof card.creatorNotes === 'string' ? card.creatorNotes.slice(0, 8000) : undefined,
    introduction: typeof card.introduction === 'string' ? card.introduction.slice(0, 12_000) : undefined,
    detailedDescription: typeof card.detailedDescription === 'string' ? card.detailedDescription.slice(0, 20_000) : undefined,
    suggestedReplies: normalizeTextList(card.suggestedReplies, 12, 500),
    galleryImages: normalizeImageList(card.galleryImages),
    voiceSettings: normalizeVoiceSettings(card.voiceSettings),
    sceneWallpaper: normalizeSceneWallpaper(card.sceneWallpaper),
    sceneWallpaperOverlay: normalizeSceneWallpaperOverlay(card.sceneWallpaperOverlay),
    expressions: normalizeExpressions(card.expressions),
    dzmmPublishMeta: card.dzmmPublishMeta && typeof card.dzmmPublishMeta === 'object'
      ? {
          visibility: ['private', 'unlisted', 'public'].includes(String(card.dzmmPublishMeta.visibility))
            ? card.dzmmPublishMeta.visibility : undefined,
          category: typeof card.dzmmPublishMeta.category === 'string' ? card.dzmmPublishMeta.category.trim().slice(0, 100) || undefined : undefined,
        }
      : undefined,
    worldBookEntries: worldBookEntries?.length ? worldBookEntries : undefined,
    hardwareEnchanted: card.hardwareEnchanted === true,
    creator: card.creator === 'DZMM 官方精选'
      ? '幻触内置示例'
      : typeof card.creator === 'string' ? card.creator.slice(0, 100) : undefined,
    source: sources.includes(card.source as TavernCharacterCard['source'])
      ? card.source as TavernCharacterCard['source']
      : 'imported_json',
  };
};

const normalizeFlashImage = (value: unknown): TavernStoredMessage['flashImage'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const flash = value as Record<string, unknown>;
  if (typeof flash.url !== 'string' || typeof flash.caption !== 'string') return undefined;
  const isLocalGeneratedImage = /^data:image\/(?:png|jpe?g|webp);base64,/i.test(flash.url)
    && flash.url.length <= 700_000;
  if (!isLocalGeneratedImage) {
    try {
      const url = new URL(flash.url);
      if (url.protocol !== 'https:' || flash.url.length > 2048) return undefined;
    } catch {
      return undefined;
    }
  }
  return {
    url: flash.url,
    caption: flash.caption.slice(0, 500),
    isBurned: flash.isBurned === true,
    kind: flash.kind === 'generated' ? 'generated' : flash.kind === 'ai' ? 'ai' : 'flash',
  };
};

export const normalizeTavernMessages = (value: unknown): TavernStoredMessage[] => {
  if (!Array.isArray(value)) return [];
  const messages: TavernStoredMessage[] = [];
  const usedIds = new Set<string>();
  let remainingContent = MAX_TAVERN_SESSION_CONTENT_CHARS;
  let remainingLocalImageBytes = MAX_TAVERN_SESSION_LOCAL_IMAGE_CHARS;
  const firstScannedIndex = Math.max(0, value.length - MAX_TAVERN_MESSAGE_SCAN_COUNT);

  for (let index = value.length - 1; index >= firstScannedIndex && remainingContent > 0; index--) {
    const item = value[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const message = item as Record<string, unknown>;
    if (!['user', 'assistant', 'system'].includes(String(message.role))) continue;
    const attachedImages = normalizeAttachedImages(message.images, 3);
    const hasImages = Boolean(attachedImages && attachedImages.length > 0);
    const rawContent = typeof message.content === 'string' ? message.content : '';
    const content = rawContent.slice(0, Math.min(200_000, remainingContent)) || (hasImages ? '（发送了图片）' : '');
    if (!content && !hasImages) continue;
    remainingContent -= content.length;
    const rawId = typeof message.id === 'string' ? message.id.trim().slice(0, 200) : '';
    let id = rawId || `msg-recovered-${index}`;
    while (usedIds.has(id)) id = `msg-recovered-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    usedIds.add(id);
    const timestamp = Number(message.timestamp);
    const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls.slice(0, 50) : undefined;
    let safeToolCalls: unknown[] | undefined;
    if (toolCalls) {
      try {
        const serialized = JSON.stringify(toolCalls);
        if (serialized.length <= 100_000) safeToolCalls = JSON.parse(serialized);
      } catch {}
    }
    let flashImage = normalizeFlashImage(message.flashImage);
    if (flashImage?.url.startsWith('data:')) {
      if (flashImage.url.length > remainingLocalImageBytes) {
        flashImage = undefined;
      } else {
        remainingLocalImageBytes -= flashImage.url.length;
      }
    }
    let safeImages: string[] | undefined;
    if (attachedImages && attachedImages.length > 0) {
      const allowed: string[] = [];
      for (const img of attachedImages) {
        if (img.startsWith('data:')) {
          if (img.length <= remainingLocalImageBytes) {
            allowed.push(img);
            remainingLocalImageBytes -= img.length;
          }
        } else {
          allowed.push(img);
        }
      }
      if (allowed.length > 0) safeImages = allowed;
    }
    messages.push({
      id,
      role: message.role as TavernStoredMessage['role'],
      content,
      timestamp: Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : Date.now(),
      isOOC: message.isOOC === true || undefined,
      toolCalls: safeToolCalls,
      isSeseBoosted: message.isSeseBoosted === true || undefined,
      flashImage,
      speakerCardId: safeTavernId(message.speakerCardId) || undefined,
      candidateReplies: normalizeCandidateReplies(message.candidateReplies, content),
      activeCandidateIndex: Number.isInteger(message.activeCandidateIndex)
        && Number(message.activeCandidateIndex) >= 0
        && Number(message.activeCandidateIndex) < (normalizeCandidateReplies(message.candidateReplies, content)?.length || 0)
        ? Number(message.activeCandidateIndex)
        : undefined,
      images: safeImages,
      emotion: TAVERN_EMOTION_KEYS.includes(message.emotion as TavernEmotionKey)
        ? (message.emotion as TavernEmotionKey)
        : undefined,
    });
  }

  return messages.reverse();
};

const normalizeArchiveMessages = (value: unknown): TavernStoredMessage[] => {
  const normalized = normalizeTavernMessages(value);
  let remainingContent = MAX_TAVERN_ARCHIVE_CONTENT_CHARS;
  const result: TavernStoredMessage[] = [];
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (remainingContent <= 0) break;
    const message = normalized[index];
    const content = message.content.slice(0, Math.min(30_000, remainingContent));
    remainingContent -= content.length;
    result.push({
      ...message,
      content,
      // Base64 scene cards and heavy session images remain in the live session but are omitted from archives to protect storage quota.
      flashImage: message.flashImage?.url.startsWith('data:') ? undefined : message.flashImage,
      images: message.images?.filter((img) => !img.startsWith('data:')),
    });
  }
  return result.reverse();
};

export const normalizeTavernChatArchives = (value: unknown, cardId: string): TavernChatArchive[] => {
  const safeCardId = safeTavernId(cardId);
  if (!safeCardId || !Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  return value.slice(0, MAX_TAVERN_CHAT_ARCHIVES).flatMap((candidate, index): TavernChatArchive[] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const raw = candidate as Record<string, unknown>;
    const rawId = safeTavernId(raw.id);
    const id = rawId && !usedIds.has(rawId) ? rawId : `archive_recovered_${index}`;
    if (usedIds.has(id)) return [];
    usedIds.add(id);
    const messages = normalizeArchiveMessages(raw.messages);
    if (messages.length === 0) return [];
    const createdAt = Number(raw.createdAt);
    const safeCreatedAt = Number.isFinite(createdAt) && createdAt >= 0 ? createdAt : Date.now();
    const updatedAt = Number(raw.updatedAt);
    return [{
      id,
      cardId: safeCardId,
      title: typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim().slice(0, 80)
        : `对话存档 ${index + 1}`,
      kind: raw.kind === 'branch' || raw.kind === 'auto' || raw.kind === 'checkpoint' ? raw.kind : 'save',
      createdAt: safeCreatedAt,
      updatedAt: Number.isFinite(updatedAt) && updatedAt >= 0 ? updatedAt : safeCreatedAt,
      parentArchiveId: safeTavernId(raw.parentArchiveId) || undefined,
      sourceMessageId: safeTavernId(raw.sourceMessageId) || undefined,
      messages,
    }];
  });
};

export class TavernStore {
  private static instance: TavernStore;

  private cards: TavernCharacterCard[] = [];
  private activeCardId: string = PRESET_TAVERN_CARDS[0].id;
  private transientTavernApiKey = '';
  private transientTavernImageApiKey = '';
  private tavernModelConfig: TavernModelConfig = { ...DEFAULT_TAVERN_MODEL_CONFIG };
  private tavernImageModelConfig: TavernImageModelConfig = { ...DEFAULT_TAVERN_IMAGE_MODEL_CONFIG };
  private playerProfile: TavernPlayerProfile = { identity: '', presets: [] };

  private constructor() {
    this.load();
  }

  static getInstance(): TavernStore {
    if (!TavernStore.instance) {
      TavernStore.instance = new TavernStore();
    }
    return TavernStore.instance;
  }

  private load() {
    this.cards = PRESET_TAVERN_CARDS.map((card) => ({ ...card }));
    let newlyInjectedPresets = false;
    try {
      const savedCards = localStorage.getItem('ycy_tavern_cards');
      if (savedCards) {
        const parsed = JSON.parse(savedCards);
        if (Array.isArray(parsed)) {
          let purgedRetired = false;
          const uniqueCards = new Map<string, TavernCharacterCard>();
          for (const value of parsed.slice(0, 200)) {
            const card = normalizeTavernCard(value);
            if (card) {
              if (RETIRED_TAVERN_PRESET_CARD_IDS.has(card.id)) {
                purgedRetired = true;
                continue;
              }
              if (!uniqueCards.has(card.id)) uniqueCards.set(card.id, card);
            }
          }
          if (uniqueCards.size > 0) {
            const hasAnyPreset = [...uniqueCards.values()].some((c) =>
              PRESET_TAVERN_CARDS.some((p) => p.id === c.id)
            );
            if (hasAnyPreset) {
              const missingPresets = PRESET_TAVERN_CARDS.filter((preset) => !uniqueCards.has(preset.id));
              if (missingPresets.length > 0) {
                this.cards = [...missingPresets.map((card) => ({ ...card })), ...uniqueCards.values()];
                newlyInjectedPresets = true;
                this.save();
              } else {
                this.cards = [...uniqueCards.values()];
                if (purgedRetired) this.save();
              }
            } else {
              this.cards = [...uniqueCards.values()];
              if (purgedRetired) this.save();
            }
          } else if (purgedRetired) {
            this.cards = PRESET_TAVERN_CARDS.map((card) => ({ ...card }));
            this.save();
          }
        }
      }
    } catch {}

    try {
      const savedActive = localStorage.getItem('ycy_tavern_active_id');
      if (
        !newlyInjectedPresets
        && savedActive
        && !RETIRED_TAVERN_PRESET_CARD_IDS.has(savedActive)
        && this.cards.some((card) => card.id === savedActive)
      ) {
        this.activeCardId = savedActive;
      } else {
        this.activeCardId = this.cards[0].id;
      }
    } catch {
      this.activeCardId = this.cards[0].id;
    }

    try {
      const savedDzmm = localStorage.getItem('ycy_dzmm_config');
      if (savedDzmm) this.tavernModelConfig = normalizeTavernModelConfig(JSON.parse(savedDzmm));
    } catch {
      this.tavernModelConfig = { ...DEFAULT_TAVERN_MODEL_CONFIG };
    }

    try {
      const savedImageConfig = localStorage.getItem('ycy_tavern_image_config');
      if (savedImageConfig) this.tavernImageModelConfig = normalizeTavernImageModelConfig(JSON.parse(savedImageConfig));
    } catch {
      this.tavernImageModelConfig = { ...DEFAULT_TAVERN_IMAGE_MODEL_CONFIG };
    }

    try {
      const savedPlayerProfile = localStorage.getItem('ycy_tavern_player_profile');
      if (savedPlayerProfile) this.playerProfile = normalizeTavernPlayerProfile(JSON.parse(savedPlayerProfile));
    } catch {
      this.playerProfile = { identity: '', presets: [] };
    }
  }

  save() {
    try {
      localStorage.setItem('ycy_tavern_cards', JSON.stringify(this.cards));
      localStorage.setItem('ycy_tavern_active_id', this.activeCardId);
      // 沿用旧键名读取现有用户数据；内容现已明确为 App 本地酒馆兼容模型配置。
      localStorage.setItem('ycy_dzmm_config', JSON.stringify(this.tavernModelConfig));
      localStorage.setItem('ycy_tavern_image_config', JSON.stringify(this.tavernImageModelConfig));
      localStorage.setItem('ycy_tavern_player_profile', JSON.stringify(this.playerProfile));
    } catch {}
  }

  getCards(): TavernCharacterCard[] {
    return this.cards.map((card) => ({ ...card }));
  }

  getPlayerProfile(): TavernPlayerProfile {
    return {
      identity: this.playerProfile.identity,
      presets: this.playerProfile.presets.map((preset) => ({ ...preset })),
    };
  }

  private commitPlayerProfile(value: unknown): boolean {
    const next = normalizeTavernPlayerProfile(value);
    try {
      localStorage.setItem('ycy_tavern_player_profile', JSON.stringify(next));
      this.playerProfile = next;
      return true;
    } catch {
      return false;
    }
  }

  setPlayerIdentity(identity: unknown): boolean {
    return this.commitPlayerProfile({ ...this.playerProfile, identity });
  }

  upsertPlayerPreset(value: Partial<TavernPlayerPreset>): TavernPlayerPreset | null {
    const existing = this.playerProfile.presets.find((preset) => preset.id === value.id);
    const now = Date.now();
    const normalized = normalizeTavernPlayerPreset({
      ...existing,
      ...value,
      id: existing?.id || createTavernPlayerPresetId(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    if (!normalized) return null;
    if (!existing && this.playerProfile.presets.length >= MAX_TAVERN_PLAYER_PRESETS) return null;
    const next = existing
      ? this.playerProfile.presets.map((preset) => preset.id === normalized.id ? normalized : preset)
      : [normalized, ...this.playerProfile.presets];
    if (!this.commitPlayerProfile({ ...this.playerProfile, presets: next })) return null;
    return { ...normalized };
  }

  togglePlayerPreset(id: string): boolean | null {
    const preset = this.playerProfile.presets.find((item) => item.id === id);
    if (!preset) return null;
    const enabled = !preset.enabled;
    const next = this.playerProfile.presets.map((item) => item.id === id
      ? { ...item, enabled, updatedAt: Date.now() }
      : item);
    return this.commitPlayerProfile({ ...this.playerProfile, presets: next }) ? enabled : null;
  }

  deletePlayerPreset(id: string): boolean {
    const next = this.playerProfile.presets.filter((preset) => preset.id !== id);
    if (next.length === this.playerProfile.presets.length) return false;
    return this.commitPlayerProfile({ ...this.playerProfile, presets: next });
  }

  importPlayerProfile(value: unknown): {
    accepted: number;
    added: number;
    updated: number;
    skipped: number;
    identityImported: boolean;
    persisted: boolean;
  } {
    const candidate = Array.isArray(value)
      ? { identity: this.playerProfile.identity, presets: value }
      : value && typeof value === 'object' && !Array.isArray(value) && ('presets' in value || 'identity' in value)
        ? value
        : { identity: this.playerProfile.identity, presets: [value] };
    const identityImported = Boolean(
      value && typeof value === 'object' && !Array.isArray(value)
      && Object.prototype.hasOwnProperty.call(value, 'identity'),
    );
    const imported = normalizeTavernPlayerProfile(candidate);
    const merged = new Map(this.playerProfile.presets.map((preset) => [preset.id, preset]));
    let added = 0;
    let updated = 0;
    let skipped = 0;
    imported.presets.forEach((preset) => {
      if (merged.has(preset.id)) {
        merged.set(preset.id, preset);
        updated += 1;
      } else if (merged.size < MAX_TAVERN_PLAYER_PRESETS) {
        merged.set(preset.id, preset);
        added += 1;
      } else {
        skipped += 1;
      }
    });
    const persisted = this.commitPlayerProfile({
      identity: identityImported ? imported.identity : this.playerProfile.identity,
      presets: [...merged.values()],
    });
    return {
      accepted: imported.presets.length,
      added: persisted ? added : 0,
      updated: persisted ? updated : 0,
      skipped,
      identityImported,
      persisted,
    };
  }

  getActiveCard(): TavernCharacterCard {
    return this.cards.find((c) => c.id === this.activeCardId) || this.cards[0] || PRESET_TAVERN_CARDS[0];
  }

  setActiveCard(id: string) {
    if (!this.cards.some((card) => card.id === id)) return;
    this.activeCardId = id;
    this.save();
  }

  addCard(card: TavernCharacterCard) {
    const normalized = normalizeTavernCard(card);
    if (!normalized) return;
    this.cards = [normalized, ...this.cards.filter((item) => item.id !== normalized.id)];
    this.activeCardId = normalized.id;
    this.save();
  }

  deleteCard(id: string): boolean {
    if (this.cards.length <= 1 || !this.cards.some((card) => card.id === id)) return false;
    this.cards = this.cards.filter((c) => c.id !== id);
    if (this.activeCardId === id && this.cards.length > 0) {
      this.activeCardId = this.cards[0].id;
    }
    this.clearSession(id);
    try {
      const safeCardId = safeTavernId(id);
      if (safeCardId) {
        localStorage.removeItem(`ycy_tavern_archives_${safeCardId}`);
        localStorage.removeItem(tavernArchiveLibraryUpdatedKey(safeCardId));
        localStorage.removeItem(`ycy_tavern_memory_${safeCardId}`);
        localStorage.removeItem(`ycy_tavern_author_note_${safeCardId}`);
        localStorage.removeItem(`ycy_tavern_stats_${safeCardId}`);
        localStorage.removeItem(`ycy_tavern_draft_${safeCardId}`);
        localStorage.removeItem(`ycy_tavern_bookmarks_${safeCardId}`);
      }
    } catch {}
    const safeCardId = safeTavernId(id);
    if (safeCardId) void deleteTavernArchiveRecord(safeCardId);
    this.save();
    return true;
  }

  toggleCardEnchant(id: string) {
    const c = this.cards.find((card) => card.id === id);
    if (c) {
      c.hardwareEnchanted = !c.hardwareEnchanted;
      this.save();
    }
  }

  updateCardVisuals(cardId: string, visuals: {
    sceneWallpaper?: string | null;
    sceneWallpaperOverlay?: number | null;
    expressions?: TavernCharacterExpressions | null;
  }): TavernCharacterCard | null {
    const cardIndex = this.cards.findIndex((card) => card.id === cardId);
    if (cardIndex === -1) return null;
    const current = this.cards[cardIndex];
    const next: TavernCharacterCard = {
      ...current,
      sceneWallpaper: visuals.sceneWallpaper === null
        ? undefined
        : (visuals.sceneWallpaper !== undefined ? normalizeSceneWallpaper(visuals.sceneWallpaper) : current.sceneWallpaper),
      sceneWallpaperOverlay: visuals.sceneWallpaperOverlay === null
        ? undefined
        : (visuals.sceneWallpaperOverlay !== undefined ? normalizeSceneWallpaperOverlay(visuals.sceneWallpaperOverlay) : current.sceneWallpaperOverlay),
      expressions: visuals.expressions === null
        ? undefined
        : (visuals.expressions !== undefined ? normalizeExpressions(visuals.expressions) : current.expressions),
    };
    this.cards[cardIndex] = next;
    this.save();
    return { ...next };
  }

  getTavernModelConfig(): TavernModelConfig {
    return {
      ...this.tavernModelConfig,
      apiKey: this.transientTavernApiKey || this.tavernModelConfig.apiKey,
    };
  }

  setTavernModelConfig(config: Partial<TavernModelConfig>) {
    const current = this.getTavernModelConfig();
    const merged = { ...current, ...config };
    const provider = ['system', 'dzmm', 'custom'].includes(String(merged.provider))
      ? merged.provider as TavernModelConfig['provider']
      : 'system';
    if (provider === 'custom' && !parseApiBaseUrl(merged.baseUrl)) {
      throw new Error('兼容 API 地址无效，必须使用 HTTPS（仅本机 localhost 可使用 HTTP）');
    }
    const nextScope = getTavernCredentialScope({ ...merged, provider });
    const scopeChanged = getTavernCredentialScope(current) !== nextScope;
    const hasExplicitApiKey = Object.prototype.hasOwnProperty.call(config, 'apiKey')
      && typeof config.apiKey === 'string';
    const suppliedApiKey = String(hasExplicitApiKey ? config.apiKey : current.apiKey).trim().slice(0, 1000);
    // A form commonly submits the previous key together with a newly edited URL.
    // Treat that unchanged value as inherited, not as consent to send it to another origin.
    const incomingApiKey = scopeChanged && (!hasExplicitApiKey || suppliedApiKey === current.apiKey)
      ? ''
      : suppliedApiKey;
    if (provider === 'dzmm' && !incomingApiKey) {
      throw new Error('请先从 DZMM 官网 API 页面获取个人 API Token');
    }
    const next = normalizeTavernModelConfig({
      ...merged,
      provider,
      apiKey: incomingApiKey,
      baseUrl: provider === 'dzmm' ? DZMM_CARD_CHAT_BASE_URL : merged.baseUrl,
      model: provider === 'dzmm' ? String(merged.model || DZMM_DEFAULT_MODEL) : merged.model,
      rememberApiKey: provider !== 'system' && merged.rememberApiKey === true,
    });
    this.transientTavernApiKey = provider === 'system' ? '' : incomingApiKey;
    this.tavernModelConfig = next;
    this.save();
  }

  getTavernImageModelConfig(): TavernImageModelConfig {
    return {
      ...this.tavernImageModelConfig,
      apiKey: this.transientTavernImageApiKey || this.tavernImageModelConfig.apiKey,
    };
  }

  setTavernImageModelConfig(config: Partial<TavernImageModelConfig>) {
    const current = this.getTavernImageModelConfig();
    const merged = { ...current, ...config };
    const provider: TavernImageModelConfig['provider'] = merged.provider === 'custom'
      ? 'custom'
      : merged.provider === 'siliconflow'
        ? 'siliconflow'
      : merged.provider === 'volcengine_plan'
        ? 'volcengine_plan'
      : merged.provider === 'local_sd'
        ? 'local_sd'
        : 'system';
    if (provider === 'custom' && !parseApiBaseUrl(merged.baseUrl)) {
      throw new Error('生图 API 地址无效，必须使用 HTTPS（仅本机 localhost 可使用 HTTP）');
    }
    if (provider === 'local_sd' && !parseLocalNetworkApiBaseUrl(merged.baseUrl)) {
      throw new Error('本地 SD 地址无效，请填写 localhost 或局域网地址，例如 http://192.168.1.10:7860');
    }
    const scopeChanged = getTavernImageCredentialScope(current)
      !== getTavernImageCredentialScope({ ...merged, provider });
    const hasExplicitApiKey = Object.prototype.hasOwnProperty.call(config, 'apiKey')
      && typeof config.apiKey === 'string';
    const suppliedApiKey = String(hasExplicitApiKey ? config.apiKey : current.apiKey).trim().slice(0, 1000);
    const incomingApiKey = scopeChanged && (!hasExplicitApiKey || suppliedApiKey === current.apiKey)
      ? ''
      : suppliedApiKey;
    const hasDedicatedKey = provider === 'custom' || provider === 'siliconflow';
    const next = normalizeTavernImageModelConfig({
      ...merged,
      provider,
      apiKey: hasDedicatedKey ? incomingApiKey : '',
      baseUrl: provider === 'siliconflow'
        ? SILICONFLOW_IMAGE_BASE_URL
        : provider === 'volcengine_plan' ? VOLCENGINE_PLAN_IMAGE_BASE_URL
        : provider === 'local_sd' ? parseLocalNetworkApiBaseUrl(merged.baseUrl) || LOCAL_SD_DEFAULT_BASE_URL
        : merged.baseUrl,
      model: provider === 'siliconflow'
        ? isSiliconflowImageModel(merged.model) ? merged.model : DEFAULT_SILICONFLOW_IMAGE_MODEL
        : provider === 'volcengine_plan' ? VOLCENGINE_PLAN_IMAGE_MODEL
        : provider === 'local_sd' ? String(merged.model || '').trim().slice(0, 200)
        : merged.model,
      rememberApiKey: hasDedicatedKey && merged.rememberApiKey === true,
    });
    this.transientTavernImageApiKey = hasDedicatedKey ? incomingApiKey : '';
    this.tavernImageModelConfig = next;
    this.save();
  }

  getSession(cardId: string): TavernStoredMessage[] | null {
    try {
      const safeCardId = safeTavernId(cardId);
      if (!safeCardId) return null;
      const deletedAt = getLocalTavernSessionDeletedAt(safeCardId);
      const updatedAt = getLocalTavernSessionUpdatedAt(safeCardId);
      const saved = localStorage.getItem(`ycy_tavern_chat_${safeCardId}`);
      if (saved) {
        const messages = normalizeTavernMessages(JSON.parse(saved));
        if (messages.length > 0 && (!deletedAt || updatedAt > deletedAt)) {
          if (deletedAt) clearLocalTavernSessionDeleted(safeCardId);
          return messages;
        }
      }
    } catch {}
    return null;
  }

  async getSessionAsync(cardId: string): Promise<TavernStoredMessage[] | null> {
    const safeCardId = safeTavernId(cardId);
    if (!safeCardId) return null;
    const legacyMessages = this.getSession(safeCardId);
    const localUpdatedAt = getLocalTavernSessionUpdatedAt(safeCardId);
    const deletedAt = getLocalTavernSessionDeletedAt(safeCardId);
    const record = await loadTavernSessionRecord(safeCardId);
    if (record) {
      const messages = normalizeTavernMessages(record.messages);
      const recordIsNewerThanDeletion = !deletedAt || record.updatedAt > deletedAt;
      if (messages.length > 0 && recordIsNewerThanDeletion && (!legacyMessages || record.updatedAt >= localUpdatedAt)) {
        if (deletedAt) clearLocalTavernSessionDeleted(safeCardId);
        return messages;
      }
    }
    if (deletedAt) {
      void deleteTavernSessionRecord(safeCardId);
      return null;
    }
    if (legacyMessages) await saveTavernSessionRecord(safeCardId, legacyMessages);
    return legacyMessages;
  }

  getMemory(cardId: string): TavernMemoryState {
    try {
      const safeCardId = safeTavernId(cardId);
      if (!safeCardId) return normalizeTavernMemoryState(undefined);
      return normalizeTavernMemoryState(JSON.parse(localStorage.getItem(`ycy_tavern_memory_${safeCardId}`) || '{}'));
    } catch {
      return normalizeTavernMemoryState(undefined);
    }
  }

  saveMemory(cardId: string, value: unknown): TavernMemoryState | null {
    const safeCardId = safeTavernId(cardId);
    if (!safeCardId) return null;
    const memory = normalizeTavernMemoryState(value);
    try {
      localStorage.setItem(`ycy_tavern_memory_${safeCardId}`, JSON.stringify(memory));
      return memory;
    } catch {
      return null;
    }
  }

  clearMemory(cardId: string): boolean {
    try {
      const safeCardId = safeTavernId(cardId);
      if (!safeCardId) return false;
      localStorage.removeItem(`ycy_tavern_memory_${safeCardId}`);
      return true;
    } catch {
      return false;
    }
  }

  getAuthorNote(cardId: string): TavernAuthorNoteState {
    try {
      const safeCardId = safeTavernId(cardId);
      if (!safeCardId) return normalizeTavernAuthorNote(undefined);
      return normalizeTavernAuthorNote(JSON.parse(localStorage.getItem(`ycy_tavern_author_note_${safeCardId}`) || '{}'));
    } catch {
      return normalizeTavernAuthorNote(undefined);
    }
  }

  saveAuthorNote(cardId: string, value: unknown): TavernAuthorNoteState | null {
    const safeCardId = safeTavernId(cardId);
    if (!safeCardId) return null;
    const note = normalizeTavernAuthorNote({
      ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
      updatedAt: Date.now(),
    });
    try {
      localStorage.setItem(`ycy_tavern_author_note_${safeCardId}`, JSON.stringify(note));
      return note;
    } catch {
      return null;
    }
  }

  clearAuthorNote(cardId: string): boolean {
    try {
      const safeCardId = safeTavernId(cardId);
      if (!safeCardId) return false;
      localStorage.removeItem(`ycy_tavern_author_note_${safeCardId}`);
      return true;
    } catch {
      return false;
    }
  }

  getGenerationConfig(): TavernGenerationConfig {
    try {
      return normalizeTavernGenerationConfig(JSON.parse(localStorage.getItem('ycy_tavern_generation_config') || '{}'));
    } catch {
      return normalizeTavernGenerationConfig(undefined);
    }
  }

  saveGenerationConfig(value: unknown): TavernGenerationConfig | null {
    const config = normalizeTavernGenerationConfig(value);
    try {
      localStorage.setItem('ycy_tavern_generation_config', JSON.stringify(config));
      return config;
    } catch {
      return null;
    }
  }

  getGroupScene(hostCardId: string): TavernGroupScene {
    const safeHostCardId = safeTavernId(hostCardId) || this.activeCardId;
    try {
      const raw = JSON.parse(localStorage.getItem(`ycy_tavern_group_${safeHostCardId}`) || '{}');
      return normalizeTavernGroupScene(raw, safeHostCardId, this.cards.map((card) => card.id));
    } catch {
      return normalizeTavernGroupScene({}, safeHostCardId, this.cards.map((card) => card.id));
    }
  }

  saveGroupScene(hostCardId: string, participantIds: unknown) {
    const safeHostCardId = safeTavernId(hostCardId);
    if (!safeHostCardId) return;
    const group = normalizeTavernGroupScene({ participantIds }, safeHostCardId, this.cards.map((card) => card.id));
    try {
      localStorage.setItem(`ycy_tavern_group_${safeHostCardId}`, JSON.stringify(group));
    } catch {}
  }

  saveSession(cardId: string, messages: unknown): boolean {
    try {
      const safeCardId = safeTavernId(cardId);
      if (!safeCardId) return false;
      localStorage.setItem(`ycy_tavern_chat_${safeCardId}`, JSON.stringify(normalizeTavernMessages(messages)));
      localStorage.setItem(tavernSessionUpdatedKey(safeCardId), String(Date.now()));
      clearLocalTavernSessionDeleted(safeCardId);
      return true;
    } catch {
      return false;
    }
  }

  async saveSessionAsync(cardId: string, messages: unknown): Promise<boolean> {
    const safeCardId = safeTavernId(cardId);
    if (!safeCardId) return false;
    const normalized = normalizeTavernMessages(messages);
    if (normalized.length === 0) return false;
    const localSaved = this.saveSession(safeCardId, normalized);
    const repositorySaved = await saveTavernSessionRecord(safeCardId, normalized);
    if (repositorySaved) clearLocalTavernSessionDeleted(safeCardId);
    return localSaved || repositorySaved;
  }

  clearSession(cardId: string) {
    const safeCardId = safeTavernId(cardId);
    if (!safeCardId) return;
    const deletedAt = Date.now();
    try {
      localStorage.setItem(tavernSessionDeletedKey(safeCardId), String(deletedAt));
      localStorage.removeItem(`ycy_tavern_chat_${safeCardId}`);
      localStorage.removeItem(tavernSessionUpdatedKey(safeCardId));
      localStorage.removeItem(`ycy_tavern_draft_${safeCardId}`);
    } catch {}
    void deleteTavernSessionRecord(safeCardId).then((deleted) => {
      if (!deleted) return;
      try {
        if (Number(localStorage.getItem(tavernSessionDeletedKey(safeCardId))) === deletedAt) {
          localStorage.removeItem(tavernSessionDeletedKey(safeCardId));
        }
      } catch {}
    });
  }

  getChatArchives(cardId: string): TavernChatArchive[] {
    try {
      const safeCardId = safeTavernId(cardId);
      if (!safeCardId) return [];
      const parsed: unknown = JSON.parse(localStorage.getItem(`ycy_tavern_archives_${safeCardId}`) || '[]');
      return normalizeTavernChatArchives(parsed, safeCardId);
    } catch {
      return [];
    }
  }

  private saveChatArchivesLocal(cardId: string, archives: TavernChatArchive[]): boolean {
    try {
      localStorage.setItem(`ycy_tavern_archives_${cardId}`, JSON.stringify(archives));
      localStorage.setItem(tavernArchiveLibraryUpdatedKey(cardId), String(Date.now()));
      return true;
    } catch {
      return false;
    }
  }

  async getChatArchivesAsync(cardId: string): Promise<TavernChatArchive[]> {
    const safeCardId = safeTavernId(cardId);
    if (!safeCardId) return [];
    const localArchives = this.getChatArchives(safeCardId);
    const localUpdatedAt = getLocalTavernArchiveUpdatedAt(safeCardId);
    const record = await loadTavernArchiveRecord(safeCardId);
    if (record) {
      const archives = normalizeTavernChatArchives(record.archives, safeCardId);
      if (record.updatedAt >= localUpdatedAt) return archives;
    }
    if (localArchives.length > 0) await saveTavernArchiveRecord(safeCardId, localArchives);
    return localArchives;
  }

  private createChatArchive(
    cardId: string,
    messages: unknown,
    kind: TavernChatArchive['kind'],
    title?: string,
    metadata?: Pick<TavernChatArchive, 'parentArchiveId' | 'sourceMessageId'>,
  ): TavernChatArchive | null {
    const safeMessages = normalizeArchiveMessages(messages);
    if (safeMessages.length === 0) return null;
    const idSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    return {
      id: `archive_${idSuffix}`.slice(0, 160),
      cardId,
      title: String(title || (kind === 'branch' ? '对话分支起点' : kind === 'auto' ? '新对话前自动存档' : '手动存档')).trim().slice(0, 80),
      kind,
      createdAt: now,
      updatedAt: now,
      parentArchiveId: safeTavernId(metadata?.parentArchiveId) || undefined,
      sourceMessageId: safeTavernId(metadata?.sourceMessageId) || undefined,
      messages: safeMessages,
    };
  }

  saveChatArchive(
    cardId: string,
    messages: unknown,
    kind: TavernChatArchive['kind'] = 'save',
    title?: string,
    metadata?: Pick<TavernChatArchive, 'parentArchiveId' | 'sourceMessageId'>,
  ): TavernChatArchive | null {
    const safeCardId = safeTavernId(cardId);
    if (!safeCardId) return null;
    const archive = this.createChatArchive(safeCardId, messages, kind, title, metadata);
    if (!archive) return null;
    const archives = [archive, ...this.getChatArchives(safeCardId)].slice(0, MAX_TAVERN_CHAT_ARCHIVES);
    if (!this.saveChatArchivesLocal(safeCardId, archives)) return null;
    void saveTavernArchiveRecord(safeCardId, archives);
    return archive;
  }

  async saveChatArchiveAsync(
    cardId: string,
    messages: unknown,
    kind: TavernChatArchive['kind'] = 'save',
    title?: string,
    metadata?: Pick<TavernChatArchive, 'parentArchiveId' | 'sourceMessageId'>,
  ): Promise<TavernChatArchive | null> {
    const safeCardId = safeTavernId(cardId);
    if (!safeCardId) return null;
    const archive = this.createChatArchive(safeCardId, messages, kind, title, metadata);
    if (!archive) return null;
    const archives = [archive, ...await this.getChatArchivesAsync(safeCardId)].slice(0, MAX_TAVERN_CHAT_ARCHIVES);
    const localSaved = this.saveChatArchivesLocal(safeCardId, archives);
    const repositorySaved = await saveTavernArchiveRecord(safeCardId, archives);
    return localSaved || repositorySaved ? archive : null;
  }

  deleteChatArchive(cardId: string, archiveId: string): boolean {
    try {
      const safeCardId = safeTavernId(cardId);
      const safeArchiveId = safeTavernId(archiveId);
      if (!safeCardId || !safeArchiveId) return false;
      const current = this.getChatArchives(safeCardId);
      const next = current.filter((archive) => archive.id !== safeArchiveId);
      if (next.length === current.length) return false;
      if (!this.saveChatArchivesLocal(safeCardId, next)) return false;
      void saveTavernArchiveRecord(safeCardId, next);
      return true;
    } catch {
      return false;
    }
  }

  async deleteChatArchiveAsync(cardId: string, archiveId: string): Promise<boolean> {
    const safeCardId = safeTavernId(cardId);
    const safeArchiveId = safeTavernId(archiveId);
    if (!safeCardId || !safeArchiveId) return false;
    const current = await this.getChatArchivesAsync(safeCardId);
    const next = current.filter((archive) => archive.id !== safeArchiveId);
    if (next.length === current.length) return false;
    const localSaved = this.saveChatArchivesLocal(safeCardId, next);
    const repositorySaved = await saveTavernArchiveRecord(safeCardId, next);
    return localSaved || repositorySaved;
  }

  renameChatArchive(cardId: string, archiveId: string, title: string): TavernChatArchive | null {
    try {
      const safeCardId = safeTavernId(cardId);
      const safeArchiveId = safeTavernId(archiveId);
      const safeTitle = String(title || '').trim().slice(0, 80);
      if (!safeCardId || !safeArchiveId || !safeTitle) return null;
      const current = this.getChatArchives(safeCardId);
      const target = current.find((archive) => archive.id === safeArchiveId);
      if (!target) return null;
      const renamed = { ...target, title: safeTitle, updatedAt: Date.now() };
      const next = current.map((archive) => archive.id === safeArchiveId ? renamed : archive);
      if (!this.saveChatArchivesLocal(safeCardId, next)) return null;
      void saveTavernArchiveRecord(safeCardId, next);
      return renamed;
    } catch {
      return null;
    }
  }

  async renameChatArchiveAsync(cardId: string, archiveId: string, title: string): Promise<TavernChatArchive | null> {
    const safeCardId = safeTavernId(cardId);
    const safeArchiveId = safeTavernId(archiveId);
    const safeTitle = String(title || '').trim().slice(0, 80);
    if (!safeCardId || !safeArchiveId || !safeTitle) return null;
    const current = await this.getChatArchivesAsync(safeCardId);
    const target = current.find((archive) => archive.id === safeArchiveId);
    if (!target) return null;
    const renamed = { ...target, title: safeTitle, updatedAt: Date.now() };
    const next = current.map((archive) => archive.id === safeArchiveId ? renamed : archive);
    const localSaved = this.saveChatArchivesLocal(safeCardId, next);
    const repositorySaved = await saveTavernArchiveRecord(safeCardId, next);
    return localSaved || repositorySaved ? renamed : null;
  }

  private prepareChatArchiveImport(
    cardId: string,
    candidates: unknown[],
    current: TavernChatArchive[],
  ): { next: TavernChatArchive[]; result: TavernChatArchiveImportResult } {
    const normalized = normalizeTavernChatArchives(candidates, cardId);
    const usedIds = new Set(current.map((archive) => archive.id));
    const idMap = new Map<string, string>();
    const incoming = normalized.map((archive) => {
      let id = archive.id;
      if (usedIds.has(id)) {
        const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().replace(/-/g, '')
          : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
        id = `archive_${suffix}`.slice(0, 160);
      }
      usedIds.add(id);
      idMap.set(archive.id, id);
      return { ...archive, id, cardId, updatedAt: Date.now() };
    }).map((archive) => ({
      ...archive,
      parentArchiveId: archive.parentArchiveId
        ? idMap.get(archive.parentArchiveId) || archive.parentArchiveId
        : undefined,
    }));
    const availableSlots = Math.max(0, MAX_TAVERN_CHAT_ARCHIVES - current.length);
    const accepted = incoming.slice(0, availableSlots);
    return {
      next: [...accepted, ...current].slice(0, MAX_TAVERN_CHAT_ARCHIVES),
      result: {
        imported: accepted.length,
        skipped: candidates.length - accepted.length,
        total: candidates.length,
      },
    };
  }

  importChatArchives(cardId: string, value: unknown): TavernChatArchiveImportResult {
    const safeCardId = safeTavernId(cardId);
    const candidates = Array.isArray(value) ? value : [];
    if (!safeCardId) return { imported: 0, skipped: candidates.length, total: candidates.length };
    const current = this.getChatArchives(safeCardId);
    const prepared = this.prepareChatArchiveImport(safeCardId, candidates, current);
    if (!this.saveChatArchivesLocal(safeCardId, prepared.next)) {
      return { imported: 0, skipped: candidates.length, total: candidates.length };
    }
    void saveTavernArchiveRecord(safeCardId, prepared.next);
    return prepared.result;
  }

  async importChatArchivesAsync(cardId: string, value: unknown): Promise<TavernChatArchiveImportResult> {
    const safeCardId = safeTavernId(cardId);
    const candidates = Array.isArray(value) ? value : [];
    if (!safeCardId) return { imported: 0, skipped: candidates.length, total: candidates.length };
    const current = await this.getChatArchivesAsync(safeCardId);
    const prepared = this.prepareChatArchiveImport(safeCardId, candidates, current);
    const localSaved = this.saveChatArchivesLocal(safeCardId, prepared.next);
    const repositorySaved = await saveTavernArchiveRecord(safeCardId, prepared.next);
    return localSaved || repositorySaved
      ? prepared.result
      : { imported: 0, skipped: candidates.length, total: candidates.length };
  }
}
