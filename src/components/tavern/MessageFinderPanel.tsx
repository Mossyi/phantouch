import React, { useState } from 'react';
import { MessageBookmark, findMessageIds, highlightMessage } from '../../core/tavern/messageFinder';
export function ArchiveMessageMatches({ messages, query }: { messages: Array<{ id: string; content: string; role: string }>; query: string }) {
  const [index, setIndex] = useState(0);
  const ids = findMessageIds(messages, query), cursor = Math.min(index, Math.max(0, ids.length - 1)), message = messages.find(m => m.id === ids[cursor]);
  if (!message) return null;
  return <details className="mt-2 rounded-xl border border-[var(--line)] bg-white p-2 text-xs"><summary className="cursor-pointer font-bold">查看命中消息（{ids.length} 条，只读）</summary><div className="flex gap-2 my-2"><button className="ui-button-secondary" disabled={!cursor} onClick={() => setIndex(cursor - 1)}>上一条</button><span>{cursor + 1}/{ids.length}</span><button className="ui-button-secondary" disabled={cursor + 1 >= ids.length} onClick={() => setIndex(cursor + 1)}>下一条</button></div><p className="ui-muted">原存档第 {messages.findIndex(m => m.id === message.id) + 1} 条 · {message.role === 'user' ? '我' : '角色'}</p><p className="mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap break-words">{highlightMessage(message.content, query).map((part, i) => part.hit ? <mark key={i} className="bg-amber-200 text-slate-950">{part.text}</mark> : part.text)}</p></details>;
}
export function MessageFinderPanel({ messages, query, onQuery, onLocate, bookmarks, onRemove, onClose }: { messages: Array<{ id: string; content: string }>; query: string; onQuery: (query: string) => void; onLocate: (id: string) => void; bookmarks: MessageBookmark[]; onRemove: (bookmark: MessageBookmark) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'search' | 'bookmarks'>('search'), [cursor, setCursor] = useState(0);
  const [localInput, setLocalInput] = useState(query);
  const debounceTimerRef = React.useRef<any>(null);

  React.useEffect(() => {
    setLocalInput(query);
  }, [query]);

  const handleInputChange = (val: string) => {
    setLocalInput(val);
    setCursor(0);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onQuery(val);
    }, 180);
  };

  const matches = findMessageIds(messages, query), index = Math.min(cursor, Math.max(0, matches.length - 1));
  const jump = (next: number) => { if (!matches.length) return; const position = (next + matches.length) % matches.length; setCursor(position); onLocate(matches[position]); };
  return (
    <section className="rounded-3xl border border-pink-300 bg-white p-3 space-y-2.5 text-xs shadow-[0_16px_36px_rgba(15,23,42,0.22)] text-slate-800">
      <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
        <button
          type="button"
          className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${tab === 'search' ? 'bg-pink-50 text-pink-600 border border-pink-200' : 'text-slate-600 hover:bg-slate-50'}`}
          onClick={() => setTab('search')}
        >
          搜索消息
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${tab === 'bookmarks' ? 'bg-pink-50 text-pink-600 border border-pink-200' : 'text-slate-600 hover:bg-slate-50'}`}
          onClick={() => setTab('bookmarks')}
        >
          收藏（{bookmarks.length}）
        </button>
        <button
          type="button"
          className="ml-auto px-2.5 py-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 font-bold"
          onClick={onClose}
        >
          关闭
        </button>
      </div>

      {tab === 'search' ? (
        <>
          <input
            autoFocus
            aria-label="搜索当前对话"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-pink-400 focus:bg-white transition-all"
            maxLength={100}
            placeholder="搜索当前对话，回车定位；存档请在存档库搜索"
            value={localInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                onQuery(localInput);
                jump(index);
              }
            }}
          />
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex gap-1.5">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-pink-50 hover:text-pink-600 disabled:opacity-40"
                disabled={!matches.length}
                onClick={() => jump(index - 1)}
              >
                上一条
              </button>
              <button
                type="button"
                className="rounded-xl bg-pink-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-pink-600 disabled:opacity-40"
                disabled={!matches.length}
                onClick={() => jump(index)}
              >
                定位
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-pink-50 hover:text-pink-600 disabled:opacity-40"
                disabled={!matches.length}
                onClick={() => jump(index + 1)}
              >
                下一条
              </button>
            </div>
            <span className="font-mono text-[11px] text-slate-500">
              {matches.length ? index + 1 : 0} / {matches.length}
            </span>
          </div>
        </>
      ) : (
        <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
          {!bookmarks.length && (
            <p className="py-4 text-center text-xs text-slate-400">
              消息长按或菜单中点“收藏”，即可在此快捷查看重要内容。
            </p>
          )}
          {bookmarks.map((b) => {
            const available = messages.some((m) => m.id === b.id);
            return (
              <div key={b.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-2.5 text-xs">
                <details>
                  <summary className="cursor-pointer truncate font-bold text-slate-700">
                    {b.role === 'user' ? '我' : '角色'}：{b.content.slice(0, 70)}
                  </summary>
                  <p className="mt-1.5 whitespace-pre-wrap break-words rounded-xl bg-white p-2 text-slate-600 border border-slate-100">
                    {b.content}
                  </p>
                </details>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    className="rounded-lg bg-pink-50 px-2.5 py-1 text-[10px] font-bold text-pink-600 hover:bg-pink-100 disabled:opacity-40"
                    disabled={!available}
                    onClick={() => onLocate(b.id)}
                  >
                    定位原消息
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-rose-600"
                    onClick={() => onRemove(b)}
                  >
                    取消收藏
                  </button>
                </div>
                {!available && (
                  <p className="mt-1 text-[10px] text-slate-400">原消息不在当前会话中，仍保留收藏时的文字快照。</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
