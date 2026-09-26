import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { PRESET_PERSONAS } from '../core/ai/personaPrompts';
import {
  Ban,
  Activity,
  Flame,
  Snowflake,
  Trophy,
  Sliders,
  ShieldAlert,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  Volume2,
} from 'lucide-react';

export const EdgingView: React.FC = () => {
  const {
    edgingState,
    startEdgingSession,
    triggerEdgingBrake,
    stopEdgingSession,
    setEdgingSensitivity,
    deviceState,
    llmConfig,
    getAllPersonas,
    triggerEmergencyStop,
  } = useAppStore();

  const [selectedRounds, setSelectedRounds] = useState(3);
  const [sensitivityVal, setSensitivityVal] = useState(1.35);

  const allPersonas = getAllPersonas();
  const currentPersona =
    allPersonas.find((p) => p.id === llmConfig.selectedPersonaId) || PRESET_PERSONAS[0];

  const handleStart = () => {
    startEdgingSession(selectedRounds);
  };

  const handleSensitivityChange = (val: number) => {
    setSensitivityVal(val);
    setEdgingSensitivity(val);
  };

  const getPhaseInfo = () => {
    switch (edgingState.currentPhase) {
      case 'warming':
        return {
          label: '🔥 加温推进中 · 正在冲击临界',
          desc: '硬件正在以九浅一深与脉冲加压，传感器实时捕获括约肌收缩...',
          color: 'text-amber-800 border-amber-200 bg-amber-50/80',
        };
      case 'denying':
        return {
          label: '🚨 括约肌收缩捕获 · 物理急刹！',
          desc: '捕捉到射精前兆痉挛！毫秒级断电清零，强制剥夺高潮！',
          color: 'text-rose-700 border-rose-200 bg-rose-50/90 animate-pulse',
        };
      case 'cooldown':
        return {
          label: `❄️ 强制冷场中 (${edgingState.cooldownRemainingSec}s)`,
          desc: '深呼吸把手拿开，忍住快感，等待压力回落至平静基线...',
          color: 'text-cyan-800 border-cyan-200 bg-cyan-50/80',
        };
      case 'milking_release':
        return {
          label: '🏆 终极释放许可 · 全速榨干！',
          desc: '通关全部轮次！全通道马达 20 极速拉满，准许彻底释放！',
          color: 'text-pink-700 border-pink-200 bg-pink-50/90 animate-bounce',
        };
      case 'idle':
      default:
        return {
          label: '未启动特训',
          desc: '设定控射目标轮数，戴好肛塞传感器后开启',
          color: 'text-slate-500 border-pink-100 bg-pink-50/30',
        };
    }
  };

  const phase = getPhaseInfo();

  return (
    <div className="max-w-md mx-auto px-3.5 py-4 pb-28 space-y-4">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between p-3.5 bg-white border border-pink-100 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-pink-50 text-pink-600 border border-pink-200">
            <Ban className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
              <span>高潮剥夺 · 括约肌闭环控射</span>
              <span className="text-[9px] bg-pink-50 text-pink-600 px-1.5 py-0.5 rounded-full border border-pink-200 font-mono">
                BIO-DENIAL
              </span>
            </h2>
            <p className="text-[10px] text-slate-500">基于肛塞压力传感器捕捉射精前兆收缩，毫秒级急刹断电</p>
          </div>
        </div>
      </div>

      {/* ================= 特训进行中看板 ================= */}
      {edgingState.isActive ? (
        <div className="space-y-4">
          {/* 主控大表盘 */}
          <div className="bg-gradient-to-b from-white via-pink-50/40 to-white border border-pink-200 rounded-3xl p-5 shadow-[0_8px_30px_rgba(233,104,146,0.08)] space-y-4 relative overflow-hidden">
            {/* 顶栏阶段指示 */}
            <div className={`p-2.5 rounded-2xl border ${phase.color} text-center space-y-0.5 shadow-sm`}>
              <h3 className="text-xs font-black tracking-wide">{phase.label}</h3>
              <p className="text-[10px] opacity-80 leading-relaxed">{phase.desc}</p>
            </div>

            {/* 轮次大字进度 */}
            <div className="flex items-center justify-around py-2">
              <div className="text-center">
                <span className="text-[10px] text-slate-500 font-mono block">当前轮次</span>
                <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-rose-500 font-mono">
                  {edgingState.completedRounds} <span className="text-sm text-slate-400">/ {edgingState.targetRounds}</span>
                </span>
              </div>

              <div className="h-10 w-[1px] bg-pink-100" />

              <div className="text-center">
                <span className="text-[10px] text-pink-600 font-mono block">传感器自动急刹</span>
                <span className="text-3xl font-black text-purple-600 font-mono">
                  {edgingState.autoBrakeCount} <span className="text-sm text-slate-400">次</span>
                </span>
              </div>
            </div>

            {/* 欲望蓄力临界槽 (Arousal Bar) */}
            <div className="space-y-1.5 bg-white/90 p-3.5 rounded-2xl border border-pink-100 shadow-sm">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-pink-500 animate-pulse" /> 括约肌压力临界槽
                </span>
                <span className="font-mono font-black text-pink-600">{edgingState.arousalPercent}%</span>
              </div>

              <div className="w-full h-3.5 bg-pink-100/60 rounded-full overflow-hidden p-0.5 border border-pink-200/80">
                <div
                  className="h-full bg-gradient-to-r from-teal-400 via-amber-400 to-rose-500 rounded-full transition-all duration-300 shadow"
                  style={{ width: `${edgingState.arousalPercent}%` }}
                />
              </div>

              <div className="flex justify-between text-[9px] text-slate-500 font-mono pt-0.5">
                <span>实时压力: {edgingState.currentPressure || deviceState.enema.pressureA} hPa</span>
                <span>平静基线: {edgingState.baselinePressure || 120} hPa</span>
              </div>
            </div>

            {/* 手动【我快到了】急刹与安全急停 */}
            <div className="space-y-2 pt-1">
              {edgingState.currentPhase === 'warming' && (
                <button
                  onClick={() => triggerEdgingBrake()}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-sm font-black shadow-md shadow-pink-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <Ban className="w-5 h-5" /> ✋ 我快到了！(手动申请急刹剥夺)
                </button>
              )}

              <button
                onClick={() => triggerEmergencyStop()}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 active:scale-95 flex items-center justify-center gap-1.5 transition-all"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500" /> 紧急急停 · 中断特训
              </button>
            </div>
          </div>

          {/* 实时特训流水日志 */}
          <div className="bg-white border border-pink-100 rounded-2xl p-3.5 space-y-2 shadow-sm">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-pink-500" /> 括约肌生理监测日志
            </h4>
            <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] font-mono pr-1">
              {edgingState.historyLogs.length === 0 ? (
                <p className="text-slate-400 py-2 text-center">传感器实时校准中，请保持放松...</p>
              ) : (
                edgingState.historyLogs.map((log, i) => (
                  <div key={i} className="text-slate-600 py-1 border-b border-pink-50">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ================= 未启动：参数配置卡片 ================= */
        <div className="space-y-4">
          <div className="bg-white border border-pink-200 rounded-3xl p-5 space-y-4 shadow-[0_8px_30px_rgba(233,104,146,0.08)]">
            <div className="flex items-center gap-2 pb-3 border-b border-pink-100">
              <span className="text-2xl">{currentPersona.avatar}</span>
              <div>
                <h3 className="text-xs font-bold text-slate-800">
                  {currentPersona.name} 的边缘控射特训
                </h3>
                <p className="text-[10px] text-pink-600 font-medium">戴好肛塞传感器，体验生理级全自动急刹</p>
              </div>
            </div>

            {/* 1. 目标轮数选择 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-500" /> 1. 必须挺过的高潮剥夺轮数
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[2, 3, 5, 10].map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRounds(r)}
                    className={`py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                      selectedRounds === r
                        ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
                        : 'bg-pink-50/50 text-slate-600 hover:bg-pink-50 border border-pink-100'
                    }`}
                  >
                    {r} 轮
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 括约肌收紧识别灵敏度 */}
            <div className="space-y-1.5 bg-pink-50/40 p-3 rounded-2xl border border-pink-100">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-pink-500" /> 2. 括约肌收缩灵敏度: {sensitivityVal}x
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {sensitivityVal <= 1.25 ? '超敏感 (微颤即刹)' : sensitivityVal >= 1.5 ? '硬核 (强力夹紧才刹)' : '标准推荐'}
                </span>
              </div>
              <input
                type="range"
                min={1.18}
                max={1.65}
                step={0.02}
                value={sensitivityVal}
                onChange={(e) => handleSensitivityChange(Number(e.target.value))}
                className="w-full accent-pink-500 h-2 bg-pink-100 rounded-lg cursor-pointer mt-1"
              />
            </div>

            {/* 3. 生理闭环原理说明 */}
            <div className="bg-pink-50/40 p-3.5 rounded-2xl border border-pink-100 text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
              <p className="font-bold text-slate-800">💡 括约肌高潮识别原理：</p>
              <p>• 射精临界点时，盆底 PC 肌与肛门括约肌会发生特征性剧烈收缩。</p>
              <p>• 肛塞传感器捕捉到压力突增时，<strong className="text-pink-600">0.05 秒内自动掐断所有马达与电击</strong>。</p>
              <p>• 经历设定的全部轮次后，AI 将启动全速榨干模式作为通关奖赏！</p>
            </div>

            {/* 启动按钮 */}
            <button
              onClick={handleStart}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 hover:from-pink-600 text-white text-sm font-black shadow-md shadow-pink-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" /> 🚀 启动高潮剥夺闭环特训
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
