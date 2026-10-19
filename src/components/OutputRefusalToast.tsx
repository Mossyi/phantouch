import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { DeviceManager } from '../core/deviceManager';
import type { EmsOutputRefusal, EmsOutputRefusalReason } from '../core/deviceManager';

/**
 * 电击被拒绝时的全局可见提示。
 *
 * 背景：`setEmsStrength` / `sendEmsWave` 在"急停锁锁存"、"目标通道上限为 0"、
 * "波形请求时强度为 0 且无法起振"这几种情况下返回的是**字符串**而不是抛异常，
 * 而绝大多数调用点写的是 `void dev.setEmsStrength(...).catch(() => {})` ——
 * `.catch` 永远不会触发，于是用户只看到"点了没反应"。
 *
 * 这个组件订阅 DeviceManager 的拒绝事件，把原因直接摆到界面上，并给出对应的解决动作。
 */

const HINTS: Record<EmsOutputRefusalReason, string> = {
  emergency_lock: '请点击顶栏或控制页的「解除急停锁」后再试。',
  emergency_lock_restored: '若你并未主动锁定，请点右上角「解除急停锁」；锁存状态下一切电击都会被拒绝。',
  no_usable_channel: '请到【设置 → 硬件安全】把该通道的安全上限调高（当前为 0）。',
  zero_strength: '请先在控制页设置一个强度，或把「最小强度下限」调高。',
  write_timeout: '链路可能假死：请检查蓝牙连接，必要时断开重连设备。停止包已尝试直发，本地输出已归零。',
  electrode_off: '设备回报该通道电极片未接入或未贴合皮肤：请检查导线插头与电极片贴合，设备在此状态下不会放电。',
};

const TITLES: Record<EmsOutputRefusalReason, string> = {
  emergency_lock: '急停锁已锁存',
  emergency_lock_restored: '上次的急停锁仍在生效',
  no_usable_channel: '没有可用的电击通道',
  zero_strength: '强度为 0，波形不会产生输出',
  write_timeout: '硬件写入超时，本次输出已放弃',
  electrode_off: '电极片未接入',
};

const VISIBLE_MS = 5200;
const RESTORED_VISIBLE_MS = 9000;
const DEDUPE_MS = 3000;

export const OutputRefusalToast: React.FC = () => {
  const [refusal, setRefusal] = React.useState<EmsOutputRefusal | null>(null);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRef = React.useRef<{ key: string; at: number }>({ key: '', at: 0 });

  React.useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const unsubscribe = DeviceManager.getInstance().subscribeOutputRefusal((next) => {
      const key = `${next.reason}|${next.message}`;
      const now = Date.now();
      // 拖滑块时同一原因会高频触发：同一提示在 3 秒内只重置计时，不反复弹跳。
      const isRepeat = lastRef.current.key === key && now - lastRef.current.at < DEDUPE_MS;
      lastRef.current = { key, at: now };
      if (!isRepeat) setRefusal(next);
      clearHideTimer();
      hideTimerRef.current = setTimeout(() => {
        setRefusal(null);
        hideTimerRef.current = null;
      }, VISIBLE_MS);
    });

    // 启动时若发现上次会话残留的急停锁：没有这一步的话，用户只会看到"怎么都电不了"，
    // 而锁存提示藏在顶栏里。这里主动说明一次。
    if (DeviceManager.getInstance().getSafetyConfig().emergencyLock) {
      setRefusal({
        reason: 'emergency_lock_restored',
        message: '全局急停锁仍处于锁存状态，本次启动后所有电击指令都会被拒绝。',
      });
      hideTimerRef.current = setTimeout(() => {
        setRefusal(null);
        hideTimerRef.current = null;
      }, RESTORED_VISIBLE_MS);
    }

    return () => {
      unsubscribe();
      clearHideTimer();
    };
  }, []);

  if (!refusal) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      onClick={() => setRefusal(null)}
      className="liquid-glass fixed top-[calc(max(3.8rem,env(safe-area-inset-top,0px)+2.75rem))] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 cursor-pointer rounded-2xl border border-amber-300 px-3.5 py-3 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-amber-900">{TITLES[refusal.reason]}</p>
          <p className="mt-0.5 break-words text-[10px] font-bold leading-relaxed text-amber-800">
            {refusal.message}
          </p>
          <p className="mt-1 break-words text-[9.5px] leading-relaxed text-amber-700">
            {HINTS[refusal.reason]}
          </p>
        </div>
      </div>
      <p className="mt-1.5 text-right text-[8px] font-bold text-amber-600/70">点击关闭</p>
    </div>
  );
};

export default OutputRefusalToast;
