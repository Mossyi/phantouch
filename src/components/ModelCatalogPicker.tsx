import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useOverlayBack } from './tavern/useOverlayBack';
import {
  fetchOpenAIModelCatalog,
  MODEL_CATALOG_LIMITATION,
  shouldApplyCatalogResult,
} from '../core/ai/openaiModelCatalog';

interface ModelCatalogPickerProps {
  baseUrl: string;
  apiKey: string;
  onSelect: (modelId: string) => void;
}

export const ModelCatalogPicker: React.FC<ModelCatalogPickerProps> = ({ baseUrl, apiKey, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef({ baseUrl, apiKey });
  requestRef.current = { baseUrl, apiKey };

  useOverlayBack(() => setOpen(false), open);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    abortRef.current?.abort();
    setLoading(false);
    setModels([]);
    setOpen(false);
    setQuery('');
    setMessage('');
    setNotice('');
  }, [baseUrl, apiKey]);

  const loadModels = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const started = { baseUrl, apiKey };
    setLoading(true);
    setMessage('');
    setNotice('');
    const result = await fetchOpenAIModelCatalog({ baseUrl, apiKey, signal: controller.signal });
    if (!shouldApplyCatalogResult(started, requestRef.current, controller.signal.aborted)) return;
    setLoading(false);
    if (!result.ok) {
      setModels([]);
      setOpen(false);
      setMessage(result.message);
      return;
    }
    setModels(result.models);
    setNotice(result.notice || MODEL_CATALOG_LIMITATION);
    setMessage(`已获取 ${result.models.length} 个模型 ID`);
    setOpen(true);
  };

  const visible = models.filter((id) => id.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void loadModels()}
        disabled={loading}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-pink-200 bg-white px-3 py-2 text-[11px] font-black text-pink-700 shadow-xs transition active:scale-[0.98] disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? '正在获取模型列表…' : '获取模型列表'}
      </button>
      {message && <p className="text-[10px] leading-relaxed text-slate-600" role="status">{message}</p>}
      {open && (
        <div className="rounded-2xl border border-pink-200 bg-white p-2 shadow-xs">
          <label className="mb-1 flex items-center gap-1.5 rounded-xl border border-pink-100 bg-pink-50/40 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索模型 ID"
              aria-label="搜索模型 ID"
              className="w-full bg-transparent text-xs text-slate-800 outline-none"
            />
          </label>
          <p className="px-1 py-1 text-[9px] leading-relaxed text-slate-500">{notice}</p>
          <div className="max-h-[40vh] space-y-1 overflow-y-auto" data-allow-scroll="true">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-[10px] text-slate-500">没有匹配的模型 ID。</p>
            ) : visible.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onSelect(id);
                  setOpen(false);
                }}
                className="block w-full break-all rounded-lg px-2 py-2 text-left font-mono text-[11px] text-slate-800 hover:bg-pink-50"
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
