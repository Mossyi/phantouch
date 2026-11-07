/**
 * 调教者课题：NPC 按自己的风格安排当天要做什么，玩家选择接受、拒绝、暂停或设界限。
 *
 * 关系固定为「调教者安排，玩家接受训练」。拒绝和暂停只改虚构的信任、压力和下一轮课题，
 * 不记违规，也不产生任何硬件指令。
 *
 * 机制借鉴（自行实现，未复制对方代码）：
 * - SillyTavern RPG Companion 把关系与任务从聊天正文里拆成可读状态；
 * - ScenePulse 的任务生命周期（进行 / 更新 / 收束）和「从玩家视角写目标」；
 * - rpg-tracker 的关系记录会进入后续上下文。
 */
import type { RpgLocationKind } from './tavernRpgContent';

export type TrainerStyleId = 'gentle' | 'strict' | 'observer';
export type TrainingStepId = 'arrive' | 'practice' | 'report';
export type TrainingStepStatus = 'todo' | 'done' | 'declined';
export type TrainingReport = 'honest' | 'polished' | 'care';

export interface TrainerStyle {
  id: TrainerStyleId;
  name: string;
  blurb: string;
}

export const TRAINER_STYLES: Record<TrainerStyleId, TrainerStyle> = {
  gentle: {
    id: 'gentle',
    name: '循序引导',
    blurb: '先问你今天愿意做到哪一步。说做不到，会改轻，信任也会上升。',
  },
  strict: {
    id: 'strict',
    name: '日程教官',
    blurb: '每天只给一项明确课题。按时完成会得到清楚评价；拒绝会被改期，不算违规。',
  },
  observer: {
    id: 'observer',
    name: '观察记录',
    blurb: '更在意你有没有说实话。逞强会让信任下降，如实交代则会上升。',
  },
};

export interface TrainingBoundaries {
  /** 不在有别人的地方练习。玩家自己去那些地点仍然可以，但课程不会开始。 */
  noPublic: boolean;
  /** 今天不再接受消耗很大的练习。 */
  noEscalation: boolean;
  /** 今天的新练习已停止，只保留放松和休息。 */
  paused: boolean;
}

export interface TrainingStep {
  id: TrainingStepId;
  title: string;
  detail: string;
  status: TrainingStepStatus;
}

export interface TrainingAssignment {
  day: number;
  title: string;
  placeId: string;
  placeName: string;
  placeKind: string;
  steps: TrainingStep[];
}

export interface TrainingMemory {
  day: number;
  text: string;
}

export interface TrainingGuidance {
  style: TrainerStyleId;
  trust: number;
  boundaries: TrainingBoundaries;
  assignment: TrainingAssignment;
  memory: TrainingMemory[];
  lastReport: TrainingReport | null;
  /** 今天不做消耗很大的练习。只持续到下一次休息。 */
  easeToday: boolean;
  /** 明天安排轻一天。由「请求先被照顾」或循序引导下的拒绝写入。 */
  easeNext: boolean;
}

export interface GuidanceLocation {
  id: string;
  name: string;
  kind: string;
  discovered?: boolean;
}

export interface GuidanceLog {
  at: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'warn';
}

export interface GuidanceCarrier {
  day: number;
  stress: number;
  currentId: string;
  locations: GuidanceLocation[];
  guidance: TrainingGuidance;
  log: GuidanceLog[];
  pendingEvents: string[];
}

const PUBLIC_KINDS = new Set<string>(['outdoor', 'cafe', 'work']);
const PRIVATE_KINDS = ['bedroom', 'playroom', 'home', 'bath', 'shop', 'special'];
const MEMORY_CAP = 8;
export const REVERSAL_RETIRED_NOTE = '这局曾标成身份反转，已改回由调教者安排训练。地点、属性和天数都还在。';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isTrainerStyle = (value: unknown): value is TrainerStyleId =>
  value === 'gentle' || value === 'strict' || value === 'observer';

export const trustLabel = (trust: number) => {
  if (trust >= 76) return '稳定';
  if (trust >= 51) return '愿意交托';
  if (trust >= 26) return '在观察';
  return '还很生疏';
};

const pushLog = <T extends GuidanceCarrier>(state: T, text: string, tone: GuidanceLog['tone']): T => ({
  ...state,
  log: [...state.log, { at: Date.now(), text, tone }].slice(-50),
});

const remember = (guidance: TrainingGuidance, day: number, text: string): TrainingGuidance => ({
  ...guidance,
  memory: [...guidance.memory, { day, text }].slice(-MEMORY_CAP),
});

const withTrust = (guidance: TrainingGuidance, delta: number): TrainingGuidance => ({
  ...guidance,
  trust: clamp(guidance.trust + delta, 0, 100),
});

const step = (guidance: TrainingGuidance, id: TrainingStepId) =>
  guidance.assignment.steps.find((item) => item.id === id);

const replaceStep = (guidance: TrainingGuidance, id: TrainingStepId, status: TrainingStepStatus): TrainingGuidance => ({
  ...guidance,
  assignment: {
    ...guidance.assignment,
    steps: guidance.assignment.steps.map((item) => (item.id === id ? { ...item, status } : item)),
  },
});

const knownLocations = (locations: GuidanceLocation[]) => locations.filter((loc) => loc.discovered !== false && loc.id && loc.name);

const pickPlace = (locations: GuidanceLocation[], kind: string, noPublic: boolean): GuidanceLocation => {
  const known = knownLocations(locations);
  const allowed = known.filter((loc) => !(noPublic && PUBLIC_KINDS.has(loc.kind)));
  return allowed.find((loc) => loc.kind === kind)
    || allowed.find((loc) => PRIVATE_KINDS.includes(loc.kind))
    || allowed[0]
    || known[0]
    || locations[0]
    || { id: 'here', name: '这里', kind: 'home' };
};

const kindForDay = (style: TrainerStyleId, day: number, noPublic: boolean): RpgLocationKind | 'home' => {
  if (noPublic) {
    const kinds: Array<RpgLocationKind | 'home'> = ['bedroom', 'playroom', 'home'];
    return kinds[(Math.max(1, day) - 1) % kinds.length];
  }
  const kinds: Record<TrainerStyleId, Array<RpgLocationKind | 'home'>> = {
    gentle: ['bedroom', 'home', 'playroom'],
    strict: ['home', 'playroom', 'home'],
    observer: ['home', 'playroom', 'bedroom'],
  };
  return kinds[style][(Math.max(1, day) - 1) % kinds[style].length];
};

const followUpLine = (style: TrainerStyleId, lastReport: TrainingReport | null) => {
  if (lastReport === 'honest') return style === 'observer' ? '昨天你说了实话，今天接着记。' : '昨天你说了实话，今天按这个来。';
  if (lastReport === 'polished') return style === 'observer' ? '昨天你说得比较好听，今天只要实话。' : '昨天你把过程说得比较顺，今天看你能不能做到。';
  if (lastReport === 'care') return '昨天你要求先被照顾，今天的课题更轻。';
  return '';
};

export const buildAssignment = (
  locations: GuidanceLocation[],
  style: TrainerStyleId,
  day: number,
  noPublic: boolean,
  lastReport: TrainingReport | null,
): TrainingAssignment => {
  const kind = kindForDay(style, day, noPublic);
  const place = pickPlace(locations, kind, noPublic);
  const echo = followUpLine(style, lastReport);
  const titles: Record<TrainerStyleId, string> = {
    gentle: '先确认你今天愿意走到哪一步',
    strict: '报到，并完成一项练习',
    observer: '留下一份今天的记录',
  };
  return {
    day,
    title: echo ? `${echo}${titles[style]}` : titles[style],
    placeId: place.id,
    placeName: place.name,
    placeKind: place.kind,
    steps: [
      { id: 'arrive', title: '报到', detail: `让调教者在「${place.name}」看到你。`, status: 'todo' },
      { id: 'practice', title: '练习', detail: noPublic ? '在没有旁人的地方做一门课，或者拒绝这项。' : '做一门这里能做的课，或者拒绝这项。', status: 'todo' },
      { id: 'report', title: '交代', detail: '用一句话收束：说实话、说得好看一些，或请求先被照顾。', status: 'todo' },
    ],
  };
};

export const initialGuidance = (
  locations: GuidanceLocation[],
  style: TrainerStyleId = 'gentle',
  trust = 15,
): TrainingGuidance => {
  const safeStyle = isTrainerStyle(style) ? style : 'gentle';
  return {
    style: safeStyle,
    trust: clamp(trust, 0, 100),
    boundaries: { noPublic: false, noEscalation: false, paused: false },
    assignment: buildAssignment(locations, safeStyle, 1, false, null),
    memory: [{ day: 1, text: `${TRAINER_STYLES[safeStyle].name}：${TRAINER_STYLES[safeStyle].blurb}` }],
    lastReport: null,
    easeToday: false,
    easeNext: false,
  };
};

const emptyBoundaries = (): TrainingBoundaries => ({ noPublic: false, noEscalation: false, paused: false });

export const normalizeGuidance = (
  value: unknown,
  locations: GuidanceLocation[],
  day: number,
  trustFallback: number,
  wasReversal: boolean,
): TrainingGuidance => {
  const raw = value && typeof value === 'object' ? value as Partial<TrainingGuidance> : {};
  const style = isTrainerStyle(raw.style) ? raw.style : 'gentle';
  const boundaries = raw.boundaries && typeof raw.boundaries === 'object' ? raw.boundaries : emptyBoundaries();
  const noPublic = boundaries.noPublic === true;
  const base: TrainingGuidance = {
    style,
    trust: clamp(Number.isFinite(Number(raw.trust)) ? Number(raw.trust) : trustFallback, 0, 100),
    boundaries: {
      noPublic,
      noEscalation: boundaries.noEscalation === true,
      paused: boundaries.paused === true,
    },
    assignment: assignmentOrRebuild(raw.assignment, locations, style, day, noPublic, raw.lastReport ?? null),
    memory: Array.isArray(raw.memory)
      ? raw.memory.filter((entry) => entry && typeof entry.text === 'string').slice(-MEMORY_CAP).map((entry) => ({
        day: Math.max(1, Math.round(Number(entry.day) || day || 1)),
        text: String(entry.text).slice(0, 80),
      }))
      : [],
    lastReport: raw.lastReport === 'honest' || raw.lastReport === 'polished' || raw.lastReport === 'care' ? raw.lastReport : null,
    easeToday: raw.easeToday === true,
    easeNext: raw.easeNext === true,
  };
  if (!base.memory.length) base.memory = [{ day, text: `${TRAINER_STYLES[style].name}：${TRAINER_STYLES[style].blurb}` }];
  if (wasReversal && !base.memory.some((entry) => entry.text === REVERSAL_RETIRED_NOTE)) {
    base.memory = [...base.memory, { day, text: REVERSAL_RETIRED_NOTE }].slice(-MEMORY_CAP);
  }
  return base;
};

const assignmentOrRebuild = (
  value: unknown,
  locations: GuidanceLocation[],
  style: TrainerStyleId,
  day: number,
  noPublic: boolean,
  lastReport: TrainingReport | null,
): TrainingAssignment => {
  const raw = value && typeof value === 'object' ? value as Partial<TrainingAssignment> : {};
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const ids: TrainingStepId[] = ['arrive', 'practice', 'report'];
  const valid = ids.every((id) => steps.some((item) => item && item.id === id && typeof item.title === 'string'));
  const usableIds = new Set(locations.filter((loc) => loc && loc.id && loc.discovered !== false).map((loc) => loc.id));
  if (!valid || typeof raw.placeId !== 'string' || typeof raw.placeName !== 'string' || (usableIds.size > 0 && !usableIds.has(raw.placeId))) {
    return buildAssignment(locations, style, day, noPublic, lastReport);
  }
  return {
    day: Math.max(1, Math.round(Number(raw.day) || day || 1)),
    title: String(raw.title || '今天的课题').slice(0, 80),
    placeId: raw.placeId,
    placeName: raw.placeName.slice(0, 24),
    placeKind: typeof raw.placeKind === 'string' ? raw.placeKind : 'home',
    steps: ids.map((id) => {
      const found = steps.find((item) => item.id === id)!;
      const status: TrainingStepStatus = found.status === 'done' || found.status === 'declined' ? found.status : 'todo';
      return {
        id,
        title: String(found.title).slice(0, 12),
        detail: String(found.detail || '').slice(0, 80),
        status,
      };
    }),
  };
};

export interface CourseGate {
  name: string;
  stamina: number;
  relief?: boolean;
}

/** 界限挡住课程时返回给界面的原因。不修改状态，也不暗示任何硬件。 */
export const courseRefusal = (guidance: TrainingGuidance, course: CourseGate, hereKind?: string): string | null => {
  if (guidance.boundaries.paused && !course.relief) {
    return `今天已经暂停。${course.name}不会开始。休息到明天后，调教者会重新安排。这不是违规。`;
  }
  if ((guidance.easeToday || guidance.boundaries.noEscalation) && !course.relief && course.stamina >= 15) {
    return guidance.easeToday
      ? `调教者把今天改轻了，所以${course.name}先不做。可以做更轻松的练习，或拒绝这项。`
      : `你今天说过不要再加码，所以${course.name}被放下了。可以做更轻松的练习，或拒绝这项。`;
  }
  if (guidance.boundaries.noPublic && hereKind && PUBLIC_KINDS.has(hereKind)) {
    return '你设过界限：不在有别人的地方练习。换到私人地点再开始，或自己取消这条界限。';
  }
  return null;
};

export const noteArrival = <T extends GuidanceCarrier>(state: T): T => {
  if (!state.guidance?.assignment) return state;
  const arrive = step(state.guidance, 'arrive');
  if (!arrive || arrive.status !== 'todo' || state.currentId !== state.guidance.assignment.placeId) return state;
  const guidance = remember(withTrust(replaceStep(state.guidance, 'arrive', 'done'), 1), state.day, `在「${state.guidance.assignment.placeName}」报到`);
  return pushLog({
    ...state,
    guidance,
    pendingEvents: [...state.pendingEvents, `{{user}}按今天的课题来到「${state.guidance.assignment.placeName}」报到了。请用调教者的身份确认，并说明接下来的练习可以做，也可以拒绝。`].slice(-6),
  }, `课题：已在${state.guidance.assignment.placeName}报到（信任 +1）`, 'good');
};

export const notePractice = <T extends GuidanceCarrier>(state: T, success: boolean, course?: { relief?: boolean }): T => {
  if (!state.guidance?.assignment || state.guidance.boundaries.paused || course?.relief) return state;
  if (state.currentId !== state.guidance.assignment.placeId) return state;
  const practice = step(state.guidance, 'practice');
  if (!practice || practice.status !== 'todo') return state;
  const delta = success ? 3 : 1;
  const arrived = step(state.guidance, 'arrive')?.status === 'todo'
    ? replaceStep(state.guidance, 'arrive', 'done')
    : state.guidance;
  const guidance = remember(withTrust(replaceStep(arrived, 'practice', 'done'), delta), state.day, success ? '完成了今天的练习' : '练习没有达标，但做了');
  return pushLog({ ...state, guidance }, `课题：练习已记录（信任 +${delta}）`, success ? 'good' : 'info');
};

const unchanged = <T extends GuidanceCarrier>(state: T, error: string) => ({ state, error });

export const acknowledgeArrival = <T extends GuidanceCarrier>(state: T): { state: T; message?: string; error?: string } => {
  const arrive = step(state.guidance, 'arrive');
  if (!arrive || arrive.status !== 'todo') return unchanged(state, '报到这一步已经处理过了。');
  const place = state.guidance.assignment.placeName;
  if (state.currentId !== state.guidance.assignment.placeId) {
    return unchanged(state, `先去「${place}」。这只是今天的报到地点，不去也不会被记成违规。`);
  }
  const next = noteArrival(state);
  // 不把地点名写进会交给硬件世界书扫描的玩家消息。地点已经在系统状态里。
  return { state: next, message: '🧭 课题：我已经到指定地点报到，等你安排接下来的练习。这项也可以不做。' };
};

export const declinePractice = <T extends GuidanceCarrier>(state: T): { state: T; message?: string; error?: string } => {
  if (state.guidance.boundaries.paused) return unchanged(state, '今天已经暂停，不必再拒绝一次。');
  const practice = step(state.guidance, 'practice');
  if (!practice || practice.status === 'declined') return unchanged(state, '这项练习已经拒绝过了。');
  if (practice.status === 'done') return unchanged(state, '这项练习已经做完，不用再拒绝。');
  const delta = state.guidance.style === 'gentle' ? 3 : state.guidance.style === 'observer' ? 2 : 1;
  const declined = replaceStep(state.guidance, 'practice', 'declined');
  const guidance = remember(withTrust({
    ...declined,
    easeNext: state.guidance.style === 'gentle' ? true : declined.easeNext,
  }, delta), state.day, '拒绝了今天的练习，已改期');
  const next = pushLog({
    ...state,
    stress: clamp(state.stress - 4, 0, 100),
    guidance,
    pendingEvents: [...state.pendingEvents, '{{user}}拒绝了今天的练习。请用调教者的身份接受，并改成更轻松的安排或改到明天。不要责罚，不要把拒绝写成同意，不要要求任何设备输出。'].slice(-6),
  }, `课题：拒绝了今天的练习（信任 +${delta}，压力 -4，不是违规）`, 'good');
  return { state: next, message: '🧭 课题：这项练习我先不做，请改到以后或换成更轻松的安排。这不是违规。' };
};

export const pauseTraining = <T extends GuidanceCarrier>(state: T): { state: T; message?: string; error?: string } => {
  if (state.guidance.boundaries.paused) return unchanged(state, '今天已经暂停。休息到明天会重新安排。');
  const delta = state.guidance.style === 'gentle' ? 2 : 1;
  const practice = step(state.guidance, 'practice');
  const stopped = practice?.status === 'todo' ? replaceStep(state.guidance, 'practice', 'declined') : state.guidance;
  const guidance = remember(withTrust({
    ...stopped,
    boundaries: { ...stopped.boundaries, paused: true },
  }, delta), state.day, '今天到此为止');
  const next = pushLog({
    ...state,
    stress: clamp(state.stress - 8, 0, 100),
    guidance,
    pendingEvents: [...state.pendingEvents, '{{user}}叫停了今天剩下的练习。请停止安排新的练习，可以照顾 TA。不要责罚，不要把暂停写成还在训练。'].slice(-6),
  }, `课题：今天到此为止（信任 +${delta}，压力 -8）`, 'good');
  return { state: next, message: '🧭 课题：今天到此为止，请停止安排新的练习。' };
};

export const setTrainingBoundary = <T extends GuidanceCarrier>(
  state: T,
  key: 'noPublic' | 'noEscalation',
  value: boolean,
): { state: T; message?: string; error?: string } => {
  const on = value === true;
  let guidance: TrainingGuidance = {
    ...state.guidance,
    boundaries: { ...state.guidance.boundaries, [key]: on },
  };
  const text = key === 'noPublic'
    ? (on ? '设下界限：不在有别人的地方练习' : '取消了「不在人前练习」')
    : (on ? '设下界限：今天不要再加码' : '取消了「今天不要加码」');
  if (key === 'noPublic' && on && PUBLIC_KINDS.has(guidance.assignment.placeKind) && step(guidance, 'arrive')?.status === 'todo') {
    guidance = { ...guidance, assignment: buildAssignment(state.locations, guidance.style, state.day, true, guidance.lastReport) };
  }
  guidance = remember(guidance, state.day, text);
  const next = pushLog({ ...state, guidance }, `界限：${text}`, 'info');
  return { state: next };
};

export const reportTraining = <T extends GuidanceCarrier>(
  state: T,
  report: TrainingReport,
): { state: T; message?: string; error?: string } => {
  const practice = step(state.guidance, 'practice');
  const reporting = step(state.guidance, 'report');
  if (!practice || practice.status === 'todo') return unchanged(state, '先完成练习，或先拒绝这项，再做今天的交代。');
  if (!reporting || reporting.status !== 'todo') return unchanged(state, '今天的交代已经做过了。');
  const observer = state.guidance.style === 'observer';
  const delta = report === 'honest' ? (observer ? 4 : 2) : report === 'polished' ? (observer ? -2 : 1) : 2;
  const stressDelta = report === 'care' ? -6 : 0;
  const label = report === 'honest' ? '如实交代了今天' : report === 'polished' ? '把今天说得比较好听' : '请求先被照顾';
  const message = report === 'honest'
    ? '🧭 课题：我按实际发生的情况交代今天。'
    : report === 'polished'
      ? '🧭 课题：我把今天说得顺利一些。'
      : '🧭 课题：我请求先被照顾，今天的练习可以停在这里。';
  const reported = replaceStep({ ...state.guidance, lastReport: report, easeNext: report === 'care' ? true : state.guidance.easeNext }, 'report', 'done');
  const guidance = remember(withTrust(reported, delta), state.day, label);
  const next = pushLog({
    ...state,
    stress: clamp(state.stress + stressDelta, 0, 100),
    guidance,
    pendingEvents: [...state.pendingEvents, `{{user}}对今天的课题做了交代：「${label}」。请用调教者的身份给出一句评价，并让下一轮安排接上这件事。不要加罚，不要要求设备输出。`].slice(-6),
  }, `课题：${label}（信任 ${delta > 0 ? `+${delta}` : delta}）`, delta < 0 ? 'info' : 'good');
  return { state: next, message };
};

export const refreshAssignment = <T extends GuidanceCarrier>(state: T): T => {
  if (!state.guidance?.assignment) {
    return { ...state, guidance: initialGuidance(state.locations, 'gentle', state.guidance?.trust) };
  }
  const report = step(state.guidance, 'report');
  const finishedDay = Math.max(1, state.day - 1);
  const echo = state.guidance.lastReport;
  const wasPaused = state.guidance.boundaries.paused;
  let guidance = state.guidance;
  let next = state;
  if (report && report.status === 'todo') {
    if (wasPaused) {
      guidance = remember(guidance, finishedDay, '今天暂停了，不要求晚间交代');
    } else {
      const delta = guidance.style === 'strict' ? -1 : 0;
      guidance = remember(withTrust(guidance, delta), finishedDay, '今天没有做晚间交代');
      if (delta) next = pushLog({ ...next, guidance }, '课题：没有交代今天（信任 -1，不是违规）', 'info');
    }
  }
  const easeToday = guidance.easeNext || echo === 'care';
  guidance = {
    ...guidance,
    lastReport: null,
    easeNext: false,
    easeToday,
    boundaries: { ...guidance.boundaries, paused: false, noEscalation: false },
    assignment: buildAssignment(next.locations, guidance.style, state.day, guidance.boundaries.noPublic, echo),
  };
  return pushLog({ ...next, guidance }, `新的一天：${TRAINER_STYLES[guidance.style].name}安排了课题「${guidance.assignment.placeName}」${easeToday ? '（今天改轻）' : ''}`, 'info');
};

export const guidancePromptLines = (guidance: TrainingGuidance) => {
  const style = TRAINER_STYLES[guidance.style];
  const steps = guidance.assignment.steps.map((item) => `${item.title}${item.status === 'done' ? '已完成' : item.status === 'declined' ? '已拒绝' : '未做'}`).join('、');
  const limits = [
    guidance.boundaries.noPublic ? '不在有别人的地方练习' : '',
    guidance.boundaries.noEscalation ? '今天不要再加码' : '',
    guidance.boundaries.paused ? '今天剩下的新练习已暂停' : '',
    guidance.easeToday ? '今天是轻一天，消耗很大的练习先不做' : '',
  ].filter(Boolean);
  const memory = guidance.memory.slice(-4).map((entry) => `第${entry.day}天 ${entry.text}`).join('；');
  return [
    `调教风格：${style.name}。${style.blurb}`,
    `信任：${guidance.trust}/100（${trustLabel(guidance.trust)}）。信任只影响调教者怎么安排和评价，不触发任何设备。`,
    `今日课题：${guidance.assignment.title}。报到地点「${guidance.assignment.placeName}」。进度：${steps}。`,
    limits.length ? `玩家已经生效的界限：${limits.join('、')}。` : '',
    memory ? `调教者记得：${memory}。` : '',
    '【界限】拒绝、暂停和上面列出的界限已经生效。不得把拒绝写成同意，不得把暂停写成还在训练，不得要求越过界限，不得因此记过或要求惩罚。你仍然是安排训练的一方，玩家是接受训练的一方。',
  ].filter(Boolean);
};
