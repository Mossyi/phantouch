export const readPreference = <T>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
};

export const writePreference = (key: string, value: unknown): boolean => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};

export const draftKey = (cardId: string) => `ycy_tavern_draft_${cardId}`;
export const loadDraft = (cardId: string): string => {
  const value = readPreference<unknown>(draftKey(cardId), '');
  return typeof value === 'string' ? value.slice(0, 50000) : '';
};
