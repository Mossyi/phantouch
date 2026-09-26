import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { PRESET_PERSONAS } from '../core/ai/personaPrompts';
import { BluetoothHelpModal } from '../components/BluetoothHelpModal';
import {
  Heart,
  Activity,
  Bluetooth,
  Flame,
  ShieldAlert,
  Zap,
  RotateCcw,
  Sparkles,
  Sliders,
  Play,
  Pause,
  Radio,
  HelpCircle,
} from 'lucide-react';

export const HeartRateView: React.FC = () => {
  const {
    heartRateState,
    connectHeartRateBle,
    startHeartRateSimulator,
    setSimulatedBpm,
    toggleHeartRateAdaptiveLoop,
    disconnectHeartRate,
    llmConfig,
    getAllPersonas,
    triggerEmergencyStop,
  } = useAppStore();

  const [showHelp, setShowHelp] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const allPersonas = getAllPersonas();
  const currentPersona =
    allPersonas.find((p) => p.id === llmConfig.selectedPersonaId) || PRESET_PERSONAS[0];

  const handleConnectBle = async () => {
    try {
      await connectHeartRateBle();
    } catch (e: any) {
      console.warn('连接蓝牙手环异常:', e);
    }
  };

  // 绘制动态心电波形
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let offset = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 背景微弱网格
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.2)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // 心电折线
      const pts = heartRateState.historyBpm;
      if (pts.length > 1) {
        ctx.beginPath();
        const minB = 50;
        const maxB = 180;

        ctx.strokeStyle =
          heartRateState.currentZone === 'edge_climax'
            ? '#f43f5e'
            : heartRateState.currentZone === 'excited'
            ? '#fbbf24'
            : '#06b6d4';
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 8;
        ctx.shadowColor = ctx.strokeStyle;

        pts.forEach((p, idx) => {
          const x = (idx / (pts.length - 1)) * canvas.width;
          const normalized = Math.max(0, Math.min(1, (p.bpm - minB) / (maxB - minB)));
          const y = canvas.height - normalized * (canvas.height - 20) - 10;
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      offset += 1;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [heartRateState.historyBpm, heartRateState.currentZone]);

  const getZoneInfo = () => {
    switch (heartRateState.currentZone) {
      case 'calm':
        return {
          label: '💤 平静走神区 (BPM < 85)',
          desc: '心率平稳，仅提供文字与语音提示；不会自动提高任何硬件强度。',
          color: 'text-cyan-800 border-cyan-200 bg-cyan-50/70',
          heartColor: 'text-cyan-500',
        };
      case 'excited':
        return {
          label: '🔥 渐入佳境区 (85 - 125 BPM)',
          desc: '身体处于兴奋渐进区间，硬件保持当前节奏稳定推进。',
          color: 'text-amber-800 border-amber-200 bg-amber-50/70',
          heartColor: 'text-amber-500',
        };
      case 'edge_climax':
        return {
          label: '🚨 高潮临界警戒区 (126 - 158 BPM)',
          desc: '心跳剧烈爆发！自动触发心率急刹断电，剥夺射精许可！',
          color: 'text-rose-700 border-rose-200 bg-rose-50/80 animate-pulse',
          heartColor: 'text-rose-500',
        };
      case 'overload_danger':
        return {
          label: '🛡️ 极限过载保护区 (BPM > 158)',
          desc: '心率达到安全阈值！立即锁定急停全部硬件，并关闭自适应控制。',
          color: 'text-purple-700 border-purple-200 bg-purple-50/80',
          heartColor: 'text-purple-500',
        };
    }
  };

  const zone = getZoneInfo();

  return (
    <div className="max-w-md mx-auto px-3.5 py-4 pb-28 space-y-4">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between p-3.5 bg-white/90 backdrop-blur-xl border border-pink-100 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-pink-50 text-pink-600 border border-pink-200">
            <Heart className="w-5 h-5 animate-pulse text-pink-500" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
              <span>蓝牙手环 · 实时心率闭环</span>
              <span className="text-[9px] bg-pink-50 text-pink-600 px-1.5 py-0.5 rounded-full border border-pink-200 font-mono">
                BLE HR
              </span>
            </h2>
            <p className="text-[10px] text-slate-500">读取手环心跳数据，AI 依据生理兴奋度自适应调控</p>
          </div>
        </div>
      </div>

      {/* 主监控卡片 */}
      <div className="bg-white/95 backdrop-blur-xl border border-pink-200/90 rounded-3xl p-5 shadow-[0_8px_30px_rgba(233,104,146,0.08)] space-y-4 relative overflow-hidden">
        {/* 连接状态与设备名称 */}
        <div className="flex items-center justify-between text-xs pb-2 border-b border-pink-100">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${heartRateState.isConnected ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
            <span className="font-bold text-slate-700">
              {heartRateState.isConnected ? heartRateState.deviceName : '未连接手环'}
            </span>
          </div>
          {heartRateState.isConnected && (
            <button
              onClick={() => disconnectHeartRate()}
              className="text-[10px] text-slate-400 hover:text-rose-500"
            >
              断开
            </button>
          )}
        </div>

        {/* 巨大发光心率表盘与心形跳动 */}
        <div className="flex items-center justify-around py-2">
          <div className="relative flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center animate-ping" />
            <Heart
              className={`w-12 h-12 ${zone.heartColor} absolute transition-transform duration-300`}
              style={{ transform: `scale(${1 + (heartRateState.currentBpm - 60) / 160})` }}
            />
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-500 font-mono block">实时心率 BPM</span>
            <div className="text-5xl font-black font-mono tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-pink-600 via-rose-500 to-purple-600">
              {heartRateState.currentBpm}
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              最低: {heartRateState.minBpm} | 最高: {heartRateState.maxBpm} | 平均: {heartRateState.avgBpm}
            </span>
          </div>
        </div>

        {/* 心电图折线 Canvas */}
        <div className="bg-slate-50/80 rounded-2xl border border-pink-100 p-2 overflow-hidden shadow-inner">
          <canvas ref={canvasRef} width={380} height={90} className="w-full h-[90px]" />
        </div>

        {/* 当前心率区间说明 */}
        <div className={`p-2.5 rounded-2xl border ${zone.color} text-center space-y-0.5 shadow-sm`}>
          <h4 className="text-xs font-black">{zone.label}</h4>
          <p className="text-[10px] opacity-80 leading-relaxed">{zone.desc}</p>
        </div>

        {/* AI 心率自适应闭环开关 */}
        <div className="bg-white/90 p-3 rounded-2xl border border-pink-100 flex items-center justify-between shadow-sm">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-pink-500" /> AI 心率自适应调控闭环
            </span>
            <p className="text-[10px] text-slate-500">
              由 {currentPersona.name} 依据心率实时自动加压或急刹
            </p>
          </div>
          <button
            onClick={() => toggleHeartRateAdaptiveLoop()}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm ${
              heartRateState.isAutoAdaptiveLoopActive
                ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-pink-500/20'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {heartRateState.isAutoAdaptiveLoopActive ? '已开启' : '已暂停'}
          </button>
        </div>

        {/* 模拟器心率手动调节 (若在模拟模式) */}
        {heartRateState.isSimulator && (
          <div className="bg-white/90 p-3 rounded-2xl border border-pink-100 space-y-1.5 shadow-sm">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-slate-700">模拟心率滑块调节:</span>
              <span className="font-mono font-bold text-pink-600">{heartRateState.currentBpm} BPM</span>
            </div>
            <input
              type="range"
              min={60}
              max={180}
              value={heartRateState.currentBpm}
              onChange={(e) => setSimulatedBpm(Number(e.target.value))}
              className="w-full accent-pink-500 h-2 bg-pink-100 rounded-lg cursor-pointer"
            />
          </div>
        )}

        {/* 连接按钮组 */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="py-3 px-3 rounded-2xl bg-pink-50/80 hover:bg-pink-100 text-pink-700 text-xs font-bold border border-pink-200 active:scale-95 flex items-center justify-center gap-1 transition"
              title="手机蓝牙开启指南"
            >
              <HelpCircle className="w-4 h-4 text-pink-500" />
              <span>指南</span>
            </button>

            <button
              onClick={handleConnectBle}
              className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-xs font-black shadow-md shadow-pink-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Bluetooth className="w-4 h-4" /> 🔍 搜索连接真实蓝牙手环
            </button>
          </div>

          <button
            onClick={() => startHeartRateSimulator()}
            className="w-full py-2.5 rounded-xl bg-pink-50 hover:bg-pink-100/70 text-pink-700 text-xs font-bold border border-pink-200 active:scale-95 flex items-center justify-center gap-1.5 transition-all"
          >
            <Sliders className="w-3.5 h-3.5 text-pink-500" /> 🎮 启动虚拟心率模拟器 (无手环也能体验)
          </button>
        </div>
      </div>

      {/* 实时心率自适应日志 */}
      <div className="bg-white border border-pink-100 rounded-2xl p-3.5 space-y-2 shadow-sm">
        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-pink-500" /> 心率自适应调控流水
        </h4>
        <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] font-mono pr-1">
          {heartRateState.historyLogs.length === 0 ? (
            <p className="text-slate-400 py-2 text-center">连接手环后，AI 将实时记录每一次心跳波动与调控响应...</p>
          ) : (
            heartRateState.historyLogs.map((log, i) => (
              <div key={i} className="text-slate-600 py-1 border-b border-pink-50">
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 蓝牙开启指南弹窗 */}
      <BluetoothHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
};
