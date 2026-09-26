import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Share, PlusSquare } from 'lucide-react';

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      setIsStandalone(true);
      return;
    }
    // 检测是否已经在独立 App 模式下运行
    const inStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(inStandalone);

    if (inStandalone) return;

    // 检测是否为 iOS 设备
    const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(isIosDevice);

    let dismissed = false;
    try {
      const dismissedAt = Number(localStorage.getItem('ycy_pwa_dismissed'));
      dismissed = Number.isFinite(dismissedAt) && Date.now() - dismissedAt < 30 * 86400000;
    } catch {}
    if (dismissed) return;

    // Android / Chrome 捕获安装事件
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    const handleInstalled = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener('appinstalled', handleInstalled);

    // iOS 首次访问 3 秒后温和展示提示
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIosDevice && !inStandalone) {
      iosTimer = setTimeout(() => setShowBanner(true), 3000);
    }

    return () => {
      if (iosTimer) clearTimeout(iosTimer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    try {
      localStorage.setItem('ycy_pwa_dismissed', String(Date.now()));
    } catch {}
  };

  if (isStandalone || !showBanner) return null;

  return (
    <div className="fixed top-14 left-3 right-3 z-50 max-w-md mx-auto animate-in fade-in slide-in-from-top-4">
      <div className="modern-card bg-gradient-to-r from-pink-950/90 via-rose-950/80 to-pink-950/90 border border-pink-300/25 rounded-3xl p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="p-2.5 rounded-2xl bg-pink-500/15 text-pink-200 border border-pink-300/20 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <span>安装为手机桌面 App</span>
                <span className="text-[9px] bg-pink-500/20 text-pink-200 px-1.5 py-0.5 rounded-full font-mono">PWA</span>
              </h4>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                无需通过应用商店，添加到主屏幕即可获得无地址栏的全屏体验与更快启动速度。
              </p>

              {isIOS ? (
                <div className="mt-2 text-[10px] text-cyan-300 bg-cyan-950/60 p-2 rounded-xl border border-cyan-800/60 space-y-1">
                  <div className="flex items-center gap-1">
                    <span>1. 点击 Safari 底部</span>
                    <Share className="w-3.5 h-3.5 inline text-cyan-400" />
                    <span>【分享】按钮</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>2. 向下滑动选择</span>
                    <PlusSquare className="w-3.5 h-3.5 inline text-cyan-400" />
                    <span>【添加到主屏幕】</span>
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    onClick={handleInstallClick}
                    className="flex items-center gap-1 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-lg shadow-pink-950/40 active:scale-95 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> 立即添加到桌面
                  </button>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-200 p-1"
            title="暂不安装"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
