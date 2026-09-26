export const TYPING_VISUAL_COOLDOWN_MS = 1_200;
export const COGNITIVE_VISUAL_PULSE_MS = 450;

export interface TypingVisualPulse {
  blurPx: number;
  wobble: boolean;
  invert: boolean;
  durationMs: number;
}

export const createTypingVisualPulse = (random: () => number = Math.random): TypingVisualPulse => {
  const safeRandom = () => {
    const value = random();
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  };
  return {
    blurPx: 0.8 + safeRandom() * 1.7,
    wobble: safeRandom() > 0.25,
    invert: safeRandom() > 0.85,
    durationMs: Math.round(180 + safeRandom() * 140),
  };
};
