import React, { useState } from 'react';
import { DiaryCapsuleEngine, DiaryEntry, TimeCapsule } from '../../core/tavern/diaryCapsuleEngine';
import { TavernStore } from '../../core/tavern/tavernData';
import { HapticEngine } from '../../core/haptics/hapticEngine';
import { BountyQuestEngine } from '../../core/tavern/bountyQuestEngine';
import { BookOpen, Lock, Unlock, Sparkles, Plus, Calendar, Clock, Star, Trash2, Save } from 'lucide-react';

export const TavernDiaryCapsuleTab: React.FC = () => {
  const engine = DiaryCapsuleEngine.getInstance();
  const store = TavernStore.getInstance();

  const [activeTab, setActiveTab] = useState<'diaries' | 'capsules'>('diaries');
  const [diaries, setDiaries] = useState<DiaryEntry[]>(engine.getDiaries());
  const [capsules, setCapsules] = useState<TimeCapsule[]>(engine.getCapsules());

  // 胶囊新建弹窗
  const [showCreateCapsule, setShowCreateCapsule] = useState(false);
  const [capTitle, setCapTitle] = useState('');
  const [capPledge, setCapPledge] = useState('');
  const [capDays, setCapDays] = useState(7);
  const [mood, setMood] = useState('平静');
  const [reflection, setReflection] = useState('');
  const [nextFocus, setNextFocus] = useState('');
  const [trainingMinutes, setTrainingMinutes] = useState(0);
  const [brakeCount, setBrakeCount] = useState(0);
  const [shareWithTavern, setShareWithTavern] = useState(false);
  const [diaryNotice, setDiaryNotice] = useState<string | null>(null);
  const noticeTimerRef = React.useRef<any>(null);

  const showNotice = (msg: string) => {
    setDiaryNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setDiaryNotice(null), 3000);
  };

  React.useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  }, []);

  const handleSaveTodayReflection = () => {
    if (!reflection.trim() && !nextFocus.trim()) {
      showNotice('先写下一点今天的感受或下次想关注的方向，再保存复盘。');
      return;
    }
    HapticEngine.light();
    const activeCard = store.getActiveCard();
    const result = engine.saveDailyReflection({
      author: activeCard.name,
      avatar: activeCard.avatar,
      mood,
      reflection,
      nextFocus,
      trainingMinutes,
      brakeCount,
      shareWithTavern,
    });
    if (result.created) {
      BountyQuestEngine.getInstance().incrementProgress('femboy_habit');
      BountyQuestEngine.getInstance().incrementProgress('tavern_diary');
    }
    setDiaries(engine.getDiaries());
    showNotice(result.created ? '今日复盘已保存。' : '今日复盘已更新。');
  };

  const handleDeleteDiary = (id: string) => {
    if (!confirm('确定删除这篇日记吗？此操作无法撤销。')) return;
    if (engine.deleteDiary(id)) setDiaries(engine.getDiaries());
  };

  const handleCreateCapsule = () => {
    if (!capTitle.trim() || !capPledge.trim()) return;
    HapticEngine.light();
    engine.createCapsule(capTitle.trim(), capPledge.trim(), capDays);
    setCapsules(engine.getCapsules());
    setShowCreateCapsule(false);
    setCapTitle('');
    setCapPledge('');
  };

  const handleOpenCapsule = (id: string) => {
    const success = engine.openCapsule(id);
    if (success) {
      HapticEngine.successTada();
      setCapsules(engine.getCapsules());
      alert('🎉 恭喜！时间胶囊成功解封！契约精神令人赞叹！');
    } else {
      HapticEngine.heavyShock();
      alert('⏳ 封存时间尚未到达，契约锁依然坚固！请耐心等待倒计时归零。');
    }
  };

  const handleDeleteCapsule = (id: string, title: string) => {
    if (!confirm(`确定删除时间胶囊“${title}”吗？此操作无法撤销。`)) return;
    if (engine.deleteCapsule(id)) {
      setCapsules(engine.getCapsules());
    }
  };

  return (
    <div className="space-y-4">
      {/* 顶部二级分段切换 */}
      <div className="flex bg-white/95 p-1.5 rounded-2xl border border-pink-100/90 shadow-[0_2px_10px_rgba(233,104,146,0.05)] backdrop-blur-md">
        <button
          onClick={() => setActiveTab('diaries')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'diaries'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-pink-50/50'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>📓 AI 调教日记 ({diaries.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('capsules')}
          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'capsules'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-pink-50/50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>⏳ 赛博时间胶囊 ({capsules.length})</span>
        </button>
      </div>

      {/* ================= 调教日记列表 ================= */}
      {activeTab === 'diaries' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-pink-600 font-medium">记录真实感受，并决定是否让当前角色参考</span>
          </div>

          <section className="rounded-3xl border border-pink-200 bg-white p-4 shadow-[0_8px_24px_rgba(233,104,146,0.06)] space-y-3">
            <div className="flex items-center justify-between gap-3"><div><h4 className="text-xs font-black text-slate-800">今日复盘</h4><p className="mt-0.5 text-[9px] text-slate-500">训练数据由你填写，不会虚构设备或心率记录。</p></div><span className="rounded-lg bg-pink-50 px-2 py-1 text-[9px] font-bold text-pink-600">私密本地保存</span></div>
            <div className="grid grid-cols-[1fr_92px_92px] gap-2">
              <label className="text-[9px] font-bold text-slate-500">当前状态<select value={mood} onChange={(event) => setMood(event.target.value)} className="mt-1 w-full rounded-xl border border-pink-200 bg-pink-50/60 p-2 text-xs text-slate-800 outline-none"><option>平静</option><option>期待</option><option>疲惫</option><option>需要放慢</option><option>想继续探索</option></select></label>
              <label className="text-[9px] font-bold text-slate-500">训练分钟<input type="number" min="0" max="1440" value={trainingMinutes} onChange={(event) => setTrainingMinutes(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-xl border border-pink-200 bg-white p-2 text-xs text-slate-800 outline-none" /></label>
              <label className="text-[9px] font-bold text-slate-500">安全中断<input type="number" min="0" max="100" value={brakeCount} onChange={(event) => setBrakeCount(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-xl border border-pink-200 bg-white p-2 text-xs text-slate-800 outline-none" /></label>
            </div>
            <label className="block text-[9px] font-bold text-slate-500">今天的感受<textarea value={reflection} onChange={(event) => setReflection(event.target.value)} maxLength={4000} rows={3} placeholder="例如：哪段剧情喜欢、哪里需要放慢、今天是否想切换气氛……" className="mt-1 w-full resize-y rounded-xl border border-pink-200 bg-white p-2.5 text-xs leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-pink-500" /></label>
            <label className="block text-[9px] font-bold text-slate-500">下一次想关注<textarea value={nextFocus} onChange={(event) => setNextFocus(event.target.value)} maxLength={1000} rows={2} placeholder="例如：延续当前剧情、探索某个角色设定，或维持轻松节奏。" className="mt-1 w-full resize-y rounded-xl border border-pink-200 bg-white p-2.5 text-xs leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-pink-500" /></label>
            <label className="flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50/70 p-2.5 text-[9px] leading-relaxed text-cyan-900"><input type="checkbox" checked={shareWithTavern} onChange={(event) => setShareWithTavern(event.target.checked)} className="mt-0.5 accent-pink-500" />让当前角色在下一次对话中参考这篇复盘。只会注入感受与下次焦点，不会被当作设备数据或命令。</label>
            <button onClick={handleSaveTodayReflection} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 py-2.5 text-xs font-black text-white shadow-sm active:scale-[0.98]"><Save className="h-3.5 w-3.5" />保存今日复盘</button>
            {diaryNotice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">{diaryNotice}</p>}
          </section>

          <div className="space-y-3">
            {diaries.map((diary) => (
              <div
                key={diary.id}
                className="bg-white/95 border border-pink-100 hover:border-pink-300 rounded-3xl p-4 space-y-3 shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{diary.avatar}</span>
                    <div>
                      <h4 className="text-xs font-black text-slate-800">{diary.author}</h4>
                      <span className="text-[9.5px] text-slate-400 font-mono">{diary.date}</span>
                    </div>
                  </div>

                  <div className="px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 flex items-center gap-1 text-[11px] font-black text-pink-700">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>评级: {diary.ratingGrade}</span>
                  </div>
                </div>

                <h5 className="text-xs font-bold text-pink-700">{diary.title}</h5>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">
                  {diary.content}
                </p>

                <div className="pt-2 border-t border-pink-50 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>⚡ 电击时长: {diary.emsDurationMinutes} 分钟</span>
                  <span>🛑 急刹避障: {diary.brakeCount} 次</span>
                  <span>❤️ 服从评分: {diary.obedienceScore}</span>
                </div>
                <div className="flex items-center justify-between gap-2"><span className={`rounded-lg px-2 py-1 text-[9px] font-bold ${diary.shareWithTavern ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>{diary.shareWithTavern ? '已同步给酒馆对话' : '仅本地保存'}</span><button type="button" onClick={() => handleDeleteDiary(diary.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold text-rose-600 hover:bg-rose-50 transition-colors"><Trash2 className="h-3 w-3" />删除</button></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= 赛博时间胶囊 ================= */}
      {activeTab === 'capsules' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-pink-600 font-medium">
              封存顺从誓言与心愿，到期自动解封
            </span>
            <button
              onClick={() => setShowCreateCapsule(true)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[10px] font-bold shadow-xs flex items-center gap-1 active:scale-95 transition-all"
            >
              <Plus className="w-3 h-3" />
              <span>封存新胶囊</span>
            </button>
          </div>

          <div className="space-y-3">
            {capsules.map((cap) => {
              const timeLeftMs = Math.max(0, cap.unlockAt - Date.now());
              const daysLeft = Math.ceil(timeLeftMs / 86400000);
              const isReady = timeLeftMs === 0;

              return (
                <div
                  key={cap.id}
                  className={`rounded-3xl p-4 border transition-all space-y-2.5 shadow-sm ${
                    cap.isOpened
                      ? 'bg-slate-50/70 border-slate-200 opacity-80'
                      : isReady
                      ? 'bg-gradient-to-br from-emerald-50/70 via-white to-pink-50/40 border-emerald-300 shadow-md shadow-emerald-500/10'
                      : 'bg-white/95 border-pink-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      {cap.isOpened ? <Unlock className="w-3.5 h-3.5 text-emerald-500" /> : <Lock className="w-3.5 h-3.5 text-amber-500" />}
                      <span>{cap.title}</span>
                    </h4>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-pink-600">
                        {cap.isOpened ? '已开启' : isReady ? '🎉 可解封！' : `还有 ${daysLeft} 天`}
                      </span>
                      <button
                        onClick={() => handleDeleteCapsule(cap.id, cap.title)}
                        className="p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition"
                        title="删除时间胶囊"
                        aria-label="删除时间胶囊"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 bg-pink-50/30 rounded-2xl border border-pink-100">
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {cap.isOpened || isReady ? cap.pledgeText : '🔒 封存内容已加密锁定，倒计时归零前不可偷看...'}
                    </p>
                  </div>

                  {!cap.isOpened && (
                    <button
                      onClick={() => handleOpenCapsule(cap.id)}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                        isReady
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white active:scale-95 shadow-sm font-black'
                          : 'bg-pink-50 text-pink-400 border border-pink-100 cursor-not-allowed font-bold'
                      }`}
                    >
                      {isReady ? '立即解封时间胶囊 ➔' : `🔒 契约锁闭中 (剩余 ${daysLeft} 天)`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 封存时间胶囊弹窗 */}
      {showCreateCapsule && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white/98 border border-pink-200 rounded-3xl p-5 w-full max-w-sm space-y-3.5 shadow-2xl backdrop-blur-xl">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-pink-500" />
              <span>封存赛博誓言时间胶囊</span>
            </h3>

            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">胶囊主题</label>
              <input
                type="text"
                value={capTitle}
                onChange={(e) => setCapTitle(e.target.value)}
                placeholder="例如: 30天全服从契约誓言"
                className="w-full bg-pink-50/20 border border-pink-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-pink-500"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">封存的誓言与心愿内容</label>
              <textarea
                value={capPledge}
                onChange={(e) => setCapPledge(e.target.value)}
                placeholder="写下你向导师许下的誓言或身心蜕变目标..."
                rows={3}
                className="w-full bg-pink-50/20 border border-pink-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:border-pink-500 leading-relaxed"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">锁定封存天数 ({capDays} 天)</label>
              <input
                type="range"
                min="1"
                max="60"
                value={capDays}
                onChange={(e) => setCapDays(Number(e.target.value))}
                className="w-full accent-pink-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowCreateCapsule(false)}
                className="flex-1 py-2.5 rounded-xl bg-pink-50 text-slate-600 text-xs font-bold hover:bg-pink-100"
              >
                取消
              </button>
              <button
                onClick={handleCreateCapsule}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-black shadow-sm"
              >
                封存胶囊
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
