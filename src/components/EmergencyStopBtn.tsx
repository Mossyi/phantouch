import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OctagonAlert, Check } from 'lucide-react';

export const FloatingEmergencyStop: React.FC = () => {
  const { triggerEmergencyStop, activeTab, deviceState } = useAppStore();
  const [isPressed, setIsPressed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  
  const timer1Ref = useRef<NodeJS.Timeout>();
  const timer2Ref = useRef<NodeJS.Timeout>();

  useEffect(() => {
    return () => {
      clearTimeout(timer1Ref.current);
      clearTimeout(timer2Ref.current);
    };
  }, []);

  // 顶栏始终具备吸顶急停按钮。在聊天/酒馆或硬件处于0功率待机时隐藏悬浮按钮，杜绝遮挡底部保存和操作按钮
  const isHardwareActive = Boolean(
    deviceState?.ems?.isShocking ||
    (deviceState?.ems?.strengthA ?? 0) > 0 ||
    (deviceState?.ems?.strengthB ?? 0) > 0 ||
    (deviceState?.toy?.motorA ?? 0) > 0 ||
    (deviceState?.toy?.motorB ?? 0) > 0 ||
    (deviceState?.toy?.motorC ?? 0) > 0 ||
    (deviceState?.enema?.waterPumpState ?? 0) > 0 ||
    (deviceState?.enema?.peristalticState ?? 0) > 0
  );

  const shouldShowButton = (activeTab !== 'chat' && activeTab !== 'tavern') && isHardwareActive;

  if (!shouldShowButton && !toast) {
    return null;
  }

  const handleClick = async () => {
    setIsPressed(true);
    const msg = await triggerEmergencyStop();
    setToast(msg);
    timer1Ref.current = setTimeout(() => setIsPressed(false), 300);
    timer2Ref.current = setTimeout(() => setToast(null), 3000);
  };

  return (
    <>
      {/* 悬浮右下急停按钮（仅在硬件活跃输出时唤醒） */}
      {shouldShowButton && (
        <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-3.5 z-50 animate-in fade-in zoom-in-75 duration-200">
          <button
            onClick={handleClick}
            className={`relative group flex items-center justify-center w-12 h-12 rounded-full shadow-2xl transition-all duration-200 border-2 ${
              isPressed
                ? 'scale-90 bg-red-800 border-white ring-4 ring-red-500'
                : 'bg-gradient-to-tr from-red-600 via-rose-600 to-red-500 hover:scale-105 active:scale-95 border-red-300 ring-2 ring-red-500/40 shadow-red-600/60'
            }`}
            title="紧急急停：一键切断所有电击与马达"
          >
            <OctagonAlert className="w-6 h-6 text-white animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
            </span>
          </button>
        </div>
      )}

      {/* 极速急停 Toast 提示 */}
      {toast && (
        <div className="liquid-glass fixed top-[calc(max(3.8rem,env(safe-area-inset-top,0px)+2.75rem))] left-1/2 -translate-x-1/2 z-50 border border-rose-300 text-rose-800 text-xs px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 animate-bounce font-bold">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{toast}</span>
        </div>
      )}
    </>
  );
};
