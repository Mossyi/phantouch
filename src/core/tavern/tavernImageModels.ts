export const SILICONFLOW_IMAGE_BASE_URL = 'https://api.siliconflow.cn/v1';

export const SILICONFLOW_IMAGE_MODELS = [
  { id: 'Qwen/Qwen-Image', name: 'Qwen Image', mode: 'generate' },
  { id: 'Qwen/Qwen-Image-Edit', name: 'Qwen Image Edit', mode: 'edit' },
  { id: 'Qwen/Qwen-Image-Edit-2509', name: 'Qwen Image Edit 2509', mode: 'edit' },
] as const;

export type SiliconflowImageModel = typeof SILICONFLOW_IMAGE_MODELS[number]['id'];

export const DEFAULT_SILICONFLOW_IMAGE_MODEL: SiliconflowImageModel = 'Qwen/Qwen-Image';

export const SILICONFLOW_QWEN_IMAGE_SIZES = [
  { id: '1328x1328', label: '1:1 方图' },
  { id: '1664x928', label: '16:9 横图' },
  { id: '928x1664', label: '9:16 竖图' },
  { id: '1472x1140', label: '4:3 横图' },
  { id: '1140x1472', label: '3:4 竖图' },
  { id: '1584x1056', label: '3:2 横图' },
  { id: '1056x1584', label: '2:3 竖图' },
] as const;

export const DEFAULT_SILICONFLOW_IMAGE_SIZE = '1328x1328';
export const DEFAULT_SILICONFLOW_IMAGE_STEPS = 20;

export const LOCAL_SD_DEFAULT_BASE_URL = 'http://127.0.0.1:7860';
export const LOCAL_SD_DEFAULT_BACKEND = 'auto' as const;
export const LOCAL_SD_DEFAULT_SAMPLER = 'DPM++ 2M Karras';
export const COMFYUI_DEFAULT_SAMPLER = 'dpmpp_2m';
export const COMFYUI_DEFAULT_SCHEDULER = 'karras';
export const LOCAL_SD_DEFAULT_STEPS = 28;
export const LOCAL_SD_DEFAULT_CFG_SCALE = 7;
export const LOCAL_SD_DEFAULT_WIDTH = 512;
export const LOCAL_SD_DEFAULT_HEIGHT = 768;
export const LOCAL_SD_SAMPLERS = [
  'DPM++ 2M Karras',
  'DPM++ SDE Karras',
  'DPM++ 2M SDE Karras',
  'DPM++ 2S a Karras',
  'DPM++ 3M SDE Karras',
  'DPM++ 2M',
  'DPM++ SDE',
  'DPM++ 2M SDE',
  'DPM++ 2S a',
  'Euler a',
  'Euler',
  'Heun',
  'LMS',
  'LMS Karras',
  'DPM2',
  'DPM2 a',
  'DPM2 Karras',
  'DPM2 a Karras',
  'DPM fast',
  'DPM adaptive',
  'DDIM',
  'DDIM CFG++',
  'PLMS',
  'UniPC',
  'LCM',
  'Restart',
] as const;

export const isSiliconflowImageModel = (value: unknown): value is SiliconflowImageModel => (
  SILICONFLOW_IMAGE_MODELS.some((model) => model.id === value)
);

export const isSiliconflowImageEditModel = (value: unknown): boolean => (
  SILICONFLOW_IMAGE_MODELS.some((model) => model.id === value && model.mode === 'edit')
);

export const normalizeSiliconflowImageSize = (value: unknown): string => (
  SILICONFLOW_QWEN_IMAGE_SIZES.some((size) => size.id === value)
    ? String(value)
    : DEFAULT_SILICONFLOW_IMAGE_SIZE
);

export const normalizeSiliconflowImageSteps = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(100, Math.round(parsed)))
    : DEFAULT_SILICONFLOW_IMAGE_STEPS;
};

export const normalizeSiliconflowImageSeed = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(9_999_999_999, Math.floor(parsed)))
    : undefined;
};

export const normalizeSiliconflowNegativePrompt = (value: unknown): string => (
  typeof value === 'string' ? value.trim().slice(0, 2_000) : ''
);

export const normalizeLocalSdSteps = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(150, Math.round(parsed)))
    : LOCAL_SD_DEFAULT_STEPS;
};

export const normalizeLocalSdCfgScale = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(30, Math.round(parsed * 10) / 10))
    : LOCAL_SD_DEFAULT_CFG_SCALE;
};

export const normalizeLocalSdDimension = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(256, Math.min(2048, Math.round(parsed / 8) * 8));
};

export const normalizeLocalSdSampler = (value: unknown): string => (
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 100)
    : LOCAL_SD_DEFAULT_SAMPLER
);

export const normalizeLocalSdBackend = (value: unknown): 'auto' | 'a1111' | 'comfyui' => (
  value === 'a1111' || value === 'comfyui' ? value : LOCAL_SD_DEFAULT_BACKEND
);

export const normalizeLocalSdScheduler = (value: unknown): string => (
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 100)
    : COMFYUI_DEFAULT_SCHEDULER
);
