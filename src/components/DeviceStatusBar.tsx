import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useUpdateStore } from '../core/updater/updateStore';
import { Bluetooth, Radio, Cpu, Zap, Activity, Tv, Unlock, Download, OctagonX } from 'lucide-react';

export const DeviceStatusBar: React.FC = () => {
  const {
    deviceState,
    triggerEmergencyStop,
    setActiveTab,
    floatingWindowState,
    toggleFloatingWindow,
    safetyConfig,
    setSafetyConfig,
  } = useAppStore();

  // 检测到整包或热更新时在顶栏给出提示，点击直接打开更新弹窗
  const hasApkUpdate = useUpdateStore((state) => Boolean(state.apkResult?.hasUpdate));
  const hasOtaUpdate = useUpdateStore((state) => Boolean(state.otaResult?.hasUpdate));
  const openUpdateModal = useUpdateStore((state) => state.openModal);
  const updateKind = hasApkUpdate ? 'apk' : hasOtaUpdate ? 'ota' : null;

  const modeMeta = (() => {
    switch (deviceState.connectionMode) {
      case 'ble':
        return { icon: Bluetooth, label: 'BLE 蓝牙直连' };
      case 'bridge':
        return { icon: Radio, label: '幻触云桥接' };
      case 'dglab':
        return { icon: Radio, label: '郊狼 App 互联' };
      case 'simulator':
      default:
        return { icon: Cpu, label: '虚拟仿真模式' };
    }
  })();
  const ModeIcon = modeMeta.icon;

  const isConnected = deviceState.connectionStatus === 'connected';
  const isShocking = deviceState.ems.isShocking;
  const motorActive = deviceState.toy.motorA > 0 || deviceState.toy.motorB > 0 || deviceState.toy.motorC > 0;

  return (
    <header className="app-header sticky top-0 z-40 px-3 pb-2 pt-safe-header">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        {/* 左侧：设备状态胶囊，点击进入设备连接 */}
        <button type="button" className="status-capsule flex-1 sm:flex-none text-left" onClick={() => setActiveTab('device')} aria-label="打开设备连接设置">
          <span className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full ${isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-pink-50 text-pink-600'}`}>
            <ModeIcon className="h-4 w-4" />
            {/* 连接圆点的 ping 光环需要向外扩散，父级不能裁切 */}
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {isConnected && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400/60 animate-ping" />}
          </span>
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="block truncate text-[13px] font-bold leading-tight text-slate-800">{deviceState.deviceName}</span>
            <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] font-medium leading-tight text-slate-500">
              {isShocking ? (
                <span className="flex items-center gap-1 font-mono font-bold text-amber-700">
                  <Zap className="h-3 w-3 animate-pulse" />A {deviceState.ems.strengthA} · B {deviceState.ems.strengthB}
                </span>
              ) : (
                <span>{modeMeta.label}</span>
              )}
              {motorActive && (
                <span className="flex items-center gap-0.5 font-mono font-bold text-pink-700">
                  <Activity className="h-3 w-3" />{deviceState.toy.motorA}-{deviceState.toy.motorB}-{deviceState.toy.motorC}
                </span>
              )}
            </span>
          </span>
        </button>

        <div className="hidden flex-1 sm:block" />

        {/* 右侧工具与急停（shrink-0 保证任何宽度下都不被压缩） */}
        <div className="flex shrink-0 items-center gap-1.5">
          {updateKind && (
            <button
              type="button"
              onClick={() => openUpdateModal(updateKind)}
              className="icon-button relative"
              data-active="true"
              title={updateKind === 'apk' ? '发现新版本，点击查看更新内容' : '发现热更新，点击查看更新内容'}
              aria-label={updateKind === 'apk' ? '有新版本' : '有热更新'}
            >
              <Download className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>
          )}

          {/* 急停锁激活时显示解除按钮 */}
          {safetyConfig?.emergencyLock && (
            <button
              type="button"
              onClick={() => setSafetyConfig({ emergencyLock: false })}
              className="flex h-[2.375rem] items-center gap-1 rounded-[0.875rem] border border-amber-300 bg-amber-50 px-2.5 text-xs font-bold text-amber-800 shadow-xs transition-all active:scale-95"
              title="急停锁已切断全部输出，点击一键解除急停锁定"
            >
              <Unlock className="h-3.5 w-3.5" />
              <span>解锁</span>
            </button>
          )}

          {/* 画中画悬浮窗开关 */}
          <button
            type="button"
            onClick={() => toggleFloatingWindow()}
            className="icon-button"
            data-active={floatingWindowState.isOpen}
            title="开启/关闭 赛博悬浮窗模式"
            aria-label={floatingWindowState.isOpen ? '关闭悬浮窗' : '开启悬浮窗'}
          >
            <Tv className="h-4 w-4" />
          </button>

          {/* 顶部极速急停 */}
          <button type="button" onClick={() => triggerEmergencyStop()} className="estop-button" aria-label="紧急停止全部输出">
            <OctagonX className="h-4 w-4" strokeWidth={2.4} />
            急停
          </button>
        </div>
      </div>
    </header>
  );
};
