import React, { useEffect, useRef, useState } from 'react';
import { CAPABILITY_LABELS, CapabilityResult, ModelCapability, probeModelCapability } from '../core/ai/modelCapabilities';
import { modelFingerprint, loadCapabilityReport, saveCapabilityReport } from '../core/ai/modelProfiles';

export function ModelCapabilityPanel({ baseUrl, apiKey, model }: { baseUrl: string; apiKey: string; model: string }) {
  const [results, setResults] = useState<CapabilityResult[]>([]);
  const [active, setActive] = useState<ModelCapability | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [history, setHistory] = useState(false);
  const cacheGeneration = useRef(0);
  useEffect(() => { const generation = ++cacheGeneration.current; let current = true; setResults([]); setHistory(false); setActive(null); controller.current?.abort(); controller.current = null; void modelFingerprint({ baseUrl, apiKey, model }).then(key => { if (current && generation === cacheGeneration.current && !controller.current) { setResults(loadCapabilityReport(key)); setHistory(true); } }).catch(() => {}); return () => { current = false; controller.current?.abort(); controller.current = null; }; }, [baseUrl, apiKey, model]);
  const run = async () => {
    controller.current?.abort(); const pending = new AbortController(); controller.current = pending; setResults([]); setHistory(false);
    cacheGeneration.current++;
    const collected: CapabilityResult[] = [];
    try {
      for (const capability of Object.keys(CAPABILITY_LABELS) as ModelCapability[]) {
        if (pending.signal.aborted) break;
        setActive(capability);
        const result = await probeModelCapability({ baseUrl, apiKey, model }, capability, pending.signal);
        if (apiKey.trim()) result.message = result.message.split(apiKey.trim()).join('[已隐藏密钥]');
        if (controller.current !== pending) return;
        collected.push(result);
        setResults(previous => [...previous, result]);
      }
      const fingerprint = await modelFingerprint({ baseUrl, apiKey, model }).catch(() => '');
      if (fingerprint && controller.current === pending && !pending.signal.aborted) saveCapabilityReport(fingerprint, collected);
    } finally { if (controller.current === pending) { controller.current = null; setActive(null); } }
  };
  return <section className="ui-card space-y-3">
    <h3 className="font-bold">当前模型能力检测</h3><p className="ui-muted text-xs break-all">{model || '尚未选择模型'}</p>
    <p className="ui-muted text-xs">{history && results.length ? '以下为这套地址、模型和密钥的历史检测，并非实时状态。超过 7 天仅供参考，请重新检测。' : '修改地址、模型或密钥后，不沿用其他配置的检测结论。'}</p>
    <p className="ui-muted text-xs">使用上方填写的配置，发送最多 5 次独立测试请求，消耗对应服务额度。测试不包含聊天记录，也不会执行硬件指令。</p>
    <button type="button" className="ui-button w-full" disabled={!model.trim()} onClick={() => active ? controller.current?.abort() : void run()}>{active ? `${CAPABILITY_LABELS[active]}检测中 · 点击取消` : '检测四项能力'}</button>
    <div className="space-y-2">{results.map(result => { const expired = history && Date.now() - result.checkedAt > 7 * 86400000; return <div key={result.capability} className={`rounded-xl p-3 text-xs ${expired ? 'bg-[var(--surface-soft)]' : result.status === 'passed' ? 'ui-status-success' : result.status === 'failed' ? 'ui-status-error' : 'bg-[var(--surface-soft)]'}`}><div className="flex justify-between gap-2 font-bold"><span>{CAPABILITY_LABELS[result.capability]}</span><span>{expired ? '已过期 · ' : history ? '历史 · ' : ''}{({ passed: '通过', failed: '失败', unverified: '未确认', cancelled: '已取消' })[result.status]} · {result.elapsedMs} ms</span></div><p className="mt-1 break-words">{result.message}</p><p className="mt-1 opacity-80">{new Date(result.checkedAt).toLocaleString()}</p></div>; })}</div>
  </section>;
}
