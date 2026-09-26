import { FemboyTrainingState, FemboyTrainingSession, TrainingTask, TrainingStage } from '../../types';
import { FEMBOY_STAGE_GUIDES, FEMBOY_TRAINING_TASKS } from './femboyTasksData';
import { DeviceManager } from '../deviceManager';
import { TTSManager } from '../voice/ttsManager';
import { AchievementEngine } from '../achievements/achievementEngine';

export type FemboyTrainingListener = (state: FemboyTrainingState) => void;

/**
 * 役次元 阶段化雌堕重塑特训营引擎
 */
export class FemboyTrainingEngine {
  private static instance: FemboyTrainingEngine;

  private state: FemboyTrainingState = {
    currentStage: 1,
    totalTrainingMinutes: 0,
    completedTaskIds: [],
    activeSession: null,
    dailyStreak: 0,
    lastCheckInDate: null,
  };

  private listeners: Set<FemboyTrainingListener> = new Set();
  private timer: any = null;
  private outroTimer: any = null;
  private sessionGeneration = 0;
  private motivationalTips = [
    '检查呼吸是否顺畅，肩颈是否放松；需要时可以随时暂停。',
    '只调整一个动作细节，稳定完成比勉强坚持更重要。',
    '留意身体的绿灯、黄灯与红灯信号，黄灯出现就主动降级。',
    '暂停不会扣除进度。确认状态合适后，再决定是否继续。',
  ];

  private stopHardwareOutputs() {
    const manager = DeviceManager.getInstance();
    return Promise.allSettled([manager.setEmsStrength('AB', 0), manager.stopToy()]);
  }

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): FemboyTrainingEngine {
    if (!FemboyTrainingEngine.instance) {
      FemboyTrainingEngine.instance = new FemboyTrainingEngine();
    }
    return FemboyTrainingEngine.instance;
  }

  private loadFromStorage() {
    try {
      const saved = localStorage.getItem('ycy_femboy_training');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed || typeof parsed !== 'object') return;
        const validTaskIds = new Set(FEMBOY_TRAINING_TASKS.map((task) => task.id));
        const totalTrainingMinutes = Number(parsed.totalTrainingMinutes);
        const dailyStreak = Number(parsed.dailyStreak);
        const completedTaskIds: string[] = Array.isArray(parsed.completedTaskIds)
          ? parsed.completedTaskIds.filter((id: unknown): id is string => typeof id === 'string' && validTaskIds.has(id))
          : [];
        const lastCheckInDate = typeof parsed.lastCheckInDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.lastCheckInDate)
          ? parsed.lastCheckInDate
          : null;
        this.state = {
          ...this.state,
          totalTrainingMinutes: Number.isFinite(totalTrainingMinutes)
            ? Math.max(0, Math.min(1_000_000, totalTrainingMinutes))
            : 0,
          completedTaskIds: [...new Set(completedTaskIds)],
          dailyStreak: Number.isFinite(dailyStreak) ? Math.max(0, Math.min(100_000, Math.floor(dailyStreak))) : 0,
          lastCheckInDate,
          activeSession: null,
        };
        this.checkStageAdvancement();
      }
    } catch {}
  }

  private saveToStorage() {
    try {
      const toSave = {
        currentStage: this.state.currentStage,
        totalTrainingMinutes: this.state.totalTrainingMinutes,
        completedTaskIds: this.state.completedTaskIds,
        dailyStreak: this.state.dailyStreak,
        lastCheckInDate: this.state.lastCheckInDate,
      };
      localStorage.setItem('ycy_femboy_training', JSON.stringify(toSave));
    } catch {}
  }

  subscribe(listener: FemboyTrainingListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(s);
      } catch (error) {
        console.error('特训状态订阅回调执行失败:', error);
      }
    });
  }

  getState(): FemboyTrainingState {
    return JSON.parse(JSON.stringify(this.state));
  }

  getTasks(): TrainingTask[] {
    return FEMBOY_TRAINING_TASKS;
  }

  getTaskById(id: string): TrainingTask | undefined {
    return FEMBOY_TRAINING_TASKS.find((t) => t.id === id);
  }

  private async applyHardwareConfig(task: TrainingTask, durationSeconds: number, generation: number) {
    const dev = DeviceManager.getInstance();
    const cfg = task.hardwareConfig;
    const isCurrentSession = () => (
      generation === this.sessionGeneration &&
      this.state.activeSession?.taskId === task.id &&
      !this.state.activeSession.isPaused
    );
    try {
      // 波形先选定，再发送包含当前模式的强度包，避免 BLE 写入队列读取到旧波形。
      if (!isCurrentSession()) return;
      if (cfg.emsWave) await dev.sendEmsWave('AB', cfg.emsWave);
      if (!isCurrentSession()) return;
      if (cfg.emsStrengthA) await dev.setEmsStrength('A', cfg.emsStrengthA);
      if (!isCurrentSession()) return;
      if (cfg.emsStrengthB) await dev.setEmsStrength('B', cfg.emsStrengthB);
      if (!isCurrentSession()) return;
      if (cfg.toyPattern) await dev.playToyPattern(cfg.toyPattern, durationSeconds);
      else if (cfg.toyMotorRate) await dev.setToyMotor(cfg.toyMotorRate, 0, 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const activeSession = this.state.activeSession;
      if (isCurrentSession() && activeSession) {
        activeSession.isPaused = true;
        activeSession.currentTip = `硬件启动失败：${message}。任务已暂停，请检查设备类型或连接模式。`;
        await this.stopHardwareOutputs();
        this.notify();
      }
    }
  }

  /**
   * 启动特训任务
   */
  startTask(taskId: string, hardwareEnabled = false): boolean {
    const task = this.getTaskById(taskId);
    if (!task || task.stage > this.state.currentStage) return false;

    // 终止可能在运行的会话
    this.abortTask(false);

    const totalSec = Math.max(1, Math.round(task.durationMinutes * 60));
    const newSession: FemboyTrainingSession = {
      taskId: task.id,
      stage: task.stage,
      totalSeconds: totalSec,
      remainingSeconds: totalSec,
      isPaused: false,
      startedAt: Date.now(),
      currentTip: task.description,
      hardwareEnabled,
    };

    this.state.activeSession = newSession;
    this.notify();

    // 1. 下发硬件参数
    const generation = this.sessionGeneration;
    if (hardwareEnabled) void this.applyHardwareConfig(task, totalSec, generation);

    // 2. 播报导师开场语音
    if (task.mentorVoiceIntro) {
      void TTSManager.getInstance().speak(task.mentorVoiceIntro);
    }

    // 3. 启动计时器
    this.timer = setInterval(() => {
      this.tick();
    }, 1000);

    return true;
  }

  private tick() {
    if (!this.state.activeSession || this.state.activeSession.isPaused) return;

    const elapsedSeconds = Math.floor((Date.now() - this.state.activeSession.startedAt) / 1000);
    this.state.activeSession.remainingSeconds = Math.max(0, this.state.activeSession.totalSeconds - elapsedSeconds);

    // 周期性更换提示或语音提醒
    if (this.state.activeSession.remainingSeconds % 60 === 0 && this.state.activeSession.remainingSeconds > 0) {
      const idx = Math.floor(Math.random() * this.motivationalTips.length);
      this.state.activeSession.currentTip = this.motivationalTips[idx];
    }

    if (this.state.activeSession.remainingSeconds <= 0) {
      this.completeTask();
    } else {
      this.notify();
    }
  }

  pauseTask() {
    if (this.state.activeSession) {
      this.sessionGeneration++;
      this.state.activeSession.isPaused = true;
      void this.stopHardwareOutputs();
      this.notify();
    }
  }

  resumeTask() {
    if (this.state.activeSession) {
      const generation = ++this.sessionGeneration;
      this.state.activeSession.isPaused = false;
      this.state.activeSession.startedAt = Date.now() - (this.state.activeSession.totalSeconds - this.state.activeSession.remainingSeconds) * 1000;
      const task = this.getTaskById(this.state.activeSession.taskId);
      if (task && this.state.activeSession.hardwareEnabled) {
        void this.applyHardwareConfig(task, this.state.activeSession.remainingSeconds, generation);
      }
      this.notify();
    }
  }

  /**
   * 特训任务顺利完成
   */
  completeTask() {
    if (!this.state.activeSession) return;

    this.sessionGeneration++;
    const task = this.getTaskById(this.state.activeSession.taskId);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const durationMins = task ? task.durationMinutes : 5;
    this.state.totalTrainingMinutes += durationMins;

    // 打卡记录
    const todayDate = new Date();
    const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
    if (this.state.lastCheckInDate !== today) {
      const lastDate = this.state.lastCheckInDate ? new Date(`${this.state.lastCheckInDate}T00:00:00`) : null;
      const dayDiff = lastDate && Number.isFinite(lastDate.getTime())
        ? Math.round((new Date(`${today}T00:00:00`).getTime() - lastDate.getTime()) / 86400000)
        : null;
      this.state.dailyStreak = dayDiff === 1 ? this.state.dailyStreak + 1 : 1;
      this.state.lastCheckInDate = today;
    }

    if (task && !this.state.completedTaskIds.includes(task.id)) {
      this.state.completedTaskIds.push(task.id);
    }

    // 检查阶段解锁晋级
    this.checkStageAdvancement();

    // 联动成就解锁
    const ach = AchievementEngine.getInstance();
    ach.unlock('femboy_first_step');
    ach.checkFemboyProgress(this.state.completedTaskIds.length);
    if (task?.stage && task.stage >= 2) {
      ach.unlock('femboy_first_dress');
    }
    if (task?.stage && task.stage >= 3) {
      ach.unlock('femboy_prostate_touch');
    }
    if (this.state.completedTaskIds.length >= FEMBOY_TRAINING_TASKS.length) {
      ach.unlock('femboy_master_mythic');
    }

    // 播报结算语音
    if (task?.mentorVoiceOutro) {
      const generation = this.sessionGeneration;
      this.outroTimer = setTimeout(() => {
        if (generation === this.sessionGeneration) void TTSManager.getInstance().speak(task.mentorVoiceOutro);
      }, 500);
    }

    // 停止硬件设备
    void this.stopHardwareOutputs();

    this.state.activeSession = null;
    this.saveToStorage();
    this.notify();
  }

  private checkStageAdvancement() {
    const stage1Count = FEMBOY_TRAINING_TASKS.filter((t) => t.stage === 1 && this.state.completedTaskIds.includes(t.id)).length;
    const stage2Count = FEMBOY_TRAINING_TASKS.filter((t) => t.stage === 2 && this.state.completedTaskIds.includes(t.id)).length;
    const stage3Count = FEMBOY_TRAINING_TASKS.filter((t) => t.stage === 3 && this.state.completedTaskIds.includes(t.id)).length;

    if (stage3Count >= FEMBOY_STAGE_GUIDES[3].required) {
      this.state.currentStage = 4;
    } else if (stage2Count >= FEMBOY_STAGE_GUIDES[2].required) {
      this.state.currentStage = 3;
    } else if (stage1Count >= FEMBOY_STAGE_GUIDES[1].required) {
      this.state.currentStage = 2;
    } else {
      this.state.currentStage = 1;
    }
  }

  /**
   * 中断/放弃特训
   */
  abortTask(speakAlert: boolean = true) {
    this.sessionGeneration++;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.outroTimer) {
      clearTimeout(this.outroTimer);
      this.outroTimer = null;
    }

    if (this.state.activeSession) {
      void this.stopHardwareOutputs();
      if (speakAlert) {
        void TTSManager.getInstance().speak('特训已强行中断。身体需要休息，调整好状态再来继续吧。');
      }
      this.state.activeSession = null;
      this.notify();
    }
  }
}
