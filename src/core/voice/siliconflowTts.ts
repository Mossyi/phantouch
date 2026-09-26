export const SILICONFLOW_TTS_MODELS = [
  {
    id: 'FunAudioLLM/CosyVoice2-0.5B',
    name: 'CosyVoice2 0.5B',
    description: '多语言、方言与情感控制，适合角色对白。',
  },
  {
    id: 'fnlp/MOSS-TTSD-v0.5',
    name: 'MOSS-TTSD v0.5',
    description: '中英双语与长文本对话；所选基础音色会作为参考音频。',
  },
] as const;

export const SILICONFLOW_TTS_VOICES = [
  { id: 'alex', name: 'Alex', gender: '男声', style: '沉稳' },
  { id: 'benjamin', name: 'Benjamin', gender: '男声', style: '低沉' },
  { id: 'charles', name: 'Charles', gender: '男声', style: '磁性' },
  { id: 'david', name: 'David', gender: '男声', style: '欢快' },
  { id: 'anna', name: 'Anna', gender: '女声', style: '沉稳' },
  { id: 'bella', name: 'Bella', gender: '女声', style: '激情' },
  { id: 'claire', name: 'Claire', gender: '女声', style: '温柔' },
  { id: 'diana', name: 'Diana', gender: '女声', style: '欢快' },
] as const;

export type SiliconflowTtsModel = typeof SILICONFLOW_TTS_MODELS[number]['id'];
export type SiliconflowTtsVoice = typeof SILICONFLOW_TTS_VOICES[number]['id'];

export const DEFAULT_SILICONFLOW_TTS_MODEL: SiliconflowTtsModel = 'FunAudioLLM/CosyVoice2-0.5B';
export const DEFAULT_SILICONFLOW_TTS_VOICE: SiliconflowTtsVoice = 'anna';
export const MOSS_SILICONFLOW_TTS_MODEL: SiliconflowTtsModel = 'fnlp/MOSS-TTSD-v0.5';

const MOSS_REFERENCE_TEXT = '他又躺在那里，眼睛闭着，仍然沉浸在梦境的气氛里。那是个庞杂而亮堂的梦';
const MOSS_REFERENCE_AUDIO_BASE_URL = 'https://sf-maas-uat-prod.oss-cn-shanghai.aliyuncs.com/voice_template';

export interface SiliconflowTtsRequestBody {
  model: SiliconflowTtsModel;
  input: string;
  response_format: 'mp3';
  speed: number;
  gain: number;
  voice?: string;
  stream?: boolean;
  references?: Array<{ audio: string; text: string }>;
  max_tokens?: number;
}

export const normalizeSiliconflowTtsModel = (value: unknown): SiliconflowTtsModel => (
  SILICONFLOW_TTS_MODELS.some((model) => model.id === value)
    ? value as SiliconflowTtsModel
    : DEFAULT_SILICONFLOW_TTS_MODEL
);

export const normalizeSiliconflowTtsVoice = (value: unknown): SiliconflowTtsVoice => (
  SILICONFLOW_TTS_VOICES.some((voice) => voice.id === value)
    ? value as SiliconflowTtsVoice
    : DEFAULT_SILICONFLOW_TTS_VOICE
);

export const buildSiliconflowVoiceId = (model: unknown, voice: unknown): string => (
  `${normalizeSiliconflowTtsModel(model)}:${normalizeSiliconflowTtsVoice(voice)}`
);

export const isMossSiliconflowTtsModel = (model: unknown): boolean => (
  normalizeSiliconflowTtsModel(model) === MOSS_SILICONFLOW_TTS_MODEL
);

export const splitTextForTts = (value: unknown, maxLength = 3_500): string[] => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return [];
  const limit = Math.max(200, Math.min(4_000, Math.floor(Number(maxLength) || 3_500)));
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const windowText = remaining.slice(0, limit);
    const minimumSplit = Math.floor(limit * 0.55);
    let splitAt = -1;
    for (const punctuation of ['\n', '。', '！', '？', '；', '…', '.', '!', '?', ';', '，', ',']) {
      const index = windowText.lastIndexOf(punctuation);
      if (index >= minimumSplit) splitAt = Math.max(splitAt, index + punctuation.length);
    }
    if (splitAt < minimumSplit) {
      const whitespace = Math.max(windowText.lastIndexOf(' '), windowText.lastIndexOf('\t'));
      if (whitespace >= minimumSplit) splitAt = whitespace + 1;
    }
    if (splitAt < minimumSplit) splitAt = limit;
    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
};

export const buildSiliconflowTtsRequest = (
  modelValue: unknown,
  voiceValue: unknown,
  inputValue: unknown,
  speedValue: unknown,
  gainValue: unknown,
): SiliconflowTtsRequestBody => {
  const model = normalizeSiliconflowTtsModel(modelValue);
  const voice = normalizeSiliconflowTtsVoice(voiceValue);
  const input = typeof inputValue === 'string' ? inputValue.trim().slice(0, 4_000) : '';
  const speed = Math.max(0.7, Math.min(1.5, Number(speedValue) || 1));
  const gain = Math.max(-10, Math.min(10, Number(gainValue) || 0));

  if (model === MOSS_SILICONFLOW_TTS_MODEL) {
    const referenceName = voice.charAt(0).toUpperCase() + voice.slice(1);
    return {
      model,
      input: `[S1]${input}`,
      references: [{
        audio: `${MOSS_REFERENCE_AUDIO_BASE_URL}/fish_audio-${referenceName}.mp3`,
        text: MOSS_REFERENCE_TEXT,
      }],
      stream: true,
      max_tokens: 1_600,
      response_format: 'mp3',
      speed,
      gain,
    };
  }

  return {
    model,
    input,
    voice: buildSiliconflowVoiceId(model, voice),
    response_format: 'mp3',
    speed,
    gain,
  };
};
