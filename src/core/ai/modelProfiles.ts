import { parseApiBaseUrl, isVolcengineArkLegacyApiBaseUrl, VOLCENGINE_ARK_PLAN_BASE_URL } from '../apiBaseUrl';
import { readPreference, writePreference } from '../ui/localPreferences';
import type { CapabilityResult } from './modelCapabilities';
export const MODEL_PROFILES_KEY = 'ycy_model_profiles';
export interface ModelProfile { id: string; name: string; baseUrl: string; model: string; apiKey: string; rememberApiKey: boolean; updatedAt: number }
export function loadModelProfiles(): ModelProfile[] {
  const value = readPreference<unknown>(MODEL_PROFILES_KEY, []);
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(v => {
    const base = parseApiBaseUrl(v?.baseUrl);
    if (!base || typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v.id) || seen.has(v.id) || typeof v.name !== 'string' || typeof v.model !== 'string' || !v.model.trim()) return [];
    seen.add(v.id);
    const migrated = isVolcengineArkLegacyApiBaseUrl(base);
    return [{ id: v.id, name: v.name.slice(0, 50), baseUrl: migrated ? VOLCENGINE_ARK_PLAN_BASE_URL : base, model: v.model.trim().slice(0, 200), apiKey: v.rememberApiKey === true && typeof v.apiKey === 'string' && !migrated ? v.apiKey.slice(0, 1000) : '', rememberApiKey: v.rememberApiKey === true && !migrated, updatedAt: Number(v.updatedAt) || 0 }];
  }).slice(0, 20);
}
export function saveModelProfile(input: ModelProfile) {
  const base = parseApiBaseUrl(input.baseUrl);
  if (!base || !input.name.trim() || !input.model.trim()) throw new Error('请填写方案名称、有效地址和模型名');
  if (isVolcengineArkLegacyApiBaseUrl(base)) throw new Error('请先将火山地址切换到 Plan，不能保存旧版计费地址');
  const current = loadModelProfiles();
  if (!current.some(p => p.id === input.id) && current.length >= 20) throw new Error('最多保存 20 套方案');
  const profile = { ...input, name: input.name.trim().slice(0, 50), baseUrl: base, model: input.model.trim().slice(0, 200), apiKey: input.rememberApiKey ? input.apiKey.trim().slice(0, 1000) : '', updatedAt: Date.now() };
  const next = [profile, ...current.filter(p => p.id !== input.id)];
  if (!writePreference(MODEL_PROFILES_KEY, next)) throw new Error('方案保存失败');
  return next;
}
export function deleteModelProfile(id: string) { const next = loadModelProfiles().filter(p => p.id !== id); if (!writePreference(MODEL_PROFILES_KEY, next)) throw new Error('删除失败'); return next; }

const REPORT_KEY = 'ycy_model_capability_reports';
export async function modelFingerprint(config: { baseUrl: string; model: string; apiKey: string }) {
  const bytes = new TextEncoder().encode(JSON.stringify([parseApiBaseUrl(config.baseUrl), config.model.trim(), config.apiKey.trim()]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function loadCapabilityReport(fingerprint: string): CapabilityResult[] {
  const saved = readPreference<any>(REPORT_KEY, {});
  const records = saved && typeof saved === 'object' ? saved[fingerprint] : null;
  if (!Array.isArray(records)) return [];
  return records.filter(r => r && ['text', 'stream', 'conversation', 'tools'].includes(r.capability) && ['passed', 'failed', 'unverified', 'cancelled'].includes(r.status) && typeof r.message === 'string' && Number.isFinite(r.elapsedMs) && Number.isFinite(r.checkedAt)).slice(0, 4).map(r => ({ ...r, message: r.message.slice(0, 500) }));
}
export function saveCapabilityReport(fingerprint: string, results: CapabilityResult[]) {
  const value = readPreference<any>(REPORT_KEY, {});
  const entries = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value).filter(([key]) => /^[a-f0-9]{64}$/.test(key) && key !== fingerprint).slice(-19) : [];
  return writePreference(REPORT_KEY, { ...Object.fromEntries(entries), [fingerprint]: results });
}
