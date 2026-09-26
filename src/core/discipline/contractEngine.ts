import { DisciplineContractState, ContractIntensity, SurgeCheckEvent } from '../../types';
import { DeviceManager } from '../deviceManager';
import { TTSManager } from '../voice/ttsManager';
import { HapticEngine } from '../haptics/hapticEngine';

export type ContractStateListener = (state: DisciplineContractState) => void;

const createDefaultContractState = (): DisciplineContractState => ({
  isActive: false,
  contractId: '',
  durationMinutes: 15,
  remainingSeconds: 0,
  startTime: 0,
  intensity: 'standard',
  totalSurgeChecks: 0,
  passedSurgeChecks: 0,
  failedSurgeChecks: 0,
  currentSurgeCheck: null,
  historyLogs: [],
});

const safeCount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100_000, Math.floor(parsed))) : 0;
};

export const normalizeStoredContract = (
  value: unknown,
  now: number = Date.now(),
): { state: DisciplineContractState; targetEndTime: number } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const wrapper = value as Record<string, unknown>;
  if (wrapper.isActive !== true || !wrapper.state || typeof wrapper.state !== 'object' || Array.isArray(wrapper.state)) return null;
  const targetEndTime = Number(wrapper.targetEndTime);
  if (!Number.isFinite(targetEndTime) || targetEndTime > now + 7 * 24 * 60 * 60 * 1000) return null;
  const raw = wrapper.state as Record<string, unknown>;
  const intensities: ContractIntensity[] = ['mild', 'standard', 'severe', 'hardcore'];
  const passedSurgeChecks = safeCount(raw.passedSurgeChecks);
  const failedSurgeChecks = safeCount(raw.failedSurgeChecks);
  const durationMinutes = Number(raw.durationMinutes);
  const startTime = Number(raw.startTime);
  let currentSurgeCheck: SurgeCheckEvent | null = null;
  if (raw.currentSurgeCheck && typeof raw.currentSurgeCheck === 'object' && !Array.isArray(raw.currentSurgeCheck)) {
    const surge = raw.currentSurgeCheck as Record<string, unknown>;
    const deadlineTimestamp = Number(surge.deadlineTimestamp);
    if (
      surge.isAnswered !== true
      && typeof surge.question === 'string'
      && Number.isFinite(deadlineTimestamp)
      && deadlineTimestamp <= now + 60_000
    ) {
      currentSurgeCheck = {
        id: typeof surge.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(surge.id)
          ? surge.id
          : `surge-recovered-${now}`,
        question: surge.question.slice(0, 500),
        deadlineTimestamp,
        remainingSeconds: Math.max(1, Math.min(60, Math.ceil((deadlineTimestamp - now) / 1000))),
        isAnswered: false,
      };
    }
  }

  return {
    targetEndTime,
    state: {
      ...createDefaultContractState(),
      isActive: true,
      contractId: typeof raw.contractId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(raw.contractId)
        ? raw.contractId
        : `contract-recovered-${now}`,
      durationMinutes: Number.isFinite(durationMinutes)
        ? Math.max(1, Math.min(1440, Math.round(durationMinutes)))
        : 15,
      remainingSeconds: Math.max(1, Math.floor((targetEndTime - now) / 1000)),
      startTime: Number.isFinite(startTime) && startTime >= 0 && startTime <= now ? startTime : now,
      intensity: intensities.includes(raw.intensity as ContractIntensity)
        ? raw.intensity as ContractIntensity
        : 'standard',
      totalSurgeChecks: Math.min(100_000, Math.max(safeCount(raw.totalSurgeChecks), passedSurgeChecks + failedSurgeChecks)),
      passedSurgeChecks,
      failedSurgeChecks,
      currentSurgeCheck,
      historyLogs: Array.isArray(raw.historyLogs)
        ? raw.historyLogs.filter((log): log is string => typeof log === 'string').slice(0, 50).map((log) => log.slice(0, 1000))
        : [],
    },
  };
};

/**
 * 役次元 赛博契约 & 锁权调教引擎 (基于绝对时间戳与后台流逝校准)
 */
export class ContractEngine {
  private static instance: ContractEngine;

  private state: DisciplineContractState = createDefaultContractState();

  private targetEndTime: number = 0;
  private listeners: Set<ContractStateListener> = new Set();
  private timer: any = null;
  private surgeResetTimer: any = null;
  private nextSurgeTimestamp: number = 0;
  private contractGeneration = 0;
  private lastTickTimestamp = Date.now();

  private readonly SURGE_QUESTIONS = [
    '（突然加压）还在好好保持服从姿态吗？限你 15 秒内大声回答我！',
    '心跳乱了吗？立刻报告你现在的忍耐状态！',
    '深呼吸，把手放开！大声告诉我你还在坚持吗？',
    '谁准你松懈的？立刻确认你的服从口令！',
    '感受到了吗？告诉我这股电流让你清醒了吗？',
    '（突然提速）呼吸乱了吗？15 秒内向我汇报！',
  ];

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): ContractEngine {
    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : (window as any);
    if (!g.__YCY_CONTRACT_ENGINE__) {
      g.__YCY_CONTRACT_ENGINE__ = new ContractEngine();
    }
    return g.__YCY_CONTRACT_ENGINE__;
  }

  private loadFromStorage() {
    try {
      const saved = localStorage.getItem('ycy_active_contract');
      if (saved) {
        const normalized = normalizeStoredContract(JSON.parse(saved));
        if (!normalized) {
          localStorage.removeItem('ycy_active_contract');
          return;
        }
        this.state = normalized.state;
        this.targetEndTime = normalized.targetEndTime;
        if (this.targetEndTime <= Date.now()) {
          this.completeContract();
          return;
        }
        this.scheduleNextSurge();
        this.timer = setInterval(() => this.tick(), 1000);
      }
    } catch {}
  }

  private saveToStorage() {
    try {
      if (this.state.isActive) {
        localStorage.setItem(
          'ycy_active_contract',
          JSON.stringify({
            isActive: true,
            targetEndTime: this.targetEndTime,
            state: this.state,
          })
        );
      } else {
        localStorage.removeItem('ycy_active_contract');
      }
    } catch {}
  }

  getState(): DisciplineContractState {
    return {
      ...this.state,
      currentSurgeCheck: this.state.currentSurgeCheck ? { ...this.state.currentSurgeCheck } : null,
      historyLogs: [...this.state.historyLogs],
    };
  }

  subscribe(listener: ContractStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.saveToStorage();
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try { listener(snapshot); } catch (error) { console.warn('契约监听器执行失败:', error); }
    });
  }

  private addLog(log: string) {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.state.historyLogs = [`[${timeStr}] ${log}`, ...this.state.historyLogs.slice(0, 49)];
    this.notify();
  }

  /**
   * 开启赛博契约锁定 (基于绝对时间校准，无惧退至后台)
   */
  startContract(durationMinutes: number, intensity: ContractIntensity = 'standard') {
    this.stopContract(false);

    const normalizedMinutes = Number.isFinite(durationMinutes) ? Math.min(1440, Math.max(1, Math.round(durationMinutes))) : 15;
    const totalSec = normalizedMinutes * 60;
    const now = Date.now();
    this.targetEndTime = now + totalSec * 1000;

    const safeIntensity: ContractIntensity = ['mild', 'standard', 'severe', 'hardcore'].includes(intensity)
      ? intensity
      : 'standard';
    this.state = {
      isActive: true,
      contractId: `contract-${now}`,
      durationMinutes: normalizedMinutes,
      remainingSeconds: totalSec,
      startTime: now,
      intensity: safeIntensity,
      totalSurgeChecks: 0,
      passedSurgeChecks: 0,
      failedSurgeChecks: 0,
      currentSurgeCheck: null,
      historyLogs: [],
    };
    void DeviceManager.getInstance().emergencyStop();

    HapticEngine.heavyShock();
    this.addLog(`🩸 赛博服从契约已签订！锁定总时长: ${normalizedMinutes} 分钟，严苛度: ${safeIntensity.toUpperCase()}`);
    this.scheduleNextSurge();

    // 启动每秒绝对时间校准计时器
    this.timer = setInterval(() => {
      this.tick();
    }, 1000);

    void TTSManager.getInstance().speak(`契约已正式成立。在接下来的 ${normalizedMinutes} 分钟内，你的所有设备控制权全部归我接管。准备好迎接特训吧。`);
    this.notify();
  }

  private scheduleNextSurge() {
    let minSec = 180;
    let maxSec = 360;

    if (this.state.intensity === 'mild') {
      minSec = 300;
      maxSec = 500;
    } else if (this.state.intensity === 'severe') {
      minSec = 120;
      maxSec = 240;
    } else if (this.state.intensity === 'hardcore') {
      minSec = 60;
      maxSec = 150;
    }

    const seconds = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
    this.nextSurgeTimestamp = Date.now() + seconds * 1000;
  }

  private tick() {
    if (!this.state.isActive) return;

    // 基于绝对时间戳计算真实剩余秒数，防止手机锁屏休眠导致计时变慢
    const now = Date.now();
    const elapsedSinceLastTick = now - this.lastTickTimestamp;
    this.lastTickTimestamp = now;
    const realRemaining = Math.max(0, Math.floor((this.targetEndTime - now) / 1000));
    this.state.remainingSeconds = realRemaining;

    if (realRemaining > 0) {
      // 突袭查岗倒计时
      if (!this.state.currentSurgeCheck) {
        if (now >= this.nextSurgeTimestamp && realRemaining > 30) {
          this.triggerSurgeCheck();
        }
      } else {
        // 当前处于查岗 15 秒应答窗口中
        // 若切后台发生定时器节流（两次 tick 间隔 > 3.5s），将截止时间后移补齐，防止被浏览器休眠误罚
        if (elapsedSinceLastTick > 3500 && !this.state.currentSurgeCheck.isAnswered) {
          this.state.currentSurgeCheck.deadlineTimestamp += elapsedSinceLastTick - 1000;
        }
        const surgeRemaining = Math.max(0, Math.ceil((this.state.currentSurgeCheck.deadlineTimestamp - now) / 1000));
        this.state.currentSurgeCheck.remainingSeconds = surgeRemaining;
        if (surgeRemaining <= 0) {
          this.handleSurgeTimeout();
        }
      }

      this.notify();
    } else {
      this.completeContract();
    }
  }

  /**
   * 触发随机突击查岗
   */
  private triggerSurgeCheck() {
    const qIndex = Math.floor(Math.random() * this.SURGE_QUESTIONS.length);
    const question = this.SURGE_QUESTIONS[qIndex];

    const surgeEvent: SurgeCheckEvent = {
      id: `surge-${Date.now()}`,
      question,
      deadlineTimestamp: Date.now() + 15000,
      remainingSeconds: 15,
      isAnswered: false,
    };

    this.state.currentSurgeCheck = surgeEvent;
    this.state.totalSurgeChecks++;
    this.addLog(`🚨 【突袭查岗】发起！"${question}" (限时 15 秒应答)`);

    // 物理震动与硬件脉冲
    HapticEngine.heavyShock();
    const device = DeviceManager.getInstance();
    void Promise.allSettled([
      device.sendEmsWave('AB', 'electric_sting'),
      device.playToyPattern('piston_burst', 4),
    ]).then((results) => {
      results.forEach((result) => {
        if (result.status === 'rejected') this.addLog(`⚠️ 硬件动作未执行：${String(result.reason?.message || result.reason)}`);
      });
    });

    void TTSManager.getInstance().speak(question);
    this.notify();
  }

  /**
   * 用户应答查岗
   */
  answerSurgeCheck(userAnswer: string = '服从') {
    if (!this.state.currentSurgeCheck || this.state.currentSurgeCheck.isAnswered) return;

    this.state.currentSurgeCheck.isAnswered = true;
    this.state.currentSurgeCheck.passed = true;
    this.state.passedSurgeChecks++;

    HapticEngine.successTada();
    this.addLog(`✅ 查岗应答合格！回答: "${String(userAnswer).slice(0, 500)}"，表现优异。`);

    const praises = [
      '很好，态度还算端正，允许你稍微缓一口气。',
      '听到了。姿势不要乱，继续保持。',
      '不错，算你反应快。下一波随时可能降临。',
    ];
    const p = praises[Math.floor(Math.random() * praises.length)];
    void TTSManager.getInstance().speak(p);

    const device = DeviceManager.getInstance();
    void device.sendEmsWave('AB', 'breathe').catch((error) => {
      this.addLog(`⚠️ 舒缓波形未执行：${String(error?.message || error)}`);
    });

    if (this.surgeResetTimer) clearTimeout(this.surgeResetTimer);
    const eventId = this.state.currentSurgeCheck.id;
    const generation = this.contractGeneration;
    this.surgeResetTimer = setTimeout(() => {
      if (generation !== this.contractGeneration || this.state.currentSurgeCheck?.id !== eventId) return;
      this.state.currentSurgeCheck = null;
      this.surgeResetTimer = null;
      this.scheduleNextSurge();
      this.notify();
    }, 2000);
  }

  /**
   * 查岗超时未应答 (受罚延长)
   */
  private handleSurgeTimeout() {
    if (!this.state.currentSurgeCheck || this.state.currentSurgeCheck.isAnswered) return;

    this.state.currentSurgeCheck.isAnswered = true;
    this.state.currentSurgeCheck.passed = false;
    this.state.failedSurgeChecks++;

    // 惩罚：契约绝对截止时间延长 2 分钟 (120 秒)
    this.targetEndTime += 120 * 1000;
    this.state.remainingSeconds += 120;
    this.addLog(`❌ 查岗超时！判定为怠慢！契约强制延长 2 分钟并执行惩戒狂暴！`);

    HapticEngine.heavyShock();
    const rebukes = [
      '敢把我的话当耳旁风？走神是吧？给你尝尝不听话的滋味！',
      '超时未答，规矩全忘了？加罚 2 分钟，好好受着！',
      '这么慢才反应？看来惩罚力度还是不够，立刻加压！',
    ];
    const r = rebukes[Math.floor(Math.random() * rebukes.length)];
    void TTSManager.getInstance().speak(r);

    const device = DeviceManager.getInstance();
    void Promise.allSettled([
      device.sendEmsWave('AB', 'punish_thunder'),
      device.playToyPattern('punishment_surge', 8),
    ]);

    if (this.surgeResetTimer) clearTimeout(this.surgeResetTimer);
    const eventId = this.state.currentSurgeCheck.id;
    const generation = this.contractGeneration;
    this.surgeResetTimer = setTimeout(() => {
      if (generation !== this.contractGeneration || this.state.currentSurgeCheck?.id !== eventId) return;
      this.state.currentSurgeCheck = null;
      this.surgeResetTimer = null;
      this.scheduleNextSurge();
      this.notify();
    }, 3000);
  }

  /**
   * 契约圆满完成
   */
  private completeContract() {
    HapticEngine.successTada();
    this.addLog(`🎉 恭喜！赛博服从契约圆满履行完成！总时长已达标，控制权归还。`);
    void TTSManager.getInstance().speak('契约时间已全部结束。今天的表现我很满意，控制权已归还给你，辛苦了。');

    this.stopContract(false);
  }

  /**
   * 终止契约
   */
  stopContract(isEmergency: boolean = false) {
    const wasActive = this.state.isActive;
    this.contractGeneration++;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.surgeResetTimer) {
      clearTimeout(this.surgeResetTimer);
      this.surgeResetTimer = null;
    }

    if (this.state.isActive && isEmergency) {
      HapticEngine.heavyShock();
      this.addLog(`🛑 契约被紧急安全中断！`);
    }

    this.state.isActive = false;
    this.state.currentSurgeCheck = null;
    this.notify();
    if (wasActive) void DeviceManager.getInstance().emergencyStop();
  }
}
