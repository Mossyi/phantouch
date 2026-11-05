import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BatteryLow, BedDouble, CalendarDays, Telescope, Wand2, Megaphone, Save, FolderOpen, Trash2, History, CheckCircle2, Circle, Dices, Footprints, Gift, Gavel, HeartPulse, ImagePlus, Loader2, Lock,
  Map as MapIcon, MessageCircleHeart, NotebookText, Plus, RefreshCw, ScrollText, Settings2, Star, Trophy, UserRound, Wrench, X, Zap,
} from 'lucide-react';
import { RPG_ICON_CREDIT, RPG_ICON_PATHS } from '../../core/tavern/rpgIcons';
import type { TavernCharacterExpressions, TavernEmotionKey } from '../../core/tavern/tavernTypes';
import { KIND_ICONS, PERIOD_ICONS, RpgIcon, STAGE_ICONS, courseIcon, itemIcon, traitIcon } from './RpgIcon';
import type { GeneratedWorld, WorldGenInput } from '../../core/tavern/tavernRpgWorldGen';
import type { RpgSaveSlot } from '../../core/tavern/tavernRpgSlots';
import {
  LEVEL_NAMES,
  RPG_CHECK_LABELS,
  RPG_HIGH_STRESS,
  RPG_KIND_META,
  RPG_LOW_STAMINA,
  RPG_MAX_STRESS,
  RPG_PERIOD_LABELS,
  RPG_SERVICE_LABELS,
  RPG_STAT_HINTS,
  RPG_STAT_LABELS,
  RPG_TEMPLATES,
  STAGES,
  STAT_KEYS,
  activeSummon,
  checkModifier,
  createRpgStateFromTemplate,
  findCourse,
  getCoursesHere,
  getLocation,
  getReachableLocations,
  getTrait,
  isLocationOpen,
  statLevel,
  type CourseAvailability,
  type RpgChoice,
  type RpgDailyReport,
  type RpgHardwareSettings,
  type RpgLocation,
  type RpgQuest,
  type RpgStatKey,
  type RpgTraineeStats,
  type TavernRpgState,
} from '../../core/tavern/tavernRpg';

export type RpgSystemAction =
  | { type: 'travel'; locationId: string }
  | { type: 'course'; courseId: string }
  | { type: 'buy'; item: string }
  | { type: 'work' }
  | { type: 'rest' }
  | { type: 'use'; item: string }
  | { type: 'renew' };

const dayLabel = (state: TavernRpgState) => (state.dayLimit ? `第${state.day}/${state.dayLimit}天` : `第${state.day}天`);
const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const isImageSource = (value?: string) => Boolean(value && /^(?:https:|data:image\/|blob:)/i.test(value.trim()));

export interface RpgPortrait {
  avatar?: string;
  expressions?: TavernCharacterExpressions;
}

/** 调教者头像：有对应表情差分时用差分，否则用头像；头像是 emoji 时直接显示文字 */
const TrainerPortrait: React.FC<{ portrait: RpgPortrait; mood?: TavernEmotionKey; className?: string }> = ({ portrait, mood = 'neutral', className = 'h-12 w-12' }) => {
  const src = portrait.expressions?.[mood] || portrait.expressions?.neutral || portrait.avatar;
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-pink-200 bg-pink-50 text-2xl ${className}`}>
      {isImageSource(src) ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span aria-hidden>{src || '🙂'}</span>}
    </span>
  );
};

/** 地点插画横幅：有图显示图，没有就显示图标和生成按钮 */
const LocationBanner: React.FC<{
  location: RpgLocation;
  art?: string;
  busy: boolean;
  onGenerate?: () => void;
  className?: string;
}> = ({ location, art, busy, onGenerate, className = 'aspect-[16/9]' }) => (
  <div className={`relative w-full overflow-hidden rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-violet-50 ${className}`}>
    {art ? (
      <img src={art} alt={`${location.name}插画`} className="h-full w-full object-cover" />
    ) : (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-pink-300">
        <RpgIcon name={KIND_ICONS[location.kind]} className="h-12 w-12" />
        {onGenerate && <span className="text-[10px] text-slate-400">还没有插画</span>}
      </div>
    )}
    <span className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[10.5px] font-bold text-white backdrop-blur-sm">{location.name}</span>
    {onGenerate && (
      <button type="button" disabled={busy} onClick={onGenerate}
        className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-pink-600 shadow-sm backdrop-blur-sm disabled:opacity-60">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : art ? <RefreshCw className="h-3 w-3" /> : <ImagePlus className="h-3 w-3" />}
        {busy ? '正在画…' : art ? '重画' : 'AI 画插画'}
      </button>
    )}
  </div>
);

const Bar: React.FC<{ value: number; tone: 'stamina' | 'stress' | 'stat' | 'shame'; className?: string }> = ({ value, tone, className = 'w-12' }) => {
  const color = tone === 'stamina'
    ? value >= 50 ? 'bg-emerald-500' : value >= RPG_LOW_STAMINA ? 'bg-amber-500' : 'bg-rose-500'
    : tone === 'stress'
      ? value >= RPG_MAX_STRESS ? 'bg-rose-600' : value >= RPG_HIGH_STRESS ? 'bg-amber-500' : 'bg-sky-400'
      : tone === 'shame' ? 'bg-rose-400' : 'bg-violet-500';
  return (
    <span className={`relative h-1.5 overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${value}%` }} />
    </span>
  );
};

const courseCheckText = (state: TavernRpgState, entry: CourseAvailability) => {
  const { check } = entry.course;
  if (!check) return '放松';
  const mod = checkModifier(state, check.stat);
  return `${RPG_CHECK_LABELS[check.stat]}${signed(mod)} / ${check.dc}`;
};

// ─── 顶部状态条 ────────────────────────────────────────────────────────────────

export const TavernRpgHud: React.FC<{ state: TavernRpgState; art?: string; onOpen: () => void }> = ({ state, art, onOpen }) => {
  const location = getLocation(state, state.currentId);
  const summon = activeSummon(state);
  const summonTarget = summon?.target ? getLocation(state, summon.target)?.name : undefined;
  return (
    <div className="relative z-10 w-full px-3 pb-0.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label="打开训练日程"
        className="liquid-glass flex w-full items-center gap-2.5 rounded-2xl px-3 py-1.5 text-left text-[10px] text-slate-700"
      >
        <span className="flex max-w-[7rem] shrink-0 items-center gap-1.5 font-bold text-slate-800">
          {art ? (
            <img src={art} alt="" className="h-5 w-7 shrink-0 rounded-md object-cover" />
          ) : location ? (
            <RpgIcon name={KIND_ICONS[location.kind]} className="h-3.5 w-3.5 shrink-0 text-pink-500" />
          ) : null}
          <span className="truncate">{location?.name ?? '未知'}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1" title={`你的体力 ${state.stamina}/100`}>
          {state.stamina < RPG_LOW_STAMINA ? <BatteryLow className="h-3 w-3 text-rose-500" /> : <Zap className="h-3 w-3 text-amber-500" />}
          <Bar value={state.stamina} tone="stamina" className="w-10" />
          <span className="tabular-nums">{state.stamina}</span>
        </span>
        {state.stress >= 30 && (
          <span className={`flex shrink-0 items-center gap-0.5 tabular-nums ${state.stress >= RPG_HIGH_STRESS ? 'font-bold text-rose-600' : 'text-sky-700'}`} title={`压力 ${state.stress}/100`}>
            <HeartPulse className="h-3 w-3" />{state.stress}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-0.5 tabular-nums" title="积分"><Star className="h-3 w-3 text-amber-500" />{state.points}</span>
        {summonTarget ? (
          <span className="flex min-w-0 animate-pulse items-center gap-0.5 truncate font-bold text-amber-700" title="调教者传唤">
            <Megaphone className="h-3 w-3 shrink-0" />去{summonTarget}
          </span>
        ) : (
          <span className="hidden min-w-0 truncate text-slate-500 min-[380px]:inline">{dayLabel(state)}·{RPG_PERIOD_LABELS[state.period]}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 font-bold text-pink-600">
          <CalendarDays className="h-3 w-3" />日程
        </span>
      </button>
    </div>
  );
};

// ─── 回应选项与系统动作 ────────────────────────────────────────────────────────

export const TavernRpgChoices: React.FC<{
  state: TavernRpgState;
  disabled: boolean;
  onPick: (choice: RpgChoice) => void;
  onAction: (action: RpgSystemAction) => void;
  onOpenShop: () => void;
}> = ({ state, disabled, onPick, onAction, onOpenShop }) => {
  const here = getLocation(state, state.currentId);
  const reachable = getReachableLocations(state).filter((location) => isLocationOpen(location, state.period));
  // AI 推荐的「去某地」和前往按钮重复时，只保留前往按钮（移动由系统完成，更可靠）
  const travelNames = new Set(reachable.map((location) => location.name));
  const choices = state.choices.filter((choice) => {
    const match = choice.text.match(/^(?:一起|跟着|带我)?(?:去|前往|回到|走向|进入)(.+)$/);
    return choice.check || !match || !travelNames.has(match[1].trim());
  });
  // 课程：今日课表里还没做的排前面，最多三个
  const planned = new Set(state.plan.filter((slot) => !slot.done).map((slot) => slot.courseId));
  const courses = getCoursesHere(state)
    .filter((entry) => entry.available)
    .sort((a, b) => Number(planned.has(b.course.id)) - Number(planned.has(a.course.id)))
    .slice(0, 3);
  const chip = 'flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold shadow-xs transition disabled:opacity-50';
  return (
    <div key={`${state.turn}-${state.currentId}-${state.period}`} className="flex items-center gap-1.5 overflow-x-auto px-1 scrollbar-none" data-allow-scroll>
      {choices.map((choice) => {
        const mod = choice.check ? checkModifier(state, choice.check.stat) : 0;
        return (
          <button key={choice.text} type="button" disabled={disabled} onClick={() => onPick(choice)} className={`${chip} border-pink-200 bg-white/95 text-slate-700 hover:border-pink-300 hover:text-pink-600`}>
            {choice.check ? <Dices className="h-3 w-3 text-violet-500" /> : <MessageCircleHeart className="h-3 w-3 text-pink-500" />}
            <span>{choice.text}</span>
            {choice.check && <span className="font-medium text-violet-600">{RPG_CHECK_LABELS[choice.check.stat]}{signed(mod)} / {choice.check.dc}</span>}
          </button>
        );
      })}
      {courses.map((entry) => (
        <button key={entry.course.id} type="button" disabled={disabled} onClick={() => onAction({ type: 'course', courseId: entry.course.id })} className={`${chip} border-violet-200 bg-violet-50/90 text-violet-800`}>
          <RpgIcon name={courseIcon(entry.course.id)} className="h-3.5 w-3.5" />{entry.course.name}
          {planned.has(entry.course.id) && <span className="rounded-full bg-violet-200/70 px-1 text-[8.5px]">课表</span>}
          <span className="font-medium opacity-80">{courseCheckText(state, entry)}</span>
        </button>
      ))}
      {here?.services.includes('rest') && (
        <button type="button" disabled={disabled} onClick={() => onAction({ type: 'rest' })} className={`${chip} border-indigo-200 bg-indigo-50/90 text-indigo-800`}>
          <BedDouble className="h-3 w-3" />休息到明天
        </button>
      )}
      {here?.services.includes('work') && isLocationOpen(here, state.period) && state.period < 3 && (
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

const RpgMap: React.FC<{ state: TavernRpgState; art: Record<string, string>; selectedId: string; onSelect: (id: string) => void }> = ({ state, art, selectedId, onSelect }) => {
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
        <defs>
          {visible.filter((loc) => art[loc.id]).map((loc) => {
            const { cx, cy } = pos(loc);
            return <clipPath key={loc.id} id={`rpg-node-${loc.id}`}><circle cx={cx} cy={cy} r={18} /></clipPath>;
          })}
        </defs>
        {state.edges.map(([a, b]) => {
          const from = byId.get(a);
          const to = byId.get(b);
          if (!from || !to) return null;
          const p1 = pos(from);
          const p2 = pos(to);
          const active = a === state.currentId || b === state.currentId;
          return (
            <line key={`${a}-${b}`} x1={p1.cx} y1={p1.cy} x2={p2.cx} y2={p2.cy}
              stroke={active ? 'var(--brand, #db2777)' : 'rgba(100,116,139,0.35)'} strokeWidth={active ? 2.5 : 2}
              strokeDasharray={from.visited && to.visited ? undefined : '4 4'} />
          );
        })}
        {visible.map((loc) => {
          const { cx, cy } = pos(loc);
          const current = loc.id === state.currentId;
          const reachable = reachableIds.has(loc.id);
          const open = isLocationOpen(loc, state.period);
          const selected = loc.id === selectedId;
          return (
            <g key={loc.id} role="button" tabIndex={0}
              aria-label={`${loc.name}${current ? '（当前位置）' : reachable ? (open ? '（可前往）' : '（此时不开放）') : ''}`}
              onClick={() => onSelect(loc.id)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(loc.id); }}
              style={{ cursor: 'pointer', opacity: (loc.visited || current || reachable) && open ? 1 : 0.5 }}>
              {current && <circle cx={cx} cy={cy} r={27} fill="none" stroke="var(--brand, #db2777)" strokeWidth={2} opacity={0.35}><animate attributeName="r" values="23;29;23" dur="2.4s" repeatCount="indefinite" /></circle>}
              <circle cx={cx} cy={cy} r={20} fill={current ? 'var(--brand, #db2777)' : '#ffffff'}
                stroke={selected ? '#7c3aed' : reachable ? 'var(--brand, #db2777)' : 'rgba(100,116,139,0.45)'}
                strokeWidth={selected ? 3 : 2} strokeDasharray={reachable && !current ? '3 3' : undefined} />
              {art[loc.id] ? (
                <image href={art[loc.id]} x={cx - 18} y={cy - 18} width={36} height={36} preserveAspectRatio="xMidYMid slice" clipPath={`url(#rpg-node-${loc.id})`} />
              ) : (
                <g transform={`translate(${cx - 11} ${cy - 11}) scale(${22 / 512})`}>
                  <path d={RPG_ICON_PATHS[KIND_ICONS[loc.kind]]} fill={current ? '#ffffff' : 'var(--brand, #db2777)'} />
                </g>
              )}
              {loc.services.length > 0 && <circle cx={cx + 15} cy={cy - 15} r={4} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />}
              {!open && <text x={cx - 16} y={cy - 12} fontSize={11}>🌙</text>}
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

const AI_THEME_IDEAS = ['魅魔的城堡', '海边度假别墅', '魔法学院宿舍', '赛博公寓', '温泉旅馆', '王宫侍从'];

/** AI 生成的世界预览：全图展开、列出地点/课程/家规和修补记录 */
const WorldPreview: React.FC<{ world: GeneratedWorld; charName: string; userName: string }> = ({ world, charName, userName }) => {
  const preview = useMemo(() => {
    const state = createRpgStateFromTemplate(world.template, { char: charName, user: userName }, { courses: world.courses, events: world.events });
    return { ...state, locations: state.locations.map((loc) => ({ ...loc, discovered: true, visited: true })) };
  }, [world, charName, userName]);
  return (
    <div className="space-y-2 rounded-2xl border border-violet-200 bg-violet-50/30 p-3">
      <p className="text-[13px] font-black text-slate-800">{preview.worldName}</p>
      <p className="text-[10.5px] leading-5 text-slate-600">{preview.premise}</p>
      <RpgMap state={preview} art={{}} selectedId="" onSelect={() => undefined} />
      <div className="flex flex-wrap gap-1">
        {preview.locations.map((loc) => (
          <span key={loc.id} title={loc.description} className="flex items-center gap-1 rounded-full border border-pink-100 bg-white px-2 py-0.5 text-[10px] text-slate-700">
            <RpgIcon name={KIND_ICONS[loc.kind]} className="h-3 w-3 text-pink-500" />{loc.name}{loc.open.length ? ` · ${loc.open.map((p) => RPG_PERIOD_LABELS[p]).join('/')}` : ''}
          </span>
        ))}
      </div>
      {world.courses.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10.5px] font-black text-slate-700">专属课程</p>
          {world.courses.map((course) => (
            <p key={course.id} className="flex items-center gap-1 text-[10.5px] text-slate-600">
              <RpgIcon name={courseIcon(course.id)} className="h-3.5 w-3.5 shrink-0 text-violet-500" />
              <span className="font-bold text-slate-800">{course.name}</span>
              <span className="truncate">{course.description}</span>
              <span className="shrink-0 text-violet-600">{course.check ? `${RPG_CHECK_LABELS[course.check.stat]} ${course.check.dc}` : '放松'}{course.unlock ? ` · Lv${course.unlock.level}` : ''}</span>
            </p>
          ))}
        </div>
      )}
      {preview.rules.length > 0 && <p className="text-[10.5px] text-slate-600"><span className="font-black text-slate-700">家规：</span>{preview.rules.map((rule) => rule.text).join('；')}</p>}
      {world.fixes.length > 0 && <p className="text-[9.5px] text-amber-700">系统修补：{world.fixes.join('；')}</p>}
    </div>
  );
};

const RpgSetup: React.FC<{
  charName: string;
  userName: string;
  onStart: (templateId: string, custom?: CustomSetup) => void;
  onGenerateWorld: (input: WorldGenInput) => Promise<GeneratedWorld>;
  onStartGenerated: (world: GeneratedWorld) => void;
}> = ({ charName, userName, onStart, onGenerateWorld, onStartGenerated }) => {
  const [templateId, setTemplateId] = useState('ai');
  const [custom, setCustom] = useState({ worldName: '', premise: '', startName: '', dayLimit: 30 });
  const [aiInput, setAiInput] = useState<WorldGenInput>({ theme: '', details: '', dayLimit: 30 });
  const [world, setWorld] = useState<GeneratedWorld | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const isCustom = templateId === 'custom';
  const isAi = templateId === 'ai';
  const input = 'mt-1 w-full rounded-lg border border-pink-200 bg-pink-50/30 px-2.5 py-2 text-[11px] text-slate-800 outline-none focus:border-pink-400';
  const option = (id: string) => `rounded-2xl border p-3 text-left transition ${templateId === id ? 'border-pink-400 bg-pink-50 shadow-sm' : 'border-pink-100 bg-white hover:border-pink-200'}`;

  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      setWorld(await onGenerateWorld(aiInput));
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-5 text-slate-600">
        {charName}是调教者，{userName}是被调教的一方。每天早上系统会排好课表，{charName}按课表和地点下达指令；课程由系统掷骰结算，AI 只负责描写。
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setTemplateId('ai')} className={`col-span-2 ${option('ai')}`}>
          <span className="flex items-center gap-1 text-[12px] font-black text-slate-800"><Wand2 className="h-3.5 w-3.5 text-violet-500" />AI 生成世界</span>
          <span className="mt-0.5 block text-[9.5px] text-slate-500">给一个主题，AI 设计地点、开放时段、兑换品、家规和 2-3 门专属课程，先预览再开始</span>
        </button>
        {RPG_TEMPLATES.map((template) => (
          <button key={template.id} type="button" onClick={() => setTemplateId(template.id)} className={option(template.id)}>
            <span className="block text-[12px] font-black text-slate-800">{template.name}</span>
            <span className="mt-0.5 block text-[9.5px] text-slate-500">{template.tagline}</span>
          </button>
        ))}
        <button type="button" onClick={() => setTemplateId('custom')} className={`col-span-2 ${option('custom')}`}>
          <span className="block text-[12px] font-black text-slate-800">自定义（从空白开始）</span>
          <span className="mt-0.5 block text-[9.5px] text-slate-500">只有住处、训练室和奖励柜，其他地点在剧情里或用「探索周边」慢慢添加</span>
        </button>
      </div>

      {isAi && (
        <div className="space-y-2 rounded-2xl border border-violet-100 bg-white p-3">
          <label className="block text-[10px] font-bold text-slate-700">主题
            <input value={aiInput.theme} maxLength={60} onChange={(event) => setAiInput({ ...aiInput, theme: event.target.value })} placeholder={`例如：${AI_THEME_IDEAS[0]}；留空则按${charName}的设定来`} className={input} />
          </label>
          <div className="flex flex-wrap gap-1">
            {AI_THEME_IDEAS.map((idea) => (
              <button key={idea} type="button" onClick={() => setAiInput({ ...aiInput, theme: idea })} className="rounded-full border border-violet-100 bg-violet-50/60 px-2 py-0.5 text-[10px] text-violet-700">{idea}</button>
            ))}
          </div>
          <label className="block text-[10px] font-bold text-slate-700">补充要求（可选）
            <textarea value={aiInput.details} maxLength={300} rows={2} onChange={(event) => setAiInput({ ...aiInput, details: event.target.value })} placeholder="想要的地点、氛围、规矩……" className={`${input} resize-none leading-5`} />
          </label>
          <label className="block text-[10px] font-bold text-slate-700">期限（天，0 为不限）
            <input type="number" min={0} max={365} value={aiInput.dayLimit} onChange={(event) => setAiInput({ ...aiInput, dayLimit: Number(event.target.value) })} className={input} />
          </label>
          <button type="button" disabled={generating} onClick={() => void generate()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11.5px] font-black text-violet-700 disabled:opacity-60">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {generating ? 'AI 正在设计世界…（约 10-40 秒）' : world ? '不满意，重新生成' : '让 AI 生成世界'}
          </button>
          {error && <p className="text-[10.5px] text-rose-600">{error}</p>}
        </div>
      )}
      {isAi && world && <WorldPreview world={world} charName={charName} userName={userName} />}

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
      <button type="button" disabled={isAi && (!world || generating)}
        onClick={() => (isAi ? world && onStartGenerated(world) : onStart(templateId, isCustom ? custom : undefined))}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-2.5 text-[12px] font-black text-white shadow-sm disabled:opacity-40">
        <CalendarDays className="h-4 w-4" />{isAi ? (world ? '就用这个世界，开始第一天' : '先生成世界') : '开始第一天'}
      </button>
    </div>
  );
};

// ─── 小组件 ────────────────────────────────────────────────────────────────────

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

const reportMood = (report: RpgDailyReport): TavernEmotionKey =>
  report.violations > 0 || report.failed > report.passed ? 'angry' : report.planTotal > 0 && report.planDone === report.planTotal ? 'smug' : 'smile';

const ReportCard: React.FC<{ report: RpgDailyReport; portrait?: RpgPortrait }> = ({ report, portrait }) => (
  <div className="flex gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3 text-[10.5px] text-slate-700">
    {portrait && <TrainerPortrait portrait={portrait} mood={reportMood(report)} />}
    <div className="min-w-0 flex-1">
    <p className="mb-1 flex items-center justify-between text-[11.5px] font-black text-slate-800">
      <span>第 {report.day} 天日报</span>
      <span className={report.points >= 0 ? 'text-emerald-600' : 'text-rose-600'}>积分 {signed(report.points)}</span>
    </p>
    <p>课程 {report.courses} 次 · 检定 {report.passed} 成 {report.failed} 败 · 课表 {report.planDone}/{report.planTotal}{report.bonus ? `（奖励 ${report.bonus}）` : ''}</p>
    <p>{report.violations ? `违反家规 ${report.violations} 次` : '没有违反家规'}</p>
    {Object.keys(report.deltas).length > 0 && (
      <p className="mt-0.5 text-violet-700">{Object.entries(report.deltas).map(([key, value]) => `${RPG_STAT_LABELS[key as RpgStatKey]} ${signed(value!)}`).join('　')}</p>
    )}
    </div>
  </div>
);

// ─── 面板 ──────────────────────────────────────────────────────────────────────

export type RpgPanelTab = 'map' | 'today' | 'status' | 'rules' | 'log' | 'settings';

export interface TavernRpgPanelProps {
  state: TavernRpgState | null;
  portrait: RpgPortrait;
  art: Record<string, string>;
  artBusyId: string | null;
  artAuto: boolean;
  onGenerateArt: (locationId: string) => void;
  onToggleArtAuto: (enabled: boolean) => void;
  onGenerateWorld: (input: WorldGenInput) => Promise<GeneratedWorld>;
  onStartGenerated: (world: GeneratedWorld) => void;
  onExplore: () => void;
  exploring: boolean;
  slots: RpgSaveSlot[];
  onSaveSlot: (name: string) => string | undefined;
  onLoadSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onNewRun: () => void;
  charName: string;
  userName: string;
  busy: boolean;
  emsCeiling: number;
  initialTab?: RpgPanelTab;
  onStart: (templateId: string, custom?: CustomSetup) => void;
  onAction: (action: RpgSystemAction) => void;
  onAddRule: (text: string) => string | undefined;
  onRemoveRule: (index: number) => void;
  onEnd: () => void;
  onUpdateHardware: (settings: RpgHardwareSettings) => void;
  onClose: () => void;
}

export const TavernRpgPanel: React.FC<TavernRpgPanelProps> = ({
  state, portrait, art, artBusyId, artAuto, onGenerateArt, onToggleArtAuto, onGenerateWorld, onStartGenerated, onExplore, exploring, slots, onSaveSlot, onLoadSlot, onDeleteSlot, onNewRun,
  charName, userName, busy, emsCeiling, initialTab = 'map', onStart, onAction, onAddRule, onRemoveRule, onEnd, onUpdateHardware, onClose,
}) => {
  const [tab, setTab] = useState<RpgPanelTab>(initialTab);
  const [selectedId, setSelectedId] = useState(state?.currentId ?? '');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ruleDraft, setRuleDraft] = useState('');
  const [ruleError, setRuleError] = useState('');
  const [slotName, setSlotName] = useState('');
  const [slotError, setSlotError] = useState('');
  const [confirmLoad, setConfirmLoad] = useState<string | null>(null);
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
    { id: 'today', label: '今日', icon: CalendarDays },
    { id: 'status', label: '状态', icon: UserRound },
    { id: 'rules', label: '家规', icon: ScrollText },
    { id: 'log', label: '日志', icon: NotebookText },
    { id: 'settings', label: '设置', icon: Settings2 },
  ];

  const isHere = selected?.id === state?.currentId;
  const summon = state ? activeSummon(state) : null;
  const coursesHere = state ? getCoursesHere(state) : [];

  const courseButton = (entry: CourseAvailability) => (
    <div key={entry.course.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${entry.available ? 'border-violet-100 bg-white' : 'border-slate-100 bg-slate-50'}`}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[11.5px] font-bold text-slate-800">
          {entry.available ? <RpgIcon name={courseIcon(entry.course.id)} className="h-4 w-4 text-violet-500" /> : <Lock className="h-3 w-3 text-slate-400" />}{entry.course.name}
        </span>
        <span className="block text-[9.5px] text-slate-500">{entry.course.description}</span>
        <span className="block text-[9.5px] text-violet-600">
          {state && courseCheckText(state, entry)} · 体力 {signed(-entry.course.stamina)} · 压力 {signed(entry.course.stress)}{entry.course.points ? ` · 成功 +${entry.course.points} 积分` : ''}
        </span>
        {!entry.available && <span className="block text-[9.5px] text-rose-600">{entry.reason}</span>}
      </span>
      <button type="button" disabled={busy || !entry.available} onClick={() => act({ type: 'course', courseId: entry.course.id })}
        className="shrink-0 rounded-lg bg-violet-500 px-2.5 py-1.5 text-[10.5px] font-black text-white disabled:opacity-40">开始</button>
    </div>
  );

  const body = (
    <div onClick={onClose} className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-label="训练日程" onClick={(event) => event.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl border border-pink-200 bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-pink-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <TrainerPortrait portrait={portrait} mood={state && state.stress >= RPG_HIGH_STRESS ? 'sad' : 'neutral'} className="h-10 w-10" />
            <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-[13px] font-black text-slate-800"><CalendarDays className="h-4 w-4 text-pink-500" />{state ? state.worldName : '训练日程'}</h3>
            {state && <p className="text-[10px] text-slate-500">{dayLabel(state)} · {RPG_PERIOD_LABELS[state.period]} · {STAGES[state.stage]?.name} · 积分 {state.points}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-full p-1.5 text-slate-500 hover:bg-pink-50"><X className="h-4 w-4" /></button>
        </div>

        {!state ? (
          <div className="space-y-3 overflow-y-auto p-4" data-allow-scroll>
            {slots.length > 0 && (
              <div className="space-y-1.5 rounded-2xl border border-amber-100 bg-amber-50/40 p-3">
                <p className="flex items-center gap-1 text-[11px] font-black text-slate-700"><FolderOpen className="h-3.5 w-3.5 text-amber-500" />继续之前的存档</p>
                {slots.map((slot) => (
                  <button key={slot.id} type="button" disabled={busy} onClick={() => onLoadSlot(slot.id)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-amber-100 bg-white px-2.5 py-1.5 text-left disabled:opacity-50">
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold text-slate-800">{slot.auto ? '（自动）' : ''}{slot.name}</span>
                      <span className="block text-[9.5px] text-slate-500">{slot.worldName} · 第 {slot.day} 天 · {slot.stageName}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-bold text-amber-700">读取</span>
                  </button>
                ))}
              </div>
            )}
            <RpgSetup charName={charName} userName={userName} onStart={onStart} onGenerateWorld={onGenerateWorld} onStartGenerated={onStartGenerated} />
          </div>
        ) : (
          <>
            <div className="flex shrink-0 gap-0.5 border-b border-pink-50 px-2 py-2" role="tablist">
              {tabs.map((item) => (
                <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1 text-[9.5px] font-bold transition ${tab === item.id ? 'bg-pink-50 text-pink-700' : 'text-slate-500 hover:text-slate-700'}`}>
                  <item.icon className="h-3.5 w-3.5" />{item.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" data-allow-scroll>
              {state.ending && (
                <div className="space-y-2 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-pink-50 p-3">
                  <div className="flex items-center gap-3">
                    <TrainerPortrait portrait={portrait} mood="smile" className="h-14 w-14" />
                    <p className="flex items-center gap-1.5 text-[13px] font-black text-amber-800"><RpgIcon name="trophy" className="h-5 w-5" />结局：{state.ending.title}</p>
                  </div>
                  <p className="text-[11px] leading-5 text-slate-700">{state.ending.summary}</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => act({ type: 'renew' })} className="flex-1 rounded-xl bg-amber-500 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50">续约 30 天</button>
                    <button type="button" onClick={() => { setTab('settings'); setConfirmEnd(true); }} className="flex-1 rounded-xl border border-amber-200 px-3 py-1.5 text-[11px] font-bold text-amber-800">结束训练</button>
                  </div>
                </div>
              )}
              {state.stress >= RPG_MAX_STRESS && (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">压力到了极限：只能进行安抚、沐浴等放松课程，或者回卧室休息。</p>
              )}

              {tab === 'map' && (
                <>
                  <RpgMap state={state} art={art} selectedId={selected?.id ?? ''} onSelect={setSelectedId} />
                  {selected && (
                    <div className="space-y-2 rounded-2xl border border-pink-100 bg-white p-3">
                      <LocationBanner location={selected} art={art[selected.id]} busy={artBusyId === selected.id} onGenerate={artBusyId && artBusyId !== selected.id ? undefined : () => onGenerateArt(selected.id)} />
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 text-[13px] font-black text-slate-800"><RpgIcon name={KIND_ICONS[selected.kind]} className="h-4 w-4 text-pink-500" />{selected.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {RPG_KIND_META[selected.kind].label}
                            {selected.services.length ? ` · 可${selected.services.map((service) => RPG_SERVICE_LABELS[service]).join('、')}` : ''}
                            {selected.open.length ? ` · 开放：${selected.open.map((p) => RPG_PERIOD_LABELS[p]).join('、')}` : ''}
                          </p>
                        </div>
                        {isHere ? (
                          <span className="shrink-0 rounded-full bg-pink-50 px-2 py-1 text-[10px] font-bold text-pink-600">你在这里</span>
                        ) : reachableIds.has(selected.id) ? (
                          <button type="button" disabled={busy || !isLocationOpen(selected, state.period)} onClick={() => act({ type: 'travel', locationId: selected.id })}
                            className="flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50">
                            <Footprints className="h-3.5 w-3.5" />{isLocationOpen(selected, state.period) ? '前往' : '未开放'}
                          </button>
                        ) : (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">不相邻</span>
                        )}
                      </div>
                      <p className="text-[11px] leading-5 text-slate-600">{selected.description}</p>
                      {isHere && selected.services.includes('rest') && (
                        <button type="button" disabled={busy} onClick={() => act({ type: 'rest' })} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-800 disabled:opacity-50">
                          <BedDouble className="h-3.5 w-3.5" />休息，结束第 {state.day} 天并生成日报
                        </button>
                      )}
                      {isHere && selected.services.includes('work') && (
                        <button type="button" disabled={busy || state.period >= 3 || !isLocationOpen(selected, state.period)} onClick={() => act({ type: 'work' })} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 disabled:opacity-50">
                          <Wrench className="h-3.5 w-3.5" />{state.period >= 3 ? '太晚了，先休息' : `做一个时段的差事（体力 -10），+${selected.pay} 积分`}
                        </button>
                      )}
                      {isHere && selected.services.includes('shop') && (
                        <div className="space-y-1.5">
                          {selected.catalog.map((item) => (
                            <div key={item.name} className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-1.5">
                              <RpgIcon name={itemIcon(item.name)} className="h-6 w-6 shrink-0 text-amber-500" />
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
                      {isHere && coursesHere.some((entry) => entry.available) && <div className="space-y-1.5">{coursesHere.filter((entry) => entry.available).map(courseButton)}</div>}
                      {isHere && (
                        <button type="button" disabled={busy || exploring} onClick={onExplore}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-800 disabled:opacity-60">
                          {exploring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Telescope className="h-3.5 w-3.5" />}
                          {exploring ? 'AI 正在探索附近…' : `让 AI 探索「${selected.name}」周边，发现新地点`}
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500">虚线圈是现在能去的地点，🌙 表示这个时段不开放，橙点表示可以休息、兑换或做差事。剧情里去了新地方，AI 会把它加到地图上。</p>
                </>
              )}

              {tab === 'today' && (
                <>
                  {summon && summon.target && (
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <TrainerPortrait portrait={portrait} mood="smug" className="h-11 w-11" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 text-[12px] font-black text-amber-900"><Megaphone className="h-3.5 w-3.5" />{charName}的传唤</p>
                        <p className="text-[11px] text-amber-900">{summon.objective.replace('调教者', charName)}</p>
                        <p className="text-[9.5px] text-amber-700">按时到达 +{summon.reward ?? 10} 积分、依恋 +1；迟到压力 +3</p>
                      </div>
                      {reachableIds.has(summon.target) && (
                        <button type="button" disabled={busy} onClick={() => act({ type: 'travel', locationId: summon.target! })} className="shrink-0 rounded-xl bg-amber-500 px-2.5 py-1.5 text-[10.5px] font-black text-white disabled:opacity-50">前往</button>
                      )}
                    </div>
                  )}
                  {getLocation(state, state.currentId) && (
                    <LocationBanner location={getLocation(state, state.currentId)!} art={art[state.currentId]} busy={artBusyId === state.currentId} className="aspect-[21/9]" />
                  )}
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-3">
                    <p className="mb-2 text-[11.5px] font-black text-slate-800">今日课表 · 第 {state.day} 天</p>
                    {state.plan.length ? (
                      <ol className="space-y-1.5">
                        {state.plan.map((slot, index) => {
                          const course = findCourse(state, slot.courseId);
                          const now = slot.period === state.period && !slot.done;
                          return (
                            <li key={`${slot.courseId}-${index}`} className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] ${now ? 'bg-white shadow-sm ring-1 ring-violet-200' : ''}`}>
                              {slot.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" />}
                              <span className="flex w-11 shrink-0 items-center gap-0.5 text-[10px] text-slate-500"><RpgIcon name={PERIOD_ICONS[slot.period]} className="h-3.5 w-3.5 text-amber-500" />{RPG_PERIOD_LABELS[slot.period]}</span>
                              <span className={`flex min-w-0 flex-1 items-center gap-1 font-bold ${slot.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}><RpgIcon name={courseIcon(slot.courseId)} className="h-3.5 w-3.5 shrink-0 text-violet-500" />{course?.name}</span>
                              <span className="shrink-0 text-[9.5px] text-slate-500">{course?.kinds.map((kind) => RPG_KIND_META[kind].label).slice(0, 2).join('/')}</span>
                            </li>
                          );
                        })}
                      </ol>
                    ) : <p className="text-[11px] text-slate-500">今天没有安排。</p>}
                    <p className="mt-2 text-[9.5px] text-slate-500">每完成一项 +10 积分，全部完成再 +20，睡前结算。课程要去对应类型的地点进行。</p>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] font-black text-slate-700">这里可以进行的课程</p>
                    {coursesHere.length ? <div className="space-y-1.5">{coursesHere.map(courseButton)}</div> : <p className="text-[11px] text-slate-500">这里没有课程，去训练室、客厅或卧室看看。</p>}
                  </div>
                  {state.reports.length > 0 && <ReportCard report={state.reports[state.reports.length - 1]} portrait={portrait} />}
                  <div>
                    <p className="mb-1.5 text-[11px] font-black text-slate-700">目标</p>
                    {state.quests.length ? <div className="space-y-2">{state.quests.map((quest) => <QuestCard key={quest.title} quest={quest} stats={state.trainee} />)}</div> : <p className="text-[11px] text-slate-500">还没有目标。</p>}
                  </div>
                </>
              )}

              {tab === 'status' && (
                <>
                  {(state.milestones ?? []).length > 0 && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3">
                      <p className="mb-1 flex items-center gap-1 text-[11px] font-black text-slate-700"><History className="h-3.5 w-3.5 text-amber-500" />训练回忆</p>
                      <ol className="space-y-0.5">
                        {state.milestones.slice().reverse().slice(0, 8).map((entry, index) => (
                          <li key={`${entry.day}-${index}`} className="text-[10.5px] text-slate-600"><span className="font-bold text-amber-700">第 {entry.day} 天</span> {entry.text}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  <div className="rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50 to-violet-50 p-3">
                    <p className="text-[10px] text-slate-500">训练阶段 {state.stage + 1}/{STAGES.length}</p>
                    <p className="flex items-center gap-1.5 text-[15px] font-black text-slate-800"><RpgIcon name={STAGE_ICONS[state.stage] ?? 'crown'} className="h-5 w-5 text-pink-500" />{STAGES[state.stage]?.name}</p>
                    <p className="text-[10px] text-slate-600">{STAGES[state.stage]?.hint}</p>
                    {state.traits.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {state.traits.map((id) => {
                          const trait = getTrait(id);
                          if (!trait) return null;
                          const mods = Object.entries(trait.modifiers).map(([key, value]) => `${RPG_CHECK_LABELS[key as RpgStatKey]}${signed(value!)}`).join(' ');
                          return <span key={id} title={trait.description} className="flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-bold text-violet-700"><RpgIcon name={traitIcon(id)} className="h-3.5 w-3.5" />{trait.name} <span className="font-normal text-violet-500">{mods}</span></span>;
                        })}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl border border-pink-100 bg-white p-2">
                      <p className="text-[10px] text-slate-500">体力</p>
                      <p className={`text-[15px] font-black ${state.stamina < RPG_LOW_STAMINA ? 'text-rose-600' : 'text-slate-800'}`}>{state.stamina}</p>
                      <Bar value={state.stamina} tone="stamina" className="mx-auto block w-14" />
                    </div>
                    <div className="rounded-2xl border border-pink-100 bg-white p-2">
                      <p className="text-[10px] text-slate-500">压力</p>
                      <p className={`text-[15px] font-black ${state.stress >= RPG_HIGH_STRESS ? 'text-rose-600' : 'text-slate-800'}`}>{state.stress}</p>
                      <Bar value={state.stress} tone="stress" className="mx-auto block w-14" />
                    </div>
                    <div className="rounded-2xl border border-pink-100 bg-white p-2">
                      <p className="text-[10px] text-slate-500">积分</p>
                      <p className="text-[15px] font-black text-amber-600">{state.points}</p>
                    </div>
                  </div>
                  <p className="text-[9.5px] leading-4 text-slate-500">体力低于 {RPG_LOW_STAMINA} 或压力高于 {RPG_HIGH_STRESS} 时，所有检定各 -2；压力到 {RPG_MAX_STRESS} 只能做放松课程。休息一晚压力 -30。</p>
                  <div className="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/30 p-3">
                    <p className="text-[11px] font-black text-slate-700">训练属性</p>
                    {STAT_KEYS.map((key) => {
                      const mod = checkModifier(state, key);
                      const level = statLevel(key, state.trainee[key]);
                      return (
                        <div key={key} className="flex items-center gap-2 text-[10.5px]">
                          <span className="w-9 shrink-0 font-bold text-slate-700">{RPG_STAT_LABELS[key]}</span>
                          <Bar value={state.trainee[key]} tone={key === 'shame' ? 'shame' : 'stat'} className="flex-1" />
                          <span className="w-7 shrink-0 text-right tabular-nums text-slate-700">{state.trainee[key]}</span>
                          <span className="w-16 shrink-0 text-right text-[9.5px] text-slate-500">Lv{level} {LEVEL_NAMES[level]}</span>
                          <span className="w-10 shrink-0 text-right text-[9.5px] text-violet-600">{signed(mod)}</span>
                        </div>
                      );
                    })}
                    <p className="text-[9.5px] leading-4 text-slate-500">{STAT_KEYS.map((key) => `${RPG_STAT_LABELS[key]}：${RPG_STAT_HINTS[key]}`).join('；')}</p>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] font-black text-slate-700">背包</p>
                    {state.inventory.length ? (
                      <div className="space-y-1.5">
                        {state.inventory.map((item) => (
                          <div key={item.name} className="flex items-center justify-between gap-2 rounded-xl border border-pink-100 bg-white px-3 py-1.5">
                            <span className="flex items-center gap-1.5 text-[11px] text-slate-700">
                              <RpgIcon name={itemIcon(item.name)} className="h-5 w-5 shrink-0 text-pink-400" />
                              {item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}
                              {item.effect?.stamina ? <span className="ml-1 text-[9.5px] text-emerald-600">体力 +{item.effect.stamina}</span> : null}
                              {item.effect?.stress ? <span className="ml-1 text-[9.5px] text-sky-600">压力 -{item.effect.stress}</span> : null}
                            </span>
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

              {tab === 'rules' && (
                <>
                  <p className="text-[10.5px] leading-5 text-slate-600">家规会写进提示词，{charName}会检查你有没有遵守。违反一次扣 5 积分、压力 +3；连续 3 天不违规可以获得「守规矩」特质。{charName}也可能在剧情里立新的家规。</p>
                  {state.rules.length ? (
                    <ol className="space-y-1.5">
                      {state.rules.map((rule, index) => (
                        <li key={`${rule.text}-${index}`} className="flex items-start gap-2 rounded-xl border border-pink-100 bg-white px-3 py-2">
                          <span className="mt-0.5 text-[10px] font-black text-pink-500">{index + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11.5px] text-slate-800">{rule.text}</span>
                            <span className="block text-[9.5px] text-slate-500">
                              {rule.by === 'trainer' ? `${charName}立的` : rule.by === 'user' ? '你加的' : '初始家规'}
                              {rule.violations ? <span className="ml-1 font-bold text-rose-600">已违反 {rule.violations} 次</span> : ' · 未违反'}
                            </span>
                          </span>
                          <button type="button" aria-label={`删除家规 ${index + 1}`} onClick={() => onRemoveRule(index)} className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><X className="h-3.5 w-3.5" /></button>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-[11px] text-slate-500">还没有家规。</p>}
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const error = onAddRule(ruleDraft);
                      setRuleError(error ?? '');
                      if (!error) setRuleDraft('');
                    }}
                  >
                    <input value={ruleDraft} maxLength={40} onChange={(event) => { setRuleDraft(event.target.value); setRuleError(''); }} placeholder="新家规，例如：睡前要说晚安" className="min-w-0 flex-1 rounded-xl border border-pink-200 bg-pink-50/30 px-3 py-2 text-[11px] text-slate-800 outline-none focus:border-pink-400" />
                    <button type="submit" className="flex shrink-0 items-center gap-1 rounded-xl bg-pink-500 px-3 py-2 text-[11px] font-black text-white"><Plus className="h-3.5 w-3.5" />添加</button>
                  </form>
                  {ruleError && <p className="text-[10.5px] text-rose-600">{ruleError}</p>}
                </>
              )}

              {tab === 'log' && (
                <>
                  {state.reports.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-black text-slate-700">日报</p>
                      {state.reports.slice().reverse().slice(0, 7).map((report) => <ReportCard key={report.day} report={report} portrait={portrait} />)}
                    </div>
                  )}
                  <div>
                    <p className="mb-1.5 text-[11px] font-black text-slate-700">记录</p>
                    <ol className="space-y-1">
                      {state.log.slice().reverse().map((entry, index) => (
                        <li key={`${entry.at}-${index}`} className={`text-[11px] ${entry.tone === 'good' ? 'text-emerald-700' : entry.tone === 'bad' ? 'text-rose-700' : entry.tone === 'warn' ? 'text-amber-700' : 'text-slate-600'}`}>· {entry.text}</li>
                      ))}
                    </ol>
                  </div>
                </>
              )}

              {tab === 'settings' && (
                <>
                  <div className="space-y-2 rounded-2xl border border-pink-100 bg-white p-3">
                    <p className="flex items-center gap-1 text-[11px] font-black text-slate-800"><Save className="h-3.5 w-3.5 text-pink-500" />存档（最多 5 个）</p>
                    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setSlotError(onSaveSlot(slotName) ?? ''); setSlotName(''); }}>
                      <input value={slotName} maxLength={20} onChange={(event) => setSlotName(event.target.value)} placeholder={`存档名，默认「${state.worldName}」`} className="min-w-0 flex-1 rounded-xl border border-pink-200 bg-pink-50/30 px-3 py-1.5 text-[11px] text-slate-800 outline-none focus:border-pink-400" />
                      <button type="submit" className="shrink-0 rounded-xl bg-pink-500 px-3 py-1.5 text-[11px] font-black text-white">保存</button>
                    </form>
                    {slotError && <p className="text-[10.5px] text-rose-600">{slotError}</p>}
                    {slots.length ? (
                      <ul className="space-y-1.5">
                        {slots.map((slot) => (
                          <li key={slot.id} className="flex items-center gap-2 rounded-xl border border-pink-50 bg-pink-50/30 px-2.5 py-1.5">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-bold text-slate-800">{slot.auto ? '（自动）' : ''}{slot.name}</span>
                              <span className="block text-[9.5px] text-slate-500">{slot.worldName} · 第 {slot.day} 天 · {slot.stageName} · {new Date(slot.savedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </span>
                            {confirmLoad === slot.id ? (
                              <button type="button" disabled={busy} onClick={() => { setConfirmLoad(null); onLoadSlot(slot.id); }} className="shrink-0 rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-black text-white disabled:opacity-50">确认读取</button>
                            ) : (
                              <button type="button" aria-label={`读取存档 ${slot.name}`} disabled={busy} onClick={() => setConfirmLoad(slot.id)} className="shrink-0 rounded-lg border border-pink-200 p-1.5 text-pink-600 disabled:opacity-50"><FolderOpen className="h-3.5 w-3.5" /></button>
                            )}
                            <button type="button" aria-label={`删除存档 ${slot.name}`} onClick={() => onDeleteSlot(slot.id)} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-[10.5px] text-slate-500">还没有存档。</p>}
                    {confirmLoad && <p className="text-[10px] text-amber-700">读取会替换当前进度，当前进度会先自动存一份。</p>}
                    <button type="button" disabled={busy} onClick={onNewRun} className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700 disabled:opacity-50">开始新的一局（当前进度自动存档）</button>
                  </div>
                  <div className="space-y-2.5 rounded-2xl border border-pink-100 bg-white p-3">
                    <p className="flex items-center gap-1 text-[11px] font-black text-slate-800"><Gavel className="h-3.5 w-3.5 text-pink-500" />检定的硬件奖惩</p>
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
                        <p className="text-[10px] text-slate-500">压力达到 {RPG_HIGH_STRESS} 以上时，电击强度自动减半。</p>
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
                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-pink-100 bg-white p-3">
                    <span>
                      <span className="flex items-center gap-1 text-[11.5px] font-bold text-slate-800"><ImagePlus className="h-3.5 w-3.5 text-pink-500" />进入新地点时自动画插画</span>
                      <span className="block text-[10px] text-slate-500">用酒馆设置里的生图模型，每个地点画一次，会消耗生图额度。也可以在地图上手动画。</span>
                    </span>
                    <input type="checkbox" checked={artAuto} onChange={(event) => onToggleArtAuto(event.target.checked)} className="h-4 w-4 accent-pink-500" />
                  </label>
                  {confirmEnd ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
                      <span className="flex-1 text-[11px] text-rose-800">结束后地图、训练属性、家规和背包都会清空，聊天记录保留。</span>
                      <button type="button" onClick={() => setConfirmEnd(false)} className="rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-slate-600">取消</button>
                      <button type="button" onClick={onEnd} className="rounded-xl bg-rose-500 px-2.5 py-1.5 text-[11px] font-black text-white">结束</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmEnd(true)} className="w-full rounded-2xl border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50">结束这段训练</button>
                  )}
                  <p className="text-center text-[9.5px] text-slate-400">{RPG_ICON_CREDIT}</p>
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
