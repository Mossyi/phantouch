export interface ChatDisplayConfig {
  companionFontSize: number;
  tavernFontSize: number;
  tavernNarrativeHighlight?: boolean;
}

export const DEFAULT_CHAT_DISPLAY_CONFIG: ChatDisplayConfig = {
  companionFontSize: 12,
  tavernFontSize: 12,
  tavernNarrativeHighlight: true,
};

export const normalizeChatFontSize = (value: unknown, fallback = 12): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(12, Math.min(24, Math.round(numeric)));
};

export const normalizeChatDisplayConfig = (value: unknown): ChatDisplayConfig => {
  const config = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<ChatDisplayConfig>
    : {};
  const result: ChatDisplayConfig = {
    companionFontSize: normalizeChatFontSize(
      config.companionFontSize,
      DEFAULT_CHAT_DISPLAY_CONFIG.companionFontSize,
    ),
    tavernFontSize: normalizeChatFontSize(
      config.tavernFontSize,
      DEFAULT_CHAT_DISPLAY_CONFIG.tavernFontSize,
    ),
  };
  if (config.tavernNarrativeHighlight !== undefined) {
    result.tavernNarrativeHighlight = Boolean(config.tavernNarrativeHighlight);
  }
  return result;
};
