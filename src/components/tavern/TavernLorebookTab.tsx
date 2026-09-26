import React, { useState } from 'react';
import {
  HardwareLorebookEngine,
  HARDWARE_LOREBOOK_TOY_PATTERNS,
  HARDWARE_LOREBOOK_WAVES,
  LorebookMessageSource,
} from '../../core/tavern/hardwareLorebook';
import { LorebookEntry } from '../../core/tavern/tavernTypes';
import { useAppStore } from '../../store/useAppStore';
import { TavernWorldbookManager } from './TavernWorldbookManager';
import {
  CheckCircle2,
  FlaskConical,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';

type ActionType = NonNullable<LorebookEntry['hardwareAction']>['type'];
type MatchScope = NonNullable<LorebookEntry['matchScope']>;

const scopeLabel: Record<MatchScope, string> = {
  user: '用户消息',
  assistant: 'AI 回复',
  both: '双方消息',
};

const actionLabel: Record<ActionType, string> = {
  ems_wave: 'EMS 波形',
  ems_strength: 'EMS 强度',
  toy_motor: '玩具马达',
  toy_pattern: '飞机杯律动',
  enema_fill: '灌肠注水',
  enema_drain: '灌肠排空',
  brake_stop: '全部急停',
};

const TavernHardwareLorebookPanel: React.FC = () => {
  const engine = HardwareLorebookEngine.getInstance();
  const safetyConfig = useAppStore((state) => state.safetyConfig);
  const [entries, setEntries] = useState<LorebookEntry[]>(engine.getEntries());
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keywords, setKeywords] = useState('');
  const [secondaryKeywords, setSecondaryKeywords] = useState('');
  const [content, setContent] = useState('');
  const [actionType, setActionType] = useState<ActionType>('ems_wave');
  const [actionTarget, setActionTarget] = useState('breathe');
  const [stopMode, setStopMode] = useState<'timed' | 'persistent'>('timed');
  const [maximumDurationSec, setMaximumDurationSec] = useState(10);
  const [matchScope, setMatchScope] = useState<MatchScope>('user');
  const [priority, setPriority] = useState(5);
  const [cooldownSec, setCooldownSec] = useState(3);
  const [testText, setTestText] = useState('');
  const [testSource, setTestSource] = useState<LorebookMessageSource>('user');
  const [testResult, setTestResult] = useState<ReturnType<typeof engine.previewText> | null>(null);

  const emsMaximum = Math.min(safetyConfig.maxEmsStrengthA, safetyConfig.maxEmsStrengthB);
  const emsMinimum = Math.min(safetyConfig.minEmsStrength, emsMaximum);
  const toyMaximum = Math.max(
    safetyConfig.maxToyMotorARate,
    safetyConfig.maxToyMotorBRate,
    safetyConfig.maxToyMotorCRate,
  );
  const toyMinimum = Math.min(safetyConfig.minToyMotorRate, toyMaximum);
  const enemaMinimum = Math.min(safetyConfig.minEnemaDurationSec, safetyConfig.maxEnemaDurationSec);
  const enemaMaximum = safetyConfig.maxEnemaDurationSec;

  const refreshEntries = () => {
    setEntries(engine.getEntries());
    setTestResult(null);
  };

  const openEditor = (entry?: LorebookEntry) => {
    setEditingId(entry?.id || null);
    setKeywords(entry?.keywords.join(' ') || '');
    setSecondaryKeywords(entry?.secondaryKeywords?.join(' ') || '');
    setContent(entry?.content || '');
    setActionType(entry?.hardwareAction?.type || 'ems_wave');
    setActionTarget(entry?.hardwareAction?.target || 'breathe');
    setStopMode(entry?.hardwareAction?.stopMode || 'timed');
    setMaximumDurationSec(entry?.hardwareAction?.durationSec || 10);
    setMatchScope(entry?.matchScope || 'user');
    setPriority(entry?.priority || 5);
    setCooldownSec(entry?.cooldownSec || 3);
    setShowEditor(true);
  };

  const handleSave = () => {
    const primary = keywords.split(/[,，\s]+/).filter(Boolean);
    const secondary = secondaryKeywords.split(/[,，\s]+/).filter(Boolean);
    if (primary.length === 0 || !content.trim()) return;
    const hardwareAction: NonNullable<LorebookEntry['hardwareAction']> = actionType === 'brake_stop'
      ? { type: 'brake_stop' }
      : {
          type: actionType,
          target: actionType === 'ems_wave' || actionType === 'toy_pattern'
            ? actionTarget
            : actionType === 'ems_strength' ? 'AB' : undefined,
          stopMode: actionType === 'enema_fill' || actionType === 'enema_drain' ? 'timed' : stopMode,
          durationSec: actionType === 'enema_fill' || actionType === 'enema_drain' || stopMode === 'timed'
            ? maximumDurationSec
            : undefined,
        };
    const patch = {
      keywords: primary,
      secondaryKeywords: secondary.length > 0 ? secondary : undefined,
      content: content.trim().slice(0, 8000),
      matchScope,
      priority,
      cooldownSec,
      hardwareAction,
      enabled: true,
    };
    if (editingId) engine.updateEntry(editingId, patch);
    else engine.addEntry(patch);
    refreshEntries();
    setShowEditor(false);
  };

  const handleDelete = (entry: LorebookEntry) => {
    if (!window.confirm(`确定删除规则“${entry.keywords[0]}”吗？`)) return;
    engine.deleteEntry(entry.id);
    refreshEntries();
  };

  const handleReset = () => {
    if (!window.confirm('恢复默认规则会覆盖当前硬件世界书，是否继续？')) return;
    engine.resetDefaults();
    refreshEntries();
  };

  const runPreview = () => setTestResult(engine.previewText(testText, testSource));

  return (
    <div className="space-y-4">
      <section className="liquid-card relative overflow-hidden p-5 shadow-[0_10px_28px_rgba(233,104,146,0.08)]">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-pink-200/30 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-800">硬件世界书 3.0</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              同时识别用户与 AI 回复。规则决定“何时触发”，具体挡位和时长由 AI 在玩家安全上限内决定。
            </p>
          </div>
          <button
            onClick={() => openEditor()}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-2 text-[10px] font-bold text-white shadow-sm shadow-pink-500/20 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />新建
          </button>
        </div>
        <div className="relative mt-3 grid grid-cols-3 gap-2 text-[10px]">
          <div className="rounded-xl border border-pink-100 bg-pink-50/60 p-2.5 backdrop-blur-xs">
            <span className="block text-slate-500 font-medium">AI 可选 EMS 档位</span>
            <strong className="font-mono text-pink-600 font-black">{emsMinimum} - {emsMaximum}</strong>
          </div>
          <div className="rounded-xl border border-pink-100 bg-pink-50/60 p-2.5 backdrop-blur-xs">
            <span className="block text-slate-500 font-medium">AI 可选马达档位</span>
            <strong className="font-mono text-slate-700 font-black">{toyMinimum} - {toyMaximum}</strong>
          </div>
          <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-2.5 backdrop-blur-xs">
            <span className="block text-slate-500 font-medium">灌肠单次时长</span>
            <strong className="font-mono text-cyan-700 font-black">{enemaMinimum} - {enemaMaximum}s</strong>
          </div>
        </div>
        <div className="relative mt-2 flex items-center gap-1.5 text-[9px] text-emerald-600 font-bold">
          <ShieldCheck className="h-3.5 w-3.5" />范围来自“硬件调控”，世界书不能越过玩家设置。
        </div>
      </section>

      <section className="liquid-card p-3.5 shadow-xs">
        <div className="flex items-center gap-1.5 text-xs font-black text-slate-800">
          <FlaskConical className="h-4 w-4 text-pink-500" />规则试运行
        </div>
        <p className="mt-1 text-[9px] text-slate-500">只检查匹配和优先级，不会向硬件下发任何指令。</p>
        <div className="mt-2 flex gap-2">
          <select
            value={testSource}
            onChange={(event) => setTestSource(event.target.value as LorebookMessageSource)}
            className="rounded-xl border border-pink-100 bg-white px-2 text-[10px] text-slate-700 outline-none focus:border-pink-300"
          >
            <option value="user">用户消息</option>
            <option value="assistant">AI 回复</option>
          </select>
          <input
            value={testText}
            onChange={(event) => setTestText(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && runPreview()}
            placeholder="输入一句话测试触发规则"
            className="min-w-0 flex-1 rounded-xl border border-pink-100 bg-white p-2 text-[10px] text-slate-700 outline-none focus:border-pink-300"
          />
          <button
            onClick={runPreview}
            disabled={!testText.trim()}
            className="rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-3 text-[10px] font-bold text-white shadow-sm shadow-pink-500/20 disabled:opacity-40 active:scale-95"
          >
            测试
          </button>
        </div>
        {testResult && (
          <div className="mt-2 rounded-xl border border-pink-100/70 bg-white/90 p-2.5 text-[9px] text-slate-600 shadow-xs">
            {testResult.matchedEntries.length > 0 ? (
              <>
                命中：<span className="font-bold text-pink-600">{testResult.matchedEntries.map((entry) => entry.keywords[0]).join('、')}</span>；本轮候选动作：<span className="text-slate-700 font-bold">{testResult.actionEntries.map((entry) => actionLabel[entry.hardwareAction!.type]).join('、') || '无'}</span>
              </>
            ) : (
              <span>没有命中规则。</span>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black text-slate-800">触发规则 ({entries.length})</span>
          <button onClick={handleReset} className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-pink-600 font-bold">
            <RotateCcw className="h-3 w-3" />恢复默认
          </button>
        </div>
        <div className="space-y-2.5">
          {entries.map((entry) => {
            const action = entry.hardwareAction;
            const isToy = action?.type === 'toy_motor';
            const usesLevel = action?.type === 'ems_wave' || action?.type === 'ems_strength' || isToy;
            const rangeText = isToy ? `${toyMinimum}-${toyMaximum}` : `${emsMinimum}-${emsMaximum}`;
            return (
              <article
                key={entry.id}
                className={`liquid-card p-3.5 transition-all ${
                  entry.enabled
                    ? 'hover:shadow-md'
                    : 'opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="rounded-md border border-pink-100 bg-pink-50/80 px-1.5 py-0.5 text-[8px] font-bold text-pink-600">
                        {scopeLabel[entry.matchScope || 'user']}
                      </span>
                      <span className="rounded-md border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[8px] text-slate-500 font-medium">
                        优先级 {entry.priority || 5}
                      </span>
                      <span className="rounded-md border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[8px] text-slate-500 font-medium">
                        冷却 {entry.cooldownSec || 3}s
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {entry.keywords.map((keyword) => (
                        <span key={keyword} className="liquid-chip px-2.5 py-0.5 font-mono text-[9px] font-bold text-pink-700">
                          #{keyword}
                        </span>
                      ))}
                    </div>
                    {entry.secondaryKeywords?.length ? (
                      <p className="text-[9px] text-pink-600/80">并且包含其一：{entry.secondaryKeywords.join(' / ')}</p>
                    ) : null}
                    <p className="text-[10px] leading-relaxed text-slate-600">{entry.content}</p>
                    {action && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-pink-50 pt-2 text-[9px]">
                        <span className="flex items-center gap-1 font-bold text-pink-600">
                          <Zap className="h-3 w-3" />
                          {actionLabel[action.type]}
                          {action.type === 'ems_wave'
                            ? ` / ${HARDWARE_LOREBOOK_WAVES.find((wave) => wave.id === action.target)?.name || action.target}`
                            : action.type === 'toy_pattern'
                            ? ` / ${HARDWARE_LOREBOOK_TOY_PATTERNS.find((pattern) => pattern.id === action.target)?.name || action.target}`
                            : ''}
                        </span>
                        {usesLevel && (
                          <span className="text-slate-500">
                            AI 挡位 <strong className="font-mono text-amber-600">{rangeText}</strong>
                          </span>
                        )}
                        {action.type !== 'brake_stop' && (
                          <span className="text-slate-400">
                            {action.stopMode === 'timed' ? `AI 时长 1-${action.durationSec || 10} 秒` : '持续到下一指令/急停'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openEditor(entry)}
                      aria-label="编辑规则"
                      className="rounded-lg border border-pink-100 bg-white p-1.5 text-slate-500 hover:text-pink-600 hover:bg-pink-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { engine.toggleEntry(entry.id); refreshEntries(); }}
                      aria-label="启用或停用规则"
                      className={`rounded-lg border p-1.5 ${
                        entry.enabled
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          : 'border-pink-100 bg-white text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {entry.enabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => handleDelete(entry)}
                      aria-label="删除规则"
                      className="rounded-lg border border-pink-100 bg-white p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="max-h-[86vh] w-full max-w-sm space-y-3 overflow-y-auto rounded-3xl border border-pink-200/90 bg-white/98 p-5 shadow-2xl backdrop-blur-xl">
            <h3 className="text-xs font-black text-slate-800">{editingId ? '编辑' : '新建'}硬件世界书规则</h3>
            <label className="block text-[10px] font-bold text-slate-500">
              触发来源
              <select
                value={matchScope}
                onChange={(event) => setMatchScope(event.target.value as MatchScope)}
                className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
              >
                <option value="user">用户消息</option>
                <option value="assistant">AI 回复</option>
                <option value="both">双方消息</option>
              </select>
            </label>
            <label className="block text-[10px] font-bold text-slate-500">
              主关键词（空格或逗号分隔）
              <input
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder="例如：拒绝 不听话"
                className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
              />
            </label>
            <label className="block text-[10px] font-bold text-slate-500">
              次关键词（可选，需再命中其一）
              <input
                value={secondaryKeywords}
                onChange={(event) => setSecondaryKeywords(event.target.value)}
                placeholder="例如：命令 训练"
                className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
              />
            </label>
            <label className="block text-[10px] font-bold text-slate-500">
              注入给 AI 的情境
              <textarea
                maxLength={8000}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold text-slate-500">
                优先级 {priority}
                <input
                  aria-label="规则优先级"
                  type="range"
                  min="1"
                  max="10"
                  value={priority}
                  onChange={(event) => setPriority(Number(event.target.value))}
                  className="mt-1 w-full accent-pink-500"
                />
              </label>
              <label className="text-[10px] font-bold text-slate-500">
                冷却 {cooldownSec} 秒
                <input
                  aria-label="规则冷却秒数"
                  type="number"
                  min="1"
                  max="300"
                  value={cooldownSec}
                  onChange={(event) => setCooldownSec(Number(event.target.value))}
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                />
              </label>
            </div>
            <label className="block text-[10px] font-bold text-slate-500">
              硬件动作
              <select
                value={actionType}
                onChange={(event) => {
                  const next = event.target.value as ActionType;
                  setActionType(next);
                  if (next === 'ems_wave') setActionTarget('breathe');
                  if (next === 'toy_pattern') setActionTarget('gentle');
                }}
                className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
              >
                <option value="ems_wave">下发 EMS 波形</option>
                <option value="ems_strength">调整 EMS 强度</option>
                <option value="toy_motor">调整玩具马达</option>
                <option value="toy_pattern">播放飞机杯律动</option>
                <option value="enema_fill">灌肠器限时注水</option>
                <option value="enema_drain">灌肠器限时排空</option>
                <option value="brake_stop">立即急停全部输出</option>
              </select>
            </label>
            {actionType === 'ems_wave' && (
              <label className="block text-[10px] font-bold text-slate-500">
                EMS 波形
                <select
                  value={actionTarget}
                  onChange={(event) => setActionTarget(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                >
                  {HARDWARE_LOREBOOK_WAVES.map((wave) => (
                    <option key={wave.id} value={wave.id}>
                      {wave.name} ({wave.id})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {actionType === 'toy_pattern' && (
              <label className="block text-[10px] font-bold text-slate-500">
                飞机杯律动
                <select
                  value={actionTarget}
                  onChange={(event) => setActionTarget(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                >
                  {HARDWARE_LOREBOOK_TOY_PATTERNS.map((pattern) => (
                    <option key={pattern.id} value={pattern.id}>
                      {pattern.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {actionType !== 'brake_stop' && (
              <div className="space-y-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3">
                <p className="text-[9px] leading-relaxed text-amber-800">
                  {actionType === 'enema_fill' || actionType === 'enema_drain'
                    ? `灌肠动作固定为限时执行，并受 ${enemaMinimum}-${enemaMaximum} 秒安全范围约束。`
                    : actionType === 'toy_pattern'
                    ? '律动使用预设节奏，各马达输出仍受硬件调控上限约束。'
                    : `本规则不保存固定挡位。AI 将在硬件调控的 ${actionType === 'toy_motor' ? `${toyMinimum}-${toyMaximum}` : `${emsMinimum}-${emsMaximum}`} 范围内选择。`}
                </p>
                {actionType !== 'enema_fill' && actionType !== 'enema_drain' && (
                  <label className="block text-[10px] font-bold text-slate-500">
                    停止方式
                    <select
                      value={stopMode}
                      onChange={(event) => setStopMode(event.target.value as 'timed' | 'persistent')}
                      className="mt-1 w-full rounded-xl border border-pink-100 bg-white p-2 text-xs text-slate-800 outline-none focus:border-pink-300"
                    >
                      <option value="timed">由 AI 决定时长后定时停止</option>
                      <option value="persistent">持续到下一指令/急停</option>
                    </select>
                  </label>
                )}
                {(stopMode === 'timed' || actionType === 'enema_fill' || actionType === 'enema_drain') && (
                  <label className="block text-[10px] font-bold text-slate-500">
                    AI 可选最大时长（秒）
                    <input
                      type="number"
                      min="1"
                      max={actionType === 'enema_fill' || actionType === 'enema_drain' ? Math.max(1, enemaMaximum) : 3600}
                      value={maximumDurationSec}
                      onChange={(event) => setMaximumDurationSec(Number(event.target.value))}
                      className="mt-1 w-full rounded-xl border border-pink-100 bg-white p-2 text-xs text-slate-800 outline-none focus:border-pink-300"
                    />
                  </label>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowEditor(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition active:scale-95"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!keywords.trim() || !content.trim()}
                className="flex-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 py-2 text-xs font-bold text-white shadow-sm shadow-pink-500/20 disabled:opacity-40 transition active:scale-95"
              >
                保存规则
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const TavernLorebookTab: React.FC = () => {
  const [panel, setPanel] = useState<'story' | 'hardware'>('story');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-2xl border border-pink-100/90 bg-white/80 p-1 backdrop-blur-md shadow-xs">
        <button
          type="button"
          onClick={() => setPanel('story')}
          aria-pressed={panel === 'story'}
          className={`rounded-xl py-2 text-[10px] font-black transition ${
            panel === 'story'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm shadow-pink-500/20'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          📚 剧情世界书
        </button>
        <button
          type="button"
          onClick={() => setPanel('hardware')}
          aria-pressed={panel === 'hardware'}
          className={`rounded-xl py-2 text-[10px] font-black transition ${
            panel === 'hardware'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm shadow-pink-500/20'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          ⚡ 硬件触发规则
        </button>
      </div>
      {panel === 'story' ? <TavernWorldbookManager /> : <TavernHardwareLorebookPanel />}
    </div>
  );
};
