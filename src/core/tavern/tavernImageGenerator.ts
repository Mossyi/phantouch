import { isLocalApiBaseUrl, isSiliconFlowApiBaseUrl, isVolcengineArkApiBaseUrl, parseApiBaseUrl, parseLocalNetworkApiBaseUrl } from '../apiBaseUrl';
import { fetchTextWithTimeout } from '../httpClient';
import {
  LOCAL_SD_DEFAULT_BACKEND,
  isSiliconflowImageEditModel,
  LOCAL_SD_DEFAULT_CFG_SCALE,
  LOCAL_SD_DEFAULT_HEIGHT,
  LOCAL_SD_DEFAULT_WIDTH,
  normalizeLocalSdCfgScale,
  normalizeLocalSdBackend,
  normalizeLocalSdDimension,
  normalizeLocalSdSampler,
  normalizeLocalSdSteps,
  normalizeSiliconflowImageSeed,
  normalizeSiliconflowImageSize,
  normalizeSiliconflowImageSteps,
  normalizeSiliconflowNegativePrompt,
} from './tavernImageModels';
import { fetchComfyUiResourceCatalog, generateComfyUiImage } from './comfyUiImage';

const ARK_AGENT_PLAN_ORIGIN = 'https://ark.cn-beijing.volces.com';
const ARK_AGENT_PLAN_PATH = '/api/plan/v3';

export interface TavernImageGenerationOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  provider?: 'volcengine_plan' | 'local_sd';
  sourceImage?: string;
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
  signal?: AbortSignal;
}

const safeGeneratedImageUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const image = value.trim();
  if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\r\n]+$/i.test(image)) {
    return image.length <= 18_000_000 ? image : null;
  }
  try {
    const url = new URL(image);
    return url.protocol === 'https:' && image.length <= 4096 ? image : null;
  } catch {
    return null;
  }
};

export const parseTavernImageGenerationResponse = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, any>;
  const directUrl = payload.images?.[0]?.url ?? payload.data?.[0]?.url;
  const safeUrl = safeGeneratedImageUrl(directUrl);
  if (safeUrl) return safeUrl;
  const rawCandidate = payload.data?.[0]?.b64_json
    ?? payload.images?.[0]?.b64_json
    ?? payload.b64_json
    ?? (typeof payload.images?.[0] === 'string' ? payload.images[0] : undefined);
  if (typeof rawCandidate !== 'string') return null;
  const trimmed = rawCandidate.trim();
  if (trimmed.startsWith('data:image/')) {
    return safeGeneratedImageUrl(trimmed);
  }
  const cleanBase64 = trimmed.replace(/\s+/g, '');
  let mime = 'image/png';
  if (cleanBase64.startsWith('/9j/')) mime = 'image/jpeg';
  else if (cleanBase64.startsWith('UklGR')) mime = 'image/webp';
  return safeGeneratedImageUrl(`data:${mime};base64,${cleanBase64}`);
};

export const resolveLocalSdApiEndpoint = (value: unknown, resource: 'txt2img' | 'sd-models' | 'samplers'): string | null => {
  const baseUrl = parseLocalNetworkApiBaseUrl(value);
  if (!baseUrl) return null;
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');
  const apiRootMatch = path.match(/^(.*\/sdapi\/v1)(?:\/[^/]+)?$/i);
  const apiRoot = apiRootMatch?.[1] || `${path === '/' ? '' : path}/sdapi/v1`;
  url.pathname = `${apiRoot}/${resource}`;
  return url.toString();
};

export const resolveLocalSdTxt2ImgEndpoint = (value: unknown): string | null => (
  resolveLocalSdApiEndpoint(value, 'txt2img')
);

const normalizeLocalSdResourceName = (value: unknown, maxLength: number): string => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

export const parseLocalSdModelsResponse = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, 1000).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
    const model = item as Record<string, unknown>;
    return normalizeLocalSdResourceName(model.title, 200)
      || normalizeLocalSdResourceName(model.model_name, 200);
  }).filter(Boolean))];
};

export const parseLocalSdSamplersResponse = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, 500).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
    return normalizeLocalSdResourceName((item as Record<string, unknown>).name, 100);
  }).filter(Boolean))];
};

export interface LocalSdResourceCatalog {
  backend: 'a1111' | 'comfyui';
  models: string[];
  samplers: string[];
  schedulers: string[];
  modelsUnavailable: boolean;
  samplersUnavailable: boolean;
}

const fetchLocalSdResource = async (endpoint: string, signal?: AbortSignal): Promise<unknown> => {
  const { response, text } = await fetchTextWithTimeout(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  }, {
    timeoutMs: 15_000,
    maxBytes: 2_000_000,
    timeoutMessage: '读取本地 SD WebUI 配置超时',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('WebUI 返回了无效 JSON');
  }
};

export const fetchLocalSdResourceCatalog = async (
  value: unknown,
  signal?: AbortSignal,
  preferredBackend: 'auto' | 'a1111' | 'comfyui' = LOCAL_SD_DEFAULT_BACKEND,
): Promise<LocalSdResourceCatalog> => {
  const backend = normalizeLocalSdBackend(preferredBackend);
  const modelsEndpoint = resolveLocalSdApiEndpoint(value, 'sd-models');
  const samplersEndpoint = resolveLocalSdApiEndpoint(value, 'samplers');
  if (!modelsEndpoint || !samplersEndpoint) {
    throw new Error('本地 SD 地址无效，请填写 localhost 或电脑的局域网地址');
  }
  let comfyError: unknown;
  if (backend !== 'a1111') {
    try {
      const comfy = await fetchComfyUiResourceCatalog(value, signal);
      return {
        backend: 'comfyui',
        ...comfy,
        modelsUnavailable: false,
        samplersUnavailable: false,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      if (backend === 'comfyui') throw error;
      comfyError = error;
    }
  }
  const [modelsResult, samplersResult] = await Promise.allSettled([
    fetchLocalSdResource(modelsEndpoint, signal),
    fetchLocalSdResource(samplersEndpoint, signal),
  ]);
  if (modelsResult.status === 'rejected' && samplersResult.status === 'rejected') {
    const comfyDetail = comfyError instanceof Error ? `；ComfyUI：${comfyError.message}` : '';
    throw new Error(`无法识别本地生图服务，请检查地址、API 与 CORS${comfyDetail}`);
  }
  return {
    backend: 'a1111',
    models: modelsResult.status === 'fulfilled' ? parseLocalSdModelsResponse(modelsResult.value) : [],
    samplers: samplersResult.status === 'fulfilled' ? parseLocalSdSamplersResponse(samplersResult.value) : [],
    schedulers: [],
    modelsUnavailable: modelsResult.status === 'rejected',
    samplersUnavailable: samplersResult.status === 'rejected',
  };
};

export const buildLocalSdTxt2ImgRequest = (options: TavernImageGenerationOptions): Record<string, unknown> => {
  const model = typeof options.model === 'string' ? options.model.trim().slice(0, 200) : '';
  const seed = normalizeSiliconflowImageSeed(options.seed);
  return {
    prompt: typeof options.prompt === 'string' ? options.prompt.trim().slice(0, 6000) : '',
    negative_prompt: normalizeSiliconflowNegativePrompt(options.negativePrompt),
    sampler_name: normalizeLocalSdSampler(options.sdSampler),
    steps: normalizeLocalSdSteps(options.numInferenceSteps),
    cfg_scale: normalizeLocalSdCfgScale(options.sdCfgScale),
    width: normalizeLocalSdDimension(options.sdWidth, LOCAL_SD_DEFAULT_WIDTH),
    height: normalizeLocalSdDimension(options.sdHeight, LOCAL_SD_DEFAULT_HEIGHT),
    seed: seed ?? -1,
    batch_size: 1,
    n_iter: 1,
    ...(model ? {
      override_settings: { sd_model_checkpoint: model },
      override_settings_restore_afterwards: true,
    } : {}),
  };
};

export const parseLocalSdImageResponse = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const firstImage = (value as { images?: unknown[] }).images?.[0];
  if (typeof firstImage !== 'string') return null;
  const normalized = firstImage.trim();
  return safeGeneratedImageUrl(normalized.startsWith('data:image/')
    ? normalized
    : `data:image/png;base64,${normalized.replace(/\s+/g, '')}`);
};

export const isTavernImageGenerationUnsupportedBaseUrl = (value: unknown): boolean => {
  const baseUrl = parseApiBaseUrl(value);
  if (!baseUrl) return false;
  const url = new URL(baseUrl);
  return url.origin === ARK_AGENT_PLAN_ORIGIN
    && (url.pathname === ARK_AGENT_PLAN_PATH || url.pathname.startsWith(`${ARK_AGENT_PLAN_PATH}/`));
};

export const resolveTavernImageApiKey = (
  provider: 'system' | 'siliconflow' | 'volcengine_plan' | 'local_sd' | 'custom',
  imageApiKey: unknown,
  llmBaseUrl: unknown,
  llmApiKey: unknown,
): string => {
  if (provider === 'local_sd') return '';
  if (provider === 'custom' || provider === 'siliconflow') return typeof imageApiKey === 'string' ? imageApiKey.trim().slice(0, 1000) : '';
  if (provider === 'volcengine_plan' && !isVolcengineArkApiBaseUrl(llmBaseUrl)) {
    throw new Error('火山 Plan 生图需要复用火山方舟 Key。请先在【系统设置】选择火山方舟或火山方舟 Plan 并保存 API Key，或改用【专用生图 API】。');
  }
  return typeof llmApiKey === 'string' ? llmApiKey.trim().slice(0, 1000) : '';
};

export const generateTavernAiImage = async (options: TavernImageGenerationOptions): Promise<string> => {
  const localSd = options.provider === 'local_sd';
  const baseUrl = localSd
    ? parseLocalNetworkApiBaseUrl(options.baseUrl)
    : parseApiBaseUrl(options.baseUrl);
  if (!baseUrl) throw new Error('AI 生图 API 地址无效');
  if (isTavernImageGenerationUnsupportedBaseUrl(baseUrl) && options.provider !== 'volcengine_plan') {
    throw new Error('火山方舟 Plan 仅支持对话，不能用于 AI 生图。请在酒馆【官网/迁移】的“AI 生图通道”选择“专用生图 API”，并配置支持 /images/generations 的图片模型。');
  }
  const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim().slice(0, 1000) : '';
  if (!localSd && !apiKey && !isLocalApiBaseUrl(baseUrl)) throw new Error('请先配置 AI 生图 API Key');
  const model = typeof options.model === 'string' ? options.model.trim().slice(0, 200) : '';
  if (!localSd && !model) throw new Error('请先填写 AI 生图模型 ID');
  const prompt = typeof options.prompt === 'string' ? options.prompt.trim().slice(0, 6000) : '';
  if (!prompt) throw new Error('当前回复没有可用于生图的内容');
  if (localSd) {
    const backend = normalizeLocalSdBackend(options.localSdBackend);
    let useComfyUi = backend === 'comfyui';
    if (backend === 'auto') {
      try {
        await fetchComfyUiResourceCatalog(baseUrl, options.signal);
        useComfyUi = true;
      } catch (error) {
        if (options.signal?.aborted) throw error;
      }
    }
    if (useComfyUi) {
      return generateComfyUiImage({
        baseUrl,
        model,
        prompt,
        negativePrompt: options.negativePrompt,
        sampler: options.sdSampler,
        scheduler: options.sdScheduler,
        steps: options.numInferenceSteps,
        cfgScale: options.sdCfgScale,
        width: options.sdWidth,
        height: options.sdHeight,
        seed: options.seed,
        signal: options.signal,
      });
    }
  }
  const endpoint = localSd
    ? resolveLocalSdTxt2ImgEndpoint(baseUrl)!
    : baseUrl.endsWith('/images/generations')
      ? baseUrl
      : `${baseUrl}/images/generations`;
  const siliconFlow = isSiliconFlowApiBaseUrl(baseUrl);
  const volcenginePlan = options.provider === 'volcengine_plan';
  const siliconflowEdit = siliconFlow && isSiliconflowImageEditModel(model);
  const sourceImage = safeGeneratedImageUrl(options.sourceImage);
  if (siliconflowEdit && !sourceImage) {
    throw new Error('所选 Qwen Image Edit 模型需要参考图片。请先为角色上传图片头像或添加角色图库图片，再重新生图。');
  }
  const inferenceSteps = normalizeSiliconflowImageSteps(options.numInferenceSteps);
  const seed = normalizeSiliconflowImageSeed(options.seed);
  const negativePrompt = normalizeSiliconflowNegativePrompt(options.negativePrompt);
  const siliconflowParameters = {
    num_inference_steps: inferenceSteps,
    ...(seed !== undefined ? { seed } : {}),
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
  };
  const body = localSd
    ? buildLocalSdTxt2ImgRequest(options)
    : siliconflowEdit
    ? {
        model,
        prompt,
        image: sourceImage,
        ...siliconflowParameters,
      }
    : siliconFlow && model === 'Qwen/Qwen-Image'
      ? {
          model,
          prompt,
          image_size: normalizeSiliconflowImageSize(options.imageSize),
          ...siliconflowParameters,
        }
      : siliconFlow
      ? {
        model,
        prompt,
        image_size: '1024x1024',
        batch_size: 1,
        ...siliconflowParameters,
        guidance_scale: 7.5,
      }
    : volcenginePlan
      ? {
        model,
        prompt,
        size: '2K',
        response_format: 'b64_json',
        output_format: 'png',
        watermark: false,
        sequential_image_generation: 'disabled',
      }
      : {
        model,
        prompt,
        size: '1024x1024',
        n: 1,
        response_format: 'b64_json',
      };
  const { response, text } = await fetchTextWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: options.signal,
  }, {
    timeoutMs: 180_000,
    maxBytes: 20_000_000,
    timeoutMessage: 'AI 生图超过 180 秒，请稍后重试',
  });
  if (!response.ok) {
    let detail = '';
    try {
      const payload = JSON.parse(text);
      detail = String(payload?.error?.message || payload?.message || '').slice(0, 400);
    } catch {
      detail = text.replace(/\s+/g, ' ').slice(0, 240);
    }
    throw new Error(`${localSd ? '本地 SD 生图' : 'AI 生图'}失败（${response.status}）${detail ? `：${detail}` : ''}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${localSd ? '本地 SD' : 'AI 生图服务'}返回了无效 JSON`);
  }
  const imageUrl = localSd
    ? parseLocalSdImageResponse(payload)
    : parseTavernImageGenerationResponse(payload);
  if (!imageUrl) throw new Error(`${localSd ? '本地 SD' : 'AI 生图服务'}没有返回有效图片`);
  return imageUrl;
};
