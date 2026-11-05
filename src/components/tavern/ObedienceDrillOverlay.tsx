import React from 'react';
import { Check, Mic, OctagonX, Play, RotateCcw, Volume2, X, Zap } from 'lucide-react';
import { TavernAvatar } from './TavernAvatar';
import {
  buildDrillCommands,
  DRILL_DIFFICULTIES,
  loadDrillHistory,
  loadDrillSettings,
  ObedienceDrill,
  passScoreFor,
  saveDrillSettings,
  saveDrillSummary,
  summarizeDrill,
  type DrillDeps,
  type DrillDifficulty,
  type DrillSettings,
  type DrillSnapshot,
  type DrillSummary,
} from '../../core/discipline/obedienceDrill';
import { STTManager, type STTOptions } from '../../core/voice/sttManager';

interface ObedienceDrillOverlayProps {
  name: string;
  avatar: string;
  userName: string;
  sttOptions: STTOptions;
  /** 用角色的声音说一句话，播完 resolve */
  speak: (text: string) => Promise<void>;
  stopSpeech: () => void;
  /** 当前安全设置下电击能达到的最高强度（0 表示没有可用通道） */
  emsCeiling: number;
  punish: (level: number, seconds: number) => Promise<void>;
  reward: () => Promise<void>;
  stopOutputs: () => void;
  onEmergencyStop: () => void;
  onClose: (summary: DrillSummary | null) => void;
}

const ANSWER_TIMEOUT_MS = 8_000;
const fmtSec = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);
const DIFFICULTY_NAMES: Record<DrillDifficulty, string> = { ...Object.fromEntries(Object.entries(DRILL_DIFFICULTIES).map(([id, item]) => [id, item.name])), custom: '自定义' } as Record<DrillDifficulty, string>;

export const ObedienceDrillOverlay: React.FC<ObedienceDrillOverlayProps> = (props) => {
  const { name, avatar, userName, sttOptions, speak, stopSpeech, emsCeiling, punish, reward, stopOutputs, onEmergencyStop, onClose } = props;
  const [view, setView] = React.useState<'setup' | 'running' | 'summary'>('setup');
  const [settings, setSettings] = React.useState<DrillSettings>(() => loadDrillSettings());
  const [snapshot, setSnapshot] = React.useState<DrillSnapshot | null>(null);
  const [liveHeard, setLiveHeard] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<DrillSummary | null>(null);
  const drillRef = React.useRef<ObedienceDrill | null>(null);
  const history = React.useMemo(() => loadDrillHistory(), [view]);

  const updateSettings = (patch: Partial<DrillSettings>) => setSettings((current) => {
    const next = { ...current, ...patch, consequences: { ...current.consequences, ...(patch.consequences || {}) } };
    saveDrillSettings(next);
    return next;
  });
  const updateConsequences = (patch: Partial<DrillSettings['consequences']>) => updateSettings({ consequences: { ...settings.consequences, ...patch } });

  // 本次训练的惩罚强度不能超过安全设置
  const maxAllowed = Math.max(0, Math.round(emsCeiling));
  const punishMax = Math.min(settings.consequences.punishMaxLevel, maxAllowed);
  const punishStart = Math.min(settings.consequences.punishStartLevel, punishMax);

  const listen = React.useCallback((timeoutMs: number) => new Promise<{ text: string; responseMs: number | null } | null>((resolve) => {
    const stt = STTManager.getInstance();
    const startedAt = Date.now();
    let speechAt: number | null = null;
    let settled = false;
    setLiveHeard('');
    const finish = (value: { text: string; responseMs: number | null } | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(silenceTimer);
      window.clearTimeout(hardTimer);
      stt.stopListening();
      resolve(value);
    };
    // 没开口：超时算未作答；开口后最多再等 20 秒让你说完
    const silenceTimer = window.setTimeout(() => { if (speechAt === null) finish(null); }, timeoutMs);
    const hardTimer = window.setTimeout(() => stt.finishListening(), timeoutMs + 20_000);
    void stt.startListening(
      (text, isFinal) => {
        setLiveHeard(text);
        if (isFinal && text.trim()) finish({ text: text.trim(), responseMs: speechAt === null ? null : speechAt - startedAt });
      },
      (listening, sttError, processing) => {
        if (sttError && !['no-speech', 'aborted'].includes(sttError)) setError(sttError);
        if (!listening && !processing && (sttError || speechAt !== null)) finish(null);
      },
      { ...sttOptions, onSpeechStart: () => { if (speechAt === null) speechAt = Date.now(); } },
    );
  }), [sttOptions]);

  const start = () => {
    const commands = buildDrillCommands(settings, { char: name, user: userName });
    if (!commands.length) {
      setError('自定义口令为空：请每行写一句口令');
      return;
    }
    setError(null);
    let usedEms = false;
    let usedToy = false;
    const deps: DrillDeps = {
      speak,
      listen,
      // 动作成功后才记为「用过」：设备没连接时惩罚会失败，收尾不应再向它发停止包
      punish: async (level, seconds) => { await punish(Math.min(level, punishMax), seconds); usedEms = true; },
      reward: async () => { await reward(); usedToy = true; },
      // 只停用过的输出：对没连接的设备发停止包可能被当成写入失败而锁急停
      stopOutputs: () => { if (usedEms || usedToy) stopOutputs(); },
    };
    const drill = new ObedienceDrill(commands, {
      ...settings,
      passScore: passScoreFor(settings.difficulty),
      answerTimeoutMs: ANSWER_TIMEOUT_MS,
      consequences: { ...settings.consequences, punishOnFail: settings.consequences.punishOnFail && punishMax > 0, punishStartLevel: punishStart, punishMaxLevel: punishMax },
    }, deps);
    drillRef.current = drill;
    drill.subscribe(setSnapshot);
    setView('running');
    void drill.run().then((results) => {
      if (drillRef.current !== drill) return;
      const done = summarizeDrill(results, settings.difficulty, drill.getSnapshot().bestStreak);
      if (results.length > 0) saveDrillSummary(done);
      setSummary(results.length > 0 ? done : null);
      setView('summary');
    });
  };

  const stopDrill = () => {
    drillRef.current?.stop();
    STTManager.getInstance().stopListening();
    stopSpeech();
  };

  React.useEffect(() => () => {
    drillRef.current?.stop();
    STTManager.getInstance().stopListening();
    stopSpeech();
  }, [stopSpeech]);

  const close = () => {
    stopDrill();
    onClose(summary);
  };

  const last = snapshot?.results[snapshot.results.length - 1];
  const showResult = snapshot?.phase === 'feedback' && last;
  const commandVisible = !settings.hideText || snapshot?.phase === 'feedback';

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center overflow-y-auto"
      style={{ background: 'radial-gradient(120% 70% at 50% 0%, #3d1430 0%, #1b0c16 55%, #110a0f 100%)', color: '#fff' }}
      role="dialog"
      aria-label="语音服从训练"
      data-allow-scroll="true"
    >
      <div className="flex w-full max-w-md items-center justify-between px-4 pt-safe-header">
        <button type="button" onClick={close} className="grid h-9 w-9 place-items-center rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} aria-label="关闭训练">
          <X className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>语音服从训练</span>
        <button type="button" onClick={() => { stopDrill(); onEmergencyStop(); }} className="estop-button" aria-label="紧急停止全部输出">
          <OctagonX className="h-4 w-4" strokeWidth={2.4} />急停
        </button>
      </div>

      <div className="w-full max-w-md flex-1 px-5 pb-10">
        <div className="mt-6 flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full text-3xl" style={{ background: 'rgba(255,255,255,0.08)', boxShadow: '0 0 0 2px rgba(255,255,255,0.12)' }}>
            <TavernAvatar avatar={avatar} name={name} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{name}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>TA 说一句，你原话复述。准确度和反应速度都计分。</p>
          </div>
        </div>

        {view === 'setup' && (
          <div className="mt-6 space-y-5">
            <Field label="轮数">
              {[5, 10, 20].map((rounds) => (
                <Chip key={rounds} active={settings.rounds === rounds} onClick={() => updateSettings({ rounds })}>{rounds} 轮</Chip>
              ))}
            </Field>
            <Field label="难度">
              {(['beginner', 'intermediate', 'strict', 'custom'] as DrillDifficulty[]).map((difficulty) => (
                <Chip key={difficulty} active={settings.difficulty === difficulty} onClick={() => updateSettings({ difficulty })}>
                  {DIFFICULTY_NAMES[difficulty]}
                </Chip>
              ))}
            </Field>
            <p className="-mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {settings.difficulty === 'custom' ? '每行一句；可用 {{char}} 代表角色名、{{user}} 代表你的称呼。及格 80 分' : DRILL_DIFFICULTIES[settings.difficulty].hint}
            </p>
            {settings.difficulty === 'custom' && (
              <textarea
                value={settings.customPhrases.join('\n')}
                onChange={(event) => updateSettings({ customPhrases: event.target.value.split('\n').slice(0, 100) })}
                rows={5}
                placeholder={'是，{{char}}。\n我会乖乖听话。'}
                className="w-full rounded-2xl p-3 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}
              />
            )}
            <Toggle checked={settings.hideText} onChange={(hideText) => updateSettings({ hideText })} title="听写模式" hint="不显示口令文字，只能靠听；判分后再揭晓" />

            <div className="space-y-3 rounded-2xl p-3.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Toggle
                checked={settings.consequences.punishOnFail}
                onChange={(punishOnFail) => updateConsequences({ punishOnFail })}
                title="答错时电击惩罚"
                hint={maxAllowed > 0 ? `连续答错每次加 ${settings.consequences.punishStep} 档，${settings.consequences.punishSeconds} 秒后自动停止` : '当前安全上限为 0，无法启用'}
                disabled={maxAllowed <= 0}
              />
              {settings.consequences.punishOnFail && maxAllowed > 0 && (
                <div className="space-y-2.5 pl-1">
                  <Slider label="起始强度" value={punishStart} min={1} max={Math.max(1, punishMax)} onChange={(value) => updateConsequences({ punishStartLevel: value })} />
                  <Slider label={`本次上限（安全设置最高 ${maxAllowed}）`} value={punishMax} min={1} max={maxAllowed} onChange={(value) => updateConsequences({ punishMaxLevel: value })} />
                  <Slider label="每次加档" value={settings.consequences.punishStep} min={0} max={20} onChange={(value) => updateConsequences({ punishStep: value })} />
                  <Slider label="持续秒数" value={settings.consequences.punishSeconds} min={1} max={5} onChange={(value) => updateConsequences({ punishSeconds: value })} />
                </div>
              )}
              <Toggle checked={settings.consequences.rewardOnPass} onChange={(rewardOnPass) => updateConsequences({ rewardOnPass })} title="答对时震动奖励" hint="需要连接飞机杯 / 跳蛋 / 负鼠，震动 2 秒" />
            </div>

            {history[0] && (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                上次：{DIFFICULTY_NAMES[history[0].difficulty]} · {history[0].rounds} 轮通过 {history[0].passed} 轮 · 平均准确率 {history[0].averageAccuracy}%
              </p>
            )}
            {error && <p className="rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(225,29,72,0.2)', color: '#fecdd5' }}>{error}</p>}
            <button type="button" onClick={start} className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold" style={{ background: 'linear-gradient(135deg, #ec5a8f, #e34d6c)', boxShadow: '0 12px 30px -10px rgba(236,90,143,0.8)' }}>
              <Play className="h-4 w-4" />开始训练
            </button>
          </div>
        )}

        {view === 'running' && snapshot && (
          <div className="mt-8 space-y-6">
            <div className="flex items-center justify-between text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <span>第 {snapshot.round} / {snapshot.totalRounds} 句</span>
              <span>连续答对 {snapshot.streak}</span>
              {settings.consequences.punishOnFail && punishMax > 0 && (
                <span className="flex items-center gap-1" style={{ color: '#fda4c4' }}><Zap className="h-3 w-3" />下次答错 {Math.min(snapshot.nextPunishLevel, punishMax)}</span>
              )}
            </div>
            <div className="h-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(snapshot.results.length / Math.max(1, snapshot.totalRounds)) * 100}%`, background: 'linear-gradient(90deg, #ec5a8f, #c04dff)' }} />
            </div>

            <div className="rounded-3xl px-5 py-7 text-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="mb-3 flex items-center justify-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {snapshot.phase === 'speaking' && <><Volume2 className="h-3.5 w-3.5" />{name} 正在说…</>}
                {snapshot.phase === 'listening' && <><Mic className="h-3.5 w-3.5 animate-pulse" style={{ color: '#f9a8c8' }} />请复述</>}
                {snapshot.phase === 'judging' && '评分中…'}
                {snapshot.phase === 'feedback' && '本句结果'}
              </p>
              <p className="text-xl font-bold leading-relaxed">
                {commandVisible ? snapshot.command : '🔒 仔细听，原话复述'}
              </p>
              {(snapshot.phase === 'listening' || snapshot.phase === 'judging') && liveHeard && (
                <p className="mt-3 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>你：{liveHeard}</p>
              )}
              {showResult && (
                <div className="mt-4 space-y-1">
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>你：{last.heard || '（没有回答）'}</p>
                  <p className="text-3xl font-black" style={{ color: last.passed ? '#6ee7a8' : '#fb7185' }}>
                    {last.passed ? <Check className="mr-1 inline h-7 w-7" /> : <X className="mr-1 inline h-7 w-7" />}
                    {last.score.score} 分
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    准确度 {last.score.accuracy}% · 反应 {fmtSec(last.responseMs)}
                    {last.punishLevel ? ` · 惩罚强度 ${last.punishLevel}` : ''}
                  </p>
                </div>
              )}
            </div>
            {error && <p className="rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(225,29,72,0.2)', color: '#fecdd5' }}>{error}</p>}
            <button type="button" onClick={stopDrill} className="w-full rounded-2xl py-3 text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.1)' }}>结束训练</button>
          </div>
        )}

        {view === 'summary' && (
          <div className="mt-8 space-y-5">
            {summary ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="通过" value={`${summary.passed} / ${summary.rounds}`} />
                  <Stat label="平均准确率" value={`${summary.averageAccuracy}%`} />
                  <Stat label="平均反应" value={fmtSec(summary.averageResponseMs)} />
                  <Stat label="最长连对" value={`${summary.bestStreak}`} />
                </div>
                <div className="space-y-1.5">
                  {snapshot?.results.map((result) => (
                    <div key={result.round} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <span style={{ color: result.passed ? '#6ee7a8' : '#fb7185' }}>{result.passed ? '✓' : '✗'}</span>
                      <span className="min-w-0 flex-1 truncate">{result.command}</span>
                      <span className="shrink-0 font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>{result.score.score}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>训练已提前结束。</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => { setSummary(null); setSnapshot(null); setView('setup'); }} className="flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <RotateCcw className="h-4 w-4" />再来一组
              </button>
              <button type="button" onClick={close} className="rounded-2xl py-3 text-sm font-bold" style={{ background: 'linear-gradient(135deg, #ec5a8f, #e34d6c)' }}>完成</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <p className="mb-2 text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</p>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className="rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
    style={active ? { background: '#fff', color: '#1d0d17' } : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
  >
    {children}
  </button>
);

const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; title: string; hint: string; disabled?: boolean }> = ({ checked, onChange, title, hint, disabled }) => (
  <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 text-left disabled:opacity-40">
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{hint}</span>
    </span>
    <span className="relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ background: checked ? '#ec5a8f' : 'rgba(255,255,255,0.18)' }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full transition-all" style={{ left: checked ? '1.375rem' : '0.125rem', background: '#fff' }} />
    </span>
  </button>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; onChange: (value: number) => void }> = ({ label, value, min, max, onChange }) => (
  <label className="block text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
    <span className="flex justify-between"><span>{label}</span><span className="font-mono">{value}</span></span>
    <input type="range" min={min} max={max} value={Math.min(max, Math.max(min, value))} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 w-full" />
  </label>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</p>
    <p className="mt-1 text-2xl font-black">{value}</p>
  </div>
);
