import { classifyRequestFailure, recordDiagnosticEvent } from './ui/diagnosticEvents.ts';

export interface FetchTextOptions {
  timeoutMs?: number;
  maxBytes?: number;
  timeoutMessage?: string;
}

const ARK_AGENT_PLAN_ORIGIN = 'https://ark.cn-beijing.volces.com';
const ARK_AGENT_PLAN_PATH = '/api/plan/v3/';
const ARK_AGENT_PLAN_PROXY_PATH = '/__ycy_ark_agent_plan_proxy';
const VOLCENGINE_TTS_ORIGIN = 'https://openspeech.bytedance.com';
const VOLCENGINE_TTS_PATHS = ['/api/v3/plan/tts/', '/api/v3/tts/'];
const VOLCENGINE_TTS_PROXY_PATH = '/__ycy_volc_tts_proxy';
const COMFYUI_DEV_ORIGINS = ['http://127.0.0.1:8188', 'http://localhost:8188'];
const COMFYUI_PROXY_PATH = '/__ycy_comfyui_proxy';

const getRequestUrl = (input: RequestInfo | URL): string | null => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input instanceof Request ? input.url : null;
};

export const getBrowserCompatibleRequestUrl = (input: RequestInfo | URL, appOrigin?: string): RequestInfo | URL => {
  const requestUrl = getRequestUrl(input);
  if (!requestUrl || !appOrigin) return input;
  try {
    const target = new URL(requestUrl);
    const app = new URL(appOrigin);
    const isLocalVite = ['localhost', '127.0.0.1'].includes(app.hostname) && app.port === '3000';
    if (!isLocalVite) return input;
    if (target.origin === ARK_AGENT_PLAN_ORIGIN && target.pathname.startsWith(ARK_AGENT_PLAN_PATH)) {
      return `${app.origin}${ARK_AGENT_PLAN_PROXY_PATH}${target.pathname}${target.search}`;
    }
    if (target.origin === VOLCENGINE_TTS_ORIGIN && VOLCENGINE_TTS_PATHS.some((path) => target.pathname.startsWith(path))) {
      return `${app.origin}${VOLCENGINE_TTS_PROXY_PATH}${target.pathname}${target.search}`;
    }
    if (COMFYUI_DEV_ORIGINS.includes(target.origin)) {
      return `${app.origin}${COMFYUI_PROXY_PATH}${target.pathname}${target.search}`;
    }
    return input;
  } catch {
    return input;
  }
};

const getBrowserAppOrigin = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  return window.location?.origin;
};

const describeNetworkFailure = (input: RequestInfo | URL, error: unknown): Error | null => {
  const message = error instanceof Error ? error.message : '';
  if (!/failed to fetch|networkerror|load failed/i.test(message)) return null;
  const url = getRequestUrl(input);
  const isArkAgentPlan = typeof url === 'string' && url.startsWith(`${ARK_AGENT_PLAN_ORIGIN}${ARK_AGENT_PLAN_PATH}`);
  const isVolcengineTts = typeof url === 'string'
    && VOLCENGINE_TTS_PATHS.some((path) => url.startsWith(`${VOLCENGINE_TTS_ORIGIN}${path}`));
  const isLocalComfyUi = typeof url === 'string' && COMFYUI_DEV_ORIGINS.some((origin) => url.startsWith(`${origin}/`));
  return new Error(isArkAgentPlan
    ? '火山方舟 Agent Plan 网络请求未建立。请在本地调试时重启开发服务以启用兼容代理；APK 会使用 Capacitor 原生 HTTP。'
    : isVolcengineTts
      ? '火山豆包 TTS 网络请求未建立。请在本地调试时重启开发服务以启用语音兼容代理；APK 会使用 Capacitor 原生 HTTP。'
    : isLocalComfyUi
      ? 'ComfyUI 网络请求未建立。请确认 8188 端口服务正在运行，并重启本地开发服务以启用调试代理。'
    : '模型服务网络请求未建立。请检查 API 地址、网络连接、TLS 证书，以及服务端是否允许浏览器跨域请求。');
};

const readResponseTextWithLimit = async (response: Response, maxBytes: number): Promise<string> => {
  const limitLabel = maxBytes >= 1_000_000
    ? `${Math.round(maxBytes / 1_000_000)} MB`
    : `${Math.round(maxBytes / 1000)} KB`;
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`响应超过 ${limitLabel} 安全限制`);
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error(`响应超过 ${limitLabel} 安全限制`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`响应超过 ${limitLabel} 安全限制`);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    reader.releaseLock();
  }
};

export const fetchTextWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchTextOptions = {},
): Promise<{ response: Response; text: string }> => {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.min(300_000, Math.round(options.timeoutMs!)))
    : 30_000;
  const maxBytes = Number.isFinite(options.maxBytes)
    ? Math.max(1_000, Math.min(20_000_000, Math.round(options.maxBytes!)))
    : 5_000_000;
  const externalSignal = init.signal || undefined;
  const requestInput = getBrowserCompatibleRequestUrl(input, getBrowserAppOrigin());
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  let timedOut = false;
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', relayAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(requestInput, { ...init, signal: controller.signal });
    const text = await readResponseTextWithLimit(response, maxBytes);
    if (!response.ok) recordDiagnosticEvent('text', 'http-error', response.status);
    return { response, text };
  } catch (error) {
    recordDiagnosticEvent('text', externalSignal?.aborted ? 'cancelled' : timedOut ? 'timeout' : classifyRequestFailure(error));
    if (controller.signal.aborted) {
      if (externalSignal?.aborted) throw new DOMException('请求已取消', 'AbortError');
      if (timedOut) throw new Error(options.timeoutMessage || `请求超过 ${Math.ceil(timeoutMs / 1000)} 秒`);
    }
    throw describeNetworkFailure(input, error) || error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', relayAbort);
    controller.abort();
  }
};

export const fetchTextStreamWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  onChunk: (chunk: string) => void,
  options: FetchTextOptions = {},
): Promise<{ response: Response; text: string }> => {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.min(300_000, Math.round(options.timeoutMs!)))
    : 30_000;
  const maxBytes = Number.isFinite(options.maxBytes)
    ? Math.max(1_000, Math.min(20_000_000, Math.round(options.maxBytes!)))
    : 5_000_000;
  const externalSignal = init.signal || undefined;
  const requestInput = getBrowserCompatibleRequestUrl(input, getBrowserAppOrigin());
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  let timedOut = false;
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', relayAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(requestInput, { ...init, signal: controller.signal });
    if (!response.ok) {
      recordDiagnosticEvent('stream', 'http-error', response.status);
      const text = await readResponseTextWithLimit(response, maxBytes);
      return { response, text };
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(`响应超过 ${Math.round(maxBytes / 1000)} KB 安全限制`);
    }
    if (!response.body) {
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`响应超过 ${Math.round(maxBytes / 1000)} KB 安全限制`);
      onChunk(text);
      return { response, text };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error(`响应超过 ${Math.round(maxBytes / 1000)} KB 安全限制`);
        }
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) onChunk(chunk);
        chunks.push(chunk);
      }
      const trailing = decoder.decode();
      if (trailing) onChunk(trailing);
      chunks.push(trailing);
      return { response, text: chunks.join('') };
    } catch (error) {
      reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    recordDiagnosticEvent('stream', externalSignal?.aborted ? 'cancelled' : timedOut ? 'timeout' : classifyRequestFailure(error));
    if (controller.signal.aborted) {
      if (externalSignal?.aborted) throw new DOMException('请求已取消', 'AbortError');
      if (timedOut) throw new Error(options.timeoutMessage || `请求超过 ${Math.ceil(timeoutMs / 1000)} 秒`);
    }
    throw describeNetworkFailure(input, error) || error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', relayAbort);
    controller.abort();
  }
};
