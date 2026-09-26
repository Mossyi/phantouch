import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { useUpdateStore } from '../core/updater/updateStore';
import { openDownloadUrl, pickApkUrl } from '../core/updater/appUpdater';
import {
  isAndroidApp,
  canInstallPackages,
  openInstallPermissionSettings,
  onDownloadProgress,
  downloadApk,
  installApk,
  cancelApkDownload,
  deriveApkFileName,
  formatBytes,
} from '../core/updater/apkInstaller';
import {
  isOtaSupported,
  downloadOtaUpdate,
  onOtaDownloadProgress,
  applyOtaBundle,
} from '../core/updater/otaUpdater';
import { Download, Copy, Check, Sparkles, X, ShieldAlert, LoaderCircle, HardDriveDownload, Zap, RotateCw } from 'lucide-react';

/**
 * 全局更新弹窗。
 *
 * 独立于设置页渲染，因此无论用户停留在哪个页面，发现新版本时都能立即提示。
 * 下载与安装都需要用户显式点击（保守策略），不做后台静默安装。
 */
export function UpdateModal() {
  const modalKind = useUpdateStore((state) => state.modalKind);
  const apkResult = useUpdateStore((state) => state.apkResult);
  const otaResult = useUpdateStore((state) => state.otaResult);
  const closeModal = useUpdateStore((state) => state.closeModal);
  const setNotice = useUpdateStore((state) => state.setNotice);

  const nativeApp = isAndroidApp();
  const otaSupported = isOtaSupported();

  // APK 下载状态
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [installPermission, setInstallPermission] = useState<boolean | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [errorText, setErrorText] = useState('');

  // 热更新下载状态
  const [otaDownloading, setOtaDownloading] = useState(false);
  const [otaProgress, setOtaProgress] = useState(0);
  const [otaApplying, setOtaApplying] = useState(false);

  // 弹窗打开时重置临时状态，并探测安装权限
  useEffect(() => {
    if (!modalKind) return;
    setErrorText('');
    setCopiedLink(false);
    setDownloadProgress(0);
    setOtaProgress(0);

    if (modalKind === 'apk' && nativeApp) {
      let cancelled = false;
      const refreshPermission = () => {
        canInstallPackages()
          .then((allowed) => {
            if (!cancelled) {
              setInstallPermission(allowed);
              if (allowed) setErrorText((prev) => prev.includes('安装未知应用') ? '' : prev);
            }
          })
          .catch(() => {
            if (!cancelled) setInstallPermission(false);
          });
      };

      refreshPermission();

      let appListenerHandle: { remove: () => Promise<void> } | null = null;
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) refreshPermission();
      }).then((handle) => {
        if (cancelled) {
          void handle.remove();
        } else {
          appListenerHandle = handle;
        }
      }).catch(() => {});

      const onFocus = () => refreshPermission();
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onFocus);

      return () => {
        cancelled = true;
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onFocus);
        if (appListenerHandle) {
          void appListenerHandle.remove();
        }
      };
    }
    return undefined;
  }, [modalKind, nativeApp]);

  if (!modalKind) return null;

  const apkInfo = apkResult?.remoteInfo;
  const apkUrl = pickApkUrl(apkInfo);

  const handleCopyApkUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      setNotice('下载链接已复制到剪贴板！');
    } catch {
      setErrorText('复制失败，请手动打开链接');
    }
  };

  const handleNativeUpdate = async () => {
    if (!apkUrl) {
      setErrorText('当前版本未提供 APK 下载地址，请稍后重试');
      return;
    }
    if (downloading) {
      await cancelApkDownload().catch(() => {});
      return;
    }
    setErrorText('');
    try {
      const allowed = await canInstallPackages();
      setInstallPermission(allowed);
      if (!allowed) {
        await openInstallPermissionSettings();
        setErrorText('请先在系统页面允许“安装未知应用”，然后返回本页重新点击更新');
        return;
      }
      setDownloading(true);
      setInstalling(false);
      setDownloadProgress(0);
      setDownloadedBytes(0);
      setDownloadTotal(apkInfo?.apkSize || 0);

      const stopProgress = await onDownloadProgress((event) => {
        setDownloadProgress(event.progress);
        setDownloadedBytes(event.downloadedBytes);
        if (event.totalBytes > 0) setDownloadTotal(event.totalBytes);
      });
      try {
        const result = await downloadApk({
          url: apkUrl,
          fileName: deriveApkFileName(apkUrl, apkInfo?.version || ''),
          sha256: apkInfo?.apkSha256,
        });
        setInstalling(true);
        setNotice('安装包已下载并校验通过，正在调起系统安装程序…');
        await installApk(result.filePath);
      } finally {
        stopProgress();
      }
    } catch (error) {
      setErrorText(`应用内更新失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDownloading(false);
      setInstalling(false);
    }
  };

  const handleDownloadOta = async (immediate: boolean) => {
    if (!otaResult?.hasUpdate) return;
    setOtaDownloading(true);
    setOtaProgress(0);
    setErrorText('');
    let stopProgress: (() => void) | null = null;
    try {
      stopProgress = await onOtaDownloadProgress((percent) => setOtaProgress(percent));
      const { bundle, summary } = await downloadOtaUpdate(otaResult);
      setOtaApplying(true);
      setNotice(immediate ? '热更新已就绪，正在重启应用…' : '热更新已下载，将在下次启动时自动生效');
      await applyOtaBundle(bundle.id, immediate);
      closeModal();
      if (!immediate) setNotice(`已应用热更新 ${summary.version}，下次启动生效`);
    } catch (error) {
      setErrorText(`热更新下载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      stopProgress?.();
      setOtaDownloading(false);
      setOtaApplying(false);
    }
  };

  const isBusy = downloading || installing || otaDownloading || otaApplying;
  // APK 下载可以取消；安装程序已弹出、或热更新正在下载/切换包时不能关闭。
  // 这个值同时驱动按钮禁用与蒙层点击，避免出现“按钮可点但点了没反应”。
  const closeBlocked = installing || otaDownloading || otaApplying;

  const handleClose = async () => {
    if (closeBlocked) return;
    if (downloading) {
      await cancelApkDownload().catch(() => {});
    }
    closeModal();
  };

  const title = modalKind === 'ota' ? '发现热更新' : '发现新版本';
  const versionText = modalKind === 'ota'
    ? otaResult?.version
    : apkInfo ? `${apkInfo.version} (构建 ${apkInfo.versionCode})` : '';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={closeBlocked ? undefined : handleClose}
    >
      <div
        className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-3.5 border border-pink-200/80"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-xs">
              {modalKind === 'ota' ? <Zap className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-800">{title}</h4>
              {versionText && <p className="text-[10px] text-pink-600 font-bold">{versionText}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={closeBlocked}
            title={closeBlocked ? '正在处理更新，请稍候' : '关闭'}
            className="text-slate-400 hover:text-slate-600 p-1 disabled:opacity-30 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {modalKind === 'ota' ? (
          <>
            <p className="text-[10.5px] text-slate-600 leading-relaxed bg-amber-50 p-3 rounded-2xl border border-amber-200">
              这是界面与逻辑的热更新，无需重新安装 APK。下载后将在下次启动时自动生效，
              如果新版本启动异常，系统会自动回滚到当前版本。
            </p>
            {otaDownloading && (
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-amber-200/60 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${otaProgress}%` }} />
                </div>
                <p className="text-[9.5px] text-amber-700 text-center">{otaProgress}% · 正在下载变化文件</p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handleDownloadOta(false)}
                  disabled={isBusy}
                  className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10.5px] transition disabled:opacity-60 flex items-center justify-center gap-1"
                >
                  {otaDownloading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>下次启动生效</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadOta(true)}
                  disabled={isBusy}
                  className="px-3 py-2 rounded-xl bg-white border border-amber-300 text-amber-700 font-bold text-[10.5px] transition disabled:opacity-60 flex items-center gap-1"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>立即重启</span>
                </button>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isBusy}
                className="w-full py-1.5 rounded-xl bg-white hover:bg-pink-50/60 border border-slate-200 text-slate-500 hover:text-slate-700 font-bold text-[10px] transition disabled:opacity-40"
              >
                暂不更新
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200/70 max-h-48 overflow-y-auto">
              <p className="text-[10.5px] font-bold text-slate-700">更新内容：</p>
              {apkInfo?.changelog && apkInfo.changelog.length > 0 ? (
                <ul className="list-disc pl-4 space-y-1 text-[10px] text-slate-600 leading-relaxed">
                  {apkInfo.changelog.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              ) : (
                <p className="text-[10px] text-slate-500">常规性能优化与已知问题修复。</p>
              )}
            </div>

            {apkInfo?.notice && (
              <p className="text-[9.5px] text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200">
                {apkInfo.notice}
              </p>
            )}

            <div className="space-y-2 pt-1">
              {nativeApp && (
                <>
                  <button
                    type="button"
                    onClick={handleNativeUpdate}
                    disabled={installing || !apkUrl}
                    className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black text-xs shadow-md shadow-pink-500/20 hover:from-pink-600 hover:to-rose-600 active:scale-[0.98] transition flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {downloading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />}
                    <span>
                      {downloading ? `正在下载 ${downloadProgress}%` : installing ? '正在调起安装程序…' : '应用内一键更新'}
                    </span>
                  </button>

                  {downloading && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all"
                          style={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                      <p className="text-[9.5px] text-slate-500 text-center">
                        {formatBytes(downloadedBytes)}{downloadTotal > 0 ? ` / ${formatBytes(downloadTotal)}` : ''} · 下载中请勿关闭应用
                      </p>
                    </div>
                  )}

                  {installPermission === false && (
                    <p className="text-[9.5px] text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200 flex items-start gap-1.5">
                      <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>系统尚未允许本应用安装更新。点击后会先跳转授权页，允许后返回重试即可。</span>
                    </p>
                  )}
                </>
              )}

              {!nativeApp && apkUrl && (
                <button
                  type="button"
                  onClick={() => openDownloadUrl(apkUrl)}
                  className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black text-xs shadow-md shadow-pink-500/20 hover:from-pink-600 hover:to-rose-600 active:scale-[0.98] transition flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>打开下载链接</span>
                </button>
              )}

              <div className="flex gap-2">
                {apkUrl && (
                  <button
                    type="button"
                    onClick={() => handleCopyApkUrl(apkUrl)}
                    className="flex-1 py-2 rounded-xl bg-pink-50/70 hover:bg-pink-100 text-pink-700 font-bold text-[10px] border border-pink-200/80 transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-95"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-pink-500" />}
                    <span>{copiedLink ? '已复制链接' : '复制下载链接'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={installing}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 font-bold text-[10px] transition disabled:opacity-40 active:scale-95 shadow-2xs"
                >
                  {downloading ? '取消下载' : '暂不更新'}
                </button>
              </div>
            </div>
          </>
        )}

        {modalKind === 'ota' && otaSupported && (
          <p className="text-[9px] text-slate-400 text-center">
            热更新只更新界面与逻辑；涉及原生插件或权限变更时仍需整包更新。
          </p>
        )}

        {errorText && (
          <p className="p-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-medium">
            {errorText}
          </p>
        )}
      </div>
    </div>
  );
}
