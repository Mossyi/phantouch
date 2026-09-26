import {
  DEFAULT_VOICE_TRAINING_PROFILE,
  VoiceTrainingProfile,
  VoiceTrainingSessionRecord,
} from '../voice/voiceTraining';

export interface BarbiePostureSessionRecord {
  id: string;
  completedAt: number;
  mode: 'heels' | 'tray' | 'shoulders' | 'statue';
  sensitivity: 'relaxed' | 'balanced' | 'strict';
  durationSec: number;
  score: number;
  stabilityPercent: number;
  violationCount: number;
  violationDurationSec: number;
  maxMetric: number;
  averageMetric: number;
  cadenceSpm: number;
  consistencyPercent: number;
}

export interface BarbieSuiteState {
  growth: Record<string, number>;
  publicPersona: { name: string; tone: string; style: string };
  privatePersona: { name: string; tone: string; style: string };
  directorStyle: 'gentle' | 'academy' | 'story';
  bpm: number;
  threshold: number;
  bioUseLive: boolean;
  bioAutoStop: boolean;
  partnerCode: string;
  partnerActive: boolean;
  partnerExpiresAt: number;
  audit: string[];
  rituals: string[];
  choreography: { title: string; minutes: number; peak: number; cues: string[] }[];
  postureStats: { completedSessions: number; bestScore: number; lastScore: number; lastCompletedAt: number };
  postureHistory: BarbiePostureSessionRecord[];
  voiceTraining: VoiceTrainingProfile;
  voiceHistory: VoiceTrainingSessionRecord[];
}

const BASE_STATE: BarbieSuiteState = {
  growth: { '声线': 18, '仪态': 12, '穿搭': 26, '自信': 20, '服从剧情': 8, '故事关系': 14 },
  publicPersona: { name: '日常的我', tone: '从容、清晰', style: '干净粉彩' },
  privatePersona: { name: '午夜甜心', tone: '俏皮、柔软', style: '蝴蝶结与珍珠' },
  directorStyle: 'gentle',
  bpm: 72,
  threshold: 128,
  bioUseLive: true,
  bioAutoStop: true,
  partnerCode: '',
  partnerActive: false,
  partnerExpiresAt: 0,
  audit: [],
  rituals: [],
  choreography: [{ title: '粉色呼吸灯', minutes: 5, peak: 25, cues: ['吸气 4 拍', '停留 2 拍', '呼气 6 拍'] }],
  postureStats: { completedSessions: 0, bestScore: 0, lastScore: 0, lastCompletedAt: 0 },
  postureHistory: [],
  voiceTraining: { ...DEFAULT_VOICE_TRAINING_PROFILE },
  voiceHistory: [],
};

export const createDefaultBarbieSuiteState = (): BarbieSuiteState => ({
  ...BASE_STATE,
  growth: { ...BASE_STATE.growth },
  publicPersona: { ...BASE_STATE.publicPersona },
  privatePersona: { ...BASE_STATE.privatePersona },
  audit: [],
  rituals: [],
  choreography: BASE_STATE.choreography.map((item) => ({ ...item, cues: [...item.cues] })),
  postureStats: { ...BASE_STATE.postureStats },
  postureHistory: [],
  voiceTraining: { ...BASE_STATE.voiceTraining },
  voiceHistory: [],
});

export const BARBIE_SUITE_DEFAULT_STATE = createDefaultBarbieSuiteState();

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const finiteNumber = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  if (typeof value === 'string' && !value.trim()) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const normalizeBarbieSuiteState = (value: unknown, now = Date.now()): BarbieSuiteState => {
  const defaults = createDefaultBarbieSuiteState();
  const raw = asRecord(value);
  if (!raw) return defaults;

  const rawGrowth = asRecord(raw.growth);
  const growth = Object.fromEntries(Object.entries(defaults.growth).map(([key, fallback]) => [
    key,
    Math.max(0, Math.min(100, Math.round(finiteNumber(rawGrowth?.[key], fallback)))),
  ]));

  const cleanPersona = (candidate: unknown, fallback: BarbieSuiteState['publicPersona']) => {
    const record = asRecord(candidate);
    return {
      name: typeof record?.name === 'string' ? record.name.trim().slice(0, 30) || fallback.name : fallback.name,
      tone: typeof record?.tone === 'string' ? record.tone.trim().slice(0, 80) || fallback.tone : fallback.tone,
      style: typeof record?.style === 'string' ? record.style.trim().slice(0, 80) || fallback.style : fallback.style,
    };
  };

  const choreography = Array.isArray(raw.choreography)
    ? raw.choreography.slice(0, 30).flatMap((candidate): BarbieSuiteState['choreography'] => {
        const item = asRecord(candidate);
        if (!item || typeof item.title !== 'string' || !item.title.trim()) return [];
        return [{
          title: item.title.trim().slice(0, 60),
          minutes: Math.max(1, Math.min(60, Math.round(finiteNumber(item.minutes, 5)))),
          peak: Math.max(0, Math.min(30, Math.round(finiteNumber(item.peak, 0)))),
          cues: Array.isArray(item.cues)
            ? item.cues.filter((cue): cue is string => typeof cue === 'string' && Boolean(cue.trim()))
                .slice(0, 12).map((cue) => cue.trim().slice(0, 80))
            : [],
        }];
      })
    : defaults.choreography;

  const expiresAt = Math.max(0, Math.round(finiteNumber(raw.partnerExpiresAt, 0)));
  const validPartnerCode = typeof raw.partnerCode === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(raw.partnerCode)
    ? raw.partnerCode
    : '';
  const partnerActive = raw.partnerActive === true
    && Boolean(validPartnerCode)
    && expiresAt > now
    && expiresAt <= now + 15 * 60 * 1000;
  const directorStyles = new Set<BarbieSuiteState['directorStyle']>(['gentle', 'academy', 'story']);
  const rawPostureStats = asRecord(raw.postureStats);
  const postureModes = new Set<BarbiePostureSessionRecord['mode']>(['heels', 'tray', 'shoulders', 'statue']);
  const postureSensitivities = new Set<BarbiePostureSessionRecord['sensitivity']>(['relaxed', 'balanced', 'strict']);
  const postureHistory = Array.isArray(raw.postureHistory)
    ? raw.postureHistory.slice(0, 20).flatMap((candidate, index): BarbiePostureSessionRecord[] => {
        const item = asRecord(candidate);
        if (!item) return [];
        const mode = item.mode as BarbiePostureSessionRecord['mode'];
        const sensitivity = item.sensitivity as BarbiePostureSessionRecord['sensitivity'];
        if (!postureModes.has(mode) || !postureSensitivities.has(sensitivity)) return [];
        const completedAt = Math.max(0, Math.min(now, Math.round(finiteNumber(item.completedAt, 0))));
        return [{
          id: typeof item.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(item.id)
            ? item.id
            : `posture-recovered-${index}`,
          completedAt,
          mode,
          sensitivity,
          durationSec: Math.max(1, Math.min(3600, Math.round(finiteNumber(item.durationSec, 1)))),
          score: Math.max(0, Math.min(100, Math.round(finiteNumber(item.score, 0)))),
          stabilityPercent: Math.max(0, Math.min(100, Math.round(finiteNumber(item.stabilityPercent, 0)))),
          violationCount: Math.max(0, Math.min(10_000, Math.floor(finiteNumber(item.violationCount, 0)))),
          violationDurationSec: Math.max(0, Math.min(3600, Math.round(finiteNumber(item.violationDurationSec, 0)))),
          maxMetric: Math.max(0, Math.min(10_000, Math.round(finiteNumber(item.maxMetric, 0) * 10) / 10)),
          averageMetric: Math.max(0, Math.min(10_000, Math.round(finiteNumber(item.averageMetric, 0) * 10) / 10)),
          cadenceSpm: Math.max(0, Math.min(240, Math.round(finiteNumber(item.cadenceSpm, 0)))),
          consistencyPercent: Math.max(0, Math.min(100, Math.round(finiteNumber(item.consistencyPercent, 0)))),
        }];
      })
    : [];
  const rawVoiceTraining = asRecord(raw.voiceTraining);
  const [targetMinHz, targetMaxHz] = (() => {
    const min = Math.max(100, Math.min(320, Math.round(finiteNumber(rawVoiceTraining?.targetMinHz, defaults.voiceTraining.targetMinHz))));
    const max = Math.max(120, Math.min(360, Math.round(finiteNumber(rawVoiceTraining?.targetMaxHz, defaults.voiceTraining.targetMaxHz))));
    return min <= max - 20 ? [min, max] : [Math.max(100, max - 20), max];
  })();
  const exerciseIds = new Set<VoiceTrainingSessionRecord['exercise']>(['warmup', 'glide', 'reading', 'expression']);
  const voiceHistory = Array.isArray(raw.voiceHistory)
    ? raw.voiceHistory.slice(0, 1000).flatMap((candidate, index): VoiceTrainingSessionRecord[] => {
        const item = asRecord(candidate);
        const exercise = item?.exercise as VoiceTrainingSessionRecord['exercise'];
        if (!item || !exerciseIds.has(exercise)) return [];
        return [{
          id: typeof item.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(item.id) ? item.id : `voice-recovered-${index}`,
          completedAt: Math.max(0, Math.min(now, Math.round(finiteNumber(item.completedAt, 0)))),
          exercise,
          durationSec: Math.max(1, Math.min(3600, Math.round(finiteNumber(item.durationSec, 1)))),
          averagePitchHz: Math.max(0, Math.min(600, Math.round(finiteNumber(item.averagePitchHz, 0)))),
          targetHitPercent: Math.max(0, Math.min(100, Math.round(finiteNumber(item.targetHitPercent, 0)))),
          stabilityPercent: Math.max(0, Math.min(100, Math.round(finiteNumber(item.stabilityPercent, 0)))),
          clarityPercent: Math.max(0, Math.min(100, Math.round(finiteNumber(item.clarityPercent, 0)))),
          continuityPercent: Math.max(0, Math.min(100, Math.round(finiteNumber(item.continuityPercent, 0)))),
        }];
      })
    : [];

  return {
    growth,
    publicPersona: cleanPersona(raw.publicPersona, defaults.publicPersona),
    privatePersona: cleanPersona(raw.privatePersona, defaults.privatePersona),
    directorStyle: directorStyles.has(raw.directorStyle as BarbieSuiteState['directorStyle'])
      ? raw.directorStyle as BarbieSuiteState['directorStyle']
      : defaults.directorStyle,
    bpm: Math.max(50, Math.min(160, Math.round(finiteNumber(raw.bpm, defaults.bpm)))),
    threshold: Math.max(90, Math.min(155, Math.round(finiteNumber(raw.threshold, defaults.threshold)))),
    bioUseLive: typeof raw.bioUseLive === 'boolean' ? raw.bioUseLive : defaults.bioUseLive,
    bioAutoStop: typeof raw.bioAutoStop === 'boolean' ? raw.bioAutoStop : defaults.bioAutoStop,
    partnerCode: partnerActive ? validPartnerCode : '',
    partnerActive,
    partnerExpiresAt: partnerActive ? expiresAt : 0,
    audit: Array.isArray(raw.audit)
      ? raw.audit.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
          .slice(0, 20).map((item) => item.trim().slice(0, 300))
      : [],
    rituals: Array.isArray(raw.rituals)
      ? raw.rituals.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
          .slice(0, 30).map((item) => item.trim().slice(0, 200))
      : [],
    choreography: choreography.length > 0 ? choreography : defaults.choreography,
    postureStats: {
      completedSessions: Math.max(0, Math.min(10_000, Math.floor(finiteNumber(rawPostureStats?.completedSessions, 0)))),
      bestScore: Math.max(0, Math.min(100, Math.round(finiteNumber(rawPostureStats?.bestScore, 0)))),
      lastScore: Math.max(0, Math.min(100, Math.round(finiteNumber(rawPostureStats?.lastScore, 0)))),
      lastCompletedAt: Math.max(0, Math.min(now, Math.round(finiteNumber(rawPostureStats?.lastCompletedAt, 0)))),
    },
    postureHistory,
    voiceTraining: {
      ...(typeof rawVoiceTraining?.practiceText === 'string' ? { practiceText: rawVoiceTraining.practiceText.slice(0, 2000) } : {}),
      baselineHz: Math.max(0, Math.min(600, Math.round(finiteNumber(rawVoiceTraining?.baselineHz, 0)))),
      targetMinHz,
      targetMaxHz,
      calibratedAt: Math.max(0, Math.min(now, Math.round(finiteNumber(rawVoiceTraining?.calibratedAt, 0)))),
      completedSessions: Math.max(0, Math.min(10_000, Math.floor(finiteNumber(rawVoiceTraining?.completedSessions, 0)))),
      bestStability: Math.max(0, Math.min(100, Math.round(finiteNumber(rawVoiceTraining?.bestStability, 0)))),
      lastCompletedAt: Math.max(0, Math.min(now, Math.round(finiteNumber(rawVoiceTraining?.lastCompletedAt, 0)))),
    },
    voiceHistory,
  };
};
