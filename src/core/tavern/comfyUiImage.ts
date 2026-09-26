import { parseLocalNetworkApiBaseUrl } from '../apiBaseUrl';
import { fetchTextWithTimeout, getBrowserCompatibleRequestUrl } from '../httpClient';
import {
  COMFYUI_DEFAULT_SAMPLER,
  COMFYUI_DEFAULT_SCHEDULER,
  LOCAL_SD_DEFAULT_CFG_SCALE,
  LOCAL_SD_DEFAULT_HEIGHT,
  LOCAL_SD_DEFAULT_STEPS,
  LOCAL_SD_DEFAULT_WIDTH,
  normalizeLocalSdCfgScale,
  normalizeLocalSdDimension,
  normalizeLocalSdSampler,
  normalizeLocalSdScheduler,
  normalizeLocalSdSteps,
  normalizeSiliconflowImageSeed,
  normalizeSiliconflowNegativePrompt,
} from './tavernImageModels';

export interface ComfyUiResourceCatalog {
  models: string[];
  samplers: string[];
  schedulers: string[];
}

export interface ComfyUiGenerationOptions {
  baseUrl: string;
  model: string;
  prompt: string;
  negativePrompt?: string;
  sampler?: string;
  scheduler?: string;
  steps?: number;
  cfgScale?: number;
  width?: number;
  height?: number;
  seed?: number;
  signal?: AbortSignal;
}

const cleanOptionList = (value: unknown, maxItems: number, maxLength: number): string[] => {
  const options = Array.isArray(value) && Array.isArray(value[0]) ? value[0] : [];
  return [...new Set(options.slice(0, maxItems).map((item) => (
    typeof item === 'string' ? item.trim().slice(0, maxLength) : ''
  )).filter(Boolean))];
};

const readRequiredInput = (value: unknown, nodeName: string, inputName: string): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const node = (value as Record<string, any>)[nodeName];
  return node?.input?.required?.[inputName];
};

export const parseComfyUiObjectInfo = (value: unknown): ComfyUiResourceCatalog | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const requiredNodes = ['CheckpointLoaderSimple', 'KSampler', 'CLIPTextEncode', 'EmptyLatentImage', 'VAEDecode', 'SaveImage'];
  if (!requiredNodes.every((name) => Boolean((value as Record<string, unknown>)[name]))) return null;
  const models = cleanOptionList(readRequiredInput(value, 'CheckpointLoaderSimple', 'ckpt_name'), 1000, 200);
  const samplers = cleanOptionList(readRequiredInput(value, 'KSampler', 'sampler_name'), 500, 100);
  const schedulers = cleanOptionList(readRequiredInput(value, 'KSampler', 'scheduler'), 200, 100);
  return models.length > 0 && samplers.length > 0 && schedulers.length > 0
    ? { models, samplers, schedulers }
    : null;
};

export const resolveComfyUiEndpoint = (value: unknown, resource: string): string | null => {
  const parsed = parseLocalNetworkApiBaseUrl(value);
  if (!parsed || !/^[a-z0-9_./-]+$/i.test(resource) || resource.includes('..')) return null;
  const url = new URL(parsed);
  let rootPath = url.pathname.replace(/\/+$/, '');
  rootPath = rootPath.replace(/\/sdapi\/v1(?:\/.*)?$/i, '');
  rootPath = rootPath.replace(/\/(?:system_stats|object_info|prompt|history|view)(?:\/.*)?$/i, '');
  url.pathname = `${rootPath === '/' ? '' : rootPath}/${resource.replace(/^\/+/, '')}`;
  return url.toString();
};

const readComfyJson = async (
  endpoint: string,
  init: RequestInit,
  timeoutMs: number,
  maxBytes: number,
): Promise<unknown> => {
  const { response, text } = await fetchTextWithTimeout(endpoint, init, {
    timeoutMs,
    maxBytes,
    timeoutMessage: 'ComfyUI 请求超时',
  });
  if (!response.ok) throw new Error(`ComfyUI 请求失败（${response.status}）`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('ComfyUI 返回了无效 JSON');
  }
};

export const fetchComfyUiResourceCatalog = async (
  baseUrl: unknown,
  signal?: AbortSignal,
): Promise<ComfyUiResourceCatalog> => {
  const endpoint = resolveComfyUiEndpoint(baseUrl, 'object_info');
  if (!endpoint) throw new Error('ComfyUI 地址无效');
  const payload = await readComfyJson(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  }, 20_000, 20_000_000);
  const catalog = parseComfyUiObjectInfo(payload);
  if (!catalog) throw new Error('ComfyUI 缺少标准文生图节点或没有可用 Checkpoint');
  return catalog;
};

export const buildComfyUiTxt2ImgWorkflow = (options: ComfyUiGenerationOptions): Record<string, unknown> => {
  const model = typeof options.model === 'string' ? options.model.trim().slice(0, 200) : '';
  if (!model) throw new Error('请先读取并选择 ComfyUI Checkpoint');
  const prompt = typeof options.prompt === 'string' ? options.prompt.trim().slice(0, 6000) : '';
  if (!prompt) throw new Error('当前回复没有可用于生图的内容');
  const normalizedSeed = normalizeSiliconflowImageSeed(options.seed);
  const seed = normalizedSeed ?? Math.floor(Math.random() * 9_999_999_999);
  const sampler = normalizeLocalSdSampler(options.sampler || COMFYUI_DEFAULT_SAMPLER);
  const scheduler = normalizeLocalSdScheduler(options.scheduler || COMFYUI_DEFAULT_SCHEDULER);
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: normalizeSiliconflowNegativePrompt(options.negativePrompt), clip: ['1', 1] } },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: normalizeLocalSdDimension(options.width, LOCAL_SD_DEFAULT_WIDTH),
        height: normalizeLocalSdDimension(options.height, LOCAL_SD_DEFAULT_HEIGHT),
        batch_size: 1,
      },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        seed,
        steps: normalizeLocalSdSteps(options.steps ?? LOCAL_SD_DEFAULT_STEPS),
        cfg: normalizeLocalSdCfgScale(options.cfgScale ?? LOCAL_SD_DEFAULT_CFG_SCALE),
        sampler_name: sampler,
        scheduler,
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
        denoise: 1,
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'yiciyuan_tavern' } },
  };
};

export interface ComfyUiOutputImage {
  filename: string;
  subfolder: string;
  type: string;
}

export const parseComfyUiHistory = (
  value: unknown,
  promptId: string,
): { completed: boolean; image?: ComfyUiOutputImage; error?: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { completed: false };
  const record = (value as Record<string, any>)[promptId];
  if (!record || typeof record !== 'object') return { completed: false };
  for (const output of Object.values(record.outputs || {}) as any[]) {
    const image = Array.isArray(output?.images) ? output.images[0] : undefined;
    if (image && typeof image.filename === 'string') {
      return {
        completed: true,
        image: {
          filename: image.filename.slice(0, 500),
          subfolder: typeof image.subfolder === 'string' ? image.subfolder.slice(0, 500) : '',
          type: typeof image.type === 'string' ? image.type.slice(0, 40) : 'output',
        },
      };
    }
  }
  const status = record.status;
  const failed = status?.status_str === 'error' || status?.completed === true;
  return failed
    ? { completed: true, error: status?.status_str === 'error' ? 'ComfyUI 工作流执行失败，请检查模型与节点兼容性' : 'ComfyUI 已完成但没有输出图片' }
    : { completed: false };
};

const waitForPoll = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    return;
  }
  const finish = () => {
    signal?.removeEventListener('abort', abort);
    resolve();
  };
  const abort = () => {
    globalThis.clearTimeout(timer);
    reject(signal?.reason || new DOMException('Aborted', 'AbortError'));
  };
  const timer = globalThis.setTimeout(finish, ms);
  signal?.addEventListener('abort', abort, { once: true });
});

const fetchComfyUiImage = async (
  baseUrl: string,
  image: ComfyUiOutputImage,
  signal?: AbortSignal,
): Promise<string> => {
  const endpoint = resolveComfyUiEndpoint(baseUrl, 'view');
  if (!endpoint) throw new Error('ComfyUI 图片地址无效');
  const url = new URL(endpoint);
  url.searchParams.set('filename', image.filename);
  url.searchParams.set('subfolder', image.subfolder);
  url.searchParams.set('type', image.type);
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = globalThis.setTimeout(() => controller.abort(), 30_000);
  try {
    const requestUrl = getBrowserCompatibleRequestUrl(
      url.toString(),
      typeof window === 'undefined' ? undefined : window.location?.origin,
    );
    const response = await fetch(requestUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`读取 ComfyUI 图片失败（${response.status}）`);
    const contentType = (response.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) throw new Error('ComfyUI 返回的不是有效图片');
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > 13_000_000) throw new Error('ComfyUI 图片超过 13 MB');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 13_000_000) throw new Error('ComfyUI 图片大小无效');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
  }
};

export const generateComfyUiImage = async (options: ComfyUiGenerationOptions): Promise<string> => {
  const promptEndpoint = resolveComfyUiEndpoint(options.baseUrl, 'prompt');
  if (!promptEndpoint) throw new Error('ComfyUI 地址无效');
  const workflow = buildComfyUiTxt2ImgWorkflow(options);
  const queued = await readComfyJson(promptEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      prompt: workflow,
      client_id: typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `yiciyuan_${Date.now()}`,
    }),
    signal: options.signal,
  }, 30_000, 1_000_000) as Record<string, unknown>;
  const promptId = typeof queued?.prompt_id === 'string' ? queued.prompt_id.slice(0, 200) : '';
  if (!promptId) {
    const detail = queued?.node_errors ? JSON.stringify(queued.node_errors).slice(0, 500) : '';
    throw new Error(`ComfyUI 未接受工作流${detail ? `：${detail}` : ''}`);
  }
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
    const historyEndpoint = resolveComfyUiEndpoint(options.baseUrl, `history/${encodeURIComponent(promptId)}`)!;
    const history = await readComfyJson(historyEndpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    }, 15_000, 5_000_000);
    const result = parseComfyUiHistory(history, promptId);
    if (result.error) throw new Error(result.error);
    if (result.image) return fetchComfyUiImage(options.baseUrl, result.image, options.signal);
    await waitForPoll(800, options.signal);
  }
  throw new Error('ComfyUI 生图超过 180 秒，请稍后重试');
};
