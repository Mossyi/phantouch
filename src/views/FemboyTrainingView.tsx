import React, { useState, useEffect } from 'react';
import { FemboyTrainingEngine } from '../core/discipline/femboyTrainingEngine';
import { FEMBOY_STAGE_GUIDES } from '../core/discipline/femboyTasksData';
import { FemboyTrainingState, TrainingTask, TrainingStage } from '../types';
import { PRESET_PERSONAS } from '../core/ai/personaPrompts';
import { WardrobeDiaryTab } from '../components/femboy/WardrobeDiaryTab';
import { HypnosisAsmrTab } from '../components/femboy/HypnosisAsmrTab';
import { CertificateTab } from '../components/femboy/CertificateTab';
import { PavlovLabTab } from '../components/femboy/PavlovLabTab';
import { BarbieLabTab } from '../components/femboy/BarbieLabTab';
import { YoloVisionTab } from '../components/femboy/YoloVisionTab';
import { DungeonView } from './DungeonView';
import { useAppStore } from '../store/useAppStore';
import {
  Castle,
  Sparkles,
  Flame,
  Crown,
  Play,
  Pause,
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Brain,
  Clock,
  Shirt,
  Compass,
  Zap,
  Volume2,
  Heart,
  Award,
  Headphones,
  Scroll,
} from 'lucide-react';

export const FemboyTrainingView: React.FC = () => {
  const engine = FemboyTrainingEngine.getInstance();
  const safetyConfig = useAppStore((store) => store.safetyConfig);
  const deviceState = useAppStore((store) => store.deviceState);
  const [state, setState] = useState<FemboyTrainingState>(engine.getState());
  const [activeSubTab, setActiveSubTab] = useState<'lab' | 'pavlov' | 'yolo' | 'asmr' | 'dungeon' | 'camp' | 'wardrobe' | 'contract'>(() => {
    try {
      const sub = new URLSearchParams(window.location.search).get('subtab');
      if (sub && ['lab', 'pavlov', 'yolo', 'asmr', 'dungeon', 'camp', 'wardrobe', 'contract'].includes(sub)) {
        return sub as any;
      }
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab === 'dungeon') {
        return 'dungeon';
      }
    } catch {}
    return 'lab';
  });
  const [selectedStage, setSelectedStage] = useState<TrainingStage>(1);
  const [tasks, setTasks] = useState<TrainingTask[]>(engine.getTasks());
  const [taskCategory, setTaskCategory] = useState<'all' | NonNullable<TrainingTask['category']>>('all');
  const [campHardwareEnabled, setCampHardwareEnabled] = useState(false);
  const [campMessage, setCampMessage] = useState('');

  useEffect(() => {
    const unsub = engine.subscribe((s) => {
      setState({ ...s });
    });
    return () => unsub();
  }, [engine]);

  const activeTask = state.activeSession ? engine.getTaskById(state.activeSession.taskId) : null;

  const getStageTitle = (s: TrainingStage) => {
    return `Stage ${s}: ${FEMBOY_STAGE_GUIDES[s].title}`;
  };

  const getRankBadge = () => {
    const completed = state.completedTaskIds.length;
    if (completed >= 20) {
      return { title: '👑 极乐雌堕之王', color: 'from-pink-500 via-purple-400 to-cyan-400' };
    } else if (completed >= 12) {
      return { title: '🌀 前列腺觉醒者', color: 'from-purple-500 to-pink-500' };
    } else if (completed >= 4) {
      return { title: '👗 蕾丝执事女仆', color: 'from-pink-500 to-rose-400' };
    } else {
      return { title: '💄 见习小男娘', color: 'from-slate-400 to-pink-400' };
    }
  };

  const rank = getRankBadge();
  const allStageTasks = tasks.filter((task) => task.stage === selectedStage);
  const currentStageTasks = allStageTasks.filter((task) => taskCategory === 'all' || task.category === taskCategory);
  const totalCompleted = state.completedTaskIds.length;
  const progressPercent = Math.round((totalCompleted / tasks.length) * 100);
  const categoryOptions: Array<{ id: typeof taskCategory; label: string }> = [
    { id: 'all', label: '全部' }, { id: 'voice', label: '声线' }, { id: 'posture', label: '仪态' },
    { id: 'style', label: '造型' }, { id: 'story', label: '剧情' }, { id: 'mindfulness', label: '感知' }, { id: 'review', label: '复盘' },
  ];

  const startCampTask = (task: TrainingTask) => {
    if (campHardwareEnabled && safetyConfig.emergencyLock) {
      setCampMessage('全局急停锁已开启，不能启动硬件训练。可以关闭本次硬件授权后使用纯剧情模式。');
      return;
    }
    if (campHardwareEnabled && deviceState.connectionMode === 'ble') {
      const needsEms = Boolean(task.hardwareConfig.emsStrengthA || task.hardwareConfig.emsStrengthB || task.hardwareConfig.emsWave);
      const needsToy = Boolean(task.hardwareConfig.toyMotorRate || task.hardwareConfig.toyPattern);
      if (needsEms && !deviceState.devices.ems.isConnected) {
        setCampMessage('该任务包含可选 EMS 提示，但 EMS 尚未连接。');
        return;
      }
      if (needsToy && !deviceState.devices.toy.isConnected) {
        setCampMessage('该任务包含可选马达提示，但榨精机尚未连接。');
        return;
      }
    }
    setCampMessage(campHardwareEnabled ? '已按本次授权启动；输出仍受硬件调控上下限约束。' : '纯剧情指导已启动，不会控制硬件。');
    engine.startTask(task.id, campHardwareEnabled);
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getMentor = (id: string) => {
    return PRESET_PERSONAS.find((p) => p.id === id) || PRESET_PERSONAS[0];
  };

  return (
    <div className="max-w-md mx-auto px-3.5 py-4 pb-10 space-y-4">
      {/* ================= 芭比蜕变实验室与进阶功能导航 (现代苹果流体毛边毛玻璃) ================= */}
      <div className="frosted-feather-glass sticky top-0 z-20 flex gap-1.5 p-1.5 rounded-2xl overflow-x-auto scrollbar-none shadow-sm">
        <button
          onClick={() => setActiveSubTab('lab')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'lab'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>芭比实验室</span>
        </button>
        <button
          onClick={() => setActiveSubTab('pavlov')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'pavlov'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          <span>神经刻印</span>
        </button>
        <button
          onClick={() => setActiveSubTab('yolo')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'yolo'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
          }`}
        >
          <span className="text-sm">👁️</span>
          <span>全视之眼</span>
        </button>
        <button
          onClick={() => setActiveSubTab('asmr')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'asmr'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
          }`}
        >
          <Headphones className="w-3.5 h-3.5" />
          <span>催眠ASMR</span>
        </button>
        <button
          onClick={() => setActiveSubTab('dungeon')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'dungeon'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
          }`}
        >
          <Castle className="w-3.5 h-3.5" />
          <span>地牢</span>
        </button>
        <button
          onClick={() => setActiveSubTab('camp')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'camp'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
          }`}
        >
          <span>🏋️ 特训营</span>
        </button>
        <button
          onClick={() => setActiveSubTab('wardrobe')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'wardrobe'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
          }`}
        >
          <Shirt className="w-3.5 h-3.5" />
          <span>衣橱日记</span>
        </button>
        <button
          onClick={() => setActiveSubTab('contract')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'contract'
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
              : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
          }`}
        >
          <Scroll className="w-3.5 h-3.5" />
          <span>终身契约</span>
        </button>
      </div>

      {/* ================= 视图按 Tab 条件渲染 ================= */}
      {activeSubTab === 'lab' && <BarbieLabTab />}
      {activeSubTab === 'pavlov' && <PavlovLabTab />}
      {activeSubTab === 'yolo' && <YoloVisionTab />}
      {activeSubTab === 'asmr' && <HypnosisAsmrTab />}
      {activeSubTab === 'dungeon' && <DungeonView embedded />}
      {activeSubTab === 'wardrobe' && <WardrobeDiaryTab />}
      {activeSubTab === 'contract' && <CertificateTab />}

      {activeSubTab === 'camp' && (
        <>
          {/* ================= 顶部蜕变等级与荣誉卡片 ================= */}
          <section className="liquid-card p-5 shadow-[0_12px_36px_rgba(233,104,146,0.1)] relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-pink-500/10 rounded-full blur-2xl"></div>
            <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl"></div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-xl shadow-md shadow-pink-500/20 border border-white/80 shrink-0">
                  🌸
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1 truncate">
                    <span className="truncate">雌堕身心重塑特训营</span>
                    <span className="text-[11px] font-bold text-pink-600 shrink-0">（开发中）</span>
                  </h2>
                  <p className="text-[10.5px] text-pink-600 font-bold truncate">4 阶段进阶 · 彻底唤醒深层感知</p>
                </div>
              </div>
              <div className="shrink-0">
                <span className="text-[11px] font-mono font-black text-pink-600 bg-pink-50/80 px-2.5 py-1 rounded-full border border-pink-200 shadow-xs whitespace-nowrap">
                  🔥 打卡 {state.dailyStreak} 天
                </span>
              </div>
            </div>

            {/* 当前蜕变阶位 */}
            <div className="mt-4 p-3 bg-white/90 border border-pink-100 rounded-2xl flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-500" />
                <span className="text-[11px] text-slate-600 font-medium">当前蜕变阶位：</span>
                <span className={`text-xs font-black text-transparent bg-clip-text bg-gradient-to-r ${rank.color}`}>
                  {rank.title}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono font-bold">累计 {state.totalTrainingMinutes} 分钟</span>
            </div>

            {/* 总进度条 */}
            <div className="mt-3.5 space-y-1.5">
              <div className="flex justify-between text-[10px] font-bold text-slate-600">
                <span>4 阶段通关进度 ({totalCompleted} / {tasks.length})</span>
                <span className="text-pink-600 font-mono font-black">{progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-pink-100/60 rounded-full overflow-hidden p-0.5 border border-pink-100">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 via-purple-500 to-rose-400 rounded-full transition-all duration-500 shadow"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          </section>

          <section className="liquid-card p-4">
            <div className="flex items-center justify-between"><div><h3 className="text-xs font-black text-[#263247]">四阶段成长路线</h3><p className="mt-1 text-[9px] text-slate-500">每阶段 6 项任务，完成任意 4 项即可进阶。</p></div><span className="rounded-full bg-pink-50 px-2 py-1 text-[9px] font-black text-pink-600">当前 Stage {state.currentStage}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2">{([1, 2, 3, 4] as TrainingStage[]).map((stage) => { const guide = FEMBOY_STAGE_GUIDES[stage]; const completed = tasks.filter((task) => task.stage === stage && state.completedTaskIds.includes(task.id)).length; const unlocked = stage <= state.currentStage; return <button key={stage} type="button" disabled={!unlocked} onClick={() => unlocked && setSelectedStage(stage)} className={`rounded-2xl border p-3 text-left transition-all ${selectedStage === stage ? 'border-pink-400 bg-pink-50 shadow-xs' : unlocked ? 'border-pink-100 bg-white hover:border-pink-200' : 'border-slate-200 bg-slate-50 opacity-60'}`}><span className="flex items-center justify-between"><b className="text-[10px] text-[#263247]">Stage {stage}</b><span className="text-[9px] font-black text-pink-600">{completed}/6</span></span><span className="mt-1 block text-[10px] font-black text-[#475569]">{guide.title}</span><span className="mt-1 block text-[8px] leading-relaxed text-slate-500">{guide.objective}</span><span className="mt-2 block text-[8px] font-bold text-slate-400">{unlocked ? guide.unlockText : `完成 Stage ${stage - 1} 的 4 项任务后解锁`}</span></button>; })}</div>
          </section>

          <section className="liquid-card p-3 border-emerald-200/80 bg-emerald-50/50">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black text-emerald-900">本次训练模式</p><p className="mt-1 text-[9px] leading-relaxed text-emerald-800">默认纯剧情。硬件授权只对接下来启动的一项任务有效，仍受全局上下限和急停锁约束。</p></div><label className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 text-[9px] font-black text-emerald-800 border border-emerald-200 shadow-xs"><input type="checkbox" checked={campHardwareEnabled} onChange={(event) => { setCampHardwareEnabled(event.target.checked); setCampMessage(''); }} className="accent-emerald-600" />硬件</label></div>
            {campMessage && <p className="mt-2 rounded-xl bg-white/90 px-2.5 py-2 text-[9px] font-bold leading-relaxed text-slate-700 border border-emerald-100">{campMessage}</p>}
          </section>

          {/* ================= 沉浸式进行中特训面板 ================= */}
          {state.activeSession && activeTask && (
            <section className="liquid-card-selected p-5 space-y-4 animate-in zoom-in-95 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-pink-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-ping"></span>
                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span>正在执行：{activeTask.title}</span>
                  </h3>
                </div>
                <span className="text-[10px] text-pink-600 font-mono bg-pink-50 px-2.5 py-0.5 rounded-full border border-pink-200">
                  Stage {activeTask.stage}
                </span>
              </div>

              {/* 倒计时大时钟 */}
              <div className="text-center py-2">
                <div className="text-4xl font-black font-mono tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-pink-600 via-rose-500 to-purple-600 animate-pulse">
                  {formatSec(state.activeSession.remainingSeconds)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 font-sans">
                  {state.activeSession.isPaused ? '⏸️ 特训已暂停，输出已归零' : state.activeSession.hardwareEnabled ? '⚡ 本次已授权硬件提示' : '📝 纯剧情指导 · 不控制硬件'}
                </p>
              </div>

              <div className="rounded-2xl border border-pink-200/70 bg-pink-50/40 p-3"><p className="text-[10px] font-black text-pink-700">本项任务清单</p><ol className="mt-2 space-y-1 text-[10px] leading-relaxed text-slate-600">{(activeTask.steps || ['确认环境、安全词与停止方式', '按当前指导完成主要练习', '记录感受并决定是否复训']).map((step, index) => <li key={`${index}-${step}`}>{index + 1}. {step}</li>)}</ol></div>

              {/* 导师指示与当前 Tip */}
              <div className="bg-white/90 border border-pink-100 rounded-2xl p-3 flex items-start gap-2.5 shadow-sm">
                <span className="text-2xl shrink-0">{getMentor(activeTask.mentorPersonaId).avatar}</span>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-pink-600">
                    {getMentor(activeTask.mentorPersonaId).name} 的实时指导：
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed font-sans">
                    {state.activeSession.currentTip}
                  </p>
                </div>
              </div>

              {/* 体态与服装要求 */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-white/80 p-2.5 rounded-xl border border-pink-100 shadow-sm">
                  <span className="text-slate-500 flex items-center gap-1 mb-0.5">
                    <Shirt className="w-3 h-3 text-pink-500" /> 着装要求
                  </span>
                  <span className="text-slate-800 font-bold">{activeTask.clothingRequirement}</span>
                </div>
                <div className="bg-white/80 p-2.5 rounded-xl border border-pink-100 shadow-sm">
                  <span className="text-slate-500 flex items-center gap-1 mb-0.5">
                    <Compass className="w-3 h-3 text-rose-500" /> 姿态要求
                  </span>
                  <span className="text-slate-800 font-bold">{activeTask.postureRequirement}</span>
                </div>
              </div>

              {/* 操作按钮组 */}
              <div className="flex gap-2 pt-1">
                {state.activeSession.isPaused ? (
                  <button
                    onClick={() => engine.resumeTask()}
                    className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold shadow flex items-center justify-center gap-1 active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5" /> 继续特训
                  </button>
                ) : (
                  <button
                    onClick={() => engine.pauseTask()}
                    className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 flex items-center justify-center gap-1 active:scale-95"
                  >
                    <Pause className="w-3.5 h-3.5" /> 暂停休整
                  </button>
                )}

                <button
                  onClick={() => engine.completeTask()}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-bold shadow-md shadow-pink-500/20 flex items-center justify-center gap-1 active:scale-95"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> 完成特训
                </button>

                <button
                  onClick={() => engine.abortTask()}
                  className="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold border border-rose-200 hover:bg-rose-100 flex items-center justify-center gap-1 active:scale-95"
                  title="放弃特训并急停"
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> 放弃
                </button>
              </div>
            </section>
          )}

          {/* ================= 4 大阶段 Tabs 切换 ================= */}
          <div className="frosted-feather-glass flex gap-1.5 p-1.5 rounded-2xl overflow-x-auto scrollbar-none shadow-xs">
            {[1, 2, 3, 4].map((stg) => {
              const isUnlocked = stg <= state.currentStage || stg === 1;
              const isActive = selectedStage === stg;

              return (
                <button
                  key={stg}
                  disabled={!isUnlocked}
                  onClick={() => {
                    if (isUnlocked) setSelectedStage(stg as TrainingStage);
                  }}
                  className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1 ${
                    isActive
                      ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
                      : !isUnlocked
                      ? 'cursor-not-allowed bg-slate-50 text-slate-400 opacity-60 border border-slate-100'
                      : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
                  }`}
                >
                  {!isUnlocked && <Lock className="w-3 h-3 text-slate-400" />}
                  <span>Stage {stg}</span>
                </button>
              );
            })}
          </div>

          <div className="frosted-feather-glass flex gap-1.5 overflow-x-auto rounded-2xl p-1.5 scrollbar-none shadow-xs">{categoryOptions.map((option) => <button type="button" key={option.id} onClick={() => setTaskCategory(option.id)} className={`shrink-0 rounded-xl px-3 py-1.5 text-[9px] font-black transition-all ${taskCategory === option.id ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm' : 'bg-white/70 text-slate-600 hover:bg-white'}`}>{option.label}</button>)}</div>

          {/* 当前选定阶段标题 */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              {getStageTitle(selectedStage)}
            </h3>
            <span className="text-[10px] text-slate-500 font-bold">
              已完成 {allStageTasks.filter((t) => state.completedTaskIds.includes(t.id)).length} / {allStageTasks.length}
            </span>
          </div>

          {/* ================= 阶段任务卡片列表 ================= */}
          <div className="space-y-3">
            {currentStageTasks.length === 0 && <div className="liquid-card p-6 text-center text-[10px] text-slate-500">本阶段暂无该类型任务，切换“全部”查看完整任务单。</div>}
            {currentStageTasks.map((task) => {
              const isCompleted = state.completedTaskIds.includes(task.id);
              const isRunning = state.activeSession?.taskId === task.id;
              const mentor = getMentor(task.mentorPersonaId);

              return (
                <div
                  key={task.id}
                  className={`p-4 transition-all relative overflow-hidden ${
                    isRunning
                      ? 'liquid-card-selected shadow-[0_8px_24px_rgba(233,104,146,0.18)]'
                      : isCompleted
                      ? 'liquid-card border-emerald-200/90'
                      : 'liquid-card'
                  }`}
                >
                  {/* 卡片头部 */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-100 to-rose-50 border border-white flex items-center justify-center text-2xl shrink-0 shadow-xs">
                        {task.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-black text-slate-800">{task.title}</h4>
                          <span className="text-[10px] font-mono text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full border border-pink-200">
                            ⏱️ {task.durationMinutes} 分钟
                          </span>
                        </div>
                        <p className="text-[11px] text-pink-600 font-medium font-sans mt-0.5">{task.subtitle}</p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isCompleted ? (
                        <span className="flex items-center text-emerald-700 text-xs font-bold gap-1 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 已通关
                        </span>
                      ) : isRunning ? (
                        <span className="flex items-center text-pink-600 text-xs font-bold gap-1 bg-pink-50 px-2.5 py-0.5 rounded-full border border-pink-300 animate-pulse">
                          <Flame className="w-3.5 h-3.5" /> 进行中
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* 导师与体态说明 */}
                  <div className="mt-3 p-3 bg-pink-50/40 rounded-2xl border border-pink-100 space-y-1.5 text-[10px]">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="flex items-center gap-1">
                        <span>指导导师：</span>
                        <span className="text-slate-800 font-bold flex items-center gap-1">
                          <span>{mentor.avatar}</span> {mentor.name}
                        </span>
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">{Object.keys(task.hardwareConfig).length ? '硬件可选' : '纯剧情'}</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed font-sans">
                      {task.description}
                    </p>
                    <div className="pt-1.5 border-t border-pink-100 flex items-center justify-between text-[9.5px] text-slate-500">
                      <span>👗 {task.clothingRequirement}</span>
                      <span>🧘 {task.postureRequirement}</span>
                    </div>
                    <div className="border-t border-pink-100 pt-2"><p className="text-[9px] font-black text-pink-600">三步任务</p><ol className="mt-1 space-y-0.5 text-[9px] leading-relaxed text-slate-500">{(task.steps || ['确认环境、安全词与停止方式', '按任务描述完成主要练习', '记录一次感受并决定是否复训']).map((step, index) => <li key={`${index}-${step}`}>{index + 1}. {step}</li>)}</ol>{task.reflectionPrompt && <p className="mt-2 rounded-lg bg-pink-50 px-2.5 py-1.5 text-[9px] text-pink-700 border border-pink-100">复盘：{task.reflectionPrompt}</p>}</div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="mt-3 flex justify-end">
                    {isRunning ? (
                      <button
                        onClick={() => engine.abortTask()}
                        className="px-4 py-1.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold border border-rose-200 hover:bg-rose-100 active:scale-95 transition-all"
                      >
                        中断特训
                      </button>
                    ) : (
                      <button
                        onClick={() => startCampTask(task)}
                        className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 active:scale-95 transition-all"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{isCompleted ? '再次复训' : '开始特训'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
