import { EdgingDenialState, EdgingPhase } from '../../types';
import { ClenchDetector } from './clenchDetector';
import { DeviceManager } from '../deviceManager';
import { TTSManager } from '../voice/ttsManager';
import { HapticEngine } from '../haptics/hapticEngine';
import { BountyQuestEngine } from '../tavern/bountyQuestEngine';

export type EdgingStateListener = (state: EdgingDenialState) => void;

/**
 * 役次元 高潮剥夺与边缘控射引擎 (基于肛塞/括约肌压力传感器生理闭环)
 */
export class EdgingEngine {
  private static instance: EdgingEngine;

  private detector = new ClenchDetector(1.35);
  private state: EdgingDenialState = {
    isActive: false,
    targetRounds: 3,
    completedRounds: 0,
    currentPhase: 'idle',
    arousalPercent: 0,
    currentPressure: 0,
    baselinePressure: 0,
    cooldownRemainingSec: 0,
    autoBrakeCount: 0,
    historyLogs: []
  };

  private listeners: Set<EdgingStateListener> = new Set();
  private cooldownTimer: any = null;
  private finalReleaseTimer: any = null;
  private sessionGeneration = 0;

  private readonly DENIAL_VOICES = [
    '（传感器捕获括约肌剧烈收缩）抓到你了！又想偷偷出来是吧？给我憋回去！',
    '收缩得这么明显，以为我不知道吗？手拿开，深呼吸忍回去！',
    '没我的允许谁准你出来的？忍住！深呼吸！',
    '（检测到射精前兆痉挛）急刹断电！这一轮休想得逞，老老实实冷场！',
    '身体这么敏感？才刚升温就想求饶了？给我死死忍住！'
  ];

  private constructor() {
    // 监听设备底层硬件上报的压力传感器数据
    DeviceManager.getInstance().subscribeState((devState) => {
      if (!this.state.isActive) return;

      const p1 = Math.max(devState.enema.pressureA || 0, devState.enema.pressureB || 0);
      if (p1 > 0) {
        const result = this.detector.feedPressure(p1);
        this.state.currentPressure = result.currentPressure;
        this.state.baselinePressure = result.baseline;
        this.state.arousalPercent = result.arousalPercent;

        // 如果在加温激发阶段且传感器捕捉到了括约肌收紧动作 ➔ 自动触发毫秒级急刹断电！
        if (this.state.currentPhase === 'warming' && result.isClenchDetected) {
          this.triggerDenialBrake(true);
        } else {
          this.notify();
        }
      }
    });
  }

  static getInstance(): EdgingEngine {
    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : (window as any);
    if (!g.__YCY_EDGING_ENGINE__) {
      g.__YCY_EDGING_ENGINE__ = new EdgingEngine();
    }
    return g.__YCY_EDGING_ENGINE__;
  }

  getState(): EdgingDenialState {
    return { ...this.state, historyLogs: [...this.state.historyLogs] };
  }

  subscribe(listener: EdgingStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try { listener(snapshot); } catch (error) { console.warn('控射监听器执行失败:', error); }
    });
  }

  private addLog(log: string) {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.state.historyLogs = [`[${timeStr}] ${log}`, ...this.state.historyLogs.slice(0, 49)];
    this.notify();
  }

  setSensitivity(val: number) {
    this.detector.setSensitivity(val);
  }

  /**
   * 启动高潮剥夺特训
   */
  startEdgingSession(targetRounds: number = 3) {
    this.stopSession();
    const rounds = Number.isFinite(targetRounds) ? Math.min(20, Math.max(1, Math.round(targetRounds))) : 3;

    this.detector.resetCalibration();
    this.state = {
      isActive: true,
      targetRounds: rounds,
      completedRounds: 0,
      currentPhase: 'warming',
      arousalPercent: 0,
      currentPressure: 0,
      baselinePressure: 0,
      cooldownRemainingSec: 0,
      autoBrakeCount: 0,
      historyLogs: []
    };

    this.addLog(`🛑 高潮剥夺特训启动！目标轮数: ${rounds} 轮。肛塞压力传感器已挂载实时监测。`);
    void TTSManager.getInstance().speak(`高潮剥夺特训正式开始。本轮目标必须挺过 ${rounds} 轮濒死控射。传感器已就绪，你的每一次括约肌收缩都在我的监控之下。`);

    this.startWarmingDrive();
    this.notify();
  }

  /**
   * 启动加温激发驱动
   */
  private startWarmingDrive() {
    this.state.currentPhase = 'warming';
    this.state.arousalPercent = 0;
    this.addLog(`🔥 第 ${this.state.completedRounds + 1} 轮加温推进中... 正在攀升快感节奏`);

    const dev = DeviceManager.getInstance();
    // 启动拟真推进律动：九浅一深 + 呼吸电击
    void Promise.allSettled([
      dev.playToyPattern('nine_shallow_one_deep', 120),
      dev.sendEmsWave('AB', 'pinch_crescendo'),
    ]).then((results) => {
      results.forEach((result) => {
        if (result.status === 'rejected') this.addLog(`⚠️ 硬件动作未执行：${String(result.reason?.message || result.reason)}`);
      });
    });
    this.notify();
  }

  /**
   * 触发剥夺急刹断电 (可由传感器自动触发或由用户手动点击)
   */
  triggerDenialBrake(isSensorAuto: boolean = false) {
    if (!this.state.isActive || this.state.currentPhase !== 'warming') return;

    this.state.currentPhase = 'denying';
    if (isSensorAuto) {
      this.state.autoBrakeCount++;
    }
    this.state.completedRounds++;

    // 1. 毫秒级物理急停断电与强烈触觉体感！
    HapticEngine.heavyShock();
    const dev = DeviceManager.getInstance();
    void dev.emergencyStop(!isSensorAuto);
    BountyQuestEngine.getInstance().incrementProgress('edging_brake');

    const logText = isSensorAuto
      ? `🚨 【传感器自动捕获】检测到肛门括约肌剧烈收缩！触发第 ${this.state.completedRounds} 轮强制剥夺急刹！`
      : `✋ 【手动上报】触发第 ${this.state.completedRounds} 轮高潮剥夺急刹！`;
    this.addLog(logText);

    // 2. 严厉冷嘲语音
    const qIndex = Math.floor(Math.random() * this.DENIAL_VOICES.length);
    const vText = this.DENIAL_VOICES[qIndex];
    void TTSManager.getInstance().speak(vText);

    // 3. 启动 20 秒强制冷场倒计时
    const cooldownEndTime = Date.now() + 20_000;
    this.state.currentPhase = 'cooldown';
    this.state.cooldownRemainingSec = 20;
    this.notify();

    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((cooldownEndTime - Date.now()) / 1000));
      this.state.cooldownRemainingSec = remaining;
      this.notify();
      if (remaining <= 0) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
        this.handleCooldownFinished();
      }
    }, 1000);
  }

  /**
   * 冷场倒计时结束
   */
  private handleCooldownFinished() {
    if (!this.state.isActive) return;

    if (this.state.completedRounds >= this.state.targetRounds) {
      // 完成全部轮次 ➔ 赋予终极释放许可！
      this.triggerFinalRelease();
    } else {
      // 开启下一轮加温
      void TTSManager.getInstance().speak(`冷场结束。深呼吸，接下来进入第 ${this.state.completedRounds + 1} 轮推进！`);
      this.startWarmingDrive();
    }
  }

  /**
   * 终极释放许可 (榨干模式)
   */
  private triggerFinalRelease() {
    HapticEngine.successTada();
    this.state.currentPhase = 'milking_release';
    this.addLog(`🏆 恭喜！已顽强挺过全部 ${this.state.targetRounds} 轮高潮剥夺！特训通关，准予终极释放！`);

    void TTSManager.getInstance().speak(`非常顽强！你已经成功挺过了全部 ${this.state.targetRounds} 轮高潮剥夺！现在，作为你的奖励，我准许你彻底释放！享受吧！`);

    // 全通道极速榨干模式
    const dev = DeviceManager.getInstance();
    void Promise.allSettled([
      dev.playToyPattern('climax_milking', 25),
      dev.sendEmsWave('AB', 'orgasm_drain'),
    ]);
    this.notify();

    const generation = this.sessionGeneration;
    this.finalReleaseTimer = setTimeout(() => {
      if (generation === this.sessionGeneration) this.stopSession();
    }, 25000);
  }

  /**
   * 停止特训
   */
  stopSession() {
    this.sessionGeneration++;
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    if (this.finalReleaseTimer) {
      clearTimeout(this.finalReleaseTimer);
      this.finalReleaseTimer = null;
    }

    this.state.isActive = false;
    this.state.currentPhase = 'idle';
    this.notify();
    void DeviceManager.getInstance().emergencyStop();
  }
}
