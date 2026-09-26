import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/useAppStore';
import { DeviceManager } from '../core/deviceManager';
import {
  ShieldAlert,
  Minimize2,
  X,
  Tv,
} from 'lucide-react';

export const FloatingPipWindow: React.FC = () => {
  const {
    floatingWindowState,
    setFloatingWindowState,
    deviceState,
    heartRateState,
    contractState,
    safetyConfig,
    triggerEmergencyStop,
  } = useAppStore();

  const orbRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // 1. 悬浮球屏幕坐标（独立维护，默认贴靠右下安全区，绝不与急停按钮重合）
  const [orbPos, setOrbPos] = useState<{ x: number; y: number }>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 390;
    const h = typeof window !== 'undefined' ? window.innerHeight : 844;
    return {
      x: Math.max(10, w - 64),
      y: Math.max(80, h - 170),
    };
  });

  // 2. 展开控制小窗坐标（独立维护，默认右侧舒适位置，杜绝坐标混用导致的飞出屏幕）
  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 390;
    const h = typeof window !== 'undefined' ? window.innerHeight : 844;
    return {
      x: Math.max(8, w - 298),
      y: Math.max(64, Math.min(h - 480, 110)),
    };
  });

  const [isDraggingOrb, setIsDraggingOrb] = useState(false);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);

  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    elemLeft: number;
    elemTop: number;
  }>({ pointerX: 0, pointerY: 0, elemLeft: 0, elemTop: 0 });

  const hasDraggedRef = useRef(false);

  // 画中画捕获专用 Canvas 与视频流
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const panelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipStreamRef = useRef<MediaStream | null>(null);

  const dev = DeviceManager.getInstance();
  const maxStrength = Math.max(deviceState.ems.strengthA, deviceState.ems.strengthB);
  const maxAllowedEms = Math.min(safetyConfig.maxEmsStrengthA, safetyConfig.maxEmsStrengthB);

  const runManualAction = (action: () => Promise<unknown>) => {
    if (contractState?.isActive) return;
    void action().catch((error) => console.warn('悬浮窗硬件动作失败:', error));
  };

  const stopPipStream = () => {
    pipStreamRef.current?.getTracks().forEach((track) => track.stop());
    pipStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // 屏幕尺寸变化或横竖屏切换时安全边界重对齐
  useEffect(() => {
    const handleResize = () => {
      setOrbPos((prev) => ({
        x: Math.max(8, Math.min(window.innerWidth - 62, prev.x)),
        y: Math.max(50, Math.min(window.innerHeight - 110, prev.y)),
      }));
      setPanelPos((prev) => ({
        x: Math.max(8, Math.min(window.innerWidth - 298, prev.x)),
        y: Math.max(50, Math.min(window.innerHeight - 360, prev.y)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 悬浮球拖拽触发
  const handleOrbDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    const isTouch = 'touches' in e;
    const clientX = isTouch ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = isTouch ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const rect = orbRef.current?.getBoundingClientRect();
    dragStartRef.current = {
      pointerX: clientX,
      pointerY: clientY,
      elemLeft: rect ? rect.left : orbPos.x,
      elemTop: rect ? rect.top : orbPos.y,
    };
    hasDraggedRef.current = false;
    setIsDraggingOrb(true);
  };

  // 展开面板标题栏拖拽触发
  const handlePanelDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    const isTouch = 'touches' in e;
    const clientX = isTouch ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = isTouch ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const rect = panelRef.current?.getBoundingClientRect();
    dragStartRef.current = {
      pointerX: clientX,
      pointerY: clientY,
      elemLeft: rect ? rect.left : panelPos.x,
      elemTop: rect ? rect.top : panelPos.y,
    };
    hasDraggedRef.current = false;
    setIsDraggingPanel(true);
  };

  // 统一平滑移动控制器（彻底阻止触摸拖拽触发网页底层滚动）
  const handleMove = useCallback(
    (e: TouchEvent | MouseEvent) => {
      if (!isDraggingOrb && !isDraggingPanel) return;

      const isTouch = 'touches' in e;
      const clientX = isTouch ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = isTouch ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      const deltaX = clientX - dragStartRef.current.pointerX;
      const deltaY = clientY - dragStartRef.current.pointerY;

      if (Math.hypot(deltaX, deltaY) > 5) {
        hasDraggedRef.current = true;
        // 关键修复：阻止页面原生滑动与下拉刷新
        if (isTouch && e.cancelable) {
          e.preventDefault();
        }
      }

      if (isDraggingOrb) {
        const orbSize = 54;
        const minX = 8;
        const maxX = window.innerWidth - orbSize - 8;
        const minY = 50; // 避开顶部状态栏
        const maxY = window.innerHeight - orbSize - 70; // 避开底部导航栏

        const nextX = Math.max(minX, Math.min(maxX, dragStartRef.current.elemLeft + deltaX));
        const nextY = Math.max(minY, Math.min(maxY, dragStartRef.current.elemTop + deltaY));
        setOrbPos({ x: nextX, y: nextY });
      } else if (isDraggingPanel) {
        const rect = panelRef.current?.getBoundingClientRect();
        const panelW = rect ? rect.width : 290;
        const panelH = rect ? rect.height : 420;

        const minX = 6;
        const maxX = Math.max(minX, window.innerWidth - panelW - 6);
        const minY = 48;
        const maxY = Math.max(minY, window.innerHeight - panelH - 12);

        const nextX = Math.max(minX, Math.min(maxX, dragStartRef.current.elemLeft + deltaX));
        const nextY = Math.max(minY, Math.min(maxY, dragStartRef.current.elemTop + deltaY));
        setPanelPos({ x: nextX, y: nextY });
      }
    },
    [isDraggingOrb, isDraggingPanel]
  );

  // 拖拽释放
  const handleEnd = useCallback(() => {
    if (isDraggingOrb) {
      setIsDraggingOrb(false);
      // 悬浮球释放时平滑吸附到最近的左侧或右侧
      setOrbPos((prev) => {
        const snapX = prev.x < window.innerWidth / 2 ? 10 : window.innerWidth - 54 - 10;
        return { x: snapX, y: prev.y };
      });
    }
    if (isDraggingPanel) {
      setIsDraggingPanel(false);
    }
  }, [isDraggingOrb, isDraggingPanel]);

  useEffect(() => {
    if (isDraggingOrb || isDraggingPanel) {
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
    } else {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    }
    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [isDraggingOrb, isDraggingPanel, handleMove, handleEnd]);

  // 画中画多合一波形渲染引擎（统一绘制心电、EMS脉冲、HUD参数）
  const drawMonitorHUD = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    offset: number
  ) => {
    const currentState = useAppStore.getState();
    const curHeart = currentState.heartRateState;
    const curDev = currentState.deviceState;
    const isLocked = currentState.contractState?.isActive;
    const curMaxStrength = Math.max(curDev.ems.strengthA, curDev.ems.strengthB);

    // 1. 深邃暗夜科幻 HUD 底色
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, 'rgba(236, 72, 153, 0.08)');
    bgGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. 极细柔光粉紫网格
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 36) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += 36) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // 3. 上半区：心电波形 (ECG Wave)
    const ecgMidY = h * 0.38;
    ctx.strokeStyle = curHeart.isConnected ? '#38bdf8' : 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = curHeart.isConnected ? 6 : 0;
    ctx.beginPath();

    const bpm = curHeart.currentBpm || 72;
    const cycleLen = Math.max(30, Math.round((60 / bpm) * 55));

    for (let x = 0; x < w; x++) {
      const cyclePos = (x + offset) % cycleLen;
      let ecgDelta = 0;
      if (cyclePos > 10 && cyclePos < 15) {
        ecgDelta = -22; // R 峰高突
      } else if (cyclePos >= 15 && cyclePos < 19) {
        ecgDelta = 9; // S 谷
      } else if (cyclePos > 24 && cyclePos < 32) {
        ecgDelta = -7; // T 峰
      } else {
        ecgDelta = Math.sin((x + offset) * 0.08) * 1.5;
      }
      const y = ecgMidY + ecgDelta;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 4. 下半区：EMS 微安脉冲波形 (Pulse Wave)
    const emsMidY = h * 0.73;
    ctx.strokeStyle = curMaxStrength > 0 ? '#f43f5e' : 'rgba(244, 63, 94, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = curMaxStrength > 0 ? 8 : 0;
    ctx.beginPath();

    const amp = curMaxStrength > 0 ? Math.min(26, 4 + (curMaxStrength / 100) * 22) : 2.5;
    for (let x = 0; x < w; x++) {
      const waveY =
        emsMidY +
        Math.sin((x * 0.08) - (offset * 0.08)) * amp * Math.cos((x * 0.02) + (offset * 0.04));
      if (x === 0) ctx.moveTo(x, waveY);
      else ctx.lineTo(x, waveY);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 5. 顶栏参数文字（严格使用 text-align，杜绝边缘裁切）
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.fillStyle = curHeart.isConnected ? '#fb7185' : '#94a3b8';
    ctx.fillText(curHeart.isConnected ? `💓 ${bpm} BPM` : '💓 心率未连接', 14, 24);

    ctx.textAlign = 'right';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    if (isLocked) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('🔒 契约锁权执行', w - 14, 24);
    } else {
      ctx.fillStyle = '#34d399';
      ctx.fillText('● 硬件实时监视', w - 14, 24);
    }

    // 6. 底栏参数文字
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.fillStyle = curMaxStrength > 0 ? '#f43f5e' : '#94a3b8';
    ctx.fillText(`⚡ EMS A:${curDev.ems.strengthA} B:${curDev.ems.strengthB}`, 14, h - 14);

    ctx.textAlign = 'right';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.fillStyle = curDev.toy.motorA > 0 ? '#d946ef' : '#94a3b8';
    ctx.fillText(`🌪️ 马达:${curDev.toy.motorA}档`, w - 14, h - 14);
  };

  // 动态 Canvas 动画帧渲染循环
  useEffect(() => {
    if (!floatingWindowState.isOpen) return;
    if (!floatingWindowState.isPipActive && !floatingWindowState.isExpanded) {
      return;
    }

    let animId: number;
    let offset = 0;

    const renderLoop = () => {
      offset += 2;

      // 绘制系统画中画抓流 Canvas
      if (pipCanvasRef.current && floatingWindowState.isPipActive) {
        const c = pipCanvasRef.current;
        const ctx = c.getContext('2d');
        if (ctx) drawMonitorHUD(ctx, c.width, c.height, offset);
      }

      // 绘制展开面板内的实时监视 Canvas
      if (panelCanvasRef.current && floatingWindowState.isExpanded) {
        const c = panelCanvasRef.current;
        const ctx = c.getContext('2d');
        if (ctx) drawMonitorHUD(ctx, c.width, c.height, offset);
      }

      animId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => cancelAnimationFrame(animId);
  }, [floatingWindowState.isOpen, floatingWindowState.isPipActive, floatingWindowState.isExpanded]);

  // 监听原生系统画中画退出
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleLeavePip = () => {
      stopPipStream();
      setFloatingWindowState({ isPipActive: false });
    };
    video.addEventListener('leavepictureinpicture', handleLeavePip);
    return () => {
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
      stopPipStream();
    };
  }, [setFloatingWindowState]);

  // 启动系统原生画中画 (Picture-in-Picture)
  const handleRequestSystemPip = async () => {
    try {
      const canvas = pipCanvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      if ((document as any).pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
        stopPipStream();
        setFloatingWindowState({ isPipActive: false });
        return;
      }

      if ((canvas as any).captureStream) {
        // 先绘制第一帧确保视频流具备有效画幅
        const ctx = canvas.getContext('2d');
        if (ctx) drawMonitorHUD(ctx, canvas.width, canvas.height, 0);

        const stream = (canvas as any).captureStream(30);
        stopPipStream();
        pipStreamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        await (video as any).requestPictureInPicture();
        setFloatingWindowState({ isPipActive: true });
      } else {
        alert('当前浏览器环境暂未支持 Canvas 画中画，已在应用内保持悬浮监视。');
      }
    } catch (err) {
      console.warn('开启系统画中画失败:', err);
      stopPipStream();
      setFloatingWindowState({ isPipActive: false });
    }
  };

  // 硬件操作快捷增减（安全限幅保护与多通道联动保持）
  const handleEmsStep = (delta: number) => {
    if (contractState?.isActive) return;
    const nextVal = Math.max(0, Math.min(maxAllowedEms, maxStrength + delta));
    useAppStore.setState((prev) => ({
      deviceState: {
        ...prev.deviceState,
        ems: { ...prev.deviceState.ems, strengthA: nextVal, strengthB: nextVal },
      },
    }));
    runManualAction(() => dev.setEmsStrength('AB', nextVal));
  };

  const handleEmsZero = () => {
    if (contractState?.isActive) return;
    useAppStore.setState((prev) => ({
      deviceState: {
        ...prev.deviceState,
        ems: { ...prev.deviceState.ems, strengthA: 0, strengthB: 0 },
      },
    }));
    runManualAction(() => dev.setEmsStrength('AB', 0));
  };

  const handleMotorStep = (delta: number) => {
    if (contractState?.isActive) return;
    const current = useAppStore.getState().deviceState.toy;
    const nextA = Math.max(0, Math.min(safetyConfig.maxToyMotorARate, current.motorA + delta));
    useAppStore.setState((prev) => ({
      deviceState: {
        ...prev.deviceState,
        toy: { ...prev.deviceState.toy, motorA: nextA },
      },
    }));
    runManualAction(() => dev.setToyMotor(nextA, current.motorB, current.motorC));
  };

  const handleStopMotor = () => {
    if (contractState?.isActive) return;
    useAppStore.setState((prev) => ({
      deviceState: {
        ...prev.deviceState,
        toy: { ...prev.deviceState.toy, motorA: 0, motorB: 0, motorC: 0 },
      },
    }));
    runManualAction(() => dev.setToyMotor(0, 0, 0));
  };

  if (!floatingWindowState.isOpen) {
    return null;
  }

  const content = (
    <>
      {/* 离线抓流 Canvas & Video（用于系统级画中画） */}
      <canvas
        ref={pipCanvasRef}
        width={480}
        height={270}
        className="fixed -left-[9999px] top-0 h-8 w-8 opacity-0 pointer-events-none"
      />
      <video
        ref={videoRef}
        width={480}
        height={270}
        className="fixed -left-[9999px] top-0 h-8 w-8 opacity-0 pointer-events-none"
        muted
        playsInline
      />

      {/* ================= 展开态：极简液态玻璃画中画小窗 ================= */}
      {floatingWindowState.isExpanded ? (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            left: panelPos.x,
            top: panelPos.y,
            width: 290,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'calc(100vh - 72px)',
            zIndex: 9999,
            transition: isDraggingPanel ? 'none' : 'box-shadow 0.2s',
          }}
          className="bg-white/95 backdrop-blur-2xl border border-pink-200/90 rounded-3xl p-3 shadow-[0_24px_50px_-10px_rgba(244,63,142,0.28)] flex flex-col select-none text-slate-800 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* 顶栏控制柄（抓握移动区） */}
          <div
            onMouseDown={handlePanelDragStart}
            onTouchStart={handlePanelDragStart}
            className="flex items-center justify-between cursor-move pb-2 border-b border-pink-100 touch-none select-none shrink-0"
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-ping"></span>
              <span className="text-xs font-black text-pink-950 flex items-center gap-1">
                📱 画中画控制台
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleRequestSystemPip}
                className={`p-1.5 rounded-xl transition-all ${
                  floatingWindowState.isPipActive
                    ? 'bg-pink-500 text-white shadow-xs'
                    : 'bg-pink-50 text-pink-700 hover:bg-pink-100'
                }`}
                title={floatingWindowState.isPipActive ? '退出系统级画中画' : '开启系统级画中画'}
              >
                <Tv className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setFloatingWindowState({ isExpanded: false })}
                className="p-1.5 rounded-xl bg-pink-50 text-pink-700 hover:bg-pink-100 transition-colors"
                title="折叠为悬浮球"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if ((document as any).pictureInPictureElement) void (document as any).exitPictureInPicture();
                  stopPipStream();
                  setFloatingWindowState({ isOpen: false, isExpanded: false, isPipActive: false });
                }}
                className="p-1.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                title="关闭悬浮窗"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 小窗可自适应滚动操作区（小屏手机友好） */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 mt-2 pr-0.5 scrollbar-none">
            {/* 小窗内嵌高精实时监视器 (480x270 视网膜缩放) */}
            <div className="w-full aspect-video rounded-2xl overflow-hidden border border-pink-200/80 shadow-inner bg-slate-950 shrink-0">
              <canvas ref={panelCanvasRef} width={480} height={270} className="w-full h-full object-cover" />
            </div>

            {/* 实时硬件指示药丸 */}
            <div className="grid grid-cols-3 gap-1.5 text-center shrink-0">
              <div className="bg-pink-50/70 p-1.5 rounded-2xl border border-pink-100">
                <span className="text-[9.5px] text-pink-900/60 font-bold block">💓 心率</span>
                <span className="text-xs font-mono font-black text-rose-600">
                  {heartRateState.isConnected ? `${heartRateState.currentBpm || '--'}` : '--'}
                </span>
              </div>
              <div className="bg-pink-50/70 p-1.5 rounded-2xl border border-pink-100">
                <span className="text-[9.5px] text-pink-900/60 font-bold block">⚡ 电击</span>
                <span className="text-xs font-mono font-black text-pink-600">
                  {maxStrength}
                </span>
              </div>
              <div className="bg-pink-50/70 p-1.5 rounded-2xl border border-pink-100">
                <span className="text-[9.5px] text-pink-900/60 font-bold block">🌪️ 马达</span>
                <span className="text-xs font-mono font-black text-fuchsia-600">
                  {deviceState.toy.motorA}
                </span>
              </div>
            </div>

            {/* 契约锁定告警 */}
            {contractState?.isActive && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[10.5px] font-bold text-amber-800 shrink-0">
                <span className="shrink-0">🔒</span>
                <span>契约锁权执行中 · 手动调控已受保护锁定</span>
              </div>
            )}

            {/* ⚡ 电击强度调控 */}
            <div className="space-y-1 bg-white/90 p-2 rounded-2xl border border-pink-100 shadow-xs shrink-0">
              <div className="flex justify-between items-center text-[10px] font-black text-pink-700">
                <span>⚡ 电击强度调控</span>
                <span className="font-mono text-pink-950 font-bold">A:{deviceState.ems.strengthA} B:{deviceState.ems.strengthB} (上限:{maxAllowedEms})</span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={contractState?.isActive}
                  onClick={() => handleEmsStep(-5)}
                  className="flex-1 py-1.5 rounded-xl bg-white hover:bg-pink-50 text-xs font-mono font-bold text-pink-950 border border-pink-200/90 shadow-2xs transition active:scale-95 disabled:opacity-40"
                >
                  -5
                </button>
                <button
                  type="button"
                  disabled={contractState?.isActive}
                  onClick={() => handleEmsStep(5)}
                  className="flex-1 py-1.5 rounded-xl bg-pink-100/90 hover:bg-pink-200 text-xs font-mono font-black text-pink-900 border border-pink-300 shadow-2xs transition active:scale-95 disabled:opacity-40"
                >
                  +5
                </button>
                <button
                  type="button"
                  disabled={contractState?.isActive}
                  onClick={handleEmsZero}
                  className="flex-1 py-1.5 rounded-xl bg-white hover:bg-pink-50 text-[10px] font-bold text-pink-900 border border-pink-200/90 shadow-2xs transition active:scale-95 disabled:opacity-40"
                >
                  归零
                </button>
                <button
                  type="button"
                  disabled={contractState?.isActive}
                  onClick={() => runManualAction(() => dev.sendEmsWave('AB', 'sawtooth_grind'))}
                  className="flex-1 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-[10px] font-bold text-pink-700 border border-pink-200/90 shadow-2xs transition active:scale-95 disabled:opacity-40"
                >
                  锯齿波
                </button>
              </div>
            </div>

            {/* 🌪️ 马达快速微调 */}
            <div className="space-y-1 bg-white/90 p-2 rounded-2xl border border-pink-100 shadow-xs shrink-0">
              <div className="flex justify-between items-center text-[10px] font-black text-pink-700">
                <span>🌪️ 飞机杯/跳蛋马达</span>
                <span className="font-mono text-pink-950 font-bold">A:{deviceState.toy.motorA} B:{deviceState.toy.motorB} C:{deviceState.toy.motorC}</span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={contractState?.isActive}
                  onClick={() => handleMotorStep(-2)}
                  className="flex-1 py-1.5 rounded-xl bg-white hover:bg-pink-50 text-xs font-mono font-bold text-pink-950 border border-pink-200/90 shadow-2xs transition active:scale-95 disabled:opacity-40"
                >
                  -2
                </button>
                <button
                  type="button"
                  disabled={contractState?.isActive}
                  onClick={() => handleMotorStep(2)}
                  className="flex-1 py-1.5 rounded-xl bg-pink-100/90 hover:bg-pink-200 text-xs font-mono font-black text-pink-900 border border-pink-300 shadow-2xs transition active:scale-95 disabled:opacity-40"
                >
                  +2
                </button>
                <button
                  type="button"
                  disabled={contractState?.isActive}
                  onClick={handleStopMotor}
                  className="flex-1 py-1.5 rounded-xl bg-white hover:bg-pink-50 text-[10px] font-bold text-pink-900 border border-pink-200/90 shadow-2xs transition active:scale-95 disabled:opacity-40"
                >
                  停机
                </button>
                <button
                  type="button"
                  disabled={contractState?.isActive}
                  onClick={() => runManualAction(() => dev.playToyPattern('nine_shallow_one_deep', 30))}
                  className="flex-1 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-[10px] font-bold text-pink-700 border border-pink-200/90 shadow-2xs transition active:scale-95 disabled:opacity-40"
                >
                  九浅一深
                </button>
              </div>
            </div>

            {/* 🛑 极速急停按钮 */}
            <button
              type="button"
              onClick={() => triggerEmergencyStop()}
              className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 text-white font-black text-xs shadow-md shadow-rose-500/25 flex items-center justify-center gap-1.5 active:scale-95 transition-all shrink-0"
            >
              <ShieldAlert className="w-4 h-4" /> 全局紧急停止
            </button>
          </div>
        </div>
      ) : (
        /* ================= 折叠态：微晶流体磁吸悬浮球 (Liquid Glass Magnet Orb) ================= */
        <div
          ref={orbRef}
          style={{
            position: 'fixed',
            left: orbPos.x,
            top: orbPos.y,
            zIndex: 9999,
            transition: isDraggingOrb ? 'none' : 'left 0.25s ease-out, transform 0.15s ease-out',
          }}
          onMouseDown={handleOrbDragStart}
          onTouchStart={handleOrbDragStart}
          onClick={() => {
            if (!hasDraggedRef.current) {
              setFloatingWindowState({ isExpanded: true });
            }
          }}
          className="w-[54px] h-[54px] rounded-full bg-gradient-to-br from-white via-pink-100 to-rose-200 border-2 border-white p-1 shadow-[0_12px_28px_rgba(244,63,142,0.35)] cursor-pointer flex flex-col items-center justify-center select-none active:scale-95 touch-none animate-in fade-in zoom-in-95 duration-150"
          title="点击展开画中画控制小窗"
        >
          <div className="w-full h-full rounded-full bg-white/95 flex flex-col items-center justify-center overflow-hidden relative shadow-inner">
            <span className="text-[13px] leading-none">
              {heartRateState.isConnected ? '💓' : maxStrength > 0 ? '⚡' : deviceState.toy.motorA > 0 ? '🌪️' : '🎮'}
            </span>
            <span className="text-[9px] font-mono font-black text-pink-600 leading-tight">
              {heartRateState.isConnected
                ? heartRateState.currentBpm
                : maxStrength > 0
                ? maxStrength
                : deviceState.toy.motorA > 0
                ? `${deviceState.toy.motorA}档`
                : 'PiP'}
            </span>
            {(maxStrength > 0 || deviceState.toy.motorA > 0) && (
              <div className="absolute inset-0 rounded-full border border-pink-400/40 animate-ping pointer-events-none"></div>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};
