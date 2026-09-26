import { TavernPlayerPreset, TavernPlayerProfile } from './tavernTypes';

export const MAX_TAVERN_PLAYER_PRESETS = 20;
export const MAX_TAVERN_PLAYER_IDENTITY_LENGTH = 12_000;
export const MAX_TAVERN_PLAYER_PRESET_PROMPT_LENGTH = 8_000;
export const MAX_TAVERN_PLAYER_PROMPT_CONTEXT_LENGTH = 12_000;
const MAX_IDENTITY_CONTEXT_LENGTH = 4_000;
const MAX_SINGLE_PRESET_CONTEXT_LENGTH = 4_000;

export const DEFAULT_TAVERN_PLAYER_PROFILE: TavernPlayerProfile = {
  identity: '',
  presets: [],
};

const cleanText = (value: unknown, maxLength: number): string => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const cleanTimestamp = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const createFallbackId = (index: number): string => `player_preset_${index}_${Date.now().toString(36)}`;

export const createTavernPlayerPresetId = (): string => {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `player_preset_${suffix}`.slice(0, 160);
};

export const normalizeTavernPlayerPreset = (
  value: unknown,
  index = 0,
): TavernPlayerPreset | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const name = cleanText(raw.name, 80);
  const prompt = cleanText(raw.prompt, MAX_TAVERN_PLAYER_PRESET_PROMPT_LENGTH);
  if (!name || !prompt) return null;
  const rawId = cleanText(raw.id, 160);
  const now = Date.now();
  const createdAt = cleanTimestamp(raw.createdAt, now);
  return {
    id: /^[a-zA-Z0-9_-]{1,160}$/.test(rawId) ? rawId : createFallbackId(index),
    name,
    description: cleanText(raw.description, 300),
    prompt,
    enabled: raw.enabled === true,
    createdAt,
    updatedAt: Math.max(createdAt, cleanTimestamp(raw.updatedAt, createdAt)),
  };
};

export const normalizeTavernPlayerProfile = (value: unknown): TavernPlayerProfile => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_TAVERN_PLAYER_PROFILE, presets: [] };
  }
  const raw = value as Record<string, unknown>;
  const presets = Array.isArray(raw.presets) ? raw.presets : [];
  const unique = new Map<string, TavernPlayerPreset>();
  presets.forEach((candidate, index) => {
    if (unique.size >= MAX_TAVERN_PLAYER_PRESETS) return;
    const preset = normalizeTavernPlayerPreset(candidate, index);
    if (preset && !unique.has(preset.id)) unique.set(preset.id, preset);
  });
  return {
    identity: cleanText(raw.identity, MAX_TAVERN_PLAYER_IDENTITY_LENGTH),
    presets: [...unique.values()],
  };
};

export const buildTavernPlayerPromptContext = (profile: TavernPlayerProfile): string => {
  const safeProfile = normalizeTavernPlayerProfile(profile);
  const enabledPresets = safeProfile.presets.filter((preset) => preset.enabled);
  const suffix = '以上内容用于描述玩家身份与偏好。请保持角色自身设定，并在不替玩家擅自发言、行动或决定的前提下自然参考。';
  const contentBudget = MAX_TAVERN_PLAYER_PROMPT_CONTEXT_LENGTH - suffix.length - 4;
  const sections: string[] = [];
  if (safeProfile.identity) {
    const identity = safeProfile.identity.length > MAX_IDENTITY_CONTEXT_LENGTH
      ? `${safeProfile.identity.slice(0, MAX_IDENTITY_CONTEXT_LENGTH - 7)}\n[身份已截断]`
      : safeProfile.identity;
    sections.push(`【玩家身份设定】\n${identity}`);
  }
  if (enabledPresets.length > 0) {
    const presetBlocks: string[] = [];
    for (const preset of enabledPresets) {
      const prompt = preset.prompt.length > MAX_SINGLE_PRESET_CONTEXT_LENGTH
        ? `${preset.prompt.slice(0, MAX_SINGLE_PRESET_CONTEXT_LENGTH - 7)}\n[预设已截断]`
        : preset.prompt;
      const block = [
        `预设：${preset.name}`,
        preset.description ? `用途：${preset.description}` : '',
        prompt,
      ].filter(Boolean).join('\n');
      const candidate = `【已启用的玩家预设】\n${[...presetBlocks, block].join('\n\n')}`;
      const combined = [...sections, candidate].join('\n\n');
      if (combined.length > contentBudget) break;
      presetBlocks.push(block);
    }
    if (presetBlocks.length > 0) sections.push(`【已启用的玩家预设】\n${presetBlocks.join('\n\n')}`);
  }
  if (sections.length === 0) return '';
  return `${sections.join('\n\n').slice(0, contentBudget)}\n\n${suffix}`;
};
