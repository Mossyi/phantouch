export type PavlovStageId =
  | 'imprint' | 'polygraph' | 'branding' | 'collapse' | 'social' | 'sacrifice'
  | 'breath' | 'inversion' | 'phantom' | 'allfours'
  | 'bark' | 'whistle' | 'muzzle' | 'guard'
  | 'beg' | 'fetch' | 'snout' | 'tail'
  | 'dark' | 'snap' | 'feral';

export type PavlovStageGroup = 'conditioning' | 'regulation' | 'audio' | 'motion' | 'vision';
export type PavlovRequirement = 'ems' | 'toy' | 'heart' | 'motion' | 'microphone' | 'camera' | 'ai';

export interface PavlovStageDefinition {
  id: PavlovStageId;
  number: number;
  title: string;
  group: PavlovStageGroup;
  durationMinutes: number;
  requirements: PavlovRequirement[];
}

export const PAVLOV_STAGE_GROUPS: Array<{ id: 'all' | PavlovStageGroup; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'conditioning', label: '条件反射' },
  { id: 'regulation', label: '节律控制' },
  { id: 'audio', label: '声音反应' },
  { id: 'motion', label: '动作感应' },
  { id: 'vision', label: '镜头检测' },
];

export const PAVLOV_STAGES: PavlovStageDefinition[] = ([
  { id: 'imprint', number: 1, title: '强制刻印', group: 'conditioning', durationMinutes: 8, requirements: ['ems', 'toy'] },
  { id: 'polygraph', number: 2, title: '肉体考核', group: 'conditioning', durationMinutes: 1, requirements: ['heart', 'motion', 'toy'] },
  { id: 'branding', number: 3, title: '词汇烙印', group: 'conditioning', durationMinutes: 4, requirements: ['ai', 'ems'] },
  { id: 'collapse', number: 4, title: '多巴胺崩坏', group: 'conditioning', durationMinutes: 1, requirements: ['ems', 'toy'] },
  { id: 'social', number: 5, title: '社交提示训练', group: 'conditioning', durationMinutes: 1, requirements: ['ems', 'toy'] },
  { id: 'sacrifice', number: 6, title: '反应速度', group: 'conditioning', durationMinutes: 2, requirements: ['ems'] },
  { id: 'breath', number: 7, title: '呼吸节律', group: 'regulation', durationMinutes: 1, requirements: ['motion'] },
  { id: 'inversion', number: 8, title: '心率定力', group: 'regulation', durationMinutes: 4, requirements: ['ai', 'heart', 'ems'] },
  { id: 'phantom', number: 9, title: '随机提示', group: 'regulation', durationMinutes: 3, requirements: ['ems'] },
  { id: 'allfours', number: 10, title: '水平定姿', group: 'regulation', durationMinutes: 2, requirements: ['motion', 'ems'] },
  { id: 'bark', number: 11, title: '声音反射', group: 'audio', durationMinutes: 2, requirements: ['microphone', 'toy', 'ems'] },
  { id: 'whistle', number: 12, title: '高频提示', group: 'audio', durationMinutes: 2, requirements: ['ems', 'toy'] },
  { id: 'muzzle', number: 15, title: '安静挑战', group: 'audio', durationMinutes: 2, requirements: ['microphone', 'ems', 'toy'] },
  { id: 'guard', number: 18, title: '声光反应', group: 'audio', durationMinutes: 2, requirements: ['microphone', 'ems', 'toy'] },
  { id: 'beg', number: 13, title: '平衡定姿', group: 'motion', durationMinutes: 1, requirements: ['motion', 'ems', 'toy'] },
  { id: 'fetch', number: 14, title: '动静切换', group: 'motion', durationMinutes: 2, requirements: ['motion', 'ems', 'toy'] },
  { id: 'snout', number: 16, title: '触点专注', group: 'motion', durationMinutes: 2, requirements: ['toy'] },
  { id: 'tail', number: 17, title: '节奏摆动', group: 'motion', durationMinutes: 1, requirements: ['motion', 'ems', 'toy'] },
  { id: 'dark', number: 19, title: '遮光定格', group: 'vision', durationMinutes: 1, requirements: ['camera', 'ems', 'toy'] },
  { id: 'snap', number: 20, title: '镜头定格', group: 'vision', durationMinutes: 1, requirements: ['camera', 'ems', 'toy'] },
  { id: 'feral', number: 21, title: '镜头动态响应', group: 'vision', durationMinutes: 1, requirements: ['camera', 'ems', 'toy'] },
] satisfies PavlovStageDefinition[]).sort((a, b) => a.number - b.number);

export interface PavlovSessionRecord {
  id: string;
  stageId: PavlovStageId;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  outcome: 'completed' | 'stopped';
}

export interface PavlovProgressState {
  completedStageIds: PavlovStageId[];
  imprintCount: number;
  sessions: PavlovSessionRecord[];
}

const STORAGE_KEY = 'ycy_pavlov_progress_v1';
const STAGE_IDS = new Set(PAVLOV_STAGES.map((stage) => stage.id));

export const normalizePavlovProgress = (value: unknown): PavlovProgressState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { completedStageIds: [], imprintCount: 0, sessions: [] };
  }
  const raw = value as Partial<PavlovProgressState>;
  const completedStageIds = Array.isArray(raw.completedStageIds)
    ? [...new Set(raw.completedStageIds.filter((id): id is PavlovStageId => typeof id === 'string' && STAGE_IDS.has(id as PavlovStageId)))]
    : [];
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.slice(0, 50).flatMap((entry, index): PavlovSessionRecord[] => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as Partial<PavlovSessionRecord>;
      if (typeof item.stageId !== 'string' || !STAGE_IDS.has(item.stageId as PavlovStageId)) return [];
      const startedAt = Number(item.startedAt);
      const endedAt = Number(item.endedAt);
      if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || startedAt < 0 || endedAt < startedAt) return [];
      return [{
        id: typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ? item.id : `recovered_${index}`,
        stageId: item.stageId as PavlovStageId,
        startedAt: Math.floor(startedAt),
        endedAt: Math.floor(endedAt),
        durationSec: Math.max(0, Math.min(86_400, Math.floor(Number(item.durationSec) || 0))),
        outcome: item.outcome === 'completed' ? 'completed' : 'stopped',
      }];
    })
    : [];
  return {
    completedStageIds,
    imprintCount: Math.max(0, Math.min(99, Math.floor(Number(raw.imprintCount) || 0))),
    sessions,
  };
};

type PavlovProgressListener = (state: PavlovProgressState) => void;

export class PavlovProgressEngine {
  private static instance: PavlovProgressEngine;
  private state: PavlovProgressState = { completedStageIds: [], imprintCount: 0, sessions: [] };
  private activeSession: { id: string; stageId: PavlovStageId; startedAt: number } | null = null;
  private listeners = new Set<PavlovProgressListener>();

  private constructor() {
    try { this.state = normalizePavlovProgress(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch {}
  }

  static getInstance() {
    if (!PavlovProgressEngine.instance) PavlovProgressEngine.instance = new PavlovProgressEngine();
    return PavlovProgressEngine.instance;
  }

  getState(): PavlovProgressState {
    return { ...this.state, completedStageIds: [...this.state.completedStageIds], sessions: this.state.sessions.map((item) => ({ ...item })) };
  }

  subscribe(listener: PavlovProgressListener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }

  startSession(stageId: PavlovStageId) {
    if (!STAGE_IDS.has(stageId) || this.activeSession?.stageId === stageId) return;
    if (this.activeSession) this.finishActive('stopped');
    this.activeSession = { id: `pavlov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, stageId, startedAt: Date.now() };
  }

  completeSession(stageId: PavlovStageId) {
    if (!STAGE_IDS.has(stageId)) return;
    if (!this.state.completedStageIds.includes(stageId)) this.state.completedStageIds.push(stageId);
    if (stageId === 'imprint') this.state.imprintCount = 0;
    if (this.activeSession?.stageId === stageId) this.finishActive('completed');
    else { this.save(); this.notify(); }
  }

  stopSession(stageId: PavlovStageId | 'idle') {
    if (stageId !== 'idle' && this.activeSession?.stageId === stageId) this.finishActive('stopped');
  }

  setImprintCount(count: number) {
    this.state.imprintCount = Math.max(0, Math.min(99, Math.floor(Number(count) || 0)));
    this.save();
    this.notify();
  }

  resetProgress() {
    this.activeSession = null;
    this.state = { completedStageIds: [], imprintCount: 0, sessions: [] };
    this.save();
    this.notify();
  }

  private finishActive(outcome: PavlovSessionRecord['outcome']) {
    if (!this.activeSession) return;
    const endedAt = Date.now();
    this.state.sessions.unshift({
      ...this.activeSession,
      endedAt,
      durationSec: Math.max(0, Math.round((endedAt - this.activeSession.startedAt) / 1000)),
      outcome,
    });
    this.state.sessions = this.state.sessions.slice(0, 50);
    this.activeSession = null;
    this.save();
    this.notify();
  }

  private save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch {}
  }

  private notify() {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try { listener(snapshot); } catch (error) { console.warn('神经刻印进度监听器执行失败:', error); }
    });
  }
}
