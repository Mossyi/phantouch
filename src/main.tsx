import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { notifyOtaReady, rollbackOta, isOtaSupported } from './core/updater/otaUpdater';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('全局渲染异常:', error, errorInfo);
  }

  private handleResetCache = async () => {
    try {
      if (isOtaSupported()) {
        await rollbackOta().catch(() => {});
      }
      const appKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((key): key is string => typeof key === 'string' && key.startsWith('ycy_'));
      for (const key of appKeys) localStorage.removeItem(key);
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames
          .filter((name) => name.startsWith('ycy-pwa-cache-'))
          .map((name) => caches.delete(name)));
      }
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-600/50 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center text-2xl font-bold">
              ⚠️
            </div>
            <h2 className="text-lg font-bold text-slate-100">应用加载异常</h2>
            <p className="text-xs text-slate-400 leading-relaxed font-mono bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-left overflow-x-auto max-h-32">
              {this.state.error?.message || '未知前端异常'}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow transition-all active:scale-95"
              >
                刷新页面
              </button>
              {isOtaSupported() && (
                <button
                  onClick={async () => {
                    await rollbackOta().catch(() => {});
                    window.location.reload();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow transition-all active:scale-95"
                >
                  回滚热更新
                </button>
              )}
              <button
                onClick={this.handleResetCache}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 text-xs font-bold shadow transition-all active:scale-95"
              >
                清理缓存并重置
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>,
);

// 必须在启动早期调用：确认本次启动成功，否则原生层会回滚有问题的热更新包。
void notifyOtaReady();

const isNativeApp = Boolean((window as any).Capacitor?.isNativePlatform?.());
if (import.meta.env.PROD && !isNativeApp && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('PWA 离线服务注册失败:', error);
    });
  });
}
