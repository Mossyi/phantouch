import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useUpdateStore } from '../core/updater/updateStore';
import { Bluetooth, Radio, Cpu, Battery, Zap, Activity, Tv, Unlock, Download } from 'lucide-react';

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

  const getModeBadge = () => {
    switch (deviceState.connectionMode) {
      case 'ble':
        return (
          <span className="liquid-chip flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 text-pink-700">
            <Bluetooth className="w-3.5 h-3.5 text-pink-600" /> BLE 蓝牙直连
          </span>
        );
      case 'bridge':
        return (
          <span className="liquid-chip flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 text-pink-700">
            <Radio className="w-3.5 h-3.5 text-pink-600" /> 幻触云桥接
          </span>
        );
      case 'dglab':
        return (
          <span className="liquid-chip flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 text-pink-700">
            <Radio className="w-3.5 h-3.5 text-purple-600" /> 郊狼 App 互联
          </span>
        );
      case 'simulator':
      default:
        return (
          <span className="liquid-chip flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 text-pink-700">
            <Cpu className="w-3.5 h-3.5 text-pink-600" /> 虚拟仿真模式
          </span>
        );
    }
  };

  const isConnected = deviceState.connectionStatus === 'connected';

  return (
    <header className="liquid-header sticky top-0 z-40 flex items-center justify-between px-4 pb-2.5 pt-safe-header">
      {/* 左侧：连接模式与状态（更新提示放在这里，避免挤压右侧急停按钮） */}
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
        <button type="button" className="flex items-center gap-2.5 cursor-pointer min-w-0 text-left" onClick={() => setActiveTab('device')} aria-label="打开设备连接设置">
          <div className="relative shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {isConnected && (
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-400/40 animate-ping" />
            )}
          </div>
          {/* overflow-hidden 只作用于文字区：连接圆点的 animate-ping 需要向外扩散，
              裁切会切掉光环；文字过长仍由 truncate 收敛。 */}
          <div className="min-w-0 overflow-hidden">
            <div className="flex items-center gap-1.5">
              {getModeBadge()}
            </div>
            <p className="mt-0.5 max-w-[190px] sm:max-w-[260px] truncate font-mono text-[10px] font-bold text-slate-500">
              {deviceState.deviceName}
            </p>
          </div>
        </button>

        {updateKind && (
          <button
            type="button"
            onClick={() => openUpdateModal(updateKind)}
            className="liquid-btn shrink-0 flex items-center gap-1 rounded-xl border border-pink-300 bg-gradient-to-r from-pink-500 to-rose-500 p-1.5 sm:px-2 sm:py-1 text-[10px] font-black text-white shadow-sm shadow-pink-500/30 animate-pulse active:scale-95 transition-all"
            title={updateKind === 'apk' ? '发现新版本，点击查看更新内容' : '发现热更新，点击查看更新内容'}
          >
            <Download className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
            {/* 窄屏只留图标，把空间优先让给设备状态与右侧急停按钮 */}
            <span className="hidden sm:inline">{updateKind === 'apk' ? '有新版本' : '有热更新'}</span>
          </button>
        )}
      </div>

      {/* 中间：设备输出实时微型指示 */}
      <div className="hidden sm:flex items-center gap-3 text-xs">
        {deviceState.ems.isShocking && (
          <span className="flex items-center gap-1 text-amber-900 font-mono font-bold bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 shadow-sm animate-pulse">
            <Zap className="w-3 h-3 text-amber-600" /> A:{deviceState.ems.strengthA} B:{deviceState.ems.strengthB}
          </span>
        )}
        {(deviceState.toy.motorA > 0 || deviceState.toy.motorB > 0 || deviceState.toy.motorC > 0) && (
          <span className="flex items-center gap-1 text-pink-900 font-mono font-bold bg-pink-100 px-2 py-0.5 rounded-full border border-pink-300 shadow-sm">
            <Activity className="w-3 h-3 text-pink-600" /> 马达: {deviceState.toy.motorA}-{deviceState.toy.motorB}-{deviceState.toy.motorC}
          </span>
        )}
      </div>

      {/* 右侧：急停锁解除、悬浮窗与急停按钮（shrink-0 保证任何宽度下都不被压缩） */}
      <div className="flex items-center gap-2 shrink-0">
        {/* 急停锁激活时显示解除急停锁按钮 */}
        {safetyConfig?.emergencyLock && (
          <button
            onClick={() => setSafetyConfig({ emergencyLock: false })}
            className="liquid-btn flex items-center gap-1 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 px-2.5 py-1.5 text-xs font-black text-white shadow-sm shadow-amber-500/30 animate-pulse active:scale-95 transition-all shrink-0"
            title="急停锁已切断全部输出，点击一键解除急停锁定"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>解除急停锁</span>
          </button>
        )}

        {/* 画中画悬浮窗开关 */}
        <button
          onClick={() => toggleFloatingWindow()}
          className={`liquid-btn p-2 rounded-xl border text-xs font-bold transition-all shadow-xs ${
            floatingWindowState.isOpen
              ? 'bg-pink-500 text-white border-pink-500 shadow-pink-500/20'
              : 'bg-white/80 backdrop-blur-md text-slate-600 border-white/90 hover:bg-white hover:text-pink-600'
          }`}
          title="开启/关闭 赛博悬浮窗模式"
        >
          <Tv className="w-4 h-4" />
        </button>

        {/* 顶部极速急停 */}
        <button
          onClick={() => triggerEmergencyStop()}
          className="liquid-btn flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50/90 px-3 py-2 text-xs font-black text-rose-700 transition-all hover:bg-rose-100 active:scale-95 shadow-xs"
        >
          <span className="h-2 w-2 animate-ping rounded-full bg-rose-500" />
          急停
        </button>
      </div>
    </header>
  );
};
