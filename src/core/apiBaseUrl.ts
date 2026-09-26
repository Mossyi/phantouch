export const parseApiBaseUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/\/+$/, '');
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    const isLocalHttp = url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
    if ((url.protocol !== 'https:' && !isLocalHttp) || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
};

const isPrivateIpv4Host = (hostname: string): boolean => {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
};

export const isPrivateNetworkHost = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const hostname = value.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '::1') return true;
  if (isPrivateIpv4Host(hostname)) return true;
  if (/^(?:fc|fd)[0-9a-f]{2}:/.test(hostname) || /^fe[89ab][0-9a-f]:/.test(hostname)) return true;
  return hostname.endsWith('.local') || hostname.endsWith('.lan') || !hostname.includes('.');
};

// Local model servers commonly use plain HTTP on a private LAN. Keep that
// exception separate so cloud API credentials can never be sent to HTTP hosts.
export const parseLocalNetworkApiBaseUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/\/+$/, '');
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)
      || !isPrivateNetworkHost(url.hostname)
      || url.username
      || url.password
      || url.search
      || url.hash) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
};

export const isSiliconFlowApiBaseUrl = (value: unknown): boolean => {
  const parsed = parseApiBaseUrl(value);
  if (!parsed) return false;
  return new URL(parsed).hostname.toLowerCase() === 'api.siliconflow.cn';
};

export const isVolcengineArkApiBaseUrl = (value: unknown): boolean => {
  const parsed = parseApiBaseUrl(value);
  return Boolean(parsed && new URL(parsed).hostname.toLowerCase() === 'ark.cn-beijing.volces.com');
};

export const VOLCENGINE_ARK_PLAN_BASE_URL = 'https://ark.cn-beijing.volces.com/api/plan/v3';
export const VOLCENGINE_ARK_LEGACY_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

export const isVolcengineArkPlanApiBaseUrl = (value: unknown): boolean => {
  const parsed = parseApiBaseUrl(value);
  if (!parsed) return false;
  const url = new URL(parsed);
  return url.hostname.toLowerCase() === 'ark.cn-beijing.volces.com'
    && (url.pathname === '/api/plan/v3' || url.pathname.startsWith('/api/plan/v3/'));
};

export const isVolcengineArkLegacyApiBaseUrl = (value: unknown): boolean => {
  const parsed = parseApiBaseUrl(value);
  if (!parsed) return false;
  const url = new URL(parsed);
  return url.hostname.toLowerCase() === 'ark.cn-beijing.volces.com'
    && (url.pathname === '/api/v3' || url.pathname.startsWith('/api/v3/'));
};

export const isLocalApiBaseUrl = (value: unknown): boolean => {
  const parsed = parseApiBaseUrl(value);
  if (!parsed) return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(parsed).hostname.toLowerCase());
};
