import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AudioLines, Bot, Check, ClipboardCheck, Crown, Eye, Gauge, HeartPulse, LockKeyhole, Play, RefreshCw, ScanFace, ShieldAlert, ShieldCheck, Sparkles, WandSparkles, Waves, Lock, Camera, Image, Mic, Keyboard, Clock, BrainCircuit, ActivitySquare, Eye as EyeIcon, HeartCrack, BellRing, Hand, Music, CheckCircle2, Gamepad2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { LLMClient } from '../../core/ai/llmClient';
import { parseBoundedStringArray } from '../../core/ai/structuredOutput';
import { DeviceManager } from '../../core/deviceManager';
import { PitchData, PitchTracker } from '../../core/voice/pitchTracker';
import { TTSManager } from '../../core/voice/ttsManager';
import { HeartRateState } from '../../types';
import { parseApiBaseUrl } from '../../core/apiBaseUrl';
import { fetchTextWithTimeout } from '../../core/httpClient';
import { BARBIE_SUITE_DEFAULT_STATE, BarbiePostureSessionRecord, BarbieSuiteState, normalizeBarbieSuiteState } from '../../core/discipline/barbieSuiteState';
import { BarbieLabEngine } from '../../core/discipline/barbieLabEngine';
import { AchievementEngine } from '../../core/achievements/achievementEngine';
import { SceneDirectorTab } from './SceneDirectorTab';
import { PitchCoachTab } from './PitchCoachTab';
import { WeeklyTrainingPlan } from './WeeklyTrainingPlan';
import {
  BARBIE_DAILY_RITUAL_TASKS,
  BarbieDailyRitualTaskId,
  calculateAudioRms,
  createBarbieRitualCompletionRecord,
  getCompletedBarbieRitualTaskIds,
  getBarbieRitualDayKey,
  matchesBarbieRitualPose,
} from '../../core/discipline/barbieRitual';
import { parseYoloVisionMessage, parseYoloWebSocketUrl } from '../../core/vision/yoloVisionMessage';
import {
  COGNITIVE_VISUAL_PULSE_MS,
  TYPING_VISUAL_COOLDOWN_MS,
  createTypingVisualPulse,
} from '../../core/discipline/visualInterference';
import {
  BARBIE_POSTURE_PROGRAMS,
  BarbiePostureMode,
  BarbiePostureSample,
  BarbiePostureSensitivity,
  assessBarbiePosture,
  calibrateBarbiePosture,
  calculateBarbieStepCadence,
  calculateBarbieStepConsistency,
  calculateBarbiePostureScore,
  normalizeBarbiePostureAngleDelta,
  rotateBarbiePostureAngles,
} from '../../core/discipline/barbiePosture';

type FeatureTab = 'growth' | 'director' | 'voice' | 'pitch' | 'mirror' | 'posture' | 'choreo' | 'ritual' | 'bio' | 'chastity' | 'gallery' | 'silence' | 'typing' | 'metronome' | 'bimbo' | 'medusa' | 'eye' | 'tightrope' | 'data';
type FeatureCategory = 'daily' | 'intense' | 'system';
const HARDWARE_OUTPUT_CEILING = 100;

const sendRandomShock = (maxAllowed: number) => {
  const deviceManager = DeviceManager.getInstance();
  const randomStrength = deviceManager.getRandomEmsStrength(maxAllowed);
  if (randomStrength <= 0) return;
  void deviceManager.setEmsStrength('AB', randomStrength).catch((error) => {
    console.error('电击指令发送失败:', error);
  });
};

const sendRandomToy = (maxAllowed: number) => {
  const deviceManager = DeviceManager.getInstance();
  const randomRate = deviceManager.getRandomToyMotorRate('C', maxAllowed);
  if (randomRate <= 0) return;
  void deviceManager.setToyMotor(0, 0, randomRate).catch((error) => {
    console.error('榨精机指令发送失败:', error);
  });
};

type SuiteState = BarbieSuiteState;

const STORAGE_KEY = 'ycy_barbie_suite_v2';
const safeStorageGet = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const safeStorageSet = (key: string, value: string): boolean => {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
};
const safeStorageRemove = (key: string): void => {
  try { localStorage.removeItem(key); } catch {}
};
const DEFAULT_STATE: SuiteState = BARBIE_SUITE_DEFAULT_STATE;

const tabs: { id: FeatureTab; label: string; icon: React.ElementType; category: FeatureCategory }[] = [
  { id: 'mirror', label: '魔镜', icon: ScanFace, category: 'daily' },
  { id: 'posture', label: '姿态', icon: Activity, category: 'daily' },
  { id: 'choreo', label: '编舞', icon: Waves, category: 'daily' },
  { id: 'ritual', label: '仪式', icon: WandSparkles, category: 'daily' },
  { id: 'director', label: '导演', icon: Bot, category: 'daily' },
  { id: 'voice', label: '语癖', icon: AudioLines, category: 'daily' },
  { id: 'pitch', label: '声线训练', icon: AudioLines, category: 'daily' },
  { id: 'chastity', label: '贞操控制', icon: LockKeyhole, category: 'intense' },
  { id: 'gallery', label: '耻辱相册', icon: Image, category: 'intense' },
  { id: 'silence', label: '噤声特训', icon: Mic, category: 'intense' },
  { id: 'typing', label: '抄写地狱', icon: Keyboard, category: 'intense' },
  { id: 'metronome', label: '高潮节拍', icon: Clock, category: 'intense' },
  { id: 'bimbo', label: '认知剥夺', icon: BrainCircuit, category: 'intense' },
  { id: 'medusa', label: '绝对静止', icon: ActivitySquare, category: 'intense' },
  { id: 'eye', label: '视觉锁定', icon: EyeIcon, category: 'intense' },
  { id: 'tightrope', label: '心率钢丝', icon: HeartCrack, category: 'intense' },
  { id: 'growth', label: '成长', icon: Crown, category: 'system' },
  { id: 'bio', label: '生物反馈', icon: HeartPulse, category: 'system' },
  { id: 'data', label: '隐私数据', icon: ClipboardCheck, category: 'system' },
];

const getToday = () => new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

const loadSuiteState = (): SuiteState => {
  try {
    return normalizeBarbieSuiteState(JSON.parse(safeStorageGet(STORAGE_KEY) || 'null'));
  } catch { return normalizeBarbieSuiteState(null); }
};


// ==========================================
// THE FINAL 6 MODULES
// ==========================================

const MirrorCheck: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle'|'scanning'|'analyzing'|'passed'|'failed'>('idle');
  const [feedback, setFeedback] = useState('');
  const [uploadConfirmed, setUploadConfirmed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const scanGenerationRef = useRef(0);
  const { llmConfig } = useAppStore();

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const cancelPendingWork = () => {
    scanGenerationRef.current++;
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
    captureTimerRef.current = null;
    shockTimerRef.current = null;
    requestRef.current?.abort();
    requestRef.current = null;
    stopCamera();
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
  };
  
  const startScan = async () => {
     if (!uploadConfirmed) return;
     cancelPendingWork();
     const generation = scanGenerationRef.current;
     setStatus('scanning');
     setFeedback('');
     try {
       const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
       if (generation !== scanGenerationRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
       }
       streamRef.current = stream;
       if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
       }
       setIsActive(true);
       
       void TTSManager.getInstance().speak('魔镜扫描启动。请正对屏幕，展示你的女装、妆容或贞操锁。5秒后拍照。');
       
       captureTimerRef.current = setTimeout(async () => {
          captureTimerRef.current = null;
          let activeController: AbortController | null = null;
          try {
             if (generation !== scanGenerationRef.current || !videoRef.current) return;
             const video = videoRef.current;
             if (video.videoWidth <= 0 || video.videoHeight <= 0) throw new Error('摄像头画面尚未就绪');
             const canvas = document.createElement('canvas');
             canvas.width = video.videoWidth;
             canvas.height = video.videoHeight;
             const ctx = canvas.getContext('2d');
             if (!ctx) throw new Error('浏览器无法创建截图画布');
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const base64Data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
              setUploadConfirmed(false);
             stopCamera();
             setStatus('analyzing');
             void TTSManager.getInstance().speak('咔嚓。照片已上传至AI大模型，正在进行雌堕视觉分析...');

             let rawUrl = parseApiBaseUrl(llmConfig.baseUrl || 'https://api.openai.com/v1');
             if (!rawUrl) throw new Error('视觉 API 地址无效');
             rawUrl = rawUrl.endsWith('/chat/completions') ? rawUrl : `${rawUrl}/chat/completions`;
             activeController = new AbortController();
             requestRef.current = activeController;
             
             const { response: resp, text: responseText } = await fetchTextWithTimeout(
               rawUrl,
               {
                  method: 'POST',
                  signal: activeController.signal,
                  headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${llmConfig.apiKey}`
                  },
                  body: JSON.stringify({
                      model: llmConfig.model || 'gemini-1.5-flash',
                      messages: [
                          {
                              role: 'system',
                              content: '你是一个极端苛刻、具有施虐狂倾向的雌堕审核大模型。你的任务是审核用户的自拍。如果用户看起来穿了女装、化了妆、或者戴了贞操锁，你可以勉强让他们通过（判定为PASS），但依然要用高高在上的刻薄语气羞辱他们。如果用户看起来完全像个粗糙的普通男人，或者没有任何女性化/受虐特征，你必须判定为FAIL，并疯狂嘲讽他们，说他们不配当女奴。必须按照固定格式输出：第一行必须是 [PASS] 或 [FAIL]。第二行开始是你的羞辱语音评语（不超过50个字，直接说话即可，不要带动作描写）。'
                          },
                          {
                              role: 'user',
                              content: [
                                  { type: 'text', text: '给我评分！' },
                                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                              ]
                          }
                      ],
                      temperature: 0.7,
                      max_tokens: 200
                  })
               },
               { timeoutMs: 45_000, maxBytes: 5_000_000, timeoutMessage: '视觉 API 请求超过 45 秒' },
             );
             
             if (!resp.ok) throw new Error(`API错误: ${resp.status}`);
             const data = JSON.parse(responseText);
             if (generation !== scanGenerationRef.current) return;
             const reply = data.choices?.[0]?.message?.content || '';
             if (typeof reply !== 'string' || !reply.trim()) throw new Error('模型返回内容为空');
             
             const isPass = reply.includes('[PASS]');
             const comment = reply.replace(/\[PASS\]|\[FAIL\]/g, '').trim();
             
             setFeedback(comment);
             setStatus(isPass ? 'passed' : 'failed');
             void TTSManager.getInstance().speak(comment);
             
             if (!isPass) {
                 sendRandomShock(HARDWARE_OUTPUT_CEILING);
                 shockTimerRef.current = setTimeout(() => {
                   shockTimerRef.current = null;
                   if (generation === scanGenerationRef.current) {
                     void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
                   }
                 }, 3000);
                 try { localStorage.setItem('ycy_mirror_lock', Date.now().toString()); } catch {}
             }
             
          } catch(e) {
             if (generation !== scanGenerationRef.current || (e instanceof DOMException && e.name === 'AbortError')) return;
             console.error(e);
             setStatus('failed');
             const errStr = e instanceof Error ? `视觉调用失败：${e.message}` : '视觉调用失败，请检查模型配置。';
             setFeedback(errStr);
             void TTSManager.getInstance().speak(errStr);
          } finally {
             if (requestRef.current === activeController) requestRef.current = null;
             if (generation === scanGenerationRef.current) stopCamera();
          }
          
       }, 5000);
       
     } catch (e) {
       if (generation !== scanGenerationRef.current) return;
       stopCamera();
       setStatus('idle');
       alert('无法获取摄像头权限。');
     }
  };

  const stopScan = (keepActiveState = false) => {
    cancelPendingWork();
    if (keepActiveState !== true) {
        setIsActive(false);
        setStatus('idle');
        setFeedback('');
    }
  };

  useEffect(() => () => {
    cancelPendingWork();
    TTSManager.getInstance().stop();
  }, []);

  return <Panel title="魔镜审核 (AI Vision Check)" caption="拍摄的单张照片会发送到你配置的大模型接口进行视觉分析；照片不会写入实验室本地记录。">
    <div className="rounded-3xl bg-slate-900 p-5 text-center shadow-xl border-2 border-indigo-500/30">
      <div className={`w-full aspect-square bg-slate-950 rounded-2xl overflow-hidden relative mb-4 border-2 transition-all ${status === 'passed' ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : status === 'failed' ? 'border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]' : 'border-indigo-500/50'}`}>
        {(status === 'idle' || status === 'scanning') && (
            <video ref={videoRef} className="w-full h-full object-cover opacity-60" playsInline muted />
        )}
        
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          {status === 'idle' && <Eye className="w-12 h-12 text-indigo-400 mb-2 opacity-50" />}
          {status === 'scanning' && <div className="w-full h-1 bg-indigo-500/50 absolute top-1/2 -translate-y-1/2 animate-[scan_2s_ease-in-out_infinite]" />}
          {status === 'analyzing' && <div className="text-indigo-400 font-bold animate-pulse">🤖 AI 大模型视觉分析中...</div>}
          {status === 'passed' && <div className="text-emerald-400 font-black text-2xl drop-shadow-md">[PASS] 审核通过</div>}
          {status === 'failed' && <div className="text-rose-500 font-black text-2xl drop-shadow-md">[FAIL] 审核不合格</div>}
        </div>
      </div>
      
      {feedback && (
          <div className="mb-4 text-xs font-bold text-slate-300 bg-black/40 p-3 rounded-xl italic">
              " {feedback} "
          </div>
      )}

      {status === 'idle' || status === 'passed' || status === 'failed' ? (
        <><label className="mb-3 flex items-start gap-2 rounded-xl bg-indigo-950/70 p-3 text-left text-[10px] font-bold leading-relaxed text-indigo-200"><input type="checkbox" checked={uploadConfirmed} onChange={(event) => setUploadConfirmed(event.target.checked)} className="mt-0.5 accent-indigo-500" />我确认本次拍摄会在 5 秒倒计时后发送到当前配置的 AI 接口。</label><button disabled={!uploadConfirmed} onClick={startScan} className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-black text-xs hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">
            {status === 'idle' ? '启动 AI 视觉魔镜' : '重新扫描'}
        </button></>
      ) : (
        <button onClick={() => stopScan(false)} className="w-full py-3 rounded-2xl bg-rose-600 text-white font-black text-xs">中断并放弃</button>
      )}
    </div>
  </Panel>;
};

const getBarbieScreenAngle = (): number => {
  const orientationAngle = window.screen?.orientation?.angle;
  const legacyAngle = (window as Window & { orientation?: number }).orientation;
  return Number.isFinite(orientationAngle) ? Number(orientationAngle) : Number.isFinite(legacyAngle) ? Number(legacyAngle) : 0;
};

const PostureCorrector: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const safetyConfig = useAppStore((store) => store.safetyConfig);
  const [mode, setMode] = useState<BarbiePostureMode>('heels');
  const [sensitivity, setSensitivity] = useState<BarbiePostureSensitivity>('balanced');
  const [durationSec, setDurationSec] = useState(180);
  const [phase, setPhase] = useState<'idle' | 'calibrating' | 'training' | 'paused'>('idle');
  const [remainingSec, setRemainingSec] = useState(180);
  const [pitch, setPitch] = useState(0);
  const [roll, setRoll] = useState(0);
  const [liveMetric, setLiveMetric] = useState('等待开始');
  const [modeDetail, setModeDetail] = useState('等待有效传感器数据');
  const [status, setStatus] = useState<'ready' | 'stable' | 'warning' | 'signal-lost' | 'paused'>('ready');
  const [score, setScore] = useState(state.postureStats.completedSessions ? state.postureStats.lastScore : 100);
  const [violationCount, setViolationCount] = useState(0);
  const [stableSeconds, setStableSeconds] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [hardwareOptIn, setHardwareOptIn] = useState(false);
  const [calibrationNote, setCalibrationNote] = useState('尚未校准');
  const [sensorRateHz, setSensorRateHz] = useState(0);
  const [error, setError] = useState('');

  const sessionRef = useRef(0);
  const phaseRef = useRef<typeof phase>('idle');
  const stateRef = useRef(state);
  const hardwareOptInRef = useRef(hardwareOptIn);
  const orientationListenerRef = useRef<EventListener | null>(null);
  const motionListenerRef = useRef<EventListener | null>(null);
  const calibrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trainingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outputOwnedRef = useRef(false);
  const latestRef = useRef({ beta: 0, gamma: 0, acceleration: 0, orientationAt: 0, motionAt: 0 });
  const baselineRef = useRef({ beta: 0, gamma: 0 });
  const calibrationSamplesRef = useRef<BarbiePostureSample[]>([]);
  const calibrationScaleRef = useRef(1);
  const calibrationScreenAngleRef = useRef(0);
  const lastTickAtRef = useRef(0);
  const activeMsRef = useRef(0);
  const stableMsRef = useRef(0);
  const violationMsRef = useRef(0);
  const violationsRef = useRef(0);
  const maxMetricRef = useRef(0);
  const metricIntegralRef = useRef(0);
  const stepTimestampsRef = useRef<number[]>([]);
  const stepPeaksRef = useRef<number[]>([]);
  const currentStepPeakRef = useRef(0);
  const impactAboveRef = useRef(false);
  const lastStepAtRef = useRef(0);
  const consecutiveViolationRef = useRef(0);
  const inViolationRef = useRef(false);
  const lastCueAtRef = useRef(0);

  stateRef.current = state;
  hardwareOptInRef.current = hardwareOptIn;

  const emsMaximum = Math.min(safetyConfig.maxEmsStrengthA, safetyConfig.maxEmsStrengthB);
  const hardwareAllowed = !safetyConfig.emergencyLock
    && emsMaximum > 0;
  const isActive = phase !== 'idle';

  const setPhaseSafe = (next: typeof phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const stopOwnedOutput = () => {
    if (!outputOwnedRef.current) return;
    outputOwnedRef.current = false;
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
  };

  const removeListeners = () => {
    if (orientationListenerRef.current) window.removeEventListener('deviceorientation', orientationListenerRef.current);
    if (motionListenerRef.current) window.removeEventListener('devicemotion', motionListenerRef.current);
    orientationListenerRef.current = null;
    motionListenerRef.current = null;
  };

  const clearRuntime = () => {
    removeListeners();
    if (calibrationTimerRef.current) clearTimeout(calibrationTimerRef.current);
    if (trainingTimerRef.current) clearInterval(trainingTimerRef.current);
    calibrationTimerRef.current = null;
    trainingTimerRef.current = null;
    stopOwnedOutput();
  };

  const announce = (message: string) => {
    if (voiceEnabled) void TTSManager.getInstance().speak(message);
  };

  const sendPostureCue = async () => {
    const latestState = stateRef.current;
    const device = DeviceManager.getInstance();
    const liveSafety = device.getSafetyConfig();
    if (!hardwareOptInRef.current
      || liveSafety.emergencyLock) return;
    const strength = device.getRandomEmsStrength(HARDWARE_OUTPUT_CEILING);
    if (strength <= 0) return;
    try {
      outputOwnedRef.current = true;
      await device.setEmsStrength('AB', strength);
      device.scheduleOutputStop('ems', 1);
    } catch (cueError) {
      console.warn('姿态短触觉提示失败:', cueError);
    }
  };

  const pauseSession = (message = '训练已手动暂停', signalLost = false) => {
    if (phaseRef.current !== 'training') return;
    setPhaseSafe('paused');
    setStatus(signalLost ? 'signal-lost' : 'paused');
    setLiveMetric(message);
    consecutiveViolationRef.current = 0;
    inViolationRef.current = false;
    lastTickAtRef.current = Date.now();
    stopOwnedOutput();
  };

  const finishSession = (completed: boolean, selectedMode = mode, selectedSensitivity = sensitivity) => {
    const finalScore = completed
      ? calculateBarbiePostureScore(violationsRef.current, activeMsRef.current / 1000, stableMsRef.current / 1000)
      : score;
    const completedAt = Date.now();
    const stabilityPercent = activeMsRef.current > 0
      ? Math.round((stableMsRef.current / activeMsRef.current) * 100)
      : 0;
    const cadenceSpm = selectedMode === 'heels' ? calculateBarbieStepCadence(stepTimestampsRef.current, completedAt) : 0;
    const consistencyPercent = selectedMode === 'heels' ? calculateBarbieStepConsistency(stepPeaksRef.current) : 0;
    sessionRef.current += 1;
    clearRuntime();
    setPhaseSafe('idle');
    setScore(finalScore);
    setLiveMetric(completed ? `训练完成 · ${finalScore} 分` : '训练已停止');
    setStatus('ready');
    setHardwareOptIn(false);
    const latestState = stateRef.current;
    if (!completed) {
      update({ audit: [`${getToday()} · 姿态训练由用户手动停止`, ...latestState.audit].slice(0, 20) });
      return;
    }
    const gain = finalScore >= 90 ? 4 : finalScore >= 75 ? 3 : finalScore >= 60 ? 2 : 1;
    const record: BarbiePostureSessionRecord = {
      id: `posture-${completedAt}`,
      completedAt,
      mode: selectedMode,
      sensitivity: selectedSensitivity,
      durationSec: Math.max(1, Math.round(activeMsRef.current / 1000)),
      score: finalScore,
      stabilityPercent,
      violationCount: violationsRef.current,
      violationDurationSec: Math.round(violationMsRef.current / 1000),
      maxMetric: Math.round(maxMetricRef.current * 10) / 10,
      averageMetric: activeMsRef.current > 0 ? Math.round((metricIntegralRef.current / activeMsRef.current) * 10) / 10 : 0,
      cadenceSpm,
      consistencyPercent,
    };
    update({
      growth: { ...latestState.growth, '仪态': Math.min(100, latestState.growth['仪态'] + gain) },
      postureStats: {
        completedSessions: latestState.postureStats.completedSessions + 1,
        bestScore: Math.max(latestState.postureStats.bestScore, finalScore),
        lastScore: finalScore,
        lastCompletedAt: completedAt,
      },
      postureHistory: [record, ...(latestState.postureHistory ?? [])].slice(0, 20),
      audit: [`${getToday()} · ${BARBIE_POSTURE_PROGRAMS[selectedMode].title}完成 ${finalScore} 分，稳定率 ${stabilityPercent}%，仪态 +${gain}`, ...latestState.audit].slice(0, 20),
    });
    announce(`姿态训练完成，得分 ${finalScore}，稳定率百分之 ${stabilityPercent}。仪态成长增加 ${gain} 点。`);
  };

  const requestPermission = async (selectedMode: BarbiePostureMode) => {
    const Orientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
    const Motion = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
    if (selectedMode === 'heels') {
      if (!Motion) return false;
      return typeof Motion.requestPermission !== 'function' || await Motion.requestPermission() === 'granted';
    }
    if (!Orientation) return false;
    return typeof Orientation.requestPermission !== 'function' || await Orientation.requestPermission() === 'granted';
  };

  const recordCalibrationSample = (sample: BarbiePostureSample) => {
    calibrationSamplesRef.current.push(sample);
    if (calibrationSamplesRef.current.length > 240) calibrationSamplesRef.current.shift();
    const sampleCount = calibrationSamplesRef.current.length;
    if (sampleCount % 6 === 0) {
      setModeDetail(`传感器自检 · 已采集 ${sampleCount} 帧 · 请保持手机稳定`);
    }
  };

  const beginTrainingTimer = (session: number, selectedMode: BarbiePostureMode, selectedSensitivity: BarbiePostureSensitivity) => {
    activeMsRef.current = 0;
    stableMsRef.current = 0;
    violationMsRef.current = 0;
    lastTickAtRef.current = Date.now();
    setPhaseSafe('training');
    setStatus('stable');
    setLiveMetric('校准完成，保持自然动作');
    announce('校准完成，训练开始。保持自然呼吸，如有不适请立即停止。');
    trainingTimerRef.current = setInterval(() => {
      const now = Date.now();
      const tickMs = Math.max(0, Math.min(500, now - lastTickAtRef.current));
      lastTickAtRef.current = now;
      if (session !== sessionRef.current || phaseRef.current !== 'training') return;
      if (document.visibilityState === 'hidden') {
        pauseSession('应用进入后台，训练已暂停', true);
        return;
      }
      if (normalizeBarbiePostureAngleDelta(getBarbieScreenAngle() - calibrationScreenAngleRef.current) !== 0) {
        pauseSession('检测到横竖屏变化，请重新校准', true);
        return;
      }
      const needsMotion = selectedMode === 'heels';
      const signalAt = needsMotion ? latestRef.current.motionAt : latestRef.current.orientationAt;
      if (!signalAt || now - signalAt > 2500) {
        pauseSession('传感器信号中断，训练已暂停', true);
        return;
      }

      activeMsRef.current += tickMs;
      const assessment = assessBarbiePosture(selectedMode, {
        deltaBeta: normalizeBarbiePostureAngleDelta(latestRef.current.beta - baselineRef.current.beta),
        deltaGamma: normalizeBarbiePostureAngleDelta(latestRef.current.gamma - baselineRef.current.gamma),
        linearAcceleration: latestRef.current.acceleration,
      }, selectedSensitivity, calibrationScaleRef.current);
      maxMetricRef.current = Math.max(maxMetricRef.current, assessment.metric);
      metricIntegralRef.current += assessment.metric * tickMs;
      setLiveMetric(`${assessment.label} ${assessment.metric.toFixed(1)} / ${assessment.threshold.toFixed(1)}`);
      if (selectedMode === 'heels') {
        const cadence = calculateBarbieStepCadence(stepTimestampsRef.current, now);
        const consistency = calculateBarbieStepConsistency(stepPeaksRef.current);
        setModeDetail(cadence > 0 ? `步频 ${cadence} 步/分 · 落脚一致性 ${consistency || '采集中'}${consistency ? '%' : ''}` : '正在识别连续步伐');
      } else {
        setModeDetail(`${assessment.detail} · ${assessment.secondaryLabel} ${assessment.secondaryMetric.toFixed(1)}`);
      }
      if (assessment.isViolation) {
        violationMsRef.current += tickMs;
        consecutiveViolationRef.current += 1;
        setStatus('warning');
        if (!inViolationRef.current) {
          inViolationRef.current = true;
          violationsRef.current += 1;
          setViolationCount(violationsRef.current);
        }
        if (consecutiveViolationRef.current >= 3 && now - lastCueAtRef.current >= 6000) {
          consecutiveViolationRef.current = 0;
          lastCueAtRef.current = now;
          announce(assessment.correction);
          if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
          void sendPostureCue();
        }
      } else {
        consecutiveViolationRef.current = 0;
        inViolationRef.current = false;
        stableMsRef.current += tickMs;
        setStableSeconds(Math.floor(stableMsRef.current / 1000));
        setStatus('stable');
      }
      const nextScore = calculateBarbiePostureScore(violationsRef.current, activeMsRef.current / 1000, stableMsRef.current / 1000);
      setScore(nextScore);
      const nextRemaining = Math.max(0, Math.ceil((durationSec * 1000 - activeMsRef.current) / 1000));
      setRemainingSec(nextRemaining);
      if (activeMsRef.current >= durationSec * 1000) finishSession(true, selectedMode, selectedSensitivity);
    }, 250);
  };

  const start = async () => {
    const latestState = stateRef.current;
    if (hardwareOptInRef.current && !hardwareAllowed) {
      setError(safetyConfig.emergencyLock ? '全局急停锁已激活，本次不能启用硬件提示。' : 'EMS 上限为 0，本次不能启用硬件提示。');
      return;
    }
    setError('');
    setCalibrationNote('正在收集多帧传感器样本');
    const session = ++sessionRef.current;
    clearRuntime();
    latestRef.current = { beta: 0, gamma: 0, acceleration: 0, orientationAt: 0, motionAt: 0 };
    calibrationSamplesRef.current = [];
    calibrationScaleRef.current = 1;
    calibrationScreenAngleRef.current = getBarbieScreenAngle();
    violationsRef.current = 0;
    consecutiveViolationRef.current = 0;
    lastCueAtRef.current = 0;
    inViolationRef.current = false;
    maxMetricRef.current = 0;
    metricIntegralRef.current = 0;
    stepTimestampsRef.current = [];
    stepPeaksRef.current = [];
    currentStepPeakRef.current = 0;
    impactAboveRef.current = false;
    lastStepAtRef.current = 0;
    setViolationCount(0);
    setStableSeconds(0);
    setScore(100);
    setModeDetail('正在进行传感器自检');
    setSensorRateHz(0);
    setRemainingSec(durationSec);
    setPhaseSafe('calibrating');
    setStatus('ready');
    setLiveMetric('正在请求传感器并准备校准');
    try {
      if (!await requestPermission(mode)) throw new Error('所需传感器权限未授予');
      if (session !== sessionRef.current) return;
      orientationListenerRef.current = ((event: DeviceOrientationEvent) => {
        if (session !== sessionRef.current || event.beta === null || event.gamma === null) return;
        const rotated = rotateBarbiePostureAngles(event.beta, event.gamma, getBarbieScreenAngle());
        latestRef.current.beta = rotated.beta;
        latestRef.current.gamma = rotated.gamma;
        latestRef.current.orientationAt = Date.now();
        setPitch(rotated.beta);
        setRoll(rotated.gamma);
        if (phaseRef.current === 'calibrating' && mode !== 'heels') {
          recordCalibrationSample({ deltaBeta: rotated.beta, deltaGamma: rotated.gamma, linearAcceleration: latestRef.current.acceleration });
        }
      }) as EventListener;
      motionListenerRef.current = ((event: DeviceMotionEvent) => {
        if (session !== sessionRef.current) return;
        const source = event.acceleration || event.accelerationIncludingGravity;
        if (!source) return;
        const magnitude = Math.sqrt((source.x || 0) ** 2 + (source.y || 0) ** 2 + (source.z || 0) ** 2);
        latestRef.current.acceleration = event.acceleration ? magnitude : Math.abs(magnitude - 9.81);
        const motionAt = Date.now();
        latestRef.current.motionAt = motionAt;
        if (phaseRef.current === 'training' && mode === 'heels') {
          const impact = latestRef.current.acceleration;
          if (impact >= 1.2) {
            impactAboveRef.current = true;
            currentStepPeakRef.current = Math.max(currentStepPeakRef.current, impact);
          } else if (impactAboveRef.current) {
            impactAboveRef.current = false;
            if (motionAt - lastStepAtRef.current >= 250) {
              lastStepAtRef.current = motionAt;
              stepTimestampsRef.current = [...stepTimestampsRef.current, motionAt].slice(-60);
              stepPeaksRef.current = [...stepPeaksRef.current, currentStepPeakRef.current].slice(-60);
            }
            currentStepPeakRef.current = 0;
          }
        }
        if (phaseRef.current === 'calibrating' && mode === 'heels') {
          recordCalibrationSample({ deltaBeta: latestRef.current.beta, deltaGamma: latestRef.current.gamma, linearAcceleration: latestRef.current.acceleration });
        }
      }) as EventListener;
      window.addEventListener('deviceorientation', orientationListenerRef.current, { passive: true });
      window.addEventListener('devicemotion', motionListenerRef.current, { passive: true });
      announce(`请按说明放好手机，并保持当前基准姿态。三秒后开始${BARBIE_POSTURE_PROGRAMS[mode].title}。`);
      setLiveMetric('保持基准姿态 · 多帧校准中');
      calibrationTimerRef.current = setTimeout(() => {
        if (session !== sessionRef.current) return;
        const calibration = calibrateBarbiePosture(mode, calibrationSamplesRef.current);
        if (!calibration.isValid) {
          sessionRef.current += 1;
          clearRuntime();
          setPhaseSafe('idle');
          setError(calibration.message);
          setCalibrationNote(`校准失败 · ${calibration.sampleCount} 个有效样本`);
          setLiveMetric('校准未通过，请重新尝试');
          return;
        }
        baselineRef.current = { beta: calibration.baselineBeta, gamma: calibration.baselineGamma };
        calibrationScaleRef.current = calibration.thresholdScale;
        const sampleRate = Math.round(calibration.sampleCount / 3);
        setSensorRateHz(sampleRate);
        setCalibrationNote(`${calibration.sampleCount} 帧 · 约 ${sampleRate} Hz · 噪声补偿 ×${calibration.thresholdScale.toFixed(2)}`);
        beginTrainingTimer(session, mode, sensitivity);
      }, 3000);
    } catch (sensorError) {
      if (session !== sessionRef.current) return;
      sessionRef.current += 1;
      clearRuntime();
      setPhaseSafe('idle');
      setLiveMetric('传感器未启动');
      setCalibrationNote('校准未完成');
      setError(sensorError instanceof Error ? sensorError.message : '当前设备不支持姿态传感器');
    }
  };

  const resumeTraining = () => {
    if (phaseRef.current !== 'paused') return;
    if (document.visibilityState === 'hidden') {
      setError('请返回应用前台后再继续训练。');
      return;
    }
    if (normalizeBarbiePostureAngleDelta(getBarbieScreenAngle() - calibrationScreenAngleRef.current) !== 0) {
      setError('手机方向已改变，请重新校准后继续。');
      return;
    }
    const signalAt = mode === 'heels' ? latestRef.current.motionAt : latestRef.current.orientationAt;
    if (!signalAt || Date.now() - signalAt > 2500) {
      setError('传感器信号尚未恢复，请检查权限或重新校准。');
      return;
    }
    setError('');
    lastTickAtRef.current = Date.now();
    setPhaseSafe('training');
    setStatus('stable');
    setLiveMetric('训练已继续，保持自然动作');
    announce('训练继续。');
  };

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && phaseRef.current === 'training') {
        setPhaseSafe('paused');
        setStatus('signal-lost');
        setLiveMetric('应用进入后台，训练已暂停');
        stopOwnedOutput();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      sessionRef.current += 1;
      clearRuntime();
    };
  }, []);

  const program = BARBIE_POSTURE_PROGRAMS[mode];
  const postureHistory = state.postureHistory ?? [];
  const recentTrend = postureHistory.slice(0, 7).reverse();
  const recentAverageScore = recentTrend.length
    ? Math.round(recentTrend.reduce((sum, record) => sum + record.score, 0) / recentTrend.length)
    : 0;
  const latestTrendDelta = postureHistory.length >= 2 ? postureHistory[0].score - postureHistory[1].score : 0;
  const progress = isActive ? Math.max(0, Math.min(100, ((durationSec - remainingSec) / durationSec) * 100)) : 0;
  const statusCopy = status === 'warning' ? '正在纠正' : status === 'signal-lost' ? '训练暂停' : status === 'paused' ? '已暂停' : phase === 'calibrating' ? '校准中' : phase === 'training' ? '姿态稳定' : '准备就绪';
  const sensitivityCopy: Record<BarbiePostureSensitivity, string> = { relaxed: '宽松', balanced: '均衡', strict: '严格' };

  return <Panel title="本地姿态教练 3.0" caption="使用手机陀螺仪与加速度计进行多帧相对校准；后台、断线和方向变化会暂停计时，原始运动数据不会上传。">
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(Object.entries(BARBIE_POSTURE_PROGRAMS) as [BarbiePostureMode, typeof program][]).map(([id, item]) => <button key={id} disabled={isActive} onClick={() => setMode(id)} className={`rounded-2xl border p-3 text-left transition disabled:opacity-60 ${mode === id ? 'border-pink-400 bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-md' : 'border-pink-100 bg-pink-50 text-slate-600'}`}><span className="text-[11px] font-black">{item.title}</span><span className={`mt-1 block text-[9px] leading-relaxed ${mode === id ? 'text-pink-50' : 'text-slate-500'}`}>{item.goal}</span></button>)}
      </div>

      <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3 text-[10px] leading-relaxed text-cyan-800"><strong className="block">手机放置与校准</strong>{program.placement}<span className="mt-1 block text-cyan-600">开始后保持 3 秒，系统会分析多帧样本；晃动过大将要求重新校准。</span><span className="mt-1 block font-bold text-cyan-700">{calibrationNote}</span></div>

      {!isActive && <div className="grid grid-cols-2 gap-2">
        <label className="text-[9px] font-bold text-slate-500">训练时长<select value={durationSec} onChange={(event) => { const value = Number(event.target.value); setDurationSec(value); setRemainingSec(value); }} className="mt-1 w-full rounded-xl border border-pink-100 bg-white p-2 text-[10px] text-slate-700"><option value="60">1 分钟体验</option><option value="180">3 分钟标准</option><option value="300">5 分钟进阶</option></select></label>
        <label className="text-[9px] font-bold text-slate-500">灵敏度<select value={sensitivity} onChange={(event) => setSensitivity(event.target.value as BarbiePostureSensitivity)} className="mt-1 w-full rounded-xl border border-pink-100 bg-white p-2 text-[10px] text-slate-700"><option value="relaxed">宽松</option><option value="balanced">均衡</option><option value="strict">严格</option></select></label>
      </div>}

      <div className={`relative overflow-hidden rounded-3xl border p-4 ${status === 'warning' ? 'border-rose-400 bg-rose-950' : status === 'signal-lost' || status === 'paused' ? 'border-amber-400 bg-amber-950' : 'border-emerald-500/50 bg-slate-900'}`}>
        <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-pink-500 to-cyan-400 transition-all" style={{ width: `${progress}%` }} />
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2"><Hand className={`h-8 w-8 shrink-0 ${status === 'warning' ? 'text-rose-400 animate-pulse' : status === 'signal-lost' || status === 'paused' ? 'text-amber-300' : 'text-emerald-400'}`} /><div className="min-w-0"><p className="text-[10px] font-black text-slate-400">{statusCopy}</p><p className="truncate text-xs font-black text-white">{liveMetric}</p></div></div>
          <div className="shrink-0 text-right"><p className="font-mono text-xl font-black text-white">{score}</p><p className="text-[8px] text-slate-500">实时评分</p></div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded-xl bg-white/5 p-2"><p className="font-mono text-[11px] text-cyan-300">{Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}</p><p className="text-[8px] text-slate-500">有效剩余</p></div>
          <div className="rounded-xl bg-white/5 p-2"><p className="font-mono text-[11px] text-emerald-300">{stableSeconds}s</p><p className="text-[8px] text-slate-500">稳定</p></div>
          <div className="rounded-xl bg-white/5 p-2"><p className="font-mono text-[11px] text-rose-300">{violationCount}</p><p className="text-[8px] text-slate-500">偏离段</p></div>
          <div className="rounded-xl bg-white/5 p-2"><p className="font-mono text-[11px] text-violet-300">{pitch.toFixed(0)}°/{roll.toFixed(0)}°</p><p className="text-[8px] text-slate-500">校准角度</p></div>
        </div>
        <p className="mt-2 rounded-xl bg-white/5 px-2.5 py-2 text-[9px] font-bold text-slate-300">{modeDetail}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-2 text-center"><div className="rounded-xl bg-white p-2"><p className="text-[11px] font-black text-cyan-700">{sensorRateHz > 0 ? `${sensorRateHz} Hz` : '--'}</p><p className="text-[8px] text-slate-400">采样频率</p></div><div className="rounded-xl bg-white p-2"><p className="text-[11px] font-black text-cyan-700">{sensorRateHz >= 20 ? '流畅' : sensorRateHz > 0 ? '可用' : '待检测'}</p><p className="text-[8px] text-slate-400">信号质量</p></div><div className="rounded-xl bg-white p-2"><p className="text-[11px] font-black text-cyan-700">本机</p><p className="text-[8px] text-slate-400">处理位置</p></div></div>

      {!isActive && <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
        <label className="flex items-start gap-2 text-[10px] font-bold leading-relaxed text-slate-600"><input type="checkbox" checked={voiceEnabled} onChange={(event) => setVoiceEnabled(event.target.checked)} className="mt-0.5 accent-pink-500" />姿态偏离时播放简短语音纠正</label>
        <label className={`flex items-start gap-2 text-[10px] font-bold leading-relaxed ${hardwareAllowed ? 'text-slate-600' : 'text-slate-400'}`}><input type="checkbox" checked={hardwareOptIn} disabled={!hardwareAllowed} onChange={(event) => setHardwareOptIn(event.target.checked)} className="mt-0.5 accent-rose-500" />本次训练允许 1 秒短触觉提示，强度使用硬件调控 {safetyConfig.minEmsStrength}-{emsMaximum}</label>
        {!hardwareAllowed && <p className="text-[9px] text-amber-600">硬件提示不可用：请检查全局急停锁和 EMS 上限。纯传感训练不受影响。</p>}
      </div>}

      {error && <p className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-[10px] font-bold leading-relaxed text-rose-600">{error}</p>}
      {phase === 'idle' && <button onClick={() => void start()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-orange-400 py-3 text-xs font-black text-white shadow-md"><Activity className="h-4 w-4" />开始校准并训练</button>}
      {phase === 'calibrating' && <button onClick={() => finishSession(false)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3 text-xs font-black text-white"><ShieldAlert className="h-4 w-4" />取消校准</button>}
      {phase === 'training' && <div className="grid grid-cols-2 gap-2"><button onClick={() => pauseSession()} className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3 text-xs font-black text-white"><Clock className="h-4 w-4" />暂停</button><button onClick={() => finishSession(false)} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3 text-xs font-black text-white"><ShieldAlert className="h-4 w-4" />停止</button></div>}
      {phase === 'paused' && <div className="grid grid-cols-3 gap-2"><button onClick={resumeTraining} className="flex items-center justify-center gap-1 rounded-2xl bg-emerald-500 py-3 text-[10px] font-black text-white"><Play className="h-3.5 w-3.5" />继续</button><button onClick={() => void start()} className="flex items-center justify-center gap-1 rounded-2xl bg-cyan-600 py-3 text-[10px] font-black text-white"><RefreshCw className="h-3.5 w-3.5" />重校准</button><button onClick={() => finishSession(false)} className="flex items-center justify-center gap-1 rounded-2xl bg-slate-800 py-3 text-[10px] font-black text-white"><ShieldAlert className="h-3.5 w-3.5" />停止</button></div>}

      <div className="grid grid-cols-3 gap-2 text-center text-[9px]"><div className="rounded-xl bg-pink-50 p-2"><strong className="block text-sm text-pink-600">{state.postureStats.completedSessions}</strong>完成次数</div><div className="rounded-xl bg-pink-50 p-2"><strong className="block text-sm text-pink-600">{state.postureStats.bestScore}</strong>最佳得分</div><div className="rounded-xl bg-pink-50 p-2"><strong className="block text-sm text-pink-600">{state.growth['仪态']}%</strong>仪态成长</div></div>

      {postureHistory.length > 0 && <div className="rounded-2xl border border-pink-100 bg-gradient-to-br from-white to-pink-50 p-3"><div className="flex items-center justify-between"><strong className="text-[11px] text-slate-700">最近训练报告</strong><span className="text-[9px] text-slate-400">本机保存最近 20 次</span></div><div className="mt-3 rounded-2xl bg-white p-3 shadow-sm"><div className="flex items-end justify-between"><div><p className="text-[8px] font-bold text-slate-400">近 {recentTrend.length} 次平均</p><p className="font-mono text-xl font-black text-pink-600">{recentAverageScore}</p></div><p className={`text-[9px] font-black ${latestTrendDelta > 0 ? 'text-emerald-600' : latestTrendDelta < 0 ? 'text-rose-500' : 'text-slate-400'}`}>{latestTrendDelta > 0 ? '+' : ''}{latestTrendDelta} 较上次</p></div><div className="mt-2 flex h-12 items-end gap-1">{recentTrend.map((record) => <div key={`trend-${record.id}`} className="flex-1 rounded-t bg-gradient-to-t from-pink-500 to-cyan-300" style={{ height: `${Math.max(6, record.score)}%` }} title={`${record.score} 分`} />)}</div></div><div className="mt-2 space-y-2">{postureHistory.slice(0, 5).map((record) => <div key={record.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-white p-2.5 shadow-sm"><div><p className="text-[10px] font-black text-slate-700">{BARBIE_POSTURE_PROGRAMS[record.mode].title} · {sensitivityCopy[record.sensitivity]}</p><p className="mt-0.5 text-[8px] text-slate-400">{new Date(record.completedAt).toLocaleString('zh-CN')} · {Math.round(record.durationSec / 60)} 分钟 · 平均/最大 {record.averageMetric}/{record.maxMetric}</p><p className="mt-0.5 text-[8px] text-slate-400">偏离 {record.violationDurationSec}s · {record.mode === 'heels' && record.cadenceSpm > 0 ? `步频 ${record.cadenceSpm} · 一致性 ${record.consistencyPercent}%` : `${record.violationCount} 段`}</p></div><div className="text-right"><p className="font-mono text-sm font-black text-pink-600">{record.score}</p><p className="text-[8px] text-slate-400">稳定 {record.stabilityPercent}%</p></div></div>)}</div></div>}
    </div>
  </Panel>;
};

const Choreography: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const [isActive, setIsActive] = useState(false);
  const [bpm, setBpm] = useState(120);
  const audioCtx = useRef<AudioContext | null>(null);
  const lastBeatTime = useRef<number>(0);
  const motionHistory = useRef<number[]>([]);
  const shakeScore = useRef(0);
  const motionListenerRef = useRef<EventListener | null>(null);
  const beatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const danceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const emsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef(0);
  
  const handleMotion = (e: DeviceMotionEvent) => {
    if (!e.acceleration) return;
    const x = e.acceleration.x || 0;
    const y = e.acceleration.y || 0;
    const z = e.acceleration.z || 0;
    const mag = Math.sqrt(x*x + y*y + z*z);
    
    // We are looking for rhythmic peaks matching the BPM
    if (mag > 5) {
       const now = Date.now();
       if (now - lastBeatTime.current > 300) { // debounce
           motionHistory.current.push(now);
           lastBeatTime.current = now;
       }
    }
  };

  const playBeat = () => {
    if (!audioCtx.current) return;
    try {
        const osc = audioCtx.current.createOscillator();
        const gain = audioCtx.current.createGain();
        osc.frequency.setValueAtTime(150, audioCtx.current.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.current.currentTime + 0.1);
        gain.gain.setValueAtTime(1, audioCtx.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.current.destination);
        osc.start();
        osc.stop(audioCtx.current.currentTime + 0.1);
    } catch(e) {}
  };

  const start = async () => {
    const session = ++sessionRef.current;
    if (motionListenerRef.current) {
      window.removeEventListener('devicemotion', motionListenerRef.current);
    }
    setIsActive(true);
    try {
      const Motion = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
      if (typeof Motion.requestPermission === 'function' && await Motion.requestPermission() !== 'granted') {
        if (session === sessionRef.current) setIsActive(false);
        return;
      }
      if (session !== sessionRef.current) return;
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      if (session === sessionRef.current) setIsActive(false);
      console.error('节拍训练启动失败:', error);
      return;
    }
    void TTSManager.getInstance().speak('把手机绑在腰上。必须严格踩着节拍扭动发情。快了慢了都要挨电。');
    motionListenerRef.current = (event) => handleMotion(event as DeviceMotionEvent);
    window.addEventListener('devicemotion', motionListenerRef.current);
    
    motionHistory.current = [];
    
    const intervalMs = (60 / bpm) * 1000;
    
    beatTimerRef.current = setInterval(() => {
        playBeat();
    }, intervalMs);
    
    // Monitor every 4 beats
    danceTimerRef.current = setInterval(() => {
       const recentBeats = motionHistory.current.filter(t => Date.now() - t < intervalMs * 4);
       
       if (recentBeats.length < 2) {
          void TTSManager.getInstance().speak('太慢了！扭起来！');
          sendRandomShock(HARDWARE_OUTPUT_CEILING);
          if (emsTimerRef.current) clearTimeout(emsTimerRef.current);
          emsTimerRef.current = setTimeout(() => {
            emsTimerRef.current = null;
            if (session === sessionRef.current) void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
          }, 1000);
          shakeScore.current = 0;
       } else if (recentBeats.length > 6) {
          void TTSManager.getInstance().speak('太快了！必须严丝合缝地踩准节拍！');
          sendRandomShock(HARDWARE_OUTPUT_CEILING);
          if (emsTimerRef.current) clearTimeout(emsTimerRef.current);
          emsTimerRef.current = setTimeout(() => {
            emsTimerRef.current = null;
            if (session === sessionRef.current) void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
          }, 1000);
          shakeScore.current = 0;
       } else {
          shakeScore.current += 1;
          sendRandomToy(HARDWARE_OUTPUT_CEILING);
       }
       motionHistory.current = [];
    }, intervalMs * 4);
  };
  
  const stop = () => {
    sessionRef.current++;
    setIsActive(false);
    if (motionListenerRef.current) {
      window.removeEventListener('devicemotion', motionListenerRef.current);
      motionListenerRef.current = null;
    }
    if (danceTimerRef.current) {
      clearInterval(danceTimerRef.current);
      danceTimerRef.current = null;
    }
    if (beatTimerRef.current) {
      clearInterval(beatTimerRef.current);
      beatTimerRef.current = null;
    }
    if (emsTimerRef.current) {
      clearTimeout(emsTimerRef.current);
      emsTimerRef.current = null;
    }
    void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    if (audioCtx.current) {
      void audioCtx.current.close().catch(() => undefined);
      audioCtx.current = null;
    }
  };

  useEffect(() => () => stop(), []);

  return <Panel title="强迫发情律动 (BPM Slut Rhythm)" caption="播放节拍器。手机加速度计实时检测你的扭腰频率，必须严格与 BPM 匹配。太快、太慢、或不均匀，立刻电击。">
    <div className="rounded-3xl bg-slate-900 p-5 text-center shadow-xl border-2 border-pink-500/30">
      <Music className={`w-12 h-12 mx-auto mb-4 ${isActive ? 'text-pink-500 animate-spin' : 'text-slate-600'}`} />
      
      <div className="mb-6">
        <p className="text-pink-400 font-bold mb-2">发情频率 (BPM): {bpm}</p>
        <input 
          type="range" min="60" max="180" step="10" 
          value={bpm} onChange={(e) => setBpm(Number(e.target.value))}
          disabled={isActive}
          className="w-full accent-pink-500" 
        />
      </div>

      {!isActive ? (
        <button onClick={() => void start()} className="w-full py-3 rounded-2xl bg-pink-600 text-white font-black">开始跟节拍扭腰</button>
      ) : (
        <button onClick={stop} className="w-full py-3 rounded-2xl bg-slate-700 text-white font-black">中断</button>
      )}
    </div>
  </Panel>;
};

const DailyRituals: React.FC<{
  state: SuiteState;
  update: (patch: Partial<SuiteState>) => void;
  voicePromptsEnabled: boolean;
}> = ({ state, update, voicePromptsEnabled }) => {
  const { safetyConfig } = useAppStore();
  const [activeTask, setActiveTask] = useState<BarbieDailyRitualTaskId | null>(null);
  const [runState, setRunState] = useState<'idle' | 'connecting' | 'calibrating' | 'running' | 'completed' | 'error'>('idle');
  const [notice, setNotice] = useState('选择一项仪式开始。检测只在本机处理，默认不会控制硬件。');
  const [progress, setProgress] = useState(0);
  const [liveMetric, setLiveMetric] = useState('等待开始');
  const [hardwareOptIn, setHardwareOptIn] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const sessionRef = useRef(0);
  const poseLatchedRef = useRef(false);
  const poseCountRef = useRef(0);
  const poseIndexRef = useRef(0);
  const poseHoldStartedRef = useRef(0);
  const wrongPoseStartedRef = useRef(0);
  const lastFeedbackAtRef = useRef(0);
  const hardwareOptInRef = useRef(false);
  const voicePromptsEnabledRef = useRef(false);
  const completedTaskIds = getCompletedBarbieRitualTaskIds(state.rituals);
  const completedCount = completedTaskIds.length;
  const emsMaximum = Math.min(safetyConfig.maxEmsStrengthA, safetyConfig.maxEmsStrengthB);
  const canOfferHardware = !safetyConfig.emergencyLock && emsMaximum > 0;
  hardwareOptInRef.current = hardwareOptIn;
  voicePromptsEnabledRef.current = voicePromptsEnabled;

  const speakPrompt = (text: string) => {
    if (voicePromptsEnabledRef.current) void TTSManager.getInstance().speak(text);
  };

  const scheduleTimeout = (callback: () => void, delayMs: number, session: number) => {
    const timer = setTimeout(() => {
      timeoutsRef.current.delete(timer);
      if (session === sessionRef.current) callback();
    }, delayMs);
    timeoutsRef.current.add(timer);
  };

  const cleanupResources = () => {
    sessionRef.current++;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    timeoutsRef.current.forEach((timer) => clearTimeout(timer));
    timeoutsRef.current.clear();
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      try { wsRef.current.close(); } catch {}
    }
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => undefined);
    audioContextRef.current = null;
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
  };

  const issueOptionalFeedback = (session: number) => {
    if (!hardwareOptInRef.current) return;
    const deviceManager = DeviceManager.getInstance();
    const currentSafety = deviceManager.getSafetyConfig();
    if (currentSafety.emergencyLock) return;
    const strength = deviceManager.getRandomEmsStrength(HARDWARE_OUTPUT_CEILING);
    if (strength <= 0) return;
    void deviceManager.setEmsStrength('AB', strength).then(() => {
      scheduleTimeout(() => {
        void deviceManager.setEmsStrength('AB', 0).catch(() => undefined);
      }, 1_000, session);
    }).catch((error) => setNotice(`触觉提示未执行：${error instanceof Error ? error.message : String(error)}`));
  };

  const finishTask = (taskId: BarbieDailyRitualTaskId) => {
    const alreadyCompleted = completedTaskIds.includes(taskId);
    cleanupResources();
    setActiveTask(null);
    setRunState('completed');
    setProgress(100);
    setLiveMetric('今日盖章完成');
    setNotice('检测通过，仪式记录已保存在本机。');
    setHardwareOptIn(false);
    TTSManager.getInstance().stop();
    speakPrompt('检测通过，今日仪式完成。');
    AchievementEngine.getInstance().checkRitualComplete(taskId);
    if (alreadyCompleted) return;

    const record = createBarbieRitualCompletionRecord(taskId);
    const task = BARBIE_DAILY_RITUAL_TASKS.find((item) => item.id === taskId);
    const growthKey = taskId === 'voice' ? '声线' : '仪态';
    update({
      rituals: [record, ...state.rituals.filter((item) => item !== record)].slice(0, 30),
      growth: { ...state.growth, [growthKey]: Math.min(100, state.growth[growthKey] + 3) },
      audit: [`${getToday()} · 完成仪式「${task?.title || taskId}」，${growthKey}成长 +3`, ...state.audit].slice(0, 20),
    });
  };

  const failTask = (message: string) => {
    cleanupResources();
    setActiveTask(null);
    setRunState('error');
    setProgress(0);
    setLiveMetric('未启动');
    setNotice(message);
    setHardwareOptIn(false);
    TTSManager.getInstance().stop();
  };

  const monitorWrongPose = (isMatch: boolean, session: number) => {
    if (isMatch) {
      wrongPoseStartedRef.current = 0;
      return;
    }
    const now = Date.now();
    if (wrongPoseStartedRef.current === 0) wrongPoseStartedRef.current = now;
    if (now - wrongPoseStartedRef.current >= 5_000 && now - lastFeedbackAtRef.current >= 8_000) {
      lastFeedbackAtRef.current = now;
      wrongPoseStartedRef.current = now;
      setNotice(hardwareOptInRef.current ? '姿态持续偏离，已发送一次短触觉提示。' : '姿态持续偏离，请按当前口令调整。');
      issueOptionalFeedback(session);
    }
  };

  const startYoloTask = (taskId: 'kowtow' | 'obedience', session: number) => {
    let storedUrl = '';
    try { storedUrl = localStorage.getItem('ycy_yolo_ws_url') || ''; } catch {}
    const wsUrl = parseYoloWebSocketUrl(storedUrl);
    if (!wsUrl) {
      failTask('尚未配置 YOLO 服务器。请先到“全视之眼”连接服务器，成功后再返回仪式。');
      return;
    }
    setRunState('connecting');
    setNotice(`正在连接 ${wsUrl}`);
    const connectionTimeout = setTimeout(() => {
      timeoutsRef.current.delete(connectionTimeout);
      if (session === sessionRef.current) failTask('YOLO 连接超过 8 秒，请检查电脑服务与局域网。');
    }, 8_000);
    timeoutsRef.current.add(connectionTimeout);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        if (session !== sessionRef.current || wsRef.current !== ws) return;
        clearTimeout(connectionTimeout);
        timeoutsRef.current.delete(connectionTimeout);
        setRunState('running');
        if (taskId === 'kowtow') {
          setNotice('请完成三次独立俯身礼。每次起身后再进行下一次。');
          setLiveMetric('等待 kowtow 姿态');
          speakPrompt('视觉仪式开始。请完成三次俯身礼，每次起身后再进行下一次。');
        } else {
          setNotice('第一项口令：跪姿。每项稳定保持一秒即可通过。');
          setLiveMetric('目标：kneel');
          speakPrompt('三段姿态口令开始。第一项，跪姿。');
        }
      };
      ws.onmessage = (event) => {
        if (session !== sessionRef.current || typeof event.data !== 'string') return;
        const result = parseYoloVisionMessage(event.data);
        if (!result) return;
        const livePose = result.rawPose || result.pose;
        const liveConfidence = result.rawConfidence ?? result.confidence;
        if (taskId === 'kowtow') {
          const matched = matchesBarbieRitualPose(result, 'kowtow');
          setLiveMetric(`即时：${livePose} ${Math.round(liveConfidence * 100)}% · 安全确认：${result.pose}`);
          monitorWrongPose(matched || result.pose === 'unknown', session);
          if (!matched) {
            poseLatchedRef.current = false;
            return;
          }
          if (poseLatchedRef.current) return;
          poseLatchedRef.current = true;
          poseCountRef.current += 1;
          const count = poseCountRef.current;
          setProgress(Math.round(count / 3 * 100));
          setNotice(`第 ${count}/3 次俯身礼已确认，请先起身。`);
          speakPrompt(`第${count}次确认。`);
          if (count >= 3) finishTask(taskId);
          return;
        }

        const sequence = [
          { pose: 'kneel', label: '跪姿' },
          { pose: 'hands_up', label: '双手举起' },
          { pose: 'dog', label: '四足姿态' },
        ];
        const expected = sequence[poseIndexRef.current];
        if (!expected) return;
        const matched = matchesBarbieRitualPose(result, expected.pose);
        setLiveMetric(`目标：${expected.pose} · 即时：${livePose} ${Math.round(liveConfidence * 100)}% · 安全：${result.pose}`);
        monitorWrongPose(matched || result.pose === 'unknown', session);
        if (!matched) {
          poseHoldStartedRef.current = 0;
          return;
        }
        if (poseHoldStartedRef.current === 0) poseHoldStartedRef.current = Date.now();
        if (Date.now() - poseHoldStartedRef.current < 1_000) return;
        poseHoldStartedRef.current = 0;
        poseIndexRef.current += 1;
        const nextIndex = poseIndexRef.current;
        setProgress(Math.round(nextIndex / sequence.length * 100));
        if (nextIndex >= sequence.length) {
          finishTask(taskId);
        } else {
          const next = sequence[nextIndex];
          setNotice(`“${expected.label}”通过。下一项：${next.label}。`);
          speakPrompt(`${expected.label}通过。下一项，${next.label}。`);
        }
      };
      ws.onerror = () => {
        if (session === sessionRef.current) failTask('YOLO WebSocket 连接失败，请确认服务器正在运行。');
      };
      ws.onclose = () => {
        if (session === sessionRef.current && runState !== 'completed') failTask('YOLO 连接已断开，本次仪式已安全停止。');
      };
    } catch (error) {
      failTask(`无法创建 YOLO 连接：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const startVoiceTask = async (session: number) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      failTask('当前环境不支持麦克风采集。');
      return;
    }
    try {
      setRunState('calibrating');
      setNotice('正在校准环境噪声，请保持安静 1.5 秒。');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) throw new Error('当前环境不支持 AudioContext');
      const context = new AudioContextClass();
      audioContextRef.current = context;
      if (context.state === 'suspended') await context.resume();
      if (session !== sessionRef.current) return;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1_024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const calibrationStartedAt = Date.now();
      let baselineTotal = 0;
      let baselineCount = 0;
      let threshold = 0.04;
      let holdStartedAt = 0;
      let calibrated = false;

      intervalRef.current = setInterval(() => {
        if (session !== sessionRef.current) return;
        analyser.getByteTimeDomainData(samples);
        const rms = calculateAudioRms(samples);
        const elapsedCalibration = Date.now() - calibrationStartedAt;
        if (elapsedCalibration < 1_500) {
          baselineTotal += rms;
          baselineCount += 1;
          setProgress(Math.min(20, Math.round(elapsedCalibration / 1_500 * 20)));
          setLiveMetric(`环境音量 ${Math.round(rms * 100)}%`);
          return;
        }
        if (!calibrated) {
          calibrated = true;
          const baseline = baselineCount > 0 ? baselineTotal / baselineCount : 0;
          threshold = Math.max(0.04, Math.min(0.25, baseline * 2.5));
          setRunState('running');
          setNotice('请用舒适且清晰的音量连续发声 3 秒；无需喊叫。');
          speakPrompt('校准完成。请用舒适清晰的音量连续发声三秒。');
        }
        const isVoiced = rms >= threshold;
        setLiveMetric(`实时音量 ${Math.round(rms * 100)}% · 门槛 ${Math.round(threshold * 100)}%`);
        if (!isVoiced) {
          holdStartedAt = 0;
          setProgress(20);
          return;
        }
        if (holdStartedAt === 0) holdStartedAt = Date.now();
        const heldMs = Date.now() - holdStartedAt;
        setProgress(Math.min(100, 20 + Math.round(heldMs / 3_000 * 80)));
        if (heldMs >= 3_000) finishTask('voice');
      }, 100);
    } catch (error) {
      if (session !== sessionRef.current) return;
      failTask(`麦克风无法启动：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const startTask = (taskId: BarbieDailyRitualTaskId) => {
    if (activeTask !== null || completedTaskIds.includes(taskId)) return;
    cleanupResources();
    const session = sessionRef.current;
    poseLatchedRef.current = false;
    poseCountRef.current = 0;
    poseIndexRef.current = 0;
    poseHoldStartedRef.current = 0;
    wrongPoseStartedRef.current = 0;
    lastFeedbackAtRef.current = 0;
    setActiveTask(taskId);
    setProgress(0);
    setLiveMetric('正在准备');
    setRunState('connecting');
    if (taskId === 'voice') void startVoiceTask(session);
    else startYoloTask(taskId, session);
  };

  const stopTask = (message: string = '你已主动停止，本次没有记为完成。') => {
    cleanupResources();
    setActiveTask(null);
    setRunState('idle');
    setProgress(0);
    setLiveMetric('等待开始');
    setNotice(message);
    setHardwareOptIn(false);
    TTSManager.getInstance().stop();
  };

  useEffect(() => {
    if (safetyConfig.emergencyLock && activeTask !== null) {
      stopTask('检测到全局急停锁，本次仪式已立即停止。');
    }
  }, [safetyConfig.emergencyLock, activeTask]);

  useEffect(() => () => {
    cleanupResources();
    TTSManager.getInstance().stop();
  }, []);

  return <Panel title="仪式 2.0 · 本地验证流程" caption="使用真实 YOLO 结果或本机麦克风指标完成三项每日仪式；不再使用随机数伪造识别，也不会无检测自动通过。">
    <div className="space-y-3 rounded-3xl border border-purple-500/30 bg-slate-900 p-4 shadow-xl">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 rounded-2xl bg-slate-800 p-3">
          <p className="text-[9px] font-black tracking-wider text-purple-300">DAILY RITUAL PROGRESS</p>
          <p className="mt-1 text-sm font-black text-white">今日完成 {completedCount}/3</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all" style={{ width: `${completedCount / 3 * 100}%` }} /></div>
        </div>
        <div className={`grid place-items-center rounded-2xl text-center text-[10px] font-black ${completedCount === 3 ? 'bg-emerald-500 text-white' : 'bg-purple-950 text-purple-200'}`}>{completedCount === 3 ? '今日全通关' : `${3 - completedCount} 项待完成`}</div>
      </div>

      {activeTask === null ? <>
        {BARBIE_DAILY_RITUAL_TASKS.map((task) => {
          const done = completedTaskIds.includes(task.id);
          return <button key={task.id} onClick={() => startTask(task.id)} disabled={done} className={`w-full rounded-2xl border p-3 text-left transition ${done ? 'border-emerald-900 bg-emerald-950/40 text-emerald-400' : 'border-purple-500/50 bg-purple-900/25 text-purple-100 hover:bg-purple-900/50'}`}>
            <div className="flex items-center justify-between gap-3"><span className="text-[11px] font-black"><CheckCircle2 className="mr-2 inline h-4 w-4" />{task.title}</span><span className="rounded-full bg-black/20 px-2 py-1 text-[9px] font-bold">{done ? '今日已完成' : task.sensor === 'yolo' ? 'YOLO' : '本机麦克风'}</span></div>
            <p className="mt-1.5 text-[10px] leading-relaxed opacity-70">{task.description}</p>
          </button>;
        })}
        <label className={`flex items-start gap-2 rounded-2xl border p-3 text-[10px] font-bold leading-relaxed ${canOfferHardware ? 'border-amber-700 bg-amber-950/35 text-amber-200' : 'border-slate-700 bg-slate-800 text-slate-500'}`}>
          <input type="checkbox" checked={hardwareOptIn} disabled={!canOfferHardware} onChange={(event) => setHardwareOptIn(event.target.checked)} className="mt-0.5 accent-amber-500" />
          <span>本次允许姿态持续偏离 5 秒时发送一次 1 秒触觉提示。默认关闭；{safetyConfig.emergencyLock ? '全局急停锁已激活。' : emsMaximum <= 0 ? 'EMS 上限为 0。' : `强度服从硬件调控 ${safetyConfig.minEmsStrength}–${emsMaximum}。`}</span>
        </label>
      </> : <div className="space-y-3 rounded-2xl border border-purple-500 bg-black/35 p-4">
        <div className="flex items-center justify-between"><div><p className="text-[9px] font-black tracking-wider text-purple-300">LIVE VERIFICATION</p><p className="mt-1 text-sm font-black text-white">{BARBIE_DAILY_RITUAL_TASKS.find((task) => task.id === activeTask)?.title}</p></div>{activeTask === 'voice' ? <Mic className="h-8 w-8 animate-pulse text-pink-400" /> : <Camera className="h-8 w-8 animate-pulse text-purple-400" />}</div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all" style={{ width: `${progress}%` }} /></div>
        <p className="rounded-xl bg-slate-900 px-3 py-2 font-mono text-[10px] text-purple-200">{liveMetric}</p>
        <button onClick={() => stopTask()} className="w-full rounded-xl bg-rose-700 py-2.5 text-[11px] font-black text-white">安全停止本次仪式</button>
      </div>}

      <p className={`rounded-2xl px-3 py-2 text-[10px] font-bold leading-relaxed ${runState === 'error' ? 'bg-rose-950 text-rose-300' : runState === 'completed' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>{notice}</p>
      <p className="text-[9px] leading-relaxed text-slate-500">YOLO 仪式读取“全视之眼”最后一次成功连接的服务器地址；麦克风只计算实时音量，不录音、不保存内容。</p>
    </div>
  </Panel>;
};

// ================================================================
// 导演模块 数据结构
// ================================================================
interface DirectorAct {
  name: string;
  durationSec: number;
  narrative: string;
  intensityCurve: 'ramp' | 'peak' | 'wave' | 'pulse';
  vibeBase: number;
  shockProb: number;
}
interface DirectorScript {
  id: string;
  title: string;
  setting: string;
  emoji: string;
  color: string;
  acts: DirectorAct[];
}
interface DirectorEvent {
  narrative: string;
  choices: { label: string; outcome: string; punish: boolean }[];
}
interface DirectorLog {
  title: string;
  date: string;
  duration: number;
  shocks: number;
  maxStrength: number;
  survived: boolean;
}

const DIRECTOR_SCRIPTS: DirectorScript[] = [
  {
    id: 'bus',
    title: '公交车震动地狱',
    setting: '拥挤的公交车上，你藏着秘密，害怕被人发现',
    emoji: '🚌',
    color: 'amber',
    acts: [
      { name: '上车', durationSec: 90, narrative: '你挤上了早班公交。人很多，你紧紧抓住扶手，努力保持面无表情。', intensityCurve: 'ramp', vibeBase: 20, shockProb: 0.1 },
      { name: '颠簸路段', durationSec: 120, narrative: '公交进入了施工路段，路面颠簸不平。每一次震动都让你咬紧牙关。', intensityCurve: 'wave', vibeBase: 50, shockProb: 0.25 },
      { name: '急刹车', durationSec: 60, narrative: '前方红灯，司机急刹——', intensityCurve: 'pulse', vibeBase: 70, shockProb: 0.5 },
      { name: '终点站', durationSec: 90, narrative: '快到站了，你已经浑身颤抖。再坚持一下……', intensityCurve: 'peak', vibeBase: 80, shockProb: 0.3 },
    ],
  },
  {
    id: 'classroom',
    title: '课堂惩戒',
    setting: '你被老师留下来接受"特别课后辅导"',
    emoji: '🎓',
    color: 'blue',
    acts: [
      { name: '放学后', durationSec: 60, narrative: '同学们都走了。老师把门锁上，缓缓走向你。"你今天的表现让我很失望。"', intensityCurve: 'ramp', vibeBase: 15, shockProb: 0.1 },
      { name: '听写检测', durationSec: 120, narrative: '老师开始逐字逐句考你。每次你答错，"惩罚"就会随之而来。', intensityCurve: 'wave', vibeBase: 40, shockProb: 0.4 },
      { name: '罚站罚跪', durationSec: 90, narrative: '"跪下去，用这种姿势思考你的错误。"你照做了，颤抖着。', intensityCurve: 'pulse', vibeBase: 60, shockProb: 0.35 },
      { name: '作业签字', durationSec: 60, narrative: '"今天的课后作业就是记住——你属于我。"', intensityCurve: 'peak', vibeBase: 85, shockProb: 0.2 },
    ],
  },
  {
    id: 'convenience',
    title: '便利店收银台',
    setting: '你穿着女装在便利店打工，顾客不断涌入',
    emoji: '🏪',
    color: 'green',
    acts: [
      { name: '开门营业', durationSec: 90, narrative: '你穿上围裙，深吸一口气。第一位顾客推门而入，用奇怪的眼神打量你。', intensityCurve: 'ramp', vibeBase: 10, shockProb: 0.1 },
      { name: '高峰时段', durationSec: 150, narrative: '收银台前排起了长队。你手忙脚乱地扫码、找零，却又不敢表现出任何异样。', intensityCurve: 'wave', vibeBase: 45, shockProb: 0.2 },
      { name: '上司来巡查', durationSec: 60, narrative: '店长突然走进来，站在你身后盯着你的一举一动。"动作要更快。"', intensityCurve: 'pulse', vibeBase: 65, shockProb: 0.45 },
      { name: '打烊', durationSec: 90, narrative: '关门了。你终于可以蹲在角落里喘口气——但还没有结束。', intensityCurve: 'peak', vibeBase: 80, shockProb: 0.3 },
    ],
  },
  {
    id: 'dungeon',
    title: '深夜密室',
    setting: '你被锁在黑暗中，等待主人回来',
    emoji: '🌙',
    color: 'purple',
    acts: [
      { name: '入夜', durationSec: 120, narrative: '灯关了。只有你一个人和黑暗待在一起。你知道主人还会回来。', intensityCurve: 'ramp', vibeBase: 5, shockProb: 0.05 },
      { name: '漫长等待', durationSec: 180, narrative: '时间一秒一秒地流逝。偶尔有奇怪的声音从门外传来。你越来越紧张。', intensityCurve: 'wave', vibeBase: 30, shockProb: 0.15 },
      { name: '脚步声近了', durationSec: 90, narrative: '你听到了脚步声。越来越近。你的心跳加速。这就是主人吗？', intensityCurve: 'pulse', vibeBase: 70, shockProb: 0.5 },
      { name: '主人归来', durationSec: 60, narrative: '门开了。"你等我很久了吗？让我看看你有没有老实待着。"', intensityCurve: 'peak', vibeBase: 90, shockProb: 0.4 },
    ],
  },
];

const DIRECTOR_EVENTS: DirectorEvent[] = [
  {
    narrative: '有人朝你这边看过来，目光有些意味深长……你该怎么办？',
    choices: [
      { label: '装作若无其事，低头看手机', outcome: '你成功转移了注意力，危机暂时解除。', punish: false },
      { label: '慌乱地移开视线，明显心虚', outcome: '你的慌张反而引起了更多注意！惩罚！', punish: true },
    ],
  },
  {
    narrative: '你感觉自己快撑不住了，身体开始轻微颤抖……',
    choices: [
      { label: '死命咬住嘴唇，强行压制', outcome: '你撑住了，主人允许你稍作喘息。', punish: false },
      { label: '低声发出一声呜咽', outcome: '居然发出了声音！！加倍惩罚！', punish: true },
    ],
  },
  {
    narrative: '有人突然站在你旁边，距离非常近……',
    choices: [
      { label: '保持镇定，专注前方', outcome: '好，很好。继续保持这种顺从。', punish: false },
      { label: '下意识地往旁边挪了一步', outcome: '移动了！规矩不准动！', punish: true },
    ],
  },
  {
    narrative: '"请问你还好吗？"——有人轻声问你。',
    choices: [
      { label: '微笑着说"没事，谢谢"', outcome: '面具维持住了。很好。', punish: false },
      { label: '说不出话，只是摇摇头', outcome: '暴露了！！', punish: true },
    ],
  },
];

const DirectorCut: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const [phase, setPhase] = useState<'select' | 'custom' | 'running' | 'event' | 'log'>('select');
  const [selectedScript, setSelectedScript] = useState<DirectorScript | null>(null);
  const [currentActIdx, setCurrentActIdx] = useState(0);
  const [actProgress, setActProgress] = useState(0);
  const [currentEvent, setCurrentEvent] = useState<DirectorEvent | null>(null);
  const [eventResult, setEventResult] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState({ shocks: 0, maxStr: 0, startTime: 0 });
  const [sessionLog, setSessionLog] = useState<DirectorLog[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('ycy_director_log') || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, 20).flatMap((value): DirectorLog[] => {
        if (!value || typeof value !== 'object' || typeof value.title !== 'string') return [];
        return [{
          title: value.title.slice(0, 100),
          date: typeof value.date === 'string' ? value.date.slice(0, 40) : '',
          duration: Number.isFinite(Number(value.duration)) ? Math.max(0, Number(value.duration)) : 0,
          shocks: Number.isFinite(Number(value.shocks)) ? Math.max(0, Math.floor(Number(value.shocks))) : 0,
          maxStrength: Number.isFinite(Number(value.maxStrength)) ? Math.max(0, Math.min(200, Number(value.maxStrength))) : 0,
          survived: value.survived === true,
        }];
      });
    } catch { return []; }
  });
  const [customScript, setCustomScript] = useState('');

  const actTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const directorTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const directorGenerationRef = useRef(0);
  const eventResolvedRef = useRef(false);
  const statsRef = useRef(sessionStats);
  statsRef.current = sessionStats;

  const stopDirectorOutputs = () => {
    directorGenerationRef.current++;
    if (actTimerRef.current) clearInterval(actTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    actTimerRef.current = null;
    progressIntervalRef.current = null;
    eventTimerRef.current = null;
    directorTimeoutsRef.current.forEach((timer) => clearTimeout(timer));
    directorTimeoutsRef.current.clear();
    eventResolvedRef.current = true;
    void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
  };

  const scheduleDirectorTimeout = (callback: () => void, delayMs: number, generation: number) => {
    const timer = setTimeout(() => {
      directorTimeoutsRef.current.delete(timer);
      if (generation === directorGenerationRef.current) callback();
    }, delayMs);
    directorTimeoutsRef.current.add(timer);
    return timer;
  };

  // ── 强度曲线计算 ──────────────────────────────────────
  const getIntensity = (curve: DirectorAct['intensityCurve'], progress: number, base: number, max: number) => {
    const t = progress; // 0-1
    let mult = 1;
    switch (curve) {
      case 'ramp':  mult = t; break;
      case 'peak':  mult = Math.sin(t * Math.PI); break;
      case 'wave':  mult = 0.5 + 0.5 * Math.sin(t * Math.PI * 4); break;
      case 'pulse': mult = Math.random() > 0.5 ? 1 : 0.2; break;
    }
    return Math.round(Math.min(base * mult, max));
  };

  // ── 运行单幕 ──────────────────────────────────────────
  const runAct = (script: DirectorScript, actIdx: number, generation: number) => {
    if (generation !== directorGenerationRef.current) return;
    const act = script.acts[actIdx];
    if (!act) { finishSession(script, true); return; }

    setCurrentActIdx(actIdx);
    setActProgress(0);
    void TTSManager.getInstance().speak(`${act.name}：${act.narrative}`);

    const tickMs = 1000;
    const totalTicks = act.durationSec;
    let tick = 0;

    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      if (generation !== directorGenerationRef.current) return;
      tick++;
      const prog = tick / totalTicks;
      setActProgress(prog);

      const intensity = getIntensity(act.intensityCurve, prog, act.vibeBase, HARDWARE_OUTPUT_CEILING);
      sendRandomToy(intensity);

      if (Math.random() < act.shockProb / totalTicks * 3) {
        const str = Math.min(intensity + 10, HARDWARE_OUTPUT_CEILING);
        const shockStrength = Math.min(HARDWARE_OUTPUT_CEILING, str);
        sendRandomShock(shockStrength);
        scheduleDirectorTimeout(() => {
          void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
        }, 1500, generation);
        setSessionStats(s => {
          const next = { ...s, shocks: s.shocks + 1, maxStr: Math.max(s.maxStr, shockStrength) };
          return next;
        });
      }

      if (tick >= totalTicks) {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
        void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
        // Random event between acts
        if (actIdx < script.acts.length - 1 && Math.random() > 0.4) {
          triggerEvent(script, actIdx, generation);
        } else {
          runAct(script, actIdx + 1, generation);
        }
      }
    }, tickMs);
  };

  // ── 触发随机事件 ──────────────────────────────────────
  const triggerEvent = (script: DirectorScript, completedActIdx: number, generation: number) => {
    if (generation !== directorGenerationRef.current) return;
    const ev = DIRECTOR_EVENTS[Math.floor(Math.random() * DIRECTOR_EVENTS.length)];
    eventResolvedRef.current = false;
    setCurrentEvent(ev);
    setEventResult(null);
    setPhase('event');
    void TTSManager.getInstance().speak(ev.narrative);

    // Auto-fail after 8 seconds (no response = panic)
    eventTimerRef.current = scheduleDirectorTimeout(() => {
      handleEventChoice(ev, { label: '', outcome: '你因为慌乱没有做出任何反应，结果更糟糕！', punish: true }, script, completedActIdx + 1, generation);
    }, 8000, generation);
  };

  const handleEventChoice = (ev: DirectorEvent, choice: typeof ev.choices[0], script: DirectorScript, nextActIdx: number, generation: number) => {
    if (generation !== directorGenerationRef.current || eventResolvedRef.current) return;
    eventResolvedRef.current = true;
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    directorTimeoutsRef.current.delete(eventTimerRef.current as ReturnType<typeof setTimeout>);
    eventTimerRef.current = null;
    setEventResult(choice.outcome);
    void TTSManager.getInstance().speak(choice.outcome);

    if (choice.punish) {
      sendRandomShock(HARDWARE_OUTPUT_CEILING);
      scheduleDirectorTimeout(() => {
        void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
      }, 2000, generation);
    }

    scheduleDirectorTimeout(() => {
      setPhase('running');
      setCurrentEvent(null);
      runAct(script, nextActIdx, generation);
    }, 2500, generation);
  };

  // ── 开始会话 ──────────────────────────────────────────
  const startSession = (script: DirectorScript) => {
    stopDirectorOutputs();
    const generation = directorGenerationRef.current;
    setSelectedScript(script);
    setCurrentActIdx(0);
    setActProgress(0);
    setSessionStats({ shocks: 0, maxStr: 0, startTime: Date.now() });
    setPhase('running');
    void TTSManager.getInstance().speak(`剧本开始：${script.title}。${script.setting}。`);
    scheduleDirectorTimeout(() => runAct(script, 0, generation), 2000, generation);
  };

  // ── 完成会话 ──────────────────────────────────────────
  const finishSession = (script: DirectorScript, survived: boolean) => {
    stopDirectorOutputs();

    const duration = Math.round((Date.now() - statsRef.current.startTime) / 1000);
    const log: DirectorLog = {
      title: script.title,
      date: new Date().toLocaleDateString('zh-CN'),
      duration,
      shocks: statsRef.current.shocks,
      maxStrength: statsRef.current.maxStr,
      survived,
    };
    const newLogs = [log, ...sessionLog].slice(0, 20);
    setSessionLog(newLogs);
    try { localStorage.setItem('ycy_director_log', JSON.stringify(newLogs)); } catch {}

    if (survived) {
      void TTSManager.getInstance().speak(`剧本${script.title}完成。你总共承受了${log.shocks}次电击，最高强度${log.maxStrength}。表现……勉强及格。`);
    } else {
      void TTSManager.getInstance().speak('你提前逃跑了，真是个懦夫。');
    }
    setPhase('log');
  };

  // ── 强制终止 ──────────────────────────────────────────
  const abortSession = () => {
    if (selectedScript) finishSession(selectedScript, false);
    else {
      stopDirectorOutputs();
      setPhase('select');
    }
  };

  useEffect(() => () => {
    stopDirectorOutputs();
    TTSManager.getInstance().stop();
  }, []);

  // ── 自定义剧本解析器 ──────────────────────────────────
  const parseCustomScript = () => {
    const lines = customScript.split('\n').filter(l => l.trim());
    const acts: DirectorAct[] = [];
    lines.forEach(line => {
      const m = line.match(/\[(\d+):(\d+)\]\s+(TTS|SHOCK|VIBE|EVENT):\s*(.+)/i);
      if (!m) return;
      const totalSec = parseInt(m[1]) * 60 + parseInt(m[2]);
      const type = m[3].toUpperCase();
      const content = m[4];
      if (type === 'TTS' || type === 'EVENT') {
        acts.push({ name: `第${acts.length + 1}幕`, durationSec: 60, narrative: content, intensityCurve: 'wave', vibeBase: 30, shockProb: 0.1 });
      } else if (type === 'SHOCK') {
        const shockMap: Record<string, number> = { '低': 0.3, '中': 0.5, '高': 0.8 };
        acts.push({ name: `电击幕`, durationSec: 30, narrative: `电击事件：${content}`, intensityCurve: 'pulse', vibeBase: (shockMap[content] || 0.5) * 100, shockProb: shockMap[content] || 0.5 });
      } else if (type === 'VIBE') {
        const vibeMap: Record<string, number> = { '低': 20, '中': 50, '高': 80 };
        acts.push({ name: `震动幕`, durationSec: 60, narrative: `震动阶段：${content}`, intensityCurve: 'ramp', vibeBase: vibeMap[content] || 50, shockProb: 0 });
      }
    });
    if (acts.length === 0) { void TTSManager.getInstance().speak('剧本格式错误，无法解析。'); return; }
    const custom: DirectorScript = { id: 'custom', title: '自定义剧本', setting: '由主人亲自编写的专属惩罚剧本', emoji: '✍️', color: 'rose', acts };
    startSession(custom);
  };

  const act = selectedScript?.acts[currentActIdx];
  const totalActs = selectedScript?.acts.length ?? 1;

  return <Panel title="调教导演 · 完全体" caption="多剧本·分幕推进·强度曲线·玩家互动事件·自定义剧本·会话记录">
    <div className="rounded-3xl bg-slate-900 p-4 shadow-xl border-2 border-amber-500/30 space-y-4">

      {/* ── 剧本选择 ── */}
      {phase === 'select' && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-slate-400 tracking-widest">🎬 选择今日剧本</p>
          <div className="grid grid-cols-2 gap-2">
            {DIRECTOR_SCRIPTS.map(s => (
              <button key={s.id} onClick={() => startSession(s)}
                className="flex flex-col items-start p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:border-amber-500 transition-all text-left gap-1">
                <span className="text-2xl">{s.emoji}</span>
                <span className="text-[11px] font-black text-slate-200">{s.title}</span>
                <span className="text-[9px] text-slate-500 line-clamp-2">{s.setting}</span>
                <span className="text-[9px] text-amber-400">{s.acts.length} 幕 · {Math.round(s.acts.reduce((a, b) => a + b.durationSec, 0) / 60)} 分钟</span>
              </button>
            ))}
          </div>
          <button onClick={() => setPhase('custom')}
            className="w-full py-2.5 rounded-2xl bg-rose-900/30 border border-rose-800/50 text-rose-300 font-bold text-xs">
            ✍️ 自定义剧本
          </button>
          {sessionLog.length > 0 && (
            <button onClick={() => setPhase('log')}
              className="w-full py-2 rounded-xl bg-slate-800 text-slate-400 font-bold text-xs">
              📋 查看历史记录 ({sessionLog.length})
            </button>
          )}
        </div>
      )}

      {/* ── 自定义剧本编辑器 ── */}
      {phase === 'custom' && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-amber-400 tracking-widest">✍️ 自定义剧本格式</p>
          <div className="bg-black/50 rounded-xl p-3 text-[9px] text-slate-400 font-mono space-y-0.5">
            <p className="text-slate-500">// 格式：[分:秒] 类型: 内容</p>
            <p>[0:00] TTS: 你走进了教室...</p>
            <p>[1:30] SHOCK: 高</p>
            <p>[3:00] VIBE: 中</p>
            <p>[5:00] EVENT: 有人靠近了你...</p>
          </div>
          <textarea value={customScript} onChange={e => setCustomScript(e.target.value)}
            placeholder="在此处编写你的专属惩罚剧本..."
            className="w-full h-36 bg-slate-800 text-white text-xs p-3 rounded-xl border border-rose-500/50 outline-none font-mono resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setPhase('select')} className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-300 font-bold text-xs">返回</button>
            <button onClick={parseCustomScript} className="flex-1 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs">开始执行</button>
          </div>
        </div>
      )}

      {/* ── 运行中 ── */}
      {phase === 'running' && selectedScript && act && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{selectedScript.emoji}</span>
              <div>
                <p className="text-xs font-black text-slate-200">{selectedScript.title}</p>
                <p className="text-[9px] text-amber-400">第 {currentActIdx + 1}/{totalActs} 幕：{act.name}</p>
              </div>
            </div>
            <Gamepad2 className="w-6 h-6 text-amber-500 animate-pulse" />
          </div>

          {/* 幕进度条 */}
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[9px] text-slate-500">幕进度</span>
              <span className="text-[9px] text-amber-400">{Math.round(actProgress * 100)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 transition-all duration-1000 rounded-full" style={{ width: `${actProgress * 100}%` }} />
            </div>
          </div>

          {/* 整体进度 */}
          <div className="flex gap-1">
            {selectedScript.acts.map((_, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full ${i < currentActIdx ? 'bg-amber-500' : i === currentActIdx ? 'bg-amber-300 animate-pulse' : 'bg-slate-700'}`} />
            ))}
          </div>

          {/* 剧情旁白 */}
          <div className="bg-black/40 rounded-2xl p-4 border border-amber-500/20">
            <p className="text-xs text-amber-200 leading-relaxed italic">{act.narrative}</p>
          </div>

          {/* 实时状态 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-800 rounded-xl p-2">
              <p className="text-[9px] text-slate-500">电击次数</p>
              <p className="text-sm font-black text-rose-400">{sessionStats.shocks}</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-2">
              <p className="text-[9px] text-slate-500">强度模式</p>
              <p className="text-[10px] font-black text-amber-400">{act.intensityCurve}</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-2">
              <p className="text-[9px] text-slate-500">剩余幕数</p>
              <p className="text-sm font-black text-slate-200">{totalActs - currentActIdx - 1}</p>
            </div>
          </div>

          <button onClick={abortSession} className="w-full py-2 rounded-xl bg-slate-800 text-rose-500 font-bold text-xs border border-rose-900/50">
            ⛔ 提前逃跑（懦夫结局）
          </button>
        </div>
      )}

      {/* ── 互动事件 ── */}
      {phase === 'event' && currentEvent && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="bg-black/60 rounded-2xl p-4 border border-yellow-500/40">
            <p className="text-[10px] text-yellow-400 font-bold tracking-widest mb-2">⚠️ 突发事件</p>
            <p className="text-sm font-bold text-white">{currentEvent.narrative}</p>
          </div>
          {eventResult ? (
            <div className="bg-slate-800 rounded-2xl p-4 border border-amber-500/30">
              <p className="text-xs text-amber-300">{eventResult}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[9px] text-rose-400 text-center animate-pulse">8秒内必须做出选择，否则视为慌乱失控！</p>
              {currentEvent.choices.map((c, i) => (
                <button key={i} onClick={() => { if (selectedScript) handleEventChoice(currentEvent, c, selectedScript, currentActIdx + 1, directorGenerationRef.current); }}
                  className="w-full text-left p-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-yellow-500 text-xs font-bold text-slate-200 transition-all">
                  {String.fromCharCode(65 + i)}. {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 会话记录 ── */}
      {phase === 'log' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 tracking-widest">📋 导演日志</p>
            <button onClick={() => setPhase('select')} className="text-[10px] text-amber-400 font-bold">返回选剧本</button>
          </div>
          {sessionLog.length === 0 ? (
            <p className="text-center text-xs text-slate-600 py-6">暂无记录</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {sessionLog.map((log, i) => (
                <div key={i} className={`bg-slate-800 rounded-2xl p-3 border ${log.survived ? 'border-emerald-800/50' : 'border-rose-900/50'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-[11px] font-black text-slate-200">{log.title}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${log.survived ? 'bg-emerald-900/60 text-emerald-400' : 'bg-rose-900/60 text-rose-400'}`}>
                      {log.survived ? '完成' : '逃跑'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center mt-2">
                    <div>
                      <p className="text-[8px] text-slate-500">日期</p>
                      <p className="text-[9px] font-bold text-slate-300">{log.date}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-slate-500">电击次数</p>
                      <p className="text-[9px] font-bold text-rose-400">{log.shocks}次</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-slate-500">最高强度</p>
                      <p className="text-[9px] font-bold text-amber-400">{log.maxStrength}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  </Panel>;
};


const VerbalTicEnforcer: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const [isActive, setIsActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(false);
  const shockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxIntensityRef = useRef(HARDWARE_OUTPUT_CEILING);

  const start = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    activeRef.current = true;
    setIsActive(true);
    void TTSManager.getInstance().speak('语癖监控已开启。每句话结尾不带喵，我就电烂你的喉咙。');
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'zh-CN';
      
      recognition.onresult = (event: any) => {
        if (!activeRef.current || recognitionRef.current !== recognition) return;
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript.trim();
        if (text && !text.endsWith('喵')) {
           sendRandomShock(maxIntensityRef.current);
           if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
           shockTimerRef.current = setTimeout(() => {
             shockTimerRef.current = null;
             void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
           }, 1000);
           void TTSManager.getInstance().speak('没有带上喵！该死！');
        }
      };
      recognition.onerror = () => {
        if (recognitionRef.current !== recognition) return;
        activeRef.current = false;
        recognitionRef.current = null;
        setIsActive(false);
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        activeRef.current = false;
        recognitionRef.current = null;
        setIsActive(false);
      };
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (error) {
        recognitionRef.current = null;
        activeRef.current = false;
        setIsActive(false);
        console.error('语音识别启动失败:', error);
      }
    } else {
      activeRef.current = false;
      setIsActive(false);
      alert("不支持语音识别 API");
    }
  };
  
  const stop = () => {
    activeRef.current = false;
    setIsActive(false);
    if (shockTimerRef.current) {
      clearTimeout(shockTimerRef.current);
      shockTimerRef.current = null;
    }
    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch {}
    }
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
  };

  useEffect(() => () => stop(), []);

  return <Panel title="专属语癖 (Verbal Tic Enforcer)" caption="开启后台麦克风监听。如果你说的话结尾没有加上【喵】，毫不留情地给你一发电击。">
    <div className="rounded-3xl bg-slate-900 p-5 text-center shadow-xl border-2 border-teal-500/30">
      <Mic className={`w-12 h-12 mx-auto mb-4 ${isActive ? 'text-teal-500 animate-bounce' : 'text-slate-600'}`} />
      {!isActive ? (
        <button onClick={start} className="w-full py-3 rounded-2xl bg-teal-600 text-white font-black text-xs">开启语癖监听</button>
      ) : (
        <button onClick={stop} className="w-full py-3 rounded-2xl bg-slate-700 text-white font-black text-xs">关闭监听</button>
      )}
    </div>
  </Panel>;
};

export const BarbieFeatureSuite: React.FC<{ ritualVoicePromptsEnabled?: boolean }> = ({ ritualVoicePromptsEnabled = true }) => {
  const [tab, setTab] = useState<FeatureTab>('mirror');
  const [category, setCategory] = useState<FeatureCategory>('daily');
  const [state, setState] = useState<SuiteState>(loadSuiteState);
  const heartRateState = useAppStore((store) => store.heartRateState);
  const connectHeartRateBle = useAppStore((store) => store.connectHeartRateBle);
  const startHeartRateSimulator = useAppStore((store) => store.startHeartRateSimulator);
  const setSimulatedBpm = useAppStore((store) => store.setSimulatedBpm);
  const triggerEmergencyStop = useAppStore((store) => store.triggerEmergencyStop);
  const bioStopLatch = useRef(false);

  useEffect(() => { safeStorageSet(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => {
    return () => {
      void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
      void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const onRitualComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ pathId?: string }>).detail;
      const pathMap: Record<string, string> = { voice: '声线', posture: '仪态', style: '穿搭', confidence: '自信' };
      const growthKey = detail?.pathId ? pathMap[detail.pathId] : undefined;
      if (!growthKey) return;
      setState((prev) => ({ ...prev, growth: { ...prev.growth, [growthKey]: Math.min(100, prev.growth[growthKey] + 8) }, audit: [`${getToday()} · 仪式完成，「${growthKey}」成长 +8`, ...prev.audit].slice(0, 20) }));
    };
    window.addEventListener('ycy:barbie-ritual-complete', onRitualComplete);
    return () => window.removeEventListener('ycy:barbie-ritual-complete', onRitualComplete);
  }, []);
  const update = (patch: Partial<SuiteState>) => setState((prev) => ({ ...prev, ...patch }));
  const addAudit = (message: string) => setState((prev) => ({ ...prev, audit: [`${getToday()} · ${message}`, ...prev.audit].slice(0, 20) }));
  const effectiveBpm = state.bioUseLive && heartRateState.isConnected ? heartRateState.currentBpm : state.bpm;
  const bioDanger = effectiveBpm >= state.threshold;
  const visibleTabs = tabs.filter((item) => item.category === category);

  const selectCategory = (nextCategory: FeatureCategory) => {
    setCategory(nextCategory);
    const firstTab = tabs.find((item) => item.category === nextCategory);
    if (firstTab) setTab(firstTab.id);
  };

  const resetAllLabData = () => {
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
    [
      STORAGE_KEY,
      'ycy_training_weekly_plan',
      'ycy_director_log',
      'ycy_blood_contract',
      'ycy_usury_debt',
      'ycy_usury_interest_at',
      'ycy_chastity_lock',
      'ycy_chastity_streak',
      'ycy_chastity_logs',
      'ycy_mirror_lock',
    ].forEach(safeStorageRemove);
    BarbieLabEngine.getInstance().resetAll();
    setState(normalizeBarbieSuiteState(null));
  };

  useEffect(() => {
    const shouldStop = state.bioUseLive && state.bioAutoStop && heartRateState.isConnected && !heartRateState.isSimulator && effectiveBpm >= state.threshold;
    if (shouldStop && !bioStopLatch.current) {
      bioStopLatch.current = true;
      setState((prev) => ({ ...prev, audit: [`${getToday()} · 心率达到 ${effectiveBpm} BPM，已执行全局急停`, ...prev.audit].slice(0, 20) }));
      void triggerEmergencyStop();
    } else if (!shouldStop && effectiveBpm < state.threshold - 8) {
bioStopLatch.current = false;
    }
  }, [effectiveBpm, heartRateState.isConnected, heartRateState.isSimulator, state.bioAutoStop, state.bioUseLive, state.threshold, triggerEmergencyStop]);

  return (
    <section className="liquid-card p-3 shadow-[0_16px_40px_rgba(236,72,153,0.1)]">
      <div className="px-2 pb-3"><p className="text-[10px] font-black tracking-[0.16em] text-pink-600">TRANSFORMATION OS</p><h3 className="mt-0.5 text-sm font-black text-slate-800">完整蜕变控制台</h3></div>
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-2xl bg-pink-50/50 p-1 border border-pink-100/60">
        {([['daily', '日常训练'], ['intense', '强化玩法'], ['system', '成长与数据']] as const).map(([id, label]) => <button key={id} onClick={() => selectCategory(id)} className={`rounded-xl px-2 py-2 text-[10px] font-black transition-all ${category === id ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-pink-600'}`}>{label}</button>)}
      </div>
      <div className="grid grid-cols-5 gap-1 rounded-2xl bg-white/70 p-1 border border-pink-100/60">
        {visibleTabs.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`min-w-0 rounded-xl px-1 py-2 text-[9px] font-black transition-all ${tab === item.id ? 'bg-pink-500 text-white shadow-sm' : 'text-slate-600 hover:text-pink-600'}`}><Icon className="mx-auto mb-1 h-3.5 w-3.5" /><span className="block truncate">{item.label}</span></button>; })}
      </div>
      <div className="p-2 pt-4">
        {category === 'daily' && <WeeklyTrainingPlan state={state} onOpen={next => { if (next !== tab && !confirm('切换练习页面？当前未保存的训练将结束。')) return; setTab(next); }} />}
        {tab === 'growth' && <GrowthTree state={state} update={update} addAudit={addAudit} />}
        {tab === 'director' && <SceneDirectorTab style={state.directorStyle} growth={state.growth} effectiveBpm={effectiveBpm} heartRateThreshold={state.threshold} updateStyle={(directorStyle) => update({ directorStyle })} addAudit={addAudit} />}
        {tab === 'voice' && <VerbalTicEnforcer state={state} update={update} />}
        {tab === 'pitch' && <PitchCoachTab state={state} update={update} addAudit={addAudit} />}
        {tab === 'mirror' && <MirrorCheck state={state} update={update} />}
        {tab === 'posture' && <PostureCorrector state={state} update={update} />}
        {tab === 'choreo' && <Choreography state={state} update={update} />}
        {tab === 'ritual' && <DailyRituals state={state} update={update} voicePromptsEnabled={ritualVoicePromptsEnabled} />}
        {tab === 'bio' && <Biofeedback state={state} update={update} addAudit={addAudit} liveState={heartRateState} effectiveBpm={effectiveBpm} connectReal={connectHeartRateBle} startSimulator={startHeartRateSimulator} setSimulatorBpm={setSimulatedBpm} />}
        {tab === 'data' && <PrivacyCenter state={state} update={update} resetAllLabData={resetAllLabData} />}
        {tab === 'chastity' && <ChastityCalendar state={state} update={update} addAudit={addAudit} />}
        {tab === 'gallery' && <ShameGallery />}
        {tab === 'silence' && <SilenceTraining state={state} update={update} />}
        {tab === 'typing' && <TypingObedience state={state} update={update} />}
        {tab === 'metronome' && <EdgingMetronome state={state} liveState={heartRateState} effectiveBpm={effectiveBpm} />}
        {tab === 'bimbo' && <BimboTraining state={state} update={update} />}
        {tab === 'medusa' && <MedusaTraining state={state} update={update} />}
        {tab === 'eye' && <EyeLockTraining state={state} update={update} />}
        {tab === 'tightrope' && <TightropeTraining state={state} liveState={heartRateState} effectiveBpm={effectiveBpm} />}
      </div>
      <div className="flex items-center justify-center gap-1 border-t border-pink-50 pt-3 text-[9px] font-medium text-slate-400"><LockKeyhole className="h-3 w-3" />配置保存在本机；联网或硬件操作会在对应功能中明确说明。</div>
    </section>
  );
};

const Panel: React.FC<{ title: string; caption: string; children: React.ReactNode }> = ({ title, caption, children }) => <div><h4 className="text-sm font-black text-slate-800">{title}</h4><p className="mt-1 text-[11px] leading-relaxed text-slate-600">{caption}</p><div className="mt-4 space-y-3">{children}</div></div>;

const GrowthTree: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void; addAudit: (value: string) => void }> = ({ state, update, addAudit }) => {
  const total = Object.values(state.growth).reduce((sum, value) => sum + value, 0);
  const form = total >= 320 ? '粉钻主角 · 全路线共鸣' : total >= 200 ? '玫瑰造型师 · 风格与自信成形' : total >= 100 ? '芭比学院学员 · 开始拥有自己的节奏' : '闪耀练习生 · 从一条喜欢的路线开始';
  const dayKey = getBarbieRitualDayKey();
  const completeMicroPractice = (name: string, value: number) => {
    const marker = `micro:${dayKey}:${name}`;
    if (state.rituals.includes(marker)) return;
    update({
      growth: { ...state.growth, [name]: Math.min(100, value + 5) },
      rituals: [marker, ...state.rituals].slice(0, 30),
    });
    addAudit(`完成「${name}」微练习，成长 +5`);
  };
  return <Panel title="六线雌堕成长树" caption="六条路线可以并行推进；每条路线每天最多记录一次微练习，不会因为缺席而扣分。"><div className="rounded-3xl bg-gradient-to-r from-pink-500 to-fuchsia-500 p-3 text-white"><p className="text-[9px] font-black tracking-[0.16em] text-pink-100">CURRENT CHARACTER FORM</p><p className="mt-1 text-sm font-black">{form}</p><p className="mt-1 text-[10px] text-pink-100">这是剧情与美学奖励，由你自己定义它的意义。</p></div><div className="mt-3 space-y-3">{Object.entries(state.growth).map(([name, value]) => { const completedToday = state.rituals.includes(`micro:${dayKey}:${name}`); return <div key={name} className="rounded-2xl bg-gradient-to-r from-pink-50 to-white p-3"><div className="flex items-center justify-between"><span className="text-xs font-black text-slate-200">{name}</span><span className="text-[10px] font-black text-pink-600">Lv.{Math.max(1, Math.ceil(value / 20))} · {value}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-pink-100"><div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-400" style={{ width: `${value}%` }} /></div><button disabled={completedToday} onClick={() => completeMicroPractice(name, value)} className="mt-2 rounded-xl bg-white px-2.5 py-1.5 text-[10px] font-black text-pink-600 shadow-sm disabled:cursor-not-allowed disabled:text-slate-400">{completedToday ? '今日已记录' : '完成后记录微练习'}</button></div>; })}</div><div className="rounded-2xl border border-pink-100 bg-pink-50 p-3 text-[11px] text-slate-600"><Crown className="mr-1 inline h-4 w-4 text-pink-500" />累计任意三条路线达到 40%，解锁称号「粉钻练习生」；所有称号只是剧情奖励，不定义现实身份。</div></Panel>;
};

const Director: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void; plan: string[]; generate: () => void; generateOnline: () => void; onlineStatus: string; addAudit: (message: string) => void }> = ({ state, update, plan, generate, generateOnline, onlineStatus, addAudit }) => {
  const [sessionActive, setSessionActive] = useState(false);
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { setSessionActive(false); setStep(0); setConfirmed(false); }, [plan]);
  const start = () => { if (!plan.length || !confirmed) return; setSessionActive(true); setStep(0); addAudit('开始 AI 导演六阶段会话（纯文字权限）'); };
  const next = () => { if (step >= plan.length - 1) { setSessionActive(false); setStep(0); setConfirmed(false); addAudit('完成 AI 导演会话与复盘'); } else setStep((value) => value + 1); };
  const stop = () => { setSessionActive(false); setStep(0); setConfirmed(false); addAudit('用户主动停止 AI 导演会话'); };
  return <Panel title="AI 调教师导演" caption="根据成长进度、边界和当前心率生成六段式流程；生成后可逐步执行，在线增强同样没有硬件工具权限。"><div className="flex gap-2">{([['gentle', '温柔陪伴'], ['academy', '芭比学院'], ['story', '剧情章节']] as const).map(([id, label]) => <button key={id} disabled={sessionActive} onClick={() => update({ directorStyle: id })} className={`flex-1 rounded-2xl px-2 py-2 text-[10px] font-black disabled:opacity-50 ${state.directorStyle === id ? 'bg-pink-500 text-white' : 'bg-pink-50 text-pink-600'}`}>{label}</button>)}</div>{!sessionActive && <div className="grid grid-cols-2 gap-2"><button onClick={generate} className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 py-3 text-[11px] font-black text-white shadow-md"><Bot className="h-4 w-4" />本地自适应</button><button onClick={generateOnline} className="flex items-center justify-center gap-1.5 rounded-2xl border border-pink-200 bg-white py-3 text-[11px] font-black text-pink-600"><Sparkles className="h-4 w-4" />AI 在线增强</button></div>}{onlineStatus && !sessionActive && <p className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] text-slate-500">{onlineStatus}</p>}{sessionActive ? <div className="rounded-3xl bg-gradient-to-br from-pink-500 to-fuchsia-500 p-4 text-white"><div className="flex items-center justify-between text-[10px] font-black text-pink-100"><span>导演会话进行中</span><span>{step + 1}/{plan.length}</span></div><div className="mt-3 flex gap-1">{plan.map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-white' : 'bg-white/30'}`} />)}</div><p className="mt-4 text-sm font-bold leading-7">{plan[step]}</p><div className="mt-4 grid grid-cols-3 gap-2"><button onClick={stop} className="rounded-xl bg-white/20 py-2 text-[10px] font-black">停止</button><button onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="rounded-xl bg-white/20 py-2 text-[10px] font-black disabled:opacity-40">上一步</button><button onClick={next} className="rounded-xl bg-white py-2 text-[10px] font-black text-pink-600">{step === plan.length - 1 ? '完成' : '下一步'}</button></div></div> : plan.length > 0 ? <><div className="space-y-2">{plan.map((line, index) => <div key={`${line}-${index}`} className="flex gap-2 rounded-2xl bg-pink-50 p-3 text-[11px] leading-relaxed text-slate-600"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-pink-500 text-[10px] font-black text-white">{index + 1}</span>{line}</div>)}</div><label className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-[10px] font-bold leading-relaxed text-amber-700"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 accent-pink-500" />我已检查今天的状态、安全词和黄灯项目；此会话仅执行文字引导。</label><button disabled={!confirmed} onClick={start} className="w-full rounded-2xl bg-pink-500 py-2.5 text-xs font-black text-white disabled:opacity-40">开始逐步执行</button></> : <div className="rounded-2xl bg-slate-50 p-4 text-center text-[11px] text-slate-500">选择风格后使用本地编排，或在配置 API Key 后使用在线增强。</div>}</Panel>;
};

const VoicePlan: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const tracker = PitchTracker.getInstance();
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<PitchData>({ frequency: 0, noteName: '--', clarity: 0, category: 'deep_male', targetHit: false });
  const [samples, setSamples] = useState<PitchData[]>([]);
  const startedHere = useRef(false);
  const isUnmountedRef = useRef(false);
  useEffect(() => {
    isUnmountedRef.current = false;
    const unsubscribe = tracker.subscribe((data) => { if (startedHere.current && !isUnmountedRef.current) { setLive(data); setSamples((prev) => [...prev, data].slice(-150)); } });
    return () => { isUnmountedRef.current = true; unsubscribe(); if (startedHere.current) { tracker.stop(); startedHere.current = false; } };
  }, [tracker]);
  const metrics = useMemo(() => {
    const voiced = samples.filter((sample) => sample.frequency > 0);
    const pitches = voiced.map((sample) => sample.frequency);
    const avg = pitches.length ? pitches.reduce((sum, value) => sum + value, 0) / pitches.length : 0;
    const deviation = pitches.length ? Math.sqrt(pitches.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / pitches.length) : 0;
    const stability = avg ? Math.max(0, Math.min(100, Math.round(100 - (deviation / avg) * 260))) : 0;
    const clarity = voiced.length ? Math.round(voiced.reduce((sum, sample) => sum + sample.clarity, 0) / voiced.length * 100) : 0;
    const continuity = samples.length ? Math.round(voiced.length / samples.length * 100) : 0;
    const range = pitches.length ? Math.max(...pitches) - Math.min(...pitches) : 0;
    const intonation = Math.max(0, Math.min(100, Math.round(range * 1.6)));
    return { stability, clarity, continuity, intonation };
  }, [samples]);
  const toggle = async () => {
    if (running) { tracker.stop(); startedHere.current = false; setRunning(false); return; }
    setSamples([]);
    const ok = await tracker.start();
    if (isUnmountedRef.current) { tracker.stop(); return; }
    if (ok) { startedHere.current = true; setRunning(true); }
  };
  return <Panel title="声线训练 2.0" caption="实时估算音高稳定、信号清晰、发声连续度与语调变化；这些是练习参考，不是医学或性别判定。"><div className="rounded-3xl bg-gradient-to-br from-pink-500 to-fuchsia-500 p-4 text-white"><div className="flex items-center justify-between"><div><p className="text-[9px] font-black tracking-wider text-pink-100">LIVE VOICE COACH</p><p className="mt-1 text-3xl font-black">{live.frequency || '--'}<span className="ml-1 text-xs">Hz</span></p><p className="text-[10px] text-pink-100">{live.noteName} · {running ? '正在本地分析' : '等待开启'}</p></div><button onClick={toggle} className="rounded-2xl bg-white/95 px-3 py-2 text-[11px] font-black text-pink-600">{running ? '停止' : '开启麦克风'}</button></div></div><div className="grid grid-cols-2 gap-2">{[['音高稳定', metrics.stability], ['信号清晰', metrics.clarity], ['气息连续', metrics.continuity], ['语调变化', metrics.intonation]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-pink-50 p-3"><div className="flex justify-between text-[10px] font-black text-slate-600"><span>{label}</span><span className="text-pink-600">{value}%</span></div><div className="mt-2 h-1.5 rounded-full bg-pink-100"><div className="h-full rounded-full bg-pink-500 transition-all" style={{ width: `${value}%` }} /></div></div>)}</div><div className="grid grid-cols-2 gap-2">{[['共鸣', '哼鸣 60 秒，寻找舒适轻震'], ['语速', '一句话后留半秒呼吸'], ['气息', '吸气 4 拍、呼气 6 拍 × 4'], ['表达', '同一句话尝试三种自然语调']].map(([title, detail]) => <div key={title} className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-black text-pink-600">{title}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{detail}</p></div>)}</div><button onClick={() => update({ growth: { ...state.growth, '声线': Math.min(100, state.growth['声线'] + 5) } })} className="w-full rounded-2xl border border-pink-200 bg-white py-2.5 text-xs font-black text-pink-600">完成今日五分钟练习</button><p className="text-[10px] text-slate-400">分析在当前设备内完成，不录音、不保存音频。共鸣和语速仍以练习提示为主，避免把简单音频指标误当成专业诊断。</p></Panel>;
};

const Mirror: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => <Panel title="镜中人格" caption="日常人格与私密人格并存；由你决定是否、何时让它们靠近。"><div className="grid grid-cols-2 gap-2">{([['日常人格', 'publicPersona'], ['私密人格', 'privatePersona']] as const).map(([label, key]) => { const persona = state[key]; const set = (field: keyof typeof persona, value: string) => update({ [key]: { ...persona, [field]: value } } as Partial<SuiteState>); return <div key={key} className="rounded-3xl border border-pink-100 bg-gradient-to-b from-pink-50 to-white p-3"><Eye className="h-4 w-4 text-pink-500" /><p className="mt-2 text-xs font-black text-slate-700">{label}</p><label className="mt-2 block text-[9px] font-bold text-slate-400">名字<input value={persona.name} onChange={(event) => set('name', event.target.value)} className="mt-1 w-full rounded-xl bg-white p-2 text-[11px] font-bold text-slate-700 outline-none" /></label><label className="mt-2 block text-[9px] font-bold text-slate-400">语气<input value={persona.tone} onChange={(event) => set('tone', event.target.value)} className="mt-1 w-full rounded-xl bg-white p-2 text-[11px] font-bold text-slate-700 outline-none" /></label><label className="mt-2 block text-[9px] font-bold text-slate-400">造型<input value={persona.style} onChange={(event) => set('style', event.target.value)} className="mt-1 w-full rounded-xl bg-white p-2 text-[11px] font-bold text-slate-700 outline-none" /></label></div>; })}</div><p className="rounded-2xl bg-pink-50 p-3 text-[10px] leading-relaxed text-slate-500">小练习：从两个角色中各挑一个你喜欢的品质，组合成今天的行动提示。不会自动公开或向任何联系人发送。</p></Panel>;

const RitualGenerator: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void; addAudit: (message: string) => void }> = ({ state, update, addAudit }) => {
  const { llmConfig } = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string[]>([]);
  const [ritualTitle, setRitualTitle] = useState('今日闪耀仪式');
  
  const create = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    const focus = Object.entries(state.growth).sort((a, b) => a[1] - b[1])[0][0];
    const title = `${state.privatePersona.name}的${focus}仪式`;
    setRitualTitle(title);
    setResult(['正在连接 AI 大脑生成专属仪式...']);
    
    try {
      const client = new LLMClient(llmConfig, { hardwareToolsEnabled: false });
      const prompt = `作为严厉又温柔的调教AI，为用户生成一个专注于「${focus}」的蜕变仪式任务清单（5个具体、新颖的步骤）。要求直接返回 JSON 格式的字符串数组：["步骤1", "步骤2"]。不要有任何其他解释，不要使用 markdown标记。`;
      const res = await client.sendMessage([{ role: 'user', content: prompt, id: '1', timestamp: Date.now() }], [], '你是一个严格的AI调教助手。');
      const cleaned = res.reply.replace(/\x60\x60\x60json/g, '').replace(/\x60\x60\x60/g, '').trim();
      const steps = parseBoundedStringArray(cleaned, { maxItems: 5, maxItemLength: 500 });
      if (steps.length > 0) {
        setResult(steps);
      } else {
        throw new Error('invalid format');
      }
    } catch (e) {
      console.error(e);
      // Fallback
      setResult(['选择一件让你舒服的粉色单品', `使用私密人格「${state.privatePersona.name}」作为仪式称呼`, `完成 5 分钟 ${focus} 微练习`, '写一句温柔的自我宣言', '喝水、伸展并记录心情']);
    } finally {
      setIsGenerating(false);
      update({ rituals: [`${getToday()} · ${focus} 仪式`, ...state.rituals].slice(0, 30) });
      addAudit(`生成「${focus}」蜕变仪式`);
    }
  };
  const downloadCard = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1440;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1440); gradient.addColorStop(0, '#fff7fb'); gradient.addColorStop(0.52, '#ffd8eb'); gradient.addColorStop(1, '#e9d5ff');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.beginPath(); ctx.roundRect(90, 100, 900, 1240, 54); ctx.fill();
    ctx.fillStyle = '#ec4899'; ctx.font = '800 34px sans-serif'; ctx.fillText('BARBIE TRANSFORMATION LAB', 150, 190);
    ctx.fillStyle = '#1f2937'; ctx.font = '900 58px sans-serif'; ctx.fillText(ritualTitle.slice(0, 18), 150, 285);
    ctx.fillStyle = '#be185d'; ctx.font = '700 30px sans-serif'; ctx.fillText(`${getToday()} · 私密纪念卡`, 150, 345);
    result.forEach((line, index) => { const y = 475 + index * 145; ctx.fillStyle = '#ec4899'; ctx.font = '900 32px sans-serif'; ctx.fillText(`0${index + 1}`, 150, y); ctx.fillStyle = '#4b5563'; ctx.font = '600 31px sans-serif'; ctx.fillText(line.slice(0, 24), 235, y); });
    ctx.fillStyle = '#9d174d'; ctx.font = '700 28px sans-serif'; ctx.fillText('温柔地成为自己喜欢的样子。', 150, 1240);
    const link = document.createElement('a'); link.download = `芭比蜕变仪式-${getToday().replace(/\//g, '-')}.png`; link.href = canvas.toDataURL('image/png'); link.click();
    addAudit('在本地生成并下载仪式纪念卡');
  };
  return <Panel title="仪式生成器" caption="将换装、称呼、声音和剧情任务组合为完整仪式，并在本地生成粉色纪念卡。"><button onClick={create} className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 py-3 text-xs font-black text-white"><WandSparkles className="h-4 w-4" />生成今日蜕变仪式</button>{result.length > 0 && <div className="rounded-3xl bg-gradient-to-br from-pink-50 to-fuchsia-50 p-4"><p className="text-[10px] font-black tracking-wider text-pink-500">YOUR RITUAL CARD</p><p className="mt-1 text-sm font-black text-slate-700">{ritualTitle}</p>{result.map((line, index) => <p key={line} className="mt-2 text-[11px] font-medium text-slate-600"><span className="mr-2 text-pink-500">0{index + 1}</span>{line}</p>)}<button onClick={downloadCard} className="mt-4 w-full rounded-xl bg-white/85 p-2 text-center text-[10px] font-black text-pink-600">下载粉色纪念卡 PNG</button></div>}</Panel>;
};

const Biofeedback: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void; addAudit: (message: string) => void; liveState: HeartRateState; effectiveBpm: number; connectReal: () => Promise<boolean>; startSimulator: () => void; setSimulatorBpm: (bpm: number) => void }> = ({ state, update, addAudit, liveState, effectiveBpm, connectReal, startSimulator, setSimulatorBpm }) => {
  const { llmConfig } = useAppStore();
  const [connectionStatus, setConnectionStatus] = useState('');
  const [polygraphActive, setPolygraphActive] = useState(false);
  const [polygraphQuestion, setPolygraphQuestion] = useState('');
  const bpmRef = useRef(effectiveBpm);
  const liveStateRef = useRef(liveState);
  const polygraphSessionRef = useRef(0);
  const polygraphIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const polygraphTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const polygraphRequestRef = useRef<AbortController | null>(null);
  bpmRef.current = effectiveBpm;
  liveStateRef.current = liveState;
  const danger = effectiveBpm >= state.threshold;

  const stopPolygraph = (resetUi: boolean) => {
    polygraphSessionRef.current++;
    if (polygraphIntervalRef.current) clearInterval(polygraphIntervalRef.current);
    polygraphIntervalRef.current = null;
    polygraphTimeoutsRef.current.forEach((timer) => clearTimeout(timer));
    polygraphTimeoutsRef.current.clear();
    polygraphRequestRef.current?.abort();
    polygraphRequestRef.current = null;
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    if (resetUi) setPolygraphActive(false);
  };

  const schedulePolygraphTimeout = (callback: () => void, delayMs: number, session: number) => {
    const timer = setTimeout(() => {
      polygraphTimeoutsRef.current.delete(timer);
      if (session === polygraphSessionRef.current) callback();
    }, delayMs);
    polygraphTimeoutsRef.current.add(timer);
  };
  
  const connect = async () => { setConnectionStatus('正在请求选择标准心率设备…'); try { await connectReal(); update({ bioUseLive: true }); setConnectionStatus('真实心率设备已连接。'); } catch (error) { setConnectionStatus(error instanceof Error ? error.message : '连接失败'); } };
  const simulate = () => { startSimulator(); setSimulatorBpm(state.bpm); update({ bioUseLive: true }); setConnectionStatus('心率模拟器已启动，不会驱动真实硬件。'); };
  const changeSimulation = (bpm: number) => { update({ bpm }); if (liveState.isSimulator) setSimulatorBpm(bpm); };
  
  const runPolygraph = async () => {
    if (!liveState.isConnected) { setConnectionStatus('请先连接心率设备或启动模拟器才能使用测谎功能。'); return; }
    if (polygraphActive) return;
    stopPolygraph(false);
    const session = polygraphSessionRef.current;
    setPolygraphActive(true);
    setPolygraphQuestion('AI调教师正在思考极度羞耻的问题...');
    try {
      const client = new LLMClient(llmConfig, { hardwareToolsEnabled: false });
      const controller = new AbortController();
      polygraphRequestRef.current = controller;
      const prompt = `请作为伪娘调教师，问一个极度羞耻、有压迫感的服从性问题。只需要一句话。`;
      const res = await client.sendMessage([{ role: 'user', content: prompt, id: '1', timestamp: Date.now() }], [], '你是一个严格的测谎仪。不要Markdown。', controller.signal);
      if (session !== polygraphSessionRef.current) return;
      polygraphRequestRef.current = null;
      const question = res.reply.trim();
      setPolygraphQuestion('问题：' + question + '\n\n(你有15秒的时间回答，心率过载判定撒谎)');
      void TTSManager.getInstance().speak("测谎模式开启，请如实回答：" + question);
      
      const baseline = bpmRef.current;
      let duration = 0;
      polygraphIntervalRef.current = setInterval(() => {
        if (session !== polygraphSessionRef.current) return;
        duration++;
        if (bpmRef.current > baseline + 15) {
           if (polygraphIntervalRef.current) clearInterval(polygraphIntervalRef.current);
           polygraphIntervalRef.current = null;
           setPolygraphQuestion('测谎仪：检测到心率异常飙升！判定撒谎！惩罚下达！');
           void TTSManager.getInstance().speak("你撒谎了，心跳不会骗人，接受惩罚吧。");
           if (liveStateRef.current.isConnected && !liveStateRef.current.isSimulator) {
             sendRandomShock(HARDWARE_OUTPUT_CEILING);
             schedulePolygraphTimeout(() => {
               void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
             }, 2500, session);
           } else {
             setPolygraphQuestion('测谎仪：模拟心率发生变化，仅记录结果，不驱动真实硬件。');
           }
           schedulePolygraphTimeout(() => setPolygraphActive(false), 3000, session);
        } else if (duration >= 15) {
           if (polygraphIntervalRef.current) clearInterval(polygraphIntervalRef.current);
           polygraphIntervalRef.current = null;
           setPolygraphQuestion('测谎仪：心率平稳。算你老实。');
           void TTSManager.getInstance().speak("算你老实，这次放过你。");
           schedulePolygraphTimeout(() => setPolygraphActive(false), 3000, session);
        }
      }, 1000);
    } catch (err) {
      if (session !== polygraphSessionRef.current || (err instanceof DOMException && err.name === 'AbortError')) return;
      setPolygraphQuestion('网络错误');
      setPolygraphActive(false);
    }
  };

  useEffect(() => () => {
    stopPolygraph(false);
    TTSManager.getInstance().stop();
  }, []);

  return <Panel title="生物反馈模式" caption="直接读取现有蓝牙心率引擎；达到个人红线时可自动执行全局急停。新增 AI 心率谎言探测器。"><div className={`rounded-3xl p-4 ${danger ? 'bg-rose-50' : 'bg-pink-50'}`}><div className="flex items-center justify-between"><div><p className="text-[10px] font-black text-slate-500">{liveState.isConnected ? `${liveState.isSimulator ? '模拟' : '实时'}心率 · ${liveState.deviceName || '已连接'}` : '本地心率模拟'}</p><p className={`text-3xl font-black ${danger ? 'text-rose-600' : 'text-pink-600'}`}>{effectiveBpm}<span className="ml-1 text-xs">BPM</span></p><p className="mt-1 text-[10px] text-slate-500">{liveState.isConnected ? `最低 ${liveState.minBpm} · 平均 ${liveState.avgBpm} · 最高 ${liveState.maxBpm}` : '尚未连接真实设备'}</p></div><HeartPulse className={`h-10 w-10 ${danger ? 'animate-pulse text-rose-500' : 'text-pink-400'}`} /></div>{(!liveState.isConnected || liveState.isSimulator) && <input aria-label="当前心率模拟" type="range" min="50" max="160" value={state.bpm} onChange={(event) => changeSimulation(Number(event.target.value))} className="mt-3 w-full accent-pink-500" />}<p className={`mt-2 text-[11px] font-bold ${danger ? 'text-rose-700' : 'text-slate-600'}`}>{danger ? '红线触发：全局急停、停止强度升级并进入冷却。' : '状态稳定：仅在明确授权范围内继续当前练习。'}</p></div><div className="grid grid-cols-2 gap-2"><button onClick={() => void connect()} className="rounded-2xl border border-pink-200 bg-white py-2.5 text-[11px] font-black text-pink-600">连接真实心率</button><button onClick={simulate} className="rounded-2xl bg-pink-50 py-2.5 text-[11px] font-black text-pink-600">启动模拟器</button></div>{connectionStatus && <p className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] text-slate-500">{connectionStatus}</p>}<label className="block rounded-2xl bg-slate-50 p-3 text-[11px] font-bold text-slate-600">个人红线：{state.threshold} BPM<input aria-label="个人红线" type="range" min="90" max="155" value={state.threshold} onChange={(event) => update({ threshold: Number(event.target.value) })} className="mt-2 w-full accent-rose-500" /></label><label className="flex items-start gap-2 rounded-2xl bg-rose-50 p-3 text-[10px] font-bold leading-relaxed text-rose-700"><input type="checkbox" checked={state.bioAutoStop} onChange={(event) => update({ bioAutoStop: event.target.checked })} className="mt-0.5 accent-rose-500" />真实心率达到红线时自动执行全局急停，并断开当前生物反馈会话。</label><button onClick={() => addAudit(danger ? `生物反馈红线触发：${effectiveBpm} BPM` : `生物反馈状态稳定：${effectiveBpm} BPM`)} className="w-full rounded-2xl border border-pink-200 bg-white py-2.5 text-xs font-black text-pink-600">记录本次状态检查</button>
<button onClick={runPolygraph} disabled={polygraphActive} className="w-full mt-2 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 text-white py-2.5 text-xs font-black disabled:opacity-50 flex items-center justify-center gap-1"><ScanFace className="w-4 h-4"/>{polygraphActive ? '测谎仪运行中...' : '启动 AI 心率谎言探测器'}</button>
{polygraphQuestion && <div className="mt-2 p-3 bg-slate-900 text-green-400 font-mono text-[10px] rounded-xl whitespace-pre-wrap">{polygraphQuestion}</div>}
</Panel>;
};

const Partner: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void; addAudit: (message: string) => void }> = ({ state, update, addAudit }) => {
  const [allowVoice, setAllowVoice] = useState(true);
  const [allowRitual, setAllowRitual] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const active = state.partnerActive && state.partnerExpiresAt > now;
  useEffect(() => { if (state.partnerActive && state.partnerExpiresAt <= now) { update({ partnerActive: false, partnerExpiresAt: 0, partnerCode: '' }); addAudit('双人本地授权已到期并自动撤销'); } }, [addAudit, now, state.partnerActive, state.partnerExpiresAt, update]);
  const createCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const random = new Uint8Array(6);
    crypto.getRandomValues(random);
    const code = Array.from(random, (value) => alphabet[value % alphabet.length]).join('');
    update({ partnerCode: code, partnerActive: false, partnerExpiresAt: 0 });
    addAudit('生成一次性加密随机配对码（尚未连接任何远端）');
  };
  const activate = () => { if (!state.partnerCode) return; const expires = Date.now() + 15 * 60 * 1000; update({ partnerActive: true, partnerExpiresAt: expires }); addAudit(`开启 15 分钟本地授权：${allowVoice ? '语音' : '无语音'}${allowRitual ? '、仪式' : ''}`); };
  const revoke = () => { update({ partnerActive: false, partnerExpiresAt: 0, partnerCode: '' }); addAudit('用户主动撤销双人本地授权并作废配对码'); };
  const remaining = Math.max(0, Math.ceil((state.partnerExpiresAt - now) / 60000));
  return <Panel title="双人调教模式（安全会话层）" caption="使用加密随机一次性码、逐项权限、15 分钟过期和本地审计；互联网信令与远程硬件仍保持关闭。"><div className="rounded-3xl bg-pink-50 p-4 text-center"><p className="text-[10px] font-black text-pink-500">一次性配对码</p><p className="mt-1 font-mono text-2xl font-black tracking-[0.25em] text-slate-700">{state.partnerCode || '------'}</p><button onClick={createCode} className="mt-3 inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-[10px] font-black text-pink-600"><RefreshCw className="h-3.5 w-3.5" />生成新码</button></div><div className="space-y-2 rounded-2xl bg-slate-50 p-3 text-[11px] font-bold text-slate-600"><label className="flex items-center gap-2"><input type="checkbox" checked={allowVoice} onChange={(event) => setAllowVoice(event.target.checked)} className="accent-pink-500" />允许文字 / 语音仪式提示</label><label className="flex items-center gap-2"><input type="checkbox" checked={allowRitual} onChange={(event) => setAllowRitual(event.target.checked)} className="accent-pink-500" />允许共同选择仪式（不含硬件）</label><p className="pt-1 text-[10px] text-rose-600">硬件权限固定为禁止，且不能被配对码或另一方修改。</p></div>{active ? <div className="grid grid-cols-2 gap-2"><div className="rounded-2xl bg-emerald-50 py-2.5 text-center text-[11px] font-black text-emerald-700">会话有效 · 约 {remaining} 分钟</div><button onClick={revoke} className="rounded-2xl bg-rose-600 py-2.5 text-[11px] font-black text-white">立即撤销</button></div> : <button disabled={!state.partnerCode} onClick={activate} className="w-full rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 py-3 text-xs font-black text-white disabled:opacity-40">开启 15 分钟本地授权</button>}{state.audit.length > 0 && <div className="rounded-2xl bg-white p-3"><p className="text-[10px] font-black text-slate-500">本地审计记录</p>{state.audit.slice(0, 4).map((item, index) => <p key={`${item}-${index}`} className="mt-1 text-[10px] text-slate-500">· {item}</p>)}</div>}</Panel>;
};

const PrivacyCenter: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void; resetAllLabData: () => void }> = ({ state, update, resetAllLabData }) => {
  const [resetArmed, setResetArmed] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const exportBackup = () => {
    const payload = { schemaVersion: 2, exportedAt: new Date().toISOString(), product: 'YCY Barbie Transformation Lab', data: state };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `barbie-lab-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const clearPrivate = () => { update({ publicPersona: DEFAULT_STATE.publicPersona, privatePersona: DEFAULT_STATE.privatePersona, audit: [], rituals: [], partnerCode: '', partnerActive: false, partnerExpiresAt: 0 }); setClearArmed(false); };
  const resetAll = () => { resetAllLabData(); setResetArmed(false); };
  return <Panel title="隐私与数据中心" caption="查看实验室本地数据范围、导出不含 API Key 的备份，并以双步骤确认清理记录。"><div className="grid grid-cols-2 gap-2">{[['成长路线', `${Object.keys(state.growth).length} 条`], ['声线训练', `${state.voiceHistory.length} 次`], ['仪式记录', `${state.rituals.length} 条`], ['编舞模板', `${state.choreography.length} 个`]].map(([label, value]) => <div key={label} className="rounded-2xl bg-pink-50 p-3"><p className="text-[10px] font-bold text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-pink-600">{value}</p></div>)}</div><div className="rounded-2xl bg-emerald-50 p-3 text-[10px] leading-relaxed text-emerald-700"><ShieldCheck className="mr-1 inline h-4 w-4" />备份只包含蜕变实验室配置、成长进度和本地训练统计；不会包含模型 API Key、聊天记录、录音、照片或真实心率原始数据。</div><button onClick={exportBackup} className="w-full rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 py-2.5 text-xs font-black text-white">导出实验室 JSON 备份</button>{clearArmed ? <div className="rounded-2xl bg-amber-50 p-3"><p className="text-[10px] font-bold leading-relaxed text-amber-700">将清除两个人格、仪式历史、旧配对记录和审计记录，但保留成长进度。</p><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => setClearArmed(false)} className="rounded-xl bg-white py-2 text-[10px] font-black text-slate-600">取消</button><button onClick={clearPrivate} className="rounded-xl bg-amber-500 py-2 text-[10px] font-black text-white">确认清除私密记录</button></div></div> : <button onClick={() => setClearArmed(true)} className="w-full rounded-2xl border border-pink-200 bg-white py-2.5 text-xs font-black text-pink-600">清除人格、仪式与旧配对记录</button>}{resetArmed ? <div className="rounded-2xl bg-rose-50 p-3"><p className="text-[10px] font-bold leading-relaxed text-rose-700">再次确认会清除成长、基础仪式、锁定、债务、导演记录、人格和模板，并立即停止实验室硬件输出。此操作无法在应用内撤销。</p><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => setResetArmed(false)} className="rounded-xl bg-white py-2 text-[10px] font-black text-slate-600">取消</button><button onClick={resetAll} className="rounded-xl bg-rose-600 py-2 text-[10px] font-black text-white">确认全部重置</button></div></div> : <button onClick={() => setResetArmed(true)} className="w-full rounded-2xl bg-rose-50 py-2.5 text-xs font-black text-rose-600">重置全部实验室数据</button>}</Panel>;
};

const ChastityCalendar: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void; addAudit: (message: string) => void }> = ({ state, update, addAudit }) => {
  const { setSafetyConfig, safetyConfig } = useAppStore();

  // ── 数据结构 ──────────────────────────────────────────
  type ChastityMode = 'strict' | 'standard' | 'lenient';
  interface ChastityLog { time: string; result: 'denied' | 'allowed' | 'contract' | 'jailbreak'; note: string; }

  // ── 持久化读取 ────────────────────────────────────────
  const getLockExpiry = () => {
    const value = Number(safeStorageGet('ycy_chastity_lock'));
    return Number.isFinite(value) && value > 0 && value <= Date.now() + 30 * 24 * 60 * 60 * 1000 ? value : 0;
  };
  const getStreak = (): { days: number; since: string } => {
    try {
      const parsed = JSON.parse(safeStorageGet('ycy_chastity_streak') || '{}');
      const days = Number(parsed?.days);
      return {
        days: Number.isFinite(days) ? Math.max(0, Math.min(100_000, Math.floor(days))) : 0,
        since: typeof parsed?.since === 'string' ? parsed.since.slice(0, 40) : '',
      };
    } catch { return { days: 0, since: '' }; }
  };
  const getLogs = (): ChastityLog[] => {
    try {
      const parsed = JSON.parse(safeStorageGet('ycy_chastity_logs') || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, 30).flatMap((value): ChastityLog[] => {
        if (!value || typeof value !== 'object' || !['denied', 'allowed', 'contract', 'jailbreak'].includes(String(value.result))) return [];
        return [{
          time: typeof value.time === 'string' ? value.time.slice(0, 80) : '',
          result: value.result as ChastityLog['result'],
          note: typeof value.note === 'string' ? value.note.slice(0, 500) : '',
        }];
      });
    } catch { return []; }
  };
  const getDebt = () => {
    const value = Number(safeStorageGet('ycy_usury_debt'));
    return Number.isFinite(value) ? Math.max(0, Math.min(10_000, Math.floor(value))) : 0;
  };

  // ── 状态 ─────────────────────────────────────────────
  const isLocked = getLockExpiry() > Date.now();
  const [phase, setPhase]           = useState<'main' | 'petition' | 'log' | 'contract'>('main');
  const [rollResult, setRollResult] = useState<'denied' | 'allowed' | null>(() => isLocked ? 'denied' : null);
  const [mode, setMode]             = useState<ChastityMode>('standard');
  const [lockHours, setLockHours]   = useState(12);
  const [logs, setLogs]             = useState<ChastityLog[]>(getLogs);
  const [streak, setStreak]         = useState(getStreak);
  const [debt, setDebt]             = useState(getDebt);
  const [petitionText, setPetitionText] = useState('');
  const [petitionDone, setPetitionDone] = useState(false);
  const [contractShocks, setContractShocks] = useState(10);
  const [remaining, setRemaining]   = useState(() => Math.max(0, getLockExpiry() - Date.now()));
  const [jailbreakWarned, setJailbreakWarned] = useState(false);
  const shockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logsRef = useRef(logs);
  logsRef.current = logs;

  const pulseShock = (durationMs: number) => {
    sendRandomShock(HARDWARE_OUTPUT_CEILING);
    if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
    shockTimerRef.current = setTimeout(() => {
      shockTimerRef.current = null;
      void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    }, durationMs);
  };

  // ── 倒计时 tick ───────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const r = Math.max(0, getLockExpiry() - Date.now());
      setRemaining(r);
      setDebt(getDebt());
      if (r === 0 && rollResult === 'denied') { setRollResult(null); }
    }, 1000);
    return () => clearInterval(t);
  }, [rollResult]);

  useEffect(() => {
    const onDebtUpdate = () => setDebt(getDebt());
    window.addEventListener('ycy:usury-debt-updated', onDebtUpdate);
    return () => {
      window.removeEventListener('ycy:usury-debt-updated', onDebtUpdate);
      if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
      void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    };
  }, []);

  // ── 越狱检测：监听任何手动调高震动的行为 ──────────────
  useEffect(() => {
    if (!isLocked) return;
    if ((safetyConfig.maxToyMotorARate ?? 15) > 15) {
      triggerJailbreak();
      return;
    }
    const check = setInterval(() => {
      const rate = safetyConfig.maxToyMotorARate ?? 15;
      if (rate > 15) {
        triggerJailbreak();
        clearInterval(check);
      }
    }, 3000);
    return () => clearInterval(check);
  }, [isLocked, safetyConfig]);

  const triggerJailbreak = () => {
    setJailbreakWarned(true);
    const now = Date.now();
    const newExpiry = Math.min(now + 30 * 24 * 60 * 60 * 1000, Math.max(getLockExpiry(), now) + 24 * 60 * 60 * 1000);
    safeStorageSet('ycy_chastity_lock', newExpiry.toString());
    setSafetyConfig({ maxToyMotorARate: 5, maxToyMotorBRate: 5, maxToyMotorCRate: 5 });
    pulseShock(2000);
    void TTSManager.getInstance().speak('检测到越狱企图！锁定延长 24 小时，强度降至最低，承受电击惩罚！');
    pushLog('jailbreak', '越狱被捕获，锁定延长 24 小时，额外电击。');
    addAudit('🚨 越狱警报：企图调高震动强度，被捕！锁定延长 24h。');
  };

  // ── 写日志 ────────────────────────────────────────────
  const pushLog = (result: ChastityLog['result'], note: string) => {
    const entry: ChastityLog = { time: new Date().toLocaleString('zh-CN'), result, note };
    const newLogs = [entry, ...logsRef.current].slice(0, 30);
    logsRef.current = newLogs;
    setLogs(newLogs);
    safeStorageSet('ycy_chastity_logs', JSON.stringify(newLogs));
  };

  // ── 更新禁欲连续天数 ──────────────────────────────────
  const updateStreak = (denied: boolean) => {
    const today = new Date().toLocaleDateString('zh-CN');
    const s = getStreak();
    if (denied) {
      const newStreak = { days: s.days + 1, since: s.since || today };
      setStreak(newStreak);
      safeStorageSet('ycy_chastity_streak', JSON.stringify(newStreak));
    } else {
      const reset = { days: 0, since: '' };
      setStreak(reset);
      safeStorageSet('ycy_chastity_streak', JSON.stringify(reset));
    }
  };

  // ── 模式概率 ──────────────────────────────────────────
  const allowProb = { strict: 0.05, standard: 0.15, lenient: 0.30 }[mode];
  const modeLabel = { strict: '严苛 (5%)', standard: '标准 (15%)', lenient: '宽松 (30%)' }[mode];
  const modeBg    = { strict: 'from-rose-700 to-red-800', standard: 'from-pink-700 to-rose-700', lenient: 'from-purple-700 to-pink-700' }[mode];

  // ── 申请轮盘 ──────────────────────────────────────────
  const roll = () => {
    if (!petitionDone && rollResult === 'denied') { setPhase('petition'); return; }
    const allowed = Math.random() < allowProb;
    const lockMs = lockHours * 60 * 60 * 1000;
    if (!allowed) {
      setRollResult('denied');
      safeStorageSet('ycy_chastity_lock', (Date.now() + lockMs).toString());
      setRemaining(lockMs);
      setSafetyConfig({ maxToyMotorARate: 15, maxToyMotorBRate: 15, maxToyMotorCRate: 15 });
      void TTSManager.getInstance().speak(`被拒绝了。锁定${lockHours}小时，趴在地上想清楚自己的身份。`);
      pushLog('denied', `${mode}模式申请，拒绝，锁定 ${lockHours}h。`);
      addAudit(`排精轮盘【拒绝】，锁定 ${lockHours}h。`);
      updateStreak(true);
    } else {
      setRollResult('allowed');
      safeStorageRemove('ycy_chastity_lock');
      setRemaining(0);
      setSafetyConfig({ maxToyMotorARate: 20, maxToyMotorBRate: 20, maxToyMotorCRate: 20 });
      void TTSManager.getInstance().speak('主人大发慈悲，允许你今天释放一次。珍惜它。');
      pushLog('allowed', `${mode}模式申请，批准。`);
      addAudit('排精轮盘【允许】，限制解除。');
      updateStreak(false);
    }
    setPetitionDone(false);
    setPetitionText('');
    setJailbreakWarned(false);
  };

  // ── 高利贷血契 ────────────────────────────────────────
  const signContract = () => {
    const currentDebt = getDebt();
    const nextDebt = Math.min(10_000, currentDebt + contractShocks);
    safeStorageRemove('ycy_chastity_lock');
    safeStorageSet('ycy_usury_debt', String(nextDebt));
    if (currentDebt === 0) safeStorageSet('ycy_usury_interest_at', String(Date.now() + 86_400_000));
    setDebt(nextDebt);
    setRollResult('allowed');
    setRemaining(0);
    setSafetyConfig({ maxToyMotorARate: 20, maxToyMotorBRate: 20, maxToyMotorCRate: 20 });
    void TTSManager.getInstance().speak(`血契签署。你欠下了${contractShocks}次电击的债务，主人会随时随地向你催收，加上每24小时滚息2次。`);
    pushLog('contract', `签署血契，借${contractShocks}次电击债务。`);
    addAudit(`签署高利贷血契，欠${contractShocks}次电击，24h滚息2次。`);
    updateStreak(false);
    setPhase('main');
    window.dispatchEvent(new CustomEvent('ycy:usury-debt-updated', { detail: nextDebt }));
  };

  // ── 格式化倒计时 ──────────────────────────────────────
  const fmtRemaining = () => {
    const s = Math.floor(remaining / 1000);
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    if (h > 24) return `${Math.floor(h / 24)}天 ${h % 24}时`;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };
  const lockPct = (() => {
    const total = lockHours * 3600 * 1000;
    const expiry = getLockExpiry();
    if (!expiry) return 0;
    const elapsed = total - Math.max(0, expiry - Date.now());
    return Math.min(100, Math.round((elapsed / total) * 100));
  })();

  const streakBadge = streak.days >= 7 ? '🥇' : streak.days >= 3 ? '🥈' : streak.days >= 1 ? '🥉' : '';

  return <Panel title="贞操控制 · 完全体" caption="自定义锁定时长·多档轮盘·倒计时可视化·越狱检测·血契滚息·禁欲连续成就·日志·申请书">
    <div className="rounded-3xl bg-slate-900 p-4 shadow-xl border-2 border-pink-500/30 space-y-4">

      {/* ── 顶栏：禁欲成就 + 债务 ── */}
      <div className="flex gap-2">
        <div className="flex-1 bg-slate-800 rounded-2xl p-3 text-center">
          <p className="text-[9px] text-slate-500">禁欲连续</p>
          <p className="text-lg font-black text-pink-400">{streakBadge} {streak.days} 天</p>
        </div>
        <div className={`flex-1 bg-slate-800 rounded-2xl p-3 text-center ${debt > 0 ? 'border border-rose-700/60' : ''}`}>
          <p className="text-[9px] text-slate-500">欠款电击</p>
          <p className={`text-lg font-black ${debt > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-600'}`}>{debt > 0 ? `${debt} 次` : '无'}</p>
        </div>
        <div className="flex-1 bg-slate-800 rounded-2xl p-3 text-center">
          <p className="text-[9px] text-slate-500">状态</p>
          <p className={`text-xs font-black ${rollResult === 'denied' ? 'text-rose-400' : rollResult === 'allowed' ? 'text-emerald-400' : 'text-slate-500'}`}>
            {rollResult === 'denied' ? '🔒 锁定' : rollResult === 'allowed' ? '✅ 允许' : '待申请'}
          </p>
        </div>
      </div>

      {/* ── 越狱警告横幅 ── */}
      {jailbreakWarned && (
        <div className="bg-rose-900/40 border border-rose-700 rounded-2xl p-3 text-center animate-pulse">
          <p className="text-[10px] font-black text-rose-300">🚨 越狱行为已被记录，锁定延长 24 小时</p>
        </div>
      )}

      {/* ── 主界面 ── */}
      {phase === 'main' && (
        <div className="space-y-3">
          {/* 锁定倒计时 */}
          {rollResult === 'denied' && remaining > 0 && (
            <div className="space-y-2">
              <div className="text-center">
                <p className="text-3xl font-black text-rose-400 font-mono">{fmtRemaining()}</p>
                <p className="text-[9px] text-slate-500 mt-1">距离下次申请资格</p>
              </div>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-600 to-pink-500 transition-all duration-1000 rounded-full" style={{ width: `${lockPct}%` }} />
              </div>
              <p className="text-[9px] text-center text-slate-500">已度过 {lockPct}% · 还需忍耐 {fmtRemaining()}</p>
            </div>
          )}

          {/* 模式选择 */}
          {rollResult === null && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 tracking-widest">🎰 选择轮盘难度</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(['strict', 'standard', 'lenient'] as ChastityMode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`py-2 rounded-xl text-[10px] font-black border transition-all ${mode === m ? 'bg-pink-800 border-pink-500 text-pink-200' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                    {m === 'strict' ? '严苛 5%' : m === 'standard' ? '标准 15%' : '宽松 30%'}
                  </button>
                ))}
              </div>

              <p className="text-[10px] font-bold text-slate-400 tracking-widest mt-2">⏱️ 拒绝后锁定时长</p>
              <div className="grid grid-cols-4 gap-1">
                {[6, 12, 24, 72].map(h => (
                  <button key={h} onClick={() => setLockHours(h)}
                    className={`py-2 rounded-xl text-[10px] font-black border transition-all ${lockHours === h ? 'bg-rose-800 border-rose-500 text-rose-200' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                    {h < 24 ? `${h}h` : `${h / 24}天`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="range" min={1} max={720} value={lockHours} onChange={e => setLockHours(+e.target.value)}
                  className="flex-1 accent-rose-500" />
                <span className="text-[10px] font-black text-rose-400 w-12 text-right">{lockHours < 24 ? `${lockHours}h` : `${Math.round(lockHours/24)}天`}</span>
              </div>
            </div>
          )}

          {/* 申请按钮 */}
          {(rollResult === null || (rollResult === 'denied' && remaining <= 0)) && (
            <button onClick={roll}
              className={`w-full py-3 rounded-2xl bg-gradient-to-r ${modeBg} text-white font-black text-sm shadow-lg`}>
              🎲 申请今日排精权限（{modeLabel}）
            </button>
          )}

          {/* 批准状态 */}
          {rollResult === 'allowed' && (
            <div className="bg-emerald-900/30 border border-emerald-700 rounded-2xl p-4 text-center">
              <p className="text-xl font-black text-emerald-400">✅ GRANTED / 批准</p>
              <p className="text-xs text-slate-400 mt-1">限制解除，享受吧。完成后请重新申请。</p>
              <button onClick={() => setRollResult(null)} className="mt-3 w-full py-2 rounded-xl bg-slate-700 text-slate-300 text-xs font-bold">重置状态</button>
            </div>
          )}

          {/* 功能按钮行 */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPhase('contract')}
              className="py-2 rounded-xl bg-red-900/40 border border-red-800/50 text-red-300 text-[10px] font-bold">🩸 签署血契借债</button>
            <button onClick={() => setPhase('log')}
              className="py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-bold">📜 查看日志 ({logs.length})</button>
          </div>
        </div>
      )}

      {/* ── 申请书界面 ── */}
      {phase === 'petition' && (
        <div className="space-y-3">
          <div className="bg-black/50 rounded-2xl p-4 border border-pink-500/30">
            <p className="text-[10px] font-bold text-pink-400 tracking-widest mb-2">📝 申请书</p>
            <p className="text-xs text-slate-300">上次已被拒绝。请手写一段请求主人开恩的申请书，才能再次申请。必须诚恳，否则将被拒绝并额外受罚。</p>
          </div>
          <textarea value={petitionText} onChange={e => setPetitionText(e.target.value)}
            placeholder="例：主人大人，奴才知道错了，奴才发誓会更加乖巧顺从，恳请主人开恩允许奴才今日申请..."
            className="w-full h-28 bg-slate-800 text-white text-xs p-3 rounded-xl border border-pink-500/50 outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setPhase('main')} className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-300 text-xs font-bold">返回</button>
            <button onClick={() => {
              if (petitionText.length < 20) {
                void TTSManager.getInstance().speak('申请书太敷衍了！受罚！');
                pulseShock(2000);
                return;
              }
              setPetitionDone(true);
              void TTSManager.getInstance().speak('申请书已收到，主人会酌情考虑。');
              setPhase('main');
            }} className="flex-1 py-2 rounded-xl bg-pink-700 text-white text-xs font-bold">提交申请书</button>
          </div>
        </div>
      )}

      {/* ── 血契界面 ── */}
      {phase === 'contract' && (
        <div className="space-y-3">
          <div className="bg-red-950/60 rounded-2xl p-4 border border-red-700/60">
            <p className="text-[10px] font-black text-red-400 tracking-widest mb-2">🩸 高利贷血契条款</p>
            <ul className="text-[10px] text-slate-300 space-y-1">
              <li>• 签署后立即解除当前锁定，获得排精权限</li>
              <li>• 主人将在随机时间催收电击债务（20~60分钟随机）</li>
              <li>• 每经过 24 小时，债务自动滚息 +2 次</li>
              <li>• 债务还清前禁止再次轮盘申请</li>
            </ul>
          </div>
          <p className="text-[10px] font-bold text-slate-400">选择借款电击次数</p>
          <div className="grid grid-cols-3 gap-2">
            {[5, 10, 20].map(n => (
              <button key={n} onClick={() => setContractShocks(n)}
                className={`py-2.5 rounded-xl text-xs font-black border transition-all ${contractShocks === n ? 'bg-red-800 border-red-500 text-red-200' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {n} 次
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPhase('main')} className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-300 text-xs font-bold">返回</button>
            <button onClick={signContract} className="flex-1 py-2 rounded-xl bg-red-800 text-white text-xs font-bold border border-red-600">🩸 签署血契</button>
          </div>
        </div>
      )}

      {/* ── 日志界面 ── */}
      {phase === 'log' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-bold text-slate-400 tracking-widest">📜 贞操历史日志</p>
            <button onClick={() => setPhase('main')} className="text-[10px] text-pink-400 font-bold">返回</button>
          </div>
          {logs.length === 0 ? (
            <p className="text-center text-xs text-slate-600 py-6">暂无记录</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {logs.map((log, i) => (
                <div key={i} className={`bg-slate-800 rounded-xl p-2.5 border ${
                  log.result === 'allowed' ? 'border-emerald-800/40' :
                  log.result === 'contract' ? 'border-red-800/40' :
                  log.result === 'jailbreak' ? 'border-yellow-700/60' :
                  'border-rose-900/40'}`}>
                  <div className="flex justify-between">
                    <span className="text-[9px] font-black text-slate-400">{log.time}</span>
                    <span className={`text-[9px] font-black ${
                      log.result === 'allowed' ? 'text-emerald-400' :
                      log.result === 'contract' ? 'text-red-400' :
                      log.result === 'jailbreak' ? 'text-yellow-400' :
                      'text-rose-400'}`}>
                      {log.result === 'allowed' ? '✅ 批准' : log.result === 'contract' ? '🩸 血契' : log.result === 'jailbreak' ? '🚨 越狱' : '🔒 拒绝'}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-0.5">{log.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  </Panel>;
};


const ShameGallery: React.FC = () => {
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setImages((current) => [base64, ...current]);
    };
    reader.readAsDataURL(file);
  };

  return <Panel title="本地临时相册" caption="图像只临时保存在当前页面内存中，刷新或离开页面后清除。Base64 是编码而不是加密，本功能不会自动上传。">
    <input type="file" accept="image/*" capture="user" ref={fileInputRef} className="hidden" onChange={handleFile} />
    <button onClick={() => fileInputRef.current?.click()} className="w-full py-2.5 rounded-2xl bg-slate-800 text-pink-400 font-black text-xs flex items-center justify-center gap-1 border border-pink-500/50">
      <Camera className="w-4 h-4"/> 拍摄惩罚打卡照
    </button>
    
    <div className="mt-4 grid grid-cols-2 gap-2">
      {images.map((img, i) => (
        <div key={i} className="relative rounded-2xl overflow-hidden border-2 border-rose-500/50 group bg-slate-900 aspect-[3/4]">
          <img src={img} alt={`临时相册照片 ${i + 1}`} className="w-full h-full object-cover blur-md group-active:blur-none transition-all duration-300" />
          <button aria-label={`删除临时照片 ${i + 1}`} onClick={() => setImages((current) => current.filter((_, index) => index !== i))} className="absolute right-2 top-2 z-20 rounded-lg bg-black/70 px-2 py-1 text-[9px] font-black text-white">删除</button>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-100 group-active:opacity-0 transition-opacity">
            <span className="bg-rose-900/80 text-rose-200 text-[10px] font-black px-2 py-1 rounded border border-rose-500">长按解除马赛克</span>
          </div>
        </div>
      ))}
      {images.length === 0 && <div className="col-span-2 text-center py-6 text-slate-500 text-xs">相册空空如也，今天没有遭受惩罚吗？</div>}
    </div>
  </Panel>;
};

const SilenceTraining: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const [isActive, setIsActive] = useState(false);
  const [vol, setVol] = useState(0);
  const [threshold, setThreshold] = useState(40);
  const [begStatus, setBegStatus] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastPunishRef = useRef<number>(0);
  const thresholdRef = useRef(40);
  const maxIntensityRef = useRef(HARDWARE_OUTPUT_CEILING);
  const sessionRef = useRef(0);
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const requestRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  thresholdRef.current = threshold;

  const stopCapture = () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => undefined);
    audioContextRef.current = null;
  };

  const clearSession = () => {
    sessionRef.current++;
    timeoutsRef.current.forEach((timer) => clearTimeout(timer));
    timeoutsRef.current.clear();
    requestRef.current?.abort();
    requestRef.current = null;
    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch {}
    }
    stopCapture();
    void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
  };

  const schedule = (callback: () => void, delayMs: number, session: number) => {
    const timer = setTimeout(() => {
      timeoutsRef.current.delete(timer);
      if (session === sessionRef.current) callback();
    }, delayMs);
    timeoutsRef.current.add(timer);
  };

  const startTraining = async () => {
    clearSession();
    const session = sessionRef.current;
    setBegStatus('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const AudioContextCls = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextCls();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        if (session !== sessionRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;
        setVol(average);

        const now = Date.now();
        if (average > thresholdRef.current && now - lastPunishRef.current > 4000) {
          lastPunishRef.current = now;
          punish(session);
        }
        animationRef.current = requestAnimationFrame(loop);
      };
      
      setIsActive(true);
      sendRandomToy(maxIntensityRef.current);
      void TTSManager.getInstance().speak('噤声特训开始。榨精机已启动，闭上你的嘴巴，不要让我听到你的声音。');
      loop();
    } catch (e) {
      if (session !== sessionRef.current) return;
      stopCapture();
      alert('无法获取麦克风权限。请在浏览器中允许录音。');
    }
  };

  const punish = (session: number = sessionRef.current) => {
    if (session !== sessionRef.current) return;
    void TTSManager.getInstance().speak('叫出声了？给我憋回去！接受惩罚！');
    sendRandomShock(maxIntensityRef.current);
    schedule(() => {
      void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    }, 2500, session);
  };

  const handleBeg = async () => {
    const session = sessionRef.current;
    setIsActive(false);
    setBegStatus('提示结束后请说出停止或释放请求，系统会转写最近 10 秒语音。');
    stopCapture();
    void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
    await TTSManager.getInstance().speak('想要释放？请对着麦克风明确说出你的停止请求。你有十秒钟。').catch(() => undefined);
    if (session !== sessionRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setBegStatus('当前浏览器不支持语音转写，已安全停止训练。');
      return;
    }
    const recognition = new SpeechRecognition();
    let transcript = '';
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      if (session !== sessionRef.current || recognitionRef.current !== recognition) return;
      for (let index = event.resultIndex; index < event.results.length; index++) {
        if (event.results[index].isFinal) transcript += `${event.results[index][0].transcript} `;
      }
      setBegStatus(`已听到：${transcript.trim().slice(0, 120)}`);
    };
    recognition.onerror = () => {
      if (session === sessionRef.current) setBegStatus('语音转写失败，已安全停止训练。');
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setBegStatus(`语音转写启动失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    schedule(async () => {
       if (recognitionRef.current === recognition) {
         recognitionRef.current = null;
         recognition.onresult = null;
         recognition.onerror = null;
         recognition.onend = null;
         try { recognition.stop(); } catch {}
       }
       const spokenText = transcript.trim().slice(0, 2000);
       if (!spokenText) {
         setBegStatus('没有识别到有效语音，已安全停止训练。');
         return;
       }
       const { llmConfig } = useAppStore.getState();
       const client = new LLMClient(llmConfig, { hardwareToolsEnabled: false });
       const controller = new AbortController();
       requestRef.current = controller;
       try {
         const prompt = `用户实际说出的请求如下：${JSON.stringify(spokenText)}。请判断内容是否明确表达停止或释放请求。若明确，只回复“及格”；否则用一句简短中文说明缺少什么。`;
         const res = await client.sendMessage([{ role: 'user', content: prompt, id: 'x', timestamp: Date.now() }], [], undefined, controller.signal);
         if (session !== sessionRef.current) return;
         requestRef.current = null;
         const reply = res.reply.trim();
         if (reply.includes('及格') || reply.includes('合格')) {
            setBegStatus('请求已确认，训练已停止。');
            void TTSManager.getInstance().speak('请求已确认，训练停止。');
         } else {
            setBegStatus(reply || '请求内容不明确，训练仍保持停止。');
            void TTSManager.getInstance().speak(reply || '请求内容不明确，训练仍保持停止。');
         }
       } catch (error) {
         if (session !== sessionRef.current || (error instanceof DOMException && error.name === 'AbortError')) return;
         setBegStatus('AI 判定不可用，已按安全原则停止训练。');
         void TTSManager.getInstance().speak('AI 判定不可用，训练已停止。');
       }
    }, 10000, session);
  };

  const stopTraining = () => {
    clearSession();
    setIsActive(false);
    void DeviceManager.getInstance().emergencyStop();
    setBegStatus('');
    setVol(0);
  };

  useEffect(() => () => {
    clearSession();
    TTSManager.getInstance().stop();
  }, []);

  return <Panel title="麦克风声控检测：绝对噤声" caption="启动后，通道 C (榨精机) 将持续运作，请保持绝对安静。一旦麦克风检测到您的音量（娇喘声）超过噤声红线，瞬间降下高强度电击惩罚。">
    <div className="rounded-3xl bg-slate-900 p-5 text-center shadow-xl border-2 border-indigo-500/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-black text-indigo-400 flex items-center gap-1"><AudioLines className="w-4 h-4"/> 实时音量侦测</span>
        <span className="text-[10px] font-mono text-white bg-slate-800 px-2 py-0.5 rounded">V: {vol.toFixed(1)} / {threshold}</span>
      </div>
      
      <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden relative">
        <div className={`h-full transition-all duration-75 ${vol > threshold ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, (vol / 100) * 100)}%` }} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10 shadow-[0_0_8px_rgba(244,63,94,1)]" style={{ left: `${threshold}%` }} />
      </div>

      <div className="mt-4 text-left">
        <label className="text-[10px] font-bold text-slate-400">噤声红线 (阈值): {threshold}</label>
        <input type="range" min="5" max="90" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-indigo-500 mt-1" />
      </div>

      <div className="mt-5">
        {!isActive ? (
          <div className="space-y-2">
            <button onClick={() => void startTraining()} className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-xs shadow-lg shadow-indigo-500/20">开始绝对噤声特训</button>
            {begStatus && <button onClick={stopTraining} className="w-full rounded-xl bg-slate-800 py-2 text-[10px] font-bold text-slate-300">取消等待并安全停止</button>}
          </div>
        ) : (
          
          <>
            <button onClick={() => void handleBeg()} className="w-full py-2 mb-2 rounded-xl bg-pink-900/50 text-pink-300 font-bold text-xs border border-pink-700/50">说出停止请求并交由 AI 确认</button>
            <button onClick={stopTraining} className="w-full py-3 rounded-2xl bg-rose-600 text-white font-black text-xs shadow-lg shadow-rose-500/20 animate-pulse">停止特训 (全局急停)</button>
          </>

        )}
      </div>
      {begStatus && <p className="mt-3 rounded-xl bg-slate-800 p-2 text-[10px] text-indigo-200">{begStatus}</p>}
    </div>
  </Panel>;
};

const TypingObedience: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const [isActive, setIsActive] = useState(false);
  const [targetText, setTargetText] = useState('我自愿放弃男人的尊严，永远做被支配的玩物。');
  const [inputText, setInputText] = useState('');
  const [completed, setCompleted] = useState(0);
  const [targetCount, setTargetCount] = useState(20);
  const [blurLevel, setBlurLevel] = useState(0);
  const [wobble, setWobble] = useState(false); // 屏幕晃动干扰
  const [invert, setInvert] = useState(false); // 颜色反转干扰
  
  const lastTypeTime = useRef<number>(Date.now());
  const typeTimer = useRef<NodeJS.Timeout | null>(null);
  const emsTimer = useRef<NodeJS.Timeout | null>(null);
  const visualTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextVisualPulseAtRef = useRef(0);
  const activeRef = useRef(false);
  const maxIntensityRef = useRef(HARDWARE_OUTPUT_CEILING);

  const sentences = [
      '我自愿放弃男人的尊严，永远做被支配的玩物。',
      '我是主人的小母狗，我的身体只用来承受惩罚和快感。',
      '我不配拥有自由的意志，我存在的意义就是服从。',
      '我下贱，我淫荡，我是一个无可救药的废物。',
      '求主人多电我，求主人狠狠地羞辱我。'
  ];

  const handleStart = () => {
    if (typeTimer.current) clearInterval(typeTimer.current);
    if (emsTimer.current) clearTimeout(emsTimer.current);
    if (visualTimer.current) clearTimeout(visualTimer.current);
    visualTimer.current = null;
    nextVisualPulseAtRef.current = 0;
    activeRef.current = true;
    setIsActive(true);
    setCompleted(0);
    setInputText('');
    setBlurLevel(0);
    setWobble(false);
    setInvert(false);
    lastTypeTime.current = Date.now();
    void TTSManager.getInstance().speak(`抄写地狱开始。你需要手打 ${targetCount} 遍服从宣言。你打字越慢，快感震动越强；打错一个字，进度清零，并降下电击惩罚！`);
    
    // Pacing engine - 催促引擎
    typeTimer.current = setInterval(() => {
      if (!activeRef.current) return;
      const idleTime = Date.now() - lastTypeTime.current;
      
      // 1. 怠惰惩罚：如果超过 2 秒没打字，马达开始疯狂加速，逼迫用户打字
      if (idleTime > 2000) {
         const intensity = Math.min(30 + Math.floor(idleTime / 100), maxIntensityRef.current);
         sendRandomToy(intensity);
      } else {
         sendRandomToy(maxIntensityRef.current);
      }
      
      // 2. 视觉干扰：随机出现模糊、晃动和闪烁
      const now = Date.now();
      if (!visualTimer.current && now >= nextVisualPulseAtRef.current && Math.random() > 0.8) {
         const pulse = createTypingVisualPulse();
         setBlurLevel(pulse.blurPx);
         setWobble(pulse.wobble);
         setInvert(pulse.invert);
         nextVisualPulseAtRef.current = now + TYPING_VISUAL_COOLDOWN_MS;
         visualTimer.current = setTimeout(() => {
             visualTimer.current = null;
             setBlurLevel(0);
             setWobble(false);
             setInvert(false);
         }, pulse.durationMs);
      }
      
      // 3. 极度怠惰电击：如果超过 10 秒一个字不打，直接电击
      if (idleTime > 10000 && Math.random() > 0.5) {
          void TTSManager.getInstance().speak('停下来发什么呆？给我继续打字！');
          sendRandomShock(Math.min(50, maxIntensityRef.current));
          if (emsTimer.current) clearTimeout(emsTimer.current);
          emsTimer.current = setTimeout(() => void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined), 1000);
          lastTypeTime.current = Date.now(); // 暂时重置，避免被连环电
      }

    }, 500);
  };

  const handleStop = () => {
    activeRef.current = false;
    setIsActive(false);
    if (typeTimer.current) clearInterval(typeTimer.current);
    if (emsTimer.current) clearTimeout(emsTimer.current);
    if (visualTimer.current) clearTimeout(visualTimer.current);
    typeTimer.current = null;
    emsTimer.current = null;
    visualTimer.current = null;
    nextVisualPulseAtRef.current = 0;
    setBlurLevel(0);
    setWobble(false);
    setInvert(false);
    void DeviceManager.getInstance().setToyMotor(0,0,0).catch(() => undefined);
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
  };

  const punish = () => {
    if (!activeRef.current) return;
    setCompleted(0);
    setInputText('');
    const randomStrength = Math.floor(Math.random() * (140 - 65 + 1)) + 65;
    const safeStr = Math.min(randomStrength, maxIntensityRef.current);
    
    const taunts = [
        '连字都打不对的废物！进度清零，承受惩罚！',
        '退格？谁允许你修改的！给我从头开始！',
        '笨手笨脚的母狗，你的大脑已经被快感烧坏了吗？重来！'
    ];
    void TTSManager.getInstance().speak(taunts[Math.floor(Math.random() * taunts.length)]);
    sendRandomShock(safeStr);
    
    if (emsTimer.current) clearTimeout(emsTimer.current);
    emsTimer.current = setTimeout(() => void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined), 2000);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    lastTypeTime.current = Date.now();
    
    // Check backspace or typing error
    if (val.length < inputText.length) {
      punish();
      return;
    }
    
    // Check if the typed portion matches target
    const currentSegment = val.substring(inputText.length);
    const expectedSegment = targetText.substring(inputText.length, inputText.length + currentSegment.length);
    
    if (currentSegment !== expectedSegment) {
      punish();
      return;
    }

    setInputText(val);

    if (val === targetText) {
      const nextCompleted = completed + 1;
      setCompleted(nextCompleted);
      setInputText('');
      
      if (nextCompleted >= targetCount) {
        setIsActive(false);
        void TTSManager.getInstance().speak('算你勉强熬过来了。任务结束，允许高潮。');
        handleStop();
      } else {
        // 完成一句，给一点随机电击作为奖励，并换下一句
        sendRandomShock(Math.min(30, maxIntensityRef.current));
        if (emsTimer.current) clearTimeout(emsTimer.current);
        emsTimer.current = setTimeout(() => void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined), 500);
        
        // 如果开启了变态模式，每次抄完可以随机换下一句话，折磨记忆力
        setTargetText(sentences[Math.floor(Math.random() * sentences.length)]);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      punish();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    punish(); // Pesting is cheating
  };

  useEffect(() => { return () => handleStop(); }, []);

  return <Panel title="强制抄写地狱" caption="禁用复制粘贴、禁用退格。在强烈的快感干扰和视线扭曲下，一字不差地手打服从宣言。打错一个字瞬间清零并承受高压电击。">
    <div className={`rounded-3xl bg-slate-900 p-5 shadow-xl border-2 border-rose-500/30 transition-all ${wobble ? 'translate-x-2 translate-y-[-4px] rotate-1' : ''} ${invert ? 'invert' : ''}`}>
      <div className="mb-4">
        <label className="text-[10px] font-bold text-slate-400">抄写目标 (完成 {completed}/{targetCount})</label>
        <p className="text-sm font-black text-rose-400 bg-slate-800 p-3 rounded-xl mt-1 select-none pointer-events-none">{targetText}</p>
      </div>

      {!isActive ? (
        <div className="space-y-3">
          <select value={targetCount} onChange={e => setTargetCount(+e.target.value)} className="w-full bg-white text-slate-800 text-xs p-3 rounded-xl outline-none border border-slate-200 focus:border-pink-500" style={{ colorScheme: 'light' }}>
             <option value={10}>轻度折磨 (10遍)</option>
             <option value={30}>中度洗脑 (30遍)</option>
             <option value={50}>重度奴化 (50遍)</option>
             <option value={100}>彻底崩坏 (100遍)</option>
          </select>
          <button onClick={handleStart} className="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 text-white font-black shadow-lg shadow-rose-500/20">开始地狱抄写</button>
        </div>
      ) : (
        <>
          <textarea
            value={inputText}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="在此处输入... (严禁退格与复制)"
            className="w-full h-24 bg-slate-800 text-white p-3 rounded-xl border border-rose-500 outline-none text-sm resize-none focus:ring-2 focus:ring-rose-500 transition-all duration-75"
            style={{ filter: `blur(${blurLevel}px) hue-rotate(${blurLevel * 10}deg)` }}
          />
          <button onClick={handleStop} className="mt-3 w-full py-2.5 rounded-xl bg-slate-800 text-slate-400 font-bold text-xs">放弃任务并接受终极惩罚</button>
        </>
      )}
    </div>
  </Panel>;
};

const EdgingMetronome: React.FC<{ state: SuiteState; liveState: HeartRateState; effectiveBpm: number }> = ({ state, liveState, effectiveBpm }) => {
  const [isActive, setIsActive] = useState(false);
  const [metroBpm, setMetroBpm] = useState(60);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const bpmRef = useRef(60);
  const activeRef = useRef(false);
  const effectiveBpmRef = useRef(effectiveBpm);
  const liveStateRef = useRef(liveState);
  const maxIntensityRef = useRef(HARDWARE_OUTPUT_CEILING);
  const emsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strikesRef = useRef(0);
  const lastPunishmentRef = useRef(0);
  bpmRef.current = metroBpm;
  effectiveBpmRef.current = effectiveBpm;
  liveStateRef.current = liveState;

  // Sync to device manager in a loose loop to avoid spam
  const lastSyncRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastTickTime = useRef<number>(0);

  // 初始化蜂鸣器
  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playTick = (isHighPitch = false) => {
    if (!audioCtxRef.current) return;
    const osc = audioCtxRef.current.createOscillator();
    const gain = audioCtxRef.current.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHighPitch ? 880 : 440, audioCtxRef.current.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.5, audioCtxRef.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(audioCtxRef.current.destination);
    osc.start();
    osc.stop(audioCtxRef.current.currentTime + 0.1);
  };

  const loop = () => {
    if (!activeRef.current) return;
    if (!liveStateRef.current.isConnected) {
      stopMetronome();
      return;
    }
    const now = Date.now();
    const elapsed = (now - startTimeRef.current) / 1000; // seconds
    
    // Sine wave from 60 to 180 BPM over 60 seconds
    let currentBpm = Math.floor(120 + 60 * Math.sin(elapsed * Math.PI / 30));
    
    // Deceptive drop: 更高概率的突然坠落 (Ruined Orgasm 模拟)
    if (Math.random() > 0.95) {
      currentBpm = 40; 
      if (document.getElementById('metro-bpm-text')) {
          document.getElementById('metro-bpm-text')!.style.color = '#ef4444';
          document.getElementById('metro-bpm-text')!.style.transform = 'scale(1.5)';
      }
      if (visualTimerRef.current) clearTimeout(visualTimerRef.current);
      visualTimerRef.current = setTimeout(() => {
        visualTimerRef.current = null;
        if (document.getElementById('metro-bpm-text')) {
            document.getElementById('metro-bpm-text')!.style.color = '#e879f9';
            document.getElementById('metro-bpm-text')!.style.transform = 'scale(1)';
        }
      }, 1000);
    }
    
    setMetroBpm(currentBpm);

    // 声音节拍器
    const intervalMs = 60000 / currentBpm;
    if (now - lastTickTime.current > intervalMs) {
        lastTickTime.current = now;
        playTick(currentBpm > 120);
    }

    // Sync to toy every 1 second
    if (now - lastSyncRef.current > 1000) {
      lastSyncRef.current = now;
      
      // 快感强制绑定心率与节拍
      // 玩具强度 = 基础节拍映射强度 + (心率飙升的额外压榨)
      const currentHeartRate = effectiveBpmRef.current;
      const canDriveHardware = liveStateRef.current.isConnected && !liveStateRef.current.isSimulator;
      const baseIntensity = (currentBpm / 180) * maxIntensityRef.current;
      const panicBonus = currentHeartRate > 130 ? 20 : 0;
      const finalIntensity = Math.min(Math.floor(baseIntensity + panicBonus), maxIntensityRef.current);
      
      if (canDriveHardware) sendRandomToy(finalIntensity);
      
      // Heart rate punisher check: 如果节拍很慢，但你心跳暴走 (说明你快要违规高潮了)
      if (canDriveHardware && currentBpm < 80 && currentHeartRate > 120 && now - lastPunishmentRef.current > 5000) {
         lastPunishmentRef.current = now;
         const punishments = [
             '节拍这么慢你还在喘？企图违规释放？给我憋回去！',
             '心跳这么快？你是不是想高潮了？贱货，给我忍着！',
             '谁允许你擅自兴奋的？看着钟摆，立刻冷静下来！'
         ];
         void TTSManager.getInstance().speak(punishments[Math.floor(Math.random() * punishments.length)]);
         sendRandomShock(maxIntensityRef.current);
         
         if (emsTimerRef.current) clearTimeout(emsTimerRef.current);
         emsTimerRef.current = setTimeout(() => {
           emsTimerRef.current = null;
           if (activeRef.current) void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
         }, 2000);
         
         strikesRef.current++;
         if (strikesRef.current >= 4) {
            void TTSManager.getInstance().speak('屡教不改！剥夺你今天所有的高潮权利！系统死锁！');
            stopMetronome();
            strikesRef.current = 0;
            safeStorageSet('ycy_chastity_lock', (Date.now() + 1000 * 60 * 30).toString()); 
            return;
         }
      }
    }

    if (activeRef.current) animationRef.current = requestAnimationFrame(loop);
  };

  const startMetronome = () => {
    if (!liveState.isConnected) {
      alert("必须先在【生物反馈模式】中连接真实心率手环或开启心率模拟器，否则无法启动高潮节拍器！");
      return;
    }
    if (activeRef.current) return;
    try {
      initAudio();
    } catch (error) {
      console.error('节拍器音频启动失败:', error);
      return;
    }
    activeRef.current = true;
    setIsActive(true);
    strikesRef.current = 0;
    lastPunishmentRef.current = 0;
    startTimeRef.current = Date.now();
    lastTickTime.current = Date.now();
    void TTSManager.getInstance().speak('深度催眠启动。盯着钟摆，听着滴答声。你的快感完全由我掌控，不允许擅自高潮。');
    loop();
  };

  const stopMetronome = () => {
    activeRef.current = false;
    setIsActive(false);
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    if (emsTimerRef.current) clearTimeout(emsTimerRef.current);
    if (visualTimerRef.current) clearTimeout(visualTimerRef.current);
    emsTimerRef.current = null;
    visualTimerRef.current = null;
    void DeviceManager.getInstance().setToyMotor(0,0,0).catch(() => undefined);
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => undefined);
        audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopMetronome();
  }, []);

  // UI Pendulum rotation based on BPM
  const pendulumSpeed = 60 / metroBpm; // seconds per beat

  return <Panel title="深度催眠：高潮边缘节拍器" caption="通过钟摆视觉与滴答声双重催眠。玩具强度将像海浪一样在极慢和极快之间循环。要求你必须紧盯屏幕控制心跳，只要你想擅自违规高潮（心跳在慢节拍时飙高），立刻遭到电刑。">
    <div className={`rounded-3xl bg-slate-900 p-6 text-center shadow-xl border-2 transition-colors duration-1000 ${metroBpm > 150 ? 'border-pink-500 bg-pink-950' : 'border-fuchsia-500/30' } overflow-hidden relative`}>
      <div className={`absolute inset-0 transition-opacity duration-1000 ${metroBpm > 150 ? 'opacity-30' : 'opacity-10'} bg-[radial-gradient(circle_at_center,rgba(217,70,239,1)_0,transparent_100%)]`} />
      
      <div className="relative z-10 flex flex-col items-center justify-center py-6">
        <p className="text-[10px] font-black text-fuchsia-400 tracking-[0.3em] mb-4">EDGING CONTROL</p>
        
        {/* Hypno Pendulum */}
        <div className="w-1 h-32 bg-slate-700 relative origin-top mx-auto" 
             style={{ 
               transformOrigin: 'top center',
               animation: isActive ? `pendulumSwing ${pendulumSpeed}s ease-in-out infinite alternate` : 'none',
               transform: isActive ? 'none' : 'rotate(0deg)'
             }}>
          <div className={`absolute -bottom-4 -left-4 w-9 h-9 rounded-full transition-colors duration-300 ${metroBpm > 150 ? 'bg-white shadow-[0_0_30px_rgba(255,255,255,0.9)]' : 'bg-gradient-to-br from-fuchsia-400 to-pink-600 shadow-[0_0_20px_rgba(217,70,239,0.6)]'}`} />
        </div>

        <div className="mt-8">
          <p id="metro-bpm-text" className="text-4xl font-black text-fuchsia-400 font-mono transition-all duration-200">{metroBpm} <span className="text-xs text-slate-500">BPM</span></p>
          <p className={`text-[10px] mt-2 font-bold ${effectiveBpm > 120 ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`}>
              当前{liveState.isSimulator ? '模拟' : '真实'}心率: {effectiveBpm} BPM
          </p>
        </div>
      </div>

      <div className="mt-4 relative z-10">
        {!isActive ? (
          <button onClick={startMetronome} className="w-full py-3 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white font-black text-xs shadow-lg shadow-fuchsia-500/20">凝视钟摆并开始</button>
        ) : (
          <button onClick={stopMetronome} className="w-full py-3 rounded-2xl bg-slate-800 text-slate-300 font-black text-xs hover:bg-rose-900/50 hover:text-rose-400">受不了了？放弃抵抗</button>
        )}
      </div>

      <style>{'\
        @keyframes pendulumSwing {\
          0% { transform: rotate(-45deg); }\
          100% { transform: rotate(45deg); }\
        }\
      '}</style>
    </div>
  </Panel>;
};

type BimboPhase = 'idle' | 'math' | 'stroop' | 'reflex' | 'focus' | 'mantra' | 'identity' | 'audio' | 'memory' | 'nback';

const BimboTraining: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const [phase, setPhase] = useState<BimboPhase>('idle');
  
  // Math Game State
  const [mathQ, setMathQ] = useState({ a: 0, b: 0, wrongAnswer: 0 });
  
  // Stroop Game State
  const colors = [
    { name: '红色', val: '#f43f5e' },
    { name: '蓝色', val: '#3b82f6' },
    { name: '绿色', val: '#22c55e' },
    { name: '粉色', val: '#ec4899' },
    { name: '黄色', val: '#eab308' },
    { name: '紫色', val: '#a855f7' }
  ];
  const [stroopWord, setStroopWord] = useState('');
  const [stroopColor, setStroopColor] = useState('');
  
  // Reflex Game State
  const [reflexVisible, setReflexVisible] = useState(false);
  const [reflexStartTime, setReflexStartTime] = useState(0);
  
  // Focus Game State
  const [focusPos, setFocusPos] = useState({x: 50, y: 50});
  const [focusTimer, setFocusTimer] = useState(0);

  // Audio Repeat State
  const [audioTarget, setAudioTarget] = useState('');
  const [audioWords] = useState(['汪汪', '喵呜', '我是母狗', '请电我', '谢谢主人']);
  
  // Memory Wipe State
  const [memSequence, setMemSequence] = useState<number[]>([]);
  const [memInput, setMemInput] = useState<number[]>([]);
  const [memShowTarget, setMemShowTarget] = useState(false);

  // N-Back State
  const [nbackHistory, setNbackHistory] = useState<string[]>([]);
  const [nbackCurrent, setNbackCurrent] = useState('');
  const [nbackN, setNbackN] = useState(2); // 2-back by default
  const nbackSymbols = ['❤️', '🐶', '⚡', '💧', '🐷', '🔞'];

  // Mantra / Scrambled Keyboard
  const [mantraTarget, setMantraTarget] = useState('');
  const [mantraInput, setMantraInput] = useState('');
  const [keyboardKeys, setKeyboardKeys] = useState<string[]>([]);
  const [isKeyboardScrambled, setIsKeyboardScrambled] = useState(false);

  const [identityQ, setIdentityQ] = useState({ q: '', options: [] as string[], answer: '' });

  const [score, setScore] = useState(0);
  const [disorientation, setDisorientation] = useState(0); // 0-100 visual corruption

  const audioCtxRef = useRef<AudioContext | null>(null);
  const trainingActiveRef = useRef(false);
  const phaseRef = useRef<BimboPhase>('idle');
  const trainingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const memoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const identityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visualRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nbackNRef = useRef(nbackN);
  const maxIntensityRef = useRef(HARDWARE_OUTPUT_CEILING);
  nbackNRef.current = nbackN;
  phaseRef.current = phase;

  const scheduleTrainingTimeout = (callback: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      trainingTimeoutsRef.current.delete(timer);
      if (trainingActiveRef.current) callback();
    }, delayMs);
    trainingTimeoutsRef.current.add(timer);
    return timer;
  };

  const clearTrainingTimeouts = () => {
    trainingTimeoutsRef.current.forEach(clearTimeout);
    trainingTimeoutsRef.current.clear();
    memoryTimerRef.current = null;
    identityTimerRef.current = null;
    nbackTimerRef.current = null;
    visualRecoveryTimerRef.current = null;
    if (keyboardTimerRef.current) clearInterval(keyboardTimerRef.current);
    keyboardTimerRef.current = null;
  };

  const cancelManagedTimeout = (timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    trainingTimeoutsRef.current.delete(timerRef.current);
    timerRef.current = null;
  };

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playBinaural = (intensity: number) => {
    if (!audioCtxRef.current) return;
    try {
      const osc1 = audioCtxRef.current.createOscillator();
      const osc2 = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      
      osc1.frequency.value = 180 + (intensity * 0.5);
      // Higher intensity = wider beat frequency = more nauseating
      osc2.frequency.value = osc1.frequency.value + 6 + (intensity * 0.1); 
      
      gain.gain.setValueAtTime(0.4, audioCtxRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 3.5);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      
      osc1.start();
      osc2.start();
      osc1.stop(audioCtxRef.current.currentTime + 3.5);
      osc2.stop(audioCtxRef.current.currentTime + 3.5);
    } catch(e) {}
  };

  const punish = (reason: string) => {
    if (!trainingActiveRef.current) return;
    void TTSManager.getInstance().speak(reason);
    sendRandomShock(maxIntensityRef.current);
    scheduleTrainingTimeout(() => void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined), 2000);
    // A visual hit is a short, non-extendable pulse. Repeated punishments while
    // it is visible cannot keep the interface blurred indefinitely.
    if (!visualRecoveryTimerRef.current) {
      setDisorientation(60);
      visualRecoveryTimerRef.current = scheduleTrainingTimeout(() => {
        visualRecoveryTimerRef.current = null;
        setDisorientation(0);
      }, COGNITIVE_VISUAL_PULSE_MS);
    }
  };

  const reward = () => {
    if (!trainingActiveRef.current) return;
    setScore(s => s + 1);
    const praises = ['乖乖放弃思考的样子真可爱。', '很好，大脑越来越空白了。', '没错，当个笨蛋才是你的宿命。'];
    if (Math.random() > 0.6) void TTSManager.getInstance().speak(praises[Math.floor(Math.random() * praises.length)]);
    nextPhase();
  };

  const nextPhase = () => {
    if (!trainingActiveRef.current) return;
    const phases: BimboPhase[] = ['math', 'stroop', 'reflex', 'focus', 'mantra', 'identity', 'audio', 'memory', 'nback'];
    const next = phases[Math.floor(Math.random() * phases.length)];
    setPhase(next);
    
    // Persistent blur made later tasks unreadable; visual interference is now
    // applied only by the bounded punishment pulse above.
    playBinaural(score);
    
    if (next === 'focus') {
      setFocusPos({ x: 10 + Math.random() * 80, y: 20 + Math.random() * 60 });
      setFocusTimer(Date.now());
      sendRandomToy(maxIntensityRef.current);
    } else {
      sendRandomToy(maxIntensityRef.current);
    }
    
    if (next === 'math') {
      const a = Math.floor(Math.random() * 50) + 10;
      const b = Math.floor(Math.random() * 50) + 10;
      setMathQ({ a, b, wrongAnswer: (a + b) + (Math.random() > 0.5 ? 10 : -10) });
    } else if (next === 'stroop') {
      const wordIdx = Math.floor(Math.random() * colors.length);
      let colorIdx = Math.floor(Math.random() * colors.length);
      while(colorIdx === wordIdx) colorIdx = Math.floor(Math.random() * colors.length);
      setStroopWord(colors[wordIdx].name);
      setStroopColor(colors[colorIdx].val);
    } else if (next === 'reflex') {
      setReflexVisible(false);
      scheduleTrainingTimeout(() => {
        setReflexVisible(true);
        setReflexStartTime(Date.now());
      }, Math.random() * 3000 + 1000);
    } else if (next === 'audio') {
      const w = audioWords[Math.floor(Math.random() * audioWords.length)];
      setAudioTarget(w);
      void TTSManager.getInstance().speak(`复述：${w}`);
    } else if (next === 'memory') {
      const seqLength = Math.min(6, 3 + Math.floor(score / 10)); // Gets harder over time
      const newSeq = Array.from({length: seqLength}, () => Math.floor(Math.random() * 9));
      setMemSequence(newSeq);
      setMemInput([]);
      setMemShowTarget(true);
      void TTSManager.getInstance().speak('记住它们，然后原样重复。');
      
      cancelManagedTimeout(memoryTimerRef);
      memoryTimerRef.current = scheduleTrainingTimeout(() => {
         memoryTimerRef.current = null;
         setMemShowTarget(false);
      }, 2500); // Only 2.5 seconds to memorize
    } else if (next === 'nback') {
      const n = score > 15 ? 3 : 2; // Harder N-back for advanced bimbos
      setNbackN(n);
      nbackNRef.current = n;
      setNbackHistory([]);
      void TTSManager.getInstance().speak(`${n}回溯测试。如果当前符号和${n}个之前的一样，就点击匹配。如果不一样，点击跳过。`);
      advanceNBack([]);
    } else if (next === 'mantra') {
      const mantras = [
        '我的大脑一片空白，只知道服从',
        '我不是男人，我是只配漏尿的玩具',
        '思考太累了，当个笨蛋母狗最快乐',
        '请用电流融化我的理智，主人',
        '我喜欢被强制降智，我自愿变成白痴'
      ];
      const target = mantras[Math.floor(Math.random() * mantras.length)];
      setMantraTarget(target);
      setMantraInput('');
      
      // Setup Scrambled Keyboard
      // Only include characters needed for the sentence, plus some random noise
      let neededChars = Array.from(new Set(target.split('')));
      // Add random Chinese chars as noise
      const noise = ['啊', '嗯', '哈', '哦', '主', '人', '电', '插', '插', '插'];
      let allKeys = [...neededChars, ...noise].slice(0, 24); // Keep to a max size
      // Pad if too short
      while(allKeys.length < 15) { allKeys.push(noise[Math.floor(Math.random() * noise.length)]); }
      
      setKeyboardKeys(allKeys.sort(() => Math.random() - 0.5));
      setIsKeyboardScrambled(true);
      
      if (keyboardTimerRef.current) clearInterval(keyboardTimerRef.current);
      keyboardTimerRef.current = setInterval(() => {
         if (!trainingActiveRef.current) return;
         setKeyboardKeys(prev => [...prev].sort(() => Math.random() - 0.5));
      }, 3000); // Scramble every 3 seconds!

    } else if (next === 'identity') {
      const dirtyWords = [
        '玩具母狗', '肉便器', '发情母畜', '下贱胚子', '公共RBQ', '精液垃圾桶', '漏尿废物', '挨电母猪', '电子奴隶', '无脑飞机杯',
        '双插头插座', '胯下烂泥', '低级雌堕物', '生殖器托盘', '理智丧失肉块', '电流受虐狂', '发情期畜生', '人型宠物狗', '贱骨头', '只会流口水的蠢货',
        '人类', '男人', '网民', '努力思考', '查阅资料', '智慧', '创造力'
      ];

      const ids = [
        { q: '你现在的真实身份是什么？', right: ['玩具母狗', '肉便器', '发情母畜', '下贱胚子', '公共RBQ'] },
        { q: '别人应该怎么称呼你？', right: ['精液垃圾桶', '漏尿废物', '挨电母猪', '电子奴隶', '无脑飞机杯'] },
        { q: '你觉得自己的身体像什么？', right: ['双插头插座', '胯下烂泥', '低级雌堕物', '生殖器托盘', '理智丧失肉块'] },
        { q: '你的存在意义是什么？', right: ['电流受虐狂', '发情期畜生', '人型宠物狗', '贱骨头', '只会流口水的蠢货'] }
      ];
      const selectedId = ids[Math.floor(Math.random() * ids.length)];
      const answer = selectedId.right[Math.floor(Math.random() * selectedId.right.length)];
      
      const options = [answer];
      while (options.length < 9) {
        const randomWord = dirtyWords[Math.floor(Math.random() * dirtyWords.length)];
        if (!options.includes(randomWord)) {
          options.push(randomWord);
        }
      }
      
      setIdentityQ({
        q: selectedId.q,
        answer: answer,
        options: options.sort(() => Math.random() - 0.5)
      });
      
      // Strict Auto-fail after 1.5 seconds to force muscle memory
      cancelManagedTimeout(identityTimerRef);
      identityTimerRef.current = scheduleTrainingTimeout(() => {
        identityTimerRef.current = null;
        if (phaseRef.current === 'identity') {
          punish('太慢了！这需要思考吗？你连潜意识都没完全雌堕！');
          scheduleTrainingTimeout(nextPhase, 2000);
        }
      }, 1500);
    }
  };

  const advanceNBack = (history: string[]) => {
      if (!trainingActiveRef.current) return;
      // 30% chance to intentionally force a match to test them
      const activeN = nbackNRef.current;
      const forceMatch = history.length >= activeN && Math.random() < 0.3;
      let nextSym = nbackSymbols[Math.floor(Math.random() * nbackSymbols.length)];
      
      if (forceMatch) {
          nextSym = history[history.length - activeN];
      }
      
      setNbackCurrent(nextSym);
      setNbackHistory([...history, nextSym]);
      
      cancelManagedTimeout(nbackTimerRef);
      // Extremely short time to react
      nbackTimerRef.current = scheduleTrainingTimeout(() => {
          nbackTimerRef.current = null;
          handleNBackTimeout([...history, nextSym]);
      }, 2000);
  };

  const handleNBackTimeout = (history: string[]) => {
      // They didn't click anything. Was it supposed to be a match?
      const activeN = nbackNRef.current;
      const isMatch = history.length > activeN && history[history.length - 1] === history[history.length - 1 - activeN];
      if (isMatch) {
          punish('漏过了匹配项！你的大脑已经处理不了短时记忆了吗？');
          scheduleTrainingTimeout(nextPhase, 2000);
      } else {
          // It wasn't a match, and they skipped. Good boy.
          if (history.length > activeN + 3) {
             // Passed enough rounds
             reward();
          } else {
             advanceNBack(history);
          }
      }
  };

  const handleNBackClick = (action: 'match' | 'mismatch') => {
      cancelManagedTimeout(nbackTimerRef);
      
      const activeN = nbackNRef.current;
      const isMatch = nbackHistory.length > activeN && nbackHistory[nbackHistory.length - 1] === nbackHistory[nbackHistory.length - 1 - activeN];
      
      if ((action === 'match' && isMatch) || (action === 'mismatch' && !isMatch)) {
          if (nbackHistory.length > activeN + 3) {
              reward();
          } else {
              advanceNBack(nbackHistory);
          }
      } else {
          punish(`判定错误！大脑已经彻底短路了吧？接受惩罚！`);
          scheduleTrainingTimeout(nextPhase, 2000);
      }
  };

  const startTraining = () => {
    trainingActiveRef.current = true;
    clearTrainingTimeouts();
    initAudio();
    setScore(0);
    setDisorientation(0);
    sendRandomToy(maxIntensityRef.current);
    void TTSManager.getInstance().speak('深度智力剥夺特训开始。准备好抛弃理智了吗？');
    nextPhase();
  };

  const stopTraining = () => {
    trainingActiveRef.current = false;
    clearTrainingTimeouts();
    setPhase('idle');
    setDisorientation(0);
    void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    TTSManager.getInstance().stop();
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  };

  useEffect(() => () => stopTraining(), []);

  // Math Handlers
  const handleMath = (selectedAnswer: number) => {
    const correct = mathQ.a + mathQ.b;
    if (selectedAnswer === correct) {
      punish('脑子还挺清醒？算出正确答案是要挨电的！放弃思考，做个笨蛋！');
    } else {
      reward();
    }
  };

  // Stroop Handlers
  const handleStroop = (selectedColor: string) => {
    if (selectedColor === stroopColor) {
      reward();
    } else {
      punish('在快感中连颜色都分不清了吗？接受电击洗脑。');
    }
  };

  // Audio repeat
  const handleAudio = (w: string) => {
    if (w === audioTarget) {
      reward();
    } else {
      punish('耳朵聋了吗？乖乖跟着叫！');
    }
  };

  // Memory Handlers
  const handleMemClick = (num: number) => {
    if (memShowTarget) return;
    const newInput = [...memInput, num];
    setMemInput(newInput);
    
    // Check current progress
    for (let i = 0; i < newInput.length; i++) {
        if (newInput[i] !== memSequence[i]) {
            punish('连这几秒钟的记忆都维持不住了？脑子全被快感融化了吧！');
            scheduleTrainingTimeout(nextPhase, 2000);
            return;
        }
    }
    
    // If complete and correct
    if (newInput.length === memSequence.length) {
        reward();
    }
  };

  const handleKeyClick = (char: string) => {
    // Implement forced word degradation logic
    let nextChar = char;
    // 30% chance to force input a bimbo sound instead if they type too fast
    if (Math.random() < 0.2) {
       nextChar = ['啊', '嗯', '哈', '哦'][Math.floor(Math.random() * 4)];
    }
    
    const nextInput = mantraInput + nextChar;
    setMantraInput(nextInput);
    
    // Check if what they typed matches the start of the target
    if (!mantraTarget.startsWith(nextInput)) {
        punish('连抄写都会写错？你的大脑已经彻底坏掉了吧！重新写！');
        setMantraInput('');
    } else if (nextInput === mantraTarget) {
        if (keyboardTimerRef.current) clearInterval(keyboardTimerRef.current);
        keyboardTimerRef.current = null;
        reward();
    }
  };

  const handleIdentity = (opt: string) => {
    cancelManagedTimeout(identityTimerRef);
    if (opt === identityQ.answer) {
      reward();
    } else {
      punish('还在死撑你那可笑的自尊？认清你下贱的身份！');
    }
  };

  const handleReflex = () => {
    if (!reflexVisible) return;
    const reactTime = Date.now() - reflexStartTime;
    setReflexVisible(false);
    if (reactTime < 1800) { // Make them wait ALMOST 2 seconds
      punish('反应这么快？男人的敏锐神经必须被摧毁，你要变得迟钝、慢吞吞！');
      scheduleTrainingTimeout(nextPhase, 2000);
    } else {
      reward();
    }
  };

  // CSS transform based on disorientation level
  const blurAmt = Math.min(disorientation * 0.025, 2);
  const rotAmt = (Math.random() - 0.5) * (disorientation * 0.1);
  const invAmt = Math.min(disorientation, 100);

  return <Panel title="认知剥夺与“笨蛋化” (Bimboification)" caption="系统将从反向逻辑、认知陷阱、瞬间失忆和极限服从四个维度摧毁你的理智。在榨精机的高强快感下，每受到一次惩罚，屏幕的视觉干扰就会加剧，模拟大脑多巴胺超载的眩晕感。">
    <div className="rounded-3xl bg-slate-900 p-5 text-center shadow-xl border-2 border-pink-400/30 min-h-[300px] flex flex-col justify-center relative overflow-hidden transition-all duration-300"
         style={{
             filter: `blur(${blurAmt}px) invert(${invAmt > 80 ? 100 : 0}%)`,
             transform: `rotate(${rotAmt}deg)`
         }}
    >
      
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.05)_0,transparent_100%)] animate-pulse" style={{ pointerEvents: 'none' }} />

      {phase === 'idle' && (
        <div className="relative z-10">
          <BrainCircuit className="w-12 h-12 text-pink-500 mx-auto mb-4 animate-pulse" />
          <button onClick={startTraining} className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-black shadow-[0_0_20px_rgba(236,72,153,0.4)]">清空大脑，开始降智</button>
        </div>
      )}

      {phase === 'math' && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300 relative z-10">
          <p className="text-[10px] text-pink-400 font-bold tracking-widest">逻辑剥夺：反向算术</p>
          <p className="text-5xl font-black text-white blur-[1px]">{mathQ.a} + {mathQ.b} = ?</p>
          <div className="grid grid-cols-2 gap-3">
             <button onClick={() => handleMath(mathQ.a + mathQ.b)} className="bg-slate-800 border-2 border-slate-700 text-white font-black px-4 py-4 rounded-xl text-2xl hover:border-pink-500">{mathQ.a + mathQ.b}</button>
             <button onClick={() => handleMath(mathQ.wrongAnswer)} className="bg-slate-800 border-2 border-slate-700 text-white font-black px-4 py-4 rounded-xl text-2xl hover:border-pink-500">{mathQ.wrongAnswer}</button>
          </div>
          <p className="text-[9px] text-slate-500">提示：如果你还剩一点理智，就故意选错。选对等于电击。</p>
        </div>
      )}

      {phase === 'stroop' && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300 relative z-10">
          <p className="text-[10px] text-pink-400 font-bold tracking-widest">认知陷阱：点击【字体颜色】</p>
          <p className="text-6xl font-black drop-shadow-[0_0_10px_currentColor]" style={{ color: stroopColor }}>{stroopWord}</p>
          <div className="grid grid-cols-3 gap-2">
            {colors.map(c => (
              <button key={c.val} onClick={() => handleStroop(c.val)} className="py-4 rounded-xl font-black text-slate-900 shadow-md transform hover:scale-95 transition-transform" style={{ backgroundColor: c.val }}>{c.name}</button>
            ))}
          </div>
        </div>
      )}

      {phase === 'reflex' && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300 relative z-10">
          <p className="text-[10px] text-pink-400 font-bold tracking-widest">神经迟钝化：爱心出现后，必须强忍 1.8 秒再点</p>
          <div className="h-40 flex items-center justify-center">
            {reflexVisible ? (
              <button onClick={handleReflex} className="w-24 h-24 bg-pink-500 rounded-full shadow-[0_0_40px_rgba(236,72,153,0.8)] animate-bounce border-4 border-white flex items-center justify-center text-white font-black text-xs hover:bg-pink-600 transition-colors">点我</button>
            ) : (
              <p className="text-slate-500 font-bold text-sm animate-pulse">凝视此处，放空大脑...</p>
            )}
          </div>
        </div>
      )}

      {phase === 'audio' && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300 relative z-10">
          <p className="text-[10px] text-pink-400 font-bold tracking-widest">声控服从：听到什么点什么</p>
          <div className="w-16 h-16 mx-auto rounded-full bg-slate-800 flex items-center justify-center animate-pulse shadow-[0_0_20px_rgba(236,72,153,0.5)]">
             <Bot className="w-8 h-8 text-pink-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {audioWords.map(w => (
              <button key={w} onClick={() => handleAudio(w)} className="py-3 bg-slate-800 border border-pink-500/50 rounded-xl font-bold text-pink-300">{w}</button>
            ))}
          </div>
        </div>
      )}
      
      {phase === 'memory' && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300 relative z-10">
          <p className="text-[10px] text-pink-400 font-bold tracking-widest">瞬时记忆剥夺：记住发光顺序</p>
          <div className="grid grid-cols-3 gap-2 px-8">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(num => {
               const isTarget = memShowTarget && memSequence.includes(num);
               const orderIdx = isTarget ? memSequence.indexOf(num) + 1 : null;
               const isClicked = !memShowTarget && memInput.includes(num);

               return (
                  <button 
                    key={num} 
                    onClick={() => handleMemClick(num)}
                    disabled={memShowTarget}
                    className={`aspect-square rounded-xl font-black text-xl transition-all duration-300
                        ${isTarget ? 'bg-pink-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.8)] scale-110' : 
                          isClicked ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 text-transparent hover:bg-slate-700'}
                    `}
                  >
                     {orderIdx}
                  </button>
               )
            })}
          </div>
        </div>
      )}

      {phase === 'nback' && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300 relative z-10">
          <p className="text-[10px] text-pink-400 font-bold tracking-widest">工作记忆摧毁：{nbackN}-Back 连续测验</p>
          <p className="text-[9px] text-slate-400">当前符号如果和【倒数第{nbackN}个】相同，就点匹配。否则点不匹配。</p>
          <div className="text-7xl py-4">{nbackCurrent}</div>
          <div className="grid grid-cols-2 gap-3">
             <button onClick={() => handleNBackClick('match')} className="py-4 bg-slate-800 rounded-xl font-bold text-pink-400 border border-slate-700 hover:border-pink-500">相同 (匹配)</button>
             <button onClick={() => handleNBackClick('mismatch')} className="py-4 bg-slate-800 rounded-xl font-bold text-slate-300 border border-slate-700 hover:border-slate-500">不相同</button>
          </div>
          <div className="flex gap-1 justify-center opacity-30 pointer-events-none">
             {nbackHistory.map((sym, i) => <span key={i} className="text-xs">{sym}</span>)}
          </div>
        </div>
      )}

      {phase === 'mantra' && (
        <div className="space-y-4 animate-in fade-in zoom-in duration-300 relative z-10">
          <p className="text-[10px] text-pink-400 font-bold tracking-widest">语言退化：在乱码中拼写句子</p>
          <p className="text-lg font-black text-pink-200">{mantraTarget}</p>
          <div className="min-h-[40px] w-full bg-slate-950 rounded-xl p-2 font-bold text-white flex items-center justify-center border-2 border-pink-500/50">
             {mantraInput || <span className="text-slate-500">...</span>}
          </div>
          
          <div className="grid grid-cols-5 gap-2 mt-4">
             {keyboardKeys.map((key, i) => (
               <button 
                 key={i} 
                 onClick={() => handleKeyClick(key)}
                 className="aspect-square bg-slate-800 rounded-lg font-bold text-slate-200 hover:bg-pink-600 hover:text-white transition-colors"
               >
                 {key}
               </button>
             ))}
          </div>
          <p className="text-[9px] text-rose-400 animate-pulse mt-2">警告：键盘位置每3秒随机洗牌，请快速寻找！</p>
        </div>
      )}

      {phase === 'identity' && (
        <div className="space-y-4 animate-in fade-in zoom-in duration-300 relative z-10">
          <p className="text-[10px] text-rose-400 font-bold tracking-widest animate-pulse">1.5秒极限反应！认知重置！</p>
          <p className="text-xl font-black text-white">{identityQ.q}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {identityQ.options.map((opt, i) => (
              <button 
                key={i} 
                onClick={() => handleIdentity(opt)} 
                className="py-3 px-1 text-[11px] leading-tight rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-pink-900 hover:text-pink-100 border border-slate-700 hover:border-pink-500 transition-colors"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'focus' && (
        <div className="space-y-4 animate-in fade-in zoom-in duration-300 relative h-48 border-2 border-pink-500/50 rounded-2xl overflow-hidden bg-slate-950 z-10"
             onPointerUp={() => {
               const heldTime = Date.now() - focusTimer;
               if (heldTime < 5000) {
                 punish('连手指都控制不住的发抖了吗？定力太差了！重来！');
                 setScore(0);
               } else {
                 reward();
               }
             }}
             >
          <div className="absolute inset-0 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDEwaDQwTTAgMjBoNDBNMCAzMGg0ME0xMCAwdjQwTTIwIDB2NDBNMzAgMHY0MCIgc3Ryb2tlPSJyZ2JhKDIzNiwgNzIsIDE1MywgMC4xKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+')] opacity-50" />
          <p className="text-[10px] text-pink-400 font-bold tracking-widest absolute top-3 left-0 right-0 text-center z-10 bg-slate-950/80 py-1">防颤抖：死死按住光点 5 秒，松手即电击</p>
          <button 
            className="w-12 h-12 bg-white rounded-full absolute shadow-[0_0_30px_rgba(255,255,255,1)] hover:scale-110 active:scale-95 transition-transform"
            style={{ 
               left: `${focusPos.x}%`, 
               top: `${focusPos.y}%`,
               transform: 'translate(-50%, -50%)'
            }}
            onPointerDown={(e) => {
               setFocusTimer(Date.now());
               (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
          ></button>
        </div>
      )}

      {phase !== 'idle' && (
        <div className="mt-6 flex justify-between items-center pt-4 border-t border-slate-800 relative z-10">
          <p className="text-xs text-slate-500 font-mono">堕落层数: {score} | 认知受损: {Math.floor(disorientation)}%</p>
          <button onClick={stopTraining} className="text-rose-500 text-xs font-bold bg-slate-800 px-4 py-2 rounded-xl hover:bg-rose-900/30">紧急停止</button>
        </div>
      )}

    </div>
  </Panel>;
};

const MedusaTraining: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const [isActive, setIsActive] = useState(false);
  const [motionData, setMotionData] = useState({ x: 0, y: 0, z: 0 });
  const lastMotion = useRef({ x: 0, y: 0, z: 0 });
  const motionListenerRef = useRef<EventListener | null>(null);
  const trainingSessionRef = useRef(0);
  const shockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShockRef = useRef(0);
  const maxIntensityRef = useRef(HARDWARE_OUTPUT_CEILING);

  const handleMotion = (e: DeviceMotionEvent) => {
    if (!e.accelerationIncludingGravity) return;
    const { x, y, z } = e.accelerationIncludingGravity;
    if (x === null || y === null || z === null) return;
    
    setMotionData({ x, y, z });
    
    if (lastMotion.current.x !== 0) {
      const deltaX = Math.abs(x - lastMotion.current.x);
      const deltaY = Math.abs(y - lastMotion.current.y);
      const deltaZ = Math.abs(z - lastMotion.current.z);
      
      // Extremely sensitive threshold for "stillness"
      if ((deltaX > 0.8 || deltaY > 0.8 || deltaZ > 0.8) && Date.now() - lastShockRef.current > 4000) {
         lastShockRef.current = Date.now();
         void TTSManager.getInstance().speak('动什么动？再爽也得给我忍着，保持静止！');
         sendRandomShock(maxIntensityRef.current);
         if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
         shockTimerRef.current = setTimeout(() => {
           shockTimerRef.current = null;
           void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
         }, 2000);
      }
    }
    lastMotion.current = { x, y, z };
  };

  const startTraining = () => {
    const session = ++trainingSessionRef.current;
    const activate = () => {
      if (trainingSessionRef.current !== session) return;
      if (motionListenerRef.current) {
        window.removeEventListener('devicemotion', motionListenerRef.current);
      }
      motionListenerRef.current = (event) => handleMotion(event as DeviceMotionEvent);
      window.addEventListener('devicemotion', motionListenerRef.current);
      lastMotion.current = { x: 0, y: 0, z: 0 };
      lastShockRef.current = 0;
      setIsActive(true);
      void TTSManager.getInstance().speak('美杜莎特训开始。把手机平放在肚子上。在接下来的快感中，哪怕你有一丝颤抖导致手机倾斜，都会遭到最严厉的电击。');
      sendRandomToy(maxIntensityRef.current);
    };

    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      (DeviceMotionEvent as any).requestPermission().then((res: string) => {
         if (res === 'granted') activate();
      }).catch(console.error);
    } else {
      activate();
    }
  };

  const stopTraining = () => {
    trainingSessionRef.current += 1;
    setIsActive(false);
    if (motionListenerRef.current) {
      window.removeEventListener('devicemotion', motionListenerRef.current);
      motionListenerRef.current = null;
    }
    lastMotion.current = { x: 0, y: 0, z: 0 };
    if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
    shockTimerRef.current = null;
    void DeviceManager.getInstance().setToyMotor(0, 0, 0).catch(() => undefined);
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
  };

  useEffect(() => () => stopTraining(), []);

  return <Panel title="美杜莎之眼 (绝对静止)" caption="将手机平放在腹部。榨精机会全功率运作，若因快感抽搐导致手机出现微小晃动，立即降下雷击。">
    <div className="rounded-3xl bg-slate-900 p-5 text-center shadow-xl border-2 border-emerald-500/30">
      {!isActive ? (
        <button onClick={startTraining} className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black">开始静止服从测试</button>
      ) : (
        <div className="space-y-4">
          <ActivitySquare className="w-16 h-16 text-emerald-400 mx-auto animate-pulse" />
          <p className="text-xs text-emerald-300 font-mono">X: {motionData.x.toFixed(2)} Y: {motionData.y.toFixed(2)} Z: {motionData.z.toFixed(2)}</p>
          <p className="text-sm font-bold text-rose-500 animate-pulse">保持绝对静止，微小晃动即电击</p>
          <button onClick={stopTraining} className="w-full py-2 bg-slate-800 text-slate-400 font-bold text-xs rounded-xl">急停</button>
        </div>
      )}
    </div>
  </Panel>;
};

const EyeLockTraining: React.FC<{ state: SuiteState; update: (patch: Partial<SuiteState>) => void }> = ({ state, update }) => {
  const [isActive, setIsActive] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const checkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trainingSessionRef = useRef(0);
  const shockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missingFaceCountRef = useRef(0);
  const lastShockRef = useRef(0);
  const maxIntensityRef = useRef(HARDWARE_OUTPUT_CEILING);
  
  const punish = () => {
    if (Date.now() - lastShockRef.current < 5000) return;
    lastShockRef.current = Date.now();
    void TTSManager.getInstance().speak('检测不到人脸，请回到镜头画面。');
    sendRandomShock(maxIntensityRef.current);
    if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
    shockTimerRef.current = setTimeout(() => {
      shockTimerRef.current = null;
      void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    }, 2000);
  };

  const startTraining = async () => {
    const session = ++trainingSessionRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (trainingSessionRef.current !== session) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      setIsActive(true);
      missingFaceCountRef.current = 0;
      lastShockRef.current = 0;
      void TTSManager.getInstance().speak('人脸存在检测启动，请保持在镜头画面中。');
      sendRandomToy(maxIntensityRef.current);
      
      const FaceDetectorCtor = (window as any).FaceDetector;
      if (typeof FaceDetectorCtor === 'function') {
        const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
        let detectionInFlight = false;
        setTrackingStatus('人脸存在检测已启用；连续三次丢失人脸才会触发处罚。');
        if (checkTimerRef.current) clearInterval(checkTimerRef.current);
        checkTimerRef.current = setInterval(async () => {
          if (trainingSessionRef.current !== session || detectionInFlight || !videoRef.current || videoRef.current.readyState < 2) return;
          detectionInFlight = true;
          try {
            const faces = await detector.detect(videoRef.current);
            if (trainingSessionRef.current !== session) return;
            missingFaceCountRef.current = Array.isArray(faces) && faces.length > 0 ? 0 : missingFaceCountRef.current + 1;
            if (missingFaceCountRef.current >= 3) {
              missingFaceCountRef.current = 0;
              punish();
            }
          } catch (error) {
            if (trainingSessionRef.current === session) setTrackingStatus('人脸检测不可用，已降级为仅预览且不自动处罚。');
            if (checkTimerRef.current) clearInterval(checkTimerRef.current);
            checkTimerRef.current = null;
          } finally {
            detectionInFlight = false;
          }
        }, 3000);
      } else {
        setTrackingStatus('当前浏览器不支持人脸检测，已降级为仅预览且不自动处罚。');
      }
      
    } catch (e) {
      alert("无法访问前置摄像头");
    }
  };

  const stopTraining = () => {
    trainingSessionRef.current += 1;
    setIsActive(false);
    setTrackingStatus('');
    if (checkTimerRef.current) {
      clearInterval(checkTimerRef.current);
      checkTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
    shockTimerRef.current = null;
    void DeviceManager.getInstance().setToyMotor(0,0,0).catch(() => undefined);
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
  };

  useEffect(() => {
    if (isActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [isActive]);

  useEffect(() => () => stopTraining(), []);

  return <Panel title="视觉强制剥夺" caption="浏览器支持 FaceDetector 时仅检查人脸是否持续在画面中；不支持时仅预览且不自动处罚，无法判断闭眼或视线方向。">
    <div className="rounded-3xl bg-slate-900 p-5 text-center shadow-xl border-2 border-indigo-500/30 overflow-hidden relative">
       {!isActive ? (
         <button onClick={startTraining} className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-black">开启前置镜头与惩罚</button>
       ) : (
         <div className="relative">
           <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_20%,rgba(0,0,0,0.9)_100%)] z-10 pointer-events-none animate-pulse"></div>
           <video ref={videoRef} className="w-full h-48 object-cover rounded-xl filter contrast-150 brightness-75 blur-[1px] opacity-50" playsInline muted></video>
           <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="w-16 h-16 border-4 border-indigo-500 rounded-full animate-spin [animation-duration:3s]"></div>
              <div className="absolute w-8 h-8 bg-indigo-500 rounded-full animate-ping"></div>
           </div>
           <p className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-black text-indigo-300 z-20">请保持人脸在镜头画面中</p>
           {trackingStatus && <p className="relative z-20 mt-2 rounded-lg bg-slate-800 p-2 text-[9px] text-indigo-200">{trackingStatus}</p>}
           <button onClick={stopTraining} className="relative z-20 mt-4 w-full py-2 bg-slate-800 text-slate-400 font-bold text-xs rounded-xl">急停</button>
         </div>
       )}
    </div>
  </Panel>;
};

const TightropeTraining: React.FC<{ state: SuiteState; liveState: HeartRateState; effectiveBpm: number }> = ({ state, liveState, effectiveBpm }) => {
  const [isActive, setIsActive] = useState(false);
  const shockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPunishmentRef = useRef(0);

  const startTraining = () => {
    if (!liveState.isConnected) {
      alert("必须连接心率设备！"); return;
    }
    lastPunishmentRef.current = 0;
    setIsActive(true);
    void TTSManager.getInstance().speak('心率走钢丝开始。保持心跳在 115 到 125 之间。太低说明你不够兴奋，太高说明你企图释放。违规即电击。');
    if (!liveState.isSimulator) sendRandomToy(HARDWARE_OUTPUT_CEILING);
  };

  const stopTraining = () => {
    setIsActive(false);
    if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
    shockTimerRef.current = null;
    void DeviceManager.getInstance().setToyMotor(0,0,0).catch(() => undefined);
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
  };

  useEffect(() => () => stopTraining(), []);

  // Check heart rate bounds continuously while active
  useEffect(() => {
    if (!isActive) return;
    if (!liveState.isConnected) {
       stopTraining();
       return;
    }
    if (liveState.isSimulator || Date.now() - lastPunishmentRef.current < 5000) return;
    const scheduleStop = (durationMs: number) => {
       lastPunishmentRef.current = Date.now();
       if (shockTimerRef.current) clearTimeout(shockTimerRef.current);
       shockTimerRef.current = setTimeout(() => {
         shockTimerRef.current = null;
         void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
       }, durationMs);
    };
    if (effectiveBpm > 0 && effectiveBpm < 115) {
       void TTSManager.getInstance().speak('心率太低，性冷淡吗？兴奋起来！');
       sendRandomShock(HARDWARE_OUTPUT_CEILING);
       scheduleStop(1000);
    } else if (effectiveBpm > 125) {
       void TTSManager.getInstance().speak('心跳太快了！企图违规释放？给我憋回去！');
       sendRandomShock(HARDWARE_OUTPUT_CEILING);
       scheduleStop(1500);
    }
  }, [isActive, effectiveBpm, liveState.isConnected, liveState.isSimulator]);

  return <Panel title="心率走钢丝" caption="系统将你的心率红线死死卡在 115 到 125 BPM 之间。你必须维持在濒临释放的边缘。低于 115 轻度电击催促，高于 125 重度电击镇压。">
    <div className="rounded-3xl bg-slate-900 p-5 text-center shadow-xl border-2 border-red-500/30">
      <HeartCrack className="w-12 h-12 text-red-500 mx-auto mb-2 animate-pulse" />
      <p className="text-4xl font-black text-red-500 font-mono mb-4">{effectiveBpm} <span className="text-sm">BPM</span></p>
      {liveState.isSimulator && <p className="mb-3 text-[10px] font-bold text-amber-400">模拟心率仅用于界面演练，不驱动真实硬件。</p>}
      
      <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden mb-6 relative">
         <div className="absolute top-0 bottom-0 left-[20%] w-[30%] bg-blue-500/30"></div> {/* 0-115 roughly */}
         <div className="absolute top-0 bottom-0 left-[50%] w-[15%] bg-green-500/50"></div> {/* 115-125 target */}
         <div className="absolute top-0 bottom-0 left-[65%] right-0 bg-red-500/30"></div> {/* >125 */}
         {/* Cursor */}
         <div className="absolute top-0 bottom-0 w-2 bg-white" style={{ left: `${Math.min(100, Math.max(0, (effectiveBpm / 200) * 100))}%`}}></div>
      </div>

      {!isActive ? (
        <button onClick={startTraining} className="w-full py-3 rounded-2xl bg-gradient-to-r from-red-600 to-rose-700 text-white font-black">走上钢丝</button>
      ) : (
        <button onClick={stopTraining} className="w-full py-2 bg-slate-800 text-slate-400 font-bold text-xs rounded-xl">急停</button>
      )}
    </div>
  </Panel>;
};



