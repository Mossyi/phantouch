export const DARK_HOLD_SAMPLE_INTERVAL_MS = 100;
export const DARK_HOLD_CALIBRATION_SAMPLES = 10;
export const DARK_HOLD_LEAK_CONFIRMATION_SAMPLES = 8;

const BRIGHT_PIXEL_LUMINANCE = 140;

export interface FrameLightStats {
  meanLuminance: number;
  percentile90Luminance: number;
  brightPixelRatio: number;
}

export interface DarkHoldThresholds {
  meanLuminanceMax: number;
  percentile90LuminanceMax: number;
  brightPixelRatioMax: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
};

export const analyzeFrameLight = (pixels: Uint8ClampedArray): FrameLightStats | null => {
  const pixelCount = Math.floor(pixels.length / 4);
  if (pixelCount === 0) return null;

  const histogram = new Uint32Array(256);
  let luminanceSum = 0;
  let brightPixels = 0;

  for (let index = 0; index < pixelCount * 4; index += 4) {
    const luminance = Math.round(
      pixels[index] * 0.2126
      + pixels[index + 1] * 0.7152
      + pixels[index + 2] * 0.0722,
    );
    histogram[luminance] += 1;
    luminanceSum += luminance;
    if (luminance >= BRIGHT_PIXEL_LUMINANCE) brightPixels += 1;
  }

  const percentileTarget = Math.ceil(pixelCount * 0.9);
  let percentile90Luminance = 0;
  let accumulatedPixels = 0;
  for (let luminance = 0; luminance < histogram.length; luminance += 1) {
    accumulatedPixels += histogram[luminance];
    if (accumulatedPixels >= percentileTarget) {
      percentile90Luminance = luminance;
      break;
    }
  }

  return {
    meanLuminance: luminanceSum / pixelCount,
    percentile90Luminance,
    brightPixelRatio: brightPixels / pixelCount,
  };
};

export const createDarkHoldThresholds = (frames: FrameLightStats[]): DarkHoldThresholds | null => {
  const validFrames = frames.filter((frame) => (
    Number.isFinite(frame.meanLuminance)
    && Number.isFinite(frame.percentile90Luminance)
    && Number.isFinite(frame.brightPixelRatio)
  ));
  if (validFrames.length === 0) return null;

  // Phone cameras raise sensor gain when covered. Calibrating from several frames
  // avoids treating that device-specific black level as light leakage.
  const baselineMean = median(validFrames.map((frame) => frame.meanLuminance));
  const baselinePercentile90 = median(validFrames.map((frame) => frame.percentile90Luminance));
  const baselineBrightRatio = median(validFrames.map((frame) => frame.brightPixelRatio));

  return {
    meanLuminanceMax: clamp(baselineMean + 28, 60, 135),
    percentile90LuminanceMax: clamp(baselinePercentile90 + 32, 90, 165),
    brightPixelRatioMax: clamp(baselineBrightRatio + 0.08, 0.08, 0.3),
  };
};

export const isDarkHoldLightLeak = (
  frame: FrameLightStats,
  thresholds: DarkHoldThresholds,
) => {
  const wholeFrameBrightened = (
    frame.meanLuminance > thresholds.meanLuminanceMax
    && frame.percentile90Luminance > thresholds.percentile90LuminanceMax
  );
  const brightAreaOpened = (
    frame.brightPixelRatio > thresholds.brightPixelRatioMax
    && frame.percentile90Luminance > thresholds.percentile90LuminanceMax - 10
  );
  return wholeFrameBrightened || brightAreaOpened;
};
