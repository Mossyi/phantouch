export interface YoloVisionResult {
  pose: string;
  confidence: number;
  rawPose?: string;
  rawConfidence?: number;
  stabilityFrames?: number;
  requiredFrames?: number;
  fidget: number;
  nose_y: number;
  shoulder_y: number;
}

export const createYoloVideoSubscriptionMessage = (enabled: boolean): string => (
  JSON.stringify({ type: 'video', enabled })
);

const YOLO_POSES = new Set([
  'unknown',
  // 经典服从姿态 (保留)
  'dog', 'kneel', 'kowtow', 'hands_up', 'surrender', 'fetal', 'spread_eagle',
  // 日式规矩与绝对服从
  'seiza', 'bound_kowtow',
  // 羞耻感与身体展示
  'kneel_ears', 'm_kneel', 'jackknife', 'camel_arch',
  'chest_out_kneel', 'butterfly_supine', 'reverse_tabletop',
  'compact_huddle', 'ankle_grasp_kneel',
]);

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const parseYoloWebSocketUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const privateHost = host === 'localhost'
      || host.endsWith('.localhost')
      || host.endsWith('.local')
      || /^10\./.test(host)
      || /^127\./.test(host)
      || /^169\.254\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      || /^\[(?:::1|f[cd][0-9a-f:]*|fe[89ab][0-9a-f:]*)\]$/.test(host);
    if (
      (parsed.protocol !== 'wss:' && !(parsed.protocol === 'ws:' && privateHost))
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
};

export const parseYoloVisionMessage = (value: unknown): YoloVisionResult | null => {
  if (typeof value !== 'string' || value.length > 100_000) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof parsed.pose !== 'string' || !YOLO_POSES.has(parsed.pose)) return null;
    const confidence = toFiniteNumber(parsed.confidence);
    if (confidence === null || confidence < 0 || confidence > 1) return null;
    const finiteOr = (candidate: unknown, fallback: number) => {
      const numeric = toFiniteNumber(candidate);
      return numeric === null ? fallback : numeric;
    };
    const result: YoloVisionResult = {
      pose: parsed.pose,
      confidence,
      fidget: Math.max(0, Math.min(1_000_000, finiteOr(parsed.fidget, 0))),
      nose_y: finiteOr(parsed.nose_y, -1),
      shoulder_y: finiteOr(parsed.shoulder_y, -1),
    };
    const rawConfidence = toFiniteNumber(parsed.raw_confidence);
    if (typeof parsed.raw_pose === 'string' && YOLO_POSES.has(parsed.raw_pose)) {
      result.rawPose = parsed.raw_pose;
      result.rawConfidence = rawConfidence === null ? 0 : Math.max(0, Math.min(1, rawConfidence));
    }
    const stabilityFrames = toFiniteNumber(parsed.stability_frames);
    const requiredFrames = toFiniteNumber(parsed.required_frames);
    if (stabilityFrames !== null && requiredFrames !== null) {
      result.requiredFrames = Math.max(1, Math.min(30, Math.round(requiredFrames)));
      result.stabilityFrames = Math.max(0, Math.min(result.requiredFrames, Math.round(stabilityFrames)));
    }
    return result;
  } catch {
    return null;
  }
};
