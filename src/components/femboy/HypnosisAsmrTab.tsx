import React, { useState, useEffect, useRef } from 'react';
import { LocalAudioPlayer, LocalAudioPlayerHandle } from './LocalAudioPlayer';
import { loadSavedScripts, saveAsmrScript } from '../../core/asmr/savedScripts';
import { SavedAsmrScripts } from './SavedAsmrScripts';
import { AudioLibraryManager } from './AudioLibraryManager';
import { readPreference, writePreference } from '../../core/ui/localPreferences';
import { HYPNOSIS_TRACKS, HypnosisTrack } from '../../core/asmr/hypnosisData';
import { AmbientAudioEngine } from '../../core/asmr/ambientAudioEngine';
import { DeviceManager } from '../../core/deviceManager';
import { TTSManager } from '../../core/voice/ttsManager';
import { Headphones, Play, Square, Sparkles, Bot, Upload, ExternalLink, Trash2, Pencil, HardDrive, FolderPlus, FolderOpen } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { LLMClient } from '../../core/ai/llmClient';
import { parseBoundedStringArray } from '../../core/ai/structuredOutput';
import {
  LocalAsmrTrack,
  LocalAsmrCategory,
  DEFAULT_LOCAL_ASMR_CATEGORY,
  addLocalAsmrCategory,
  addLocalAsmrTrack,
  deleteLocalAsmrCategory,
  listLocalAsmrCategories,
  listLocalAsmrTracks,
  renameLocalAsmrCategory,
} from '../../core/asmr/localAudioLibrary';

export const HypnosisAsmrTab: React.FC = () => {
  const { llmConfig } = useAppStore();
  const audioEngine = AmbientAudioEngine.getInstance();
  const [activeTrack, setActiveTrack] = useState<HypnosisTrack | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customTracks, setCustomTracks] = useState(loadSavedScripts);
  const [queueIds, setQueueIds] = useState<string[]>(() => { const value = readPreference<unknown>('ycy_asmr_queue', []); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 200) : []; });
  const updateQueue = (ids: string[]) => { if (writePreference('ycy_asmr_queue', ids)) setQueueIds(ids); else setLocalLibraryStatus('播放列表保存失败'); };
  const [isPlaying, setIsPlaying] = useState(false);
  const [whisperIndex, setWhisperIndex] = useState(0);
  const [localTracks, setLocalTracks] = useState<LocalAsmrTrack[]>([]);
  const [localCategories, setLocalCategories] = useState<LocalAsmrCategory[]>([DEFAULT_LOCAL_ASMR_CATEGORY]);
  const [activeCategoryId, setActiveCategoryId] = useState(DEFAULT_LOCAL_ASMR_CATEGORY.id);
  const [activeLocalTrack, setActiveLocalTrack] = useState<LocalAsmrTrack | null>(null);
  const [localLibraryStatus, setLocalLibraryStatus] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const whisperIndexRef = useRef(0);
  const playbackGenerationRef = useRef(0);
  const localPlayerRef = useRef<LocalAudioPlayerHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshLocalLibrary = async () => {
    try {
      const [tracks, categories] = await Promise.all([listLocalAsmrTracks(), listLocalAsmrCategories()]);
      const categoryIds = new Set(categories.map((category) => category.id));
      setLocalTracks(tracks.map((track) => categoryIds.has(track.categoryId)
        ? track
        : { ...track, categoryId: DEFAULT_LOCAL_ASMR_CATEGORY.id }));
      setLocalCategories(categories);
      setActiveCategoryId((current) => categories.some((category) => category.id === current) ? current : DEFAULT_LOCAL_ASMR_CATEGORY.id);
    } catch (libraryError) {
      setLocalLibraryStatus(libraryError instanceof Error ? libraryError.message : '无法读取本地音声库');
    }
  };

  useEffect(() => {
    void refreshLocalLibrary();
  }, []);

  const stopLocalAudio = () => localPlayerRef.current?.stop();

  const stopGeneratedTrack = () => {
    playbackGenerationRef.current += 1;
    setIsPlaying(false);
    setActiveTrack(null);
    audioEngine.stop();
    TTSManager.getInstance().stop();
    void DeviceManager.getInstance().emergencyStop();
  };

  const playLocalTrack = async (track: LocalAsmrTrack) => { await localPlayerRef.current?.play(track); };

  const importLocalFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setIsImporting(true);
    let imported = 0;
    const errors: string[] = [];
    for (const file of files.slice(0, 50)) {
      try {
        await addLocalAsmrTrack(file, activeCategoryId);
        imported += 1;
      } catch (importError) {
        errors.push(`${file.name}：${importError instanceof Error ? importError.message : '导入失败'}`);
      }
    }
    await refreshLocalLibrary();
    setIsImporting(false);
    setLocalLibraryStatus(errors.length
      ? `已导入 ${imported} 个，${errors.length} 个失败：${errors.slice(0, 2).join('；')}`
      : `已成功导入 ${imported} 个音频到当前分类，现可离线播放。`);
  };

  const createLocalCategory = async () => {
    const name = window.prompt('输入新的音频大类名称（例如：睡眠引导、角色音声、白噪音）：');
    if (!name?.trim()) return;
    try {
      const category = await addLocalAsmrCategory(name);
      setLocalCategories((categories) => [...categories, category]);
      setActiveCategoryId(category.id);
      setLocalLibraryStatus(`已创建“${category.name}”，现在导入的音频会进入这个分类。`);
    } catch (error) {
      setLocalLibraryStatus(error instanceof Error ? error.message : '创建分类失败');
    }
  };

  const renameLocalCategory = async () => {
    const category = localCategories.find((item) => item.id === activeCategoryId);
    if (!category || category.id === DEFAULT_LOCAL_ASMR_CATEGORY.id) return;
    const name = window.prompt('输入新的分类名称：', category.name);
    if (!name?.trim()) return;
    try {
      const updated = await renameLocalAsmrCategory(category, name);
      setLocalCategories((categories) => categories.map((item) => item.id === updated.id ? updated : item));
      setLocalLibraryStatus(`分类已重命名为“${updated.name}”。`);
    } catch (error) {
      setLocalLibraryStatus(error instanceof Error ? error.message : '重命名分类失败');
    }
  };

  const removeLocalCategory = async () => {
    const category = localCategories.find((item) => item.id === activeCategoryId);
    if (!category || category.id === DEFAULT_LOCAL_ASMR_CATEGORY.id) return;
    const count = localTracks.filter((track) => track.categoryId === category.id).length;
    if (!window.confirm(`删除分类“${category.name}”吗？其中 ${count} 个音频不会被删除，会移到“未分类”。`)) return;
    try {
      await deleteLocalAsmrCategory(category.id);
      await refreshLocalLibrary();
      setActiveCategoryId(DEFAULT_LOCAL_ASMR_CATEGORY.id);
      setLocalLibraryStatus(`分类“${category.name}”已删除，其中音频已移到“未分类”。`);
    } catch (error) {
      setLocalLibraryStatus(error instanceof Error ? error.message : '删除分类失败');
    }
  };

    const generateAITrack = async () => {
    const tags = window.prompt('请输入你想听到的ASMR催眠主题标签（如：完全服从、粉色沉沦、思维放空）：');
    if (!tags) return;
    setIsGenerating(true);
    try {
      const client = new LLMClient(llmConfig, { hardwareToolsEnabled: false });
      const prompt = `请生成一段深度ASMR催眠引导剧本，主题围绕：${tags}。要求语言极度轻柔、缓慢、带有强烈的心理暗示和服从感。分为6句较短的耳语引导词。直接返回JSON格式的字符串数组：["引导词1", "引导词2"]。不要任何其他文字。`;
      const res = await client.sendMessage([{ role: 'user', content: prompt, id: '1', timestamp: Date.now() }], [], '你是一个严格的AI调教助手。请只输出合法的JSON格式，不要带markdown标记。');
      const cleaned = res.reply.replace(/\x60\x60\x60json/g, '').replace(/\x60\x60\x60/g, '').trim();
      const whisperLines = parseBoundedStringArray(cleaned, { maxItems: 6, maxItemLength: 500 });
      if (whisperLines.length > 0) {
        const newTrack: HypnosisTrack = {
          id: `ai-${Date.now()}`,
          title: `【AI 定制】${tags.slice(0, 8)}`,
          description: '基于大模型实时生成的独一无二深度催眠词。',
          durationMinutes: 5,
          mentorPersonaId: 'preset-2',
          ambientSound: 'sea_binaural',
          whisperLines,
          hardwarePreset: { wave: 'breathe', strength: 15, motorRate: 10 }
        };
        setCustomTracks(saveAsmrScript(newTrack));
        setLocalLibraryStatus('新剧本已保存到“我的 ASMR 剧本”，可编辑后手动播放。');
      } else {
        throw new Error('invalid format');
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? `生成或保存失败：${e.message}` : 'AI生成失败，请检查网络后重试。');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (isPlaying && activeTrack) {
      interval = setInterval(() => {
        if (activeTrack.whisperLines.length === 0) return;
        const next = (whisperIndexRef.current + 1) % activeTrack.whisperLines.length;
        whisperIndexRef.current = next;
        setWhisperIndex(next);
        void TTSManager.getInstance().speak(activeTrack.whisperLines[next]);
      }, 12000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, activeTrack]);

  useEffect(() => {
    if (!isPlaying || !activeTrack) return;
    const endTimer = setTimeout(() => {
      setIsPlaying(false);
      setActiveTrack(null);
      audioEngine.stop();
      TTSManager.getInstance().stop();
      void DeviceManager.getInstance().emergencyStop();
    }, activeTrack.durationMinutes * 60 * 1000);
    return () => clearTimeout(endTimer);
  }, [isPlaying, activeTrack, audioEngine]);

  // 组件卸载时安全清理音频
  useEffect(() => {
    return () => {
      playbackGenerationRef.current += 1;
      audioEngine.stop();
      TTSManager.getInstance().stop();
      void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
      void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
    };
  }, [audioEngine]);

  const handleStartTrack = (track: HypnosisTrack) => {
    if (activeTrack?.id === track.id && isPlaying) {
      handleStop();
      return;
    }

    stopLocalAudio();
    stopGeneratedTrack();
    setActiveTrack(track);
    setIsPlaying(true);
    setWhisperIndex(0);
    whisperIndexRef.current = 0;
    const generation = ++playbackGenerationRef.current;

    // 1. 播放环境白噪音 / 432Hz 脑波
    audioEngine.play(track.ambientSound, 0.35);

    // Saved scripts are text/audio only; imported content cannot start hardware.
    const dev = DeviceManager.getInstance();
    if (!track.id.startsWith('ai-')) void (async () => {
      try {
        await dev.sendEmsWave('AB', track.hardwarePreset.wave);
        if (generation !== playbackGenerationRef.current) return;
        await dev.setEmsStrength('AB', track.hardwarePreset.strength);
        if (generation !== playbackGenerationRef.current) return;
        await dev.setToyMotor(track.hardwarePreset.motorRate, 0, 0);
      } catch (error) {
        console.warn('ASMR 硬件预设启动失败:', error);
        await dev.emergencyStop();
      }
    })();

    // 3. 第一句耳语
    void TTSManager.getInstance().speak(track.whisperLines[0]);
  };

  const handleStop = () => {
    stopGeneratedTrack();
    stopLocalAudio();
  };

  const localLibraryBytes = localTracks.reduce((sum, track) => sum + track.size, 0);
  const formatMegabytes = (bytes: number) => bytes <= 0 ? '0 MB' : `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} MB`;
  const activeCategory = localCategories.find((category) => category.id === activeCategoryId) || DEFAULT_LOCAL_ASMR_CATEGORY;

  return (
    <div className="space-y-4">

      {/* 顶部 ASMR 催眠舱介绍卡片 */}
      <section className="bg-gradient-to-br from-slate-900 via-indigo-950/40 to-purple-950/60 border-2 border-indigo-500/80 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-2xl shadow-lg border border-indigo-400">
              🎧
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-100 flex items-center gap-1.5">
                <span>潜意识深度同化与耳边低语 ASMR 舱</span>
              </h3>
              <p className="text-[10px] text-indigo-300">432Hz 双耳立体脑波 + 伴侣耳语 + 仿生慢调呼吸波</p>
            </div>
          </div>
          {isPlaying && (
            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950 px-2.5 py-1 rounded-full border border-cyan-800 animate-pulse">
              🎵 沉浸运行中
            </span>
          )}
        </div>

        {activeTrack && isPlaying && (
          <div className="mt-4 p-3.5 bg-slate-950/80 rounded-2xl border border-indigo-500/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300">
                正在播放：{activeTrack.title}
              </span>
              <button
                onClick={handleStop}
                className="px-2.5 py-1 rounded-lg bg-rose-950 text-rose-300 text-[10px] font-bold border border-rose-800"
              >
                停止播放
              </button>
            </div>
            <p className="text-xs text-slate-200 italic font-sans">
              {activeTrack.whisperLines[whisperIndex]}
            </p>
          </div>
        )}
      <div className="mt-4"><button onClick={generateAITrack} disabled={isGenerating} className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50">{isGenerating ? <Sparkles className="w-4 h-4 animate-spin"/> : <Bot className="w-4 h-4"/>}{isGenerating ? 'AI 正在编写深度催眠词...' : '定制 AI 专属催眠剧本'}</button></div></section>

      <section className="overflow-hidden rounded-3xl border-2 border-cyan-500/60 bg-gradient-to-br from-slate-950 via-cyan-950/30 to-indigo-950/50 shadow-xl">
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="flex items-center gap-1.5 text-xs font-black text-cyan-200"><HardDrive className="h-4 w-4" />本地离线音声库</h3><p className="mt-1 text-[10px] leading-relaxed text-slate-400">一次可选择最多 50 个已获得使用权的音频。文件仅保存在本机，不上传，也不会随 APK 分发。</p></div>
            <span className="shrink-0 rounded-full border border-cyan-800 bg-cyan-950 px-2 py-1 text-[9px] font-bold text-cyan-300">{localTracks.length} 个 · {formatMegabytes(localLibraryBytes)}</span>
          </div>
          <div className="mt-3 rounded-2xl border border-cyan-900/70 bg-black/20 p-2.5">
            <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-1 text-[10px] font-black text-cyan-200"><FolderOpen className="h-3.5 w-3.5" />我的音频分类</p><button type="button" onClick={createLocalCategory} className="flex items-center gap-1 rounded-xl bg-cyan-950 px-2.5 py-1.5 text-[9px] font-black text-cyan-300"><FolderPlus className="h-3 w-3" />新建分类</button></div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">{localCategories.map((category) => { const count = localTracks.filter((track) => track.categoryId === category.id).length; return <button key={category.id} type="button" onClick={() => setActiveCategoryId(category.id)} className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-[9px] font-black ${activeCategoryId === category.id ? 'border-cyan-400 bg-cyan-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>{category.name} · {count}</button>; })}</div>
            <div className="mt-2 flex items-center justify-between gap-2"><p className="min-w-0 truncate text-[9px] text-slate-400">当前分类：<strong className="text-cyan-300">{activeCategory.name}</strong>，下方导入会直接保存到这里。</p>{activeCategory.id !== DEFAULT_LOCAL_ASMR_CATEGORY.id && <div className="flex shrink-0 gap-1"><button type="button" onClick={renameLocalCategory} className="rounded-lg bg-slate-800 p-1.5 text-slate-300" title="重命名分类"><Pencil className="h-3 w-3" /></button><button type="button" onClick={removeLocalCategory} className="rounded-lg bg-rose-950 p-1.5 text-rose-300" title="删除分类"><Trash2 className="h-3 w-3" /></button></div>}</div>
          </div>
          <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.webm" multiple onChange={(event) => void importLocalFiles(event)} className="hidden" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={isImporting} onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-indigo-600 py-2.5 text-[10px] font-black text-white disabled:opacity-50"><Upload className="h-3.5 w-3.5" />{isImporting ? '正在批量导入...' : `导入到“${activeCategory.name}”`}</button>
            <a href="https://viva-la-vita.top/" target="_blank" rel="noreferrer noopener" className="flex items-center justify-center gap-1.5 rounded-2xl border border-indigo-500/60 bg-indigo-950/70 py-2.5 text-[10px] font-black text-indigo-200"><ExternalLink className="h-3.5 w-3.5" />打开免费音声库</a>
          </div>
          <a href="https://bbs.viva-la-vita.org/d/20348" target="_blank" rel="noreferrer noopener" className="mt-2 flex items-center justify-center gap-1 text-[9px] font-bold text-cyan-400"><ExternalLink className="h-3 w-3" />打开论坛资源汇总与下载页</a>
          {localLibraryStatus && <p className="mt-2 rounded-xl bg-white/5 px-2.5 py-2 text-[9px] leading-relaxed text-slate-300">{localLibraryStatus}</p>}
        </div>

        <LocalAudioPlayer ref={localPlayerRef} tracks={localTracks} queueIds={queueIds} onActiveChange={setActiveLocalTrack} onStatus={setLocalLibraryStatus} onBeforePlay={stopGeneratedTrack} />

        <AudioLibraryManager tracks={localTracks} categories={localCategories} categoryId={activeCategory.id} queueIds={queueIds} onQueue={updateQueue} onChange={refreshLocalLibrary} onPlay={track => void playLocalTrack(track)} onStop={stopLocalAudio} />
      </section>

      <SavedAsmrScripts tracks={customTracks} onChange={tracks => { if (activeTrack?.id.startsWith('ai-')) handleStop(); setCustomTracks(tracks); }} onPlay={handleStartTrack} />
      {/* 音轨列表 */}
      <section className="space-y-2.5">
        <span className="text-xs font-black text-slate-200 px-1 block">
          🌙 精选潜意识重构音轨 ({HYPNOSIS_TRACKS.length})
        </span>

        <div className="space-y-2.5">
          {HYPNOSIS_TRACKS.map((track) => {
            const isThisPlaying = activeTrack?.id === track.id && isPlaying;

            return (
              <div
                key={track.id}
                className={`p-4 rounded-3xl border-2 transition-all relative overflow-hidden shadow-lg ${
                  isThisPlaying
                    ? 'bg-indigo-950/60 border-cyan-400 shadow-cyan-500/20'
                    : 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-black text-slate-100">{track.title}</h4>
                      <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.2 rounded-full border border-cyan-800">
                        ⏱️ {track.durationMinutes} 分钟
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-sans">{track.description}</p>
                  </div>

                  <button
                    onClick={() => handleStartTrack(track)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                      isThisPlaying
                        ? 'bg-rose-600 text-white'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                    }`}
                  >
                    {isThisPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isThisPlaying ? '停止' : '进入冥想'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
