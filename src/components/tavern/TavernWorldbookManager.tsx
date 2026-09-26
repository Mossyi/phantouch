import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BookOpen, Check, Download, FileUp, FlaskConical, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import {
  MAX_TAVERN_WORLDBOOKS,
  TavernWorldbook,
  TavernWorldbookEntry,
  buildTavernWorldbookContext,
  createTavernWorldbook,
  createTavernWorldbookEntry,
  exportTavernWorldbook,
  importTavernWorldbooks,
  loadTavernWorldbooks,
  matchTavernWorldbooks,
  normalizeTavernWorldbooks,
  saveTavernWorldbooks,
} from '../../core/tavern/tavernWorldbooks';

interface EntryDraft extends TavernWorldbookEntry {
  keywordText: string;
  secondaryText: string;
}

const splitKeywords = (value: string): string[] => [...new Set(value.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 30);

export const TavernWorldbookManager: React.FC = () => {
  const [books, setBooks] = useState<TavernWorldbook[]>(() => loadTavernWorldbooks());
  const [selectedId, setSelectedId] = useState<string>(() => loadTavernWorldbooks()[0]?.id || '');
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // 提示条自动消失的定时器：卸载时清理，并在新提示到来时重置，避免上一条的定时器提前清掉新提示。
  const noticeTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);
  const selected = books.find((book) => book.id === selectedId) || books[0] || null;

  const commit = (nextValue: TavernWorldbook[], message = '') => {
    const next = normalizeTavernWorldbooks(nextValue);
    if (!saveTavernWorldbooks(next)) {
      setNotice('本地存储失败，修改未保存');
      return false;
    }
    setBooks(next);
    if (message) setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice('');
    }, 2200);
    return true;
  };

  const updateSelected = (patch: Partial<TavernWorldbook>, message = '') => {
    if (!selected) return;
    commit(books.map((book) => book.id === selected.id ? { ...book, ...patch, updatedAt: Date.now() } : book), message);
  };

  const addBook = () => {
    if (books.length >= MAX_TAVERN_WORLDBOOKS) return setNotice(`最多保存 ${MAX_TAVERN_WORLDBOOKS} 本世界书`);
    const book = createTavernWorldbook(`剧情世界书 ${books.length + 1}`);
    if (commit([...books, book], '已创建世界书')) setSelectedId(book.id);
  };

  const removeBook = () => {
    if (!selected || !window.confirm(`确定删除世界书“${selected.name}”吗？`)) return;
    const next = books.filter((book) => book.id !== selected.id);
    if (commit(next, '世界书已删除')) setSelectedId(next[0]?.id || '');
  };

  const openEntry = (entry?: TavernWorldbookEntry) => {
    if (entryDraft && (entryDraft.content.trim() || entryDraft.keywordText.trim())) {
      if (!window.confirm('当前正在编辑的剧情条目尚未保存，确定要放弃修改吗？')) return;
    }
    const value = entry || createTavernWorldbookEntry();
    setEntryDraft({
      ...value,
      keywordText: value.keywords.join(', '),
      secondaryText: value.secondaryKeywords.join(', '),
    });
  };

  const saveEntry = () => {
    if (!selected || !entryDraft) return;
    const keywords = splitKeywords(entryDraft.keywordText);
    if (keywords.length === 0 || !entryDraft.content.trim()) return setNotice('请填写关键词和注入内容');
    const entry: TavernWorldbookEntry = {
      id: entryDraft.id,
      name: entryDraft.name.trim().slice(0, 100),
      keywords,
      secondaryKeywords: splitKeywords(entryDraft.secondaryText),
      content: entryDraft.content.trim().slice(0, 8_000),
      enabled: entryDraft.enabled,
      priority: Math.min(100, Math.max(1, Math.round(entryDraft.priority))),
      caseSensitive: entryDraft.caseSensitive,
    };
    const exists = selected.entries.some((item) => item.id === entry.id);
    const entries = exists ? selected.entries.map((item) => item.id === entry.id ? entry : item) : [...selected.entries, entry];
    updateSelected({ entries }, exists ? '条目已更新' : '条目已创建');
    setEntryDraft(null);
  };

  const deleteEntry = (entry: TavernWorldbookEntry) => {
    if (!selected || !window.confirm(`确定删除条目“${entry.name || entry.keywords[0]}”吗？`)) return;
    updateSelected({ entries: selected.entries.filter((item) => item.id !== entry.id) }, '条目已删除');
  };

  const exportBook = async () => {
    if (!selected) return;
    const exported = exportTavernWorldbook(selected);
    if (!exported) return;
    const content = JSON.stringify(exported, null, 2);
    const filename = `worldbook-${selected.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 40) || 'export'}.json`;
    try {
      if (Capacitor.isNativePlatform()) {
        const saved = await Filesystem.writeFile({ path: filename, data: content, encoding: Encoding.UTF8, directory: Directory.Cache });
        await Share.share({ title: `导出 ${selected.name}`, files: [saved.uri] });
      } else {
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice('世界书已导出');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '世界书导出失败');
    }
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error('世界书文件不能超过 4 MB');
      const imported = importTavernWorldbooks(JSON.parse(await file.text()));
      if (imported.length === 0) throw new Error('没有找到有效的 SillyTavern 世界书条目');
      const available = Math.max(0, MAX_TAVERN_WORLDBOOKS - books.length);
      const accepted = imported.slice(0, available).map((book, index) => ({ ...book, id: `${book.id}_${Date.now().toString(36)}_${index}`.slice(0, 160) }));
      if (accepted.length === 0) throw new Error(`最多保存 ${MAX_TAVERN_WORLDBOOKS} 本世界书`);
      if (commit([...books, ...accepted], `已导入 ${accepted.length} 本世界书`)) setSelectedId(accepted[0].id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '世界书导入失败');
    } finally {
      event.target.value = '';
    }
  };

  const matches = selected && previewText.trim() ? matchTavernWorldbooks([selected], previewText) : [];
  const previewContext = selected && previewText.trim() ? buildTavernWorldbookContext([selected], previewText) : '';

  return (
    <div className="space-y-4 text-slate-700">
      <input ref={fileRef} type="file" accept=".json,application/json" onChange={importFile} className="hidden" />
      <section className="rounded-[26px] border border-pink-100/90 bg-white/95 backdrop-blur-xl p-4 shadow-[0_10px_30px_rgba(233,104,146,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-black text-slate-800">
              <BookOpen className="h-4 w-4 text-pink-500" />
              剧情世界书
            </h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">关键词命中后把背景设定注入对话。它只提供文字上下文，不具备硬件权限。</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 rounded-xl border border-pink-100 bg-pink-50/80 px-3 py-2 text-[10px] font-bold text-pink-700 transition hover:bg-pink-100 active:scale-95"
            >
              <FileUp className="h-3.5 w-3.5" />导入
            </button>
            <button
              type="button"
              onClick={addBook}
              className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-2 text-[10px] font-bold text-white shadow-sm shadow-pink-500/20 transition active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />新建
            </button>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => { setSelectedId(book.id); setEntryDraft(null); }}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-all ${
                selected?.id === book.id
                  ? 'border-pink-300 bg-gradient-to-br from-pink-50 to-rose-50 text-pink-800 shadow-xs'
                  : 'border-pink-100/70 bg-white/90 text-slate-600 hover:border-pink-200'
              }`}
            >
              <span className="block max-w-32 truncate text-[10px] font-bold">{book.name}</span>
              <span className="text-[8px] text-slate-400">{book.entries.length} 条 · {book.enabled ? '已启用' : '已停用'}</span>
            </button>
          ))}
          {books.length === 0 && (
            <div className="w-full rounded-xl border border-dashed border-pink-200 bg-white/70 p-4 text-center text-[10px] text-slate-400">
              还没有剧情世界书，可新建或导入 SillyTavern JSON。
            </div>
          )}
        </div>
        {notice && (
          <div className="mt-2 flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-[9px] font-bold text-emerald-700 backdrop-blur-xs">
            <Check className="h-3 w-3" />{notice}
          </div>
        )}
      </section>

      {selected && (
        <>
          <section className="space-y-3 rounded-2xl border border-pink-100/90 bg-white/95 backdrop-blur-xl p-4 shadow-[0_4px_20px_rgba(233,104,146,0.04)]">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-800">世界书设置</h4>
              <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                <input
                  type="checkbox"
                  checked={selected.enabled}
                  onChange={(event) => updateSelected({ enabled: event.target.checked }, event.target.checked ? '世界书已启用' : '世界书已停用')}
                  className="accent-pink-500 rounded"
                />
                参与对话
              </label>
            </div>
            <input
              aria-label="世界书名称"
              value={selected.name}
              onChange={(event) => updateSelected({ name: event.target.value })}
              maxLength={100}
              className="w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-pink-300 focus:bg-white"
            />
            <textarea
              aria-label="世界书说明"
              value={selected.description}
              onChange={(event) => updateSelected({ description: event.target.value })}
              rows={2}
              maxLength={500}
              placeholder="这本世界书适合哪些角色或剧情"
              className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-[10px] leading-relaxed text-slate-700 outline-none transition focus:border-pink-300 focus:bg-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[9px] font-bold text-slate-500">
                扫描最近消息
                <input
                  type="number"
                  min="1"
                  max="40"
                  value={selected.scanDepth}
                  onChange={(event) => updateSelected({ scanDepth: Number(event.target.value) })}
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                />
              </label>
              <label className="text-[9px] font-bold text-slate-500">
                单书 Token 预算
                <input
                  type="number"
                  min="128"
                  max="8192"
                  value={selected.tokenBudget}
                  onChange={(event) => updateSelected({ tokenBudget: Number(event.target.value) })}
                  className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void exportBook()}
                className="flex items-center justify-center gap-1 rounded-xl border border-pink-100 bg-pink-50/70 py-2 text-[9px] font-bold text-pink-700 transition hover:bg-pink-100 active:scale-95"
              >
                <Download className="h-3.5 w-3.5" />导出
              </button>
              <button
                type="button"
                onClick={removeBook}
                className="flex items-center justify-center gap-1 rounded-xl border border-rose-100 bg-rose-50/80 py-2 text-[9px] font-bold text-rose-600 transition hover:bg-rose-100 active:scale-95"
              >
                <Trash2 className="h-3.5 w-3.5" />删除
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/60 via-white to-sky-50/40 p-4 shadow-xs backdrop-blur-md">
            <div className="flex items-center gap-1.5 text-xs font-black text-sky-900">
              <FlaskConical className="h-4 w-4 text-sky-500" />命中试运行
            </div>
            <p className="mt-1 text-[9px] text-sky-600/80">输入一段对话，只预览会注入的剧情设定。</p>
            <textarea
              value={previewText}
              onChange={(event) => setPreviewText(event.target.value)}
              rows={2}
              placeholder="例如：我们来到王都的北门……"
              className="mt-2 w-full rounded-xl border border-sky-100 bg-white/90 p-2.5 text-[10px] text-slate-700 outline-none focus:border-sky-300"
            />
            {previewText.trim() && (
              <div className="mt-2 rounded-xl border border-sky-100/60 bg-white/90 p-2.5 text-[9px] leading-relaxed text-slate-700 shadow-xs">
                {matches.length ? (
                  <>
                    <div className="font-bold text-sky-800">命中 {matches.length} 条：{matches.map((match) => match.entry.name || match.entry.keywords[0]).join('、')}</div>
                    <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap border-t border-sky-100 pt-2 font-sans text-[9px] text-slate-600">{previewContext}</pre>
                  </>
                ) : (
                  '没有命中条目。'
                )}
              </div>
            )}
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-xs font-black text-slate-800">剧情条目 ({selected.entries.length})</h4>
              <button
                type="button"
                onClick={() => openEntry()}
                className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-2 text-[9px] font-bold text-white shadow-sm shadow-pink-500/20 transition active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />新增条目
              </button>
            </div>
            {entryDraft && (
              <div className="space-y-2.5 rounded-2xl border-2 border-pink-200 bg-white/98 p-4 shadow-xl backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <h5 className="text-[11px] font-black text-slate-800">编辑剧情条目</h5>
                  <button type="button" onClick={() => setEntryDraft(null)} aria-label="关闭条目编辑" className="text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  value={entryDraft.name}
                  onChange={(event) => setEntryDraft({ ...entryDraft, name: event.target.value })}
                  placeholder="条目名称（可选）"
                  maxLength={100}
                  className="w-full rounded-xl border border-pink-100 bg-slate-50/50 p-2.5 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                />
                <input
                  value={entryDraft.keywordText}
                  onChange={(event) => setEntryDraft({ ...entryDraft, keywordText: event.target.value })}
                  placeholder="主关键词，逗号分隔"
                  className="w-full rounded-xl border border-pink-100 bg-slate-50/50 p-2.5 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                />
                <input
                  value={entryDraft.secondaryText}
                  onChange={(event) => setEntryDraft({ ...entryDraft, secondaryText: event.target.value })}
                  placeholder="次关键词（可选，需再命中其中一个）"
                  className="w-full rounded-xl border border-pink-100 bg-slate-50/50 p-2.5 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                />
                <textarea
                  value={entryDraft.content}
                  onChange={(event) => setEntryDraft({ ...entryDraft, content: event.target.value })}
                  rows={6}
                  maxLength={8000}
                  placeholder="命中后注入给 AI 的背景、人物关系或世界规则"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/50 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[9px] font-bold text-slate-500">
                    优先级
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={entryDraft.priority}
                      onChange={(event) => setEntryDraft({ ...entryDraft, priority: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/50 p-2 text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                    />
                  </label>
                  <div className="space-y-2 pt-1 text-[9px] font-bold text-slate-500">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={entryDraft.enabled}
                        onChange={(event) => setEntryDraft({ ...entryDraft, enabled: event.target.checked })}
                        className="accent-pink-500 rounded"
                      />
                      启用条目
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={entryDraft.caseSensitive}
                        onChange={(event) => setEntryDraft({ ...entryDraft, caseSensitive: event.target.checked })}
                        className="accent-pink-500 rounded"
                      />
                      区分大小写
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={saveEntry}
                  className="flex w-full items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 py-2.5 text-[10px] font-black text-white shadow-sm shadow-pink-500/20 active:scale-98"
                >
                  <Save className="h-3.5 w-3.5" />保存条目
                </button>
              </div>
            )}
            {selected.entries.map((entry) => (
              <article
                key={entry.id}
                className={`rounded-2xl border p-3.5 transition-all ${
                  entry.enabled
                    ? 'border-pink-100/80 bg-white/95 shadow-xs hover:border-pink-200'
                    : 'border-slate-100 bg-slate-50/70 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h5 className="truncate text-[11px] font-black text-slate-800">{entry.name || entry.keywords[0]}</h5>
                      <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[8px] font-bold text-pink-600">优先级 {entry.priority}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {entry.keywords.map((keyword) => (
                        <span key={keyword} className="rounded-md border border-pink-100 bg-pink-50/60 px-1.5 py-0.5 text-[8px] font-bold text-pink-700">
                          #{keyword}
                        </span>
                      ))}
                    </div>
                    {entry.secondaryKeywords.length > 0 && (
                      <p className="mt-1 text-[8px] text-slate-400">并且包含：{entry.secondaryKeywords.join(' / ')}</p>
                    )}
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[9px] leading-relaxed text-slate-600">{entry.content}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => updateSelected({ entries: selected.entries.map((item) => item.id === entry.id ? { ...item, enabled: !item.enabled } : item) })}
                      aria-label={`${entry.enabled ? '停用' : '启用'} ${entry.name || entry.keywords[0]}`}
                      className="rounded-lg border border-pink-100 bg-white p-1.5 text-emerald-600 hover:bg-emerald-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEntry(entry)}
                      aria-label={`编辑 ${entry.name || entry.keywords[0]}`}
                      className="rounded-lg border border-pink-100 bg-white p-1.5 text-slate-600 hover:text-pink-600 hover:bg-pink-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntry(entry)}
                      aria-label={`删除 ${entry.name || entry.keywords[0]}`}
                      className="rounded-lg border border-pink-100 bg-white p-1.5 text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {selected.entries.length === 0 && !entryDraft && (
              <div className="rounded-2xl border border-dashed border-pink-200 bg-white/70 p-6 text-center text-[10px] text-slate-400">
                这本世界书还没有条目。
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
