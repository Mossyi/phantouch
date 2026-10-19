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

/**
 * 「随机 EMS 请求」的可用上限：取**已启用的最强通道**，而不是两路上限的最小值。
 *
 * 只贴一路电极片的用户会把另一路上限设为 0。若按最小值取，随机强度会恒为 0，
 * 所有"随机电击"玩法（重塑的芭比实验室 / 神经刻印 / 全视之眼 / 场景导演、
 * 悬浮窗步进等）都会静默失效且不给任何提示。
 *
 * 这里放宽的只是"随机请求的取值范围"；**每个通道自己的上限仍由
 * `clampOutputToLimit` 在执行时夹取**，所以上限为 0 的通道永远不会输出。
 */
export const resolveEnabledEmsCeiling = (
  limitA: unknown,
  limitB: unknown,
  hardwareMaximum: number,
): number => Math.max(
  normalizeSafetyLimit(limitA, 0, hardwareMaximum),
  normalizeSafetyLimit(limitB, 0, hardwareMaximum),
);

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
