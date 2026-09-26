import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Heart,
  Shield,
  Zap,
  Flame,
  ChevronDown,
  ChevronUp,
  Sliders,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  TavernCharacterStats,
  normalizeCharacterStats,
  getFavorStage,
  getObedienceStage,
} from '../../core/tavern/tavernStatusHud';

interface TavernStatusHudBarProps {
  characterName: string;
  stats: TavernCharacterStats;
  onUpdateStats: (newStats: TavernCharacterStats) => void;
  onResetStats: () => void;
}

export const TavernStatusHudBar: React.FC<TavernStatusHudBarProps> = ({
  characterName,
  stats,
  onUpdateStats,
  onResetStats,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [draftStats, setDraftStats] = useState<TavernCharacterStats>(stats);

  const handleOpenEdit = () => {
    setDraftStats(stats);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    onUpdateStats(normalizeCharacterStats(draftStats));
    setShowEditModal(false);
  };

  React.useEffect(() => {
    if (!showEditModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowEditModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showEditModal]);

  return (
    <div className="relative z-10 w-full px-3 pt-1.5 pb-0.5 select-none transition-all">
      <div className="liquid-glass liquid-specular overflow-hidden rounded-2xl">
        {/* 紧凑状态栏 (Collapsed Strip) */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-[10px] text-slate-700 hover:bg-pink-50/40 transition"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto no-scrollbar">
            <span className="flex items-center gap-1 font-bold text-pink-600 shrink-0">
              <Heart className="h-3 w-3 fill-pink-500 text-pink-500" />
              <span>好感 {stats.favor}%</span>
            </span>

            <span className="flex items-center gap-1 font-bold text-violet-600 shrink-0">
              <Shield className="h-3 w-3 fill-violet-500 text-violet-500" />
              <span>服从 {stats.obedience}%</span>
            </span>

            <span className="flex items-center gap-1 font-bold text-cyan-600 shrink-0">
              <Zap className="h-3 w-3 fill-cyan-500 text-cyan-500" />
              <span>快感 {stats.arousal}%</span>
            </span>

            <span className="flex items-center gap-1 font-bold text-rose-600 shrink-0">
              <Flame className="h-3 w-3 fill-rose-500 text-rose-500" />
              <span>羞耻 {stats.shame}%</span>
            </span>

            {stats.mood && (
              <span className="shrink-0 rounded-full border border-pink-200/80 bg-gradient-to-r from-pink-50 via-rose-50 to-pink-50 px-2 py-0.5 text-[9px] font-bold text-pink-700 shadow-2xs flex items-center gap-1">
                <span>{stats.arousal >= 60 ? '🔥' : stats.shame >= 50 ? '😳' : stats.favor >= 60 ? '💖' : '💭'}</span>
                <span>{stats.mood}</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            aria-label={isExpanded ? '收起属性栏' : '展开属性栏'}
            className="rounded-lg p-0.5 text-slate-400 hover:bg-pink-50 hover:text-pink-600 transition shrink-0"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* 展开详细属性卡 (Expanded Sheet) */}
        {isExpanded && (
          <div className="border-t border-pink-100/80 px-4 pt-3 pb-3 space-y-3 bg-white/60">
            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* 好感度 */}
              <div>
                <div className="flex justify-between mb-1 text-[11px]">
                  <span className="flex items-center gap-1 font-bold text-pink-600">
                    <Heart className="h-3 w-3 fill-pink-500 text-pink-500" />
                    好感度（{getFavorStage(stats.favor)}）
                  </span>
                  <span className="font-mono font-bold text-pink-600">{stats.favor}/100</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-pink-50 border border-pink-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-500 shadow-xs transition-all duration-500"
                    style={{ width: `${stats.favor}%` }}
                  />
                </div>
              </div>

              {/* 服从度 */}
              <div>
                <div className="flex justify-between mb-1 text-[11px]">
                  <span className="flex items-center gap-1 font-bold text-violet-600">
                    <Shield className="h-3 w-3 fill-violet-500 text-violet-500" />
                    服从度（{getObedienceStage(stats.obedience)}）
                  </span>
                  <span className="font-mono font-bold text-violet-600">{stats.obedience}/100</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-violet-50 border border-violet-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-600 shadow-xs transition-all duration-500"
                    style={{ width: `${stats.obedience}%` }}
                  />
                </div>
              </div>

              {/* 快感度 */}
              <div>
                <div className="flex justify-between mb-1 text-[11px]">
                  <span className="flex items-center gap-1 font-bold text-cyan-600">
                    <Zap className="h-3 w-3 fill-cyan-500 text-cyan-500" />
                    快感 / 兴奋度
                  </span>
                  <span className="font-mono font-bold text-cyan-600">{stats.arousal}/100</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-cyan-50 border border-cyan-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-500 shadow-xs transition-all duration-500"
                    style={{ width: `${stats.arousal}%` }}
                  />
                </div>
              </div>

              {/* 羞耻度 */}
              <div>
                <div className="flex justify-between mb-1 text-[11px]">
                  <span className="flex items-center gap-1 font-bold text-rose-600">
                    <Flame className="h-3 w-3 fill-rose-500 text-rose-500" />
                    羞耻 / 动摇度
                  </span>
                  <span className="font-mono font-bold text-rose-600">{stats.shame}/100</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-rose-50 border border-rose-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-400 to-red-500 shadow-xs transition-all duration-500"
                    style={{ width: `${stats.shame}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 底部功能条 */}
            <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="h-3.5 w-3.5 text-pink-500 animate-pulse shrink-0" />
                <span className="shrink-0 font-medium">角色心境：</span>
                <span className="truncate font-bold text-pink-700 bg-gradient-to-r from-pink-50 via-rose-50 to-pink-100/70 border border-pink-200/80 px-2.5 py-0.5 rounded-full shadow-2xs text-[10px] inline-flex items-center gap-1">
                  <span>{stats.arousal >= 60 ? '🔥' : stats.shame >= 50 ? '😳' : stats.favor >= 60 ? '💖' : '💋'}</span>
                  <span className="truncate">{stats.mood || '微怯初见'}</span>
                </span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="flex items-center gap-1 rounded-lg border border-pink-100 bg-white px-2 py-1 text-slate-600 hover:bg-pink-50 hover:text-pink-600 transition"
                >
                  <Sliders className="h-3 w-3 text-pink-500" />
                  微调
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`确定要重置【${characterName}】的好感与服从状态吗？`)) {
                      onResetStats();
                    }
                  }}
                  className="flex items-center gap-1 rounded-lg border border-pink-100 bg-white px-2 py-1 text-slate-600 hover:bg-rose-50 hover:text-rose-500 transition"
                >
                  <RotateCcw className="h-3 w-3 text-rose-500" />
                  重置
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 手动微调弹窗 (通过 Portal 挂载至 document.body，避免被消息流与外层容器 stacking context 遮挡) */}
      {showEditModal && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowEditModal(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm pointer-events-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm max-h-[88vh] flex flex-col rounded-3xl border border-pink-200 bg-white p-5 shadow-2xl space-y-3.5 select-auto"
          >
            <div className="flex items-center justify-between border-b border-pink-100 pb-2 shrink-0">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 min-w-0 pr-2">
                <Sliders className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                <span className="truncate">微调【{characterName}】当前状态</span>
                <span className="text-[10px] font-bold text-pink-600 shrink-0">（开发中）</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 transition shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-3 text-xs overflow-y-auto flex-1 pr-1">
              <div>
                <div className="flex justify-between items-center mb-1 text-[10px] text-pink-600 font-bold">
                  <span>💖 好感度</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draftStats.favor}
                      onChange={(e) => setDraftStats({ ...draftStats, favor: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className="w-11 text-right bg-pink-50 border border-pink-200 rounded px-1 py-0.5 text-[10px] font-mono font-bold text-pink-600 outline-none focus:bg-white focus:border-pink-400"
                    />
                    <span className="text-[10px] text-pink-500">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draftStats.favor}
                  onChange={(e) => setDraftStats({ ...draftStats, favor: Number(e.target.value) })}
                  className="w-full accent-pink-500 h-1.5 bg-pink-100 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1 text-[10px] text-violet-600 font-bold">
                  <span>⛓️ 服从度</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draftStats.obedience}
                      onChange={(e) => setDraftStats({ ...draftStats, obedience: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className="w-11 text-right bg-violet-50 border border-violet-200 rounded px-1 py-0.5 text-[10px] font-mono font-bold text-violet-600 outline-none focus:bg-white focus:border-violet-400"
                    />
                    <span className="text-[10px] text-violet-500">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draftStats.obedience}
                  onChange={(e) => setDraftStats({ ...draftStats, obedience: Number(e.target.value) })}
                  className="w-full accent-violet-500 h-1.5 bg-violet-100 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1 text-[10px] text-cyan-700 font-bold">
                  <span>⚡ 快感度</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draftStats.arousal}
                      onChange={(e) => setDraftStats({ ...draftStats, arousal: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className="w-11 text-right bg-cyan-50 border border-cyan-200 rounded px-1 py-0.5 text-[10px] font-mono font-bold text-cyan-700 outline-none focus:bg-white focus:border-cyan-400"
                    />
                    <span className="text-[10px] text-cyan-600">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draftStats.arousal}
                  onChange={(e) => setDraftStats({ ...draftStats, arousal: Number(e.target.value) })}
                  className="w-full accent-cyan-500 h-1.5 bg-cyan-100 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1 text-[10px] text-rose-600 font-bold">
                  <span>😳 羞耻度</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draftStats.shame}
                      onChange={(e) => setDraftStats({ ...draftStats, shame: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className="w-11 text-right bg-rose-50 border border-rose-200 rounded px-1 py-0.5 text-[10px] font-mono font-bold text-rose-600 outline-none focus:bg-white focus:border-rose-400"
                    />
                    <span className="text-[10px] text-rose-500">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draftStats.shame}
                  onChange={(e) => setDraftStats({ ...draftStats, shame: Number(e.target.value) })}
                  className="w-full accent-rose-500 h-1.5 bg-rose-100 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <label className="block mb-1 text-[10px] text-slate-600 font-bold">
                  💭 角色当前心境短语
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={draftStats.mood || ''}
                  onChange={(e) => setDraftStats({ ...draftStats, mood: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit();
                    }
                  }}
                  placeholder="如：身酥骨软·情热泛滥、娇喘动情·面赤心跳"
                  className="w-full rounded-xl border border-pink-100 bg-slate-50/60 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                />
                <div className="mt-2 space-y-1">
                  <span className="text-[9px] text-pink-600 font-bold block">✨ 快捷色气心境标签（点击直接填入）：</span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      '身酥骨软·情热泛滥',
                      '娇喘动情·面赤心跳',
                      '媚眼含春·暗自渴求',
                      '温驯求宠·任君摆布',
                      '羞耻难抑·泛滥微颤',
                      '轻咬下唇·渴求更多',
                      '呼吸急促·暗颤沉沦',
                      '欲迎还羞·极度敏感',
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setDraftStats({ ...draftStats, mood: tag })}
                        className={`text-[9px] px-2 py-0.5 rounded-full border transition-all active:scale-95 ${
                          draftStats.mood === tag
                            ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border-pink-500 shadow-xs'
                            : 'bg-pink-50/70 text-pink-700 border-pink-200/80 hover:bg-pink-100/70'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-pink-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition active:scale-95"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm shadow-pink-500/20 active:scale-95"
              >
                保存状态
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
