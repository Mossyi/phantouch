import type { ToolActionLog } from '../../types';

const normalizeArgs = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 20_000) return {};
    const parsed = JSON.parse(serialized);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const normalizeToolActionLogs = (value: unknown): ToolActionLog[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const logs: ToolActionLog[] = [];
  const usedIds = new Set<string>();

  for (const [index, item] of value.slice(0, 50).entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.toolName !== 'string' || !raw.toolName.trim()) continue;
    let id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 160) : '';
    if (!id || usedIds.has(id)) id = `tool-log-recovered-${index}`;
    usedIds.add(id);
    const timestamp = Number(raw.timestamp);
    const success = raw.success === true;
    logs.push({
      id,
      toolName: raw.toolName.trim().slice(0, 100),
      args: normalizeArgs(raw.args),
      summary: typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim().slice(0, 1000)
        : success ? '设备动作已执行' : '设备动作未执行',
      timestamp: Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : Date.now(),
      success,
    });
  }

  return logs.length > 0 ? logs : undefined;
};
