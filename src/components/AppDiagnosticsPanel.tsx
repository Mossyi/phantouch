import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { AppDiagnosticReport, collectAppDiagnostics } from '../core/ui/appDiagnostics';
import { clearDiagnosticEvents, diagnosticsEnabled, setDiagnosticsEnabled } from '../core/ui/diagnosticEvents';
import { exportTextFile } from '../core/ui/exportFile';
const permissionNames = { granted: '已授权', denied: '已拒绝', prompt: '尚未决定', unavailable: '当前环境无法读取' };
const outcomes = { 'http-error': 'HTTP 错误', timeout: '请求超时', cancelled: '主动取消', network: '连接未建立', 'response-limit': '响应超限', unknown: '其他异常' };
export function AppDiagnosticsPanel() {
  const [report, setReport] = useState<AppDiagnosticReport | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [enabled, setEnabled] = useState(diagnosticsEnabled);
  const generation = useRef(0), pending = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const inspect = async () => {
    if (pending.current) return;
    const current = ++generation.current; pending.current = true; setBusy(true);
    try { const state = useAppStore.getState(); const result = await collectAppDiagnostics({ deviceState: state.deviceState, llmConfig: state.llmConfig }); if (generation.current === current) { setReport(result); setNotice('检查完成，未开启硬件、摄像头或麦克风。'); } }
    catch { if (generation.current === current) setNotice('诊断读取失败，请重试。'); }
    finally { pending.current = false; if (generation.current === current) setBusy(false); }
  };
  return <section className="ui-card space-y-3"><h3 className="font-bold">问题诊断</h3><p className="ui-muted text-xs">只读取基础能力和已有授权。报告不包含聊天、照片、录音、设备名称、接口地址或密钥；不会请求模型接口。</p><label className="text-xs flex gap-2"><input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setDiagnosticsEnabled(e.target.checked); setReport(null); }} />本次启动记录标准化请求异常（仅内存，最多 50 条）</label><div className="flex gap-2"><button className="ui-button" disabled={busy} onClick={() => void inspect()}>{busy ? '正在读取…' : '检查当前环境'}</button><button className="ui-button-secondary" disabled={busy} onClick={() => { clearDiagnosticEvents(); setReport(null); setNotice('请求记录已清空'); }}>清空记录</button></div>
    {report && <div className="space-y-3 text-xs"><p className="ui-muted">检查时间：{new Date(report.capturedAt).toLocaleString()}。报告是当时的快照。</p><dl className="space-y-2">{Object.entries({ '运行平台': report.environment.platform, '安全上下文': report.environment.secureContext ? '是' : '否', '网络在线提示': report.environment.onlineHint === null ? '未知' : report.environment.onlineHint ? '在线（未测试服务）' : '离线', '麦克风权限': permissionNames[report.permissions.microphone], '摄像头权限': permissionNames[report.permissions.camera], '本地配置可读取': report.localStorageReadable ? '是' : '否', '连接模式 / 状态': `${report.connection.connectionMode} / ${report.connection.connectionStatus}`, '录音 API': report.capabilities.mediaCaptureApi ? '已提供' : '未提供', '原生蓝牙插件': report.capabilities.nativeBluetoothPlugin ? '已提供' : '未提供', '原生文件 / 分享插件': `${report.capabilities.nativeFilesystemPlugin ? '有' : '无'} / ${report.capabilities.nativeSharePlugin ? '有' : '无'}` }).map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="text-right">{value}</dd></div>)}</dl>
      {!report.environment.secureContext && <p className="rounded-xl bg-amber-50 p-2 text-[#805300]">非安全上下文可能限制录音、摄像头与蓝牙，请使用可信 HTTPS 或本机 localhost。</p>}{(report.permissions.camera === 'denied' || report.permissions.microphone === 'denied') && <p className="ui-muted">存在被拒绝的权限，请到系统应用设置或浏览器站点设置中检查。本页不会自动申请权限。</p>}
      <details><summary className="cursor-pointer font-bold">最近请求异常（{report.recentRequests.length}）</summary><p className="ui-muted mt-2">主动取消通常不是故障。HTTP 401/403 可检查授权，429 可稍后重试；这些状态不能单独确定根因。</p><div className="max-h-40 overflow-auto mt-2 space-y-1">{report.recentRequests.map((event, i) => <p key={i}>{new Date(event.at).toLocaleTimeString()} · {event.transport === 'stream' ? '流式' : '普通'} · {outcomes[event.outcome]}{event.status ? ` · ${event.status}` : ''}</p>)}</div></details><details><summary className="cursor-pointer">查看完整脱敏报告</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(report, null, 2)}</pre></details><p className="ui-muted">{report.limitations[0]} {report.limitations[1]}</p><button className="ui-button-secondary w-full" onClick={() => void exportTextFile(`ycy-diagnostics-${Date.now()}.json`, JSON.stringify(report, null, 2)).then(() => setNotice('诊断报告已导出。')).catch(() => setNotice('未完成导出，请重试。'))}>导出这份诊断报告</button></div>}
    {notice && <p role="status" className="ui-muted text-xs">{notice}</p>}
  </section>;
}
