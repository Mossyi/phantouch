import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  BookOpen,
  Check,
  Download,
  FileUp,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { TavernStore } from '../../core/tavern/tavernData';
import { MAX_TAVERN_PLAYER_PRESETS } from '../../core/tavern/tavernPlayerPresets';
import { TavernPlayerPreset, TavernPlayerProfile } from '../../core/tavern/tavernTypes';

type Panel = 'identity' | 'presets';
type PresetDraft = Pick<TavernPlayerPreset, 'id' | 'name' | 'description' | 'prompt' | 'enabled'>;

const EMPTY_DRAFT: PresetDraft = {
  id: '',
  name: '',
  description: '',
  prompt: '',
  enabled: true,
};

export const TavernPlayerPresetsTab: React.FC = () => {
  const store = TavernStore.getInstance();
  const [panel, setPanel] = useState<Panel>('identity');
  const [profile, setProfile] = useState<TavernPlayerProfile>(() => store.getPlayerProfile());
  const [identity, setIdentity] = useState(profile.identity);
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [notice, setNotice] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  // 提示条自动消失的定时器：卸载时清理，并在新提示到来时重置，避免上一条的定时器提前清掉新提示。
  const noticeTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const refresh = () => setProfile(store.getPlayerProfile());
  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice('');
    }, 2200);
  };

  const saveIdentity = () => {
    if (!store.setPlayerIdentity(identity)) {
      showNotice('本地存储失败，身份设定未保存');
      return;
    }
    refresh();
    showNotice('玩家身份已保存，将用于之后的酒馆对话');
  };

  const clearIdentity = () => {
    if (!store.setPlayerIdentity('')) {
      showNotice('本地存储失败，身份设定未清空');
      return;
    }
    setIdentity('');
    refresh();
    showNotice('玩家身份已清空');
  };

  const savePreset = () => {
    if (!draft?.name.trim() || !draft.prompt.trim()) {
      showNotice('请填写预设名称和提示词');
      return;
    }
    const saved = store.upsertPlayerPreset(draft);
    if (!saved) {
      showNotice('预设内容无效，未保存');
      return;
    }
    setDraft(null);
    refresh();
    showNotice('玩家预设已保存');
  };

  const togglePreset = (id: string) => {
    if (store.togglePlayerPreset(id) === null) {
      showNotice('预设状态保存失败');
      return;
    }
    if (draft?.id === id) setDraft((d) => d ? { ...d, enabled: !d.enabled } : d);
    refresh();
  };

  const deletePreset = (preset: TavernPlayerPreset) => {
    if (!window.confirm(`确定删除玩家预设“${preset.name}”吗？`)) return;
    if (!store.deletePlayerPreset(preset.id)) {
      showNotice('预设删除失败');
      return;
    }
    if (draft?.id === preset.id) setDraft(null);
    refresh();
    showNotice('玩家预设已删除');
  };

  const exportProfile = async () => {
    const payload = {
      format: 'yiciyuan_tavern_player_presets',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: store.getPlayerProfile(),
    };
    const json = JSON.stringify(payload, null, 2);
    const fileName = `yiciyuan-player-presets-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      if (Capacitor.isNativePlatform()) {
        const file = await Filesystem.writeFile({
          path: fileName,
          data: json,
          encoding: Encoding.UTF8,
          directory: Directory.Cache,
        });
        await Share.share({ title: '导出玩家预设', text: '请选择保存到文件', files: [file.uri] });
      } else {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      showNotice('玩家预设已导出');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '玩家预设导出失败');
    }
  };

  const importProfile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('预设文件不能超过 1 MB');
      const parsed = JSON.parse(await file.text());
      const result = store.importPlayerProfile(parsed?.profile ?? parsed);
      if (!result.persisted) throw new Error('本地存储失败，导入内容未保存');
      refresh();
      setIdentity(store.getPlayerProfile().identity);
      const summary = [
        result.identityImported ? '身份设定已导入' : '',
        result.added ? `新增 ${result.added} 条` : '',
        result.updated ? `更新 ${result.updated} 条` : '',
        result.skipped ? `容量已满，跳过 ${result.skipped} 条` : '',
      ].filter(Boolean).join('，');
      showNotice(summary || (result.accepted > 0 ? '预设内容没有变化' : '文件中没有有效的身份或预设'));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '预设文件导入失败');
    } finally {
      event.target.value = '';
    }
  };

  const enabledCount = profile.presets.filter((preset) => preset.enabled).length;

  return (
    <div className="space-y-4 text-[#263247]">
      <input ref={importInputRef} type="file" accept=".json,application/json" onChange={importProfile} className="hidden" />

      <section className="liquid-card p-5">
        <div className="frosted-feather-glass flex p-1 rounded-2xl shadow-xs">
          <button type="button" onClick={() => setPanel('identity')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-black transition ${panel === 'identity' ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm' : 'text-slate-600 hover:text-pink-600'}`}>
            <UserRound className="h-4 w-4" />身份设定
          </button>
          <button type="button" onClick={() => setPanel('presets')} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-black transition ${panel === 'presets' ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm' : 'text-slate-600 hover:text-pink-600'}`}>
            <BookOpen className="h-4 w-4" />我的预设
            {profile.presets.length > 0 && <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[9px] font-bold text-pink-700">{profile.presets.length}</span>}
          </button>
        </div>

        {notice && <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800"><Check className="h-3.5 w-3.5" />{notice}</div>}

        {panel === 'identity' ? (
          <div className="mt-4 space-y-3">
            <div>
              <h3 className="text-sm font-black text-slate-800">全局玩家身份</h3>
              <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-500">告诉 AI 你是谁、希望被怎样称呼，以及稳定的背景信息。内容会自动加入所有酒馆对话，但不会代替你发言。</p>
            </div>
            <textarea value={identity} onChange={(event) => setIdentity(event.target.value)} maxLength={12_000} rows={10} placeholder="例如：我叫小明，是一名大学生。请称呼我为小明；我喜欢轻松、带有剧情感的互动……" className="w-full resize-y rounded-2xl border border-pink-100 bg-white/90 p-3 text-xs font-medium leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:border-pink-400 shadow-xs" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[9px] font-medium text-slate-400">{identity.length}/12000 · 留空则不注入身份设定</span>
              <div className="flex gap-2">
                <button type="button" onClick={clearIdentity} className="rounded-xl px-3 py-2 text-[10px] font-bold text-slate-500 hover:bg-slate-100">清空</button>
                <button type="button" onClick={saveIdentity} className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-3.5 py-2 text-[10px] font-black text-white shadow-sm shadow-pink-500/20 active:scale-95"><Save className="h-3.5 w-3.5" />保存身份</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-800">我的玩家预设</h3>
                <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-500">启用的预设会与全局身份一起注入。可同时启用多条，适合保存称呼、互动风格或不同剧情身份。</p>
              </div>
              <button type="button" disabled={profile.presets.length >= MAX_TAVERN_PLAYER_PRESETS} onClick={() => { if (draft && (draft.name.trim() || draft.prompt.trim())) { if (!window.confirm('当前正在编辑的玩家预设尚未保存，确定要放弃并新建吗？')) return; } setDraft({ ...EMPTY_DRAFT }); }} className="flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50 shadow-sm shadow-pink-500/20 active:scale-95"><Plus className="h-3.5 w-3.5" />新建</button>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-pink-50/50 border border-pink-100/60 px-3 py-2 text-[9px] font-bold text-slate-600">
              <span>{enabledCount} 条正在生效 · 最多 {MAX_TAVERN_PLAYER_PRESETS} 条</span>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => importInputRef.current?.click()} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-slate-700 border border-pink-200 shadow-xs hover:bg-pink-50"><FileUp className="h-3 w-3" />导入</button>
                <button type="button" onClick={() => void exportProfile()} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-slate-700 border border-pink-200 shadow-xs hover:bg-pink-50"><Download className="h-3 w-3" />导出</button>
              </div>
            </div>

            {draft && (
              <div className="space-y-3 rounded-2xl border border-pink-200 bg-pink-50/50 p-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black text-pink-700">{draft.id ? '编辑玩家预设' : '新建玩家预设'}</h4>
                  <button type="button" onClick={() => setDraft(null)} className="rounded-lg p-1 text-slate-400 hover:bg-white"><X className="h-4 w-4" /></button>
                </div>
                <label className="block text-[10px] font-black text-slate-700">预设名称
                  <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} placeholder="例如：校园剧情中的我" className="mt-1 w-full rounded-xl border border-pink-100 bg-white p-2.5 text-xs text-slate-800" />
                </label>
                <label className="block text-[10px] font-black text-slate-700">简短说明（可选）
                  <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={300} placeholder="这条预设适合什么场景" className="mt-1 w-full rounded-xl border border-pink-100 bg-white p-2.5 text-xs text-slate-800" />
                </label>
                <label className="block text-[10px] font-black text-slate-700">玩家提示词
                  <textarea value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} maxLength={8_000} rows={7} placeholder="描述这个预设下玩家的身份、称呼、性格、关系或互动偏好。不要要求 AI 代替玩家发言。" className="mt-1 w-full resize-y rounded-xl border border-pink-100 bg-white p-2.5 text-xs leading-6 text-slate-800" />
                  <span className="mt-1 block text-right text-[9px] font-medium text-slate-400">{draft.prompt.length}/8000</span>
                </label>
                <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} className="accent-pink-500" />保存后立即启用</label>
                <button type="button" onClick={savePreset} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 py-2.5 text-[11px] font-black text-white shadow-sm shadow-pink-500/20 active:scale-95"><Save className="h-3.5 w-3.5" />保存玩家预设</button>
              </div>
            )}

            {profile.presets.length === 0 && !draft ? (
              <div className="rounded-2xl border border-dashed border-pink-200 bg-white/60 p-6 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-pink-300" />
                <p className="mt-2 text-[11px] font-black text-slate-700">还没有玩家预设</p>
                <p className="mt-1 text-[9px] font-medium text-slate-400">新建后可随时启用、关闭或编辑</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {profile.presets.map((preset) => (
                  <article key={preset.id} className={`liquid-card p-3.5 transition-all ${preset.enabled ? 'border-pink-300' : 'opacity-70'}`}>
                    <div className="flex items-start gap-3">
                      <button type="button" role="switch" aria-checked={preset.enabled} onClick={() => togglePreset(preset.id)} className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${preset.enabled ? 'bg-pink-500' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${preset.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="truncate text-[11px] font-black text-slate-800">{preset.name}</h4>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8.5px] font-black ${preset.enabled ? 'bg-pink-100 text-pink-700 border border-pink-200' : 'bg-slate-100 text-slate-500'}`}>{preset.enabled ? '已启用' : '已关闭'}</span>
                        </div>
                        {preset.description && <p className="mt-1 text-[9px] font-medium leading-relaxed text-slate-500">{preset.description}</p>}
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[10px] font-medium leading-relaxed text-slate-600">{preset.prompt}</p>
                        <div className="mt-2 flex justify-end gap-1">
                          <button type="button" onClick={() => setDraft({ id: preset.id, name: preset.name, description: preset.description, prompt: preset.prompt, enabled: preset.enabled })} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-bold text-slate-600 hover:bg-pink-50 hover:text-pink-600"><Pencil className="h-3 w-3" />编辑</button>
                          <button type="button" onClick={() => deletePreset(preset)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3 w-3" />删除</button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
