import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { DUNGEON_SCRIPTS } from '../core/dungeon/dungeonData';
import { DungeonEndingType, DungeonHardwareMode, DungeonRunState, DungeonScript, DungeonStep, DungeonChoice } from '../types';
import { DeviceManager } from '../core/deviceManager';
import { TTSManager } from '../core/voice/ttsManager';
import { AchievementEngine } from '../core/achievements/achievementEngine';
import { HapticEngine } from '../core/haptics/hapticEngine';
import { DungeonManualSlot, DungeonSaveManager, DungeonSaveRecord } from '../core/dungeon/dungeonSaveManager';
import { DungeonAIEngine } from '../core/dungeon/dungeonAIEngine';
import { DungeonRecycleItem, DungeonScriptLibrary } from '../core/dungeon/dungeonScriptLibrary';
import {
  applyDungeonChoice,
  buildDungeonEnding,
  DEFAULT_DUNGEON_RUN_STATE,
  describeDungeonRoute,
  getPlayableDungeonChoices,
  incrementDungeonAiChapter,
} from '../core/dungeon/dungeonRunState';
import { DUNGEON_NARRATOR_VOICE, getDungeonCharacterVoice } from '../core/dungeon/dungeonVoice';
import {
  Castle,
  Sparkles,
  Flame,
  Volume2,
  RotateCcw,
  ArrowRight,
  ShieldAlert,
  Trophy,
  Heart,
  Zap,
  Play,
  BookmarkCheck,
  CheckCircle2,
  History,
  Send,
  Wand2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Compass,
  Save,
  FolderOpen,
  Library,
  ShieldCheck,
  MonitorPlay,
  Trash2,
} from 'lucide-react';

export const DungeonView: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const { triggerEmergencyStop, safetyConfig, deviceState } = useAppStore();

  const [activeCategory, setActiveCategory] = useState<'all' | 'femboy' | 'classic'>('all');
  const [currentScript, setCurrentScript] = useState<DungeonScript | null>(null);
  const [currentStepId, setCurrentStepId] = useState<string>('step_1');
  const [currentEnding, setCurrentEnding] = useState<{ title: string; desc: string; type: DungeonEndingType } | null>(null);
  const [lastActionText, setLastActionText] = useState<string | null>(null);
  const [hardwareMode, setHardwareMode] = useState<DungeonHardwareMode>('text');
  const [runState, setRunState] = useState<DungeonRunState>({ ...DEFAULT_DUNGEON_RUN_STATE });
  const [showEndingGallery, setShowEndingGallery] = useState(false);
  const [saveUiVersion, setSaveUiVersion] = useState(0);
  const [customScripts, setCustomScripts] = useState<DungeonScript[]>(() =>
    DungeonScriptLibrary.getInstance().getCustomScripts()
  );
  const [recycleBin, setRecycleBin] = useState<DungeonRecycleItem[]>(() =>
    DungeonScriptLibrary.getInstance().getRecycleBin()
  );
  const [permanentlyDeletedBuiltinIds, setPermanentlyDeletedBuiltinIds] = useState<string[]>(() =>
    DungeonScriptLibrary.getInstance().getPermanentlyDeletedBuiltinIds()
  );
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [showAiCreator, setShowAiCreator] = useState(false);
  const [aiCreatorPrompt, setAiCreatorPrompt] = useState('');
  const [isAiCreating, setIsAiCreating] = useState(false);
  const [aiCreatorMessage, setAiCreatorMessage] = useState<string | null>(null);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);

  // AI 动态长篇推演与自定义输入状态
  const [isAiExpanding, setIsAiExpanding] = useState<boolean>(false);
  const [customActionInput, setCustomActionInput] = useState<string>('');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [promptResumeScript, setPromptResumeScript] = useState<{ script: DungeonScript; save: DungeonSaveRecord } | null>(null);
  const viewGenerationRef = useRef(0);
  const aiRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    viewGenerationRef.current += 1;
    aiRequestRef.current?.abort();
    aiRequestRef.current = null;
    TTSManager.getInstance().stop();
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
  }, []);

  // 本地多存档管理器与结局
  const [allSaves, setAllSaves] = useState<Record<string, DungeonSaveRecord>>(() =>
    DungeonSaveManager.getInstance().getAllSaves()
  );
  const [unlockedEndings, setUnlockedEndings] = useState<Record<string, string[]>>(() =>
    DungeonSaveManager.getInstance().getUnlockedEndings()
  );

  const deletedBuiltinIds = recycleBin.filter((item) => item.isBuiltin).map((item) => item.scriptId);
  const visibleBuiltinScripts = DUNGEON_SCRIPTS.filter((script) => (
    !deletedBuiltinIds.includes(script.id) && !permanentlyDeletedBuiltinIds.includes(script.id)
  ));
  const allScripts = [...customScripts, ...visibleBuiltinScripts];
  const lastActiveScriptId = DungeonSaveManager.getInstance().getLastActiveScriptId();
  const lastActiveSave = lastActiveScriptId ? allSaves[lastActiveScriptId] : null;
  const lastActiveScript = lastActiveScriptId ? allScripts.find((s) => s.id === lastActiveScriptId) : null;

  // 刷新存档状态
  const refreshSaves = () => {
    setAllSaves(DungeonSaveManager.getInstance().getAllSaves());
    setUnlockedEndings(DungeonSaveManager.getInstance().getUnlockedEndings());
    setSaveUiVersion((version) => version + 1);
  };

  const filteredScripts = allScripts.filter((s) => {
    if (activeCategory === 'femboy') return s.isFemboy;
    if (activeCategory === 'classic') return !s.isFemboy;
    return true;
  });
  const femboyScriptCount = allScripts.filter((script) => script.isFemboy).length;
  const classicScriptCount = allScripts.length - femboyScriptCount;

  // 点击剧本卡片逻辑
  const handleClickScriptCard = (script: DungeonScript) => {
    const existingSave = allSaves[script.id];
    if (existingSave && existingSave.currentStepId && existingSave.currentStepId !== script.initialStepId) {
      // 存在已有进度，弹窗让用户自由选择：继续上次阅读 或 重新开始
      setPromptResumeScript({ script, save: existingSave });
    } else {
      handleStartScript(script, script.initialStepId);
    }
  };

  // 正式开启剧本阅读
  const handleStartScript = (script: DungeonScript, targetStepId: string) => {
    viewGenerationRef.current += 1;
    aiRequestRef.current?.abort();
    aiRequestRef.current = null;
    setIsAiExpanding(false);
    HapticEngine.light();
    setCurrentScript(script);
    setCurrentStepId(targetStepId);
    setCurrentEnding(null);
    setLastActionText(null);
    setShowHistoryDrawer(false);
    setPromptResumeScript(null);
    setHardwareMode('text');
    const saved = DungeonSaveManager.getInstance().getSave(script.id);
    const nextRunState = targetStepId === script.initialStepId && saved?.currentStepId !== targetStepId
      ? { ...DEFAULT_DUNGEON_RUN_STATE }
      : saved?.runState || { ...DEFAULT_DUNGEON_RUN_STATE };
    setRunState(nextRunState);

    // 获取当前 step 节点（支持静态与 AI 动态创建的节点）
    const step = getStepById(script, targetStepId);
    if (step) {
      // 立即持久化记录位置
      const totalSteps = Object.keys(script.steps).length;
      DungeonSaveManager.getInstance().saveProgress(script.id, targetStepId, step, undefined, undefined, totalSteps, nextRunState);
      refreshSaves();

      // 播放开场白语音
      if (step.dialogue && safetyConfig.autoPlayVoice) {
        void TTSManager.getInstance().speak(step.dialogue, getDungeonCharacterVoice(script, step.speaker));
      }
    }
  };

  // 根据 stepId 获取 step 对象（优先查找 AI 动态生成的 customSteps）
  const getStepById = (script: DungeonScript, stepId: string): DungeonStep | null => {
    const save = allSaves[script.id];
    if (save?.customSteps && save.customSteps[stepId]) {
      return save.customSteps[stepId];
    }
    return script.steps[stepId] || null;
  };

  const finishDungeon = (
    state: DungeonRunState,
    preferredType?: DungeonEndingType,
    suppliedTitle?: string,
    suppliedDesc?: string,
  ) => {
    if (!currentScript) return;
    const generated = buildDungeonEnding(currentScript, state, preferredType);
    const ending = {
      type: generated.type,
      title: suppliedTitle || generated.title,
      desc: suppliedDesc || generated.desc,
    };
    setRunState(state);
    setCurrentEnding(ending);
    void DeviceManager.getInstance().emergencyStop();
    setHardwareMode('text');
    HapticEngine.successTada();
    AchievementEngine.getInstance().checkDungeonClear(currentScript.id, currentScript.isFemboy, ending.type);
    const manager = DungeonSaveManager.getInstance();
    manager.unlockEnding(currentScript.id, ending.title);
    manager.unlockDetailedEnding({
      scriptId: currentScript.id,
      title: ending.title,
      description: ending.desc,
      type: ending.type,
      routeSummary: describeDungeonRoute(state),
      state,
    });
    refreshSaves();
  };

  // 用户点击选项
  const handleMakeChoice = (choice: DungeonChoice) => {
    if (!currentScript || isAiExpanding) return;
    TTSManager.getInstance().stop();
    if (hardwareMode === 'real') {
      void DeviceManager.getInstance().emergencyStop();
    }
    HapticEngine.medium();
    const nextRunState = applyDungeonChoice(runState, choice);
    setRunState(nextRunState);

    // 1. 下发硬件动作
    if (choice.hardwareAction) {
      if (hardwareMode === 'text') {
        setLastActionText(`📖 纯文字模式：已跳过硬件动作 ${choice.hardwareAction.target}`);
      } else if (hardwareMode === 'simulator') {
        setLastActionText(`🧪 模拟执行：${choice.hardwareAction.target}${choice.hardwareAction.durationSec ? ` (${choice.hardwareAction.durationSec}s)` : ''}`);
      }
    }
    if (choice.hardwareAction && hardwareMode === 'real') {
      const dev = DeviceManager.getInstance();
      const { type, target, value, durationSec } = choice.hardwareAction;
      const generation = viewGenerationRef.current;

      void (async () => {
        try {
          if (type === 'ems_wave') {
            HapticEngine.heavyShock();
            const seconds = durationSec ?? 10;
            await dev.sendEmsWave('AB', target, seconds);
            if (generation !== viewGenerationRef.current) return;
            setLastActionText(`⚡ 已注入电击波形: ${target} (${seconds}s)`);
          } else if (type === 'ems_strength') {
            HapticEngine.heavyShock();
            const strength = value ?? 30;
            await dev.setEmsStrength('AB', strength);
            if (generation !== viewGenerationRef.current) return;
            setLastActionText(`⚡ 电击强度调至: ${strength}`);
          } else if (type === 'toy_pattern') {
            const seconds = durationSec ?? 20;
            await dev.playToyPattern(target, seconds);
            if (generation !== viewGenerationRef.current) return;
            setLastActionText(`🎮 启动律动: ${target} (${seconds}s)`);
          } else if (type === 'toy_turbo') {
            const seconds = durationSec ?? 5;
            await dev.triggerTurbo(seconds);
            if (generation !== viewGenerationRef.current) return;
            setLastActionText(`⚡ Turbo 暴走已启动 (${seconds}s)`);
          } else if (type === 'enema_pattern') {
            await dev.playEnemaPattern(target);
            if (generation !== viewGenerationRef.current) return;
            setLastActionText(`🌊 启动灌肠调教: ${target}`);
          } else if (type === 'stop') {
            HapticEngine.heavyShock();
            await dev.emergencyStop();
            if (generation !== viewGenerationRef.current) return;
            setLastActionText('🛑 所有硬件已安全停止');
          }
        } catch (error: any) {
          if (generation === viewGenerationRef.current) {
            setLastActionText(`⚠️ 硬件动作失败：${error?.message || error}`);
          }
        }
      })();
    }

    // 2. 角色回复语音朗读
    if (choice.replyDialogue) {
      void TTSManager.getInstance().speak(
        choice.replyDialogue,
        currentScript ? getDungeonCharacterVoice(currentScript, getStepById(currentScript, currentStepId)?.speaker || '') : undefined,
      );
    }

    // 3. 判断是否触发 AI 动态长篇推演
    if (choice.nextStepId === 'next_ai_expand') {
      handleTriggerAiExpand(choice.text, nextRunState);
      return;
    }

    // 4. 判断是否到达结局
    const currentStep = getStepById(currentScript, currentStepId);
    if (choice.nextStepId === 'ending' || (!currentScript.steps[choice.nextStepId] && !allSaves[currentScript.id]?.customSteps?.[choice.nextStepId])) {
      const generatedChoice = currentStep?.generationSource !== undefined;
      if (currentStep) {
        DungeonSaveManager.getInstance().saveProgress(
          currentScript.id,
          currentStepId,
          currentStep,
          choice.text,
          undefined,
          Object.keys(currentScript.steps).length + (generatedChoice ? runState.aiChapters + 8 : 0),
          nextRunState,
        );
      }
      finishDungeon(
        nextRunState,
        generatedChoice ? choice.endingType : undefined,
        generatedChoice ? choice.endingTitle : undefined,
        generatedChoice ? choice.endingDesc : undefined,
      );
    } else {
      // 推进至下一步
      const nextStep = getStepById(currentScript, choice.nextStepId);
      if (nextStep) {
        setCurrentStepId(choice.nextStepId);
        const totalSteps = Object.keys(currentScript.steps).length + (currentScript.isAiGenerated || nextRunState.aiChapters > 0 ? nextRunState.aiChapters + 8 : 0);
        DungeonSaveManager.getInstance().saveProgress(
          currentScript.id,
          currentStepId,
          currentStep!,
          choice.text,
          undefined,
          totalSteps,
          nextRunState,
        );
        DungeonSaveManager.getInstance().saveProgress(
          currentScript.id,
          choice.nextStepId,
          nextStep,
          undefined,
          undefined,
          totalSteps,
          nextRunState,
        );
        refreshSaves();
      }
    }
  };

  // 触发 AI 长篇推演 (5w-20w字无限扩展)
  const handleTriggerAiExpand = async (customAction?: string, stateOverride?: DungeonRunState, forceEnding = false) => {
    if (!currentScript || isAiExpanding || aiRequestRef.current) return;
    const currentStep = getStepById(currentScript, currentStepId);
    if (!currentStep) return;

    const safeCustomAction = typeof customAction === 'string' ? customAction.trim().slice(0, 2000) : '';
    const controller = new AbortController();
    aiRequestRef.current = controller;
    setIsAiExpanding(true);
    setLastActionText('🔮 AI 伴侣正在沉浸式构思 2000 字长篇后续剧情...');
    const generation = viewGenerationRef.current;
    const scriptId = currentScript.id;
    const baseRunState = stateOverride || runState;

    try {
      const historyItems = (allSaves[currentScript.id]?.history || []).map(
        (h) => `【${h.speaker}】: ${h.narrative} -> 用户选择: ${h.chosenText || '推进'}`
      );

      const newStep = await DungeonAIEngine.getInstance().expandStory(
        currentScript,
        currentStep,
        historyItems,
        safeCustomAction,
        controller.signal,
        baseRunState,
        forceEnding,
      );
      if (generation !== viewGenerationRef.current || currentScript.id !== scriptId) return;

      // 持久化保存 AI 动态生成的节点
      const nextRunState = incrementDungeonAiChapter(baseRunState);
      const totalSteps = Object.keys(currentScript.steps).length + nextRunState.aiChapters + 8;
      DungeonSaveManager.getInstance().saveProgress(
        currentScript.id,
        currentStepId,
        currentStep,
        safeCustomAction || 'AI 伴侣长篇推演',
        undefined,
        totalSteps,
        nextRunState,
      );
      DungeonSaveManager.getInstance().saveProgress(
        currentScript.id,
        newStep.id,
        newStep,
        undefined,
        newStep,
        totalSteps,
        nextRunState,
      );
      refreshSaves();

      setCurrentStepId(newStep.id);
      setRunState(nextRunState);
      setCustomActionInput('');
      setLastActionText(newStep.generationNotice || 'AI 剧情已生成');

      if (newStep.dialogue) {
        void TTSManager.getInstance().speak(newStep.dialogue, getDungeonCharacterVoice(currentScript, newStep.speaker));
      }
    } catch (e: any) {
      if (generation === viewGenerationRef.current && e?.name !== 'AbortError') {
        console.warn('AI 动态长篇推演失败:', e);
        setLastActionText(`AI 推演失败：${String(e?.message || e).slice(0, 200)}`);
      }
    } finally {
      if (aiRequestRef.current === controller) aiRequestRef.current = null;
      if (generation === viewGenerationRef.current) setIsAiExpanding(false);
    }
  };

  const cancelAiExpansion = () => {
    aiRequestRef.current?.abort();
    aiRequestRef.current = null;
    setIsAiExpanding(false);
    setLastActionText('已取消本次 AI 推演。');
  };

  const handleCreateAiScript = async () => {
    const concept = aiCreatorPrompt.trim();
    if (concept.length < 4 || isAiCreating || aiRequestRef.current) return;
    const controller = new AbortController();
    aiRequestRef.current = controller;
    setIsAiCreating(true);
    setAiCreatorMessage('AI 正在搭建世界观、角色和第一幕剧情...');
    try {
      const generated = await DungeonAIEngine.getInstance().createScript(concept, controller.signal);
      const saved = DungeonScriptLibrary.getInstance().save(generated);
      if (!saved) throw new Error('本地剧本库保存失败');
      setCustomScripts(DungeonScriptLibrary.getInstance().getCustomScripts());
      setShowAiCreator(false);
      setAiCreatorPrompt('');
      setAiCreatorMessage(null);
      handleStartScript(saved, saved.initialStepId);
      setLastActionText(saved.generationNotice || 'AI 原创地牢已生成，可无限续写。');
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        setAiCreatorMessage(`创作失败：${String(error?.message || error).slice(0, 200)}`);
      }
    } finally {
      if (aiRequestRef.current === controller) aiRequestRef.current = null;
      setIsAiCreating(false);
    }
  };

  const cancelAiCreation = () => {
    aiRequestRef.current?.abort();
    aiRequestRef.current = null;
    setIsAiCreating(false);
    setAiCreatorMessage('已取消本次创作。');
  };

  const deleteDungeonScript = (script: DungeonScript) => {
    const kind = script.isAiGenerated ? 'AI 剧本' : '内置剧本';
    if (!confirm(`确定把${kind}《${script.title}》移入回收站吗？阅读进度和结局会暂时保留，可在回收站恢复。`)) return;
    const library = DungeonScriptLibrary.getInstance();
    if (!library.moveToRecycleBin(script, !script.isAiGenerated)) {
      setLibraryMessage(`《${script.title}》移入回收站失败，请检查本地存储空间。`);
      return;
    }
    setCustomScripts(library.getCustomScripts());
    setRecycleBin(library.getRecycleBin());
    setLibraryMessage(`已将《${script.title}》移入回收站，存档仍然保留。`);
  };

  const restoreRecycledScript = (item: DungeonRecycleItem) => {
    const library = DungeonScriptLibrary.getInstance();
    const title = DUNGEON_SCRIPTS.find((script) => script.id === item.scriptId)?.title || item.title;
    if (!library.restore(item.scriptId)) {
      setLibraryMessage(`《${title}》恢复失败，请检查本地存储空间。`);
      return;
    }
    setCustomScripts(library.getCustomScripts());
    setRecycleBin(library.getRecycleBin());
    setLibraryMessage(`已恢复《${title}》。`);
  };

  const permanentlyDeleteRecycledScript = (item: DungeonRecycleItem) => {
    const title = DUNGEON_SCRIPTS.find((script) => script.id === item.scriptId)?.title || item.title;
    if (!confirm(`确定彻底删除《${title}》吗？阅读进度、手动存档和结局记录都会清除，且无法恢复。`)) return;
    const library = DungeonScriptLibrary.getInstance();
    if (!library.permanentlyDelete(item.scriptId)) {
      setLibraryMessage(`《${title}》彻底删除失败，请检查本地存储空间。`);
      return;
    }
    DungeonSaveManager.getInstance().deleteScriptData(item.scriptId);
    setRecycleBin(library.getRecycleBin());
    setPermanentlyDeletedBuiltinIds(library.getPermanentlyDeletedBuiltinIds());
    refreshSaves();
    setLibraryMessage(`已彻底删除《${title}》及其全部存档。`);
  };

  const selectHardwareMode = (mode: DungeonHardwareMode) => {
    if (mode === 'real') {
      if (safetyConfig.emergencyLock) {
        alert('急停锁已激活，请先解除后再授权真实硬件。');
        return;
      }
      if (deviceState.connectionMode === 'simulator' || deviceState.connectionStatus !== 'connected') {
        alert('尚未连接真实 BLE 或桥接设备。请先在硬件页面完成连接，或使用模拟模式。');
        return;
      }
      if (!confirm('真实硬件模式只对本次地牢有效。剧情选项可能在安全上限内立即控制已连接设备，确认授权吗？')) return;
    }
    if (hardwareMode === 'real' && mode !== 'real') void DeviceManager.getInstance().emergencyStop();
    setHardwareMode(mode);
    setLastActionText(mode === 'text' ? '已切换为纯文字模式。' : mode === 'simulator' ? '已切换为安全模拟模式。' : '本次地牢已授权真实硬件。');
  };

  const saveManualSlot = (slot: 1 | 2 | 3) => {
    if (!currentScript) return;
    const saved = DungeonSaveManager.getInstance().saveManualSlot(currentScript.id, slot);
    setLastActionText(saved ? `已保存到手动存档 ${slot}。` : '手动存档失败，请检查本地存储空间。');
    setSaveUiVersion((version) => version + 1);
  };

  const loadManualSlot = (slot: 1 | 2 | 3) => {
    if (!currentScript) return;
    const record = DungeonSaveManager.getInstance().loadManualSlot(currentScript.id, slot);
    if (!record) return;
    setAllSaves(DungeonSaveManager.getInstance().getAllSaves());
    setCurrentStepId(record.currentStepId);
    setRunState(record.runState);
    setCurrentEnding(null);
    setLastActionText(`已载入手动存档 ${slot}。`);
    setSaveUiVersion((version) => version + 1);
  };

  const rewindToHistory = (historyIndex: number) => {
    if (!currentScript || !confirm(`回到第 ${historyIndex + 1} 幕并从这里建立新分支吗？之后的自动进度会被替换，手动存档不受影响。`)) return;
    const record = DungeonSaveManager.getInstance().rewindToHistory(currentScript.id, historyIndex);
    if (!record) return;
    setAllSaves(DungeonSaveManager.getInstance().getAllSaves());
    setCurrentStepId(record.currentStepId);
    setRunState(record.runState);
    setCurrentEnding(null);
    setShowHistoryDrawer(false);
    setLastActionText(`已回到第 ${historyIndex + 1} 幕，可以建立新分支。`);
  };

  // 退出地牢
  const handleQuitDungeon = () => {
    viewGenerationRef.current += 1;
    aiRequestRef.current?.abort();
    aiRequestRef.current = null;
    setIsAiExpanding(false);
    HapticEngine.light();
    void DeviceManager.getInstance().emergencyStop();
    TTSManager.getInstance().stop();
    setCurrentScript(null);
    setCurrentEnding(null);
    refreshSaves();
  };

  // 当前激活的 step
  const currentStep: DungeonStep | null = currentScript ? getStepById(currentScript, currentStepId) : null;
  const currentSaveRecord: DungeonSaveRecord | null = currentScript ? allSaves[currentScript.id] || null : null;
  void saveUiVersion;
  const manualSlots: DungeonManualSlot[] = currentScript ? DungeonSaveManager.getInstance().getManualSlots(currentScript.id) : [];
  const endingGallery = DungeonSaveManager.getInstance().getEndingGallery();

  return (
    <div className={embedded ? "space-y-4" : "max-w-md mx-auto px-3.5 py-4 pb-36 space-y-4"}>
      {/* 顶部标题栏 */}
      <div className="liquid-card flex items-center justify-between p-3.5 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-2xl bg-pink-50 border border-pink-200 text-pink-600 shadow-sm shrink-0">
            <Castle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-800 truncate">
              互动剧情地牢<span className="text-xs font-bold text-pink-600 ml-1">（开发中）</span>
            </h2>
            <p className="text-[10.5px] text-slate-500 truncate">长篇互动小说 · 断点续读 · 硬件联动</p>
          </div>
        </div>

        {/* 快捷图鉴与回收站入口（仅列表模式显示，替代原本占满屏幕的巨型横幅） */}
        {!currentScript && (
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <button
              type="button"
              onClick={() => setShowEndingGallery(true)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl border border-amber-200 bg-amber-50/80 hover:bg-amber-100 text-amber-900 text-[10.5px] font-black transition active:scale-95 shadow-xs"
              title="查看已解锁结局图鉴"
            >
              <Library className="w-3.5 h-3.5 text-amber-600" />
              <span>图鉴</span>
              <span className="font-mono text-[9px] bg-amber-200/80 text-amber-800 px-1.5 py-0.2 rounded-full">{endingGallery.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowRecycleBin(true)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl border border-pink-100 bg-white hover:bg-pink-50 text-slate-600 hover:text-rose-600 text-[10.5px] font-bold transition active:scale-95 shadow-xs"
              title="查看剧本回收站"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>回收站</span>
              {recycleBin.length > 0 && (
                <span className="font-mono text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded-full">{recycleBin.length}</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ================= 🔖 全局断点续读横幅 (一键回到上次游玩的剧本) ================= */}
      {!currentScript && lastActiveScript && lastActiveSave && (
        <div className="liquid-card flex animate-in items-center justify-between gap-3 p-3.5 shadow-sm fade-in slide-in-from-top-2 border border-pink-200/80 bg-gradient-to-r from-pink-50/60 via-white to-rose-50/40">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-black text-pink-900">
              <BookmarkCheck className="w-4 h-4 text-pink-600 shrink-0 animate-pulse" />
              <span className="truncate">上次探索：{lastActiveScript.title}</span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[10px] font-bold text-pink-700/90">
              📍 第 {lastActiveSave.currentStepId} 幕 · 已读 {(lastActiveSave.totalWordsRead / 10000).toFixed(1)} 万字 ({lastActiveSave.progressPct}%)
            </p>
          </div>

          <button
            onClick={() => handleStartScript(lastActiveScript, lastActiveSave.currentStepId)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 text-white text-xs font-black shadow-md shadow-pink-500/25 flex items-center gap-1.5 shrink-0 active:scale-95 transition-all"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>继续探索</span>
          </button>
        </div>
      )}

      {/* ================= 模式 1：剧本进行中视图 ================= */}
      {currentScript ? (
        <div className="space-y-4">
          {/* 地牢顶栏状态 */}
          <div className="frosted-feather-glass flex items-center justify-between px-3.5 py-2.5 rounded-2xl shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
              <span className="text-2xl shrink-0">{currentScript.avatar}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-slate-800 truncate">{currentScript.title}</h3>
                <div className="flex items-center gap-2 mt-0.5 text-[9px] text-pink-600 font-mono font-medium">
                  <span>📍 {currentStepId}</span>
                  <span>📚 已读: {currentSaveRecord?.totalWordsRead || 3200} 字</span>
                  <span>🏆 进度: {currentSaveRecord?.progressPct || 20}%</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleQuitDungeon}
              className="text-xs text-rose-700 hover:text-rose-800 bg-rose-50/80 px-3 py-1.5 rounded-xl border border-rose-200 font-bold shrink-0 active:scale-95 transition shadow-xs"
            >
              退出地牢
            </button>
          </div>

          <div className="liquid-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[11px] font-black text-slate-800">
                <ShieldCheck className="h-3.5 w-3.5 text-pink-500" /> 本次硬件权限
              </span>
              <div className="flex items-center gap-1">
                {([
                  ['text', '纯文字'],
                  ['simulator', '模拟'],
                  ['real', '真实设备'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => selectHardwareMode(mode)}
                    className={`rounded-lg border px-2 py-1 text-[9.5px] font-bold transition ${
                      hardwareMode === mode
                        ? 'border-pink-300 bg-pink-50 text-pink-700 font-black shadow-xs'
                        : 'border-pink-100/80 bg-white/80 text-slate-600 hover:bg-pink-50/40'
                    }`}
                  >
                    {mode === 'simulator' && <MonitorPlay className="mr-0.5 inline h-2.5 w-2.5" />}{label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center font-mono text-[9px]">
              <span className="rounded-lg border border-pink-200 bg-pink-50/70 px-1 py-1 font-bold text-pink-700">意志 {runState.resolve}</span>
              <span className="rounded-lg border border-rose-200 bg-rose-50/70 px-1 py-1 font-bold text-rose-700">服从 {runState.submission}</span>
              <span className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-1 py-1 font-bold text-emerald-700">信任 {runState.trust}</span>
              <span className="rounded-lg border border-amber-200 bg-amber-50/70 px-1 py-1 font-bold text-amber-700">风险 {runState.risk}</span>
            </div>
          </div>

          {/* 结局结算卡片 */}
          {currentEnding ? (
            <div className="liquid-card p-5 space-y-4 text-center animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-pink-100 border-2 border-pink-300 flex items-center justify-center mx-auto text-3xl shadow-sm">
                🏆
              </div>

              <div>
                <h3 className="text-base font-black text-pink-700">
                  {currentEnding.title}
                </h3>
                <p className="text-xs text-slate-700 mt-2 leading-relaxed bg-white/90 p-3.5 rounded-2xl border border-pink-100 shadow-xs">
                  {currentEnding.desc}
                </p>
                <p className="mt-2 text-[10px] font-mono text-pink-600 font-bold">{describeDungeonRoute(runState)}</p>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  onClick={() => {
                    DungeonSaveManager.getInstance().resetScriptProgress(currentScript.id);
                    refreshSaves();
                    setRunState({ ...DEFAULT_DUNGEON_RUN_STATE });
                    handleStartScript(currentScript, currentScript.initialStepId);
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 text-white text-xs font-black shadow-md shadow-pink-500/25 flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" /> 重新探索其他分支
                </button>
                <button
                  onClick={handleQuitDungeon}
                  className="w-full py-2.5 rounded-xl bg-white text-slate-700 text-xs font-bold border border-pink-200 hover:bg-pink-50"
                >
                  返回剧本列表
                </button>
              </div>
            </div>
          ) : (
            /* 剧情对话与选择支推进 */
            currentStep && (
              <div className="space-y-4">
                {/* 章节与幕数徽章 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-pink-700 bg-pink-50 px-3 py-1 rounded-full border border-pink-200 shadow-xs">
                    {currentStep.speaker}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
                      className="text-[10px] text-pink-700 bg-white hover:bg-pink-50 border border-pink-200 px-2.5 py-1 rounded-xl flex items-center gap-1 font-bold shadow-xs transition"
                    >
                      <History className="w-3 h-3" />
                      <span>{showHistoryDrawer ? '收起足迹' : '前文足迹'}</span>
                    </button>
                  </div>
                </div>

                {/* 📜 前文足迹抽屉 (可折叠查看之前所有章节与对话) */}
                {showHistoryDrawer && currentSaveRecord && (
                  <div className="frosted-feather-glass rounded-3xl p-4 space-y-3 max-h-60 overflow-y-auto shadow-xl animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-bold text-pink-700 border-b border-pink-100 pb-1.5">
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-pink-500" /> 本篇已读历程 ({currentSaveRecord.history.length} 幕)
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">共 {currentSaveRecord.totalWordsRead} 字</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([1, 2, 3] as const).map((slot) => {
                        const saved = manualSlots.find((item) => item.slot === slot);
                        return (
                          <div key={slot} className="rounded-xl border border-pink-100 bg-pink-50/40 p-1.5 text-center">
                            <p className="truncate text-[9px] font-bold text-slate-700">{saved ? saved.label : `空存档 ${slot}`}</p>
                            <div className="mt-1 flex gap-1">
                              <button type="button" onClick={() => saveManualSlot(slot)} className="flex-1 rounded-md bg-pink-100 p-1 text-pink-700 hover:bg-pink-200 font-bold" title={`保存到槽位 ${slot}`}><Save className="mx-auto h-3 w-3" /></button>
                              <button type="button" disabled={!saved} onClick={() => loadManualSlot(slot)} className="flex-1 rounded-md bg-cyan-100 p-1 text-cyan-700 hover:bg-cyan-200 disabled:opacity-30 font-bold" title={`载入槽位 ${slot}`}><FolderOpen className="mx-auto h-3 w-3" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {currentSaveRecord.history.map((item, idx) => (
                      <div key={idx} className="text-[11px] space-y-1 bg-pink-50/30 p-2.5 rounded-xl border border-pink-100">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-pink-600 font-bold">第 {idx + 1} 幕 · {item.speaker}</p>
                          {idx < currentSaveRecord.history.length - 1 && (
                            <button type="button" onClick={() => rewindToHistory(idx)} className="rounded-lg border border-pink-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-pink-700">从此分支</button>
                          )}
                        </div>
                        <p className="text-slate-700 leading-relaxed">{item.narrative}</p>
                        <p className="text-pink-700 font-medium italic">“{item.dialogue}”</p>
                        {item.chosenText && (
                          <p className="text-pink-600 font-bold mt-1 text-[10px]">👉 你的抉择: {item.chosenText}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 导师大头像与主对白卡片 */}
                <div className="liquid-card p-4 sm:p-5 space-y-3.5 relative overflow-hidden">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-100 to-rose-100 border border-white flex items-center justify-center text-3xl shrink-0 shadow-xs">
                      {currentStep.avatar || currentScript.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-pink-700">{currentScript.title.split('·')[0]}</h4>
                        <button
                          onClick={() => void TTSManager.getInstance().speak(currentStep.dialogue, getDungeonCharacterVoice(currentScript, currentStep.speaker))}
                          className="text-pink-600 hover:text-pink-700 flex items-center gap-1 text-[10px] font-bold"
                        >
                          <Volume2 className="w-3.5 h-3.5" /> 朗读台词
                        </button>
                      </div>
                      <p className="text-xs text-slate-800 font-semibold mt-1 leading-relaxed italic bg-pink-50/70 p-2.5 rounded-2xl border border-pink-100">
                        “{currentStep.dialogue}”
                      </p>
                    </div>
                  </div>

                  {/* 长篇宏大环境与心理叙事 */}
                  <div className="text-xs text-slate-700 leading-relaxed bg-white/70 p-3.5 rounded-2xl border border-pink-100/70 space-y-1.5 shadow-xs">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-pink-600 font-bold">
                      <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-pink-500" />场景叙述</span>
                      <button type="button" onClick={() => void TTSManager.getInstance().speak(currentStep.narrative, DUNGEON_NARRATOR_VOICE)} className="flex items-center gap-1 text-pink-600 hover:text-pink-700"><Volume2 className="h-3 w-3" />朗读旁白</button>
                    </div>
                    <p className="whitespace-pre-line">{currentStep.narrative}</p>
                  </div>

                  {/* 最新硬件动作反馈提示条 */}
                  {lastActionText && (
                    <div className="flex items-center gap-1.5 text-xs text-pink-700 bg-pink-50 border border-pink-200 px-3 py-1.5 rounded-xl animate-pulse font-mono font-bold shadow-xs">
                      <Zap className="w-3.5 h-3.5 text-pink-500" />
                      <span>{lastActionText}</span>
                    </div>
                  )}
                </div>

                {/* 选项分支列表 */}
                <div className="space-y-2.5">
                  <p className="flex items-center gap-1 px-1 text-[10px] font-black uppercase tracking-wider text-pink-900">
                    <Compass className="w-3.5 h-3.5" /> 你的生理与心智抉择:
                  </p>

                  {getPlayableDungeonChoices(currentStep.choices).map((choice) => (
                    <button
                      key={choice.id}
                      onClick={() => handleMakeChoice(choice)}
                      disabled={isAiExpanding}
                      className={`liquid-btn group w-full space-y-1 rounded-2xl border border-pink-200/90 bg-white/90 backdrop-blur-md p-3.5 text-left shadow-xs transition-all hover:border-pink-400 hover:bg-white hover:shadow-md active:scale-98 ${isAiExpanding ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black leading-snug text-slate-800 group-hover:text-pink-700">
                          {choice.text}
                        </span>
                        <ArrowRight className="ml-2 h-3.5 w-3.5 shrink-0 text-pink-500 transition-transform group-hover:translate-x-0.5" />
                      </div>

                      {choice.hardwareAction && (
                        <span className="inline-flex items-center gap-1 rounded border border-pink-200 bg-pink-50 px-1.5 py-0.5 font-mono text-[9px] font-black text-pink-700">
                          {hardwareMode === 'real' ? '⚡ 真实执行' : hardwareMode === 'simulator' ? '🧪 模拟执行' : '📖 仅剧情'}: {choice.hardwareAction.target}
                        </span>
                      )}
                      <span className="ml-1 inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-600">路线：{choice.attitude}</span>
                    </button>
                  ))}

                  {/* ================= 🔮 AI 伴侣长篇实时推演与自由输入工具 ================= */}
                  <div className="pt-2 space-y-2">
                    {isAiExpanding ? (
                      <button onClick={cancelAiExpansion} className="w-full rounded-2xl border border-rose-300 bg-rose-50 py-3 text-xs font-black text-rose-700">取消本次 AI 推演</button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleTriggerAiExpand()}
                          className="rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 py-3 text-xs font-black text-white shadow-md shadow-pink-500/20 active:scale-95 transition-all"
                        >
                          <Wand2 className="mr-1 inline h-4 w-4" />推演下一幕 · 第 {runState.aiChapters + 1} 幕
                        </button>
                        <button
                          onClick={() => handleTriggerAiExpand('请根据当前路线完整收束故事并给出结局。', runState, true)}
                          className="rounded-2xl border border-amber-200 bg-amber-50 py-3 text-xs font-black text-amber-800 active:scale-95 transition-all"
                        >
                          <Trophy className="mr-1 inline h-4 w-4" />收束为结局
                        </button>
                      </div>
                    )}

                    {/* 自定义行动输入栏 */}
                    <div className="liquid-input flex items-center gap-2 p-1.5 pl-3.5 shadow-xs">
                      <input
                        type="text"
                        value={customActionInput}
                        maxLength={2000}
                        onChange={(e) => setCustomActionInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && customActionInput.trim() && handleTriggerAiExpand(customActionInput.trim())}
                        placeholder="✨ 自定义行动（如：把电极片贴到大腿内侧娇喘求饶）..."
                        className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none"
                      />
                      <button
                        onClick={() => customActionInput.trim() && handleTriggerAiExpand(customActionInput.trim())}
                        disabled={!customActionInput.trim() || isAiExpanding}
                        className="p-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 disabled:opacity-40 text-white shrink-0 active:scale-95 shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        /* ================= 模式 2：剧本列表视图 ================= */
        <div className="space-y-3.5">
          {/* AI 创作新剧本横幅（紧凑精致版） */}
          <div
            onClick={() => {
              setAiCreatorMessage(null);
              setShowAiCreator(true);
            }}
            className="liquid-card group relative cursor-pointer overflow-hidden p-3.5 shadow-xs transition-all hover:shadow-md active:scale-[0.99] border border-pink-200/80 bg-gradient-to-r from-pink-50/90 via-rose-50/40 to-purple-50/30"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white bg-white/90 text-xl shadow-xs">🪄</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-black text-slate-800">AI 创作新剧本</p>
                    <span className="text-[9px] font-mono text-pink-600 font-bold bg-pink-100/80 px-1.5 py-0.2 rounded-md border border-pink-200/50">自创续写</span>
                  </div>
                  <p className="mt-0.5 truncate text-[10.5px] text-slate-500">输入设定题材，AI 自动生成专属多分支剧情</p>
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[11px] font-black shadow-sm flex items-center gap-1 active:scale-95"
              >
                <span>创作</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {libraryMessage && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800 animate-in fade-in">{libraryMessage}</p>
          )}

          {/* 分类切换 Tab */}
          <div className="frosted-feather-glass flex items-center p-1 rounded-2xl shadow-xs">
            {[
              { id: 'all', label: `全部长篇 (${allScripts.length})` },
              { id: 'femboy', label: `🌸 雌堕重塑 (${femboyScriptCount})` },
              { id: 'classic', label: `⚡ 经典地牢 (${classicScriptCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id as 'all' | 'femboy' | 'classic')}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeCategory === tab.id
                    ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm font-black'
                    : 'text-slate-600 hover:text-pink-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 剧本卡片列表（清爽小说卡片设计，移除突兀的破坏性删除底栏） */}
          <div className="space-y-3">
            {filteredScripts.map((script) => {
              const save = allSaves[script.id];
              const unlockedList = unlockedEndings[script.id] || [];
              const isPlayed = !!save && save.currentStepId !== script.initialStepId;

              return (
                <div
                  key={script.id}
                  className="liquid-card group overflow-hidden transition-all hover:shadow-md border border-pink-100 hover:border-pink-200/90"
                >
                  <div
                    onClick={() => handleClickScriptCard(script)}
                    className="w-full space-y-2.5 p-3.5 text-left cursor-pointer active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-pink-100 to-rose-100 border border-white flex items-center justify-center text-2xl shrink-0 shadow-xs">
                        {script.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-black text-slate-800 group-hover:text-pink-600 truncate">
                            {script.title}
                          </h3>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] text-pink-600 font-mono font-bold bg-pink-50 px-2 py-0.5 rounded-full border border-pink-100">
                              {script.isAiGenerated ? '🪄 AI 原创' : script.category}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteDungeonScript(script);
                              }}
                              className="text-slate-300 hover:text-rose-500 p-1 rounded-lg hover:bg-rose-50 transition"
                              title={`将《${script.title}》移入回收站`}
                              aria-label={`删除剧本 ${script.title}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{script.difficulty}</p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{script.description}</p>

                    {/* 标签与阅读进度 */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-pink-50/80">
                      <div className="flex flex-wrap gap-1 min-w-0 flex-1">
                        {script.tags.slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="liquid-chip px-2 py-0.5 font-mono text-[9px] font-bold text-pink-700 truncate"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>

                      {/* 进度徽章与行动入口 */}
                      <div className="shrink-0 flex items-center gap-2">
                        {isPlayed ? (
                          <span className="text-[9.5px] font-mono text-cyan-700 font-bold bg-cyan-50 px-2.5 py-1 rounded-xl border border-cyan-200 flex items-center gap-1">
                            <BookmarkCheck className="w-3 h-3 text-cyan-600" />
                            继续 ({save?.progressPct}%)
                          </span>
                        ) : unlockedList.length > 0 ? (
                          <span className="text-[9.5px] font-mono text-amber-800 font-bold bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 flex items-center gap-1">
                            <Trophy className="w-3 h-3 text-amber-600" />
                            已通关 ({unlockedList.length})
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-pink-600 bg-pink-50 hover:bg-pink-100 px-2.5 py-1 rounded-xl border border-pink-200 flex items-center gap-1 transition">
                            <Play className="w-3 h-3 fill-current" />
                            进入探索
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAiCreator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-pink-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-pink-200 bg-pink-50 text-2xl shadow-xs">🪄</span>
              <div>
                <h3 className="text-sm font-black text-slate-800">AI 地牢编剧</h3>
                <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500">写下题材、世界观、核心角色或想体验的冲突。生成后的剧情没有固定篇数，可随选择持续续写。</p>
              </div>
            </div>

            <textarea
              value={aiCreatorPrompt}
              onChange={(event) => setAiCreatorPrompt(event.target.value)}
              maxLength={4000}
              rows={7}
              disabled={isAiCreating}
              placeholder="例如：一座会读取记忆的赛博地牢，守门人是冷静但会逐渐动摇的机械审判官；希望包含身份谜题、阵营反转和多条逃脱路线……"
              className="w-full resize-none rounded-2xl border border-pink-100 bg-pink-50/20 p-3 text-xs leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-pink-400 focus:bg-white focus:ring-2 focus:ring-pink-200/50 disabled:opacity-60 transition"
            />
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
              <span>模型不可用时会生成可玩的离线开场</span>
              <span>{aiCreatorPrompt.length}/4000</span>
            </div>

            {aiCreatorMessage && (
              <p className="rounded-xl border border-pink-200 bg-pink-50 p-2.5 text-[10px] leading-relaxed text-pink-700">{aiCreatorMessage}</p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={isAiCreating ? cancelAiCreation : () => setShowAiCreator(false)}
                className="rounded-2xl border border-pink-200 bg-pink-50/60 py-3 text-xs font-bold text-slate-700 hover:bg-pink-100 transition"
              >
                {isAiCreating ? '取消生成' : '返回'}
              </button>
              <button
                type="button"
                onClick={handleCreateAiScript}
                disabled={isAiCreating || aiCreatorPrompt.trim().length < 4}
                className="rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 py-3 text-xs font-black text-white shadow-md shadow-pink-500/25 disabled:opacity-40 transition"
              >
                <Wand2 className="mr-1 inline h-4 w-4" />{isAiCreating ? '正在创作…' : '生成并开始'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRecycleBin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[86vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-pink-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-pink-100 px-4 py-3.5">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Trash2 className="h-4 w-4 text-rose-500" />剧本回收站</h3>
                <p className="mt-1 text-[9px] font-semibold text-slate-500">恢复会保留原存档；彻底删除会清除全部相关数据。</p>
              </div>
              <button type="button" onClick={() => setShowRecycleBin(false)} className="rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1 text-[10px] font-black text-pink-700">关闭</button>
            </div>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
              {recycleBin.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/30 p-6 text-center">
                  <Trash2 className="mx-auto h-6 w-6 text-pink-300" />
                  <p className="mt-2 text-xs font-bold text-slate-500">回收站是空的</p>
                </div>
              ) : recycleBin.map((item) => {
                const script = item.isBuiltin
                  ? DUNGEON_SCRIPTS.find((candidate) => candidate.id === item.scriptId)
                  : item.script;
                const title = script?.title || item.title;
                const avatar = script?.avatar || item.avatar;
                return (
                  <div key={item.scriptId} className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-white text-xl">{avatar}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-slate-800">{title}</p>
                        <p className="mt-1 text-[9px] font-semibold text-slate-500">{item.isBuiltin ? '内置剧本' : '私人 AI 剧本'} · {new Date(item.deletedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => restoreRecycledScript(item)} className="rounded-xl border border-emerald-300 bg-white py-2 text-[10px] font-black text-emerald-700 shadow-xs">恢复剧本</button>
                      <button type="button" onClick={() => permanentlyDeleteRecycledScript(item)} className="rounded-xl border border-rose-500 bg-rose-500 py-2 text-[10px] font-black text-white shadow-xs">彻底删除</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================= 弹窗：选择继续阅读还是重开 ================= */}
      {promptResumeScript && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-pink-200 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{promptResumeScript.script.avatar}</span>
              <div>
                <h3 className="text-sm font-black text-slate-800">{promptResumeScript.script.title}</h3>
                <p className="text-[10px] text-pink-600 font-mono font-bold">
                  📍 存档位置：第 {promptResumeScript.save.currentStepId} 幕 · 已读 {(promptResumeScript.save.totalWordsRead / 10000).toFixed(1)} 万字
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-pink-50/50 p-3 rounded-2xl border border-pink-100 leading-relaxed">
              检测到您在此剧本中有未完成的探索进度，您可以从上次位置无缝继续，或重新从第一幕开始。
            </p>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleStartScript(promptResumeScript.script, promptResumeScript.save.currentStepId)}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 text-white text-xs font-black shadow-md shadow-pink-500/25 flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>从上次进度继续 (第 {promptResumeScript.save.currentStepId} 幕)</span>
              </button>

              <button
                onClick={() => {
                  DungeonSaveManager.getInstance().resetScriptProgress(promptResumeScript.script.id);
                  refreshSaves();
                  handleStartScript(promptResumeScript.script, promptResumeScript.script.initialStepId);
                }}
                className="w-full py-2.5 rounded-2xl bg-pink-50 text-pink-700 text-xs font-bold border border-pink-200 hover:bg-pink-100 flex items-center justify-center gap-1.5 active:scale-95 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重新从头开始 (重置进度)</span>
              </button>

              <button
                onClick={() => setPromptResumeScript(null)}
                className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs text-center font-medium"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {showEndingGallery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-3xl border border-amber-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-amber-100 p-4">
              <h3 className="flex items-center gap-2 text-sm font-black text-amber-900"><Library className="h-4 w-4 text-amber-600" />地牢结局图鉴</h3>
              <button type="button" onClick={() => setShowEndingGallery(false)} className="text-xs font-bold text-slate-500 hover:text-slate-800">关闭</button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {endingGallery.length === 0 ? (
                <p className="rounded-2xl border border-pink-100 bg-pink-50/30 p-4 text-center text-xs text-slate-500">完成不同路线后，结局会记录在这里。</p>
              ) : endingGallery.sort((left, right) => right.unlockedAt - left.unlockedAt).map((ending) => (
                <div key={ending.id} className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3 shadow-xs">
                  <p className="text-xs font-black text-amber-900">{ending.title}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{ending.description}</p>
                  <p className="mt-2 text-[9px] font-mono font-bold text-pink-600">{ending.routeSummary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
