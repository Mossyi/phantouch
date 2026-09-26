import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Braces, Check, Download, FileUp, FlaskConical, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import {
  MAX_TAVERN_TEXT_RULES,
  TavernTextRule,
  TavernTextRuleTarget,
  applyTavernTextRules,
  createTavernTextRule,
  loadTavernTextRules,
  normalizeTavernTextRules,
  saveTavernTextRules,
  validateTavernRegexPattern,
} from '../../core/tavern/tavernTextRules';

const targetLabel: Record<TavernTextRuleTarget, string> = {
  user_prompt: '发送给 AI',
  assistant_output: 'AI 回复',
  tts: '语音朗读',
};

export const TavernTextRulesTab: React.FC = () => {
  const [rules, setRules] = useState<TavernTextRule[]>(() => loadTavernTextRules());
  const [draft, setDraft] = useState<TavernTextRule | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [previewTarget, setPreviewTarget] = useState<TavernTextRuleTarget>('assistant_output');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // 提示条自动消失的定时器：卸载时清理，并在新提示到来时重置，避免上一条的定时器提前清掉新提示。
  const noticeTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const commit = (nextValue: TavernTextRule[], message = '') => {
    const next = normalizeTavernTextRules(nextValue);
    if (!saveTavernTextRules(next)) {
      setNotice('本地存储失败，规则未保存');
      return false;
    }
    setRules(next);
    if (message) setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice('');
    }, 2200);
    return true;
  };

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.pattern) return setNotice('请填写规则名称和查找内容');
    if (draft.targets.length === 0) return setNotice('请至少选择一个应用范围');
    const regexError = draft.mode === 'regex' ? validateTavernRegexPattern(draft.pattern) : null;
    if (regexError) return setNotice(regexError);
    const exists = rules.some((rule) => rule.id === draft.id);
    const next = exists ? rules.map((rule) => rule.id === draft.id ? draft : rule) : [...rules, draft];
    if (commit(next, exists ? '文本规则已更新' : '文本规则已创建')) setDraft(null);
  };

  const toggleTarget = (target: TavernTextRuleTarget) => {
    if (!draft) return;
    setDraft({ ...draft, targets: draft.targets.includes(target) ? draft.targets.filter((item) => item !== target) : [...draft.targets, target] });
  };

  const removeRule = (rule: TavernTextRule) => {
    if (!window.confirm(`确定删除文本规则“${rule.name}”吗？`)) return;
    commit(rules.filter((item) => item.id !== rule.id), '规则已删除');
  };

  const exportRules = async () => {
    const content = JSON.stringify({ format: 'yiciyuan_tavern_text_rules', version: 1, rules }, null, 2);
    const filename = `yiciyuan-text-rules-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (Capacitor.isNativePlatform()) {
        const saved = await Filesystem.writeFile({ path: filename, data: content, encoding: Encoding.UTF8, directory: Directory.Cache });
        await Share.share({ title: '导出酒馆文本规则', files: [saved.uri] });
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
      setNotice('文本规则已导出');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导出失败');
    }
  };

  const importRules = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('规则文件不能超过 1 MB');
      const parsed = JSON.parse(await file.text());
      const imported = normalizeTavernTextRules(parsed?.rules ?? parsed);
      if (imported.length === 0) throw new Error('文件中没有有效文本规则');
      const byId = new Map(rules.map((rule) => [rule.id, rule]));
      imported.forEach((rule) => {
        const id = byId.has(rule.id) ? `${rule.id}_${Date.now().toString(36)}`.slice(0, 160) : rule.id;
        if (byId.size < MAX_TAVERN_TEXT_RULES) byId.set(id, { ...rule, id });
      });
      commit([...byId.values()], `已导入 ${Math.min(imported.length, MAX_TAVERN_TEXT_RULES - rules.length)} 条规则`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '规则导入失败');
    } finally {
      event.target.value = '';
    }
  };

  const preview = applyTavernTextRules(previewText, draft ? [draft] : rules, previewTarget);

  return (
    <div className="space-y-4 text-[#263247]">
      <input ref={fileRef} type="file" accept=".json,application/json" onChange={importRules} className="hidden" />
      <section className="rounded-[26px] border border-cyan-200 bg-gradient-to-br from-[#f3fdff] via-white to-[#f6fbf7] p-4 shadow-[0_12px_30px_rgba(20,75,86,0.08)]">
        <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-1.5 text-sm font-black text-[#214d65]"><Braces className="h-4 w-4 text-cyan-600" />文本处理规则</h3><p className="mt-1 text-[10px] leading-relaxed text-[#557586]">自动整理发送内容、AI 回复或 TTS 文本。规则只做替换，不能执行代码或控制硬件。</p></div><button type="button" disabled={rules.length >= MAX_TAVERN_TEXT_RULES} onClick={() => { if (draft && (draft.name.trim() || draft.pattern.trim())) { if (!window.confirm('当前正在编辑的规则尚未保存，确定要放弃并新建吗？')) return; } setDraft(createTavernTextRule()); }} className="flex shrink-0 items-center gap-1 rounded-xl bg-[#167b91] px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" />新建</button></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-1 rounded-xl border border-cyan-100 bg-white py-2 text-[9px] font-black text-[#236379]"><FileUp className="h-3.5 w-3.5" />导入规则</button><button type="button" onClick={() => void exportRules()} disabled={rules.length === 0} className="flex items-center justify-center gap-1 rounded-xl border border-cyan-100 bg-white py-2 text-[9px] font-black text-[#236379] disabled:opacity-40"><Download className="h-3.5 w-3.5" />导出全部</button></div>
        <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[9px] leading-relaxed text-amber-800">安全限制：正则仅支持有上限的重复次数，不允许无界 <code>*</code>/<code>+</code>、后向断言或执行脚本。AI 回复规则在硬件决策完成后才应用。</div>
        {notice && <div className="mt-2 flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-[9px] font-bold text-emerald-700"><Check className="h-3 w-3" />{notice}</div>}
      </section>

      {draft && <section className="space-y-3 rounded-2xl border-2 border-cyan-300 bg-[#f8feff] p-3.5"><div className="flex items-center justify-between"><h4 className="text-xs font-black text-[#214d65]">{rules.some((rule) => rule.id === draft.id) ? '编辑' : '新建'}文本规则</h4><button type="button" onClick={() => setDraft(null)} aria-label="关闭文本规则编辑"><X className="h-4 w-4" /></button></div><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={100} placeholder="规则名称" className="w-full rounded-xl border border-cyan-100 bg-white p-2.5 text-xs font-bold" /><div className="grid grid-cols-2 gap-2"><label className="text-[9px] font-bold text-[#557586]">匹配模式<select value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as TavernTextRule['mode'] })} className="mt-1 w-full rounded-xl border border-cyan-100 bg-white p-2.5 text-xs"><option value="literal">普通文字</option><option value="regex">安全正则</option></select></label><label className="text-[9px] font-bold text-[#557586]">优先级<input type="number" min="1" max="100" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-cyan-100 bg-white p-2.5 text-xs" /></label></div><label className="block text-[9px] font-bold text-[#557586]">查找内容<input value={draft.pattern} onChange={(event) => setDraft({ ...draft, pattern: event.target.value })} maxLength={200} placeholder={draft.mode === 'regex' ? '例如：(猫|小猫){1,2}' : '需要替换的文字'} className="mt-1 w-full rounded-xl border border-cyan-100 bg-white p-2.5 font-mono text-xs" /></label><label className="block text-[9px] font-bold text-[#557586]">替换为<textarea value={draft.replacement} onChange={(event) => setDraft({ ...draft, replacement: event.target.value })} maxLength={2000} rows={3} placeholder="留空表示删除；正则可使用 $1、$2 引用捕获内容" className="mt-1 w-full resize-y rounded-xl border border-cyan-100 bg-white p-2.5 text-xs" /></label><div><span className="text-[9px] font-bold text-[#557586]">应用范围</span><div className="mt-1.5 grid grid-cols-3 gap-1.5">{(['user_prompt', 'assistant_output', 'tts'] as TavernTextRuleTarget[]).map((target) => <label key={target} className={`flex items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[8px] font-black ${draft.targets.includes(target) ? 'border-cyan-400 bg-cyan-50 text-[#16657a]' : 'border-slate-200 bg-white text-slate-500'}`}><input type="checkbox" checked={draft.targets.includes(target)} onChange={() => toggleTarget(target)} className="accent-cyan-600" />{targetLabel[target]}</label>)}</div></div><div className="flex flex-wrap gap-3 text-[9px] font-bold text-[#557586]"><label className="flex items-center gap-1.5"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} className="accent-cyan-600" />保存后启用</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={draft.ignoreCase} onChange={(event) => setDraft({ ...draft, ignoreCase: event.target.checked })} className="accent-cyan-600" />忽略大小写</label></div>{draft.mode === 'regex' && draft.pattern && validateTavernRegexPattern(draft.pattern) && <p className="rounded-lg bg-rose-50 px-2.5 py-2 text-[9px] font-bold text-rose-600">{validateTavernRegexPattern(draft.pattern)}</p>}<button type="button" onClick={saveDraft} className="flex w-full items-center justify-center gap-1 rounded-xl bg-[#167b91] py-2.5 text-[10px] font-black text-white"><Save className="h-3.5 w-3.5" />保存规则</button></section>}

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3.5"><div className="flex items-center gap-1.5 text-xs font-black text-[#3e4c78]"><FlaskConical className="h-4 w-4" />规则试运行</div><div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><textarea value={previewText} onChange={(event) => setPreviewText(event.target.value)} rows={3} placeholder="输入一段文本预览替换结果" className="min-w-0 resize-y rounded-xl border border-indigo-100 bg-white p-2.5 text-[10px]" /><select value={previewTarget} onChange={(event) => setPreviewTarget(event.target.value as TavernTextRuleTarget)} className="rounded-xl border border-indigo-100 bg-white px-2 text-[9px] font-bold text-[#3e4c78]">{Object.entries(targetLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{previewText && <div className="mt-2 rounded-xl bg-white p-2.5 text-[9px] leading-relaxed text-[#526173]"><div className="flex justify-between gap-2 border-b border-indigo-50 pb-1.5"><span>命中 {preview.appliedRuleIds.length} 条规则</span>{preview.errors.length > 0 && <span className="text-rose-600">{preview.errors.length} 条无效规则已跳过</span>}</div><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-sans">{preview.text || '（替换结果为空）'}</pre></div>}</section>

      <section className="space-y-2.5"><div className="flex items-center justify-between px-1"><h4 className="text-xs font-black text-[#214d65]">已保存规则 ({rules.length}/{MAX_TAVERN_TEXT_RULES})</h4></div>{rules.map((rule) => <article key={rule.id} className={`rounded-2xl border p-3.5 ${rule.enabled ? 'border-cyan-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1"><h5 className="text-[11px] font-black text-[#214d65]">{rule.name}</h5><span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[8px] font-bold text-cyan-700">{rule.mode === 'regex' ? '正则' : '文字'}</span><span className="rounded bg-slate-50 px-1.5 py-0.5 text-[8px] font-bold text-slate-500">优先级 {rule.priority}</span></div><p className="mt-2 truncate font-mono text-[9px] text-[#526173]">{rule.pattern} → {rule.replacement || '（删除）'}</p><div className="mt-2 flex flex-wrap gap-1">{rule.targets.map((target) => <span key={target} className="rounded-md bg-[#edfafe] px-1.5 py-0.5 text-[8px] font-bold text-[#236379]">{targetLabel[target]}</span>)}</div></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => commit(rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))} aria-label={`${rule.enabled ? '停用' : '启用'} ${rule.name}`} className="rounded-lg border border-cyan-100 bg-white p-1.5 text-emerald-600"><Check className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setDraft({ ...rule, targets: [...rule.targets] })} aria-label={`编辑 ${rule.name}`} className="rounded-lg border border-cyan-100 bg-white p-1.5 text-[#236379]"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => removeRule(rule)} aria-label={`删除 ${rule.name}`} className="rounded-lg border border-rose-100 bg-white p-1.5 text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button></div></div></article>)}{rules.length === 0 && !draft && <div className="rounded-2xl border border-dashed border-cyan-200 bg-white p-7 text-center text-[10px] text-[#6f8791]">还没有文本规则。新建后可先在试运行区确认效果。</div>}</section>
    </div>
  );
};
