import type { PitchData } from './pitchTracker';

export type VoiceExerciseId = 'warmup' | 'glide' | 'reading' | 'expression';

export interface VoiceTrainingSessionRecord {
  id: string;
  completedAt: number;
  exercise: VoiceExerciseId;
  durationSec: number;
  averagePitchHz: number;
  targetHitPercent: number;
  stabilityPercent: number;
  clarityPercent: number;
  continuityPercent: number;
}

export interface VoiceTrainingProfile {
  practiceText?: string;
  baselineHz: number;
  targetMinHz: number;
  targetMaxHz: number;
  calibratedAt: number;
  completedSessions: number;
  bestStability: number;
  lastCompletedAt: number;
}

export const DEFAULT_VOICE_TRAINING_PROFILE: VoiceTrainingProfile = {
  baselineHz: 0,
  targetMinHz: 190,
  targetMaxHz: 260,
  calibratedAt: 0,
  completedSessions: 0,
  bestStability: 0,
  lastCompletedAt: 0,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const normalizeVoiceTarget = (minHz: number, maxHz: number): [number, number] => {
  const min = clamp(Number.isFinite(minHz) ? Math.round(minHz) : 190, 100, 320);
  const max = clamp(Number.isFinite(maxHz) ? Math.round(maxHz) : 260, 120, 360);
  return min <= max - 20 ? [min, max] : [Math.max(100, max - 20), max];
};

export const calculateAdaptiveVoiceTarget = (baselineHz: number): [number, number] => {
  if (!Number.isFinite(baselineHz) || baselineHz <= 0) return [190, 260];
  const center = clamp(Math.round(baselineHz * 1.2), 155, 245);
  return normalizeVoiceTarget(center - 22, center + 28);
};

export const medianPitch = (samples: PitchData[]): number => {
  const values = samples.map((sample) => sample.frequency).filter((value) => value > 0).sort((a, b) => a - b);
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2);
};

export const calculateVoiceMetrics = (
  samples: PitchData[],
  targetMinHz: number,
  targetMaxHz: number,
) => {
  const voiced = samples.filter((sample) => sample.frequency > 0);
  const pitches = voiced.map((sample) => sample.frequency);
  const averagePitchHz = pitches.length
    ? pitches.reduce((sum, value) => sum + value, 0) / pitches.length
    : 0;
  const deviation = pitches.length
    ? Math.sqrt(pitches.reduce((sum, value) => sum + Math.pow(value - averagePitchHz, 2), 0) / pitches.length)
    : 0;
  const targetHits = pitches.filter((value) => value >= targetMinHz && value <= targetMaxHz).length;
  const range = pitches.length ? Math.max(...pitches) - Math.min(...pitches) : 0;

  return {
    averagePitchHz: Math.round(averagePitchHz),
    stabilityPercent: averagePitchHz ? clamp(Math.round(100 - (deviation / averagePitchHz) * 250), 0, 100) : 0,
    clarityPercent: voiced.length
      ? clamp(Math.round(voiced.reduce((sum, sample) => sum + sample.clarity, 0) / voiced.length * 100), 0, 100)
      : 0,
    continuityPercent: samples.length ? clamp(Math.round(voiced.length / samples.length * 100), 0, 100) : 0,
    targetHitPercent: voiced.length ? clamp(Math.round(targetHits / voiced.length * 100), 0, 100) : 0,
    intonationPercent: clamp(Math.round(range * 1.5), 0, 100),
  };
};
