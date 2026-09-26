import type { TTSEngineType, VoiceConfig } from '../../types';
import { SILICONFLOW_TTS_VOICES } from '../voice/siliconflowTts';
import { VOLCENGINE_TTS_VOICE_PRESETS } from '../voice/volcengineTts';
import type { TavernVoiceSettings } from './tavernTypes';
import { sanitizeTavernVisibleContent } from './tavernTextSanitizer';

export type TavernRoleTtsEngine = Extract<TTSEngineType, 'siliconflow' | 'volcengine_tts'>;

export interface TavernTtsVoiceOption {
  id: string;
  name: string;
  gender: '男声' | '女声';
  detail: string;
}

export const getTavernTtsVoiceOptions = (engine: TTSEngineType): TavernTtsVoiceOption[] => {
  if (engine === 'siliconflow') {
    return SILICONFLOW_TTS_VOICES.map((voice) => ({
      id: voice.id,
      name: voice.name,
      gender: voice.gender,
      detail: voice.style,
    }));
  }
  if (engine === 'volcengine_tts') {
    return VOLCENGINE_TTS_VOICE_PRESETS.map((voice) => ({
      id: voice.id,
      name: voice.name,
      gender: voice.gender,
      detail: voice.category,
    }));
  }
  return [];
};

export const inferTavernVoiceEngine = (voiceId: unknown): TavernRoleTtsEngine | undefined => {
  if (typeof voiceId !== 'string') return undefined;
  if (SILICONFLOW_TTS_VOICES.some((voice) => voice.id === voiceId)) return 'siliconflow';
  if (VOLCENGINE_TTS_VOICE_PRESETS.some((voice) => voice.id === voiceId)) return 'volcengine_tts';
  return undefined;
};

export const resolveTavernVoiceConfig = (
  settings: TavernVoiceSettings | undefined,
  currentEngine: TTSEngineType,
): VoiceConfig | undefined => {
  if (!settings?.enabled || !settings.voiceId) return undefined;
  const selectedEngine = settings.engine || inferTavernVoiceEngine(settings.voiceId);
  if (selectedEngine !== currentEngine) return undefined;
  const option = getTavernTtsVoiceOptions(currentEngine).find((voice) => voice.id === settings.voiceId);
  if (!option) return undefined;

  const rate = Number(settings.speed);
  const pitch = Number(settings.pitch);
  const gain = Number(settings.gain);
  const config: VoiceConfig = {
    gender: option.gender === '男声' ? 'male' : 'female',
    rate: Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1,
    pitch: Number.isFinite(pitch) ? Math.max(0.5, Math.min(2, pitch)) : 1,
    gain: Number.isFinite(gain) ? Math.max(-10, Math.min(10, gain)) : 0,
    absoluteTuning: true,
  };
  if (currentEngine === 'siliconflow') config.siliconflowVoice = option.id;
  if (currentEngine === 'volcengine_tts') config.volcengineVoice = option.id;
  return config;
};

export const shouldAutoPlayTavernVoice = (enabled: boolean, text: unknown): boolean => (
  enabled && typeof text === 'string' && text.trim().length > 0
);

export const prepareTavernSpeechText = (text: unknown): string => (
  typeof text === 'string' ? sanitizeTavernVisibleContent(text, false) : ''
);

export const resolveTavernNarrationVoiceConfig = (
  settings: TavernVoiceSettings | undefined,
  currentEngine: TTSEngineType,
): VoiceConfig => ({
  ...(resolveTavernVoiceConfig(settings, currentEngine) || {
    gender: 'female' as const,
    rate: 1,
    pitch: 1,
  }),
  preserveNarration: true,
});
