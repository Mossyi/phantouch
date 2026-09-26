export type RequestOutcome = 'http-error' | 'timeout' | 'cancelled' | 'network' | 'response-limit' | 'unknown';
export interface DiagnosticEvent { at: number; transport: 'text' | 'stream'; outcome: RequestOutcome; status?: number }
let enabled = true;
let events: DiagnosticEvent[] = [];
export const diagnosticsEnabled = () => enabled;
export const getDiagnosticEvents = (): DiagnosticEvent[] => events.map(event => ({ ...event }));
export function clearDiagnosticEvents() { events = []; }
export function setDiagnosticsEnabled(value: boolean) { enabled = value; if (!value) clearDiagnosticEvents(); }
export function recordDiagnosticEvent(transport: 'text' | 'stream', outcome: RequestOutcome, status?: number) {
  if (!enabled) return;
  events = [{ at: Date.now(), transport, outcome, ...(Number.isInteger(status) && status! >= 100 && status! <= 599 ? { status } : {}) }, ...events].slice(0, 50);
}
export function classifyRequestFailure(error: unknown): RequestOutcome {
  const message = error instanceof Error ? error.message : '';
  if (/响应超过.*安全限制/.test(message)) return 'response-limit';
  if (/failed to fetch|networkerror|load failed/i.test(message)) return 'network';
  return 'unknown';
}
