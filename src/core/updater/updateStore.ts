import { create } from 'zustand';
import { checkForUpdates, CheckUpdateResult, isAutoCheckUpdateEnabled } from './appUpdater';
import { checkOtaUpdate, isOtaSupported, OtaCheckResult } from './otaUpdater';

/**
 * 全局更新状态。
 *
 * 更新检查原先写在设置页的「关于与远程更新」面板里，导致用户只有主动进入设置页
 * 才可能发现新版本。现在把状态与检查动作集中到这里，由 GlobalUpdateChecker 在
 * 应用启动与回到前台时统一触发，弹窗独立于当前页面渲染。
 */

export type UpdateModalKind = 'apk' | 'ota' | null;

interface UpdateStore {
  apkChecking: boolean;
  apkResult: CheckUpdateResult | null;
  otaChecking: boolean;
  otaResult: OtaCheckResult | null;
  modalKind: UpdateModalKind;
  notice: string;

  checkApk: () => Promise<CheckUpdateResult>;
  checkOta: () => Promise<OtaCheckResult>;
  openModal: (kind: UpdateModalKind) => void;
  closeModal: () => void;
  setNotice: (message: string) => void;
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  apkChecking: false,
  apkResult: null,
  otaChecking: false,
  otaResult: null,
  modalKind: null,
  notice: '',

  checkApk: async () => {
    set({ apkChecking: true, notice: '' });
    try {
      const result = await checkForUpdates();
      set({ apkResult: result, apkChecking: false });
      if (result.hasUpdate) {
        set({ modalKind: 'apk' });
      } else {
        // 结果从“有更新”翻转为“无更新”时（例如已发布的版本被回滚），
        // 必须同步收起仍在提示的弹窗，否则它会继续显示“发现新版本”，与真实状态矛盾。
        if (get().modalKind === 'apk') set({ modalKind: null });
        if (result.error) set({ notice: `检查更新失败：${result.error}` });
        else set({ notice: `当前已是最新版本 (${result.currentVersion})` });
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ apkChecking: false, notice: `请求异常：${message}` });
      return {
        hasUpdate: false,
        currentVersion: '',
        currentVersionCode: 0,
        error: message,
      };
    }
  },

  checkOta: async () => {
    if (!isOtaSupported()) {
      const result: OtaCheckResult = { hasUpdate: false, error: '当前环境不支持 Web 层热更新' };
      set({ otaResult: result });
      return result;
    }
    set({ otaChecking: true, notice: '' });
    try {
      const result = await checkOtaUpdate();
      set({ otaResult: result, otaChecking: false });
      if (result.error) {
        set({ notice: `热更新检查失败：${result.error}` });
      } else if (result.hasUpdate) {
        // APK 整包更新的优先级更高：若弹窗已经在提示整包更新，就不要抢占它。
        if (get().modalKind === null) set({ modalKind: 'ota' });
      } else {
        if (get().modalKind === 'ota') set({ modalKind: null });
        const customMessage = result.message && result.message !== 'No new version available' ? result.message : '';
        set({ notice: customMessage || '热更新已是最新，无需下载' });
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ otaChecking: false, notice: `热更新检查异常：${message}` });
      return { hasUpdate: false, error: message };
    }
  },

  openModal: (kind) => set({ modalKind: kind }),
  closeModal: () => set({ modalKind: null }),
  setNotice: (message) => set({ notice: message }),
}));

/** 自动检查是否对用户开启（设置页开关）。 */
export const isAutoUpdateCheckEnabled = (): boolean => isAutoCheckUpdateEnabled();

/** 两次自动检查之间的最小间隔：30 分钟。 */
export const AUTO_CHECK_INTERVAL_MS = 30 * 60 * 1000;

const LAST_AUTO_CHECK_KEY = 'ycy_last_auto_update_check';

export const getLastAutoCheckAt = (): number => {
  try {
    const raw = localStorage.getItem(LAST_AUTO_CHECK_KEY);
    const value = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

export const markAutoChecked = (): void => {
  try {
    localStorage.setItem(LAST_AUTO_CHECK_KEY, String(Date.now()));
  } catch {
    // 隐私模式等场景下 localStorage 不可用，忽略即可
  }
};

export const isAutoCheckDue = (now = Date.now()): boolean =>
  now - getLastAutoCheckAt() >= AUTO_CHECK_INTERVAL_MS;
