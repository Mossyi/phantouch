export type TavernGenerationPresetId = 'creative' | 'balanced' | 'precise' | 'longform' | 'custom';
export type TavernPromptSectionId = 'player' | 'memory' | 'style' | 'worldbook' | 'diary';

export interface TavernGenerationConfig {
  presetId: TavernGenerationPresetId;
  temperature: number;
  topP: number;
  maxTokens: number;
  historyMessages: number;
  contextWindowTokens: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  promptOrder: TavernPromptSectionId[];
  enabledPromptSections: TavernPromptSectionId[];
}

export const TAVERN_PROMPT_SECTION_LABELS: Record<TavernPromptSectionId, string> = {
  player: '玩家身份与预设',
  memory: '长期记忆',
  style: '风格增强',
  worldbook: '角色世界书',
  diary: '共享日记',
};

export const TAVERN_PROMPT_SECTION_IDS = Object.keys(TAVERN_PROMPT_SECTION_LABELS) as TavernPromptSectionId[];

export const TAVERN_GENERATION_PRESETS: Record<Exclude<TavernGenerationPresetId, 'custom'>, Omit<TavernGenerationConfig, 'presetId' | 'promptOrder' | 'enabledPromptSections'>> = {
  creative: { temperature: 1.1, topP: 0.96, maxTokens: 3_600, historyMessages: 300, contextWindowTokens: 65_536, frequencyPenalty: 0.4, presencePenalty: 0.3 },
  balanced: { temperature: 0.8, topP: 0.9, maxTokens: 3_000, historyMessages: 300, contextWindowTokens: 65_536, frequencyPenalty: 0.35, presencePenalty: 0.25 },
  precise: { temperature: 0.45, topP: 0.78, maxTokens: 2_048, historyMessages: 200, contextWindowTokens: 32_768, frequencyPenalty: 0.3, presencePenalty: 0.2 },
  longform: { temperature: 0.9, topP: 0.94, maxTokens: 4_096, historyMessages: 300, contextWindowTokens: 65_536, frequencyPenalty: 0.35, presencePenalty: 0.25 },
};

export const DEFAULT_TAVERN_GENERATION_CONFIG: TavernGenerationConfig = {
  presetId: 'balanced',
  ...TAVERN_GENERATION_PRESETS.balanced,
  promptOrder: [...TAVERN_PROMPT_SECTION_IDS],
  enabledPromptSections: [...TAVERN_PROMPT_SECTION_IDS],
};

const finiteNumber = (value: unknown, fallback: number, min: number, max: number, decimals = 2): number => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const bounded = Math.min(max, Math.max(min, parsed));
  const scale = 10 ** decimals;
  return Math.round(bounded * scale) / scale;
};

const normalizeSections = (value: unknown, includeMissing: boolean): TavernPromptSectionId[] => {
  const valid = Array.isArray(value)
    ? value.filter((item): item is TavernPromptSectionId => TAVERN_PROMPT_SECTION_IDS.includes(item as TavernPromptSectionId))
    : [];
  const unique = [...new Set(valid)];
  return includeMissing
    ? [...unique, ...TAVERN_PROMPT_SECTION_IDS.filter((id) => !unique.includes(id))]
    : unique;
};

export const normalizeTavernGenerationConfig = (value: unknown): TavernGenerationConfig => {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const presetId: TavernGenerationPresetId = ['creative', 'balanced', 'precise', 'longform', 'custom'].includes(String(raw.presetId))
    ? raw.presetId as TavernGenerationPresetId
    : DEFAULT_TAVERN_GENERATION_CONFIG.presetId;
  const isLegacyMessageWindow = raw.contextWindowTokens === undefined;
  // 旧版本 balanced(1200) 和 precise(900) 在思维链大模型下容易截断，非自定义配置时自动升级至当前预设推荐预算
  const isLegacyLowPresetMaxTokens = (raw.maxTokens === 1_200 || raw.maxTokens === 900) && presetId !== 'custom';
  const effectiveMaxTokens = isLegacyLowPresetMaxTokens
    ? (TAVERN_GENERATION_PRESETS[presetId as Exclude<TavernGenerationPresetId, 'custom'>]?.maxTokens ?? DEFAULT_TAVERN_GENERATION_CONFIG.maxTokens)
    : raw.maxTokens;
  return {
    presetId,
    temperature: finiteNumber(raw.temperature, DEFAULT_TAVERN_GENERATION_CONFIG.temperature, 0, 2),
    topP: finiteNumber(raw.topP, DEFAULT_TAVERN_GENERATION_CONFIG.topP, 0.05, 1),
    maxTokens: finiteNumber(effectiveMaxTokens, DEFAULT_TAVERN_GENERATION_CONFIG.maxTokens, 128, 8_192, 0),
    historyMessages: isLegacyMessageWindow
      ? 200
      : finiteNumber(raw.historyMessages, DEFAULT_TAVERN_GENERATION_CONFIG.historyMessages, 20, 2_000, 0),
    contextWindowTokens: finiteNumber(raw.contextWindowTokens, DEFAULT_TAVERN_GENERATION_CONFIG.contextWindowTokens, 4_096, 1_048_576, 0),
    frequencyPenalty: finiteNumber(raw.frequencyPenalty, DEFAULT_TAVERN_GENERATION_CONFIG.frequencyPenalty ?? 0.35, 0, 2),
    presencePenalty: finiteNumber(raw.presencePenalty, DEFAULT_TAVERN_GENERATION_CONFIG.presencePenalty ?? 0.25, 0, 2),
    promptOrder: normalizeSections(raw.promptOrder, true),
    enabledPromptSections: raw.enabledPromptSections === undefined
      ? [...TAVERN_PROMPT_SECTION_IDS]
      : normalizeSections(raw.enabledPromptSections, false),
  };
};

export const applyTavernGenerationPreset = (
  value: unknown,
  presetId: Exclude<TavernGenerationPresetId, 'custom'>,
): TavernGenerationConfig => normalizeTavernGenerationConfig({
  ...normalizeTavernGenerationConfig(value),
  ...TAVERN_GENERATION_PRESETS[presetId],
  presetId,
});

export const isTavernPromptSectionEnabled = (value: unknown, section: TavernPromptSectionId): boolean => (
  normalizeTavernGenerationConfig(value).enabledPromptSections.includes(section)
);

export const assembleTavernPromptSections = (
  basePrompt: string,
  sections: Partial<Record<TavernPromptSectionId, string>>,
  value: unknown,
): string => {
  const config = normalizeTavernGenerationConfig(value);
  const enabled = new Set(config.enabledPromptSections);
  return [
    basePrompt.trim(),
    ...config.promptOrder
      .filter((section) => enabled.has(section))
      .map((section) => String(sections[section] || '').trim())
      .filter(Boolean),
  ].filter(Boolean).join('\n\n').slice(0, 80_000);
};
