import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronRight, CircleStop, Gauge, Pause, Play, ShieldCheck, Sparkles, Volume2 } from 'lucide-react';
import { LLMClient } from '../../core/ai/llmClient';
import { DeviceManager } from '../../core/deviceManager';
import {
  buildLocalSceneDirectorPlan,
  getSceneDirectorLevelCeiling,
  parseSceneDirectorPlanJson,
  SCENE_DIRECTOR_BRANCH_OPTIONS,
  SCENE_DIRECTOR_PACING_OPTIONS,
  SCENE_DIRECTOR_RELATIONSHIPS,
  SCENE_DIRECTOR_THEMES,
  SceneDirectorBranchMode,
  SceneDirectorChoice,
  SceneDirectorPacing,
  SceneDirectorPlan,
  SceneDirectorRelationship,
  SceneDirectorStyle,
  SceneDirectorTheme,
  SceneDirectorStep,
} from '../../core/discipline/sceneDirector';
import { TTSManager } from '../../core/voice/ttsManager';
import { useAppStore } from '../../store/useAppStore';

type DirectorScreen = 'setup' | 'preview' | 'running' | 'checkpoint' | 'choice' | 'review';
type SessionFeedback = 'softer' | 'good' | 'stronger';

interface SceneDirectorTabProps {
  style: SceneDirectorStyle;
  growth: Record<string, number>;
  effectiveBpm: number;
  heartRateThreshold: number;
  updateStyle: (style: SceneDirectorStyle) => void;
  addAudit: (message: string) => void;
}

interface DirectorHistoryItem {
  id: string;
  title: string;
  date: string;
  completedSteps: number;
  totalSteps: number;
  emsActions: number;
  toyActions: number;
  ending: 'completed' | 'safe_stop' | 'safety_stop';
  rating?: number;
  note?: string;
}

const HISTORY_KEY = 'ycy_scene_director_v2_history';
const STYLE_OPTIONS: Array<{ id: SceneDirectorStyle; label: string; description: string }> = [
  { id: 'gentle', label: '温柔陪伴', description: '更多留白和主动确认' },
  { id: 'academy', label: '芭比学院', description: '清晰课表与完成标准' },
  { id: 'story', label: '剧情章节', description: '镜头叙事与分支选择' },
];

const loadHistory = (): DirectorHistoryItem[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 20).flatMap((value): DirectorHistoryItem[] => {
      if (!value || typeof value !== 'object') return [];
      const item = value as Partial<DirectorHistoryItem>;
      if (typeof item.id !== 'string' || typeof item.title !== 'string') return [];
      return [{
        id: item.id.slice(0, 100),
        title: item.title.slice(0, 100),
        date: typeof item.date === 'string' ? item.date.slice(0, 40) : '',
        completedSteps: Math.max(0, Math.min(20, Math.floor(Number(item.completedSteps) || 0))),
        totalSteps: Math.max(1, Math.min(20, Math.floor(Number(item.totalSteps) || 1))),
        emsActions: Math.max(0, Math.min(10_000, Math.floor(Number(item.emsActions) || 0))),
        toyActions: Math.max(0, Math.min(10_000, Math.floor(Number(item.toyActions) || 0))),
        ending: item.ending === 'completed' || item.ending === 'safety_stop' ? item.ending : 'safe_stop',
        rating: Number.isFinite(Number(item.rating)) ? Math.max(1, Math.min(5, Math.round(Number(item.rating)))) : undefined,
        note: typeof item.note === 'string' ? item.note.slice(0, 500) : undefined,
      }];
    });
  } catch {
    return [];
  }
};

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
};

const resultRejected = (value: unknown): boolean => typeof value === 'string' && value.includes('拒绝');
const HARDWARE_OUTPUT_CEILING = 100;

export const SceneDirectorTab: React.FC<SceneDirectorTabProps> = ({
  style,
  growth,
  effectiveBpm,
  heartRateThreshold,
  updateStyle,
  addAudit,
}) => {
  const safetyConfig = useAppStore((store) => store.safetyConfig);
  const deviceState = useAppStore((store) => store.deviceState);
  const llmConfig = useAppStore((store) => store.llmConfig);
  const customPersonas = useAppStore((store) => store.customPersonas);
  const heartRateState = useAppStore((store) => store.heartRateState);

  const [screen, setScreen] = useState<DirectorScreen>('setup');
  const [theme, setTheme] = useState<SceneDirectorTheme>('academy');
  const [relationship, setRelationship] = useState<SceneDirectorRelationship>('mentor');
  const [pacing, setPacing] = useState<SceneDirectorPacing>('balanced');
  const [branchMode, setBranchMode] = useState<SceneDirectorBranchMode>('agency');
  const [targetMinutes, setTargetMinutes] = useState(10);
  const [customPremise, setCustomPremise] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [toyEnabled, setToyEnabled] = useState(false);
  const [emsEnabled, setEmsEnabled] = useState(false);
  const [hardwareConfirmed, setHardwareConfirmed] = useState(false);
  const [plan, setPlan] = useState<SceneDirectorPlan | null>(null);
  const [onlineStatus, setOnlineStatus] = useState('');
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const [paused, setPaused] = useState(false);
  const [intensityScale, setIntensityScale] = useState(1);
  const [lastChoiceResponse, setLastChoiceResponse] = useState('');
  const [stats, setStats] = useState({ emsActions: 0, toyActions: 0, completedSteps: 0 });
  const [history, setHistory] = useState<DirectorHistoryItem[]>(loadHistory);
  const [rating, setRating] = useState(4);
  const [reviewNote, setReviewNote] = useState('');
  const [ending, setEnding] = useState<DirectorHistoryItem['ending']>('completed');

  const runGenerationRef = useRef(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 记录已经因倒计时归零而推进过的幕，避免同一幕被推进两次。
  const completedStepRef = useRef(-1);
  const toyCadenceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEmsAtRef = useRef(0);
  const statsRef = useRef(stats);
  const stepIndexRef = useRef(stepIndex);
  const screenRef = useRef(screen);
  const planRef = useRef(plan);
  const intensityScaleRef = useRef(intensityScale);
  const hardwareRef = useRef({ toyEnabled, emsEnabled });
  statsRef.current = stats;
  stepIndexRef.current = stepIndex;
  screenRef.current = screen;
  planRef.current = plan;
  intensityScaleRef.current = intensityScale;
  hardwareRef.current = { toyEnabled, emsEnabled };

  const hardwareRequested = toyEnabled || emsEnabled;
  const focusAreas = Object.entries(growth).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([name]) => name);
  const currentStep = plan?.steps[stepIndex] || null;
  const totalTimedSec = plan?.steps.reduce((sum, step) => sum + step.durationSec, 0) || 0;
  const totalActionSteps = plan?.steps.filter((step) => step.kind !== 'review').length || 0;
  const selectedTheme = SCENE_DIRECTOR_THEMES.find((item) => item.id === theme);
  const selectedRelationship = SCENE_DIRECTOR_RELATIONSHIPS.find((item) => item.id === relationship);
  const selectedPacing = SCENE_DIRECTOR_PACING_OPTIONS.find((item) => item.id === pacing);
  const selectedBranch = SCENE_DIRECTOR_BRANCH_OPTIONS.find((item) => item.id === branchMode);

  const clearRuntimeTimers = () => {
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    if (toyCadenceRef.current) clearInterval(toyCadenceRef.current);
    stepTimerRef.current = null;
    toyCadenceRef.current = null;
  };

  const stopOutputs = async () => {
    clearRuntimeTimers();
    const manager = DeviceManager.getInstance();
    await Promise.allSettled([
      manager.setEmsStrength('AB', 0),
      manager.stopToy(),
    ]);
  };

  const speak = (text: string) => {
    if (voiceEnabled) void TTSManager.getInstance().speak(text);
  };

  const recordHardwareError = (error: unknown) => {
    setSessionMessage(`硬件动作未执行：${error instanceof Error ? error.message : String(error)}`);
  };

  const runToyBurst = async (step: SceneDirectorStep, generation: number) => {
    if (!hardwareRef.current.toyEnabled || step.toyLevel === 'off' || generation !== runGenerationRef.current) return;
    const manager = DeviceManager.getInstance();
    const currentSafety = manager.getSafetyConfig();
    if (currentSafety.emergencyLock) return;
    const moduleCeiling = Math.round(HARDWARE_OUTPUT_CEILING / 5);
    const absoluteMaximum = Math.min(moduleCeiling, currentSafety.maxToyMotorCRate);
    const levelCeiling = getSceneDirectorLevelCeiling(step.toyLevel, absoluteMaximum);
    const requestedMaximum = Math.min(absoluteMaximum, Math.max(currentSafety.minToyMotorRate, Math.round(levelCeiling * intensityScaleRef.current)));
    const rate = manager.getRandomToyMotorRate('C', requestedMaximum);
    if (rate <= 0) return;
    try {
      const result = await manager.setToyMotor(0, 0, rate);
      if (resultRejected(result)) throw new Error(String(result));
      if (generation !== runGenerationRef.current) {
        await manager.stopToy();
        return;
      }
      manager.scheduleOutputStop('toy', 3);
      setStats((previous) => ({ ...previous, toyActions: previous.toyActions + 1 }));
    } catch (error) {
      recordHardwareError(error);
    }
  };

  const runEmsCue = async (step: SceneDirectorStep, generation: number) => {
    if (!hardwareRef.current.emsEnabled || step.emsLevel === 'off' || generation !== runGenerationRef.current) return;
    const now = Date.now();
    if (now - lastEmsAtRef.current < 10_000) return;
    const manager = DeviceManager.getInstance();
    const currentSafety = manager.getSafetyConfig();
    if (currentSafety.emergencyLock) return;
    const strength = manager.getRandomEmsStrength(HARDWARE_OUTPUT_CEILING);
    if (strength <= 0) return;
    lastEmsAtRef.current = now;
    try {
      const waveResult = await manager.sendEmsWave('AB', step.kind === 'finale' ? 'pulse_train' : 'breathe');
      if (resultRejected(waveResult)) throw new Error(String(waveResult));
      const strengthResult = await manager.setEmsStrength('AB', strength);
      if (resultRejected(strengthResult)) throw new Error(String(strengthResult));
      if (generation !== runGenerationRef.current) {
        await manager.setEmsStrength('AB', 0);
        return;
      }
      manager.scheduleOutputStop('ems', 2);
      setStats((previous) => ({ ...previous, emsActions: previous.emsActions + 1 }));
    } catch (error) {
      lastEmsAtRef.current = 0;
      recordHardwareError(error);
      void manager.setEmsStrength('AB', 0).catch(() => undefined);
    }
  };

  const startStepOutputs = (step: SceneDirectorStep, generation: number) => {
    if (step.toyLevel !== 'off') {
      void runToyBurst(step, generation);
      toyCadenceRef.current = setInterval(() => {
        if (screenRef.current === 'running' && !document.hidden) void runToyBurst(step, generation);
      }, 8_000);
    }
    if (step.emsLevel !== 'off') {
      window.setTimeout(() => void runEmsCue(step, generation), 1_000);
    }
  };

  const buildPlan = () => {
    const next = buildLocalSceneDirectorPlan({ style, theme, relationship, pacing, branchMode, targetMinutes, focusAreas, customPremise });
    setPlan(next);
    setOnlineStatus('已生成本地自适应分镜；离线可用。');
    setScreen('preview');
  };

  const generateOnline = async () => {
    const fallback = buildLocalSceneDirectorPlan({ style, theme, relationship, pacing, branchMode, targetMinutes, focusAreas, customPremise });
    setPlan(fallback);
    if (!llmConfig.apiKey) {
      setOnlineStatus('未配置 API Key，已使用本地自适应分镜。');
      setScreen('preview');
      return;
    }
    setOnlineStatus('AI 正在改编台词和分支；硬件工具权限保持关闭。');
    setScreen('preview');
    try {
      const client = new LLMClient(llmConfig, { hardwareToolsEnabled: false });
      const result = await client.sendMessage([{
        id: `scene-director-${Date.now()}`,
        role: 'user',
        timestamp: Date.now(),
        content: `请根据玩家选择改编这份分镜。剧情主题=${selectedTheme?.title || theme}；角色关系=${selectedRelationship?.title || relationship}；叙事节奏=${selectedPacing?.title || pacing}；分支玩法=${selectedBranch?.title || branchMode}；导演风格=${style}；目标分钟=${targetMinutes}；成长重点=${focusAreas.join('/')}；玩家剧情设定=${customPremise || '无'}；基础分镜=${JSON.stringify(fallback)}`,
      }], customPersonas, `你是互动场景导演。只输出一个 JSON 对象，不要 Markdown。玩家选择的剧情主题、角色关系、叙事节奏和分支玩法必须实际体现在 synopsis、台词与 choice 中。必须保留 version、title、synopsis、steps；steps 为 5-10 项，第一项 kind=checkin，最后一项 kind=review，且必须包含 cooldown。kind 只能是 checkin/warmup/calibration/scene/choice/finale/cooldown/review；toyLevel 和 emsLevel 只能是 off/low/medium/high；不得输出原始强度、设备命令、公开活动、危险动作、诊断或惩罚性超时。choice 至少两个选项，每个选择都必须安全有效，并清楚说明会怎样改变下一幕。`);
      const normalized = parseSceneDirectorPlanJson(result.reply, fallback);
      setPlan(normalized);
      setOnlineStatus(normalized === fallback ? 'AI 返回格式未通过校验，已安全回退本地分镜。' : 'AI 改编完成；所有动作已通过本地白名单校验。');
    } catch (error) {
      setOnlineStatus(`AI 改编失败，已保留本地分镜：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const validatePreflight = (): string | null => {
    if (!plan) return '请先生成分镜。';
    if (!hardwareRequested) return null;
    if (!hardwareConfirmed) return '请先确认本次会话的硬件授权。';
    if (safetyConfig.emergencyLock) return '全局急停锁已激活，请先到硬件调控解除。';
    if (deviceState.connectionMode === 'bridge') return '场景导演暂不直接控制 Bridge 事件，请改用纯文字模式或 BLE。';
    if (deviceState.connectionMode === 'ble' && emsEnabled && !deviceState.devices.ems.isConnected) return 'EMS 尚未连接。';
    if (deviceState.connectionMode === 'ble' && toyEnabled && !deviceState.devices.toy.isConnected) return '榨精机尚未连接。';
    return null;
  };

  const startSession = () => {
    const error = validatePreflight();
    if (error) {
      setSessionMessage(error);
      return;
    }
    runGenerationRef.current++;
    setStats({ emsActions: 0, toyActions: 0, completedSteps: 0 });
    setStepIndex(0);
    completedStepRef.current = -1;
    setRemainingSec(plan!.steps[0].durationSec);
    setIntensityScale(1);
    setPaused(false);
    setEnding('completed');
    setLastChoiceResponse('');
    setSessionMessage(hardwareRequested ? '本次硬件授权仅在当前会话有效。' : '纯文字导演模式，不会控制硬件。');
    setScreen('running');
    addAudit(`开始场景导演 2.0：${plan!.title}${hardwareRequested ? '（本次硬件已确认）' : '（纯文字）'}`);
  };

  const moveToStep = (nextIndex: number) => {
    void stopOutputs();
    if (!plan || nextIndex >= plan.steps.length) {
      setEnding('completed');
      setScreen('review');
      return;
    }
    setStepIndex(nextIndex);
    const next = plan.steps[nextIndex];
    setRemainingSec(next.durationSec);
    if (next.kind === 'choice') setScreen('choice');
    else if (next.kind === 'review') setScreen('review');
    else setScreen('running');
  };

  const completeCurrentStep = () => {
    if (!currentStep) return;
    setStats((previous) => ({ ...previous, completedSteps: Math.max(previous.completedSteps, stepIndex + 1) }));
    if (currentStep.checkpoint) {
      void stopOutputs();
      setScreen('checkpoint');
      return;
    }
    moveToStep(stepIndex + 1);
  };

  const applyFeedback = (feedback: SessionFeedback) => {
    if (feedback === 'softer') {
      setIntensityScale((value) => Math.max(0.5, value - 0.2));
      setLastChoiceResponse('导演已降低后续节奏，并增加留白。');
    } else if (feedback === 'stronger') {
      setIntensityScale((value) => Math.min(1.2, value + 0.1));
      setLastChoiceResponse('导演只提高一级，仍不会超过本次和全局上限。');
    } else {
      setLastChoiceResponse('导演将保持当前节奏。');
    }
    moveToStep(stepIndex + 1);
  };

  const applyChoice = (choice: SceneDirectorChoice) => {
    if (choice.intensityEffect === 'softer') setIntensityScale((value) => Math.max(0.5, value - 0.2));
    if (choice.intensityEffect === 'stronger') setIntensityScale((value) => Math.min(1.2, value + 0.1));
    setLastChoiceResponse(choice.response);
    const nextIndex = stepIndex + 1;
    setPlan((currentPlan) => currentPlan ? {
      ...currentPlan,
      steps: currentPlan.steps.map((step, index) => index === nextIndex && step.kind !== 'cooldown' && step.kind !== 'review'
        ? { ...step, direction: `${choice.response} ${step.direction}` }
        : step),
    } : currentPlan);
    setStats((previous) => ({ ...previous, completedSteps: Math.max(previous.completedSteps, stepIndex + 1) }));
    moveToStep(nextIndex);
  };

  const pauseSession = () => {
    setPaused(true);
    setSessionMessage('会话已暂停，所有输出已归零。');
    void stopOutputs();
  };

  const resumeSession = () => {
    setPaused(false);
    setSessionMessage('会话继续。当前幕会从剩余时间恢复。');
  };

  const safeEnd = (reason: DirectorHistoryItem['ending'], message: string) => {
    runGenerationRef.current++;
    setEnding(reason);
    setSessionMessage(message);
    setScreen('review');
    setPaused(false);
    void stopOutputs();
    TTSManager.getInstance().stop();
    addAudit(`场景导演安全结束：${message}`);
  };

  const saveReview = () => {
    if (!plan) {
      setScreen('setup');
      return;
    }
    const item: DirectorHistoryItem = {
      id: `director-${Date.now()}`,
      title: plan.title,
      date: new Date().toLocaleString('zh-CN'),
      completedSteps: statsRef.current.completedSteps,
      totalSteps: plan.steps.filter((step) => step.kind !== 'review').length,
      emsActions: statsRef.current.emsActions,
      toyActions: statsRef.current.toyActions,
      ending,
      rating,
      note: reviewNote.trim().slice(0, 500),
    };
    const next = [item, ...history].slice(0, 20);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
    addAudit(`保存导演复盘：${plan.title}，评分 ${rating}/5`);
    setReviewNote('');
    setHardwareConfirmed(false);
    setToyEnabled(false);
    setEmsEnabled(false);
    setPlan(null);
    setScreen('setup');
  };

  useEffect(() => {
    if (screen !== 'running' || !currentStep || paused) return;
    const generation = runGenerationRef.current;
    speak(`${currentStep.title}。${currentStep.direction}`);
    startStepOutputs(currentStep, generation);
    return () => clearRuntimeTimers();
  }, [screen, stepIndex, paused]);

  useEffect(() => {
    if (screen !== 'running' || paused || !currentStep || currentStep.durationSec <= 0) return;
    // updater 必须保持纯函数：这里只做数值递减。
    // 若在 updater 内清定时器或推进步骤，React 重复调用 updater（严格模式 / 并发渲染）
    // 会把同一幕推进两次；本模块驱动硬件输出编排，重复推进不可接受。
    stepTimerRef.current = setInterval(() => {
      setRemainingSec((value) => (value <= 1 ? 0 : value - 1));
    }, 1_000);
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    };
  }, [screen, stepIndex, paused]);

  // 倒计时归零后停止计时并推进到下一幕。放在独立 effect 中，保证一次归零只推进一次。
  useEffect(() => {
    if (screen !== 'running' || paused || !currentStep || currentStep.durationSec <= 0) return;
    if (remainingSec > 0) return;
    if (completedStepRef.current === stepIndex) return;
    completedStepRef.current = stepIndex;
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    stepTimerRef.current = null;
    completeCurrentStep();
    // completeCurrentStep 会同步切换 stepIndex / remainingSec，依赖变化后本 effect 自然重新求值。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, screen, paused, stepIndex]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && screenRef.current === 'running') {
        setPaused(true);
        setSessionMessage('应用进入后台，会话已自动暂停并停止全部输出。');
        void stopOutputs();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (safetyConfig.emergencyLock && ['running', 'checkpoint', 'choice'].includes(screen)) {
      safeEnd('safety_stop', '全局急停锁触发，本次会话已安全停止。');
    }
  }, [safetyConfig.emergencyLock]);

  useEffect(() => {
    const realHeartRateDanger = heartRateState.isConnected && !heartRateState.isSimulator && effectiveBpm >= heartRateThreshold;
    if (realHeartRateDanger && screen === 'running') {
      setPaused(true);
      setSessionMessage(`心率达到 ${effectiveBpm} BPM，会话已暂停并停止输出。`);
      void stopOutputs();
    }
  }, [effectiveBpm, heartRateState.isConnected, heartRateState.isSimulator, heartRateThreshold, screen]);

  useEffect(() => {
    const unsubscribe = DeviceManager.getInstance().subscribeEmergencyStop(() => {
      if (['running', 'checkpoint', 'choice'].includes(screenRef.current)) {
        safeEnd('safety_stop', '检测到全局急停，本次会话已安全停止。');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => () => {
    runGenerationRef.current++;
    clearRuntimeTimers();
    TTSManager.getInstance().stop();
    void stopOutputs();
  }, []);

  const renderSetup = () => (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] font-black tracking-[0.16em] text-pink-500">DIRECTOR STYLE</p>
        <div className="grid grid-cols-3 gap-2">
          {STYLE_OPTIONS.map((option) => <button key={option.id} onClick={() => updateStyle(option.id)} className={`rounded-2xl border p-2.5 text-left ${style === option.id ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-slate-100 bg-white text-slate-500'}`}><p className="text-[10px] font-black">{option.label}</p><p className="mt-1 text-[9px] leading-relaxed opacity-75">{option.description}</p></button>)}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-black tracking-[0.16em] text-pink-500">剧情主题</p><span className="text-[9px] font-bold text-slate-400">选择故事主线</span></div>
        <div className="grid grid-cols-2 gap-2">
          {SCENE_DIRECTOR_THEMES.map((item) => <button key={item.id} onClick={() => setTheme(item.id)} className={`rounded-2xl border p-3 text-left ${theme === item.id ? 'border-fuchsia-400 bg-fuchsia-50' : 'border-slate-100 bg-white'}`}><span className="text-xl">{item.icon}</span><p className="mt-1 text-[11px] font-black text-[#263247]">{item.title}</p><p className="mt-1 text-[9px] leading-relaxed text-slate-500">{item.synopsis}</p></button>)}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-black tracking-[0.16em] text-pink-500">角色关系</p><span className="text-[9px] font-bold text-slate-400">决定对话视角</span></div>
        <div className="grid grid-cols-2 gap-2">
          {SCENE_DIRECTOR_RELATIONSHIPS.map((item) => <button key={item.id} onClick={() => setRelationship(item.id)} className={`rounded-2xl border p-3 text-left ${relationship === item.id ? 'border-pink-400 bg-pink-50' : 'border-slate-100 bg-white'}`}><p className="text-[11px] font-black text-[#263247]">{item.title}</p><p className="mt-1 text-[9px] leading-relaxed text-slate-500">{item.synopsis}</p></button>)}
        </div>
      </div>

      <div className="rounded-3xl border border-pink-100 bg-white p-3">
        <p className="text-[10px] font-black tracking-[0.16em] text-pink-500">叙事节奏</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SCENE_DIRECTOR_PACING_OPTIONS.map((item) => <button key={item.id} onClick={() => setPacing(item.id)} className={`rounded-xl px-2 py-2.5 text-center ${pacing === item.id ? 'bg-[#202636] text-white shadow-md' : 'bg-slate-50 text-slate-600'}`}><span className="block text-[10px] font-black">{item.title}</span><span className={`mt-1 block text-[8px] leading-relaxed ${pacing === item.id ? 'text-[#d5d9e2]' : 'text-slate-400'}`}>{item.synopsis}</span></button>)}
        </div>
      </div>

      <div className="rounded-3xl border border-pink-100 bg-white p-3">
        <div className="flex items-center justify-between"><p className="text-[10px] font-black tracking-[0.16em] text-pink-500">分支玩法</p><span className="text-[9px] font-bold text-slate-400">选择会改写下一幕</span></div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SCENE_DIRECTOR_BRANCH_OPTIONS.map((item) => <button key={item.id} onClick={() => setBranchMode(item.id)} className={`rounded-xl border px-2 py-2.5 text-center ${branchMode === item.id ? 'border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700' : 'border-slate-100 bg-slate-50 text-slate-600'}`}><span className="block text-[10px] font-black">{item.title}</span><span className="mt-1 block text-[8px] leading-relaxed opacity-70">{item.synopsis}</span></button>)}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-black tracking-[0.16em] text-pink-500">自定义剧情前提</p><span className="text-[9px] font-bold text-slate-400">可留空 · {customPremise.length}/240</span></div>
        <textarea value={customPremise} onChange={(event) => setCustomPremise(event.target.value)} maxLength={240} placeholder={theme === 'studio' ? '写下完整开场，例如：私人摄影棚里的造型试镜……' : '添加人物秘密、事件目标或想出现的转折，导演会融入所选主题……'} className="min-h-24 w-full rounded-2xl border border-pink-200 bg-pink-50/50 p-3 text-xs font-medium leading-relaxed text-[#263247] outline-none placeholder:text-slate-400 focus:border-pink-400" />
      </div>

      <div className="rounded-2xl bg-slate-50 p-3">
        <div className="flex items-center justify-between"><span className="text-[11px] font-black text-slate-600">目标时长</span><span className="font-mono text-xs font-black text-pink-600">{targetMinutes} 分钟</span></div>
        <input aria-label="导演目标时长" type="range" min="5" max="20" step="5" value={targetMinutes} onChange={(event) => setTargetMinutes(Number(event.target.value))} className="mt-2 w-full accent-pink-500" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between"><p className="text-[11px] font-black text-[#263247]">本次输出授权</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">受全局急停与硬件上限保护</span></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 px-2 py-2 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={voiceEnabled} onChange={(event) => setVoiceEnabled(event.target.checked)} className="accent-pink-500" />语音</label>
          <label className="flex items-center justify-center gap-1.5 rounded-xl bg-pink-50 px-2 py-2 text-[10px] font-bold text-pink-700"><input type="checkbox" checked={toyEnabled} onChange={(event) => { setToyEnabled(event.target.checked); setHardwareConfirmed(false); }} className="accent-pink-500" />马达</label>
          <label className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-50 px-2 py-2 text-[10px] font-bold text-rose-700"><input type="checkbox" checked={emsEnabled} onChange={(event) => { setEmsEnabled(event.target.checked); setHardwareConfirmed(false); }} className="accent-rose-500" />EMS</label>
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-slate-500">默认纯文字。EMS 每幕最多一个 2 秒脉冲且至少间隔 10 秒；马达采用 3 秒输出、5 秒休息的节奏。</p>
      </div>

      <div className="grid grid-cols-2 gap-2"><button onClick={buildPlan} className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 py-3 text-[11px] font-black text-white"><Bot className="h-4 w-4" />生成我的剧情</button><button onClick={() => void generateOnline()} className="flex items-center justify-center gap-1.5 rounded-2xl border border-pink-200 bg-white py-3 text-[11px] font-black text-pink-600"><Sparkles className="h-4 w-4" />AI 深度改编</button></div>

      {history.length > 0 && <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black text-slate-500">最近片场</p>{history.slice(0, 3).map((item) => <div key={item.id} className="mt-2 flex items-center justify-between text-[10px]"><span className="font-bold text-slate-600">{item.title}</span><span className="text-slate-400">{item.ending === 'completed' ? '完成' : '安全结束'} · {item.completedSteps}/{item.totalSteps}</span></div>)}</div>}
    </div>
  );

  const renderPreview = () => plan && (
    <div className="space-y-3">
      <div className="rounded-3xl bg-gradient-to-br from-pink-500 to-fuchsia-600 p-4 text-white"><p className="text-[9px] font-black tracking-[0.16em] text-pink-100">TODAY'S CALL SHEET</p><h5 className="mt-1 text-base font-black">{plan.title}</h5><p className="mt-2 text-[10px] leading-relaxed text-pink-50">{plan.synopsis}</p><div className="mt-3 flex gap-2 text-[9px] font-bold"><span className="rounded-full bg-white/20 px-2 py-1">{plan.steps.length} 个分镜</span><span className="rounded-full bg-white/20 px-2 py-1">约 {Math.round(totalTimedSec / 60)} 分钟</span><span className="rounded-full bg-white/20 px-2 py-1">强度 ×{intensityScale.toFixed(1)}</span></div></div>
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-pink-100 bg-pink-50/60 p-3 text-center">
        <div><p className="text-[8px] font-bold text-slate-400">角色关系</p><p className="mt-1 text-[10px] font-black text-[#263247]">{SCENE_DIRECTOR_RELATIONSHIPS.find((item) => item.id === plan.relationship)?.title}</p></div>
        <div><p className="text-[8px] font-bold text-slate-400">叙事节奏</p><p className="mt-1 text-[10px] font-black text-[#263247]">{SCENE_DIRECTOR_PACING_OPTIONS.find((item) => item.id === plan.pacing)?.title}</p></div>
        <div><p className="text-[8px] font-bold text-slate-400">分支玩法</p><p className="mt-1 text-[10px] font-black text-[#263247]">{SCENE_DIRECTOR_BRANCH_OPTIONS.find((item) => item.id === plan.branchMode)?.title}</p></div>
      </div>
      {onlineStatus && <p className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">{onlineStatus}</p>}
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{plan.steps.map((step, index) => <div key={step.id} className="flex gap-2 rounded-2xl border border-pink-100 bg-white p-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-pink-500 text-[10px] font-black text-white">{index + 1}</span><div><div className="flex flex-wrap items-center gap-1"><p className="text-[11px] font-black text-[#263247]">{step.title}</p>{toyEnabled && step.toyLevel !== 'off' && <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[8px] font-bold text-pink-600">马达 {step.toyLevel}</span>}{emsEnabled && step.emsLevel !== 'off' && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[8px] font-bold text-rose-600">EMS {step.emsLevel}</span>}</div><p className="mt-1 text-[9px] leading-relaxed text-slate-500">{step.direction}</p><p className="mt-1 text-[8px] font-bold text-slate-400">{step.durationSec ? formatTime(step.durationSec) : step.kind === 'choice' ? '等待选择' : '手动完成'}</p></div></div>)}</div>
      {hardwareRequested && <label className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-bold leading-relaxed text-amber-800"><input type="checkbox" checked={hardwareConfirmed} onChange={(event) => setHardwareConfirmed(event.target.checked)} className="mt-0.5 accent-amber-500" />我已检查设备连接、急停锁和硬件上下限，并仅授权本次会话使用所选设备。</label>}
      {sessionMessage && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[10px] text-rose-700">{sessionMessage}</p>}
      <div className="grid grid-cols-2 gap-2"><button onClick={() => { setSessionMessage(null); setScreen('setup'); }} className="rounded-2xl bg-[#eef1f5] py-3 text-xs font-black text-[#475569]">返回修改</button><button onClick={startSession} className="rounded-2xl bg-pink-500 py-3 text-xs font-black text-white">确认开拍</button></div>
    </div>
  );

  const renderRuntime = () => currentStep && plan && (
    <div className="space-y-3">
      <div className="rounded-3xl bg-[#171b28] p-4 text-white shadow-xl">
        <div className="flex items-center justify-between text-[10px] font-black text-pink-300"><span>{plan.title}</span><span>{stepIndex + 1}/{plan.steps.length}</span></div>
        <div className="mt-3 flex gap-1">{plan.steps.map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index < stepIndex ? 'bg-emerald-400' : index === stepIndex ? 'bg-pink-400' : 'bg-[#3b4354]'}`} />)}</div>
        <div className="mt-5 text-center"><p className="text-[10px] font-black tracking-[0.18em] text-slate-400">{currentStep.kind.toUpperCase()}</p><h5 className="mt-1 text-xl font-black">{currentStep.title}</h5>{currentStep.durationSec > 0 && <p className="mt-2 font-mono text-3xl font-black text-pink-400">{formatTime(remainingSec)}</p>}</div>
        <p className="mt-4 rounded-2xl bg-white/5 p-4 text-sm font-bold leading-7 text-slate-100">{currentStep.direction}</p>
        {lastChoiceResponse && <p className="mt-3 rounded-xl bg-pink-500/10 px-3 py-2 text-[10px] leading-relaxed text-pink-200">{lastChoiceResponse}</p>}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[9px]"><div className="rounded-xl bg-white/5 p-2"><p className="text-[#aab4c3]">节奏倍率</p><p className="mt-1 font-black text-pink-300">×{intensityScale.toFixed(1)}</p></div><div className="rounded-xl bg-white/5 p-2"><p className="text-[#aab4c3]">EMS 实际</p><p className="mt-1 font-black text-rose-300">{stats.emsActions}</p></div><div className="rounded-xl bg-white/5 p-2"><p className="text-[#aab4c3]">马达实际</p><p className="mt-1 font-black text-fuchsia-300">{stats.toyActions}</p></div></div>
      </div>
      {sessionMessage && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-800">{sessionMessage}</p>}
      <div className="grid grid-cols-3 gap-2"><button onClick={() => setIntensityScale((value) => Math.max(0.5, value - 0.2))} className="rounded-xl bg-[#eef1f5] py-2 text-[10px] font-black text-[#475569]">减弱</button><button onClick={paused ? resumeSession : pauseSession} className="flex items-center justify-center gap-1 rounded-xl bg-amber-100 py-2 text-[10px] font-black text-amber-800">{paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}{paused ? '继续' : '暂停'}</button><button onClick={() => setIntensityScale((value) => Math.min(1.2, value + 0.1))} className="rounded-xl bg-pink-100 py-2 text-[10px] font-black text-pink-700">渐进</button></div>
      <div className="grid grid-cols-2 gap-2"><button onClick={completeCurrentStep} className="flex items-center justify-center gap-1 rounded-xl border border-pink-200 bg-white py-2.5 text-[10px] font-black text-pink-600">跳过本幕<ChevronRight className="h-3 w-3" /></button><button onClick={() => safeEnd('safe_stop', '用户主动安全结束；这不是失败。')} className="flex items-center justify-center gap-1 rounded-xl bg-rose-600 py-2.5 text-[10px] font-black text-white"><CircleStop className="h-3.5 w-3.5" />安全结束</button></div>
    </div>
  );

  const renderCheckpoint = () => currentStep && (
    <div className="space-y-3 rounded-3xl border border-pink-200 bg-pink-50 p-4"><div className="flex items-center gap-2"><Gauge className="h-5 w-5 text-pink-500" /><div><p className="text-xs font-black text-[#263247]">幕间状态确认</p><p className="text-[10px] text-slate-500">没有正确答案，反馈只影响后续节奏。</p></div></div><p className="rounded-2xl bg-white p-3 text-[11px] leading-relaxed text-slate-600">“{currentStep.title}”已结束，现在感觉如何？</p><div className="grid grid-cols-3 gap-2"><button onClick={() => applyFeedback('softer')} className="rounded-xl bg-cyan-100 py-2.5 text-[10px] font-black text-cyan-800">太强了</button><button onClick={() => applyFeedback('good')} className="rounded-xl bg-emerald-100 py-2.5 text-[10px] font-black text-emerald-800">正合适</button><button onClick={() => applyFeedback('stronger')} className="rounded-xl bg-pink-500 py-2.5 text-[10px] font-black text-white">可以渐进</button></div><button onClick={() => safeEnd('safe_stop', '用户在幕间确认时安全结束。')} className="w-full rounded-xl bg-[#e9edf2] py-2 text-[10px] font-black text-[#475569]">就此结束并进入复盘</button></div>
  );

  const renderChoice = () => currentStep && (
    <div className="space-y-3 rounded-3xl bg-[#171b28] p-4 text-white"><p className="text-[9px] font-black tracking-[0.18em] text-amber-400">BRANCHING SHOT</p><h5 className="text-base font-black">{currentStep.title}</h5><p className="text-[11px] leading-relaxed text-[#d5d9e2]">{currentStep.direction}</p><div className="space-y-2">{currentStep.choices?.map((choice) => <button key={choice.id} onClick={() => applyChoice(choice)} className="w-full rounded-2xl border border-[#3b4354] bg-[#252b3b] p-3 text-left text-[11px] font-bold text-white">{choice.label}<span className="mt-1 block text-[9px] font-normal text-[#aab4c3]">{choice.intensityEffect === 'softer' ? '后续放缓' : choice.intensityEffect === 'stronger' ? '后续一级渐进' : '保持节奏'}</span></button>)}</div><p className="text-center text-[9px] text-[#aab4c3]">没有倒计时，也不会因未选择而触发硬件。</p><button onClick={() => safeEnd('safe_stop', '用户在剧情分支处安全结束。')} className="w-full rounded-xl bg-rose-900/60 py-2 text-[10px] font-black text-rose-300">安全结束</button></div>
  );

  const renderReview = () => (
    <div className="space-y-3"><div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-pink-50 p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /><div><p className="text-sm font-black text-[#263247]">{ending === 'completed' ? '片场顺利收工' : '片场已安全结束'}</p><p className="text-[10px] text-slate-500">主动停止和安全触发都不会记作失败。</p></div></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white p-2"><p className="text-[9px] text-slate-400">完成分镜</p><p className="text-sm font-black text-pink-600">{stats.completedSteps}/{totalActionSteps}</p></div><div className="rounded-xl bg-white p-2"><p className="text-[9px] text-slate-400">EMS 实际</p><p className="text-sm font-black text-rose-600">{stats.emsActions}</p></div><div className="rounded-xl bg-white p-2"><p className="text-[9px] text-slate-400">马达实际</p><p className="text-sm font-black text-fuchsia-600">{stats.toyActions}</p></div></div></div>{sessionMessage && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] text-amber-800">{sessionMessage}</p>}<div className="rounded-2xl border border-pink-100 bg-white p-3"><p className="text-[10px] font-black text-slate-600">本次体验评分</p><div className="mt-2 flex gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} onClick={() => setRating(value)} className={`h-8 flex-1 rounded-xl text-xs font-black ${rating >= value ? 'bg-pink-500 text-white' : 'bg-pink-50 text-pink-300'}`}>{value}</button>)}</div><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={500} placeholder="哪一幕最合适？下次希望如何调整？（可留空）" className="mt-3 min-h-20 w-full rounded-xl bg-slate-50 p-3 text-xs text-[#263247] outline-none" /></div><button onClick={saveReview} className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-pink-500 py-3 text-xs font-black text-white"><Check className="h-4 w-4" />保存复盘并返回</button></div>
  );

  return <div><div className="mb-4 flex items-start justify-between gap-3"><div><h4 className="text-sm font-black text-[#1f2937]">场景导演 2.1</h4><p className="mt-1 text-[11px] leading-relaxed text-slate-500">玩家选择剧情、关系、节奏与分支玩法，每次选择都会改写下一幕。</p></div><div className="rounded-xl bg-pink-50 p-2 text-pink-600"><Volume2 className="h-4 w-4" /></div></div>{screen === 'setup' && renderSetup()}{screen === 'preview' && renderPreview()}{screen === 'running' && renderRuntime()}{screen === 'checkpoint' && renderCheckpoint()}{screen === 'choice' && renderChoice()}{screen === 'review' && renderReview()}</div>;
};
