const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeFiniteRange = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const safeMinimum = toFiniteNumber(minimum) ?? 0;
  const safeMaximum = Math.max(safeMinimum, toFiniteNumber(maximum) ?? safeMinimum);
  const safeFallback = toFiniteNumber(fallback) ?? safeMinimum;
  const parsed = toFiniteNumber(value) ?? safeFallback;
  return Math.min(safeMaximum, Math.max(safeMinimum, parsed));
};

export const normalizeSafetyLimit = (
  value: unknown,
  fallback: number,
  maximum: number,
): number => {
  return normalizeFiniteRange(value, fallback, 0, maximum);
};

export const clampOutputToLimit = (
  requested: number,
  configuredLimit: unknown,
  maximum: number,
): number => {
  const limit = normalizeSafetyLimit(configuredLimit, 0, maximum);
  return Math.min(limit, Math.max(0, requested));
};

export const randomIntegerWithinLimits = (
  configuredMinimum: unknown,
  configuredMaximum: unknown,
  hardwareMaximum: number,
  random: () => number = Math.random,
): number => {
  const maximum = Math.floor(normalizeSafetyLimit(configuredMaximum, 0, hardwareMaximum));
  if (maximum <= 0) return 0;

  const minimum = Math.ceil(normalizeSafetyLimit(configuredMinimum, 0, maximum));
  const sample = normalizeFiniteRange(random(), 0, 0, 1);
  return Math.min(maximum, minimum + Math.floor(sample * (maximum - minimum + 1)));
};
