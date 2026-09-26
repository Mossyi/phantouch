import currentBuild from '../../../version.json';
import { readPreference, writePreference } from '../ui/localPreferences';
import { APP_UPDATE_MANIFEST_URL } from './updateEndpoints';

export interface RemoteVersionInfo {
  version: string;
  versionCode: number;
  builtAt?: string;
  apkUrl?: string;
  mirrorApkUrl?: string;
  backupUrl?: string;
  /** 可选：APK 的 SHA-256（小写十六进制），用于应用内下载后的完整性校验。 */
  apkSha256?: string;
  /** 可选：APK 字节数，用于在下载前向用户展示体积。 */
  apkSize?: number;
  changelog?: string[];
  forceUpdate?: boolean;
  notice?: string;
}

export interface CheckUpdateResult {
  hasUpdate: boolean;
  currentVersion: string;
  currentVersionCode: number;
  remoteInfo?: RemoteVersionInfo;
  error?: string;
}

export const PREF_KEY_UPDATE_URL = 'ycy_custom_update_url';
export const PREF_KEY_AUTO_CHECK = 'ycy_auto_check_update';
export const PREF_KEY_LAST_CHECK_TIME = 'ycy_last_check_update_time';

/**
 * 默认更新源。
 *
 * 统一走自托管 Cloudflare Worker（R2 作为存储后端），这样代码仓库可以保持私有，
 * 发布物依然能对外分发。地址定义见 updateEndpoints.ts，用户也可在设置中覆盖。
 */
export const DEFAULT_UPDATE_SOURCES: string[] = [APP_UPDATE_MANIFEST_URL];

export const isAutoCheckUpdateEnabled = (): boolean => {
  return readPreference<boolean>(PREF_KEY_AUTO_CHECK, true);
};

export const setAutoCheckUpdateEnabled = (enabled: boolean): boolean => {
  return writePreference(PREF_KEY_AUTO_CHECK, enabled);
};

export const getLastCheckTime = (): number => {
  return readPreference<number>(PREF_KEY_LAST_CHECK_TIME, 0);
};

/**
 * 在多个 APK 下载地址中挑选一个最合适的（优先国内加速镜像）。
 */
export const pickApkUrl = (info?: RemoteVersionInfo | null): string | undefined => {
  if (!info) return undefined;
  return info.mirrorApkUrl || info.apkUrl || info.backupUrl;
};

/**
 * 核心检查更新方法：依次请求候选 URL，支持超时控制与多源回退
 */
export const checkForUpdates = async (): Promise<CheckUpdateResult> => {
  // 更新源由构建配置固定，禁止用户自定义：可配置的更新地址等于对外开放了
  // 一个能指向任意 APK 的入口。这里顺手清掉历史版本遗留的自定义源设置。
  try {
    localStorage.removeItem(PREF_KEY_UPDATE_URL);
  } catch {
    // 隐私模式等场景下 localStorage 不可用，忽略即可
  }

  const candidateUrls = DEFAULT_UPDATE_SOURCES;

  let lastError = '';
  let fetchedInfo: RemoteVersionInfo | null = null;

  for (const url of candidateUrls) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    try {
      timeoutId = setTimeout(() => controller.abort(), 6000);
      const cacheBustUrl = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
      
      const response = await fetch(cacheBustUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);
      timeoutId = null;

      if (!response.ok) {
        lastError = `HTTP ${response.status} (${response.statusText})`;
        continue;
      }

      const data = await response.json();
      if (data && typeof data.version === 'string' && typeof data.versionCode === 'number') {
        fetchedInfo = data as RemoteVersionInfo;
        break;
      } else {
        lastError = '返回数据格式不符合 version.json 规范';
      }
    } catch (err: any) {
      lastError = err?.message || '网络请求超时或无法连接';
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      controller.abort();
    }
  }

  if (fetchedInfo) writePreference(PREF_KEY_LAST_CHECK_TIME, Date.now());

  if (!fetchedInfo) {
    return {
      hasUpdate: false,
      currentVersion: currentBuild.version,
      currentVersionCode: currentBuild.versionCode,
      error: lastError || '无法连接到更新服务器',
    };
  }

  const hasUpdate = fetchedInfo.versionCode > currentBuild.versionCode;
  return {
    hasUpdate,
    currentVersion: currentBuild.version,
    currentVersionCode: currentBuild.versionCode,
    remoteInfo: fetchedInfo,
  };
};

/**
 * 打开外部下载链接
 */
export const openDownloadUrl = (url?: string): boolean => {
  if (!url) return false;
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
};
