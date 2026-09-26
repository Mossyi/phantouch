import { readPreference, writePreference } from '../ui/localPreferences';
import type { BarbieSuiteState } from './barbieSuiteState';
import { getBarbieRitualDayKey } from './barbieRitual';
export const WEEKLY_PLAN_KEY = 'ycy_training_weekly_plan';
export type PlanTask = 'rest' | 'voice' | 'posture';
export interface WeeklyPlan { paused: boolean; days: Array<{ task: PlanTask; sessions: number }> }
export const normalizeWeeklyPlan = (value: unknown): WeeklyPlan => {
  const raw = value && typeof value === 'object' ? value as Partial<WeeklyPlan> : {};
  return { paused: raw.paused !== false, days: Array.from({ length: 7 }, (_, index) => { const day = Array.isArray(raw.days) ? raw.days[index] : null; return { task: day && ['rest', 'voice', 'posture'].includes(day.task) ? day.task : 'rest', sessions: Math.min(5, Math.max(1, Math.round(Number(day?.sessions) || 1))) }; }) };
};
export const loadWeeklyPlan = () => normalizeWeeklyPlan(readPreference(WEEKLY_PLAN_KEY, null));
export function saveWeeklyPlan(plan: WeeklyPlan) { const clean = normalizeWeeklyPlan(plan); if (!writePreference(WEEKLY_PLAN_KEY, clean)) throw new Error('计划保存失败，请检查本机空间'); return clean; }
export function getWeekProgress(plan: WeeklyPlan, state: Pick<BarbieSuiteState, 'voiceHistory' | 'postureHistory'>, now = new Date()) {
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return plan.days.map((day, index) => {
    const date = new Date(monday); date.setDate(date.getDate() + index);
    const key = getBarbieRitualDayKey(date), end = new Date(date); end.setDate(end.getDate() + 1);
    const records = day.task === 'voice' ? state.voiceHistory : day.task === 'posture' ? state.postureHistory : [];
    const completed = new Set(records.filter(r => r.completedAt >= date.getTime() && r.completedAt < end.getTime() && r.completedAt <= now.getTime() && r.durationSec >= 10).map(r => r.id)).size;
    return { ...day, key, completed, met: day.task !== 'rest' && completed >= day.sessions, today: key === getBarbieRitualDayKey(now) };
  });
}
