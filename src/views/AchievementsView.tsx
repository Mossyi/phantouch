import React, { useState, useEffect, useRef } from 'react';
import { AchievementEngine } from '../core/achievements/achievementEngine';
import { Achievement, AchievementCategory, AchievementRarity } from '../types';
import { TTSManager } from '../core/voice/ttsManager';
import {
  Trophy,
  Award,
  Crown,
  Sparkles,
  Zap,
  Heart,
  Castle,
  Flame,
  CheckCircle2,
  Lock,
  Volume2,
  Share2,
} from 'lucide-react';

export const AchievementsView: React.FC = () => {
  const engine = AchievementEngine.getInstance();

  const [achievements, setAchievements] = useState<Achievement[]>(engine.getAchievements());
  const [equippedTitle, setEquippedTitle] = useState<string>(engine.getEquippedTitle());
  const [activeCategory, setActiveCategory] = useState<'all' | AchievementCategory>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // 称号提示的自动消失定时器：卸载时清理，并在新提示到来时重置，
  // 避免上一条的定时器提前清掉新提示，也避免卸载后仍有回调触发状态更新。
  const toastTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const unsub = engine.subscribe((list) => {
      setAchievements([...list]);
      setEquippedTitle(engine.getEquippedTitle());
    });
    return () => unsub();
  }, [engine]);

  const unlockedCount = achievements.filter((a) => a.unlockedAt !== null).length;
  const totalCount = achievements.length;
  const progressPercent = Math.round((unlockedCount / totalCount) * 100);

  const filteredList = achievements.filter((a) => {
    if (activeCategory === 'all') return true;
    return a.category === activeCategory;
  });

  const handleEquip = (title: string) => {
      engine.equipTitle(title);
      setToastMessage(`已成功佩戴称号：${title}`);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        toastTimerRef.current = null;
        setToastMessage(null);
      }, 2500);
  };

  const handlePlayVoice = (ach: Achievement) => {
    if (ach.hiddenRewardVoice) {
      void TTSManager.getInstance().speak(`成就【${ach.title}】专属语音：${ach.hiddenRewardVoice}`);
    }
  };

  const getRarityBadge = (rarity: AchievementRarity) => {
    switch (rarity) {
      case 'bronze':
        return <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">🥉 青铜初阶</span>;
      case 'silver':
        return <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">🥈 白银进阶</span>;
      case 'gold':
        return <span className="text-[10px] font-bold text-yellow-800 bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-300 shadow-sm">🥇 黄金荣耀</span>;
      case 'mythic':
        return <span className="text-[10px] font-black text-pink-700 bg-pink-50 px-2.5 py-0.5 rounded-full border border-pink-300 shadow-sm animate-pulse">💎 至尊传奇</span>;
    }
  };

  return (
    <div className="max-w-md mx-auto px-3.5 py-4 pb-10 space-y-4">
      {/* 顶部提示 Toast */}
      {toastMessage && (
        <div className="fixed top-[calc(max(3.8rem,env(safe-area-inset-top,0px)+2.75rem))] left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-2 rounded-2xl shadow-xl text-xs font-bold animate-in fade-in zoom-in-95 flex items-center gap-1.5 border border-pink-200">
          <Sparkles className="w-4 h-4 text-yellow-200 animate-spin" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ================= 顶部荣耀总览卡片 ================= */}
      <section className="bg-gradient-to-br from-white via-pink-50/60 to-rose-50/40 border border-pink-200 rounded-3xl p-5 shadow-[0_8px_30px_rgba(233,104,146,0.08)] relative overflow-hidden">
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl"></div>
        <div className="absolute -left-6 -top-6 w-32 h-32 bg-pink-500/10 rounded-full blur-2xl"></div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-2xl shadow-md shadow-pink-500/20 border border-pink-200">
              🏆
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                赛博成就荣誉殿堂
              </h2>
              <p className="text-[11px] text-slate-500">解锁专属头衔与隐藏伴侣语音</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-lg font-black text-pink-600 font-mono">
              {unlockedCount} <span className="text-xs text-slate-400">/ {totalCount}</span>
            </span>
          </div>
        </div>

        {/* 当前佩戴专属头衔 */}
        <div className="mt-4 p-3 bg-white/90 border border-pink-100 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-yellow-500" />
            <span className="text-[11px] text-slate-500">当前佩戴头衔：</span>
            <span className="text-xs font-black text-pink-700">
              {equippedTitle}
            </span>
          </div>
          <span className="text-[10px] text-pink-600 font-mono font-bold bg-pink-50 px-2 py-0.5 rounded-full border border-pink-200">全场景展示中</span>
        </div>

        {/* 进度条 */}
        <div className="mt-3.5 space-y-1.5">
          <div className="flex justify-between text-[10px] font-bold text-slate-500">
            <span>成就总解锁进度</span>
            <span className="text-pink-600 font-mono">{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-pink-100/60 rounded-full overflow-hidden p-0.5 border border-pink-100">
            <div
              className="h-full bg-gradient-to-r from-pink-500 via-rose-500 to-purple-500 rounded-full transition-all duration-500 shadow"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      </section>

      {/* ================= 4 大分类 Filter Tabs ================= */}
      <div className="grid grid-cols-6 gap-1.5 p-1.5 bg-white border border-pink-100/90 rounded-2xl shadow-sm">
        <button
          onClick={() => setActiveCategory('all')}
          className={`col-span-2 w-full py-1.5 px-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
            activeCategory === 'all'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-500 hover:text-pink-600 hover:bg-pink-50/50'
          }`}
        >
          🌟 全部 ({achievements.length})
        </button>
        <button
          onClick={() => setActiveCategory('femboy')}
          className={`col-span-2 w-full py-1.5 px-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
            activeCategory === 'femboy'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-500 hover:text-pink-600 hover:bg-pink-50/50'
          }`}
        >
          🌸 雌堕重塑
        </button>
        <button
          onClick={() => setActiveCategory('hardware')}
          className={`col-span-2 w-full py-1.5 px-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
            activeCategory === 'hardware'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-500 hover:text-pink-600 hover:bg-pink-50/50'
          }`}
        >
          ⚡ 硬件波形
        </button>
        <button
          onClick={() => setActiveCategory('biometrics')}
          className={`col-span-3 w-full py-1.5 px-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
            activeCategory === 'biometrics'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-500 hover:text-pink-600 hover:bg-pink-50/50'
          }`}
        >
          💓 生物心率
        </button>
        <button
          onClick={() => setActiveCategory('dungeon')}
          className={`col-span-3 w-full py-1.5 px-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
            activeCategory === 'dungeon'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-500 hover:text-pink-600 hover:bg-pink-50/50'
          }`}
        >
          🏰 地牢征服
        </button>
      </div>

      {/* ================= 成就列表展示 ================= */}
      <div className="space-y-3">
        {filteredList.map((ach) => {
          const isUnlocked = ach.unlockedAt !== null;
          const isEquipped = equippedTitle === ach.rewardTitle;

          return (
            <div
              key={ach.id}
              className={`p-4 rounded-3xl border transition-all relative overflow-hidden shadow-sm ${
                isUnlocked
                  ? 'bg-gradient-to-br from-white via-pink-50/40 to-white border-pink-200'
                  : 'bg-white/80 border-slate-200/80 opacity-75'
              }`}
            >
              {/* 背景装饰发光 */}
              {isUnlocked && (
                <div className="absolute -right-8 -top-8 w-24 h-24 bg-pink-500/10 rounded-full blur-xl"></div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 border ${
                      isUnlocked
                        ? 'bg-gradient-to-br from-pink-100 to-rose-50 border-pink-200 text-pink-600 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-400 grayscale'
                    }`}
                  >
                    {ach.icon}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4
                        className={`text-xs font-black tracking-wide ${
                          isUnlocked ? 'text-slate-800' : 'text-slate-500'
                        }`}
                      >
                        {ach.title}
                      </h4>
                      {getRarityBadge(ach.rarity)}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed font-sans">{ach.description}</p>
                    <p className="text-[10px] text-pink-600/90 italic pt-0.5">{ach.flavorText}</p>
                    {!isUnlocked && ach.progress && (
                      <div className="pt-1.5">
                        <div className="mb-1 flex items-center justify-between text-[9px] font-bold text-slate-500"><span>当前进度</span><span className="font-mono text-pink-600">{ach.progress.current} / {ach.progress.max}</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-pink-100/60"><div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all" style={{ width: `${Math.min(100, Math.round(ach.progress.current / ach.progress.max * 100))}%` }} /></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  {isUnlocked ? (
                    <span className="flex items-center text-emerald-700 text-xs font-bold gap-1 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 已达成
                    </span>
                  ) : (
                    <span className="flex items-center text-slate-500 text-xs font-medium gap-1 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                      <Lock className="w-3 h-3" /> 未解锁
                    </span>
                  )}
                </div>
              </div>

              {/* 奖励头衔与操作区 */}
              {isUnlocked && (
                <div className="mt-3 pt-3 border-t border-pink-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-yellow-500" />
                    <span className="text-[10px] text-slate-500">专属头衔：</span>
                    <span className="text-xs font-bold text-pink-700">{ach.rewardTitle}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {ach.hiddenRewardVoice && (
                      <button
                        onClick={() => handlePlayVoice(ach)}
                        className="px-2.5 py-1 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 text-[10px] font-bold border border-pink-200 flex items-center gap-1 active:scale-95 transition-all"
                        title="重听成就专属祝贺语音"
                      >
                        <Volume2 className="w-3 h-3 text-pink-500" /> 语音
                      </button>
                    )}
                    <button
                      onClick={() => handleEquip(ach.rewardTitle)}
                      disabled={isEquipped}
                      className={`px-3 py-1 rounded-xl text-[10px] font-bold shadow-sm flex items-center gap-1 active:scale-95 transition-all ${
                        isEquipped
                          ? 'bg-pink-50 text-pink-600 border border-pink-200 opacity-90 cursor-default'
                          : 'bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:opacity-95'
                      }`}
                    >
                      {isEquipped ? '✓ 佩戴中' : '佩戴称号'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
