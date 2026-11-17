export const PENALTY_PARAMETER_KEYS = ['frequency_penalty', 'presence_penalty'] as const;
export type PenaltyParameterKey = typeof PENALTY_PARAMETER_KEYS[number];

const KEY_PATTERNS: Record<PenaltyParameterKey, RegExp> = {
  frequency_penalty: /frequency[\s_-]?penalty/i,
  presence_penalty: /presence[\s_-]?penalty/i,
};

const REJECTION = /not enabled|not support|unsupported|unsupport|not allowed|unknown parameter|unrecognized|invalid parameter|unexpected parameter|disabled|不支持|未启用|未开启|不接受|无效参数|无法使用|不识别/i;

const UNRELATED = /quota|billing|rate[\s_-]?limit|too many requests|api[\s_-]?key|unauthorized|forbidden|insufficient|content[\s_-]?filter|moderation|余额|额度|鉴权|认证/i;

const clampPenalty = (value: number) => Math.min(2, Math.max(-2, value));

/** 只有调用方明确给出的非零惩罚才放进请求。0 和不传都省略。 */
export const samplingPenaltyFields = (value: { frequencyPenalty?: number; presencePenalty?: number } | null | undefined): Partial<Record<PenaltyParameterKey, number>> => {
  const fields: Partial<Record<PenaltyParameterKey, number>> = {};
  const frequency = Number(value?.frequencyPenalty);
  const presence = Number(value?.presencePenalty);
  if (value != null && Object.prototype.hasOwnProperty.call(value, 'frequencyPenalty') && Number.isFinite(frequency) && frequency !== 0) {
    fields.frequency_penalty = clampPenalty(frequency);
  }
  if (value != null && Object.prototype.hasOwnProperty.call(value, 'presencePenalty') && Number.isFinite(presence) && presence !== 0) {
    fields.presence_penalty = clampPenalty(presence);
  }
  return fields;
};

const errorPieces = (body: string): { message: string; param: string } => {
  const raw = body.slice(0, 4_000);
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    const error = record && 'error' in record ? record.error : parsed;
    if (typeof error === 'string') return { message: error, param: '' };
    if (error && typeof error === 'object') {
      const item = error as Record<string, unknown>;
      const texts = [item.message, item.msg, item.detail, item.error]
        .filter((part): part is string => typeof part === 'string');
      return {
        message: texts.join('\n') || raw,
        param: typeof item.param === 'string' ? item.param : '',
      };
    }
  } catch {
    // 纯文本错误体。
  }
  return { message: raw, param: '' };
};

/** 只在 400/422 且错误明确指向 penalty 参数时返回要去掉的字段。 */
export const unsupportedPenaltyParameters = (status: number, body: string): PenaltyParameterKey[] => {
  if (status !== 400 && status !== 422) return [];
  const { message, param } = errorPieces(body);
  const blob = `${param}\n${message}`;
  if (UNRELATED.test(blob) && !KEY_PATTERNS.frequency_penalty.test(param) && !KEY_PATTERNS.presence_penalty.test(param)) {
    return [];
  }
  const named = PENALTY_PARAMETER_KEYS.filter((key) => KEY_PATTERNS[key].test(blob));
  const paramNames = PENALTY_PARAMETER_KEYS.filter((key) => KEY_PATTERNS[key].test(param));
  if (param.trim() && paramNames.length === 0) return [];
  if (!REJECTION.test(blob)) return [];
  if (paramNames.length > 0) return paramNames;
  if (named.length > 0) return named;
  if (/\bpenalt(?:y|ies)\b\s+(?:is|are)\s+not\s+(?:enabled|supported|allowed)/i.test(blob)
    || /\bpenalt(?:y|ies)\b\s+(?:not\s+enabled|not\s+supported|unsupported|disabled|not\s+allowed)/i.test(blob)
    || /(?:not enabled|not supported|unsupported|does not support|不支持|未启用|未开启).{0,20}(?:\bpenalt(?:y|ies)\b|惩罚参数)/i.test(blob)
    || /惩罚参数(?:不支持|未启用|无效|无法使用)/.test(blob)) {
    return [...PENALTY_PARAMETER_KEYS];
  }
  return [];
};

/** 已经输出过正文，或错误不是明确的 penalty 拒绝时，不重试。 */
export const penaltyKeysToDrop = (
  status: number,
  body: string,
  sent: readonly string[],
  emitted: boolean,
): PenaltyParameterKey[] => {
  if (emitted) return [];
  const sentKeys = new Set(sent);
  return unsupportedPenaltyParameters(status, body).filter((key) => sentKeys.has(key));
};
