import React, { useEffect, useRef, useState } from 'react';
import { BountyQuestEngine, BountyProfile, BountyQuest } from '../../core/tavern/bountyQuestEngine';
import { HapticEngine } from '../../core/haptics/hapticEngine';
import { Award, CheckCircle2, Flame, LockKeyhole, ScrollText, Sparkles, Target, Trophy, Zap } from 'lucide-react';

export const TavernQuestsTab: React.FC = () => {
  const engine = BountyQuestEngine.getInstance();
  const [quests, setQuests] = useState<BountyQuest[]>(engine.getQuests());
  const [profile, setProfile] = useState<BountyProfile>(engine.getProfile());
  const [claimedNotice, setClaimedNotice] = useState<string | null>(null);
  // 提示条自动消失的定时器：卸载时清理，并在新提示到来时重置，避免上一条的定时器提前清掉新提示。
  const noticeTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showClaimedNotice = (message: string, delay: number) => {
    setClaimedNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setClaimedNotice(null);
    }, delay);
  };

  const refreshBoard = () => {
    setQuests(engine.getQuests());
    setProfile(engine.getProfile());
  };

  const handleAccept = (id: string) => {
    HapticEngine.light();
    if (engine.acceptQuest(id)) {
      refreshBoard();
    } else {
      showClaimedNotice('当前等级尚未达到该悬赏的接取条件。', 2500);
    }
  };

  const handleClaim = (id: string) => {
    HapticEngine.successTada();
    const reward = engine.claimReward(id);
    if (reward) {
      refreshBoard();
      const msg = `🎉 领取悬赏：+${reward.exp} EXP${reward.title ? `，获得 ${reward.title}` : ''}。当前 Lv.${reward.level} · ${reward.rankTitle}。`;
      showClaimedNotice(msg, 4000);
    }
  };

  return (
    <div className="space-y-4">
      {/* 顶部悬赏横幅 */}
      <section className="liquid-card relative overflow-hidden p-5 shadow-[0_12px_36px_rgba(245,158,11,0.08)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-100 to-pink-100 border border-white flex items-center justify-center text-2xl shadow-xs">
              🎯
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <span>冒险家悬赏布告栏 (Bounty Board)</span>
              </h3>
              <p className="text-[10.5px] text-amber-900 font-medium">完成酒馆极限特训与身心重塑任务，赢取稀有头衔与经验</p>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-amber-200/70 bg-white/80 p-3 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 text-xs font-black text-white shadow-xs">Lv.{profile.level}</div>
              <div><p className="text-xs font-black text-amber-900">{profile.rankTitle}</p><p className="text-[9px] text-slate-500 font-medium">已领取 {profile.completedQuestCount} 条悬赏 · {profile.exp} EXP</p></div>
            </div>
            <Trophy className="h-5 w-5 text-amber-500" />
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-amber-100/70"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-pink-500 transition-all" style={{ width: `${profile.progressToNextLevel}%` }} /></div>
          <p className="mt-1.5 text-[9px] text-slate-500 font-medium">{profile.nextLevelExp ? `距离 Lv.${profile.level + 1} 还需 ${Math.max(0, profile.nextLevelExp - profile.exp)} EXP` : '已达到当前悬赏体系最高等级'}</p>
        </div>
      </section>

      {/* 领取悬赏浮动通知 */}
      {claimedNotice && (
        <div className="p-3 bg-emerald-50/95 border border-emerald-300 rounded-2xl text-xs text-emerald-800 font-bold shadow-xl animate-bounce flex items-center gap-2 backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>{claimedNotice}</span>
        </div>
      )}

      {/* 悬赏列表 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black text-slate-800">
            酒馆悬赏令 ({quests.length})
          </span>
          <span className="text-[10px] text-slate-500 font-mono font-bold">
            进度按实际功能事件同步
          </span>
        </div>

        <div className="space-y-3">
          {quests.map((q) => {
            const isCompleted = q.status === 'completed';
            const isClaimable = q.status === 'claimable';
            const isInProgress = q.status === 'in_progress';
            const isLocked = q.status === 'available' && profile.level < q.requiredLevel;
            const progressPercent = Math.min(100, Math.round((q.currentCount / q.targetCount) * 100));

            return (
              <div
                key={q.id}
                className={`p-4 transition-all space-y-2.5 relative overflow-hidden ${
                  isCompleted
                    ? 'liquid-card opacity-65'
                    : isClaimable
                    ? 'liquid-card-selected border-amber-300 shadow-md'
                    : 'liquid-card hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-xs font-black text-slate-800 truncate">{q.title}</h4>
                      <span className="liquid-chip px-2 py-0.5 text-[9px] text-amber-800 shrink-0">
                        {q.tag}
                      </span>
                      <span className="liquid-chip px-2 py-0.5 text-[9px] text-cyan-800 shrink-0">Lv.{q.requiredLevel}</span>
                    </div>

                    <p className="text-[10.5px] text-slate-600 leading-relaxed font-sans">{q.description}</p>
                  </div>

                  <div className="text-[10px] font-mono font-bold text-amber-700 shrink-0">
                    难度: {q.difficulty}
                  </div>
                </div>

                {/* 进度条 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[9.5px] text-slate-500 font-mono">
                    <span>进度: {q.currentCount} / {q.targetCount}</span>
                    <span className="font-bold text-pink-600">{progressPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-pink-50 overflow-hidden border border-pink-100">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-pink-500 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* 奖励与操作 */}
                <div className="pt-2 border-t border-pink-50 flex items-center justify-between">
                  <div className="text-[10px] text-pink-700 font-bold flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                    <span>奖励: +{q.rewardExp} EXP {q.rewardTitle ? `| 头衔: ${q.rewardTitle}` : ''}</span>
                  </div>

                  <div>
                    {isCompleted && (
                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>已完成</span>
                      </span>
                    )}

                    {isClaimable && (
                      <button
                        onClick={() => handleClaim(q.id)}
                        className="liquid-btn px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-rose-500 to-pink-500 text-white font-black text-xs shadow-md shadow-pink-500/25 animate-pulse active:scale-95 transition-all"
                      >
                        🎁 领取赏金
                      </button>
                    )}

                    {isInProgress && (
                      <span className="liquid-chip text-[10px] font-mono text-cyan-700 font-bold px-2.5 py-0.5">
                        ⚡ 挑战进行中
                      </span>
                    )}

                    {q.status === 'available' && (
                      isLocked ? (
                        <span className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-400"><LockKeyhole className="h-3 w-3" />Lv.{q.requiredLevel} 解锁</span>
                      ) : (
                        <button
                          onClick={() => handleAccept(q.id)}
                          className="liquid-btn px-3 py-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 text-white text-xs font-black shadow-xs active:scale-95"
                        >
                          接取悬赏
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
