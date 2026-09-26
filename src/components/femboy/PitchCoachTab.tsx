import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getBarbieRitualDayKey } from '../../core/discipline/barbieRitual';
import { VoiceHistoryPanel } from './VoiceHistoryPanel';
import { Activity, CheckCircle2, Mic, Pause, RotateCcw, ShieldCheck, SlidersHorizontal, Volume2 } from 'lucide-react';
import type { BarbieSuiteState } from '../../core/discipline/barbieSuiteState';
import { PitchData, PitchTracker } from '../../core/voice/pitchTracker';
import { TTSManager } from '../../core/voice/ttsManager';
import { VoiceExerciseId, calculateAdaptiveVoiceTarget, calculateVoiceMetrics, medianPitch, normalizeVoiceTarget } from '../../core/voice/voiceTraining';

const EMPTY_PITCH: PitchData = { frequency: 0, noteName: '--', clarity: 0, category: 'deep_male', targetHit: false };
const EXERCISES: { id: VoiceExerciseId; title: string; duration: number; instruction: string; sentence: string }[] = [
  { id: 'warmup', title: '轻柔热身', duration: 60, instruction: '闭合双唇轻哼，保持喉咙放松，不追求高度。', sentence: '嗯——让声音轻轻向前集中。' },
  { id: 'glide', title: '平滑滑音', duration: 60, instruction: '从舒适音高缓慢上滑再返回，避免挤压喉咙。', sentence: '呜——咿——呜，平稳地滑动。' },
  { id: 'reading', title: '自然朗读', duration: 90, instruction: '用自然语速朗读，句尾不要突然压低。', sentence: '今天的风很轻，我想用从容又明亮的声音说话。' },
  { id: 'expression', title: '语调表达', duration: 90, instruction: '用开心、平静、关心三种语气各读一次。', sentence: '见到你真好，今天也一起慢慢进步吧。' },
];

interface Props {
  state: BarbieSuiteState;
  update: (patch: Partial<BarbieSuiteState>) => void;
  addAudit: (message: string) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const todayKey = getBarbieRitualDayKey;

export const PitchCoachTab: React.FC<Props> = ({ state, update, addAudit }) => {
  const tracker = PitchTracker.getInstance();
  const [exerciseId, setExerciseId] = useState<VoiceExerciseId>('warmup');
  const [running, setRunning] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [live, setLive] = useState<PitchData>(EMPTY_PITCH);
  const [samples, setSamples] = useState<PitchData[]>([]);
  const [message, setMessage] = useState('选择一个练习，先用舒适声音热身。');
  const startedHere = useRef(false);
  const startRequest = useRef(0);
  const startPending = useRef(false);
  const [starting, setStarting] = useState(false);
  const recentVoiced = useRef<number[]>([]);
  const exercise = EXERCISES.find((item) => item.id === exerciseId) || EXERCISES[0];
  const practiceText = state.voiceTraining.practiceText?.trim() || exercise.sentence;
  const { targetMinHz, targetMaxHz } = state.voiceTraining;

  useEffect(() => tracker.setTargetRange(targetMinHz, targetMaxHz), [targetMaxHz, targetMinHz, tracker]);
  useEffect(() => {
    const unsubscribe = tracker.subscribe((data) => {
      if (!startedHere.current) return;
      recentVoiced.current = data.frequency > 0 ? [...recentVoiced.current, data.frequency].slice(-5) : [];
      const frequency = recentVoiced.current.length
        ? Math.round([...recentVoiced.current].sort((a, b) => a - b)[Math.floor(recentVoiced.current.length / 2)])
        : 0;
      const smoothed = { ...data, frequency, targetHit: frequency >= targetMinHz && frequency <= targetMaxHz };
      setLive(smoothed);
      setSamples((previous) => [...previous, smoothed].slice(-7_500));
    });
    return () => { unsubscribe(); startRequest.current++; if (startedHere.current || startPending.current) tracker.stop(); startPending.current = false; startedHere.current = false; };
  }, [targetMaxHz, targetMinHz, tracker]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsedSec((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const metrics = useMemo(() => calculateVoiceMetrics(samples, targetMinHz, targetMaxHz), [samples, targetMaxHz, targetMinHz]);
  const voicedCount = samples.filter((sample) => sample.frequency > 0).length;
  const targetSeconds = Math.round(samples.filter((sample) => sample.targetHit).length * 0.08);

  const stopCapture = () => {
    startRequest.current++; startPending.current = false; setStarting(false);
    tracker.stop(); startedHere.current = false; setRunning(false); setLive(EMPTY_PITCH);
  };
  const startCapture = async (asCalibration = false) => {
    if (startPending.current) return;
    if (running) { stopCapture(); setMessage('训练已暂停，可以继续或保存本次结果。'); return; }
    if (!samples.length || calibrating !== asCalibration) { setSamples([]); setElapsedSec(0); }
    setCalibrating(asCalibration); recentVoiced.current = [];
    const requestId = ++startRequest.current;
    startPending.current = true; setStarting(true);
    const ok = await tracker.start();
    if (requestId !== startRequest.current) return;
    startPending.current = false; setStarting(false);
    if (!ok) { setMessage('无法使用麦克风，请在系统权限中允许本应用访问麦克风。'); return; }
    startedHere.current = true; setRunning(true);
    setMessage(asCalibration ? '用最自然、最轻松的声音持续说话 10 秒。' : `${exercise.title}进行中，感觉紧绷时请立即停止。`);
  };
  const finishCalibration = () => {
    const baselineHz = medianPitch(samples);
    if (elapsedSec < 8 || voicedCount < 30 || !baselineHz) { setMessage('有效声音还不够，请在安静环境中自然说话至少 8 秒。'); return; }
    stopCapture();
    const [min, max] = calculateAdaptiveVoiceTarget(baselineHz);
    update({ voiceTraining: { ...state.voiceTraining, baselineHz, targetMinHz: min, targetMaxHz: max, calibratedAt: Date.now() } });
    setCalibrating(false); setSamples([]); setElapsedSec(0);
    setMessage(`基线约 ${baselineHz}Hz，已生成舒适目标区 ${min}–${max}Hz。`);
    addAudit(`完成声线基线校准：${baselineHz}Hz`);
  };
  const finishSession = () => {
    if (calibrating) { finishCalibration(); return; }
    if (elapsedSec < 10 || voicedCount < 30) { setMessage('至少练习 10 秒并保持有效发声，才能保存结果。'); return; }
    stopCapture();
    const completedAt = Date.now();
    const record = { id: `voice-${completedAt}`, completedAt, exercise: exerciseId, durationSec: elapsedSec, averagePitchHz: metrics.averagePitchHz, targetHitPercent: metrics.targetHitPercent, stabilityPercent: metrics.stabilityPercent, clarityPercent: metrics.clarityPercent, continuityPercent: metrics.continuityPercent };
    const dailyMarker = `voice:${todayKey()}`;
    const rewardedToday = state.rituals.includes(dailyMarker);
    update({
      voiceTraining: { ...state.voiceTraining, completedSessions: state.voiceTraining.completedSessions + 1, bestStability: Math.max(state.voiceTraining.bestStability, metrics.stabilityPercent), lastCompletedAt: completedAt },
      voiceHistory: [record, ...state.voiceHistory].slice(0, 1000),
      growth: rewardedToday ? state.growth : { ...state.growth, '声线': Math.min(100, state.growth['声线'] + 3) },
      rituals: rewardedToday ? state.rituals : [dailyMarker, ...state.rituals].slice(0, 30),
    });
    addAudit(`完成「${exercise.title}」：稳定 ${metrics.stabilityPercent}% · 目标区 ${metrics.targetHitPercent}%${rewardedToday ? '' : ' · 声线成长 +3'}`);
    setMessage(rewardedToday ? '训练已保存。今天的成长奖励已领取，继续练习仍会记录。' : '训练已保存，今日声线成长 +3。');
    setSamples([]); setElapsedSec(0);
  };
  const resetSession = () => { stopCapture(); setCalibrating(false); setSamples([]); setElapsedSec(0); setMessage('本次未保存的数据已清空。'); };
  const setTarget = (min: number, max: number) => { const [nextMin, nextMax] = normalizeVoiceTarget(min, max); update({ voiceTraining: { ...state.voiceTraining, targetMinHz: nextMin, targetMaxHz: nextMax } }); };
  const playReference = async () => { if (running || startPending.current) stopCapture(); setMessage('正在播放示范；播放期间不会拾音，避免把示范误算为成绩。'); await TTSManager.getInstance().speak(practiceText); };

  const livePosition = live.frequency > 0 ? clamp(((live.frequency - 80) / 280) * 100, 0, 100) : 0;
  const minPosition = clamp(((targetMinHz - 80) / 280) * 100, 0, 100);
  const maxPosition = clamp(((targetMaxHz - 80) / 280) * 100, 0, 100);

  return <div className="space-y-4">
    <section className="ui-card space-y-2"><label className="block font-bold" htmlFor="voice-practice-text">我的练习文本</label><textarea id="voice-practice-text" rows={3} maxLength={2000} disabled={running || starting} value={state.voiceTraining.practiceText || ''} placeholder="留空使用当前练习的默认句子" onChange={e => update({ voiceTraining: { ...state.voiceTraining, practiceText: e.target.value } })} className="w-full p-3 text-sm" /><p className="ui-muted text-xs">自动保存到本机；示范朗读也使用这段文字。</p>{starting && <p role="status">正在等待麦克风权限…</p>}</section>
    <VoiceHistoryPanel records={state.voiceHistory} />
    <div className="rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 p-4 text-white shadow-lg shadow-pink-200/50">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black tracking-[0.18em] text-pink-100">LOCAL VOICE COACH</p><h3 className="mt-1 text-lg font-black">声线训练</h3><p className="mt-1 text-[10px] text-pink-50">实时分析，不录音、不上传音频</p></div><button disabled={starting} onClick={() => startCapture(calibrating)} className="flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-[11px] font-black text-pink-600 shadow-sm">{running ? <Pause className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{running ? '暂停' : samples.length ? '继续' : '开始'}</button></div>
      <div className="mt-4 flex items-end justify-between"><div><span className="font-mono text-4xl font-black">{live.frequency || '--'}</span><span className="ml-1 text-xs">Hz</span><p className="mt-1 text-[10px] text-pink-50">{live.noteName} · 清晰度 {Math.round(live.clarity * 100)}%</p></div><div className="text-right"><p className="font-mono text-xl font-black">{Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}</p><p className="text-[9px] text-pink-100">目标区累计 {targetSeconds} 秒</p></div></div>
      <div className="relative mt-4 h-3 rounded-full bg-black/20"><div className="absolute top-0 h-full rounded-full bg-white/25" style={{ left: `${minPosition}%`, width: `${maxPosition - minPosition}%` }} />{live.frequency > 0 && <span className={`absolute -top-1 h-5 w-2 rounded-full shadow ${live.targetHit ? 'bg-emerald-300' : 'bg-white'}`} style={{ left: `${livePosition}%` }} />}</div>
      <div className="mt-1 flex justify-between text-[8px] text-pink-100"><span>80Hz</span><span>舒适目标 {targetMinHz}–{targetMaxHz}Hz</span><span>360Hz</span></div>
    </div>
    <div className="grid grid-cols-3 gap-2 text-center">{([['稳定度', metrics.stabilityPercent], ['目标区', metrics.targetHitPercent], ['连续度', metrics.continuityPercent]] as const).map(([label, value]) => <div key={label} className="rounded-2xl bg-pink-50 p-3"><strong className="block text-lg text-pink-600">{value}%</strong><span className="text-[9px] font-bold text-slate-500">{label}</span></div>)}</div>
    <section className="rounded-3xl border border-pink-100 bg-white p-4"><div className="flex items-center justify-between"><div><h4 className="text-xs font-black text-slate-700">舒适基线与目标区</h4><p className="mt-1 text-[9px] text-slate-400">先测自然声音，再逐步训练；目标可以随时调整。</p></div><SlidersHorizontal className="h-4 w-4 text-pink-500" /></div><div className="mt-3 flex items-center gap-2"><button disabled={starting || (running && !calibrating)} onClick={() => { setCalibrating(true); void startCapture(true); }} className="flex-1 rounded-2xl bg-pink-50 py-2.5 text-[10px] font-black text-pink-600 disabled:cursor-not-allowed disabled:opacity-40">{state.voiceTraining.baselineHz ? `重新校准 · ${state.voiceTraining.baselineHz}Hz` : '开始 10 秒基线校准'}</button>{calibrating && <button onClick={finishCalibration} className="rounded-2xl bg-pink-500 px-3 py-2.5 text-[10px] font-black text-white">完成校准</button>}</div><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-[9px] font-bold text-slate-500">下限 {targetMinHz}Hz<input disabled={running || starting} type="range" min="100" max="300" step="5" value={targetMinHz} onChange={(event) => setTarget(Number(event.target.value), targetMaxHz)} className="mt-1 w-full accent-pink-500 disabled:opacity-40" /></label><label className="text-[9px] font-bold text-slate-500">上限 {targetMaxHz}Hz<input disabled={running || starting} type="range" min="140" max="360" step="5" value={targetMaxHz} onChange={(event) => setTarget(targetMinHz, Number(event.target.value))} className="mt-1 w-full accent-pink-500 disabled:opacity-40" /></label></div></section>
    <section><div className="mb-2 flex items-center justify-between"><h4 className="text-xs font-black text-slate-700">渐进练习</h4><span className="text-[9px] font-bold text-pink-500">建议按顺序进行</span></div><div className="grid grid-cols-2 gap-2">{EXERCISES.map((item, index) => <button key={item.id} disabled={running || starting} onClick={() => { setExerciseId(item.id); setSamples([]); setElapsedSec(0); setCalibrating(false); setMessage(item.instruction); }} className={`rounded-2xl border p-3 text-left ${exerciseId === item.id ? 'border-pink-400 bg-pink-50' : 'border-slate-100 bg-white'}`}><span className="text-[9px] font-black text-pink-500">0{index + 1} · {item.duration}秒</span><p className="mt-1 text-xs font-black text-slate-700">{item.title}</p><p className="mt-1 text-[9px] leading-relaxed text-slate-400">{item.instruction}</p></button>)}</div><div className="mt-2 rounded-2xl bg-slate-50 p-3"><p className="text-[9px] font-bold text-slate-400">本轮练习句</p><p className="mt-1 text-xs font-bold leading-relaxed text-slate-700">{practiceText}</p><button onClick={playReference} className="mt-2 flex items-center gap-1 text-[9px] font-black text-pink-600"><Volume2 className="h-3 w-3" />播放示范（自动暂停拾音）</button></div></section>
    <div className="rounded-2xl bg-cyan-50 px-3 py-2.5 text-[10px] font-bold leading-relaxed text-cyan-800">{message}</div>
    <div className="grid grid-cols-2 gap-2"><button onClick={resetSession} className="flex items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white py-2.5 text-[10px] font-black text-slate-500"><RotateCcw className="h-3.5 w-3.5" />清空本次</button><button onClick={finishSession} disabled={!samples.length} className="flex items-center justify-center gap-1 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 py-2.5 text-[10px] font-black text-white disabled:opacity-40"><CheckCircle2 className="h-3.5 w-3.5" />{calibrating ? '完成校准' : '保存训练结果'}</button></div>
    <p className="flex items-start gap-1.5 rounded-2xl bg-emerald-50 p-3 text-[9px] leading-relaxed text-emerald-700"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />声音女性化不只取决于音高，本结果仅供练习参考。出现疼痛、沙哑、头晕或明显紧绷时请立即停止并休息。</p>
  </div>;
};
