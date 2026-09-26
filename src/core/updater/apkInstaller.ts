import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

/**
 * 幻触 (Phantouch) 应用内 APK 更新桥接层。
 *
 * 只在 Android 原生壳中生效；浏览器 / PWA 环境会回退为"打开外部下载链接"。
 * 原生侧实现见 android/app/src/main/java/com/yiciyuan/aicontroller/AppUpdaterPlugin.java
 */

export interface DownloadProgressEvent {
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
}

export interface ApkDownloadResult {
  filePath: string;
  bytes: number;
  sha256: string;
}

interface AppUpdaterPluginApi {
  canInstallPackages(): Promise<{ allowed: boolean; supported: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  downloadApk(options: { url: string; fileName?: string; sha256?: string }): Promise<ApkDownloadResult>;
  cancelDownload(): Promise<void>;
  installApk(options: { filePath: string }): Promise<void>;
  addListener(
    eventName: 'downloadProgress',
    listener: (data: DownloadProgressEvent) => void,
  ): Promise<PluginListenerHandle>;
}

const AppUpdater = registerPlugin<AppUpdaterPluginApi>('AppUpdater');

/** 当前是否运行在 Android 原生壳中（此时可以调用应用内下载与安装）。 */
export const isAndroidApp = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** 查询系统是否已允许本应用安装未知来源应用。 */
export const canInstallPackages = async (): Promise<boolean> => {
  if (!isAndroidApp()) return false;
  try {
    const result = await AppUpdater.canInstallPackages();
    return Boolean(result?.allowed);
  } catch {
    return false;
  }
};

/** 跳转到系统"安装未知应用"授权页。 */
export const openInstallPermissionSettings = async (): Promise<void> => {
  if (!isAndroidApp()) return;
  await AppUpdater.openInstallPermissionSettings();
};

/** 监听下载进度，返回取消监听的函数。 */
export const onDownloadProgress = async (
  listener: (event: DownloadProgressEvent) => void,
): Promise<() => void> => {
  if (!isAndroidApp()) return () => {};
  const handle = await AppUpdater.addListener('downloadProgress', listener);
  return () => {
    void handle.remove();
  };
};

/** 原生下载 APK 到应用缓存目录，可选 SHA-256 校验。 */
export const downloadApk = async (options: {
  url: string;
  fileName?: string;
  sha256?: string;
}): Promise<ApkDownloadResult> => {
  if (!isAndroidApp()) throw new Error('当前环境不支持应用内下载');
  return AppUpdater.downloadApk(options);
};

export const cancelApkDownload = async (): Promise<void> => {
  if (!isAndroidApp()) return;
  await AppUpdater.cancelDownload();
};

/** 调起系统安装程序完成覆盖安装。 */
export const installApk = async (filePath: string): Promise<void> => {
  if (!isAndroidApp()) throw new Error('当前环境不支持应用内安装');
  await AppUpdater.installApk({ filePath });
};

/** 从下载地址推断一个安全的 APK 文件名。 */
export const deriveApkFileName = (url: string, version: string): string => {
  const fallback = `phantouch-${version || 'latest'}.apk`;
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').filter(Boolean).pop() || '';
    const cleaned = last.replace(/[^A-Za-z0-9._-]/g, '_');
    if (cleaned.toLowerCase().endsWith('.apk')) return cleaned;
  } catch {
    // 忽略非法 URL，使用默认文件名
  }
  return fallback;
};

/** 把字节数格式化为易读体积。 */
export const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)}${units[unit]}`;
};