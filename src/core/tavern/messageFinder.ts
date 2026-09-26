import { readPreference, writePreference } from '../ui/localPreferences';
export interface MessageBookmark { id: string; content: string; role: string; savedAt: number }
export const bookmarkKey = (cardId: string) => `ycy_tavern_bookmarks_${cardId}`;
export function loadMessageBookmarks(cardId: string): MessageBookmark[] {
  const value = readPreference<unknown>(bookmarkKey(cardId), []);
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter(item => item && typeof item.id === 'string' && item.id.length <= 160 && typeof item.content === 'string' && !seen.has(item.id) && (seen.add(item.id), true)).slice(0, 200).map(item => ({ id: item.id, content: item.content.slice(0, 12000), role: item.role === 'user' ? 'user' : 'assistant', savedAt: Number.isFinite(item.savedAt) ? item.savedAt : 0 }));
}
export function toggleMessageBookmark(cardId: string, message: { id: string; content: string; role: string }) {
  const current = loadMessageBookmarks(cardId);
  const exists = current.some(item => item.id === message.id);
  if (!exists && current.length >= 200) throw new Error('每个角色最多收藏 200 条消息，请先整理收藏');
  const next = exists ? current.filter(item => item.id !== message.id) : [{ id: message.id, content: message.content.slice(0, 12000), role: message.role, savedAt: Date.now() }, ...current];
  if (!writePreference(bookmarkKey(cardId), next)) throw new Error('收藏保存失败，请检查本地空间');
  return next;
}
export function findMessageIds(messages: Array<{ id: string; content: string }>, query: string): string[] {
  const needle = query.trim().slice(0, 100).toLowerCase();
  return needle ? messages.filter(m => m.content.toLowerCase().includes(needle)).map(m => m.id) : [];
}
export function highlightMessage(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const needle = query.trim().slice(0, 100).toLowerCase();
  if (!needle) return [{ text, hit: false }];
  const lower = text.toLowerCase(), parts: Array<{ text: string; hit: boolean }> = [];
  let start = 0, index = lower.indexOf(needle);
  while (index >= 0 && parts.length < 400) { if (index > start) parts.push({ text: text.slice(start, index), hit: false }); parts.push({ text: text.slice(index, index + needle.length), hit: true }); start = index + needle.length; index = lower.indexOf(needle, start); }
  if (start < text.length) parts.push({ text: text.slice(start), hit: false });
  return parts;
}
