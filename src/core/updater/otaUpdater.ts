import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater, BundleInfo, LatestVersion } from '@capgo/capacitor-updater';
import { readPreference, writePreference } from '../ui/localPreferences';
import { OTA_UPDATE_URL } from './updateEndpoints';

/**
 * 幻触 (Phantouch) Web 层热更新 (OTA) 桥接层。
 *
 * 原理：Capacitor 的 WebView 资源平时从 APK 内读取；接入 CapacitorUpdater 后，
 * 可以把新的 dist 下发到设备本地目录并切换加载，从而"不重装 APK 就更新界面/逻辑"。
 *
 * 差分更新：服务端清单里带有每个文件的 SHA-256。客户端会先让原生层比对
 * APK 内置资源与本地缓存，只下载真正变化的文件；体积很大的静态图片若未改动则完全跳过。
 *
 * 注意：只有 Web 层能被热更新。原生插件、权限、BLE 配置等改动仍然必须发新 APK。
 * 原生侧配置见 capacitor.config.ts，自托管服务见 cloudflare/updater-worker/。
 */

export const PREF_KEY_OTA_URL = 'ycy_ota_update_url';
export const PREF_KEY_OTA_AUTO = 'ycy_ota_auto_check';
export const PREF_KEY_OTA_LAST_CHECK = 'ycy_ota_last_check_time';

/** 热更新接口地址，统一定义在 updateEndpoints.ts（需与 capacitor.config.ts 一致）。 */
export const DEFAULT_OTA_UPDATE_URL = OTA_UPDATE_URL;

export interface OtaCheckResult {
  hasUpdate: boolean;
  version?: string;
  url?: string;
  checksum?: string;
  size?: number;
  changelog?: string[];
  message?: string;
  currentVersion?: string;
  error?: string;
  /** 原始 getLatest 响应，供差分下载复用。 */
  latest?: LatestVersion;
}

export interface OtaApplySummary {
  version: string;
  downloadedFiles?: number;
  totalFiles?: number;
  usedDelta: boolean;
}

/** 当前环境是否支持 Web 层热更新（仅原生 Android/iOS 壳）。 */
export const isOtaSupported = (): boolean =>
  Capacitor.isNativePlatform() && (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios');

/**
 * 必须在应用启动后尽快调用：告知原生层本次启动成功。
 * 若新包在 appReadyTimeout 内没有调用，原生层会自动回滚到上一个可用包。
 */
export const notifyOtaReady = async (): Promise<void> => {
  if (!isOtaSupported()) return;
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch (error) {
    console.warn('OTA 启动确认失败（可能是旧版 APK 尚未内置热更新插件）:', error);
  }
};

export const getOtaAutoCheck = (): boolean => readPreference<boolean>(PREF_KEY_OTA_AUTO, true);

export const setOtaAutoCheck = (enabled: boolean): boolean => writePreference(PREF_KEY_OTA_AUTO, enabled);

export const getOtaLastCheck = (): number => readPreference<number>(PREF_KEY_OTA_LAST_CHECK, 0);

/** 当前实际生效的热更新包版本（从未热更过时返回原生内置版本）。 */
export const getOtaCurrentVersion = async (): Promise<string | null> => {
  if (!isOtaSupported()) return null;
  try {
    const result = await CapacitorUpdater.current();
    return result?.bundle?.version ?? null;
  } catch {
    return null;
  }
};

/**
 * 更新源由 capacitor.config.ts 固定写入原生层，运行时不再修改。
 * 这里只清理历史版本可能残留的用户自定义源，避免旧值继续留存在本地存储中。
 */
export const clearLegacyOtaUpdateUrl = (): void => {
  try {
    localStorage.removeItem(PREF_KEY_OTA_URL);
  } catch {
    // 隐私模式等场景下 localStorage 不可用，忽略即可
  }
};

/** 向自托管更新源查询是否有新的 Web 层包。 */
export const checkOtaUpdate = async (): Promise<OtaCheckResult> => {
  if (!isOtaSupported()) {
    return { hasUpdate: false, error: '当前环境不支持 Web 层热更新' };
  }
  clearLegacyOtaUpdateUrl();
  try {
    const latest = await CapacitorUpdater.getLatest();
    const currentVersion = await getOtaCurrentVersion();
    writePreference(PREF_KEY_OTA_LAST_CHECK, Date.now());
    const upToDate = latest?.kind === 'up_to_date' || latest?.error === 'no_new_version_available';
    if (upToDate || !latest?.url) {
      return {
        hasUpdate: false,
        version: latest?.version,
        message: latest?.message,
        currentVersion: currentVersion ?? undefined,
        latest,
      };
    }
    return {
      hasUpdate: true,
      version: latest.version,
      url: latest.url,
      checksum: latest.checksum,
      message: latest.message,
      currentVersion: currentVersion ?? undefined,
      latest,
    };
  } catch (error) {
    return {
      hasUpdate: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * 下载热更新包（下载后不会立即生效）。
 * 优先走差分：先让原生层算出本机缺失的文件，只下载变化部分；失败则回退到完整包。
 */
export const downloadOtaUpdate = async (result: OtaCheckResult): Promise<{ bundle: BundleInfo; summary: OtaApplySummary }> => {
  if (!isOtaSupported()) throw new Error('当前环境不支持 Web 层热更新');
  const latest = result.latest;
  const url = latest?.url || result.url;
  const version = latest?.version || result.version;
  if (!url || !version) throw new Error('缺少热更新包下载信息');

  const baseOptions = { url, version, checksum: latest?.checksum || result.checksum };

  if (latest?.manifest && latest.manifest.length > 0) {
    try {
      const missing = await CapacitorUpdater.getMissingBundleFiles(latest);
      const missingCount = missing?.missingCount ?? 0;
      const total = missing?.total ?? latest.manifest.length;
      if (missingCount < total) {
        // 传递完整 manifest 给 Capgo：原生层会把内置/缓存的未变文件就地复制到新版本目录，
        // 仅对真正缺失的文件发起网络下载，最终组装出包含 index.html 等全部资产的完整可用包。
        const bundle = await CapacitorUpdater.download({ ...baseOptions, manifest: latest.manifest });
        return { bundle, summary: { version, downloadedFiles: missingCount, totalFiles: total, usedDelta: true } };
      }
    } catch (error) {
      console.warn('差分热更新失败，回退到完整包:', error);
    }
  }

  const bundle = await CapacitorUpdater.download(baseOptions);
  return {
    bundle,
    summary: {
      version,
      downloadedFiles: latest?.manifest?.length,
      totalFiles: latest?.manifest?.length,
      usedDelta: false,
    },
  };
};

/** 监听下载进度（0-100），返回取消监听的函数。 */
export const onOtaDownloadProgress = async (
  listener: (percent: number) => void,
): Promise<() => void> => {
  if (!isOtaSupported()) return () => {};
  const handle = await CapacitorUpdater.addListener('download', (event) => listener(event.percent));
  return () => {
    void handle.remove();
  };
};

/**
 * 应用已下载的热更新包。
 * immediate=false：下次进入后台或重启时生效（推荐，不打断用户）。
 * immediate=true ：立即重载，会销毁当前 JS 上下文。
 */
export const applyOtaBundle = async (id: string, immediate = false): Promise<void> => {
  if (!isOtaSupported()) return;
  if (immediate) {
    await CapacitorUpdater.set({ id });
    return;
  }
  await CapacitorUpdater.next({ id });
};

/** 回滚到上一个可用的热更新包（用于新包启动异常时的自救）。 */
export const rollbackOta = async (): Promise<void> => {
  if (!isOtaSupported()) return;
  await CapacitorUpdater.reset({ toLastSuccessful: true });
};
