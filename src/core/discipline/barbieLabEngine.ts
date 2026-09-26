export type BarbieLabMode = 'fantasy' | 'expression';
export type BarbieLabPathId = 'voice' | 'posture' | 'style' | 'confidence';
export type BarbieRitualPhase = 'checkin' | 'practice' | 'aftercare';

export interface BarbieLabConsent {
  useVoicePrompts: boolean;
  allowDeviceCues: boolean;
  sessionMinutes: number;
  safeWord: string;
}

export interface BarbieLabReflection {
  id: string;
  date: string;
  ritualId: string;
  mood: string;
  note: string;
}

export interface BarbieLabState {
  mode: BarbieLabMode;
  displayName: string;
  selectedPathId: BarbieLabPathId;
  completedRitualIds: string[];
  totalGlowPoints: number;
  consent: BarbieLabConsent;
  reflections: BarbieLabReflection[];
  activeRitualId: string | null;
  activePhase: BarbieRitualPhase | null;
}

export interface BarbiePath {
  id: BarbieLabPathId;
  emoji: string;
  title: string;
  description: string;
  color: string;
}

export interface BarbieRitual {
  id: string;
  pathId: BarbieLabPathId;
  title: string;
  subtitle: string;
  duration: number;
  reward: number;
  checkin: string;
  practice: string;
  aftercare: string;
}

export const BARBIE_PATHS: BarbiePath[] = [
  { id: 'voice', emoji: '🎙️', title: '甜心声线', description: '练习更有自信、层次与温度的表达。', color: 'from-fuchsia-500 to-pink-400' },
  { id: 'posture', emoji: '🩰', title: '芭比仪态', description: '用呼吸、重心与节奏塑造轻盈感。', color: 'from-rose-400 to-orange-300' },
  { id: 'style', emoji: '🎀', title: '造型灵感', description: '用色彩、配件与心情建立个人风格。', color: 'from-pink-500 to-violet-400' },
  { id: 'confidence', emoji: '💗', title: '闪耀自信', description: '把想要的自己，变成日常可感知的力量。', color: 'from-purple-500 to-fuchsia-400' },
];

export const BARBIE_RITUALS: BarbieRitual[] = [
  {
    id: 'voice-sparkle', pathId: 'voice', title: '镜前甜心开场', subtitle: '用一句温柔的自我介绍打开今天', duration: 8, reward: 24,
    checkin: '找一个自在、不会被打扰的空间。今天只追求舒服和自然，不必追求高音。',
    practice: '面对镜子或前置镜头，缓慢念三次：「今天的我，值得被温柔看见。」每次都让语尾轻轻落下。',
    aftercare: '喝一口水，放松下颌与肩膀。记录刚才最喜欢的一个声音瞬间。',
  },
  {
    id: 'posture-ribbon', pathId: 'posture', title: '蝴蝶结步伐', subtitle: '把五分钟走成自己的小秀场', duration: 10, reward: 28,
    checkin: '穿上令你舒服的鞋子；膝盖或腰背不适时请跳过这一项。',
    practice: '肩膀放松、视线平视，沿一条安全路线慢走五分钟。每四步轻轻呼气一次，寻找自己最放松的节奏。',
    aftercare: '做两次深呼吸，轻转脚踝。给今天的步伐选一个关键词：轻盈、俏皮或从容。',
  },
  {
    id: 'style-palette', pathId: 'style', title: '今日粉彩调色盘', subtitle: '用一件小单品完成风格实验', duration: 12, reward: 32,
    checkin: '只选择你愿意尝试的单品；不拍照、不分享也完全可以。',
    practice: '从衣橱挑选一件粉色、珍珠或蝴蝶结元素，搭配已有衣物。观察它让你感觉更柔和、明亮还是大胆。',
    aftercare: '把单品放回容易找到的位置。记录一个想下次继续尝试的搭配灵感。',
  },
  {
    id: 'confidence-glow', pathId: 'confidence', title: '闪耀宣言', subtitle: '把想成为的样子写成一句话', duration: 6, reward: 20,
    checkin: '今天只需要对自己诚实，不需要向任何人证明什么。',
    practice: '写下「我可以______，也依然值得被喜欢。」然后念出来一次。把空格填成你今天最想练习的品质。',
    aftercare: '给自己一个拥抱或伸展。若情绪不舒服，暂停训练并做一件能让你平静的小事。',
  },
];

const DEFAULT_STATE: BarbieLabState = {
  mode: 'fantasy',
  displayName: '甜心',
  selectedPathId: 'voice',
  completedRitualIds: [],
  totalGlowPoints: 0,
  consent: { useVoicePrompts: true, allowDeviceCues: false, sessionMinutes: 15, safeWord: '暂停' },
  reflections: [],
  activeRitualId: null,
  activePhase: null,
};

const createDefaultState = (): BarbieLabState => ({
  ...DEFAULT_STATE,
  completedRitualIds: [],
  consent: { ...DEFAULT_STATE.consent },
  reflections: [],
});

export const normalizeBarbieLabState = (value: unknown): BarbieLabState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createDefaultState();
  const saved = value as Partial<BarbieLabState>;
  const validPaths = new Set(BARBIE_PATHS.map((path) => path.id));
  const validRituals = new Set(BARBIE_RITUALS.map((ritual) => ritual.id));
  const consent = saved.consent && typeof saved.consent === 'object' && !Array.isArray(saved.consent)
    ? saved.consent as Partial<BarbieLabConsent>
    : {};
  const sessionMinutes = Number(consent.sessionMinutes);

  return {
    mode: saved.mode === 'expression' ? 'expression' : 'fantasy',
    displayName: typeof saved.displayName === 'string'
      ? saved.displayName.trim().slice(0, 30) || DEFAULT_STATE.displayName
      : DEFAULT_STATE.displayName,
    selectedPathId: validPaths.has(saved.selectedPathId as BarbieLabPathId)
      ? saved.selectedPathId as BarbieLabPathId
      : DEFAULT_STATE.selectedPathId,
    completedRitualIds: Array.isArray(saved.completedRitualIds)
      ? [...new Set(saved.completedRitualIds.filter(
        (id): id is string => typeof id === 'string' && validRituals.has(id),
      ))].slice(0, BARBIE_RITUALS.length)
      : [],
    totalGlowPoints: Number.isFinite(Number(saved.totalGlowPoints))
      ? Math.max(0, Math.min(999_999, Math.round(Number(saved.totalGlowPoints))))
      : 0,
    consent: {
      useVoicePrompts: typeof consent.useVoicePrompts === 'boolean'
        ? consent.useVoicePrompts
        : DEFAULT_STATE.consent.useVoicePrompts,
      allowDeviceCues: typeof consent.allowDeviceCues === 'boolean'
        ? consent.allowDeviceCues
        : DEFAULT_STATE.consent.allowDeviceCues,
      sessionMinutes: Number.isFinite(sessionMinutes)
        ? Math.max(5, Math.min(60, Math.round(sessionMinutes)))
        : DEFAULT_STATE.consent.sessionMinutes,
      safeWord: typeof consent.safeWord === 'string'
        ? consent.safeWord.trim().slice(0, 20) || DEFAULT_STATE.consent.safeWord
        : DEFAULT_STATE.consent.safeWord,
    },
    reflections: Array.isArray(saved.reflections)
      ? saved.reflections.slice(0, 100).flatMap((entry, index): BarbieLabReflection[] => {
        if (!entry || typeof entry !== 'object' || typeof entry.note !== 'string') return [];
        const ritualId = typeof entry.ritualId === 'string' && validRituals.has(entry.ritualId)
          ? entry.ritualId
          : '';
        const note = entry.note.trim().slice(0, 800);
        if (!ritualId || !note) return [];
        return [{
          id: typeof entry.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(entry.id)
            ? entry.id
            : `reflection-recovered-${index}`,
          date: typeof entry.date === 'string' ? entry.date.slice(0, 30) : '',
          ritualId,
          mood: typeof entry.mood === 'string' ? entry.mood.slice(0, 30) : '',
          note,
        }];
      })
      : [],
    activeRitualId: null,
    activePhase: null,
  };
};

export type BarbieLabListener = (state: BarbieLabState) => void;

/** 仅保存非敏感的仪式进度与用户明确写下的复盘；不保存音频、图像或设备数据。 */
export class BarbieLabEngine {
  private static instance: BarbieLabEngine;
  private state: BarbieLabState = createDefaultState();
  private listeners = new Set<BarbieLabListener>();

  private constructor() { this.load(); }

  static getInstance() {
    if (!BarbieLabEngine.instance) BarbieLabEngine.instance = new BarbieLabEngine();
    return BarbieLabEngine.instance;
  }

  private load() {
    try {
      this.state = normalizeBarbieLabState(JSON.parse(localStorage.getItem('ycy_barbie_lab') || 'null'));
    } catch {
      this.state = createDefaultState();
    }
  }

  private save() {
    try {
      const { activeRitualId, activePhase, ...persisted } = this.state;
      localStorage.setItem('ycy_barbie_lab', JSON.stringify(persisted));
    } catch { /* local storage is optional */ }
  }

  private notify() {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try { listener(snapshot); } catch (error) { console.warn('Barbie Lab 监听器执行失败:', error); }
    });
  }

  getState(): BarbieLabState { return JSON.parse(JSON.stringify(this.state)); }
  subscribe(listener: BarbieLabListener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }

  updateProfile(update: Partial<Pick<BarbieLabState, 'mode' | 'displayName' | 'selectedPathId'>>) {
    if (update.mode === 'fantasy' || update.mode === 'expression') this.state.mode = update.mode;
    if (typeof update.displayName === 'string') this.state.displayName = update.displayName.trim().slice(0, 30) || DEFAULT_STATE.displayName;
    if (update.selectedPathId && BARBIE_PATHS.some((path) => path.id === update.selectedPathId)) this.state.selectedPathId = update.selectedPathId;
    this.save(); this.notify();
  }

  updateConsent(update: Partial<BarbieLabConsent>) {
    const sessionMinutes = Number(update.sessionMinutes);
    this.state.consent = {
      useVoicePrompts: typeof update.useVoicePrompts === 'boolean' ? update.useVoicePrompts : this.state.consent.useVoicePrompts,
      allowDeviceCues: typeof update.allowDeviceCues === 'boolean' ? update.allowDeviceCues : this.state.consent.allowDeviceCues,
      sessionMinutes: Number.isFinite(sessionMinutes) ? Math.max(5, Math.min(60, Math.round(sessionMinutes))) : this.state.consent.sessionMinutes,
      safeWord: typeof update.safeWord === 'string' ? update.safeWord.trim().slice(0, 20) || '暂停' : this.state.consent.safeWord,
    };
    this.save(); this.notify();
  }

  startRitual(ritualId: string) {
    if (!BARBIE_RITUALS.some((ritual) => ritual.id === ritualId)) return false;
    this.state.activeRitualId = ritualId;
    this.state.activePhase = 'checkin';
    this.notify();
    return true;
  }

  advanceRitual() {
    if (!this.state.activePhase) return;
    this.state.activePhase = this.state.activePhase === 'checkin' ? 'practice' : this.state.activePhase === 'practice' ? 'aftercare' : 'aftercare';
    this.notify();
  }

  finishRitual(mood: string, note: string) {
    const ritual = BARBIE_RITUALS.find((item) => item.id === this.state.activeRitualId);
    if (!ritual) return;
    const firstCompletion = !this.state.completedRitualIds.includes(ritual.id);
    if (firstCompletion) {
      this.state.completedRitualIds.push(ritual.id);
      this.state.totalGlowPoints += ritual.reward;
    }
    const cleanNote = note.trim().slice(0, 800);
    if (cleanNote) this.state.reflections.unshift({ id: `reflection_${Date.now()}`, ritualId: ritual.id, date: new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }), mood: mood.slice(0, 30), note: cleanNote });
    this.state.activeRitualId = null;
    this.state.activePhase = null;
    this.save(); this.notify();
    if (firstCompletion && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ycy:barbie-ritual-complete', { detail: { ritualId: ritual.id, pathId: ritual.pathId, reward: ritual.reward } }));
    }
  }

  stopRitual() { this.state.activeRitualId = null; this.state.activePhase = null; this.notify(); }

  resetAll() {
    this.state = createDefaultState();
    this.save();
    this.notify();
  }
}
