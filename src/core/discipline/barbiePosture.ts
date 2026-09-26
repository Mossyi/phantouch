export type BarbiePostureMode = 'heels' | 'tray' | 'shoulders' | 'statue';
export type BarbiePostureSensitivity = 'relaxed' | 'balanced' | 'strict';

export interface BarbiePostureSample {
  deltaBeta: number;
  deltaGamma: number;
  linearAcceleration: number;
}

export interface BarbiePostureAssessment {
  isViolation: boolean;
  metric: number;
  threshold: number;
  label: string;
  correction: string;
  detail: string;
  secondaryMetric: number;
  secondaryLabel: string;
}

export interface BarbiePostureCalibration {
  isValid: boolean;
  baselineBeta: number;
  baselineGamma: number;
  tiltNoise: number;
  accelerationNoise: number;
  thresholdScale: number;
  sampleCount: number;
  message: string;
}

export const BARBIE_POSTURE_PROGRAMS: Record<BarbiePostureMode, {
  title: string;
  placement: string;
  goal: string;
}> = {
  heels: {
    title: '轻盈步态',
    placement: '将手机固定在腰包或贴身口袋',
    goal: '降低落脚冲击，保持均匀小步',
  },
  tray: {
    title: '托盘平衡',
    placement: '把手机平放在手掌或托盘中央',
    goal: '相对校准面保持稳定，不要求绝对水平',
  },
  shoulders: {
    title: '肩背舒展',
    placement: '将手机稳定贴在上胸外侧',
    goal: '自然呼吸，避免持续含胸或侧倾',
  },
  statue: {
    title: '静态定格',
    placement: '将手机固定在躯干或手臂',
    goal: '在舒适姿势中减少倾斜和突然移动',
  },
};

const SENSITIVITY_MULTIPLIER: Record<BarbiePostureSensitivity, number> = {
  strict: 0.72,
  balanced: 1,
  relaxed: 1.4,
};

const finiteMagnitude = (...values: number[]) => Math.max(0, ...values.map((value) => (
  Number.isFinite(value) ? Math.abs(value) : 0
)));

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

const median = (values: number[]): number => {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return 0;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
};

export const normalizeBarbiePostureAngleDelta = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return ((value + 180) % 360 + 360) % 360 - 180;
};

export const rotateBarbiePostureAngles = (
  beta: number,
  gamma: number,
  screenAngle = 0,
): { beta: number; gamma: number } => {
  const safeBeta = Number.isFinite(beta) ? beta : 0;
  const safeGamma = Number.isFinite(gamma) ? gamma : 0;
  const radians = normalizeBarbiePostureAngleDelta(screenAngle) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    beta: safeBeta * cosine + safeGamma * sine,
    gamma: -safeBeta * sine + safeGamma * cosine,
  };
};

export const calibrateBarbiePosture = (
  mode: BarbiePostureMode,
  samples: BarbiePostureSample[],
): BarbiePostureCalibration => {
  const finiteSamples = samples.filter((sample) => (
    Number.isFinite(sample.deltaBeta)
    && Number.isFinite(sample.deltaGamma)
    && Number.isFinite(sample.linearAcceleration)
  )).slice(-240);
  const requiredSamples = 8;
  if (finiteSamples.length < requiredSamples) {
    return {
      isValid: false,
      baselineBeta: 0,
      baselineGamma: 0,
      tiltNoise: 0,
      accelerationNoise: 0,
      thresholdScale: 1,
      sampleCount: finiteSamples.length,
      message: `有效传感器样本不足（${finiteSamples.length}/${requiredSamples}），请检查权限后重试。`,
    };
  }

  const baselineBeta = median(finiteSamples.map((sample) => sample.deltaBeta));
  const baselineGamma = median(finiteSamples.map((sample) => sample.deltaGamma));
  const baselineAcceleration = median(finiteSamples.map((sample) => sample.linearAcceleration));
  const tiltNoise = median(finiteSamples.map((sample) => finiteMagnitude(
    normalizeBarbiePostureAngleDelta(sample.deltaBeta - baselineBeta),
    normalizeBarbiePostureAngleDelta(sample.deltaGamma - baselineGamma),
  )));
  const accelerationNoise = median(finiteSamples.map((sample) => Math.abs(sample.linearAcceleration - baselineAcceleration)));
  const unstable = mode === 'heels' ? accelerationNoise > 1.8 : tiltNoise > 2.5;
  const relevantNoise = mode === 'heels' ? accelerationNoise / 1.8 : tiltNoise / 2.5;
  const thresholdScale = clamp(1 + relevantNoise * 0.35, 1, 1.35);

  return {
    isValid: !unstable,
    baselineBeta,
    baselineGamma,
    tiltNoise,
    accelerationNoise,
    thresholdScale,
    sampleCount: finiteSamples.length,
    message: unstable
      ? '校准期间移动幅度过大，请把手机固定好并保持自然姿态后重试。'
      : `校准完成，已根据当前传感器噪声调整阈值（×${thresholdScale.toFixed(2)}）。`,
  };
};

export const assessBarbiePosture = (
  mode: BarbiePostureMode,
  sample: BarbiePostureSample,
  sensitivity: BarbiePostureSensitivity = 'balanced',
  calibrationScale = 1,
): BarbiePostureAssessment => {
  const multiplier = SENSITIVITY_MULTIPLIER[sensitivity]
    * clamp(Number.isFinite(calibrationScale) ? calibrationScale : 1, 1, 1.35);
  const tilt = finiteMagnitude(sample.deltaBeta, sample.deltaGamma);
  const acceleration = Number.isFinite(sample.linearAcceleration)
    ? Math.max(0, sample.linearAcceleration)
    : 0;

  if (mode === 'heels') {
    const threshold = 5.5 * multiplier;
    return {
      isViolation: acceleration > threshold,
      metric: acceleration,
      threshold,
      label: '落脚冲击',
      correction: '缩小步幅，让脚掌更轻柔地过渡。',
      detail: `瞬时冲击 ${acceleration.toFixed(1)}`,
      secondaryMetric: tilt,
      secondaryLabel: '躯干偏移',
    };
  }
  if (mode === 'tray') {
    const threshold = 5 * multiplier;
    const useFrontBack = Math.abs(sample.deltaBeta) >= Math.abs(sample.deltaGamma);
    const signedTilt = useFrontBack ? sample.deltaBeta : sample.deltaGamma;
    return {
      isViolation: tilt > threshold,
      metric: tilt,
      threshold,
      label: useFrontBack ? '前后倾角' : '左右倾角',
      correction: `${useFrontBack ? '前后' : '左右'}方向偏离基准，放松手腕并缓慢向中心回正。`,
      detail: `${useFrontBack ? '前后' : '左右'}偏移 ${signedTilt >= 0 ? '+' : ''}${signedTilt.toFixed(1)}°`,
      secondaryMetric: useFrontBack ? Math.abs(sample.deltaGamma) : Math.abs(sample.deltaBeta),
      secondaryLabel: useFrontBack ? '左右倾角' : '前后倾角',
    };
  }
  if (mode === 'shoulders') {
    const threshold = 9 * multiplier;
    const useFrontBack = Math.abs(sample.deltaBeta) >= Math.abs(sample.deltaGamma);
    const signedTilt = useFrontBack ? sample.deltaBeta : sample.deltaGamma;
    return {
      isViolation: tilt > threshold,
      metric: tilt,
      threshold,
      label: useFrontBack ? '肩背前后偏移' : '肩背侧向偏移',
      correction: `${useFrontBack ? '前后' : '侧向'}偏移较大，自然呼吸并缓慢回到校准位置。`,
      detail: `${useFrontBack ? '前后' : '侧向'}偏移 ${signedTilt >= 0 ? '+' : ''}${signedTilt.toFixed(1)}°`,
      secondaryMetric: acceleration,
      secondaryLabel: '动作幅度',
    };
  }

  const tiltThreshold = 2.2 * multiplier;
  const accelerationThreshold = 1.8 * multiplier;
  const tiltRatio = tilt / tiltThreshold;
  const accelerationRatio = acceleration / accelerationThreshold;
  const useAcceleration = accelerationRatio > tiltRatio;
  return {
    isViolation: tiltRatio > 1 || accelerationRatio > 1,
    metric: useAcceleration ? acceleration : tilt,
    threshold: useAcceleration ? accelerationThreshold : tiltThreshold,
    label: useAcceleration ? '移动幅度' : '姿态偏移',
    correction: '不要憋气，在舒适呼吸中缓慢恢复稳定。',
    detail: `倾斜 ${tilt.toFixed(1)}° · 移动 ${acceleration.toFixed(1)}`,
    secondaryMetric: useAcceleration ? tilt : acceleration,
    secondaryLabel: useAcceleration ? '姿态偏移' : '移动幅度',
  };
};

export const calculateBarbieStepCadence = (timestamps: number[], now = Date.now()): number => {
  const recent = timestamps
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now && timestamp >= now - 30_000)
    .sort((a, b) => a - b);
  if (recent.length < 2) return 0;
  const elapsed = recent[recent.length - 1] - recent[0];
  if (elapsed <= 0) return 0;
  return Math.max(0, Math.min(240, Math.round(((recent.length - 1) * 60_000) / elapsed)));
};

export const calculateBarbieStepConsistency = (peaks: number[]): number => {
  const recent = peaks.filter((peak) => Number.isFinite(peak) && peak >= 0).slice(-12);
  if (recent.length < 3) return 0;
  const mean = recent.reduce((sum, peak) => sum + peak, 0) / recent.length;
  if (mean <= 0) return 0;
  const variance = recent.reduce((sum, peak) => sum + (peak - mean) ** 2, 0) / recent.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  return Math.round(clamp(100 - coefficientOfVariation * 180, 0, 100));
};

export const calculateBarbiePostureScore = (
  violationCount: number,
  activeSeconds: number,
  stableSeconds: number,
): number => {
  const boundedActive = Math.max(1, Number.isFinite(activeSeconds) ? activeSeconds : 1);
  const boundedStable = Math.max(0, Math.min(boundedActive, Number.isFinite(stableSeconds) ? stableSeconds : 0));
  const stabilityScore = (boundedStable / boundedActive) * 100;
  const penalty = Math.max(0, Number.isFinite(violationCount) ? Math.floor(violationCount) : 0) * 4;
  return Math.max(0, Math.min(100, Math.round(stabilityScore - penalty)));
};
