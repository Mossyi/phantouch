/**
 * 幻触 (Phantouch) 自托管 OTA 更新服务
 *
 * 兼容 Capgo capacitor-updater 的自托管协议：
 *   POST /updates   —— 客户端上报 AppInfos，服务端决定是否下发新包
 *   GET  /files/:hash —— 按内容哈希读取单个资源（用于差分更新）
 *   GET  /bundles/*   —— 读取完整 zip 包（差分失败时的兜底）
 *   GET  /health      —— 健康检查
 *
 * 数据来源：R2 中的 manifest.json，形如
 * {
 *   "android": {
 *     "version": "1.1.110",
 *     "versionCode": 110,
 *     "nativeVersion": "1.1.0",
 *     "key": "bundles/xxx.zip",
 *     "checksum": "<zip sha256>",
 *     "size": 1234567,
 *     "minNativeVersionCode": 100,
 *     "changelog": ["..."],
 *     "forceUpdate": false,
 *     "disabled": false,
 *     "files": [{ "file_name": "assets/index.js", "file_hash": "<sha256>", "download_url": "/files/<sha256>" }]
 *   }
 * }
 */

export interface Env {
  BUCKET: R2Bucket;
  /** 允许访问的 appId，逗号分隔；留空表示不限制。 */
  ALLOWED_APP_IDS?: string;
}

interface AppInfos {
  platform?: string;
  device_id?: string;
  app_id?: string;
  custom_id?: string;
  version_build?: string;
  version_code?: string;
  version_name?: string;
  plugin_version?: string;
  version_os?: string;
  is_emulator?: boolean;
  is_prod?: boolean;
}

interface ManifestFile {
  file_name: string;
  file_hash: string;
  download_url?: string;
}

interface ManifestEntry {
  version: string;
  versionCode: number;
  nativeVersion?: string;
  key: string;
  checksum: string;
  size?: number;
  minNativeVersionCode?: number;
  changelog?: string[];
  forceUpdate?: boolean;
  disabled?: boolean;
  files?: ManifestFile[];
}

type Manifest = Record<string, ManifestEntry>;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });

/** Capgo 约定的“无可用更新”响应。 */
const noUpdate = (message = 'No new version available'): Response =>
  json({ error: 'no_new_version_available', message });

/** 从 version_name（形如 1.1.110）解析末尾构建号；builtin 表示从未热更过。 */
const parseVersionCode = (name?: string): number | null => {
  if (!name || name === 'builtin') return null;
  const match = name.match(/(\d+)\s*$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
};

const loadManifest = async (env: Env): Promise<Manifest> => {
  const object = await env.BUCKET.get('manifest.json');
  if (!object) return {};
  try {
    const parsed = JSON.parse(await object.text());
    return parsed && typeof parsed === 'object' ? (parsed as Manifest) : {};
  } catch {
    return {};
  }
};

const handleUpdates = async (request: Request, env: Env, url: URL): Promise<Response> => {
  if (request.method === 'GET') {
    return json({ ok: true, message: 'Phantouch OTA endpoint. POST AppInfos to check for updates.' });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: AppInfos = {};
  try {
    body = (await request.json()) as AppInfos;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (env.ALLOWED_APP_IDS) {
    const allowed = env.ALLOWED_APP_IDS.split(',').map((item) => item.trim()).filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(body.app_id || '')) {
      return json({ error: 'app_not_allowed' }, 403);
    }
  }

  const platform = (body.platform || '').toLowerCase();
  const manifest = await loadManifest(env);
  const entry = manifest[platform];
  if (!entry || entry.disabled || !entry.key || !entry.checksum) return noUpdate();

  const currentCode = parseVersionCode(body.version_name);
  const nativeCode = Number.parseInt(body.version_code || '', 10);

  // 若当前运行的是 APK 内置资源（builtin），其代码版本即为原生 APK 的 versionCode；
  // 若原生 APK 本身就已包含当前或更新的 Web 资源，则无需再下发热更新。
  const effectiveCode = currentCode !== null ? currentCode : (Number.isFinite(nativeCode) ? nativeCode : null);
  if (effectiveCode !== null && effectiveCode >= entry.versionCode) return noUpdate();

  if (entry.minNativeVersionCode && Number.isFinite(nativeCode) && nativeCode < entry.minNativeVersionCode) {
    return noUpdate('此更新需要先安装新版 APK');
  }

  const payload: Record<string, unknown> = {
    version: entry.version,
    // manifest 里的 key 形如 bundles/xxx.zip，而路由前缀也是 /bundles/，
    // 这里先剥掉存储前缀再拼 URL，避免出现 /bundles/bundles/ 这种重复路径段。
    url: new URL(`/bundles/${entry.key.replace(/^bundles\//, '')}`, url.origin).toString(),
    checksum: entry.checksum,
  };
  if (entry.size) payload.size = entry.size;
  if (entry.changelog && entry.changelog.length > 0) payload.changelog = entry.changelog;
  if (entry.forceUpdate) payload.breaking = true;
  // 差分清单：客户端会自行剔除本机（APK 内置或已缓存）已有的同哈希文件，只下载变化部分。
  if (entry.files && entry.files.length > 0) {
    payload.manifest = entry.files.map((file) => ({
      file_name: file.file_name,
      file_hash: file.file_hash,
      download_url: new URL(file.download_url || `/files/${file.file_hash}`, url.origin).toString(),
    }));
  }
  return json(payload);
};

const handleFile = async (request: Request, env: Env, url: URL): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  const hash = decodeURIComponent(url.pathname.replace(/^\/files\//, ''));
  if (!/^[a-f0-9]{64}$/i.test(hash)) return json({ error: 'bad_request' }, 400);

  const object = await env.BUCKET.get(`files/${hash}`);
  if (!object) return json({ error: 'not_found' }, 404);

  const headers = new Headers(CORS_HEADERS);
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
};

const handleBundle = async (request: Request, env: Env, url: URL): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  const fileName = decodeURIComponent(url.pathname.replace(/^\/bundles\//, ''));
  if (!fileName || fileName.includes('..') || fileName.includes('/')) {
    return json({ error: 'bad_request' }, 400);
  }

  // 路由是 /bundles/<文件名>，而对象存储键是 bundles/<文件名>，两者前缀语义不同。
  const object = await env.BUCKET.get(`bundles/${fileName}`);
  if (!object) return json({ error: 'not_found' }, 404);

  const headers = new Headers(CORS_HEADERS);
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Content-Type', 'application/zip');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
};

/**
 * App 全量更新资源：更新清单与 APK 安装包。
 *
 *   GET /app/version.json  -> R2 对象 app/version.json（短缓存，便于快速发版）
 *   GET /app/Phantouch.apk -> R2 对象 app/Phantouch.apk（长缓存，内容按版本变化）
 *
 * 这样即使代码仓库是私有的，发布物依然可以对外分发。
 */
const handleAppAsset = async (request: Request, env: Env, url: URL): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  const name = decodeURIComponent(url.pathname.replace(/^\/app\//, ''));
  if (!name || name.includes('..') || name.includes('/')) {
    return json({ error: 'bad_request' }, 400);
  }

  const object = await env.BUCKET.get(`app/${name}`);
  if (!object) return json({ error: 'not_found' }, 404);

  const headers = new Headers(CORS_HEADERS);
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  if (name.toLowerCase().endsWith('.json')) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
    // 更新清单必须短缓存，否则发版后客户端长时间看不到新版本。
    headers.set('Cache-Control', 'public, max-age=60');
  } else {
    headers.set('Content-Type', 'application/vnd.android.package-archive');
    // APK 安装包在发版时会覆盖同名文件（如 Phantouch.apk），必须允许客户端重验证，杜绝 CDN 永久缓存旧安装包
    headers.set('Cache-Control', 'public, max-age=300, must-revalidate');
  }
  return new Response(request.method === 'HEAD' ? null : object.body, { headers });
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (pathname === '/health') return json({ ok: true });
    if (pathname === '/updates') return handleUpdates(request, env, url);
    if (pathname.startsWith('/app/')) return handleAppAsset(request, env, url);
    if (pathname.startsWith('/files/')) return handleFile(request, env, url);
    if (pathname.startsWith('/bundles/')) return handleBundle(request, env, url);
    return json({ error: 'not_found' }, 404);
  },
};
