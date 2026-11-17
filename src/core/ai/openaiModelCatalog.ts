import { isPrivateNetworkHost, isVolcengineArkPlanApiBaseUrl, parseCustomModelApiBaseUrl } from '../apiBaseUrl';
import { hasSameApiCredentialScope } from '../llmConfig';
import { fetchTextWithTimeout } from '../httpClient';

export const MODEL_CATALOG_LIMITATION = '目录只列出接口返回的模型 ID，不代表每个模型都能对话，也不代表账号还有额度。';
const MAX_MODELS = 300;
const MAX_ID_LENGTH = 200;

export type ModelCatalogCode =
  | 'invalid-url'
  | 'plan-unsupported'
  | 'missing-key'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'timeout'
  | 'cancelled'
  | 'network'
  | 'not-json'
  | 'bad-schema'
  | 'empty'
  | 'http';

export interface ModelCatalogSuccess {
  ok: true;
  models: string[];
  requestUrl: string;
  notice: string;
}

export interface ModelCatalogFailure {
  ok: false;
  code: ModelCatalogCode;
  message: string;
  requestUrl?: string;
}

export type ModelCatalogResult = ModelCatalogSuccess | ModelCatalogFailure;

const scrubSecret = (message: string, secret: string): string => {
  const token = secret.trim();
  if (!token || token.length < 4) return message;
  return message.split(token).join('***');
};

/** 只在用户写下的这一个服务上拼 /models，不改主机，也不追加别的域名。 */
export const resolveOpenAIModelsUrl = (value: unknown): { url: string } | ModelCatalogFailure => {
  const parsed = parseCustomModelApiBaseUrl(value);
  if (!parsed) {
    return {
      ok: false,
      code: 'invalid-url',
      message: 'API 地址无效。需要 HTTPS；只有本机 localhost 可以用 HTTP。地址里不能带账号、查询参数或锚点。',
    };
  }
  if (isVolcengineArkPlanApiBaseUrl(parsed)) {
    return {
      ok: false,
      code: 'plan-unsupported',
      message: '火山方舟 Plan 没有公开的账号模型目录。请从预设列表选择，或手动填写模型 ID。不会用对话请求去试探。',
    };
  }
  const url = new URL(parsed);
  let path = url.pathname.replace(/\/+$/, '');
  path = path.replace(/\/chat\/completions$/i, '');
  path = path.replace(/\/completions$/i, '');
  path = path.replace(/\/responses$/i, '');
  path = path.replace(/\/models$/i, '');
  path = path.replace(/\/+$/, '');
  url.pathname = `${path}/models`;
  url.search = '';
  url.hash = '';
  return { url: url.toString() };
};

const readModelId = (item: unknown): string => {
  if (typeof item === 'string') return item.trim().slice(0, MAX_ID_LENGTH);
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  const record = item as Record<string, unknown>;
  const raw = record.id ?? record.name ?? record.model;
  return typeof raw === 'string' ? raw.trim().replace(/[\u0000-\u001f]/g, '').slice(0, MAX_ID_LENGTH) : '';
};

export const parseOpenAIModelCatalog = (text: string): { models: string[] } | ModelCatalogFailure => {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, code: 'not-json', message: '接口返回的不是 JSON，没法识别模型目录。已有模型 ID 保持不变。' };
  }
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : Array.isArray((payload as { models?: unknown }).models)
          ? (payload as { models: unknown[] }).models
          : null
      : null;
  if (!list) {
    return { ok: false, code: 'bad-schema', message: '返回的 JSON 里没有 data 或 models 数组。已有模型 ID 保持不变。' };
  }
  const models: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const id = readModelId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push(id);
    if (models.length >= MAX_MODELS) break;
  }
  if (models.length === 0) {
    return { ok: false, code: 'empty', message: '接口有响应，但没有可用的模型 ID。已有模型 ID 保持不变。' };
  }
  return { models };
};

export const describeModelCatalogHttpStatus = (status: number): ModelCatalogFailure => {
  if (status === 401) {
    return { ok: false, code: 'unauthorized', message: '模型目录拒绝了密钥（401）。请核对 Key 是否属于这个地址。已有模型 ID 保持不变。' };
  }
  if (status === 403) {
    return { ok: false, code: 'forbidden', message: '密钥没有读取模型目录的权限（403）。已有模型 ID 保持不变。' };
  }
  if (status === 404) {
    return { ok: false, code: 'not-found', message: '这个地址没有模型目录（404）。有些服务只开放对话、不开放 /models。请继续手动填写模型 ID。' };
  }
  return { ok: false, code: 'http', message: `模型目录请求失败（HTTP ${status}）。已有模型 ID 保持不变。` };
};

const describeThrown = (error: unknown, secret: string): ModelCatalogFailure => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { ok: false, code: 'cancelled', message: '已取消获取模型列表。已有模型 ID 保持不变。' };
  }
  const raw = error instanceof Error ? error.message : '获取模型列表失败';
  const message = scrubSecret(raw, secret);
  if (/超过 \d+ 秒|timeout/i.test(message)) {
    return { ok: false, code: 'timeout', message: '获取模型列表超时。已有模型 ID 保持不变。' };
  }
  if (/跨域|网络请求未建立|failed to fetch|network/i.test(message)) {
    return { ok: false, code: 'network', message: '浏览器没有拿到模型目录。常见原因是服务未允许网页跨域，或网络中断。已有模型 ID 保持不变。' };
  }
  return { ok: false, code: 'network', message: `${message} 已有模型 ID 保持不变。` };
};

export interface FetchModelCatalogOptions {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
  fetchText?: typeof fetchTextWithTimeout;
}

export const fetchOpenAIModelCatalog = async (options: FetchModelCatalogOptions): Promise<ModelCatalogResult> => {
  const resolved = resolveOpenAIModelsUrl(options.baseUrl);
  if (!('url' in resolved)) return resolved;
  const secret = typeof options.apiKey === 'string' ? options.apiKey.trim().slice(0, 1000) : '';
  const localHost = isPrivateNetworkHost(new URL(resolved.url).hostname);
  if (!secret && !localHost) {
    return { ok: false, code: 'missing-key', message: '请先填写这个地址对应的 API Key，再获取模型列表。', requestUrl: resolved.url };
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (secret) headers.Authorization = `Bearer ${secret}`;
  try {
    const fetchText = options.fetchText || fetchTextWithTimeout;
    const { response, text } = await fetchText(resolved.url, {
      method: 'GET',
      headers,
      signal: options.signal,
      redirect: 'error',
    }, { timeoutMs: 15_000, maxBytes: 1_000_000, timeoutMessage: '获取模型列表超过 15 秒' });
    if (!response.ok) return { ...describeModelCatalogHttpStatus(response.status), requestUrl: resolved.url };
    const parsed = parseOpenAIModelCatalog(text);
    if (!('models' in parsed)) return { ...parsed, requestUrl: resolved.url };
    return { ok: true, models: parsed.models, requestUrl: resolved.url, notice: MODEL_CATALOG_LIMITATION };
  } catch (error) {
    return { ...describeThrown(error, secret), requestUrl: resolved.url };
  }
};

/** 旧请求回来时，地址、密钥或协议已经变了就不要回填。 */
export const shouldApplyCatalogResult = (
  started: { baseUrl: string; apiKey: string },
  current: { baseUrl: string; apiKey: string },
  aborted: boolean,
): boolean => !aborted && started.baseUrl === current.baseUrl && started.apiKey === current.apiKey;

export const applyPickedModelId = (input: {
  pickedId: string;
  baseUrlInput: string;
  apiKeyInput: string;
  savedBaseUrl: string;
  savedApiKey: string;
}): { modelInput: string; saved: { apiKey: string; baseUrl: string; model: string } | null; note: string } => {
  const modelInput = input.pickedId.trim().slice(0, MAX_ID_LENGTH);
  const safeBaseUrl = parseCustomModelApiBaseUrl(input.baseUrlInput);
  if (!modelInput) return { modelInput: '', saved: null, note: '这个模型 ID 是空的，没有改配置。' };
  if (!safeBaseUrl) {
    return { modelInput, saved: null, note: '已填入模型 ID。当前地址还不能保存，已保存的配置没有改动。' };
  }
  const endpointChanged = !hasSameApiCredentialScope(safeBaseUrl, input.savedBaseUrl);
  const typedKey = input.apiKeyInput.trim().slice(0, 1000);
  const nextApiKey = endpointChanged && typedKey === input.savedApiKey.trim() ? '' : typedKey;
  return {
    modelInput,
    saved: { apiKey: nextApiKey, baseUrl: safeBaseUrl, model: modelInput },
    note: '已选用该模型 ID。',
  };
};
