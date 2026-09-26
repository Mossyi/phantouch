import { Capacitor } from '@capacitor/core';
import build from '../../../version.json';
import { parseApiBaseUrl } from '../apiBaseUrl';
import { getDiagnosticEvents } from './diagnosticEvents';
export type PermissionReading = 'granted' | 'denied' | 'prompt' | 'unavailable';
export interface DiagnosticSource {
  deviceState: { connectionMode: unknown; connectionStatus: unknown };
  llmConfig: { baseUrl: unknown; apiKey: unknown; model: unknown };
}
export function summarizeDiagnosticSource(source: DiagnosticSource) {
  return {
    connectionMode: ['ble', 'bridge', 'simulator', 'dglab'].includes(String(source.deviceState.connectionMode)) ? String(source.deviceState.connectionMode) : 'unknown',
    connectionStatus: ['disconnected', 'connecting', 'connected', 'error'].includes(String(source.deviceState.connectionStatus)) ? String(source.deviceState.connectionStatus) : 'unknown',
    apiAddressValid: !!parseApiBaseUrl(source.llmConfig.baseUrl),
    apiKeyPresent: typeof source.llmConfig.apiKey === 'string' && !!source.llmConfig.apiKey.trim(),
    modelNamePresent: typeof source.llmConfig.model === 'string' && !!source.llmConfig.model.trim(),
  };
}
async function permission(name: 'microphone' | 'camera'): Promise<PermissionReading> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!navigator.permissions?.query) return 'unavailable';
    return await Promise.race([
      navigator.permissions.query({ name: name as PermissionName }).then(result => ['granted', 'denied', 'prompt'].includes(result.state) ? result.state : 'unavailable'),
      new Promise<PermissionReading>(resolve => { timer = setTimeout(() => resolve('unavailable'), 1200); }),
    ]) as PermissionReading;
  } catch { return 'unavailable'; } finally { clearTimeout(timer); }
}
export async function collectAppDiagnostics(source: DiagnosticSource) {
  const environment = { platform: ['web', 'android', 'ios'].includes(Capacitor.getPlatform()) ? Capacitor.getPlatform() : 'unknown', native: Capacitor.isNativePlatform(), secureContext: window.isSecureContext === true, onlineHint: typeof navigator.onLine === 'boolean' ? navigator.onLine : null };
  const capabilities = { mediaCaptureApi: typeof navigator.mediaDevices?.getUserMedia === 'function', browserSpeechRecognitionApi: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window, browserSpeechSynthesisApi: 'speechSynthesis' in window, browserBluetoothApi: 'bluetooth' in navigator, indexedDbApi: typeof indexedDB !== 'undefined', nativeBluetoothPlugin: Capacitor.isPluginAvailable('BluetoothLe'), nativeFilesystemPlugin: Capacitor.isPluginAvailable('Filesystem'), nativeSharePlugin: Capacitor.isPluginAvailable('Share') };
  let localStorageReadable = false;
  try { void localStorage.length; localStorageReadable = true; } catch {}
  const [microphone, camera] = await Promise.all([permission('microphone'), permission('camera')]);
  return { format: 'ycy_app_diagnostics', schemaVersion: 1, capturedAt: new Date().toISOString(), build: { ...build }, environment, capabilities, permissions: { microphone, camera }, localStorageReadable, connection: summarizeDiagnosticSource(source), recentRequests: getDiagnosticEvents(), limitations: ['仅检测 API 是否提供与已有权限状态，不代表功能实测成功。', '权限读取不可用不等于被拒绝，原生授权请以系统设置为准。', '网络在线提示不代表模型服务可达；请求记录仅覆盖共用 HTTP 客户端，本次启动最多 50 条异常。', '不包含设备名称、标识、接口地址、密钥、模型名、聊天、图片、录音或原始异常文本。'] };
}
export type AppDiagnosticReport = Awaited<ReturnType<typeof collectAppDiagnostics>>;
