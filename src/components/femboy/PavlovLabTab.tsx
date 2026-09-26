import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { DeviceManager } from '../../core/deviceManager';
import { TTSManager } from '../../core/voice/ttsManager';
import { LLMClient } from '../../core/ai/llmClient';
import { useAppStore } from '../../store/useAppStore';
import { EMSWaveEngine } from '../../core/protocol/waveEngine';
import {
  canStartPavlovFeedback,
  createBalancedPavlovImprintTrials,
  PAVLOV_EMS_COOLDOWN_MS,
  PAVLOV_FEEDBACK_DURATION_MS,
  PAVLOV_IMPRINT_CUE_LEAD_MS,
  PAVLOV_IMPRINT_TARGET,
  PAVLOV_IMPRINT_TRIAL_INTERVAL_MS,
  PAVLOV_REWARD_COOLDOWN_MS,
} from '../../core/discipline/pavlovTiming';
import {
  analyzeFrameLight,
  createDarkHoldThresholds,
  DARK_HOLD_CALIBRATION_SAMPLES,
  DARK_HOLD_LEAK_CONFIRMATION_SAMPLES,
  DARK_HOLD_SAMPLE_INTERVAL_MS,
  isDarkHoldLightLeak,
} from '../../core/vision/darkHoldDetection';
import type { DarkHoldThresholds, FrameLightStats } from '../../core/vision/darkHoldDetection';
import {
  PAVLOV_STAGE_GROUPS,
  PAVLOV_STAGES,
  PavlovProgressEngine,
  PavlovProgressState,
  PavlovRequirement,
  PavlovStageGroup,
  PavlovStageId,
} from '../../core/discipline/pavlovProgress';
import { BellRing, HeartPulse, Brain, AlertTriangle, Play, Square, MessageCircle, Hand, Wind, Snowflake, Ghost, Dog, Mic, Volume2, ShieldBan, Bone, Disc, Target, Activity, Siren, Moon, Camera as CameraIcon, Zap } from 'lucide-react';

type PavlovPhase = 'idle' | 'imprint' | 'polygraph' | 'branding' | 'collapse' | 'social' | 'sacrifice' | 'breath' | 'inversion' | 'phantom' | 'allfours' | 'bark' | 'whistle' | 'beg' | 'fetch' | 'muzzle' | 'snout' | 'tail' | 'guard' | 'dark' | 'snap' | 'feral';

const PavlovViewContext = createContext<{
  activeGroup: 'all' | PavlovStageGroup;
  progress: PavlovProgressState;
  requirementReady: Record<PavlovRequirement, boolean>;
  onUnavailable: (message: string) => void;
}>({
  activeGroup: 'all',
  progress: { completedStageIds: [], imprintCount: 0, sessions: [] },
  requirementReady: { ems: false, toy: false, heart: false, motion: false, microphone: false, camera: false, ai: false },
  onUnavailable: () => undefined,
});

const REQUIREMENT_LABELS: Record<string, string> = {
  ems: 'EMS', toy: '马达', heart: '心率', motion: '动作', microphone: '麦克风', camera: '摄像头', ai: 'AI',
};

const Panel: React.FC<{ title: string; caption: string; children: React.ReactNode }> = ({ title, caption, children }) => {
  const { activeGroup, progress, requirementReady, onUnavailable } = useContext(PavlovViewContext);
  const stageNumber = Number(title.match(/阶段\s*(\d+)/)?.[1]);
  const definition = PAVLOV_STAGES.find((stage) => stage.number === stageNumber);
  if (definition && activeGroup !== 'all' && definition.group !== activeGroup) return null;
  const completed = definition ? progress.completedStageIds.includes(definition.id) : false;
  let missingRequirements = definition?.requirements.filter((item) => item !== 'ems' && item !== 'toy' && !requirementReady[item]) || [];
  if (definition?.id === 'polygraph' && (requirementReady.heart || requirementReady.motion)) {
    missingRequirements = missingRequirements.filter((item) => item !== 'heart' && item !== 'motion');
  }
  return (
    <div className="mb-4" onClickCapture={(event) => {
      if (missingRequirements.length === 0) return;
      if (!(event.target as HTMLElement).closest('button')) return;
      event.preventDefault();
      event.stopPropagation();
      onUnavailable(`当前缺少：${missingRequirements.map((item) => REQUIREMENT_LABELS[item]).join('、')}。请连接或配置后再开始。`);
    }}>
      <div className="mb-3 px-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-black text-slate-800">{definition ? `阶段 ${definition.number}：${definition.title}` : title}</h3>
          {completed && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700">已完成</span>}
        </div>
        <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">{caption}</p>
        {definition && <p className="mt-1 text-[9px] font-bold text-slate-400">约 {definition.durationMinutes} 分钟 · {definition.requirements.map((item) => REQUIREMENT_LABELS[item]).join(' / ')}</p>}
        {missingRequirements.length > 0 && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">暂不可用：缺少 {missingRequirements.map((item) => REQUIREMENT_LABELS[item]).join('、')}</p>}
      </div>
      {children}
    </div>
  );
};

export const PavlovLabTab: React.FC = () => {
  const progressEngine = PavlovProgressEngine.getInstance();
  const [phase, setPhase] = useState<PavlovPhase>('idle');
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<'all' | PavlovStageGroup>('all');
  const [progress, setProgress] = useState<PavlovProgressState>(() => progressEngine.getState());
  const [resetArmed, setResetArmed] = useState(false);
  const [imprintCue, setImprintCue] = useState<'reward' | 'punish' | null>(null);
  const [darkHoldStatus, setDarkHoldStatus] = useState('等待开始');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const managedListenersRef = useRef<Array<{ type: string; listener: EventListener }>>([]);
  const managedTimeoutsRef = useRef<Set<number>>(new Set());
  const managedIntervalsRef = useRef<Set<number>>(new Set());
  const sessionGenerationRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);
  const emsStopTimerRef = useRef<number | null>(null);
  const toyStopTimerRef = useRef<number | null>(null);
  const lastEmsStartedAtRef = useRef(0);
  const lastToyStartedAtRef = useRef(0);
  const stopAllRef = useRef<() => void>(() => undefined);
  const isUnmountingRef = useRef(false);
  const phaseRef = useRef<PavlovPhase>(phase);
  phaseRef.current = phase;

  const setTimeout = (callback: () => void, delay: number): number => {
    let timer = 0;
    timer = window.setTimeout(() => {
      managedTimeoutsRef.current.delete(timer);
      callback();
    }, delay);
    managedTimeoutsRef.current.add(timer);
    return timer;
  };

  const clearTimeout = (timer: number) => {
    window.clearTimeout(timer);
    managedTimeoutsRef.current.delete(timer);
  };

  const setInterval = (callback: () => void, delay: number): number => {
    const timer = window.setInterval(callback, delay);
    managedIntervalsRef.current.add(timer);
    return timer;
  };

  const clearInterval = (timer: number) => {
    window.clearInterval(timer);
    managedIntervalsRef.current.delete(timer);
  };

  const addManagedWindowListener = (type: string, listener: EventListener) => {
    window.addEventListener(type, listener);
    managedListenersRef.current.push({ type, listener });
  };
  
  // Imprint State
  const [imprintCount, setImprintCount] = useState(() => progressEngine.getState().imprintCount);
  const imprintTarget = PAVLOV_IMPRINT_TARGET;

  // Polygraph State
  const [polygraphWait, setPolygraphWait] = useState(false);
  const polygraphMotionRef = useRef({x:0, y:0, z:0});

  // Branding State
  const [triggerWord, setTriggerWord] = useState('主人');
  const [brandingText, setBrandingText] = useState('');

  // Config
  const safetyConfig = useAppStore(s => s.safetyConfig);
  const setSafetyConfig = useAppStore(s => s.setSafetyConfig);
  const deviceState = useAppStore(s => s.deviceState);
  const heartRateState = useAppStore(s => s.heartRateState);
  const hasAiConfig = useAppStore(s => Boolean(s.llmConfig.apiKey));
  const liveHeartRate = useAppStore(s => s.heartRateState.currentBpm);

  useEffect(() => progressEngine.subscribe(setProgress), [progressEngine]);

  const playTone = (freq: number, type: OscillatorType, dur: number) => {
    if (!audioCtxRef.current) audioCtxRef.current = new window.AudioContext();
    const osc = audioCtxRef.current.createOscillator();
    const gain = audioCtxRef.current.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtxRef.current.currentTime);
    osc.connect(gain);
    gain.connect(audioCtxRef.current.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtxRef.current.currentTime + dur);
    osc.stop(audioCtxRef.current.currentTime + dur);
  };

  const triggerFlash = (color: string) => {
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.inset = '0';
    flash.style.zIndex = '9999';
    flash.style.pointerEvents = 'none';
    flash.style.backgroundColor = color;
    flash.style.opacity = '0.6';
    flash.style.transition = 'opacity 0.4s ease-out';
    document.body.appendChild(flash);
    
    // Force reflow
    void flash.getBoundingClientRect();
    
    requestAnimationFrame(() => {
      flash.style.opacity = '0';
    });
    
    window.setTimeout(() => {
      if (document.body.contains(flash)) {
        document.body.removeChild(flash);
      }
    }, 500);
  };

  const punish = (strength: number, msg?: string, options: { flash?: boolean } = {}) => {
    if (phaseRef.current === 'idle') return;
    if (options.flash !== false) triggerFlash('#ef4444');
    if (msg) void TTSManager.getInstance().speak(msg);

    const currentSafety = useAppStore.getState().safetyConfig;
    const maxStrength = Math.min(currentSafety.maxEmsStrengthA, currentSafety.maxEmsStrengthB);
    const safeStrength = DeviceManager.getInstance().getRandomEmsStrength(Math.min(maxStrength, Math.round(strength)));
    if (currentSafety.emergencyLock || safeStrength === 0) return;

    const now = Date.now();
    if (!canStartPavlovFeedback(lastEmsStartedAtRef.current, now, PAVLOV_EMS_COOLDOWN_MS)) return;
    lastEmsStartedAtRef.current = now;

    const waves = EMSWaveEngine.getAllWaves();
    const randomWave = waves[Math.floor(Math.random() * waves.length)];
    if (!randomWave) return;
    const generation = sessionGenerationRef.current;

    void (async () => {
      await DeviceManager.getInstance().sendEmsWave('AB', randomWave.id);
      if (generation !== sessionGenerationRef.current) return;
      await DeviceManager.getInstance().setEmsStrength('AB', safeStrength);
      if (generation !== sessionGenerationRef.current) {
        await DeviceManager.getInstance().setEmsStrength('AB', 0);
        return;
      }
      if (emsStopTimerRef.current) clearTimeout(emsStopTimerRef.current);
      emsStopTimerRef.current = setTimeout(() => {
        emsStopTimerRef.current = null;
        void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
      }, PAVLOV_FEEDBACK_DURATION_MS);
    })().catch((error) => {
      void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
      console.warn('神经刻印 EMS 输出失败:', error);
    });
  };

  const reward = (strength: number, options: { flash?: boolean } = {}) => {
    if (phaseRef.current === 'idle') return;
    if (options.flash !== false) triggerFlash('#ec4899');
    const currentSafety = useAppStore.getState().safetyConfig;
    const safeStrength = DeviceManager.getInstance().getRandomToyMotorRate('C', strength);
    if (currentSafety.emergencyLock || safeStrength === 0) return;
    const now = Date.now();
    if (!canStartPavlovFeedback(lastToyStartedAtRef.current, now, PAVLOV_REWARD_COOLDOWN_MS)) return;
    lastToyStartedAtRef.current = now;
    const generation = sessionGenerationRef.current;
    void DeviceManager.getInstance().setToyMotor(0, 0, safeStrength).then(() => {
      if (generation !== sessionGenerationRef.current) {
        void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
        return;
      }
      if (toyStopTimerRef.current) clearTimeout(toyStopTimerRef.current);
      toyStopTimerRef.current = setTimeout(() => {
        toyStopTimerRef.current = null;
        void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
      }, PAVLOV_FEEDBACK_DURATION_MS);
    }).catch((error) => {
      void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
      console.warn('神经刻印马达输出失败:', error);
    });
  };

  const completeSession = (message?: string, delayMs = 0) => {
    const generation = sessionGenerationRef.current;
    if (phaseRef.current !== 'idle') progressEngine.completeSession(phaseRef.current as PavlovStageId);
    setTimeout(() => {
      if (generation !== sessionGenerationRef.current) return;
      stopAllRef.current();
      if (message && !isUnmountingRef.current) void TTSManager.getInstance().speak(message);
    }, Math.max(0, delayMs));
  };

  // --- Phase 1: Imprint ---
  const startImprint = () => {
    const generation = sessionGenerationRef.current;
    const startingCount = progressEngine.getState().imprintCount;
    phaseRef.current = 'imprint';
    setPhase('imprint');
    setSessionActive(true);
    setSessionNotice(null);
    setImprintCount(startingCount);
    setImprintCue(null);
    void TTSManager.getInstance().speak('强制刻印开始。闭上眼睛，让身体记住主人的规矩。');

    let c = startingCount;
    const trials = createBalancedPavlovImprintTrials(imprintTarget - startingCount);
    let interval: number | null = null;
    const runTrial = () => {
      if (generation !== sessionGenerationRef.current || phaseRef.current !== 'imprint') return;
      const isRewardTrial = trials[c - startingCount] === 'reward';
      setImprintCue(isRewardTrial ? 'reward' : 'punish');
      if (isRewardTrial) {
        triggerFlash('#ec4899');
        playTone(800, 'sine', 0.5);
      } else {
        triggerFlash('#ef4444');
        playTone(150, 'sawtooth', 0.5);
      }

      // Let the visual/audio cue lead the physical feedback by one second.
      setTimeout(() => {
        if (generation !== sessionGenerationRef.current || phaseRef.current !== 'imprint') return;
        if (isRewardTrial) reward(100, { flash: false });
        else punish(40, undefined, { flash: false });
        setImprintCue(null);
      }, PAVLOV_IMPRINT_CUE_LEAD_MS);

      c++;
      setImprintCount(c);
      if (c < imprintTarget) progressEngine.setImprintCount(c);
      if (c >= imprintTarget) {
        if (interval !== null) clearInterval(interval);
        completeSession(
          '刻印结束。希望你的身体足够听话。',
          PAVLOV_IMPRINT_CUE_LEAD_MS + PAVLOV_FEEDBACK_DURATION_MS + 250,
        );
      }
    };

    // A visible first cue confirms immediately that the start button worked.
    runTrial();
    if (c < imprintTarget) interval = setInterval(runTrial, PAVLOV_IMPRINT_TRIAL_INTERVAL_MS);

    (window as any)._pavlovTimer = interval;
  };

  // --- Phase 2: Polygraph ---
  const handleMotion = (e: DeviceMotionEvent) => {
    if (!e.accelerationIncludingGravity) return;
    polygraphMotionRef.current = {
      x: e.accelerationIncludingGravity.x || 0,
      y: e.accelerationIncludingGravity.y || 0,
      z: e.accelerationIncludingGravity.z || 0
    };
  };

  const startPolygraph = () => {
    setPhase('polygraph');
    setSessionActive(true);
    void TTSManager.getInstance().speak('肉体考核开始。请将手机放在腹部。');
    
    addManagedWindowListener('devicemotion', handleMotion as EventListener);
    
    setTimeout(() => {
      setPolygraphWait(true);
      const startHr = useAppStore.getState().heartRateState.currentBpm;
      const startMotion = {...polygraphMotionRef.current};
      
      // Play pain tone BUT DO NOT SHOCK
      
      playTone(150, 'sawtooth', 1);
      
      
      setTimeout(() => {
        setPolygraphWait(false);
        const endHr = useAppStore.getState().heartRateState.currentBpm;
        const endMotion = {...polygraphMotionRef.current};
        
        const hrDiff = endHr - startHr;
        const motionDiff = Math.abs(endMotion.x - startMotion.x)
          + Math.abs(endMotion.y - startMotion.y)
          + Math.abs(endMotion.z - startMotion.z);
        const heartAvailable = startHr >= 30 && startHr <= 220 && endHr >= 30 && endHr <= 220;
        const motionAvailable = Object.values(startMotion).some(value => Math.abs(value) > 0.05)
          || Object.values(endMotion).some(value => Math.abs(value) > 0.05);

        if (!heartAvailable && !motionAvailable) {
          void TTSManager.getInstance().speak('没有收到有效的心率或动作数据，本轮无法判定，已安全结束。');
        } else if ((!heartAvailable || hrDiff < 5) && (!motionAvailable || motionDiff < 1)) {
          punish(100, '听到警报居然不害怕？你的肉体根本没有记住恐惧。接受翻倍惩罚！');
        } else {
          void TTSManager.getInstance().speak('很好，你的身体在恐惧中发抖。考核通过。');
          reward(50);
        }
        window.removeEventListener('devicemotion', handleMotion);
        managedListenersRef.current = managedListenersRef.current.filter(l => l.listener !== handleMotion);
        completeSession(undefined, PAVLOV_FEEDBACK_DURATION_MS + 250);
      }, 3000); // Wait 3s to measure reaction
    }, 4000);
  };

  // --- Phase 3: Branding ---
  const startBranding = async () => {
    if (!triggerWord.trim()) return;
    const generation = sessionGenerationRef.current;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setPhase('branding');
    setSessionActive(true);
    setBrandingText('AI正在生成专属洗脑文案...');
    
    const { llmConfig } = useAppStore.getState();
    const client = new LLMClient(llmConfig, { hardwareToolsEnabled: false });
    try {
      const prompt = `写一段约100字的极其羞辱性的主奴ASMR催眠文案。要求包含词汇“${triggerWord}”至少3次。只要你读到这个词，我就会电击他。所以把这个词放在最让他绝望、最意想不到的地方。`;
      const res = await client.sendMessage(
        [{ role: 'user', content: prompt, id: 'x', timestamp: Date.now() }],
        [],
        undefined,
        controller.signal,
      );
      if (generation !== sessionGenerationRef.current) return;
      let text = res.reply;
      setBrandingText(text);
      
      // We will read it sentence by sentence, and shock on the word
      const sentences = text.split(/([。！？])/).filter(Boolean);
      
      const processSentence = async (idx: number) => {
        if (generation !== sessionGenerationRef.current) return;
        if (idx >= sentences.length || !(window as any)._brandingActive) {
          completeSession();
          return;
        }
        
        let sentence = sentences[idx] + (sentences[idx+1] || ''); // combine punctuation
        
        const triggerIndex = sentence.indexOf(triggerWord);
        if (triggerIndex >= 0) {
          const throughTrigger = sentence.slice(0, triggerIndex + triggerWord.length);
          const remainder = sentence.slice(triggerIndex + triggerWord.length);
          await TTSManager.getInstance().speak(throughTrigger);
          if (generation !== sessionGenerationRef.current) return;
          punish(80);
          if (remainder) await TTSManager.getInstance().speak(remainder);
        } else {
          await TTSManager.getInstance().speak(sentence);
        }
        if (generation !== sessionGenerationRef.current) return;
        setTimeout(() => processSentence(idx + 2), 500); // Next sentence
      };
      
      (window as any)._brandingActive = true;
      void processSentence(0);
      
    } catch {
      if (generation !== sessionGenerationRef.current || controller.signal.aborted) return;
      setBrandingText('AI 生成失败。');
      completeSession();
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
    }
  };

  // --- Phase 4: Collapse ---
  const startCollapse = () => {
    setPhase('collapse');
    setSessionActive(true);
    void TTSManager.getInstance().speak('多巴胺崩坏测试。彻底粉碎你的认知逻辑。');
    
    let c = 0;
    const interval = setInterval(() => {
      if (c >= 20) {
        clearInterval(interval);
        completeSession();
        return;
      }
      
      // Total chaos
      const isRed = Math.random() > 0.5;
      const soundFreq = Math.random() > 0.5 ? 800 : 150;
      const isPain = Math.random() > 0.5; // Complete disconnect from visual/audio
      
      document.body.style.backgroundColor = isRed ? '#fef2f2' : '#fdf2f8';
      playTone(soundFreq, isRed ? 'sawtooth' : 'sine', 0.5);
      
      if (isPain) {
         punish(Math.floor(Math.random() * 80) + 20);
      } else {
         reward(Math.floor(Math.random() * 80) + 20);
      }
      
      
      c++;
    }, 2000);
    
    (window as any)._pavlovTimer = interval;
  };

  
  // --- Phase 5: Social Notification Poisoning ---
  const [socialTarget, setSocialTarget] = useState<'pain' | 'pleasure'>('pain');
  const startSocial = () => {
    setPhase('social');
    setSessionActive(true);
    let c = 0;
    void TTSManager.getInstance().speak('社交毒化开始。');
    const interval = setInterval(() => {
      if (c >= 15) {
        clearInterval(interval);
        completeSession();
        return;
      }
      
      // Simulate a generic message ping (two quick high notes)
      playTone(900, 'sine', 0.1);
      setTimeout(() => playTone(1200, 'sine', 0.15), 150);
      
      setTimeout(() => {
        if (socialTarget === 'pain') {
           punish(80);
           
        } else {
           reward(80);
           
        }
        
      }, 500);
      
      c++;
    }, 4000);
    (window as any)._pavlovTimer = interval;
  };

  // --- Phase 6: Active Sacrifice ---
  const [sacrificePrompt, setSacrificePrompt] = useState(false);
  const sacrificeRef = useRef<number | null>(null);
  const sacrificeCountRef = useRef(0);
  const nextSacrificeRoundRef = useRef<(() => void) | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const startSacrifice = () => {
    setPhase('sacrifice');
    setSessionActive(true);
    sacrificeCountRef.current = 0;
    void TTSManager.getInstance().speak('主动献祭。听到警报，你有2秒钟自己按下惩罚。不按就是死。');
    
    const nextRound = () => {
      if (sacrificeCountRef.current >= 10 || !(window as any)._sacrificeActive) {
        setSacrificePrompt(false);
        completeSession();
        return;
      }
      
      const delay = Math.random() * 4000 + 2000;
      setTimeout(() => {
        if (!(window as any)._sacrificeActive) return;
        // Alarm
        playTone(300, 'square', 0.8);
        setSacrificePrompt(true);
        (window as any)._sacrificeSpawnTime = Date.now();
        
        // Timeout check
        sacrificeRef.current = setTimeout(() => {
          sacrificeRef.current = null;
          setSacrificePrompt(false);
          void TTSManager.getInstance().speak('太慢了！接受雷罚！');
          punish(100); // Max punish
          sacrificeCountRef.current += 1;
          setTimeout(nextRound, PAVLOV_FEEDBACK_DURATION_MS);
        }, 2000);
      }, delay);
    };
    
    (window as any)._sacrificeActive = true;
    nextSacrificeRoundRef.current = nextRound;
    nextRound();
  };

  const handleSacrificeClick = () => {
    if (sacrificeRef.current) {
      clearTimeout(sacrificeRef.current);
      sacrificeRef.current = null;
    }
    setSacrificePrompt(false);
    
    const reactionTime = Date.now() - ((window as any)._sacrificeSpawnTime || Date.now());
    if (reactionTime > 1500) {
       void TTSManager.getInstance().speak('犹豫不决！追加惩罚！');
       punish(80);
    } else {
       punish(40); // Self punish
    }

    sacrificeCountRef.current += 1;
    setTimeout(() => {
      if ((window as any)._sacrificeActive) nextSacrificeRoundRef.current?.();
    }, PAVLOV_FEEDBACK_DURATION_MS);
  };

  // --- Phase 7: Breath Hijacking ---
  const breathMotionRef = useRef({x:0, y:0, z:0});
  const [breathColor, setBreathColor] = useState<'red' | 'green'>('green');
  
  const handleBreathMotion = (e: DeviceMotionEvent) => {
    if (!e.accelerationIncludingGravity) return;
    const { x, y, z } = e.accelerationIncludingGravity;
    
    // If red light, check for tiny movements
    if ((window as any)._breathRedLight) {
       const lx = breathMotionRef.current.x;
       const ly = breathMotionRef.current.y;
       const lz = breathMotionRef.current.z;
       
       if (lx !== 0) {
         const diff = Math.abs((x||0)-lx) + Math.abs((y||0)-ly) + Math.abs((z||0)-lz);
         if (diff > 0.4 && !(window as any)._breathCorrectionActive) {
            (window as any)._breathCorrectionActive = true;
            void TTSManager.getInstance().speak('检测到较大动作，放松肩颈并把呼吸放慢。');
            setTimeout(() => { (window as any)._breathCorrectionActive = false; }, 2000);
         }
       }
    }
    breathMotionRef.current = {x:x||0, y:y||0, z:z||0};
  };

  const startBreath = () => {
    setPhase('breath');
    setSessionActive(true);
    void TTSManager.getInstance().speak('呼吸节律训练。红灯时放慢动作，绿灯时自然呼吸。把手机轻放在胸前。');
    
    addManagedWindowListener('devicemotion', handleBreathMotion as EventListener);
    let c = 0;
    
    const interval = setInterval(() => {
       if (c >= 20) {
         clearInterval(interval);
         setBreathColor('green');
         window.removeEventListener('devicemotion', handleBreathMotion);
         managedListenersRef.current = managedListenersRef.current.filter(l => l.listener !== handleBreathMotion);
         completeSession(undefined, PAVLOV_FEEDBACK_DURATION_MS + 500);
         return;
       }
       
       const isRed = Math.random() > 0.4;
       if (isRed) {
         setBreathColor('red');
         (window as any)._breathRedLight = true;
         playTone(200, 'sawtooth', 0.5);
       } else {
         setBreathColor('green');
         (window as any)._breathRedLight = false;
         playTone(800, 'sine', 0.5);
       }
       c++;
    }, 3000);
    (window as any)._pavlovTimer = interval;
  };

  // --- Phase 8: Arousal Inversion ---
  const startInversion = async () => {
    const generation = sessionGenerationRef.current;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setPhase('inversion');
    setSessionActive(true);
    setBrandingText('AI正在生成诱惑文案...');
    
    const { llmConfig } = useAppStore.getState();
    const client = new LLMClient(llmConfig, { hardwareToolsEnabled: false });
    try {
      const prompt = `写一段150字的极其色情、极度羞辱的主奴向ASMR文案。你是主人，正在用最下流的词汇挑逗和侮辱听众，试图让他发情。用词要直白露骨。`;
      const res = await client.sendMessage(
        [{ role: 'user', content: prompt, id: 'x', timestamp: Date.now() }],
        [],
        undefined,
        controller.signal,
      );
      if (generation !== sessionGenerationRef.current) return;
      let text = res.reply;
      setBrandingText(text);
      
      const sentences = text.split(/([。！？])/).filter(Boolean);
      
      const processSentence = async (idx: number) => {
        if (generation !== sessionGenerationRef.current) return;
        if (idx >= sentences.length || !(window as any)._inversionActive) {
          completeSession();
          return;
        }
        
        // Check HR
        const hr = useAppStore.getState().heartRateState.currentBpm;
        if (hr > 85) {
           
           
           await TTSManager.getInstance().speak('下贱，听两句就发情？给我好好记住这句话带来的痛苦！');
           if (generation !== sessionGenerationRef.current) return;
           
           // PTSD 3x repeat
           const targetSentence = sentences[idx];
           for(let r=0; r<3; r++) {
              if (!(window as any)._inversionActive) break;
              punish(90, '');
              await TTSManager.getInstance().speak(targetSentence);
              if (generation !== sessionGenerationRef.current) return;
           }
           
           setTimeout(() => processSentence(idx + 1), 2000);
           return;
        }
        
        let sentence = sentences[idx] + (sentences[idx+1] || '');
        await TTSManager.getInstance().speak(sentence);
        if (generation !== sessionGenerationRef.current) return;
        setTimeout(() => processSentence(idx + 2), 500);
      };
      
      (window as any)._inversionActive = true;
      void processSentence(0);
      
    } catch {
      if (generation !== sessionGenerationRef.current || controller.signal.aborted) return;
      setBrandingText('AI 生成失败。');
      completeSession();
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
    }
  };


  // --- Phase 10: All-Fours Enforcer ---
  const handleAllFours = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    // Flat on ground means beta and gamma are close to 0.
    // If it's tilted more than 15 degrees in any direction, punish.
    if (Math.abs(e.beta) > 15 || Math.abs(e.gamma) > 15) {
       if (!(window as any)._allFoursPunishing) {
          (window as any)._allFoursPunishing = true;
          punish(80, '把手机放回地上！趴下！');
          setTimeout(() => { (window as any)._allFoursPunishing = false; }, 2000);
       }
    }
  };

  const startAllFours = () => {
    setPhase('allfours');
    setSessionActive(true);
    void TTSManager.getInstance().speak('水平定姿开始。把手机平放在稳定表面，保持两分钟。');
    addManagedWindowListener('deviceorientation', handleAllFours as EventListener);
    setTimeout(() => completeSession('水平定姿完成。'), 120000);
  };

  // --- Phase 11: Feeding & Barking ---
  const startBarking = async () => {
    const generation = sessionGenerationRef.current;
    setPhase('bark');
    setSessionActive(true);
    void TTSManager.getInstance().speak('进食反射。听到铃声，立刻大声汪出来。');
    
    let c = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (generation !== sessionGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      (window as any)._barkStream = stream;
      const AudioContextCls = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AudioContextCls();
      (window as any)._barkAudioCtx = actx;
      const source = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const nextBark = () => {
        if (!(window as any)._barkActive) return;
        if (c >= 10) { completeSession(); return; }
        
        const delay = Math.random() * 5000 + 2000;
        (window as any)._barkTimer = setTimeout(() => {
           playTone(800, 'sine', 0.5); // Bell
           (window as any)._barkWait = true;
           
           // Check for sharp loud noise within 1s
           let detected = false;
           const checkInterval = setInterval(() => {
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
              const vol = sum / dataArray.length;
              if (vol > 60) {
                 detected = true;
                 clearInterval(checkInterval);
                 clearTimeout(failTimeout);
                 reward(80);
                 setTimeout(nextBark, 2000);
              }
           }, 50);
           
           const failTimeout = setTimeout(() => {
              if (!detected) {
                 clearInterval(checkInterval);
                 punish(100, '叫声太小或者没叫！该死！');
                 setTimeout(nextBark, 2000);
              }
           }, 1000);
           
           c++;
        }, delay);
      };
      
      (window as any)._barkActive = true;
      nextBark();
    } catch {
      if (generation !== sessionGenerationRef.current) return;
      alert('需要麦克风权限');
      stopAll();
    }
  };

  // --- Phase 12: Dog Whistle ---
  const [whistlePrompt, setWhistlePrompt] = useState(false);
  const whistleRef = useRef<number | null>(null);
  const whistleCountRef = useRef(0);
  const nextWhistleRef = useRef<(() => void) | null>(null);
  const whistleAwaitingRef = useRef(false);

  const startWhistle = () => {
    setPhase('whistle');
    setSessionActive(true);
    void TTSManager.getInstance().speak('高频犬笛测试。竖起你的狗耳朵，听见超高频噪音立刻按爪印。');
    
    whistleCountRef.current = 0;
    const nextWhistle = () => {
      if (!(window as any)._whistleActive) return;
      if (whistleCountRef.current >= 10) { completeSession(); return; }
      
      const delay = Math.random() * 6000 + 3000;
      (window as any)._whistleTimer = setTimeout(() => {
         // Reuse the managed context so repeated rounds cannot leak audio resources.
         playTone(14000, 'sine', 0.5);
         
         whistleAwaitingRef.current = true;
         setWhistlePrompt(true);
         
         whistleRef.current = setTimeout(() => {
            whistleRef.current = null;
            whistleAwaitingRef.current = false;
            setWhistlePrompt(false);
            punish(100, '耳聋了吗贱狗！');
            whistleCountRef.current += 1;
            nextWhistle();
         }, 1500);
      }, delay);
    };
    
    (window as any)._whistleActive = true;
    nextWhistleRef.current = nextWhistle;
    nextWhistle();
  };

  const handleWhistleClick = () => {
    if (!whistleAwaitingRef.current) return;
    whistleAwaitingRef.current = false;
    if (whistleRef.current) clearTimeout(whistleRef.current);
    whistleRef.current = null;
    setWhistlePrompt(false);
    reward(60); // Good dog
    whistleCountRef.current += 1;
    setTimeout(() => {
      if ((window as any)._whistleActive) nextWhistleRef.current?.();
    }, 1000);
  };


  // --- Phase 13: Beg & Balance (顶骨头) ---
  const handleBegMotion = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    if (!(window as any)._begActive) return;
    
    // Strict tolerance: within 10 degrees of flat
    if (Math.abs(e.beta) > 10 || Math.abs(e.gamma) > 10) {
      if (!(window as any)._begPunishing) {
         (window as any)._begPunishing = true;
         punish(90, '动什么动！骨头掉下来了！');
         setTimeout(() => { (window as any)._begPunishing = false; }, 3000);
      }
    }
  };
  const startBeg = () => {
    setPhase('beg');
    setSessionActive(true);
    void TTSManager.getInstance().speak('把手机平放在头顶。像狗一样顶着骨头，在我说吃之前，敢动一下就电死你。');
    
    (window as any)._begActive = false;
    setTimeout(() => {
      (window as any)._begActive = true;
      addManagedWindowListener('deviceorientation', handleBegMotion as EventListener);
      playTone(500, 'sine', 0.5); // Start beep
      
      const waitTime = Math.random() * 20000 + 10000; // 10-30s
      (window as any)._begTimer = setTimeout(() => {
         (window as any)._begActive = false;
         window.removeEventListener('deviceorientation', handleBegMotion);
         managedListenersRef.current = managedListenersRef.current.filter(l => l.listener !== handleBegMotion);
         void TTSManager.getInstance().speak('好狗，可以吃了。');
         reward(100);
         completeSession(undefined, PAVLOV_FEEDBACK_DURATION_MS + 1_000);
      }, waitTime);
    }, 5000); // 5s to get ready
  };

  // --- Phase 14: Fetch (丢飞盘) ---
  const handleFetchMotion = (e: DeviceMotionEvent) => {
    if (!e.acceleration) return;
    const val = Math.abs(e.acceleration.x || 0) + Math.abs(e.acceleration.y || 0) + Math.abs(e.acceleration.z || 0);
    if ((window as any)._fetchState === 'running') {
       (window as any)._fetchSum = ((window as any)._fetchSum || 0) + val;
    } else if ((window as any)._fetchState === 'stopped') {
       if (val > 5) {
         if (!(window as any)._fetchPunishing) {
            (window as any)._fetchPunishing = true;
            punish(100, '让你停下还敢动！');
            setTimeout(() => { (window as any)._fetchPunishing = false; }, 2000);
         }
       }
    }
  };
  const startFetch = () => {
    setPhase('fetch');
    setSessionActive(true);
    addManagedWindowListener('devicemotion', handleFetchMotion as EventListener);
    void TTSManager.getInstance().speak('准备去捡飞盘。听到去捡，就疯狂摇晃手机。听到放下，立刻绝对静止。');
    
    setTimeout(() => {
       void TTSManager.getInstance().speak('去捡！');
       (window as any)._fetchState = 'running';
       (window as any)._fetchSum = 0;
       
       (window as any)._fetchTimer = setTimeout(() => {
          if ((window as any)._fetchSum < 50) {
             punish(90, '跑这么慢，废物狗！');
          }
          
          void TTSManager.getInstance().speak('放下！');
          (window as any)._fetchState = 'stopped';
          
          setTimeout(() => {
             void TTSManager.getInstance().speak('好狗。');
             reward(80);
             window.removeEventListener('devicemotion', handleFetchMotion);
             managedListenersRef.current = managedListenersRef.current.filter(l => l.listener !== handleFetchMotion);
             completeSession(undefined, PAVLOV_FEEDBACK_DURATION_MS + 1_000);
          }, 5000); // Wait 5s in stopped state to verify stillness
       }, 5000); // 5s to run
    }, 4000);
  };

  // --- Phase 15: Muzzle (戴嘴套) ---
  const startMuzzle = async () => {
    const generation = sessionGenerationRef.current;
    setPhase('muzzle');
    setSessionActive(true);
    void TTSManager.getInstance().speak('虚拟电子嘴套已戴上。接下来两分钟，敢发出任何声音，电流就会贯穿你。');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== sessionGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      (window as any)._muzzleStream = stream;
      const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      (window as any)._muzzleCtx = actx;
      const analyser = actx.createAnalyser();
      const source = actx.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      
      let punishmentActive = false;
      
      const checkSound = setInterval(() => {
         analyser.getByteFrequencyData(data);
         let sum = 0;
         for(let i=0; i<data.length; i++) sum += data[i];
         const vol = sum / data.length;
         
         if (vol > 25) { // Very sensitive
            if (!punishmentActive) {
               punishmentActive = true;
               punish(80, '敢发出声音！闭嘴！');
               document.body.style.backgroundColor = '#991b1b';
               setTimeout(() => {
                  punishmentActive = false;
                  document.body.style.backgroundColor = '';
               }, 1000);
            }
         }
      }, 100);
      
      (window as any)._muzzleTimer = setTimeout(() => {
         clearInterval(checkSound);
         void TTSManager.getInstance().speak('训练结束，乖狗狗，嘴套解除了。');
         completeSession();
      }, 120000); // 2 minutes
    } catch {
       if (generation !== sessionGenerationRef.current) return;
       alert('需麦克风权限');
       stopAll();
    }
  };


  // --- Phase 16: Touch Hold ---
  const [snoutActive, setSnoutActive] = useState(false);
  
  const handleSnoutTouchStart = (e: React.TouchEvent) => {
    if (phase !== 'snout' || !sessionActive) return;
    if (e.touches.length > 1) {
       void TTSManager.getInstance().speak('请只使用一个触点。');
       return;
    }
    setSnoutActive(true);
    (window as any)._snoutLastTouch = Date.now();
  };

  const handleSnoutTouchEnd = (e: React.TouchEvent) => {
    if (phase !== 'snout' || !sessionActive) return;
    if (e.touches.length === 0) {
       setSnoutActive(false);
       if ((window as any)._snoutTimer) { // If it was supposed to be holding
          void TTSManager.getInstance().speak('触点已断开，重新按住目标继续。');
       }
    }
  };

  const startSnout = () => {
    setPhase('snout');
    setSessionActive(true);
    setSnoutActive(false);
    void TTSManager.getInstance().speak('用一根手指按住屏幕中央目标，保持稳定两分钟。断开后重新按住即可继续。');
    
    (window as any)._snoutTimer = setTimeout(() => {
       void TTSManager.getInstance().speak('触点专注训练完成，可以松开了。');
       reward(100);
       completeSession(undefined, PAVLOV_FEEDBACK_DURATION_MS + 1_000);
    }, 120000); // 2 minutes hold
  };

  // --- Phase 17: Tail Wag (摇尾乞怜) ---
  const handleTailMotion = (e: DeviceOrientationEvent) => {
    if (phaseRef.current !== 'tail') return;
    if (e.gamma === null) return;
    
    // We expect the phone to be in the waistband, so gamma (roll) will swing wildly left and right.
    if ((window as any)._tailState === 'wagging') {
       const delta = Math.abs(e.gamma - ((window as any)._lastGamma || e.gamma));
       (window as any)._tailSum = ((window as any)._tailSum || 0) + delta;
       (window as any)._lastGamma = e.gamma;
    }
  };

  const startTail = () => {
    setPhase('tail');
    setSessionActive(true);
    addManagedWindowListener('deviceorientation', handleTailMotion as EventListener);
    void TTSManager.getInstance().speak('把手机塞进后腰。听到指令后，疯狂地摇晃你的屁股。摇慢了就电。');
    
    setTimeout(() => {
       void TTSManager.getInstance().speak('摇尾巴！');
       (window as any)._tailState = 'wagging';
       (window as any)._tailSum = 0;
       
       (window as any)._tailInterval = setInterval(() => {
          if ((window as any)._tailSum < 150) { // arbitrary threshold for fast hip shaking
             punish(90, '摇得太慢了！用力摇！');
          }
          (window as any)._tailSum = 0; // reset every second
       }, 1000);
       
       (window as any)._tailTimer = setTimeout(() => {
          clearInterval((window as any)._tailInterval);
          (window as any)._tailState = 'stopped';
          void TTSManager.getInstance().speak('停。好狗。');
          reward(80);
          completeSession(undefined, PAVLOV_FEEDBACK_DURATION_MS + 1_000);
       }, 15000); // Shake for 15 seconds
    }, 5000);
  };

  // --- Phase 18: Guard Dog (护卫警戒) ---
  const [guardLight, setGuardLight] = useState<'off'|'red'|'green'>('off');
  
  const startGuard = async () => {
    const generation = sessionGenerationRef.current;
    setPhase('guard');
    setSessionActive(true);
    void TTSManager.getInstance().speak('护卫警戒。红灯立刻叫，绿灯死死闭嘴。');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== sessionGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      (window as any)._guardStream = stream;
      const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      (window as any)._guardCtx = actx;
      const analyser = actx.createAnalyser();
      const source = actx.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      
      let c = 0;
      const nextGuard = () => {
         if (!(window as any)._guardActive) return;
         if (c >= 10) { completeSession(); return; }
         
         setGuardLight('off');
         const delay = Math.random() * 4000 + 2000;
         (window as any)._guardTimer = setTimeout(() => {
            const isRed = Math.random() > 0.5;
            setGuardLight(isRed ? 'red' : 'green');
            
            let detected = false;
            let checkInterval = setInterval(() => {
               analyser.getByteFrequencyData(data);
               let sum = 0;
               for(let i=0; i<data.length; i++) sum += data[i];
               const vol = sum / data.length;
               
               if (vol > 50) {
                  detected = true;
                   if (!isRed) { // Sound during green light!
                      punish(100, '绿灯你敢叫！恶犬！');
                      clearInterval(checkInterval);
                      clearTimeout(evalTimeout);
                      setGuardLight('off');
                      c++;
                      setTimeout(nextGuard, PAVLOV_FEEDBACK_DURATION_MS);
                   }
               }
            }, 50);
            
            let evalTimeout = setTimeout(() => {
               clearInterval(checkInterval);
               setGuardLight('off');
               if (isRed && !detected) {
                  punish(100, '红灯你不叫！哑巴狗！');
               } else if (isRed && detected) {
                  reward(50);
               }
               c++;
               setTimeout(nextGuard, 1500);
            }, 800); // 0.8s reaction time window
         }, delay);
      };
      
      (window as any)._guardActive = true;
      nextGuard();
      
    } catch {
       if (generation !== sessionGenerationRef.current) return;
       alert('需麦克风权限');
       stopAll();
    }
  };


  // --- Video Helpers ---
  const getVideoPixels = (): Uint8ClampedArray | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    if (
      videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      || videoRef.current.videoWidth <= 0
      || videoRef.current.videoHeight <= 0
    ) return null;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, 64, 64);
    return ctx.getImageData(0, 0, 64, 64).data;
  };

  const getFrameDiff = (d1: Uint8ClampedArray, d2: Uint8ClampedArray) => {
    let diff = 0;
    for (let i = 0; i < d1.length; i += 4) {
       diff += Math.abs(d1[i] - d2[i]) + Math.abs(d1[i+1] - d2[i+1]) + Math.abs(d1[i+2] - d2[i+2]);
    }
    return diff / (d1.length / 4);
  };

  // --- Phase 19: Dark Hold (贴地盲视) ---
  const startDarkHold = async () => {
    const generation = sessionGenerationRef.current;
    phaseRef.current = 'dark';
    setPhase('dark');
    setSessionActive(true);
    setSessionNotice(null);
    setDarkHoldStatus('请在 5 秒内完全遮挡前置摄像头');
    void TTSManager.getInstance().speak('用手掌或柔软遮挡物盖住前置摄像头，保持稳定遮光。');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 320 },
          height: { ideal: 240 },
        },
      });
      if (generation !== sessionGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      (window as any)._videoStream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }
      
      let punishmentActive = false;
      let consecutiveLeakSamples = 0;
      const calibrationFrames: FrameLightStats[] = [];
      let thresholds: DarkHoldThresholds | null = null;
      (window as any)._darkSetupTimer = setTimeout(() => {
         if (generation !== sessionGenerationRef.current || phaseRef.current !== 'dark') return;
         setDarkHoldStatus('正在校准当前手机的遮挡黑场...');
         (window as any)._darkLoopTimer = setInterval(() => {
            if (generation !== sessionGenerationRef.current || phaseRef.current !== 'dark') return;
            const data = getVideoPixels();
            if (!data) return;
            const frame = analyzeFrameLight(data);
            if (!frame) return;

            if (!thresholds) {
               calibrationFrames.push(frame);
               if (calibrationFrames.length < DARK_HOLD_CALIBRATION_SAMPLES) return;
               thresholds = createDarkHoldThresholds(calibrationFrames);
               if (!thresholds) return;
               setDarkHoldStatus('遮挡已识别，保持不动');
               return;
            }

            if (isDarkHoldLightLeak(frame, thresholds)) {
               consecutiveLeakSamples += 1;
               if (consecutiveLeakSamples === 1) setDarkHoldStatus('检测到疑似漏光，正在复核...');
            } else {
               consecutiveLeakSamples = 0;
               setDarkHoldStatus((current) => current === '遮挡已识别，保持不动' ? current : '遮挡稳定，继续保持');
            }

            if (consecutiveLeakSamples >= DARK_HOLD_LEAK_CONFIRMATION_SAMPLES && !punishmentActive) {
               consecutiveLeakSamples = 0;
               punishmentActive = true;
               setDarkHoldStatus('已确认持续漏光，请重新遮挡');
               punish(80, '漏光了！压紧！');
               setTimeout(() => { punishmentActive = false; }, 2000);
            }
         }, DARK_HOLD_SAMPLE_INTERVAL_MS);
         
         (window as any)._darkTimer = setTimeout(() => {
            clearInterval((window as any)._darkLoopTimer);
            setDarkHoldStatus('挑战完成');
            void TTSManager.getInstance().speak('遮光挑战完成，可以移开遮挡物。');
            reward(100);
            completeSession(undefined, PAVLOV_FEEDBACK_DURATION_MS + 1_000);
         }, 60000); // 1 minute
      }, 5000); // 5s to get ready
    } catch {
      if (generation !== sessionGenerationRef.current) return;
      alert('需摄像头权限');
      stopAll();
    }
  };

  // --- Phase 20: Snap Freeze (屈辱定格) ---
  const [snapFlash, setSnapFlash] = useState(false);
  const [snapshotImg, setSnapshotImg] = useState<string | null>(null);

  const startSnapFreeze = async () => {
    const generation = sessionGenerationRef.current;
    setPhase('snap');
    setSessionActive(true);
    setSnapshotImg(null);
    void TTSManager.getInstance().speak('屈辱定格。我会随时拍下你的贱样。闪光灯后3秒内，敢躲闪镜头或者转头，重罚。');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (generation !== sessionGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      (window as any)._videoStream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }
      
      const delay = Math.random() * 15000 + 5000;
      (window as any)._snapTimer = setTimeout(() => {
         // Flash
         setSnapFlash(true);
         playTone(800, 'square', 0.8);
         setTimeout(() => setSnapFlash(false), 200);
         
         // Capture image
         if (canvasRef.current && videoRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
               ctx.drawImage(videoRef.current, 0, 0, 64, 64);
               setSnapshotImg(canvasRef.current.toDataURL());
            }
         }
         
         // Start freeze check
         let lastFrame = getVideoPixels();
         let punishmentActive = false;
         
         (window as any)._snapLoopTimer = setInterval(() => {
            const currFrame = getVideoPixels();
            if (!lastFrame || !currFrame) return;
            const diff = getFrameDiff(lastFrame, currFrame);
            
            if (diff > 40) { // Significant movement
               if (!punishmentActive) {
                  punishmentActive = true;
                  punish(100, '敢躲躲闪闪！看着镜头！');
                  setTimeout(() => { punishmentActive = false; }, 2000);
               }
            }
            lastFrame = currFrame;
         }, 100);
         
         (window as any)._snapCheckTimer = setTimeout(() => {
            clearInterval((window as any)._snapLoopTimer);
            void TTSManager.getInstance().speak('真是副贱样。');
            reward(60);
            completeSession(undefined, PAVLOV_FEEDBACK_DURATION_MS + 1_000);
         }, 3000); // 3 seconds freeze
      }, delay);
    } catch {
      if (generation !== sessionGenerationRef.current) return;
      alert('需摄像头权限');
      stopAll();
    }
  };

  // --- Phase 21: Feral Shake (狂犬病发) ---
  const startFeral = async () => {
    const generation = sessionGenerationRef.current;
    setPhase('feral');
    setSessionActive(true);
    void TTSManager.getInstance().speak('镜头动态响应开始。请在镜头前平稳左右移动手臂，让画面保持连续变化。');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (generation !== sessionGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      (window as any)._videoStream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }
      
      setTimeout(() => {
         void TTSManager.getInstance().speak('开始平稳移动。');
         let lastFrame = getVideoPixels();
         let punishmentActive = false;
         
         (window as any)._feralLoopTimer = setInterval(() => {
            const currFrame = getVideoPixels();
            if (!lastFrame || !currFrame) return;
            const diff = getFrameDiff(lastFrame, currFrame);
            
            if (diff < 30) { // Not enough movement!
               if (!punishmentActive) {
                  punishmentActive = true;
                  void TTSManager.getInstance().speak('画面变化不足，请继续平稳移动手臂。');
                  setTimeout(() => { punishmentActive = false; }, 1000);
               }
            }
            lastFrame = currFrame;
         }, 200);
         
         (window as any)._feralTimer = setTimeout(() => {
            clearInterval((window as any)._feralLoopTimer);
            void TTSManager.getInstance().speak('镜头动态响应完成，可以停止移动。');
            reward(100);
            completeSession(undefined, PAVLOV_FEEDBACK_DURATION_MS + 1_000);
         }, 15000); // 15 seconds of shaking
      }, 3000);
    } catch {
      if (generation !== sessionGenerationRef.current) return;
      alert('需摄像头权限');
      stopAll();
    }
  };

  // --- Phase 9: Phantom Paranoia ---
  const startPhantom = () => {
    setPhase('phantom');
    setSessionActive(true);
    void TTSManager.getInstance().speak('随机提示训练开始。请保持页面打开，完成五次不可预测的提示。');
    let completedCues = 0;
    
    const scheduleNext = () => {
      if (!(window as any)._phantomActive) return;
      if (completedCues >= 5) {
        completeSession('五次随机提示已完成。');
        return;
      }
      const delay = Math.random() * 20000 + 10000;
      (window as any)._phantomTimer = setTimeout(() => {
         playTone(100, 'sine', 0.2);
         setTimeout(() => {
           punish(80);
           completedCues += 1;
           scheduleNext();
         }, 500);
      }, delay);
    };
    
    (window as any)._phantomActive = true;
    scheduleNext();
  };

  const stopAll = () => {
    progressEngine.stopSession(phaseRef.current);
    sessionGenerationRef.current += 1;
    phaseRef.current = 'idle';
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    if (emsStopTimerRef.current) window.clearTimeout(emsStopTimerRef.current);
    if (toyStopTimerRef.current) window.clearTimeout(toyStopTimerRef.current);
    emsStopTimerRef.current = null;
    toyStopTimerRef.current = null;
    lastEmsStartedAtRef.current = 0;
    lastToyStartedAtRef.current = 0;
    managedTimeoutsRef.current.forEach((timer) => window.clearTimeout(timer));
    managedTimeoutsRef.current.clear();
    managedIntervalsRef.current.forEach((timer) => window.clearInterval(timer));
    managedIntervalsRef.current.clear();
    if (!isUnmountingRef.current) {
      setSessionActive(false);
      setPhase('idle');
      setImprintCue(null);
      setPolygraphWait(false);
      setSacrificePrompt(false);
      setWhistlePrompt(false);
      setSnoutActive(false);
      setGuardLight('off');
      setSnapFlash(false);
      setDarkHoldStatus('等待开始');
    }
    document.body.style.backgroundColor = '';
    // Dark Hold
    if ((window as any)._darkSetupTimer) clearTimeout((window as any)._darkSetupTimer);
    if ((window as any)._darkLoopTimer) clearInterval((window as any)._darkLoopTimer);
    if ((window as any)._darkTimer) clearTimeout((window as any)._darkTimer);
    // Snap Freeze
    if ((window as any)._snapTimer) clearTimeout((window as any)._snapTimer);
    if ((window as any)._snapLoopTimer) clearInterval((window as any)._snapLoopTimer);
    if ((window as any)._snapCheckTimer) clearTimeout((window as any)._snapCheckTimer);
    // Feral Shake
    if ((window as any)._feralSetupTimer) clearTimeout((window as any)._feralSetupTimer);
    if ((window as any)._feralLoopTimer) clearInterval((window as any)._feralLoopTimer);
    if ((window as any)._feralTimer) clearTimeout((window as any)._feralTimer);

    if ((window as any)._pavlovTimer) clearInterval((window as any)._pavlovTimer);
    if ((window as any)._phantomTimer) clearTimeout((window as any)._phantomTimer);
    if ((window as any)._barkTimer) clearTimeout((window as any)._barkTimer);
    if ((window as any)._whistleTimer) clearTimeout((window as any)._whistleTimer);
    if ((window as any)._begTimer) clearTimeout((window as any)._begTimer);
    if ((window as any)._fetchTimer) clearTimeout((window as any)._fetchTimer);
    if ((window as any)._muzzleTimer) clearTimeout((window as any)._muzzleTimer);
    if ((window as any)._muzzleStream) {
       (window as any)._muzzleStream.getTracks().forEach((t:any) => t.stop());
       (window as any)._muzzleStream = null;
    }
    if ((window as any)._muzzleCtx) {
       void (window as any)._muzzleCtx.close().catch(() => undefined);
       (window as any)._muzzleCtx = null;
    }
    if ((window as any)._snoutTimer) clearTimeout((window as any)._snoutTimer);
    if ((window as any)._tailTimer) clearTimeout((window as any)._tailTimer);
    if ((window as any)._tailInterval) clearInterval((window as any)._tailInterval);
    if ((window as any)._guardTimer) clearTimeout((window as any)._guardTimer);
    (window as any)._guardActive = false;
    if ((window as any)._guardStream) {
       (window as any)._guardStream.getTracks().forEach((t:any) => t.stop());
       (window as any)._guardStream = null;
    }
    if ((window as any)._guardCtx) {
       void (window as any)._guardCtx.close().catch(() => undefined);
       (window as any)._guardCtx = null;
    }
    if ((window as any)._darkTimer) clearTimeout((window as any)._darkTimer);
    if ((window as any)._snapTimer) clearTimeout((window as any)._snapTimer);
    if ((window as any)._snapCheckTimer) clearTimeout((window as any)._snapCheckTimer);
    if ((window as any)._feralTimer) clearTimeout((window as any)._feralTimer);
    if ((window as any)._videoStream) {
       (window as any)._videoStream.getTracks().forEach((t:any) => t.stop());
       (window as any)._videoStream = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (sacrificeRef.current) clearTimeout(sacrificeRef.current);
    sacrificeRef.current = null;
    sacrificeCountRef.current = 0;
    nextSacrificeRoundRef.current = null;
    if (whistleRef.current) clearTimeout(whistleRef.current);
    whistleRef.current = null;
    nextWhistleRef.current = null;
    whistleCountRef.current = 0;
    whistleAwaitingRef.current = false;
    (window as any)._brandingActive = false;
    (window as any)._sacrificeActive = false;
    (window as any)._inversionActive = false;
    (window as any)._phantomActive = false;
    (window as any)._barkActive = false;
    (window as any)._whistleActive = false;
    (window as any)._begActive = false;
    (window as any)._fetchState = 'idle';
    (window as any)._tailState = 'idle';
    (window as any)._breathRedLight = false;
    managedListenersRef.current.forEach(({ type, listener }) => {
      window.removeEventListener(type, listener);
    });
    managedListenersRef.current = [];
    if ((window as any)._barkStream) {
       (window as any)._barkStream.getTracks().forEach((t:any) => t.stop());
       (window as any)._barkStream = null;
    }
    if ((window as any)._barkAudioCtx) {
       void (window as any)._barkAudioCtx.close().catch(() => undefined);
       (window as any)._barkAudioCtx = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    TTSManager.getInstance().stop();
    void DeviceManager.getInstance().emergencyStop().catch(() => undefined);
  };
  stopAllRef.current = stopAll;

  useEffect(() => {
    if (sessionActive && phase !== 'idle') progressEngine.startSession(phase);
  }, [phase, progressEngine, sessionActive]);

  useEffect(() => {
    if (safetyConfig.emergencyLock && sessionActive) {
      setSessionNotice('全局急停锁已触发，本次神经刻印已安全停止。解除锁定后可重新开始。');
      stopAll();
    }
  }, [safetyConfig.emergencyLock, sessionActive]);

  useEffect(() => DeviceManager.getInstance().subscribeEmergencyStop(stopAll), []);

  useEffect(() => {
    isUnmountingRef.current = false;
    return () => {
      isUnmountingRef.current = true;
      stopAll();
    };
  }, []);

  const handleLockedInteraction = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!safetyConfig.emergencyLock) return;
    const button = (event.target as HTMLElement).closest('button');
    if (!button || button.dataset.allowWhenLocked === 'true') return;
    event.preventDefault();
    event.stopPropagation();
    setSessionNotice('全局急停锁正在阻止硬件训练。请先点击“解除急停锁”，原有强度上下限会保持不变。');
  };

  const simulatorMode = deviceState.connectionMode === 'simulator';
  const requirementReady: Record<PavlovRequirement, boolean> = {
    ems: simulatorMode || deviceState.devices.ems.isConnected,
    toy: simulatorMode || deviceState.devices.toy.isConnected,
    heart: heartRateState.isConnected || heartRateState.isSimulator,
    motion: typeof window !== 'undefined' && ('DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window),
    microphone: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    camera: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    ai: hasAiConfig,
  };
  const preflightChecks = [
    { label: 'EMS', ready: requirementReady.ems },
    { label: '马达', ready: requirementReady.toy },
    { label: '心率', ready: requirementReady.heart },
    { label: '动作', ready: requirementReady.motion },
    { label: '麦克风', ready: requirementReady.microphone },
    { label: '摄像头', ready: requirementReady.camera },
    { label: 'AI', ready: requirementReady.ai },
  ];
  const latestSession = progress.sessions[0];
  const activeDefinition = phase === 'idle' ? null : PAVLOV_STAGES.find((stage) => stage.id === phase);
  const progressPercent = Math.round((progress.completedStageIds.length / PAVLOV_STAGES.length) * 100);

  return (
    <div className="space-y-6 pb-20 pt-4" onClickCapture={handleLockedInteraction}>
      <PavlovViewContext.Provider value={{ activeGroup, progress, requirementReady, onUnavailable: setSessionNotice }}>
      <div className="px-5">
        <h1 className="text-2xl font-black text-rose-600 drop-shadow-md">神经刻印实验室（巴普洛夫）</h1>
        <p className="text-xs font-bold text-slate-400 mt-1">按设备能力训练，进度与结果仅保存在本机</p>
      </div>

      <section className="mx-5 liquid-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-black tracking-wider text-rose-500">训练总进度</p><p className="mt-1 text-xl font-black text-slate-800">{progress.completedStageIds.length} / {PAVLOV_STAGES.length}</p></div>
          <div className="text-right"><p className="text-[10px] font-bold text-slate-500">完成率</p><p className="mt-1 font-mono text-lg font-black text-rose-600">{progressPercent}%</p></div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-rose-100"><div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-500 transition-all" style={{ width: `${progressPercent}%` }} /></div>
        {progress.imprintCount > 0 && <p className="mt-2 text-[10px] font-bold text-rose-600">阶段一已保存：{progress.imprintCount} / {imprintTarget}，下次继续</p>}
        {latestSession && <p className="mt-2 text-[10px] text-slate-500">最近：阶段 {PAVLOV_STAGES.find((stage) => stage.id === latestSession.stageId)?.number} · {latestSession.outcome === 'completed' ? '已完成' : '中途停止'} · {latestSession.durationSec} 秒</p>}
        {(progress.completedStageIds.length > 0 || progress.imprintCount > 0 || progress.sessions.length > 0) && <button disabled={sessionActive} onClick={() => {
          if (!resetArmed) { setResetArmed(true); return; }
          progressEngine.resetProgress();
          setImprintCount(0);
          setResetArmed(false);
        }} className={`mt-3 rounded-xl px-3 py-2 text-[9px] font-black ${resetArmed ? 'bg-rose-600 text-white' : 'bg-white text-slate-500 border border-slate-200 shadow-xs'}`}>{resetArmed ? '再次点击确认清除' : '清除训练记录'}</button>}
      </section>

      <section className="mx-5 liquid-card p-4 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="text-xs font-black text-slate-800">训练前设备检查</h2><span className="text-[9px] font-bold text-slate-500">绿灯表示当前可调用</span></div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {preflightChecks.map((item) => <div key={item.label} className={`rounded-xl px-2 py-2 text-center text-[9px] font-black ${item.ready ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70' : 'bg-slate-100/70 text-slate-500 border border-slate-200/50'}`}><span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${item.ready ? 'bg-emerald-500' : 'bg-slate-300'}`} />{item.label}</div>)}
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-slate-500">具体训练只会调用卡片标注的设备；缺少能力时应安全结束，不会把无数据当作失败。</p>
      </section>

      <div className="mx-5 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        {PAVLOV_STAGE_GROUPS.map((group) => {
          const groupStages = group.id === 'all' ? PAVLOV_STAGES : PAVLOV_STAGES.filter((stage) => stage.group === group.id);
          const completeCount = groupStages.filter((stage) => progress.completedStageIds.includes(stage.id)).length;
          return <button key={group.id} onClick={() => setActiveGroup(group.id)} disabled={sessionActive} className={`rounded-xl px-2 py-2 text-[10px] font-black transition ${activeGroup === group.id ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500'} disabled:opacity-50`}>{group.label} {completeCount}/{groupStages.length}</button>;
        })}
      </div>

      {sessionActive && activeDefinition && <div className="sticky top-2 z-40 mx-5 flex items-center justify-between gap-3 rounded-2xl border border-rose-400 bg-slate-950/95 px-4 py-3 text-white shadow-xl"><div><p className="text-[9px] font-bold text-rose-300">训练进行中</p><p className="text-xs font-black">阶段 {activeDefinition.number} · {activeDefinition.title}</p></div><button onClick={stopAll} className="rounded-xl bg-rose-600 px-3 py-2 text-[10px] font-black">停止训练</button></div>}

      {(safetyConfig.emergencyLock || sessionNotice) && (
        <div className={`mx-5 rounded-2xl border px-3.5 py-3 text-[11px] leading-relaxed ${safetyConfig.emergencyLock ? 'border-rose-500 bg-rose-950 text-rose-100' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
          <div className="flex items-center justify-between gap-3">
            <span>{sessionNotice || '全局急停锁已激活，神经刻印暂不可启动。'}</span>
            {safetyConfig.emergencyLock && (
              <button
                type="button"
                data-allow-when-locked="true"
                onClick={() => {
                  setSafetyConfig({ emergencyLock: false });
                  setSessionNotice('急停锁已解除，硬件强度上下限保持不变。');
                }}
                className="shrink-0 rounded-xl bg-rose-600 px-3 py-2 text-[10px] font-black text-white"
              >
                解除急停锁
              </button>
            )}
          </div>
        </div>
      )}

      <div className="px-5 space-y-4">
        {/* Phase 1 */}
        <Panel title="阶段 1：强制刻印" caption="粉光/高音或红光/低音先出现，约 1 秒后再执行对应反馈；每轮完整结束后进入下一轮。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-rose-900/50">
              <div className="flex justify-between items-center mb-4">
                <BellRing className="w-8 h-8 text-rose-500" />
                <div className="text-right">
                  <p className="font-mono text-rose-400 font-bold">{imprintCount} / {imprintTarget}</p>
                  {sessionActive && phase === 'imprint' && (
                    <p className="mt-1 text-[9px] font-bold text-slate-400">{imprintCue === 'reward' ? '粉光提示 · 1 秒后反馈' : imprintCue === 'punish' ? '红光提示 · 1 秒后反馈' : '等待下一轮提示'}</p>
                  )}
                </div>
              </div>
             {sessionActive && phase === 'imprint' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-rose-500 rounded-xl font-bold">急停</button>
             ) : (
                <button onClick={startImprint} disabled={sessionActive} className="w-full py-3 bg-rose-600 text-white rounded-xl font-black disabled:opacity-50">开始刻印</button>
             )}
           </div>
        </Panel>

        {/* Phase 2 */}
        <Panel title="阶段 2：肉体考核" caption="播放剧痛警报但不给电击。系统将检测你的心跳和肌肉是否因为恐惧而发抖，没有学会害怕就翻倍惩罚！">
           <div className="bg-slate-900 rounded-2xl p-4 border border-red-900/50 text-center">
             <HeartPulse className={`w-8 h-8 mx-auto mb-4 ${polygraphWait ? 'text-red-500 animate-ping' : 'text-slate-600'}`} />
             <p className="text-xs text-slate-400 mb-4">心率: {liveHeartRate} BPM</p>
             {sessionActive && phase === 'polygraph' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-red-500 rounded-xl font-bold">急停</button>
             ) : (
                <button onClick={startPolygraph} disabled={sessionActive} className="w-full py-3 bg-red-700 text-white rounded-xl font-black disabled:opacity-50">开始肉体测谎</button>
             )}
           </div>
        </Panel>

        {/* Phase 3 */}
        <Panel title="阶段 3：词汇烙印" caption="将恐惧带入现实。设定一个日常词汇，AI 将为你读定制催眠文，每次读到该词立刻电击。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-purple-900/50">
             <div className="flex gap-2 mb-4">
               <input 
                 value={triggerWord} 
                 onChange={e=>setTriggerWord(e.target.value)} 
                 className="flex-1 bg-slate-800 text-purple-300 font-bold rounded-lg px-3 outline-none focus:ring-1 focus:ring-purple-500" 
                 placeholder="例如：开会"
               />
               {sessionActive && phase === 'branding' ? (
                  <button onClick={stopAll} className="px-4 py-2 bg-slate-800 text-purple-500 rounded-lg font-bold">急停</button>
               ) : (
                  <button onClick={startBranding} disabled={sessionActive} className="px-4 py-2 bg-purple-600 text-white rounded-lg font-black disabled:opacity-50">烙印</button>
               )}
             </div>
             {brandingText && (
               <div className="bg-slate-950 p-3 rounded-lg text-[10px] text-purple-400 max-h-32 overflow-y-auto">
                 {brandingText}
               </div>
             )}
           </div>
        </Panel>

        {/* Phase 4 */}
        <Panel title="阶段 4：多巴胺崩坏" caption="打破所有规律。痛觉与快感、色彩与声音将完全随机倒置。彻底粉碎你的认知逻辑。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-fuchsia-900/50 text-center">
             <Brain className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'collapse' ? 'text-fuchsia-500 animate-spin' : 'text-slate-600'}`} />
             {sessionActive && phase === 'collapse' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-fuchsia-500 rounded-xl font-bold">急停</button>
             ) : (
                <button onClick={startCollapse} disabled={sessionActive} className="w-full py-3 bg-gradient-to-r from-fuchsia-600 to-rose-600 text-white rounded-xl font-black disabled:opacity-50">进入认知崩溃</button>
             )}
           </div>
        </Panel>

        {/* Phase 5 */}
        <Panel title="阶段 5：社交毒化" caption="模拟日常社交软件提示音，建立提示音与惩罚/快感的死结。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-blue-900/50">
             <div className="flex gap-2 mb-4">
               <select value={socialTarget} onChange={e=>setSocialTarget(e.target.value as any)} className="flex-1 bg-white text-slate-800 font-bold rounded-lg px-3 py-2 outline-none border border-slate-200 focus:border-pink-500" style={{ colorScheme: 'light' }}>
                 <option value="pain">绑定痛觉 (电击)</option>
                 <option value="pleasure">绑定快感 (榨精)</option>
               </select>
             </div>
             {sessionActive && phase === 'social' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-blue-500 rounded-xl font-bold">急停</button>
             ) : (
                <button onClick={startSocial} disabled={sessionActive} className="w-full py-3 bg-blue-600 text-white rounded-xl font-black disabled:opacity-50">开始毒化</button>
             )}
           </div>
        </Panel>

        {/* Phase 6 */}
        <Panel title="阶段 6：主动献祭" caption="警报出现后 2 秒内点击反应按钮，系统记录反应速度并按全局强度上限给出反馈。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-orange-900/50 text-center relative overflow-hidden">
             {sacrificePrompt && (
                <div className="absolute inset-0 bg-red-900/80 z-10 flex flex-col items-center justify-center">
                  <div className="w-full h-2 bg-red-950 absolute top-0"><div className="h-full bg-red-500 animate-[shrink_2s_linear_forwards]" style={{ width: '100%' }}></div></div>
                  <button onClick={handleSacrificeClick} className="w-3/4 py-6 bg-red-600 text-white font-black text-xl rounded-2xl shadow-2xl shadow-red-500/50">自我惩罚</button>
                </div>
             )}
             <Hand className="w-12 h-12 mx-auto mb-4 text-slate-600" />
             {sessionActive && phase === 'sacrifice' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-orange-500 rounded-xl font-bold">急停</button>
             ) : (
                <button onClick={startSacrifice} disabled={sessionActive} className="w-full py-3 bg-orange-600 text-white rounded-xl font-black disabled:opacity-50">开始献祭</button>
             )}
           </div>
        </Panel>

        {/* Phase 7 */}
        <Panel title="阶段 7：呼吸剥夺" caption="将手机轻放在胸前，通过红绿提示练习放慢动作与自然呼吸；较大动作只会触发语音纠正。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-teal-900/50 text-center transition-colors duration-500" style={{ backgroundColor: sessionActive && phase === 'breath' ? (breathColor === 'red' ? '#450a0a' : '#064e3b') : '' }}>
             <Wind className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'breath' ? (breathColor === 'red' ? 'text-red-500' : 'text-emerald-500') : 'text-slate-600'}`} />
             {sessionActive && phase === 'breath' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold">急停</button>
             ) : (
                <button onClick={startBreath} disabled={sessionActive} className="w-full py-3 bg-teal-600 text-white rounded-xl font-black disabled:opacity-50">开始节律训练</button>
             )}
           </div>
        </Panel>

        {/* Phase 8 */}
        <Panel title="阶段 8：唤起倒错" caption="AI 朗读色情诱惑文案，你必须强压欲望，心跳超过 85 BPM 立刻电击。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-cyan-900/50">
             <div className="flex justify-center mb-4">
               <Snowflake className="w-12 h-12 text-cyan-600" />
             </div>
             {brandingText && phase === 'inversion' && (
               <div className="bg-slate-950 p-3 rounded-lg text-[10px] text-cyan-400 mb-4 max-h-32 overflow-y-auto">
                 {brandingText}
               </div>
             )}
             {sessionActive && phase === 'inversion' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-cyan-500 rounded-xl font-bold">急停</button>
             ) : (
                <button onClick={startInversion} disabled={sessionActive} className="w-full py-3 bg-cyan-700 text-white rounded-xl font-black disabled:opacity-50">倒置性冲动</button>
             )}
           </div>
        </Panel>

        {/* Phase 9 */}
        <Panel title="阶段 9：幽灵植入" caption="保持页面打开，在不可预测的间隔完成 5 次声音提示与可选反馈；切到后台不会继续承诺执行。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-gray-700/50 text-center">
             <Ghost className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'phantom' ? 'text-gray-400 animate-pulse' : 'text-slate-600'}`} />
             {sessionActive && phase === 'phantom' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-gray-400 rounded-xl font-bold">停止后台幽灵</button>
             ) : (
                <button onClick={startPhantom} disabled={sessionActive} className="w-full py-3 bg-gray-600 text-white rounded-xl font-black disabled:opacity-50">开始随机提示</button>
             )}
           </div>
        </Panel>

        {/* Phase 10 */}
        <Panel title="阶段 10：四肢着地" caption="将手机平放在稳定表面保持两分钟；倾斜超过阈值时给出受全局上限约束的可选反馈。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-indigo-900/50 text-center">
             <Dog className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'allfours' ? 'text-indigo-500 animate-pulse' : 'text-slate-600'}`} />
             {sessionActive && phase === 'allfours' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-indigo-400 rounded-xl font-bold">终止四肢着地</button>
             ) : (
                <button onClick={startAllFours} disabled={sessionActive} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black disabled:opacity-50">降级为犬类</button>
             )}
           </div>
        </Panel>

        {/* Phase 11 */}
        <Panel title="阶段 11：进食反射" caption="剥夺人类语言。听到铃声，必须在1秒内对麦克风大声吠叫，否则电击喉咙。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-fuchsia-900/50 text-center">
             <Mic className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'bark' ? 'text-fuchsia-500 animate-bounce' : 'text-slate-600'}`} />
             {sessionActive && phase === 'bark' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-fuchsia-400 rounded-xl font-bold">停止反射训练</button>
             ) : (
                <button onClick={startBarking} disabled={sessionActive} className="w-full py-3 bg-fuchsia-600 text-white rounded-xl font-black disabled:opacity-50">开启摇铃吠叫</button>
             )}
           </div>
        </Panel>

        {/* Phase 12 */}
        <Panel title="阶段 12：高频犬笛" caption="随时播放极高频（14000Hz）刺耳犬笛，听到后1.5秒内必须按下狗爪印。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-stone-700/50 text-center relative overflow-hidden">
             {whistlePrompt && (
                <div className="absolute inset-0 bg-stone-800/90 z-10 flex items-center justify-center">
                  <button onClick={handleWhistleClick} className="w-24 h-24 bg-stone-600 rounded-full shadow-2xl flex items-center justify-center active:bg-stone-500">
                    <Hand className="w-12 h-12 text-stone-900" />
                  </button>
                </div>
             )}
             <Volume2 className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'whistle' ? 'text-stone-400 animate-pulse' : 'text-slate-600'}`} />
             {sessionActive && phase === 'whistle' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-stone-400 rounded-xl font-bold">拔出犬笛</button>
             ) : (
                <button onClick={startWhistle} disabled={sessionActive} className="w-full py-3 bg-stone-600 text-white rounded-xl font-black disabled:opacity-50">植入犬笛服从</button>
             )}
           </div>
        </Panel>


        {/* Phase 13 */}
        <Panel title="阶段 13：顶骨头" caption="手机平放在头顶。在此期间绝对不许倾斜，在AI下令“吃”之前必须绝对服从。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-orange-900/50 text-center">
             <Bone className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'beg' ? 'text-orange-500 animate-pulse' : 'text-slate-600'}`} />
             {sessionActive && phase === 'beg' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-orange-400 rounded-xl font-bold">终止顶骨头</button>
             ) : (
                <button onClick={startBeg} disabled={sessionActive} className="w-full py-3 bg-orange-600 text-white rounded-xl font-black disabled:opacity-50">执行服从测试</button>
             )}
           </div>
        </Panel>

        {/* Phase 14 */}
        <Panel title="阶段 14：丢飞盘" caption="听到“去捡”立刻剧烈摇晃手机。听到“放下”必须瞬间绝对静止。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-cyan-900/50 text-center">
             <Disc className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'fetch' ? 'text-cyan-500 animate-bounce' : 'text-slate-600'}`} />
             {sessionActive && phase === 'fetch' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-cyan-400 rounded-xl font-bold">中止飞盘</button>
             ) : (
                <button onClick={startFetch} disabled={sessionActive} className="w-full py-3 bg-cyan-600 text-white rounded-xl font-black disabled:opacity-50">准备捡飞盘</button>
             )}
           </div>
        </Panel>

        {/* Phase 15 */}
        <Panel title="阶段 15：戴嘴套" caption="麦克风极高灵敏度监听。接下来的2分钟内，除了轻微呼吸，发出任何响动将直接换来电击。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-rose-950/50 text-center">
             <ShieldBan className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'muzzle' ? 'text-rose-600 animate-pulse' : 'text-slate-600'}`} />
             {sessionActive && phase === 'muzzle' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-rose-500 rounded-xl font-bold">取下嘴套</button>
             ) : (
                <button onClick={startMuzzle} disabled={sessionActive} className="w-full py-3 bg-rose-700 text-white rounded-xl font-black disabled:opacity-50">戴上电子嘴套</button>
             )}
           </div>
        </Panel>


        {/* Phase 16 */}
        <Panel title="阶段 16：嗅觉锁定" caption="使用单个手指持续按住屏幕目标，断开时语音提示重新连接；触摸屏无法判断具体身体部位。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-fuchsia-900/50 text-center relative select-none">
             {sessionActive && phase === 'snout' && (
                <div 
                   className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 touch-none"
                   onTouchStart={handleSnoutTouchStart}
                   onTouchEnd={handleSnoutTouchEnd}
                   onTouchCancel={handleSnoutTouchEnd}
                >
                   <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-colors ${snoutActive ? 'border-fuchsia-500 bg-fuchsia-500/20 shadow-[0_0_30px_rgba(217,70,239,0.5)]' : 'border-slate-600 border-dashed bg-slate-800'}`}>
                      <Target className={`w-8 h-8 ${snoutActive ? 'text-fuchsia-400' : 'text-slate-500'}`} />
                   </div>
                </div>
             )}
             <Target className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'snout' ? 'text-fuchsia-500 animate-pulse' : 'text-slate-600'}`} />
             {sessionActive && phase === 'snout' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-fuchsia-400 rounded-xl font-bold">中止嗅探</button>
             ) : (
                <button onClick={startSnout} disabled={sessionActive} className="w-full py-3 bg-fuchsia-600 text-white rounded-xl font-black disabled:opacity-50">开始触点专注</button>
             )}
           </div>
        </Panel>

        {/* Phase 17 */}
        <Panel title="阶段 17：摇尾乞怜" caption="将手机塞入后腰。听到指令后疯狂扭动臀部，频率太低将遭致持续电击。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-emerald-900/50 text-center">
             <Activity className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'tail' ? 'text-emerald-500 animate-spin' : 'text-slate-600'}`} />
             {sessionActive && phase === 'tail' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-emerald-400 rounded-xl font-bold">终止摇尾</button>
             ) : (
                <button onClick={startTail} disabled={sessionActive} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black disabled:opacity-50">装配电子尾巴</button>
             )}
           </div>
        </Panel>

        {/* Phase 18 */}
        <Panel title="阶段 18：护卫警戒" caption="极限敌我识别。红灯0.8秒内大声吠叫，绿灯必须绝对安静。错判立惩。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-red-950/50 text-center relative overflow-hidden">
             {sessionActive && phase === 'guard' && guardLight !== 'off' && (
                <div className={`absolute inset-0 z-10 ${guardLight === 'red' ? 'bg-red-600' : 'bg-green-500'} animate-pulse flex items-center justify-center`}>
                   <span className="text-4xl font-black text-white">{guardLight === 'red' ? '叫！' : '憋住！'}</span>
                </div>
             )}
             <Siren className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'guard' ? 'text-red-600 animate-pulse' : 'text-slate-600'}`} />
             {sessionActive && phase === 'guard' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-red-500 rounded-xl font-bold relative z-20">解除警戒</button>
             ) : (
                <button onClick={startGuard} disabled={sessionActive} className="w-full py-3 bg-red-700 text-white rounded-xl font-black disabled:opacity-50">执行护卫警戒</button>
             )}
           </div>
        </Panel>


        {/* Phase 19 */}
         <Panel title="阶段 19：贴地盲视" caption="开启前置镜头后，用手掌或柔软物体遮住镜头一分钟；系统按当前黑场自动校准并确认持续漏光。">
            <div className="bg-slate-900 rounded-2xl p-4 border border-zinc-900/50 text-center">
              <Moon className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'dark' ? 'text-zinc-600 animate-pulse' : 'text-slate-600'}`} />
              <p className="mb-3 text-[10px] font-bold text-zinc-400">{darkHoldStatus}</p>
             {sessionActive && phase === 'dark' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-zinc-500 rounded-xl font-bold">中止盲视</button>
             ) : (
                <button onClick={startDarkHold} disabled={sessionActive} className="w-full py-3 bg-zinc-700 text-white rounded-xl font-black disabled:opacity-50">开始遮光定格</button>
             )}
           </div>
        </Panel>

        {/* Phase 20 */}
        <Panel title="阶段 20：屈辱定格" caption="随机闪光抓拍贱相。被拍下后的3秒内，敢躲避镜头或产生像素位移，直接重罚。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-sky-900/50 text-center relative overflow-hidden">
             {snapFlash && <div className="absolute inset-0 bg-white z-20"></div>}
             {snapshotImg && (
                <div className="absolute inset-0 z-10 p-2 pointer-events-none">
                   <img src={snapshotImg} className="w-full h-full object-cover rounded-xl opacity-40 grayscale blur-[2px]" />
                </div>
             )}
             <CameraIcon className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'snap' ? 'text-sky-500 animate-pulse' : 'text-slate-600'}`} />
             {sessionActive && phase === 'snap' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-sky-400 rounded-xl font-bold relative z-30">放弃抓拍</button>
             ) : (
                <button onClick={startSnapFreeze} disabled={sessionActive} className="w-full py-3 bg-sky-600 text-white rounded-xl font-black disabled:opacity-50 relative z-30">等候定格拍摄</button>
             )}
           </div>
        </Panel>

        {/* Phase 21 */}
        <Panel title="阶段 21：狂犬病发" caption="前置镜头只检测画面整体变化量；请平稳左右移动手臂，不要求快速甩头，也不声称识别具体姿态。">
           <div className="bg-slate-900 rounded-2xl p-4 border border-yellow-900/50 text-center">
             <Zap className={`w-12 h-12 mx-auto mb-4 ${sessionActive && phase === 'feral' ? 'text-yellow-500 animate-[spin_0.2s_linear_infinite]' : 'text-slate-600'}`} />
             {sessionActive && phase === 'feral' ? (
                <button onClick={stopAll} className="w-full py-3 bg-slate-800 text-yellow-400 rounded-xl font-bold">中止狂犬发作</button>
             ) : (
                <button onClick={startFeral} disabled={sessionActive} className="w-full py-3 bg-yellow-600 text-white rounded-xl font-black disabled:opacity-50">开始动态响应</button>
             )}
           </div>
        </Panel>

        {/* Hidden Video Processors */}
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} width="64" height="64" className="hidden" />

      </div>
      </PavlovViewContext.Provider>
    </div>
  );
};
