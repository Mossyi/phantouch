import React, { useState, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { DeviceManager } from '../core/deviceManager';
import { EMSWaveEngine } from '../core/protocol/waveEngine';
import { WaveVisualizer } from '../components/WaveVisualizer';
import { MotorGauge } from '../components/MotorGauge';
import { Zap, Activity, Gauge, Flame, StopCircle, RefreshCw, Plus, Minus, ArrowUp, ArrowDown, Tv, ShieldCheck } from 'lucide-react';

export const ControlView: React.FC = () => {
  const {
    deviceState,
    contractState,
    setActiveTab,
    floatingWindowState,
    toggleFloatingWindow,
    safetyConfig,
    setSafetyConfig,
  } = useAppStore();
  const deviceManager = DeviceManager.getInstance();

  const [localStrengthA, setLocalStrengthA] = useState<number>(deviceState.ems.strengthA);
  const [localStrengthB, setLocalStrengthB] = useState<number>(deviceState.ems.strengthB);

  React.useEffect(() => {
    setLocalStrengthA(deviceState.ems.strengthA);
  }, [deviceState.ems.strengthA]);

  React.useEffect(() => {
    setLocalStrengthB(deviceState.ems.strengthB);
  }, [deviceState.ems.strengthB]);

  const [activeCategory, setActiveCategory] = useState<'ems' | 'toy' | 'enema'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('category');
      if (cat === 'toy' || cat === 'enema' || cat === 'ems') return cat;
    } catch {
      // fallback
    }
    return 'ems';
  });
  const [safetyExpanded, setSafetyExpanded] = useState(false);
  const [selectedWaveA, setSelectedWaveA] = useState('breathe');
  const [selectedWaveB, setSelectedWaveB] = useState('tide');
  const [enemaDuration, setEnemaDuration] = useState(10);
  const [actionError, setActionError] = useState<string | null>(null);

  const builtinWaves = EMSWaveEngine.getAllWaves();

  const isActionRunningRef = useRef(false);

  const runManualAction = (action: () => Promise<unknown>) => {
    if (contractState?.isActive) {
      setActionError('契约锁权执行中，手动启动与调节已禁用。');
      return;
    }
    if (isActionRunningRef.current) return;
    isActionRunningRef.current = true;
    setActionError(null);
    void action()
      .then((res) => {
        if (typeof res === 'string' && (res.includes('拒绝执行') || res.includes('拒绝'))) {
          setActionError(res);
        }
      })
      .catch((error) => setActionError(error?.message || String(error)))
      .finally(() => {
        isActionRunningRef.current = false;
      });
  };

  // EMS 手动控制
  const handleStrengthChange = (channel: 'A' | 'B', val: number) => {
    if (contractState?.isActive) {
      setActionError('契约锁权执行中，手动启动与调节已禁用。');
      return;
    }
    if (safetyConfig.emergencyLock && val > 0) {
      setActionError('急停锁已激活，解除锁定前不能启动 EMS。');
      return;
    }
    const channelLimit = channel === 'A' ? safetyConfig.maxEmsStrengthA : safetyConfig.maxEmsStrengthB;
    const clamped = Math.max(0, Math.min(channelLimit, Math.round(val)));
    if (channel === 'A') {
      setLocalStrengthA(clamped);
    } else {
      setLocalStrengthB(clamped);
    }
    // 乐观立即刷新 UI
    const current = useAppStore.getState().deviceState;
    if (channel === 'A') {
      useAppStore.setState({
        deviceState: { ...current, ems: { ...current.ems, strengthA: clamped, isShocking: clamped > 0 || current.ems.strengthB > 0 } }
      });
    } else {
      useAppStore.setState({
        deviceState: { ...current, ems: { ...current.ems, strengthB: clamped, isShocking: clamped > 0 || current.ems.strengthA > 0 } }
      });
    }
    runManualAction(() => deviceManager.setEmsStrength(channel, clamped));
  };

  const handleQuickFire = (channel: 'A' | 'B' | 'AB', delta: number) => {
    if (contractState?.isActive) {
      setActionError('契约锁权执行中，手动启动与调节已禁用。');
      return;
    }
    if (safetyConfig.emergencyLock && delta > 0) {
      setActionError('急停锁已激活，解除锁定前不能启动 EMS。');
      return;
    }
    const current = useAppStore.getState().deviceState;
    const nextA = channel === 'A' || channel === 'AB'
      ? Math.min(safetyConfig.maxEmsStrengthA, Math.max(0, localStrengthA + delta))
      : current.ems.strengthA;
    const nextB = channel === 'B' || channel === 'AB'
      ? Math.min(safetyConfig.maxEmsStrengthB, Math.max(0, localStrengthB + delta))
      : current.ems.strengthB;

    if (channel === 'A' || channel === 'AB') setLocalStrengthA(nextA);
    if (channel === 'B' || channel === 'AB') setLocalStrengthB(nextB);

    useAppStore.setState({
      deviceState: { ...current, ems: { ...current.ems, strengthA: nextA, strengthB: nextB, isShocking: nextA > 0 || nextB > 0 } }
    });

    runManualAction(async () => {
      if (channel === 'A' || channel === 'AB') {
        await deviceManager.setEmsStrength('A', nextA);
      }
      if (channel === 'B' || channel === 'AB') {
        await deviceManager.setEmsStrength('B', nextB);
      }
    });
  };

  // Toy 马达控制
  const handleMotorChange = (mKey: 'A' | 'B' | 'C', val: number) => {
    if (contractState?.isActive) {
      setActionError('契约锁权执行中，手动启动与调节已禁用。');
      return;
    }
    if (safetyConfig.emergencyLock && val > 0) {
      setActionError('急停锁已激活，解除锁定前不能启动马达。');
      return;
    }
    const motorLimit = mKey === 'A'
      ? safetyConfig.maxToyMotorARate
      : mKey === 'B'
        ? safetyConfig.maxToyMotorBRate
        : safetyConfig.maxToyMotorCRate;
    const clamped = Math.max(0, Math.min(motorLimit, Math.round(val)));
    const current = useAppStore.getState().deviceState;
    const mA = mKey === 'A' ? clamped : current.toy.motorA;
    const mB = mKey === 'B' ? clamped : current.toy.motorB;
    const mC = mKey === 'C' ? clamped : current.toy.motorC;
    useAppStore.setState({
      deviceState: { ...current, toy: { ...current.toy, motorA: mA, motorB: mB, motorC: mC } }
    });
    runManualAction(() => deviceManager.setToyMotor(mA, mB, mC));
  };

  return (
    <div className="max-w-md mx-auto px-3.5 py-4 pb-10 space-y-4">

      <section className="liquid-card overflow-hidden">
        <div className="flex items-center gap-3 p-3.5">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${safetyConfig.emergencyLock ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h2 className="text-sm font-black text-pink-950">输出保护</h2><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${safetyConfig.emergencyLock ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{safetyConfig.emergencyLock ? '已锁定' : '正常'}</span></div>
            <p className="mt-0.5 truncate text-[10px] text-pink-800/65">所有手动与自动输出统一受此上限约束</p>
          </div>
          <button type="button" onClick={() => toggleFloatingWindow()} aria-label={floatingWindowState.isOpen ? '关闭悬浮窗' : '开启悬浮窗'} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${floatingWindowState.isOpen ? 'border-pink-300 bg-pink-100 text-pink-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}><Tv className="h-4 w-4" /></button>
          <button type="button" aria-expanded={safetyExpanded} onClick={() => setSafetyExpanded((value) => !value)} className="shrink-0 rounded-xl bg-pink-50 px-3 py-2 text-[10px] font-black text-pink-700">{safetyExpanded ? '收起' : '调整'}</button>
        </div>

        <div className="grid grid-cols-3 border-t border-white/80 bg-white/40 backdrop-blur-md text-center">
          <div className="px-2 py-2.5"><p className="text-[9px] font-bold text-slate-400">EMS 随机</p><p className="mt-0.5 font-mono text-[11px] font-black text-pink-700">{safetyConfig.minEmsStrength}–{Math.min(safetyConfig.maxEmsStrengthA, safetyConfig.maxEmsStrengthB)}</p></div>
          <div className="border-x border-white/80 px-2 py-2.5"><p className="text-[9px] font-bold text-slate-400">马达随机</p><p className="mt-0.5 font-mono text-[11px] font-black text-pink-700">{safetyConfig.minToyMotorRate}–{Math.max(safetyConfig.maxToyMotorARate, safetyConfig.maxToyMotorBRate, safetyConfig.maxToyMotorCRate)}</p></div>
          <div className="px-2 py-2.5"><p className="text-[9px] font-bold text-slate-400">水泵时长</p><p className="mt-0.5 font-mono text-[11px] font-black text-pink-700">{safetyConfig.minEnemaDurationSec}–{safetyConfig.maxEnemaDurationSec}s</p></div>
        </div>

        {safetyConfig.emergencyLock && <div className="flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-3.5 py-2.5"><p className="text-[10px] font-bold text-amber-700">急停锁已阻止全部输出</p><button type="button" onClick={() => setSafetyConfig({ emergencyLock: false })} className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-[10px] font-black text-white">解除锁定</button></div>}

        {safetyExpanded && <div className="space-y-3 border-t border-white/80 p-3.5">
          <div className="space-y-3 rounded-2xl bg-white/50 backdrop-blur-md border border-white/80 p-3 shadow-xs">
            <div className="flex items-center justify-between"><span className="text-xs font-black text-pink-700">EMS 上限</span><span className="font-mono text-[9px] text-pink-600">随机下限 {safetyConfig.minEmsStrength}</span></div>
            {([['A', safetyConfig.maxEmsStrengthA, 'maxEmsStrengthA'], ['B', safetyConfig.maxEmsStrengthB, 'maxEmsStrengthB']] as const).map(([channel, value, key]) => <label key={channel} className="block text-[10px] font-bold text-slate-600"><span className="flex justify-between"><span>通道 {channel}</span><span className="font-mono text-pink-600">{value} / 200</span></span><input aria-label={`电击通道 ${channel} 最大安全强度`} type="range" min="0" max="200" value={value} onChange={(event) => setSafetyConfig({ [key]: Number(event.target.value) })} className="mt-1 h-2 w-full accent-pink-500" /></label>)}
            <label className="block text-[10px] font-bold text-slate-600"><span className="flex justify-between"><span>随机下限</span><span className="font-mono text-amber-600">{safetyConfig.minEmsStrength}</span></span><input aria-label="自动电击随机下限" type="range" min="0" max="200" value={safetyConfig.minEmsStrength} onChange={(event) => setSafetyConfig({ minEmsStrength: Number(event.target.value) })} className="mt-1 h-2 w-full accent-amber-500" /></label>
          </div>
          <div className="space-y-3 rounded-2xl bg-white/50 backdrop-blur-md border border-white/80 p-3 shadow-xs">
            <div className="flex items-center justify-between"><span className="text-xs font-black text-slate-700">马达上限</span><span className="font-mono text-[9px] text-pink-600">随机下限 {safetyConfig.minToyMotorRate}</span></div>
            {([['A', safetyConfig.maxToyMotorARate, 'maxToyMotorARate'], ['B', safetyConfig.maxToyMotorBRate, 'maxToyMotorBRate'], ['C', safetyConfig.maxToyMotorCRate, 'maxToyMotorCRate']] as const).map(([channel, value, key]) => <label key={channel} className="block text-[10px] font-bold text-slate-600"><span className="flex justify-between"><span>通道 {channel}</span><span className="font-mono text-pink-600">{value} / 20</span></span><input aria-label={`玩具 ${channel} 通道上限`} type="range" min="0" max="20" value={value} onChange={(event) => setSafetyConfig({ [key]: Number(event.target.value) })} className="mt-1 h-2 w-full accent-pink-500" /></label>)}
            <label className="block text-[10px] font-bold text-slate-600"><span className="flex justify-between"><span>随机下限</span><span className="font-mono text-amber-600">{safetyConfig.minToyMotorRate}</span></span><input aria-label="自动榨精随机下限" type="range" min="0" max={Math.max(safetyConfig.maxToyMotorARate, safetyConfig.maxToyMotorBRate, safetyConfig.maxToyMotorCRate)} value={safetyConfig.minToyMotorRate} onChange={(event) => setSafetyConfig({ minToyMotorRate: Number(event.target.value) })} className="mt-1 h-2 w-full accent-amber-500" /></label>
          </div>
          <div className="rounded-2xl bg-white/50 backdrop-blur-md border border-white/80 p-3 shadow-xs"><div className="flex items-center justify-between text-xs"><span className="font-black text-slate-700">水泵时长</span><span className="font-mono font-bold text-pink-600">{safetyConfig.minEnemaDurationSec}–{safetyConfig.maxEnemaDurationSec}s</span></div><div className="mt-2 grid grid-cols-2 gap-3"><label className="text-[10px] font-bold text-slate-600">最短<input aria-label="灌肠自动最短时长" type="range" min="0" max={safetyConfig.maxEnemaDurationSec} value={safetyConfig.minEnemaDurationSec} onChange={(event) => setSafetyConfig({ minEnemaDurationSec: Number(event.target.value) })} className="mt-1 w-full accent-pink-500" /></label><label className="text-[10px] font-bold text-slate-600">最长<input aria-label="灌肠自动最长时长" type="range" min="0" max="60" value={safetyConfig.maxEnemaDurationSec} onChange={(event) => setSafetyConfig({ maxEnemaDurationSec: Number(event.target.value) })} className="mt-1 w-full accent-pink-500" /></label></div></div>
        </div>}
      </section>

      {/* 契约锁权执行中醒目横幅 (支持一键立即解锁) */}
      {contractState?.isActive && (
        <div className="bg-gradient-to-r from-pink-50 via-rose-50/60 to-white border border-pink-200 rounded-3xl p-4 shadow-[0_4px_20px_rgba(233,104,146,0.06)] flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="text-2xl shrink-0">🔒</span>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <span>契约锁权执行中</span>
                <span className="text-[9px] bg-pink-100 text-pink-700 border border-pink-200 px-1.5 py-0.5 rounded-full font-mono font-bold">
                  {Math.floor(contractState.remainingSeconds / 60)}分{contractState.remainingSeconds % 60}秒
                </span>
              </h4>
              <p className="text-[10.5px] text-pink-800/80 truncate">手动调节已被锁定，可点击右侧随时解除</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                useAppStore.getState().stopDisciplineContract();
                setActionError(null);
              }}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm active:scale-95 transition-all"
            >
              🔓 一键解锁
            </button>
            <button
              onClick={() => setActiveTab('contract')}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-xl bg-white text-pink-700 border border-pink-200 hover:bg-pink-50"
            >
              详情
            </button>
          </div>
        </div>
      )}
      {actionError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs text-rose-800 flex items-center justify-between shadow-xs">
          <span className="flex-1 mr-2 font-medium">⚠️ {actionError}</span>
          <button
            onClick={() => {
              useAppStore.getState().stopDisciplineContract();
              setSafetyConfig({ emergencyLock: false });
              setActionError(null);
            }}
            className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-rose-600 text-white shadow active:scale-95 shrink-0"
          >
            强制解锁
          </button>
        </div>
      )}

      {/* 顶部设备分类筛选 (Apple Liquid Pill Track) */}
      <div className="liquid-pill-track grid grid-cols-3 gap-1 p-1">
        {[
          { id: 'ems', label: 'EMS' },
          { id: 'toy', label: '马达' },
          { id: 'enema', label: '水泵' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveCategory(tab.id as 'ems' | 'toy' | 'enema')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all active:scale-95 ${
              activeCategory === tab.id
                ? 'liquid-pill-active'
                : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ================= EMS 电击器控制区 ================= */}
      {activeCategory === 'ems' && (
        <section className="liquid-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-2xl bg-amber-100 text-amber-700 border border-amber-300 shadow-sm">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-pink-950">电击器 (EMS 双通道)</h3>
                <p className="text-[10px] text-pink-800/70">独立微安级电脉冲与波形控制 (0-200 满档)</p>
              </div>
            </div>

            <button
              onClick={() => handleQuickFire('AB', 10)}
              className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 text-white shadow-sm active:scale-95 transition-all"
            >
              <Zap className="w-3.5 h-3.5" /> 双通开火 (+10)
            </button>
          </div>

          {/* 通道 A 控制 */}
          <div className="bg-white/55 backdrop-blur-md p-3.5 rounded-2xl border border-white/85 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-pink-950">通道 A 强度: {localStrengthA}</span>
              <span className="text-[10px] text-pink-800 font-mono font-bold bg-pink-100 px-2 py-0.5 rounded-full border border-pink-200">
                上限 {safetyConfig.maxEmsStrengthA}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleStrengthChange('A', Math.max(0, localStrengthA - 5))}
                className="liquid-btn w-10 h-10 rounded-2xl bg-white/85 backdrop-blur-md border border-white/90 flex items-center justify-center text-pink-900 font-black text-base active:scale-90 shadow-xs shrink-0 cursor-pointer select-none"
                aria-label="降低通道A强度"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={0}
                max={safetyConfig.maxEmsStrengthA}
                value={localStrengthA}
                onChange={(e) => handleStrengthChange('A', Number(e.target.value))}
                className="flex-1 accent-pink-500 h-2.5 bg-pink-200 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => handleStrengthChange('A', Math.min(safetyConfig.maxEmsStrengthA, localStrengthA + 5))}
                className="liquid-btn w-10 h-10 rounded-2xl bg-white/85 backdrop-blur-md border border-white/90 flex items-center justify-center text-pink-900 font-black text-base active:scale-90 shadow-xs shrink-0 cursor-pointer select-none"
                aria-label="增加通道A强度"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* 波形示波器 */}
            <WaveVisualizer channel="A" strength={localStrengthA} activeWaveName={deviceState.ems.activeWaveA} height={60} />

            {/* 波形发送 */}
            <div className="flex items-center gap-2 pt-1">
              <select
                value={selectedWaveA}
                onChange={(e) => setSelectedWaveA(e.target.value)}
                className="flex-1 bg-white border border-pink-300 text-pink-950 text-xs rounded-xl px-2.5 py-2 outline-none font-medium shadow-sm"
              >
                {builtinWaves.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => runManualAction(() => deviceManager.sendEmsWave('A', selectedWaveA))}
                className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl active:scale-95 shadow-sm"
              >
                注入波形
              </button>
            </div>
          </div>

          {/* 通道 B 控制 */}
          <div className="bg-white/55 backdrop-blur-md p-3.5 rounded-2xl border border-white/85 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-pink-950">通道 B 强度: {localStrengthB}</span>
              <span className="text-[10px] text-pink-800 font-mono font-bold bg-pink-100 px-2 py-0.5 rounded-full border border-pink-200">
                上限 {safetyConfig.maxEmsStrengthB}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleStrengthChange('B', Math.max(0, localStrengthB - 5))}
                className="liquid-btn w-10 h-10 rounded-2xl bg-white/85 backdrop-blur-md border border-white/90 flex items-center justify-center text-pink-900 font-black text-base active:scale-90 shadow-xs shrink-0 cursor-pointer select-none"
                aria-label="降低通道B强度"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={0}
                max={safetyConfig.maxEmsStrengthB}
                value={localStrengthB}
                onChange={(e) => handleStrengthChange('B', Number(e.target.value))}
                className="flex-1 accent-pink-500 h-2.5 bg-pink-200 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => handleStrengthChange('B', Math.min(safetyConfig.maxEmsStrengthB, localStrengthB + 5))}
                className="liquid-btn w-10 h-10 rounded-2xl bg-white/85 backdrop-blur-md border border-white/90 flex items-center justify-center text-pink-900 font-black text-base active:scale-90 shadow-xs shrink-0 cursor-pointer select-none"
                aria-label="增加通道B强度"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* 波形示波器 */}
            <WaveVisualizer channel="B" strength={localStrengthB} activeWaveName={deviceState.ems.activeWaveB} height={60} />

            {/* 波形发送 */}
            <div className="flex items-center gap-2 pt-1">
              <select
                value={selectedWaveB}
                onChange={(e) => setSelectedWaveB(e.target.value)}
                className="flex-1 bg-white border border-pink-300 text-pink-950 text-xs rounded-xl px-2.5 py-2 outline-none font-medium shadow-sm"
              >
                {builtinWaves.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => runManualAction(() => deviceManager.sendEmsWave('B', selectedWaveB))}
                className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl active:scale-95 shadow-sm"
              >
                注入波形
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ================= 飞机杯 / 跳蛋 (Toy) 控制区 ================= */}
      {activeCategory === 'toy' && (
        <section className="liquid-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-2xl bg-pink-100 text-pink-700 border border-pink-300 shadow-sm">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-pink-950">飞机杯 / 跳蛋 (三马达)</h3>
                <p className="text-[10px] text-pink-800/70">独立抽插、吮吸与旋转无级调速</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => runManualAction(() => deviceManager.triggerTurbo(5))}
              className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 text-white shadow-sm active:scale-95 transition-all"
            >
              <Flame className="w-3.5 h-3.5 animate-bounce" /> 一键安全满档
            </button>
          </div>

          {/* 三马达仪表盘 */}
          <div className="grid grid-cols-3 gap-2">
            <MotorGauge label="马达 A (主抽插)" value={deviceState.toy.motorA} color="#ec4899" />
            <MotorGauge label="马达 B (吮吸)" value={deviceState.toy.motorB} color="#f43f5e" />
            <MotorGauge label="马达 C (旋转)" value={deviceState.toy.motorC} color="#d946ef" />
          </div>

          {/* 马达滑块列表 */}
          <div className="bg-white/55 backdrop-blur-md p-3.5 rounded-2xl border border-white/85 shadow-xs space-y-3">
            {[
              { key: 'A', name: '马达 A (主抽插 / 震动)', val: deviceState.toy.motorA, max: safetyConfig.maxToyMotorARate, color: 'accent-pink-500' },
              { key: 'B', name: '马达 B (吮吸 / 夹紧)', val: deviceState.toy.motorB, max: safetyConfig.maxToyMotorBRate, color: 'accent-rose-500' },
              { key: 'C', name: '马达 C (旋转 / 绞磨)', val: deviceState.toy.motorC, max: safetyConfig.maxToyMotorCRate, color: 'accent-purple-500' },
            ].map((m) => (
              <div key={m.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-pink-950 font-bold">{m.name}</span>
                  <span className="font-mono font-bold text-pink-900">{m.val} / {m.max}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={m.max}
                  value={m.val}
                  onChange={(e) => handleMotorChange(m.key as any, Number(e.target.value))}
                  className={`w-full ${m.color} h-2.5 bg-pink-200 rounded-lg cursor-pointer`}
                />
              </div>
            ))}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => void deviceManager.stopToy().catch((error) => setActionError(error?.message || String(error)))}
                className="w-full py-2.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-900 text-xs font-bold border border-pink-300 transition-all active:scale-95 shadow-sm"
              >
                停止所有马达
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ================= 智能灌肠机 (Enema) 控制区 ================= */}
      {activeCategory === 'enema' && (
        <section className="liquid-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-2xl bg-emerald-100 text-emerald-700 border border-emerald-300 shadow-sm">
                <Gauge className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-pink-950">智能灌肠机 (GCQ)</h3>
                <p className="text-[10px] text-pink-800/70">蠕动注水/回抽与实时水压监测</p>
              </div>
            </div>

            <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 shadow-sm">
              电量: {deviceState.enema.battery}%
            </span>
          </div>

          {/* 实时压力指示 */}
          <div className="grid grid-cols-2 gap-2 bg-white/55 backdrop-blur-md p-3.5 rounded-2xl border border-white/85 shadow-xs">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-pink-800 font-medium">通道 A 压力值</span>
              <span className="text-lg font-mono font-bold text-pink-950">{deviceState.enema.pressureA} kPa</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-pink-800 font-medium">通道 B 压力值</span>
              <span className="text-lg font-mono font-bold text-emerald-700">{deviceState.enema.pressureB} kPa</span>
            </div>
          </div>

          {/* 秒数选择与动作按钮 */}
          <div className="bg-white/55 backdrop-blur-md p-3.5 rounded-2xl border border-white/85 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs text-pink-950 font-bold">
              <span>单次运行秒数:</span>
              <div className="flex items-center gap-1.5">
                {[5, 10, 15, 30].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setEnemaDuration(sec)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                      enemaDuration === sec
                        ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm'
                        : 'bg-white text-pink-900 border border-pink-200 hover:bg-pink-100'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={deviceState.enema.waterPumpState !== 0 || deviceState.enema.peristalticState !== 0}
                onClick={() => runManualAction(() => deviceManager.enemaFill(enemaDuration))}
                className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold py-2.5 rounded-xl shadow-sm active:scale-95 transition-all"
              >
                <ArrowDown className="w-4 h-4 text-white" /> 正转注水 ({enemaDuration}s)
              </button>

              <button
                disabled={deviceState.enema.waterPumpState !== 0 || deviceState.enema.peristalticState !== 0}
                onClick={() => runManualAction(() => deviceManager.enemaDrain(enemaDuration))}
                className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold py-2.5 rounded-xl shadow active:scale-95 transition-all"
              >
                <ArrowUp className="w-4 h-4 text-emerald-200" /> 反转排空 ({enemaDuration}s)
              </button>
            </div>

            <button
              onClick={() => void deviceManager.stopEnema().catch((error) => setActionError(error?.message || String(error)))}
              className="w-full rounded-xl border border-rose-200 bg-rose-50/80 text-xs font-bold text-rose-700 hover:bg-rose-100 py-2.5 transition active:scale-98"
            >
              停止水泵输出
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
