import type { HypnosisTrack } from './hypnosisData';
import { readPreference, writePreference } from '../ui/localPreferences';

export const ASMR_SCRIPTS_KEY = 'ycy_asmr_scripts';
export interface SavedAsmrScript extends HypnosisTrack { category: string; updatedAt: number }
export function normalizeSavedScripts(value: unknown): SavedAsmrScript[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap(raw => {
    if (!raw || typeof raw.id !== 'string' || !/^ai-[a-zA-Z0-9_-]{1,100}$/.test(raw.id) || ids.has(raw.id) || typeof raw.title !== 'string' || !Array.isArray(raw.whisperLines)) return [];
    const lines = raw.whisperLines.filter((v: unknown) => typeof v === 'string' && v.trim()).slice(0, 30).map((v: string) => v.slice(0, 500));
    if (!lines.length) return [];
    ids.add(raw.id);
    return [{ id: raw.id, title: raw.title.trim().slice(0, 100) || '未命名剧本', description: typeof raw.description === 'string' ? raw.description.slice(0, 500) : '', category: typeof raw.category === 'string' ? raw.category.trim().slice(0, 30) || '未分类' : '未分类', updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0, whisperLines: lines, durationMinutes: Math.min(60, Math.max(1, Number(raw.durationMinutes) || 5)), ambientSound: ['rain', 'fireplace', 'sea_binaural', 'zen_wind'].includes(raw.ambientSound) ? raw.ambientSound : 'rain', mentorPersonaId: 'preset-2', hardwarePreset: { wave: 'breathe', strength: 0, motorRate: 0 } } as SavedAsmrScript];
  }).slice(0, 100);
}
export const loadSavedScripts = () => normalizeSavedScripts(readPreference(ASMR_SCRIPTS_KEY, []));
export function saveAsmrScript(track: HypnosisTrack & { category?: string }): SavedAsmrScript[] {
  const current = loadSavedScripts();
  if (!current.some(item => item.id === track.id) && current.length >= 100) throw new Error('最多保存 100 个剧本，请先导出或删除不需要的内容。');
  const next = normalizeSavedScripts([{ ...track, updatedAt: Date.now() }, ...current.filter(item => item.id !== track.id)]);
  if (!next.some(item => item.id === track.id)) throw new Error('剧本标题或正文无效');
  if (!writePreference(ASMR_SCRIPTS_KEY, next)) throw new Error('剧本保存失败，请检查本地剩余空间');
  return next;
}
export function removeSavedScript(id: string) {
  const next = loadSavedScripts().filter(item => item.id !== id);
  if (!writePreference(ASMR_SCRIPTS_KEY, next)) throw new Error('删除保存失败');
  return next;
}
