import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { DeviceManager } from '../core/deviceManager';
import { TOY_PATTERNS } from '../core/protocol/toyPatterns';
import { ENEMA_PATTERNS } from '../core/protocol/enemaPatterns';
import { EMSWaveEngine } from '../core/protocol/waveEngine';
import { WaveVisualizer } from '../components/WaveVisualizer';
import { Play, Pause, Waves, Sparkles, Shield, Zap, Activity, Clock } from 'lucide-react';

export const PatternsView: React.FC = () => {
  const { deviceState, contractState } = useAppStore();
  const deviceManager = DeviceManager.getInstance();

  const [deviceTab, setDeviceTab] = useState<'toy' | 'ems' | 'enema'>('toy');
  const [selectedDuration, setSelectedDuration] = useState(30);

  // 分类筛选
  const [toyCategoryFilter, setToyCategoryFilter] = useState('all');
  const [emsChannelTarget, setEmsChannelTarget] = useState<'A' | 'B' | 'AB'>('AB');
  const [actionError, setActionError] = useState<string | null>(null);

  const toyPatterns = Object.values(TOY_PATTERNS);
  const enemaPatterns = Object.values(ENEMA_PATTERNS);
  const emsWaves = EMSWaveEngine.getAllWaves();

  const isToyRunning = !!deviceState.toy.activePattern;
  const isEnemaRunning = !!deviceState.enema.activePattern;

  const toyCategories = ['all', '基础预热', '拟真抽插', '真空吮吸', '高潮控制', '调教情境'];

  const filteredToyPatterns =
    toyCategoryFilter === 'all'
      ? toyPatterns
      : toyPatterns.filter((p) => p.category === toyCategoryFilter);

  const runManualAction = (action: () => Promise<unknown>, allowDuringContract: boolean = false) => {
    if (contractState.isActive && !allowDuringContract) {
      setActionError('契约锁权执行中，只允许停止当前输出。');
      return;
    }
    setActionError(null);
    void action()
      .then((res) => {
        if (typeof res === 'string' && (res.includes('拒绝执行') || res.includes('拒绝'))) {
          setActionError(res);
        }
      })
      .catch((error) => setActionError(error?.message || String(error)));
  };

  return (
    <div className="max-w-md mx-auto px-3.5 py-4 pb-28 space-y-4">
      {/* 顶部三大设备模式切换 */}
      <div className="flex items-center gap-1.5 p-1.5 bg-white/95 rounded-2xl border border-pink-100/90 shadow-[0_2px_10px_rgba(233,104,146,0.05)] backdrop-blur-md">
        <button
          onClick={() => setDeviceTab('toy')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            deviceTab === 'toy'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-pink-50/50'
          }`}
        >
          <Waves className="w-3.5 h-3.5" /> 飞机杯 ({toyPatterns.length})
        </button>
        <button
          onClick={() => setDeviceTab('ems')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            deviceTab === 'ems'
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-amber-600 hover:bg-amber-50/50'
          }`}
        >
          <Zap className="w-3.5 h-3.5" /> 电击波形 ({emsWaves.length})
        </button>
        <button
          onClick={() => setDeviceTab('enema')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            deviceTab === 'enema'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-emerald-600 hover:bg-emerald-50/50'
          }`}
        >
          <Shield className="w-3.5 h-3.5" /> 灌肠流程 ({enemaPatterns.length})
        </button>
      </div>

      {(contractState.isActive || actionError) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-800 font-medium shadow-xs">
          {actionError || '🔒 契约锁权执行中：启动和切换模式已禁用，停止按钮仍然可用。'}
        </div>
      )}

      {/* 正在运行的模式高亮卡片 */}
      {(isToyRunning || isEnemaRunning) && (
        <div className="bg-gradient-to-r from-pink-50 via-white to-rose-50/40 border-2 border-pink-400 rounded-3xl p-4 shadow-[0_8px_26px_rgba(233,104,146,0.14)] animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-pink-100 border border-pink-200 flex items-center justify-center text-pink-600 shadow-xs">
                <Sparkles className="w-5 h-5 text-pink-600 animate-spin" />
              </div>
              <div>
                <span className="text-[10px] text-pink-600 font-mono font-bold">正在执行律动模式</span>
                <h4 className="text-sm font-black text-slate-900">
                  {deviceState.toy.activePattern || deviceState.enema.activePattern}
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {deviceState.toy.patternRemainingSec > 0 && (
                <span className="text-xs font-mono font-bold text-pink-700 bg-pink-100 px-2.5 py-1 rounded-xl border border-pink-200 shadow-xs">
                  {deviceState.toy.patternRemainingSec}s 剩余
                </span>
              )}
              <button
                onClick={() => {
                  if (isToyRunning) runManualAction(() => deviceManager.stopToy(), true);
                  if (isEnemaRunning) runManualAction(() => deviceManager.stopEnema(), true);
                }}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-black px-3.5 py-1.5 rounded-xl active:scale-95 shadow-sm transition-all"
              >
                停止
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 1. 飞机杯 / 跳蛋 模式库 (30+) ================= */}
      {deviceTab === 'toy' && (
        <div className="space-y-3">
          {/* 分类筛选胶囊 */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {toyCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setToyCategoryFilter(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  toyCategoryFilter === cat
                    ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:text-pink-600 border border-pink-100/80 hover:bg-pink-50/50 shadow-2xs'
                }`}
              >
                {cat === 'all' ? '全部模式' : cat}
              </button>
            ))}
          </div>

          {/* 单次持续时间选择 */}
          <div className="flex items-center justify-between px-2 text-xs text-slate-600">
            <span className="font-bold">默认执行时长:</span>
            <div className="flex items-center gap-1.5">
              {[15, 30, 60, 120].map((sec) => (
                <button
                  key={sec}
                  onClick={() => setSelectedDuration(sec)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                    selectedDuration === sec
                      ? 'bg-pink-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-pink-100 hover:bg-pink-50/50'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {filteredToyPatterns.map((pattern) => {
              const isCurrent = deviceState.toy.activePattern === pattern.name;
              return (
                <div
                  key={pattern.id}
                  className={`p-3.5 rounded-3xl border transition-all ${
                    isCurrent
                      ? 'bg-pink-50/90 border-pink-400 shadow-md shadow-pink-500/10'
                      : 'bg-white/95 border-pink-100 hover:border-pink-300 hover:bg-pink-50/30 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-black text-slate-800 truncate">{pattern.name}</h4>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200 font-bold shrink-0">
                          {pattern.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{pattern.description}</p>
                    </div>

                    <button
                      onClick={() => {
                        if (isCurrent) runManualAction(() => deviceManager.stopToy(), true);
                        else runManualAction(() => deviceManager.playToyPattern(pattern.id, selectedDuration));
                      }}
                      className={`p-2.5 rounded-2xl text-white shadow-sm active:scale-95 transition-all shrink-0 ${
                        isCurrent
                          ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20'
                          : 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 shadow-pink-500/20'
                      }`}
                    >
                      {isCurrent ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= 2. 电击器 (EMS) 24+ 波形库 ================= */}
      {deviceTab === 'ems' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2 text-xs text-slate-600">
            <span className="font-bold">目标注入通道:</span>
            <div className="flex items-center gap-1.5">
              {(['A', 'B', 'AB'] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setEmsChannelTarget(ch)}
                  className={`px-3 py-1 rounded-xl text-xs font-black font-mono transition-all ${
                    emsChannelTarget === ch
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-amber-200/80 hover:bg-amber-50/50'
                  }`}
                >
                  通道 {ch}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {emsWaves.map((wave) => (
              <div
                key={wave.id}
                className="p-3.5 bg-white/95 border border-pink-100 hover:border-amber-400 hover:shadow-md rounded-3xl transition-all shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                    <div className="p-2 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-black text-slate-800 truncate">{wave.name}</h4>
                      <span className="text-[10px] text-slate-500 font-mono">
                        周期: {wave.durationMs}ms ({wave.data.length} 帧)
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => runManualAction(() => deviceManager.sendEmsWave(emsChannelTarget, wave.id))}
                    className="flex items-center gap-1 text-xs font-black px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 text-white shadow-sm active:scale-95 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> 注入
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 3. 智能灌肠机 16+ 流程库 ================= */}
      {deviceTab === 'enema' && (
        <div className="grid grid-cols-1 gap-2.5">
          {enemaPatterns.map((pattern) => {
            const isCurrent = deviceState.enema.activePattern === pattern.name;
            return (
              <div
                key={pattern.id}
                className={`p-3.5 rounded-3xl border transition-all ${
                  isCurrent
                    ? 'bg-emerald-50/90 border-emerald-400 shadow-md shadow-emerald-500/10'
                    : 'bg-white/95 border-pink-100 hover:border-emerald-300 rounded-3xl shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-black text-slate-800 truncate">{pattern.name}</h4>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold shrink-0">
                        {pattern.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{pattern.description}</p>
                  </div>

                  <button
                    onClick={() => {
                      if (isCurrent) runManualAction(() => deviceManager.stopEnema(), true);
                      else runManualAction(() => deviceManager.playEnemaPattern(pattern.id));
                    }}
                    className={`p-2.5 rounded-2xl text-white shadow-sm active:scale-95 transition-all shrink-0 ${
                      isCurrent
                        ? 'bg-rose-600 hover:bg-rose-500'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600'
                    }`}
                  >
                    {isCurrent ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
