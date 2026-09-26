import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import {
  useUpdateStore,
  isAutoUpdateCheckEnabled,
  isAutoCheckDue,
  markAutoChecked,
} from '../core/updater/updateStore';
import { UpdateModal } from './UpdateModal';

/**
 * 全局更新检查器。
 *
 * 挂在应用根部，因此不受当前停留页面影响：
 * - 启动时检查一次
 * - 原生壳从后台回到前台时再检查一次
 * - 两次自动检查之间至少间隔 30 分钟，避免频繁请求更新服务
 *
 * 发现新版本只弹窗提示，下载与安装始终由用户确认。
 */
export function GlobalUpdateChecker() {
  const checkApk = useUpdateStore((state) => state.checkApk);
  const checkOta = useUpdateStore((state) => state.checkOta);

  useEffect(() => {
    // 开发模式交由源码热重载，不触发自动检查，避免频繁请求更新服务。
    if (import.meta.env.DEV) return;

    let disposed = false;

    const runAutoCheck = async () => {
      if (disposed) return;
      if (!isAutoUpdateCheckEnabled()) return;
      if (!isAutoCheckDue()) return;

      markAutoChecked();
      const apkResult = await checkApk();
      if (disposed || apkResult.hasUpdate) return;
      // 整包没有更新时才检查热更新，避免两个弹窗互相抢占。
      await checkOta();
    };

    void runAutoCheck();

    let appListenerHandle: { remove: () => Promise<void> } | null = null;
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void runAutoCheck();
      })
        .then((handle) => {
          if (disposed) {
            void handle.remove();
          } else {
            appListenerHandle = handle;
          }
        })
        .catch((error) => {
          console.warn('注册前后台监听失败，将只在启动时检查更新:', error);
        });
    }

    return () => {
      disposed = true;
      if (appListenerHandle) {
        void appListenerHandle.remove();
        appListenerHandle = null;
      }
    };
  }, [checkApk, checkOta]);

  return <UpdateModal />;
}
