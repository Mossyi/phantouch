export const TAVERN_TEXT_RULE_STORAGE_KEY = 'ycy_tavern_text_rules';
export const MAX_TAVERN_TEXT_RULES = 30;
export const MAX_TAVERN_TEXT_RULE_INPUT = 50_000;
export const MAX_TAVERN_TEXT_RULE_PATTERN = 200;
export const MAX_TAVERN_TEXT_RULE_REPLACEMENT = 2_000;

export type TavernTextRuleTarget = 'user_prompt' | 'assistant_output' | 'tts';
export type TavernTextRuleMode = 'literal' | 'regex';

export interface TavernTextRule {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  mode: TavernTextRuleMode;
  targets: TavernTextRuleTarget[];
  enabled: boolean;
  ignoreCase: boolean;
  priority: number;
}

export interface TavernTextRuleResult {
  text: string;
  appliedRuleIds: string[];
  errors: Array<{ ruleId: string; message: string }>;
  truncated: boolean;
}

const TARGETS: TavernTextRuleTarget[] = ['user_prompt', 'assistant_output', 'tts'];

const cleanText = (value: unknown, maximum: number): string => (
  typeof value === 'string' ? value.trim().slice(0, maximum) : ''
);

const safeId = (value: unknown, fallback: string): string => {
  const id = cleanText(value, 160);
  return /^[a-zA-Z0-9_-]{1,160}$/.test(id) ? id : fallback;
};

const clampPriority = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.round(parsed))) : 5;
};

const createId = (): string => {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `text_rule_${suffix}`.slice(0, 160);
};

export const createTavernTextRule = (): TavernTextRule => ({
  id: createId(),
  name: '新文本规则',
  pattern: '',
  replacement: '',
  mode: 'literal',
  targets: ['assistant_output'],
  enabled: true,
  ignoreCase: false,
  priority: 5,
});

export const validateTavernRegexPattern = (patternValue: unknown): string | null => {
  const pattern = typeof patternValue === 'string' ? patternValue : '';
  if (!pattern) return '查找内容不能为空';
  if (pattern.length > MAX_TAVERN_TEXT_RULE_PATTERN) return `正则不能超过 ${MAX_TAVERN_TEXT_RULE_PATTERN} 个字符`;
  if (/(?:^|[^\\]|(?:^|[^\\])(?:\\\\)+)[+*]/.test(pattern)) return '为避免卡顿，正则不允许使用无界 * 或 +，请改用 {1,n}';
  if (/\{\d+,\}/.test(pattern)) return '为避免卡顿，正则重复次数必须有上限';
  for (const match of pattern.matchAll(/\{(\d+)(?:,(\d+))?\}/g)) {
    const upperBound = Number(match[2] ?? match[1]);
    if (upperBound > 100) return '为避免卡顿，单次正则重复上限不能超过 100';
  }
  if (/\((?:[^()\\]|\\.)*(?:\||\{\d+(?:,\d+)?\})(?:[^()\\]|\\.)*\)\s*\{\d+(?:,\d+)?\}/.test(pattern)) {
    return '为避免指数级回溯，不支持对含分支或重复的分组再次重复';
  }
  if (/\(\?<([=!])/.test(pattern)) return '不支持后向断言';
  if (/(^|[^\\])\\[1-9]/.test(pattern)) return '查找表达式不支持模式反向引用';
  try {
    new RegExp(pattern, 'g');
    return null;
  } catch (error) {
    return error instanceof Error ? `正则无效：${error.message}` : '正则无效';
  }
};

export const normalizeTavernTextRule = (value: unknown, index = 0): TavernTextRule | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const pattern = cleanText(raw.pattern, MAX_TAVERN_TEXT_RULE_PATTERN);
  if (!pattern) return null;
  const targets = Array.isArray(raw.targets)
    ? [...new Set(raw.targets.filter((target): target is TavernTextRuleTarget => TARGETS.includes(target as TavernTextRuleTarget)))]
    : [];
  if (targets.length === 0) return null;
  const mode: TavernTextRuleMode = raw.mode === 'regex' ? 'regex' : 'literal';
  return {
    id: safeId(raw.id, `text_rule_${index}`),
    name: cleanText(raw.name, 100) || `文本规则 ${index + 1}`,
    pattern,
    replacement: typeof raw.replacement === 'string' ? raw.replacement.slice(0, MAX_TAVERN_TEXT_RULE_REPLACEMENT) : '',
    mode,
    targets,
    enabled: raw.enabled !== false,
    ignoreCase: raw.ignoreCase === true,
    priority: clampPriority(raw.priority),
  };
};

export const normalizeTavernTextRules = (value: unknown): TavernTextRule[] => {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).rules)
      ? (value as Record<string, unknown>).rules as unknown[]
      : [];
  const rules: TavernTextRule[] = [];
  source.forEach((candidate, index) => {
    if (rules.length >= MAX_TAVERN_TEXT_RULES) return;
    const rule = normalizeTavernTextRule(candidate, index);
    if (rule && !rules.some((item) => item.id === rule.id)) rules.push(rule);
  });
  return rules.sort((left, right) => right.priority - left.priority);
};

export const loadTavernTextRules = (): TavernTextRule[] => {
  try {
    return normalizeTavernTextRules(JSON.parse(localStorage.getItem(TAVERN_TEXT_RULE_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
};

export const saveTavernTextRules = (value: unknown): boolean => {
  try {
    localStorage.setItem(TAVERN_TEXT_RULE_STORAGE_KEY, JSON.stringify(normalizeTavernTextRules(value)));
    return true;
  } catch {
    return false;
  }
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const neutralizeHardwareMarkers = (value: string): string => (
  value.replace(/\[\[YCY_HW:/gi, '［［YCY_HW：')
);

export const applyTavernTextRules = (
  textValue: unknown,
  rulesValue: unknown,
  target: TavernTextRuleTarget,
): TavernTextRuleResult => {
  const original = typeof textValue === 'string' ? textValue : '';
  let text = original.slice(0, MAX_TAVERN_TEXT_RULE_INPUT);
  let truncated = original.length > MAX_TAVERN_TEXT_RULE_INPUT;
  const appliedRuleIds: string[] = [];
  const errors: TavernTextRuleResult['errors'] = [];
  const rules = normalizeTavernTextRules(rulesValue).filter((rule) => rule.enabled && rule.targets.includes(target));
  for (const rule of rules) {
    if (rule.mode === 'regex') {
      const error = validateTavernRegexPattern(rule.pattern);
      if (error) {
        errors.push({ ruleId: rule.id, message: error });
        continue;
      }
    }
    try {
      const matcher = new RegExp(rule.mode === 'literal' ? escapeRegex(rule.pattern) : rule.pattern, rule.ignoreCase ? 'gi' : 'g');
      const replaced = text.replace(matcher, rule.replacement);
      if (replaced.length > MAX_TAVERN_TEXT_RULE_INPUT) truncated = true;
      const next = replaced.slice(0, MAX_TAVERN_TEXT_RULE_INPUT);
      if (next !== text) appliedRuleIds.push(rule.id);
      text = next;
    } catch (error) {
      errors.push({ ruleId: rule.id, message: error instanceof Error ? error.message : '替换失败' });
    }
  }
  if (target === 'assistant_output' || target === 'tts') text = neutralizeHardwareMarkers(text);
  return {
    text,
    appliedRuleIds,
    errors,
    truncated,
  };
};
