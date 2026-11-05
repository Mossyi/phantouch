import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BatteryLow, BedDouble, CalendarDays, Dices, Footprints, Gift, Map as MapIcon, MessageCircleHeart, Settings2, Sparkles, Star, Target, UserRound, Wrench, X, Zap } from 'lucide-react';
import {
  RPG_CUSTOM_TEMPLATE_ID,
  RPG_KIND_META,
  RPG_LOW_STAMINA,
  RPG_PERIOD_LABELS,
  RPG_CHECK_LABELS,
  RPG_SERVICE_LABELS,
  RPG_STAT_HINTS,
  RPG_STAT_LABELS,
  RPG_TEMPLATES,
  checkModifier,
  getLocation,
  getReachableLocations,
  type RpgChoice,
  type RpgHardwareSettings,
  type RpgLocation,
  type RpgQuest,
  type RpgStatKey,
  type RpgTraineeStats,
  type TavernRpgState,
} from '../../core/tavern/tavernRpg';

export type RpgSystemAction =
  | { type: 'travel'; locationId: string }
  | { type: 'buy'; item: string }
  | { type: 'work' }
  | { type: 'rest' }
  | { type: 'use'; item: string };

const dayLabel = (state: TavernRpgState) => (state.dayLimit ? `第${state.day}/${state.dayLimit}天` : `第${state.day}天`);

const StaminaBar: React.FC<{ value: number; className?: string }> = ({ value, className = 'w-12' }) => (
  <span className={`relative h-1.5 overflow-hidden rounded-full bg-amber-100 ${className}`}>
    <span
      className={`absolute inset-y-0 left-0 rounded-full ${value >= 50 ? 'bg-emerald-500' : value >= RPG_LOW_STAMINA ? 'bg-amber-500' : 'bg-rose-500'}`}
      style={{ width: `${value}%` }}
    />
  </span>
);

// ─── 顶部状态条 ────────────────────────────────────────────────────────────────

export const TavernRpgHud: React.FC<{ state: TavernRpgState; onOpen: () => void }> = ({ state, onOpen }) => {
  const location = getLocation(state, state.currentId);
  return (
    <div className="relative z-10 w-full px-3 pb-0.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label="打开日程面板"
        className="liquid-glass flex w-full items-center gap-2.5 rounded-2xl px-3 py-1.5 text-left text-[10px] text-slate-700"
      >
        <span className="flex max-w-[6.5rem] shrink-0 items-center gap-1 font-bold text-slate-800">
          <span aria-hidden>{location ? RPG_KIND_META[location.kind].icon : '📍'}</span>
          <span className="truncate">{location?.name ?? '未知'}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1" title={`你的体力 ${state.stamina}/100`}>
          {state.stamina < RPG_LOW_STAMINA ? <BatteryLow className="h-3 w-3 text-rose-500" /> : <Zap className="h-3 w-3 text-amber-500" />}
          <StaminaBar value={state.stamina} />
          <span className="tabular-nums">{state.stamina}</span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 tabular-nums" title="积分"><Star className="h-3 w-3 text-amber-500" />{state.points}</span>
        <span className="hidden min-w-0 truncate text-slate-500 min-[380px]:inline">{dayLabel(state)}·{RPG_PERIOD_LABELS[state.period]}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 font-bold text-pink-600">
          <CalendarDays className="h-3 w-3" />日程
        </span>
      </button>
    </div>
  );
};

// ─── 推荐互动与系统动作 ────────────────────────────────────────────────────────

export const TavernRpgChoices: React.FC<{
  state: TavernRpgState;
  disabled: boolean;
  onPick: (choice: RpgChoice) => void;
  onAction: (action: RpgSystemAction) => void;
  onOpenShop: () => void;
}> = ({ state, disabled, onPick, onAction, onOpenShop }) => {
  const here = getLocation(state, state.currentId);
  const reachable = getReachableLocations(state);
  // AI 推荐的「去某地」和前往按钮重复时，只保留前往按钮（移动由系统完成，更可靠）
  const travelNames = new Set(reachable.map((location) => location.name));
  const choices = state.choices.filter((choice) => {
    const match = choice.text.match(/^(?:一起|带她|带他)?(?:去|前往|回到|走向|进入)(.+)$/);
    return choice.check || !match || !travelNames.has(match[1].trim());
  });
  const chip = 'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold shadow-xs transition disabled:opacity-50';
  return (
    // 每回合换一组选项时从头显示
    <div key={`${state.turn}-${state.currentId}`} className="flex items-center gap-1.5 overflow-x-auto px-1 scrollbar-none" data-allow-scroll>
      {choices.map((choice) => {
        const mod = choice.check ? checkModifier(state, choice.check.stat) : 0;
        return (
          <button key={choice.text} type="button" disabled={disabled} onClick={() => onPick(choice)} className={`${chip} border-pink-200 bg-white/95 text-slate-700 hover:border-pink-300 hover:text-pink-600`}>
            {choice.check ? <Dices className="h-3 w-3 text-violet-500" /> : <MessageCircleHeart className="h-3 w-3 text-pink-500" />}
            <span>{choice.text}</span>
            {choice.check && <span className="font-medium text-violet-600">{RPG_CHECK_LABELS[choice.check.stat]}{mod >= 0 ? `+${mod}` : mod} / {choice.check.dc}</span>}
          </button>
        );
      })}
      {here?.services.includes('rest') && (
        <button type="button" disabled={disabled} onClick={() => onAction({ type: 'rest' })} className={`${chip} border-indigo-200 bg-indigo-50/90 text-indigo-800`}>
          <BedDouble className="h-3 w-3" />休息到明天
        </button>
      )}
      {here?.services.includes('work') && state.period < 3 && (
        <button type="button" disabled={disabled} onClick={() => onAction({ type: 'work' })} className={`${chip} border-emerald-200 bg-emerald-50/90 text-emerald-800`}>
          <Wrench className="h-3 w-3" />做差事 +{here.pay}
        </button>
      )}
      {here?.services.includes('shop') && (
        <button type="button" disabled={disabled} onClick={onOpenShop} className={`${chip} border-amber-200 bg-amber-50/90 text-amber-800`}>
          <Gift className="h-3 w-3" />兑换奖励
        </button>
      )}
      {reachable.slice(0, 5).map((location) => (
        <button key={location.id} type="button" disabled={disabled} onClick={() => onAction({ type: 'travel', locationId: location.id })} className={`${chip} border-sky-200 bg-sky-50/90 text-sky-800`}>
          <Footprints className="h-3 w-3" />去{location.name}
        </button>
      ))}
    </div>
  );
};

// ─── 地图 ──────────────────────────────────────────────────────────────────────

const CELL = 78;
const PAD = 46;

const RpgMap: React.FC<{ state: TavernRpgState; selectedId: string; onSelect: (id: string) => void }> = ({ state, selectedId, onSelect }) => {
  const visible = state.locations.filter((loc) => loc.discovered);
  const reachableIds = new Set(getReachableLocations(state).map((loc) => loc.id));
  const xs = visible.map((loc) => loc.x);
  const ys = visible.map((loc) => loc.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = (Math.max(...xs) - minX) * CELL + PAD * 2;
  const height = (Math.max(...ys) - minY) * CELL + PAD * 2;
  const pos = (loc: RpgLocation) => ({ cx: (loc.x - minX) * CELL + PAD, cy: (loc.y - minY) * CELL + PAD });
  const byId = new Map(visible.map((loc) => [loc.id, loc]));

  return (
    <div className="overflow-auto rounded-2xl border border-pink-100 bg-[radial-gradient(circle_at_1px_1px,rgba(190,24,93,0.08)_1px,transparent_0)] [background-size:16px_16px]" data-allow-scroll>
      <svg role="img" aria-label="日程地图" viewBox={`0 0 ${width} ${height}`} width={Math.max(width, 280)} height={height} className="mx-auto block max-w-none">
        {state.edges.map(([a, b]) => {
          const from = byId.get(a);
          const to = byId.get(b);
          if (!from || !to) return null;
          const p1 = pos(from);
          const p2 = pos(to);
          const active = a === state.currentId || b === state.currentId;
          return (
            <line
              key={`${a}-${b}`}
              x1={p1.cx}
              y1={p1.cy}
              x2={p2.cx}
              y2={p2.cy}
              stroke={active ? 'var(--brand, #db2777)' : 'rgba(100,116,139,0.35)'}
              strokeWidth={active ? 2.5 : 2}
              strokeDasharray={from.visited && to.visited ? undefined : '4 4'}
            />
          );
        })}
        {visible.map((loc) => {
          const { cx, cy } = pos(loc);
          const current = loc.id === state.currentId;
          const reachable = reachableIds.has(loc.id);
          const selected = loc.id === selectedId;
          return (
            <g
              key={loc.id}
              role="button"
              tabIndex={0}
              aria-label={`${loc.name}${current ? '（当前位置）' : reachable ? '（可前往）' : ''}`}
              onClick={() => onSelect(loc.id)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(loc.id); }}
              style={{ cursor: 'pointer', opacity: loc.visited || current || reachable ? 1 : 0.55 }}
            >
              {current && <circle cx={cx} cy={cy} r={27} fill="none" stroke="var(--brand, #db2777)" strokeWidth={2} opacity={0.35}><animate attributeName="r" values="23;29;23" dur="2.4s" repeatCount="indefinite" /></circle>}
              <circle
                cx={cx}
                cy={cy}
                r={20}
                fill={current ? 'var(--brand, #db2777)' : '#ffffff'}
                stroke={selected ? '#7c3aed' : reachable ? 'var(--brand, #db2777)' : 'rgba(100,116,139,0.45)'}
                strokeWidth={selected ? 3 : 2}
                strokeDasharray={reachable && !current ? '3 3' : undefined}
              />
              <text x={cx} y={cy + 6} textAnchor="middle" fontSize={17}>{RPG_KIND_META[loc.kind].icon}</text>
              {loc.services.length > 0 && <circle cx={cx + 15} cy={cy - 15} r={4} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />}
              <text x={cx} y={cy + 34} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ink, #1f2937)">{loc.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ─── 开局 ──────────────────────────────────────────────────────────────────────

type CustomSetup = { worldName?: string; premise?: string; startName?: string; dayLimit?: number };

const RpgSetup: React.FC<{ charName: string; userName: string; onStart: (templateId: string, custom?: CustomSetup) => void }> = ({ charName, userName, onStart }) => {
  const [templateId, setTemplateId] = useState(RPG_TEMPLATES[0].id);
  const [custom, setCustom] = useState({ worldName: '', premise: '', startName: '', dayLimit: 30 });
  const isCustom = templateId === RPG_CUSTOM_TEMPLATE_ID;
  const input = 'mt-1 w-full rounded-lg border border-pink-200 bg-pink-50/30 px-2.5 py-2 text-[11px] text-slate-800 outline-none focus:border-pink-400';
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-5 text-slate-600">
        {charName}是调教者，{userName}是被调教的一方。每天分四个时段，由{charName}安排课程、下达指令；训练会消耗你的体力，回卧室休息到第二天恢复。你的服从、耐受、羞耻、依恋由系统记录，达成目标能拿积分换奖励。
      </p>
      <div className="grid grid-cols-2 gap-2">
        {RPG_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => setTemplateId(template.id)}
            className={`rounded-2xl border p-3 text-left transition ${templateId === template.id ? 'border-pink-400 bg-pink-50 shadow-sm' : 'border-pink-100 bg-white hover:border-pink-200'}`}
          >
            <span className="block text-[12px] font-black text-slate-800">{template.name}</span>
            <span className="mt-0.5 block text-[9.5px] text-slate-500">{template.tagline}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTemplateId(RPG_CUSTOM_TEMPLATE_ID)}
          className={`col-span-2 rounded-2xl border p-3 text-left transition ${isCustom ? 'border-pink-400 bg-pink-50 shadow-sm' : 'border-pink-100 bg-white hover:border-pink-200'}`}
        >
          <span className="block text-[12px] font-black text-slate-800">自定义</span>
          <span className="mt-0.5 block text-[9.5px] text-slate-500">从你的住处出发，其他地点由 AI 在剧情里慢慢添加</span>
        </button>
      </div>
      {isCustom && (
        <div className="space-y-2 rounded-2xl border border-pink-100 bg-white p-3">
          <label className="block text-[10px] font-bold text-slate-700">名称
            <input value={custom.worldName} maxLength={16} onChange={(event) => setCustom({ ...custom, worldName: event.target.value })} placeholder="例如：魅魔的城堡" className={input} />
          </label>
          <label className="block text-[10px] font-bold text-slate-700">住处
            <input value={custom.startName} maxLength={12} onChange={(event) => setCustom({ ...custom, startName: event.target.value })} placeholder="例如：阁楼卧室" className={input} />
          </label>
          <label className="block text-[10px] font-bold text-slate-700">期限（天，0 为不限）
            <input type="number" min={0} max={365} value={custom.dayLimit} onChange={(event) => setCustom({ ...custom, dayLimit: Number(event.target.value) })} className={input} />
          </label>
          <label className="block text-[10px] font-bold text-slate-700">背景
            <textarea value={custom.premise} maxLength={400} rows={3} onChange={(event) => setCustom({ ...custom, premise: event.target.value })} placeholder="TA 为什么调教你，你们约定了什么？" className={`${input} resize-none leading-5`} />
          </label>
        </div>
      )}
      <button
        type="button"
        onClick={() => onStart(templateId, isCustom ? custom : undefined)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-2.5 text-[12px] font-black text-white shadow-sm"
      >
        <CalendarDays className="h-4 w-4" />开始第一天
      </button>
    </div>
  );
};

// ─── 目标进度 ──────────────────────────────────────────────────────────────────

const QuestCard: React.FC<{ quest: RpgQuest; stats: RpgTraineeStats }> = ({ quest, stats }) => {
  const condition = quest.condition;
  const value = condition ? stats[condition.stat] : 0;
  const progress = condition
    ? condition.op === 'gte'
      ? Math.min(100, Math.round((value / Math.max(1, condition.value)) * 100))
      : value <= condition.value ? 100 : Math.round((condition.value / Math.max(1, value)) * 100)
    : 0;
  return (
    <div className={`rounded-2xl border p-3 ${quest.status === 'active' ? 'border-pink-100 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'}`}>
      <p className="flex items-center justify-between gap-2 text-[12px] font-black text-slate-800">
        <span>{quest.title}</span>
        <span className={`text-[10px] font-bold ${quest.status === 'active' ? 'text-pink-600' : quest.status === 'done' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {quest.status === 'active' ? (quest.reward ? `奖励 ${quest.reward}` : '进行中') : quest.status === 'done' ? '已达成' : '已失败'}
        </span>
      </p>
      {quest.objective && <p className="mt-1 text-[11px] text-slate-600">{quest.objective}</p>}
      {condition && quest.status === 'active' && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
          <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-pink-100"><span className="absolute inset-y-0 left-0 rounded-full bg-pink-500" style={{ width: `${progress}%` }} /></span>
          <span className="tabular-nums">{RPG_STAT_LABELS[condition.stat]} {value}</span>
        </div>
      )}
    </div>
  );
};

// ─── 面板 ──────────────────────────────────────────────────────────────────────

export type RpgPanelTab = 'map' | 'bag' | 'goals' | 'log' | 'settings';

export interface TavernRpgPanelProps {
  state: TavernRpgState | null;
  charName: string;
  userName: string;
  busy: boolean;
  emsCeiling: number;
  initialTab?: RpgPanelTab;
  onStart: (templateId: string, custom?: CustomSetup) => void;
  onAction: (action: RpgSystemAction) => void;
  onEnd: () => void;
  onUpdateHardware: (settings: RpgHardwareSettings) => void;
  onClose: () => void;
}

export const TavernRpgPanel: React.FC<TavernRpgPanelProps> = ({ state, charName, userName, busy, emsCeiling, initialTab = 'map', onStart, onAction, onEnd, onUpdateHardware, onClose }) => {
  const [tab, setTab] = useState<RpgPanelTab>(initialTab);
  const [selectedId, setSelectedId] = useState(state?.currentId ?? '');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const selected = state ? getLocation(state, selectedId) ?? getLocation(state, state.currentId) : null;
  const reachableIds = useMemo(() => new Set(state ? getReachableLocations(state).map((loc) => loc.id) : []), [state]);

  React.useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const act = (action: RpgSystemAction) => {
    onAction(action);
    onClose();
  };

  const tabs: Array<{ id: RpgPanelTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'map', label: '地图', icon: MapIcon },
    { id: 'bag', label: '状态', icon: UserRound },
    { id: 'goals', label: '目标', icon: Target },
    { id: 'log', label: '日志', icon: Sparkles },
    { id: 'settings', label: '设置', icon: Settings2 },
  ];

  const isHere = selected?.id === state?.currentId;

  const body = (
    <div onClick={onClose} className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="训练日程"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl border border-pink-200 bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-pink-100 px-4 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-[13px] font-black text-slate-800"><CalendarDays className="h-4 w-4 text-pink-500" />{state ? state.worldName : '训练日程'}</h3>
            {state && <p className="text-[10px] text-slate-500">{dayLabel(state)} · {RPG_PERIOD_LABELS[state.period]} · 体力 {state.stamina} · 积分 {state.points}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-1.5 text-slate-500 hover:bg-pink-50"><X className="h-4 w-4" /></button>
        </div>

        {!state ? (
          <div className="overflow-y-auto p-4" data-allow-scroll><RpgSetup charName={charName} userName={userName} onStart={onStart} /></div>
        ) : (
          <>
            <div className="flex shrink-0 gap-1 border-b border-pink-50 px-3 py-2" role="tablist">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-xl px-1.5 py-1.5 text-[10.5px] font-bold transition ${tab === item.id ? 'bg-pink-50 text-pink-700' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <item.icon className="h-3.5 w-3.5" />{item.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" data-allow-scroll>
              {state.dayLimit > 0 && state.day > state.dayLimit && (
                <p className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] text-violet-800">约定的 {state.dayLimit} 天已经结束。可以继续过下去，也可以在设置里结束这段日程。</p>
              )}

              {tab === 'map' && (
                <>
                  <RpgMap state={state} selectedId={selected?.id ?? ''} onSelect={setSelectedId} />
                  {selected && (
                    <div className="space-y-2 rounded-2xl border border-pink-100 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-black text-slate-800">{RPG_KIND_META[selected.kind].icon} {selected.name}</p>
                          <p className="text-[10px] text-slate-500">{RPG_KIND_META[selected.kind].label}{selected.services.length ? ` · 可${selected.services.map((service) => RPG_SERVICE_LABELS[service]).join('、')}` : ''}</p>
                        </div>
                        {isHere ? (
                          <span className="shrink-0 rounded-full bg-pink-50 px-2 py-1 text-[10px] font-bold text-pink-600">你在这里</span>
                        ) : reachableIds.has(selected.id) ? (
                          <button type="button" disabled={busy} onClick={() => act({ type: 'travel', locationId: selected.id })} className="flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50">
                            <Footprints className="h-3.5 w-3.5" />前往
                          </button>
                        ) : (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">不相邻</span>
                        )}
                      </div>
                      <p className="text-[11px] leading-5 text-slate-600">{selected.description}</p>
                      {isHere && selected.services.includes('rest') && (
                        <button type="button" disabled={busy} onClick={() => act({ type: 'rest' })} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-800 disabled:opacity-50">
                          <BedDouble className="h-3.5 w-3.5" />休息，结束第 {state.day} 天
                        </button>
                      )}
                      {isHere && selected.services.includes('work') && (
                        <button type="button" disabled={busy || state.period >= 3} onClick={() => act({ type: 'work' })} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 disabled:opacity-50">
                          <Wrench className="h-3.5 w-3.5" />{state.period >= 3 ? '太晚了，先休息' : `做一个时段的差事（体力 -10），+${selected.pay} 积分`}
                        </button>
                      )}
                      {isHere && selected.services.includes('shop') && (
                        <div className="space-y-1.5">
                          {selected.catalog.map((item) => (
                            <div key={item.name} className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-1.5">
                              <span className="min-w-0 flex-1">
                                <span className="block text-[11px] font-bold text-slate-800">{item.name}</span>
                                <span className="block text-[9.5px] text-slate-500">{item.note}</span>
                              </span>
                              <button type="button" disabled={busy || state.points < item.price} onClick={() => act({ type: 'buy', item: item.name })} className="flex shrink-0 items-center gap-0.5 rounded-lg bg-amber-500 px-2.5 py-1 text-[10.5px] font-black text-white disabled:opacity-40">
                                <Star className="h-3 w-3" />{item.price}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500">虚线圈是现在能去的地点，带橙点的地点可以休息、兑换奖励或做差事。剧情里去了新地方，AI 会把它加到地图上。</p>
                </>
              )}

              {tab === 'bag' && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-2xl border border-pink-100 bg-white p-2.5">
                      <p className="text-[10px] text-slate-500">你的体力</p>
                      <p className={`text-[16px] font-black ${state.stamina < RPG_LOW_STAMINA ? 'text-rose-600' : 'text-slate-800'}`}>{state.stamina}<span className="text-[10px] text-slate-400">/100</span></p>
                      <StaminaBar value={state.stamina} className="mx-auto mt-1 block w-24" />
                    </div>
                    <div className="rounded-2xl border border-pink-100 bg-white p-2.5">
                      <p className="text-[10px] text-slate-500">积分</p>
                      <p className="text-[16px] font-black text-amber-600">{state.points}</p>
                      <p className="text-[9px] text-slate-500">差事、目标和调教者的奖励</p>
                    </div>
                  </div>
                  {state.stamina < RPG_LOW_STAMINA && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[10.5px] text-rose-700">体力偏低：所有检定 -2。回卧室休息到第二天就能恢复。</p>}
                  <div className="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/30 p-3">
                    <p className="text-[11px] font-black text-slate-700">训练属性</p>
                    {(Object.keys(RPG_STAT_LABELS) as RpgStatKey[]).map((key) => {
                      const mod = checkModifier(state, key);
                      return (
                        <div key={key} className="flex items-center gap-2 text-[10.5px]">
                          <span className="w-9 shrink-0 font-bold text-slate-700">{RPG_STAT_LABELS[key]}</span>
                          <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-violet-100">
                            <span className={`absolute inset-y-0 left-0 rounded-full ${key === 'shame' ? 'bg-rose-400' : 'bg-violet-500'}`} style={{ width: `${state.trainee[key]}%` }} />
                          </span>
                          <span className="w-7 shrink-0 text-right tabular-nums text-slate-700">{state.trainee[key]}</span>
                          <span className="w-16 shrink-0 text-right text-[9.5px] text-violet-600">检定 {mod >= 0 ? `+${mod}` : mod}</span>
                        </div>
                      );
                    })}
                    <p className="text-[9.5px] leading-4 text-slate-500">{(Object.keys(RPG_STAT_HINTS) as RpgStatKey[]).map((key) => `${RPG_STAT_LABELS[key]}：${RPG_STAT_HINTS[key]}`).join('；')}</p>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] font-black text-slate-700">背包</p>
                    {state.inventory.length ? (
                      <div className="space-y-1.5">
                        {state.inventory.map((item) => (
                          <div key={item.name} className="flex items-center justify-between gap-2 rounded-xl border border-pink-100 bg-white px-3 py-1.5">
                            <span className="text-[11px] text-slate-700">{item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}{item.effect?.stamina ? <span className="ml-1 text-[9.5px] text-emerald-600">体力 +{item.effect.stamina}</span> : null}</span>
                            {item.effect?.pardon ? (
                              <span className="text-[10px] text-slate-500">失败时自动使用</span>
                            ) : (
                              <button type="button" disabled={busy} onClick={() => act({ type: 'use', item: item.name })} className="rounded-lg border border-pink-200 px-2.5 py-1 text-[10.5px] font-bold text-pink-600 hover:bg-pink-50 disabled:opacity-50">使用</button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-[11px] text-slate-500">空空如也，攒积分去兑换吧。</p>}
                  </div>
                </>
              )}

              {tab === 'goals' && (
                state.quests.length ? (
                  <div className="space-y-2">{state.quests.map((quest) => <QuestCard key={quest.title} quest={quest} stats={state.trainee} />)}</div>
                ) : <p className="text-[11px] text-slate-500">还没有目标。剧情里出现的约定和任务会记在这里。</p>
              )}

              {tab === 'log' && (
                <ol className="space-y-1">
                  {state.log.slice().reverse().map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className={`text-[11px] ${entry.tone === 'good' ? 'text-emerald-700' : entry.tone === 'bad' ? 'text-rose-700' : entry.tone === 'warn' ? 'text-amber-700' : 'text-slate-600'}`}>· {entry.text}</li>
                  ))}
                </ol>
              )}

              {tab === 'settings' && (
                <>
                  <div className="space-y-2.5 rounded-2xl border border-pink-100 bg-white p-3">
                    <p className="text-[11px] font-black text-slate-800">检定的硬件奖惩</p>
                    <label className="flex items-center justify-between gap-3">
                      <span>
                        <span className="flex items-center gap-1 text-[11.5px] font-bold text-slate-800"><Zap className="h-3.5 w-3.5 text-pink-500" />失败时电击</span>
                        <span className="block text-[10px] text-slate-500">{emsCeiling > 0 ? '你没做到时电击；有免罚券会自动抵掉。到时自动停止，受全局安全上限和急停约束' : '当前安全上限为 0，无法启用'}</span>
                      </span>
                      <input type="checkbox" checked={state.hardware.punishOnFail && emsCeiling > 0} disabled={emsCeiling <= 0} onChange={(event) => onUpdateHardware({ ...state.hardware, punishOnFail: event.target.checked })} className="h-4 w-4 accent-pink-500" />
                    </label>
                    {state.hardware.punishOnFail && emsCeiling > 0 && (
                      <>
                        <label className="block text-[10px] font-bold text-slate-700">强度 {Math.min(state.hardware.punishLevel, emsCeiling)}（安全上限 {emsCeiling}）
                          <input type="range" min={1} max={emsCeiling} value={Math.min(state.hardware.punishLevel, emsCeiling)} onChange={(event) => onUpdateHardware({ ...state.hardware, punishLevel: Number(event.target.value) })} className="mt-1 w-full accent-pink-500" />
                        </label>
                        <label className="block text-[10px] font-bold text-slate-700">持续 {state.hardware.punishSeconds} 秒
                          <input type="range" min={1} max={5} value={state.hardware.punishSeconds} onChange={(event) => onUpdateHardware({ ...state.hardware, punishSeconds: Number(event.target.value) })} className="mt-1 w-full accent-pink-500" />
                        </label>
                      </>
                    )}
                    <label className="flex items-center justify-between gap-3 border-t border-pink-50 pt-2.5">
                      <span>
                        <span className="text-[11.5px] font-bold text-slate-800">成功时震动奖励</span>
                        <span className="block text-[10px] text-slate-500">你做到时玩具轻震 2 秒</span>
                      </span>
                      <input type="checkbox" checked={state.hardware.rewardOnSuccess} onChange={(event) => onUpdateHardware({ ...state.hardware, rewardOnSuccess: event.target.checked })} className="h-4 w-4 accent-pink-500" />
                    </label>
                  </div>
                  {confirmEnd ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
                      <span className="flex-1 text-[11px] text-rose-800">结束后地图、训练属性和背包都会清空，聊天记录保留。</span>
                      <button type="button" onClick={() => setConfirmEnd(false)} className="rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-slate-600">取消</button>
                      <button type="button" onClick={onEnd} className="rounded-xl bg-rose-500 px-2.5 py-1.5 text-[11px] font-black text-white">结束</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmEnd(true)} className="w-full rounded-2xl border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50">结束这段日程</button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null;
};
