import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { DeviceManager } from '../../core/deviceManager';
import { TTSManager } from '../../core/voice/ttsManager';
import {
  createYoloVideoSubscriptionMessage,
  parseYoloVisionMessage,
  parseYoloWebSocketUrl,
} from '../../core/vision/yoloVisionMessage';
import { Eye, ShieldAlert, Sparkles, Check } from 'lucide-react';

const YOLO_WS_URL_KEY = 'ycy_yolo_ws_url';

const loadYoloWsUrl = (): string => {
  try {
    const stored = localStorage.getItem(YOLO_WS_URL_KEY);
    return parseYoloWebSocketUrl(stored) || '';
  } catch {
    return '';
  }
};

const Panel: React.FC<{title: string, caption?: string, children: React.ReactNode, icon?: React.ReactNode}> = ({ title, caption, children, icon }) => (
  <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4 relative overflow-hidden backdrop-blur-md">
    <div>
      <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
        {title}
      </h3>
      {caption && <p className="text-[10px] text-slate-400 mt-1">{caption}</p>}
    </div>
    {children}
  </div>
);

export const YoloVisionTab: React.FC = () => {
  const { safetyConfig } = useAppStore();
  const configuredMaxIntensity = Math.min(
    Number(safetyConfig.maxEmsStrengthA),
    Number(safetyConfig.maxEmsStrengthB),
  );
  const maxIntensity = Number.isFinite(configuredMaxIntensity)
    ? Math.min(200, Math.max(0, configuredMaxIntensity))
    : 0;
  const [wsUrl, setWsUrl] = useState(loadYoloWsUrl);
  const [targetPose, setTargetPose] = useState('pet_lifestyle');
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ReturnType<typeof parseYoloVisionMessage>>(null);
  
  // 高级调教机制状态
  const [strictFidget, setStrictFidget] = useState(false); // 绝对静止
  const [submissiveHead, setSubmissiveHead] = useState(false); // 卑贱视角
  const [dynamicCommand, setDynamicCommand] = useState(false); // 随机口令
  const [punishmentPose, setPunishmentPose] = useState(false); // 受罚姿态强迫
  const [activeCommand, setActiveCommand] = useState<string | null>(null);

  // 惩罚机制状态
  const [toleranceSec, setToleranceSec] = useState(3);
  const [targetMinutes, setTargetMinutes] = useState(10);
  const [remainingSec, setRemainingSec] = useState(10 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [failStreak, setFailStreak] = useState(0);
  const [shockLevel, setShockLevel] = useState(1); // 1到5级
  const [isBlindfold, setIsBlindfold] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoFrameUrl, setVideoFrameUrl] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const videoEnabledRef = useRef(false);
  const videoFrameUrlRef = useRef<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const failStartRef = useRef<number>(0);
  const lastSpeakTimeRef = useRef<number>(0);
  const lastAnnouncedMin = useRef(-1);
  const beggingStartRef = useRef<number>(0);
  const emsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cmdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shockLevelRef = useRef(1);
  const lastVisionMessageAtRef = useRef(0);
  const visionStaleRef = useRef(true);
  const isUnmountingRef = useRef(false);
  const runtimeRef = useRef({
    status,
    isTimerRunning,
    activeCommand,
    targetPose,
    strictFidget,
    submissiveHead,
    isBlindfold,
    toleranceSec,
    punishmentPose,
    maxIntensity,
  });
  runtimeRef.current = {
    status,
    isTimerRunning,
    activeCommand,
    targetPose,
    strictFidget,
    submissiveHead,
    isBlindfold,
    toleranceSec,
    punishmentPose,
    maxIntensity,
  };

  const updateConnectionStatus = (next: 'disconnected' | 'connecting' | 'connected') => {
    runtimeRef.current.status = next;
    if (!isUnmountingRef.current) setStatus(next);
  };

  const clearConnectionTimeout = () => {
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = null;
  };

  const updateTimerRunning = (next: boolean) => {
    runtimeRef.current.isTimerRunning = next;
    if (!isUnmountingRef.current) setIsTimerRunning(next);
  };

  const clearVideoFrame = () => {
    if (videoFrameUrlRef.current) {
      URL.revokeObjectURL(videoFrameUrlRef.current);
      videoFrameUrlRef.current = null;
    }
    if (!isUnmountingRef.current) setVideoFrameUrl(null);
  };

  const updateVideoEnabled = (next: boolean) => {
    videoEnabledRef.current = next;
    if (!isUnmountingRef.current) setVideoEnabled(next);
    if (!next) clearVideoFrame();
  };

  // === WebSocket 连接 ===
  const connect = () => {
    const normalizedWsUrl = parseYoloWebSocketUrl(wsUrl);
    if (!normalizedWsUrl) {
      setConnectionError('请输入正确地址，例如 ws://192.168.1.20:8000/ws。这里填写电脑 IP，不是手机摄像头 IP。');
      return;
    }
    clearConnectionTimeout();
    setConnectionError(null);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    const safeTargetMinutes = Number.isFinite(targetMinutes)
      ? Math.max(1, Math.min(120, Math.round(targetMinutes)))
      : 10;
    updateConnectionStatus('connecting');
    setTargetMinutes(safeTargetMinutes);
    setRemainingSec(safeTargetMinutes * 60);
    updateTimerRunning(false);
    setFailStreak(0);
    shockLevelRef.current = 1;
    setShockLevel(1);
    lastVisionMessageAtRef.current = 0;
    visionStaleRef.current = true;
    lastAnnouncedMin.current = safeTargetMinutes;
    beggingStartRef.current = 0;
    updateVideoEnabled(false);

    if (isBlindfold) {
       void TTSManager.getInstance().speak(`黑房眼罩模式已启动，目标时长${targetMinutes}分钟。立即摆好姿势。`);
       lastSpeakTimeRef.current = Date.now() + 5000; // 锁定5秒保证开场白播完
    }

    try {
      const ws = new WebSocket(normalizedWsUrl);
      wsRef.current = ws;
      ws.binaryType = 'blob';
      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        clearConnectionTimeout();
        setConnectionError(null);
        try { localStorage.setItem(YOLO_WS_URL_KEY, normalizedWsUrl); } catch {}
        updateConnectionStatus('connected');
      };
      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        const failedWhileConnecting = runtimeRef.current.status === 'connecting';
        clearConnectionTimeout();
        wsRef.current = null;
        updateConnectionStatus('disconnected');
        updateTimerRunning(false);
        updateVideoEnabled(false);
        if (failedWhileConnecting) {
          setConnectionError(`无法连接 ${normalizedWsUrl}。请确认电脑已启动 YOLO 服务、手机与电脑在同一 Wi-Fi，并放行电脑 TCP 8000 端口。`);
        }
      };
      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        clearConnectionTimeout();
        wsRef.current = null;
        ws.onclose = null;
        try { ws.close(); } catch {}
        updateConnectionStatus('disconnected');
        updateTimerRunning(false);
        updateVideoEnabled(false);
        setConnectionError(`连接失败：${normalizedWsUrl}。当前服务器可能没有启动、IP 不正确，或 Windows 防火墙阻止了 8000 端口。`);
      };
      
      ws.onmessage = (e) => {
        if (isUnmountingRef.current) return;
        try {
          if (typeof e.data !== 'string') {
            if (!videoEnabledRef.current) return;
            const source = e.data instanceof Blob ? e.data : new Blob([e.data]);
            if (source.size <= 0 || source.size > 2_000_000) return;
            const frame = source.slice(0, source.size, 'image/jpeg');
            const nextUrl = URL.createObjectURL(frame);
            const previousUrl = videoFrameUrlRef.current;
            videoFrameUrlRef.current = nextUrl;
            if (!isUnmountingRef.current) setVideoFrameUrl(nextUrl);
            if (previousUrl) URL.revokeObjectURL(previousUrl);
            return;
          }
          const data = parseYoloVisionMessage(e.data);
          if (!data) return;
          lastVisionMessageAtRef.current = Date.now();
          visionStaleRef.current = false;
          setLastResult(data);
          
          let isPoseValid = false;
          let failReason = '姿势偏离';
          
          // --- 叩拜求饶解锁暂停逻辑 ---
          if ((data.pose === 'kowtow' || data.pose === 'bound_kowtow') && data.confidence >= 0.7) {
              if (beggingStartRef.current === 0) {
                  beggingStartRef.current = Date.now();
              } else if (Date.now() - beggingStartRef.current > 5000) {
                  // 叩首求饶超过5秒，施舍暂停
                   if (runtimeRef.current.isTimerRunning) {
                       updateTimerRunning(false);
                      void TTSManager.getInstance().speak('检测到极度臣服叩拜，已允许暂停，时间冻结。');
                      lastSpeakTimeRef.current = Date.now() + 5000;
                  }
                  failStartRef.current = 0;
                  setFailStreak(0);
                  return; // 叩首状态下跳过后续判定
              }
              // 在求饶读条的5秒内，不算作违规，但也不流逝时间
              isPoseValid = true;
          } else {
              beggingStartRef.current = 0;
              
              // 1. 判断姿势是否正确 (考虑随机口令覆盖)
              const currentTarget = runtimeRef.current.activeCommand || runtimeRef.current.targetPose;
              if (currentTarget === 'pet_lifestyle') {
                  const allowedPoses = ['dog', 'kneel', 'kowtow', 'fetal', 'seiza'];
                  isPoseValid = allowedPoses.includes(data.pose) && data.confidence >= 0.5;
              } else {
                  isPoseValid = data.pose === currentTarget && data.confidence >= 0.6;
              }
              
              // 2. 附加校验：绝对静止 (fidgeting)
              if (isPoseValid && runtimeRef.current.strictFidget && data.fidget > 3.0) {
                  failReason = '身体晃动，绝对静止失败';
              }
              
              // 3. 附加校验：卑贱视角 (头必须低于肩膀)
              if (isPoseValid && runtimeRef.current.submissiveHead && runtimeRef.current.targetPose === 'pet_lifestyle') {
                  // y轴坐标越大表示越靠下(靠近脚)，因此鼻子y必须大于等于肩膀y才能算低头
                  if (data.nose_y !== -1 && data.shoulder_y !== -1 && data.nose_y < data.shoulder_y) {
                      isPoseValid = false;
                      failReason = '抬头傲慢，卑贱视角失败';
                  }
              }
          }
          
          if (!isPoseValid) {
             if (runtimeRef.current.isTimerRunning) {
                 updateTimerRunning(false);
                 if (runtimeRef.current.isBlindfold && Date.now() - lastSpeakTimeRef.current > 4000) {
                     void TTSManager.getInstance().speak(`${failReason}，时间冻结！立即纠正！`);
                     lastSpeakTimeRef.current = Date.now();
                 }
             }
             if (failStartRef.current === 0) {
                 failStartRef.current = Date.now();
                 setFailStreak(0.1);
             } else {
                 const elapsed = (Date.now() - failStartRef.current) / 1000;
                 setFailStreak(elapsed);
                 if (elapsed >= runtimeRef.current.toleranceSec) {
                     triggerPunishment();
                     failStartRef.current = Date.now(); // 重新开始下一轮容错计时
                 }
             }
          } else {
             if (!runtimeRef.current.isTimerRunning && runtimeRef.current.status === 'connected') {
                 updateTimerRunning(true);
                 if (runtimeRef.current.isBlindfold && Date.now() - lastSpeakTimeRef.current > 4000) {
                     void TTSManager.getInstance().speak('姿势合格，时间继续流逝。');
                     lastSpeakTimeRef.current = Date.now();
                 }
             }
             failStartRef.current = 0;
             setFailStreak(0);
             if (Math.random() > 0.95) {
               const nextLevel = Math.max(1, shockLevelRef.current - 1);
               shockLevelRef.current = nextLevel;
               setShockLevel(nextLevel);
             }
          }
        } catch {}
      };
      connectionTimeoutRef.current = setTimeout(() => {
        if (wsRef.current !== ws || runtimeRef.current.status !== 'connecting') return;
        wsRef.current = null;
        ws.onerror = null;
        ws.onclose = null;
        try { ws.close(); } catch {}
        updateConnectionStatus('disconnected');
        updateTimerRunning(false);
        updateVideoEnabled(false);
        setConnectionError(`连接超时：${normalizedWsUrl}。请先在电脑运行 一键启动YOLO视觉服务.bat (或 5_yolo_classifier_server.py)，再检查局域网 IP 和防火墙。`);
      }, 8_000);
    } catch (error) {
      clearConnectionTimeout();
      updateConnectionStatus('disconnected');
      updateTimerRunning(false);
      setConnectionError(`无法创建连接：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const triggerPunishment = () => {
      const newLvl = Math.min(5, shockLevelRef.current + 1);
      shockLevelRef.current = newLvl;
      setShockLevel(newLvl);

      const currentSafety = useAppStore.getState().safetyConfig;
      const maxShock = Math.min(
        runtimeRef.current.maxIntensity,
        currentSafety.maxEmsStrengthA,
        currentSafety.maxEmsStrengthB,
      );
      if (currentSafety.emergencyLock || maxShock <= 0) return;
      const randomIntensity = DeviceManager.getInstance().getRandomEmsStrength(maxShock);
      
      if (runtimeRef.current.punishmentPose) {
          void TTSManager.getInstance().speak(`警告！违规等级 ${newLvl}，立刻摆出土下座承受惩罚！`);
          setActiveCommand('kowtow');
          runtimeRef.current.activeCommand = 'kowtow';
          if (cmdTimeoutRef.current) clearTimeout(cmdTimeoutRef.current);
          cmdTimeoutRef.current = setTimeout(() => {
              if (runtimeRef.current.status === 'connected') {
                runtimeRef.current.activeCommand = null;
                setActiveCommand(null);
              }
          }, 10000); // 强迫土下座10秒
      } else {
          void TTSManager.getInstance().speak(`警告！违规等级 ${newLvl}，按安全设置范围触发随机电击！`);
      }
      
      lastSpeakTimeRef.current = Date.now() + 4000;
      void DeviceManager.getInstance().setEmsStrength('AB', randomIntensity).catch((error) => {
        console.warn('YOLO 姿态惩罚下发失败:', error);
        disconnect();
      });
      
      // 惩罚持续时间受等级影响 (2秒到5秒)
      const duration = 2000 + (newLvl - 1) * 750;
      if (emsTimeoutRef.current) clearTimeout(emsTimeoutRef.current);
      emsTimeoutRef.current = setTimeout(() => {
          emsTimeoutRef.current = null;
          void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
      }, duration);
      
  };

  const disconnect = () => {
    clearConnectionTimeout();
    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    updateConnectionStatus('disconnected');
    updateTimerRunning(false);
    setFailStreak(0);
    setLastResult(null);
    lastVisionMessageAtRef.current = 0;
    visionStaleRef.current = true;
    setActiveCommand(null);
    updateVideoEnabled(false);
    runtimeRef.current.activeCommand = null;
    if (emsTimeoutRef.current) clearTimeout(emsTimeoutRef.current);
    if (cmdTimeoutRef.current) clearTimeout(cmdTimeoutRef.current);
    emsTimeoutRef.current = null;
    cmdTimeoutRef.current = null;
    void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined); // 安全兜底：断开连接时立刻停止电击
  };

  const toggleVideoPreview = () => {
    const websocket = wsRef.current;
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
    const next = !videoEnabledRef.current;
    try {
      websocket.send(createYoloVideoSubscriptionMessage(next));
      updateVideoEnabled(next);
    } catch {
      disconnect();
    }
  };

  // === 地狱倒计时引擎 ===
  useEffect(() => {
    if (isTimerRunning && remainingSec > 0) {
      timerRef.current = setTimeout(() => setRemainingSec(r => r - 1), 1000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isTimerRunning, remainingSec]);

  // 独立监听剩余时间进行语音播报与结束判定
  useEffect(() => {
    if (status !== 'connected') return;

    if (remainingSec <= 0) {
      void TTSManager.getInstance().speak('考核结束，表现合格，允许摘下眼罩起身。');
      disconnect();
    } else if (isTimerRunning) {
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      
      // 每逢整分播报 (排除刚开始的情况)
      if (secs === 0 && mins !== lastAnnouncedMin.current && mins > 0) {
          if (isBlindfold) {
              void TTSManager.getInstance().speak(`考核还剩最后 ${mins} 分钟，坚持住。`);
              lastSpeakTimeRef.current = Date.now() + 4000;
          }
          lastAnnouncedMin.current = mins;
      }
    }
  }, [remainingSec, isTimerRunning, status, isBlindfold]);

  useEffect(() => {
    if (status !== 'connected') return;
    const watchdog = window.setInterval(() => {
      const lastMessageAt = lastVisionMessageAtRef.current;
      if (lastMessageAt > 0 && Date.now() - lastMessageAt <= 3000) return;
      if (visionStaleRef.current) return;
      visionStaleRef.current = true;
      updateTimerRunning(false);
      failStartRef.current = 0;
      setFailStreak(0);
      if (emsTimeoutRef.current) clearTimeout(emsTimeoutRef.current);
      emsTimeoutRef.current = null;
      void DeviceManager.getInstance().setEmsStrength('AB', 0).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(watchdog);
  }, [status]);

  // 随机口令生成器
  useEffect(() => {
      if (status !== 'connected' || !dynamicCommand || !isTimerRunning) return;
      
      // 每 10 秒抛一次硬币，决定是否下达突发指令
      const interval = setInterval(() => {
          if (activeCommand === null && Math.random() < 0.3) {
              const commands = ['hands_up', 'spread_eagle', 'surrender', 'm_kneel', 'seiza', 'kneel_ears'];
              const cmd = commands[Math.floor(Math.random() * commands.length)];
              const names: Record<string, string> = {
                  'hands_up': '双手抱头',
                  'spread_eagle': '大字张开',
                  'surrender': '高举投降',
                  'm_kneel': 'M字跪姿',
                  'seiza': '规矩正座',
                  'kneel_ears': '双手揪耳',
              };
              setActiveCommand(cmd);
              runtimeRef.current.activeCommand = cmd;
              void TTSManager.getInstance().speak(`突发口令！3秒内切换到 ${names[cmd]}！`);
              lastSpeakTimeRef.current = Date.now() + 4000;
              
              // 15秒后恢复原定姿势
              if (cmdTimeoutRef.current) clearTimeout(cmdTimeoutRef.current);
              cmdTimeoutRef.current = setTimeout(() => {
                  if (runtimeRef.current.status === 'connected') {
                      runtimeRef.current.activeCommand = null;
                      setActiveCommand(null);
                      void TTSManager.getInstance().speak(`口令解除，恢复原待机姿态。`);
                      lastSpeakTimeRef.current = Date.now() + 3000;
                  }
              }, 15000);
          }
      }, 10000);
      
      return () => clearInterval(interval);
  }, [status, dynamicCommand, isTimerRunning, activeCommand]);

  useEffect(() => {
    if (safetyConfig.emergencyLock && status !== 'disconnected') disconnect();
  }, [safetyConfig.emergencyLock, status]);

  useEffect(() => {
    isUnmountingRef.current = false;
    return () => {
      isUnmountingRef.current = true;
      disconnect();
    };
  }, []);

  const fmtTime = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  // 渲染暗黑模式全屏遮罩
  if (isBlindfold && status !== 'disconnected') {
      return (
          <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center" onDoubleClick={() => setIsBlindfold(false)}>
              <div className="text-slate-900 font-black text-2xl tracking-widest select-none opacity-20">暗黑盲罚模式中</div>
              <div className="text-slate-900 font-bold text-xs select-none mt-2 opacity-10">双击屏幕退出黑房</div>
              
              {/* 为了防止息屏，放置一个极暗的心跳动画 */}
              <div className={`w-2 h-2 rounded-full mt-10 ${isTimerRunning ? 'bg-slate-900 animate-pulse' : 'bg-red-950/20'}`} />
          </div>
      );
  }

  return <Panel title="全视之眼 (YOLO Vision Enforcer)" caption="地狱计时模式。只有完美保持姿势时，时间才会流逝。姿势变形将导致时间停止并触发阶梯式电击惩罚。">
    <div className="rounded-3xl bg-slate-900 p-5 shadow-xl border-2 border-emerald-500/30 space-y-4">
      
      {/* 顶部配置区 (未连接时显示) */}
      {status === 'disconnected' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400">🔗 YOLO 服务器地址</p>
            <input aria-label="YOLO 服务器地址" value={wsUrl} placeholder="ws://电脑局域网IP:8000/ws" onChange={e => { setWsUrl(e.target.value); setConnectionError(null); }}
              className="w-full bg-slate-800 text-white text-xs px-3 py-2.5 rounded-xl border border-slate-700 outline-none" />
            <p className="text-[9px] leading-relaxed text-slate-500">手机 IP 摄像头地址配置在电脑端 Python 服务；这里填写运行 Python 的电脑地址。</p>
            {connectionError && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-[10px] leading-relaxed text-rose-300">{connectionError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400">🎯 目标姿势 / 监控模式</p>
              <select
                aria-label="目标姿势或监控模式"
                value={targetPose}
                onChange={e => {
                  const inTrainingPoses = ['jackknife', 'camel_arch', 'chest_out_kneel', 'butterfly_supine', 'reverse_tabletop', 'compact_huddle', 'ankle_grasp_kneel'];
                  if (!inTrainingPoses.includes(e.target.value)) {
                    setTargetPose(e.target.value);
                  }
                }}
                className="w-full bg-white text-slate-800 text-[11px] font-semibold px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-300"
                style={{ colorScheme: 'light' }}
              >
                <option value="pet_lifestyle">🐾 宠物生活模式 (爬行/低姿势均可)</option>
                <optgroup label="── 经典服从姿态 ──">
                  <option value="dog">母狗趴跪</option>
                  <option value="kneel">双膝正跪</option>
                  <option value="kowtow">极致土下座</option>
                  <option value="hands_up">双手抱头</option>
                  <option value="surrender">罚站投降</option>
                  <option value="fetal">婴儿受缚</option>
                  <option value="spread_eagle">仰面大字张开</option>
                </optgroup>
                <optgroup label="── 日式规矩与绝对服从 ──">
                  <option value="seiza">日式端坐 (正座)</option>
                  <option value="bound_kowtow">反剪束手伏首</option>
                  <option value="kneel_ears">双手揪耳跪立</option>
                </optgroup>
                <optgroup label="── 羞耻感与身体展示 ──">
                  <option value="m_kneel">M字开腿跪姿</option>
                  <option value="jackknife" disabled className="text-slate-400 bg-slate-50" style={{ color: '#94a3b8' }}>伏地翘臀 (猫式)（训练中）</option>
                  <option value="camel_arch" disabled className="text-slate-400 bg-slate-50" style={{ color: '#94a3b8' }}>跪姿反弓后仰（训练中）</option>
                  <option value="chest_out_kneel" disabled className="text-slate-400 bg-slate-50" style={{ color: '#94a3b8' }}>挺胸负手受审跪（训练中）</option>
                  <option value="butterfly_supine" disabled className="text-slate-400 bg-slate-50" style={{ color: '#94a3b8' }}>仰面屈膝敞开（训练中）</option>
                  <option value="reverse_tabletop" disabled className="text-slate-400 bg-slate-50" style={{ color: '#94a3b8' }}>四足反向仰撑（训练中）</option>
                  <option value="compact_huddle" disabled className="text-slate-400 bg-slate-50" style={{ color: '#94a3b8' }}>抱膝蜷缩坐（训练中）</option>
                  <option value="ankle_grasp_kneel" disabled className="text-slate-400 bg-slate-50" style={{ color: '#94a3b8' }}>双手抱脚踝跪坐（训练中）</option>
                </optgroup>
              </select>
            </div>
            
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400">⏱️ 维持时间 (分钟)</p>
              <input type="number" min={1} max={120} value={targetMinutes} onChange={e => {
                const value = Number(e.target.value);
                setTargetMinutes(Number.isFinite(value) ? Math.max(1, Math.min(120, Math.round(value))) : 10);
              }}
                className="w-full bg-white text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-pink-500" />
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-bold text-slate-400">⚡ 进阶严苛度监控规则</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'strictFidget', label: '🗿 绝对静止', sub: '轻微晃动即报警', active: strictFidget, toggle: () => setStrictFidget(!strictFidget) },
                { id: 'submissiveHead', label: '🙇 卑贱低头', sub: '禁止直视屏幕视角', active: submissiveHead, toggle: () => setSubmissiveHead(!submissiveHead) },
                { id: 'dynamicCommand', label: '📢 突发口令', sub: '随机要求变换姿势', active: dynamicCommand, toggle: () => setDynamicCommand(!dynamicCommand) },
                { id: 'punishmentPose', label: '⚡ 土下座强迫', sub: '超时未归位重罚', active: punishmentPose, toggle: () => setPunishmentPose(!punishmentPose) },
              ].map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  onClick={rule.toggle}
                  className={`p-2.5 rounded-2xl text-left transition-all border ${
                    rule.active
                      ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300 shadow-sm shadow-emerald-950/40'
                      : 'bg-slate-800/50 border-slate-700/80 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{rule.label}</span>
                    <span className={`w-2 h-2 rounded-full ${rule.active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-600'}`} />
                  </div>
                  <p className="text-[9px] text-slate-400/80 mt-0.5 truncate">{rule.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-[10px] font-bold text-slate-400">⚙️ 变形容错率 (秒)</p>
              <span className="text-[10px] font-black text-emerald-400">{toleranceSec} 秒</span>
            </div>
            <input type="range" min={1} max={10} value={toleranceSec} onChange={e => setToleranceSec(+e.target.value)}
              className="w-full accent-emerald-500" />
          </div>

          <label className="flex items-center space-x-2 bg-slate-800 p-3 rounded-xl border border-slate-700">
            <input type="checkbox" checked={isBlindfold} onChange={e => setIsBlindfold(e.target.checked)} className="rounded text-emerald-500 bg-slate-900 border-slate-700" />
            <span className="text-[10px] font-bold text-slate-300">开启黑房眼罩模式 (纯语音盲罚)</span>
          </label>

          <button onClick={connect} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-black text-xs shadow-lg shadow-emerald-900/50 hover:scale-[1.02] transition-transform">
            📡 连接服务器并开始受罚
          </button>
        </div>
      )}

      {/* 监控运行区 */}
      {status !== 'disconnected' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2">
          {status === 'connecting' && <div className="rounded-2xl border border-cyan-500/40 bg-cyan-950/30 p-4 text-center"><p className="text-xs font-black text-cyan-300">正在连接 YOLO 服务器...</p><p className="mt-1 break-all text-[9px] text-cyan-200/70">{wsUrl}</p><p className="mt-2 text-[9px] text-slate-500">超过 8 秒将自动返回并显示原因</p></div>}
          <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-200">YOLO 骨骼识别画面</p>
                <p className="text-[9px] text-slate-500">按需接收服务器视频，关闭后停止传输</p>
              </div>
              <button
                type="button"
                disabled={status !== 'connected'}
                onClick={toggleVideoPreview}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  videoEnabled
                    ? 'border-rose-500/60 bg-rose-500/15 text-rose-300'
                    : 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                {videoEnabled ? '关闭画面' : '查看画面'}
              </button>
            </div>

            {videoEnabled && (
              <div
                className="relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-cyan-500/30 bg-black"
                style={{ aspectRatio: '16 / 9' }}
              >
                {videoFrameUrl ? (
                  <img
                    src={videoFrameUrl}
                    alt="YOLO 实时骨骼识别画面"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-cyan-300/70">
                    <Eye className="h-7 w-7 animate-pulse" />
                    <span className="text-[10px] font-bold">等待服务器视频帧...</span>
                  </div>
                )}
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[8px] font-black text-emerald-300 backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  LIVE
                </div>
              </div>
            )}
          </div>
          
          {/* 大倒计时 */}
          <div className={`p-6 rounded-2xl text-center border-2 transition-colors duration-300 ${
            activeCommand ? 'bg-amber-950/50 border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.4)]' :
            isTimerRunning ? 'bg-emerald-950/50 border-emerald-500/50' : 'bg-rose-950/50 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
          }`}>
            <p className="text-[10px] font-black tracking-widest text-slate-400 mb-2">
                {activeCommand ? '⚠️ 突发紧急口令' : '剩余考核时间'}
            </p>
            <p className={`text-5xl font-black font-mono tracking-tighter ${
                activeCommand ? 'text-amber-400' :
                isTimerRunning ? 'text-emerald-400' : 'text-rose-500 animate-pulse'
            }`}>
              {activeCommand ? activeCommand.toUpperCase() : fmtTime(remainingSec)}
            </p>
            {!isTimerRunning && !activeCommand && <p className="text-xs font-black text-rose-400 mt-2">时间已冻结！立即纠正姿势！</p>}
            {activeCommand && <p className="text-xs font-black text-amber-400 mt-2 animate-bounce">立刻切换姿势，否则拉满电击！</p>}
          </div>

          {/* 实时状态网格 */}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <p className="text-[9px] text-slate-500">当前AI识别</p>
              <p className={`text-sm font-black mt-1 ${(lastResult?.rawPose || lastResult?.pose) === targetPose ? 'text-emerald-400' : 'text-amber-300'}`}>
                {lastResult?.rawPose || lastResult?.pose || '等待帧...'}
                <span className="text-[10px] ml-1 opacity-70">({Math.round((lastResult?.rawConfidence ?? lastResult?.confidence ?? 0)*100)}%)</span>
              </p>
              {lastResult && (
                <p className={`mt-1 text-[8px] font-bold ${lastResult.pose === 'unknown' ? 'text-slate-500' : 'text-emerald-400'}`}>
                  安全确认：{lastResult.pose} · {lastResult.stabilityFrames ?? 0}/{lastResult.requiredFrames ?? 3} 帧
                </p>
              )}
            </div>
            
            <div className={`rounded-xl p-3 border transition-colors ${
              shockLevel >= 4 ? 'bg-rose-950 border-rose-600' : 
              shockLevel >= 2 ? 'bg-orange-950 border-orange-600' : 
              'bg-slate-800 border-slate-700'
            }`}>
              <p className="text-[9px] text-slate-500">惩罚强度阶梯</p>
              <div className="flex justify-center gap-1 mt-1.5">
                {[1,2,3,4,5].map(lvl => (
                  <div key={lvl} className={`w-3 h-3 rounded-full ${lvl <= shockLevel ? (shockLevel >= 4 ? 'bg-rose-500 shadow-[0_0_5px_#f43f5e]' : 'bg-orange-500') : 'bg-slate-700'}`} />
                ))}
              </div>
            </div>
          </div>

          {/* 容错警告条 */}
          <div className="bg-black/50 rounded-xl p-3 border border-slate-800">
            <div className="flex justify-between text-[9px] mb-1">
              <span className="text-slate-400">偏离容错条</span>
              <span className="text-rose-400">{failStreak.toFixed(1)} / {toleranceSec}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${(failStreak / toleranceSec) * 100}%` }} />
            </div>
          </div>

          <button onClick={disconnect} className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-400 border border-slate-700 font-bold text-xs hover:bg-slate-700">
            ⛔ 放弃考核 (急停)
          </button>
        </div>
      )}
    </div>
  </Panel>;
};
