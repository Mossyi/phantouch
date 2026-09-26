import { Achievement } from '../../types';
import { INITIAL_ACHIEVEMENTS } from './achievementData';
import { TTSManager } from '../voice/ttsManager';

export type AchievementListener = (achievements: Achievement[], lastUnlocked: Achievement | null) => void;

interface AchievementMetrics {
  waveIds: string[];
  clearedScriptIds: string[];
  endingTypes: string[];
  ritualIds: string[];
  trainingTaskCount: number;
  adaptiveSeconds: number;
}

const DEFAULT_TITLE = '⚡ 赛博探索者';
const TOTAL_DUNGEON_SCRIPTS = 15;

/**
 * 役次元 赛博成就墙与专属头衔引擎
 */
export class AchievementEngine {
  private static instance: AchievementEngine;

  private achievements: Achievement[] = [];
  private equippedTitle: string = DEFAULT_TITLE;
  private listeners: Set<AchievementListener> = new Set();
  private lastUnlocked: Achievement | null = null;
  private unlockQueue: Achievement[] = [];
  private metrics: AchievementMetrics = { waveIds: [], clearedScriptIds: [], endingTypes: [], ritualIds: [], trainingTaskCount: 0, adaptiveSeconds: 0 };
  private clearUnlockTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.loadFromStorage();
    this.reconcileStoredMilestones();
  }

  static getInstance(): AchievementEngine {
    if (!AchievementEngine.instance) {
      AchievementEngine.instance = new AchievementEngine();
    }
    return AchievementEngine.instance;
  }

  private loadFromStorage() {
    this.achievements = INITIAL_ACHIEVEMENTS.map((item) => ({ ...item }));
    this.equippedTitle = DEFAULT_TITLE;
    this.metrics = { waveIds: [], clearedScriptIds: [], endingTypes: [], ritualIds: [], trainingTaskCount: 0, adaptiveSeconds: 0 };

    try {
      const savedAchievements = localStorage.getItem('ycy_achievements');
      if (savedAchievements) {
        const parsed = JSON.parse(savedAchievements);
        const map = new Map<string, number | null>();
        if (Array.isArray(parsed)) {
          parsed.forEach((a: unknown) => {
            if (!a || typeof a !== 'object') return;
            const item = a as { id?: unknown; unlockedAt?: unknown };
            if (typeof item.id !== 'string' || item.id.length > 100) return;
            const unlockedAt = Number(item.unlockedAt);
            map.set(item.id, Number.isFinite(unlockedAt) && unlockedAt > 0 && unlockedAt <= Date.now() + 300_000
              ? unlockedAt
              : null);
          });
        }

        this.achievements = INITIAL_ACHIEVEMENTS.map((item) => ({
          ...item,
          unlockedAt: map.has(item.id) ? map.get(item.id)! : null,
        }));
      }
    } catch {}

    try {
      const savedMetrics = localStorage.getItem('ycy_achievement_metrics');
      if (savedMetrics) {
        const parsed = JSON.parse(savedMetrics) as Partial<AchievementMetrics> | null;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('成就指标存档格式无效');
        this.metrics = {
          waveIds: Array.isArray(parsed.waveIds)
            ? [...new Set(parsed.waveIds.filter((id): id is string => typeof id === 'string' && id.length <= 100))].slice(0, 64)
            : [],
          clearedScriptIds: Array.isArray(parsed.clearedScriptIds)
            ? [...new Set(parsed.clearedScriptIds.filter((id): id is string => typeof id === 'string' && id.length <= 100))].slice(0, 64)
            : [],
          endingTypes: Array.isArray(parsed.endingTypes)
            ? [...new Set(parsed.endingTypes.filter((id): id is string => typeof id === 'string' && id.length <= 100))].slice(0, 16)
            : [],
          ritualIds: Array.isArray(parsed.ritualIds)
            ? [...new Set(parsed.ritualIds.filter((id): id is string => typeof id === 'string' && id.length <= 100))].slice(0, 32)
            : [],
          trainingTaskCount: Number.isFinite(Number(parsed.trainingTaskCount))
            ? Math.max(0, Math.min(100, Math.floor(Number(parsed.trainingTaskCount))))
            : 0,
          adaptiveSeconds: Number.isFinite(Number(parsed.adaptiveSeconds))
            ? Math.max(0, Math.min(864000, Math.round(Number(parsed.adaptiveSeconds))))
            : 0,
        };
      }
    } catch {}

    try {
      const savedTitle = localStorage.getItem('ycy_equipped_title');
      const allowedTitles = new Set([
        DEFAULT_TITLE,
        ...this.achievements.filter((item) => item.unlockedAt !== null).map((item) => item.rewardTitle),
      ]);
      this.equippedTitle = savedTitle && allowedTitles.has(savedTitle) ? savedTitle : DEFAULT_TITLE;
    } catch {}
  }

  private saveToStorage() {
    try {
      localStorage.setItem('ycy_achievements', JSON.stringify(this.achievements));
      localStorage.setItem('ycy_equipped_title', this.equippedTitle);
      localStorage.setItem('ycy_achievement_metrics', JSON.stringify(this.metrics));
    } catch {}
  }

  /** 补发升级前已经满足的新里程碑，避免出现进度已满但仍锁定。 */
  private reconcileStoredMilestones() {
    const eligibleIds = new Set<string>();
    const addAt = (value: number, threshold: number, id: string) => {
      if (value >= threshold) eligibleIds.add(id);
    };

    addAt(this.metrics.trainingTaskCount, 4, 'femboy_four_tasks');
    addAt(this.metrics.trainingTaskCount, 8, 'femboy_eight_tasks');
    addAt(this.metrics.trainingTaskCount, 16, 'femboy_sixteen_tasks');
    addAt(this.metrics.ritualIds.length, 1, 'femboy_first_ritual');
    addAt(this.metrics.ritualIds.length, 3, 'femboy_ritual_trio');
    addAt(this.metrics.waveIds.length, 3, 'hw_wave_sampler');
    addAt(this.metrics.waveIds.length, 6, 'hw_wave_explorer');
    addAt(this.metrics.waveIds.length, 12, 'hw_wave_master');
    addAt(this.metrics.clearedScriptIds.length, 1, 'dungeon_first_clear');
    addAt(this.metrics.clearedScriptIds.length, 3, 'dungeon_trilogy');
    addAt(this.metrics.clearedScriptIds.length, 5, 'dungeon_five_worlds');
    addAt(this.metrics.clearedScriptIds.length, 10, 'dungeon_ten_worlds');
    addAt(this.metrics.clearedScriptIds.length, TOTAL_DUNGEON_SCRIPTS, 'dungeon_grandmaster_mythic');
    addAt(this.metrics.endingTypes.length, 3, 'dungeon_multi_ending');
    addAt(this.metrics.adaptiveSeconds, 5 * 60, 'bio_five_minutes');
    addAt(this.metrics.adaptiveSeconds, 10 * 60, 'bio_ten_minutes');
    addAt(this.metrics.adaptiveSeconds, 20 * 60, 'bio_symbiosis_mythic');

    let changed = false;
    const now = Date.now();
    this.achievements.forEach((achievement) => {
      if (achievement.unlockedAt === null && eligibleIds.has(achievement.id)) {
        achievement.unlockedAt = now;
        changed = true;
      }
    });
    if (changed) this.saveToStorage();
  }

  subscribe(listener: AchievementListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const snapshot = this.getAchievements();
    const lastUnlocked = this.lastUnlocked ? { ...this.lastUnlocked } : null;
    this.listeners.forEach((listener) => {
      try { listener(snapshot, lastUnlocked); } catch (error) { console.warn('成就监听器执行失败:', error); }
    });
  }

  getAchievements(): Achievement[] {
    const progressById: Record<string, { current: number; max: number }> = {
      femboy_four_tasks: { current: this.metrics.trainingTaskCount, max: 4 },
      femboy_eight_tasks: { current: this.metrics.trainingTaskCount, max: 8 },
      femboy_sixteen_tasks: { current: this.metrics.trainingTaskCount, max: 16 },
      femboy_ritual_trio: { current: this.metrics.ritualIds.length, max: 3 },
      hw_wave_sampler: { current: this.metrics.waveIds.length, max: 3 },
      hw_wave_explorer: { current: this.metrics.waveIds.length, max: 6 },
      hw_wave_master: { current: this.metrics.waveIds.length, max: 12 },
      dungeon_trilogy: { current: this.metrics.clearedScriptIds.length, max: 3 },
      dungeon_five_worlds: { current: this.metrics.clearedScriptIds.length, max: 5 },
      dungeon_ten_worlds: { current: this.metrics.clearedScriptIds.length, max: 10 },
      dungeon_multi_ending: { current: this.metrics.endingTypes.length, max: 3 },
      dungeon_grandmaster_mythic: { current: this.metrics.clearedScriptIds.length, max: TOTAL_DUNGEON_SCRIPTS },
      bio_five_minutes: { current: Math.floor(this.metrics.adaptiveSeconds / 60), max: 5 },
      bio_ten_minutes: { current: Math.floor(this.metrics.adaptiveSeconds / 60), max: 10 },
      bio_symbiosis_mythic: { current: Math.floor(this.metrics.adaptiveSeconds / 60), max: 20 },
    };
    return this.achievements.map((item) => ({
      ...item,
      progress: progressById[item.id]
        ? { current: Math.min(progressById[item.id].current, progressById[item.id].max), max: progressById[item.id].max }
        : item.progress ? { ...item.progress } : undefined,
    }));
  }

  getEquippedTitle(): string {
    return this.equippedTitle;
  }

  getUnlockedCount(): number {
    return this.achievements.filter((a) => a.unlockedAt !== null).length;
  }

  getTotalCount(): number {
    return this.achievements.length;
  }

  getProgressPercent(): number {
    return Math.round((this.getUnlockedCount() / this.getTotalCount()) * 100);
  }

  /**
   * 解锁指定成就
   */
  unlock(achievementId: string): boolean {
    const ach = this.achievements.find((a) => a.id === achievementId);
    if (!ach || ach.unlockedAt !== null) {
      return false; // 已解锁过或不存在
    }

    const now = Date.now();
    ach.unlockedAt = now;
    this.saveToStorage();

    // 触发震动反馈
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100, 50, 200]);
      } catch {}
    }

    // 播放专属成就语音
    if (ach.hiddenRewardVoice) {
      setTimeout(() => {
        void TTSManager.getInstance().speak(`恭喜解锁成就：${ach.title}！${ach.hiddenRewardVoice}`);
      }, 500);
    }

    this.unlockQueue.push(ach);
    if (!this.lastUnlocked) {
      this.processNextUnlockNotification();
    } else {
      this.notify();
    }

    return true;
  }

  private processNextUnlockNotification() {
    if (this.clearUnlockTimer) clearTimeout(this.clearUnlockTimer);
    const next = this.unlockQueue.shift();
    if (!next) {
      this.lastUnlocked = null;
      this.notify();
      return;
    }
    this.lastUnlocked = next;
    this.notify();
    this.clearUnlockTimer = setTimeout(() => {
      this.processNextUnlockNotification();
    }, 4500);
  }

  /**
   * 佩戴/更换专属头衔
   */
  equipTitle(title: string): boolean {
    const isAllowed = title === DEFAULT_TITLE || this.achievements.some(
      (item) => item.unlockedAt !== null && item.rewardTitle === title
    );
    if (!isAllowed) return false;
    this.equippedTitle = title;
    this.saveToStorage();
    this.notify();
    void TTSManager.getInstance().speak(`已成功佩戴称号：${title}`);
    return true;
  }

  /**
   * 检查成就并自动触发关联
   */
  checkHardwareAction(type: string, target?: string, val?: number) {
    if (type === 'ems_strength' && Number.isFinite(val) && val! > 0) {
      this.unlock('hw_first_shock');
    }
    if (type === 'ems_wave' && target) {
      if (!this.metrics.waveIds.includes(target)) {
        this.metrics.waveIds.push(target);
        this.metrics.waveIds = this.metrics.waveIds.slice(-64);
        this.saveToStorage();
      }
      if (this.metrics.waveIds.length >= 3) this.unlock('hw_wave_sampler');
      if (this.metrics.waveIds.length >= 6) this.unlock('hw_wave_explorer');
      if (this.metrics.waveIds.length >= 12) this.unlock('hw_wave_master');
    }
    if (target === 'nine_shallow_one_deep') {
      this.unlock('hw_nine_shallow_deep');
    }
    if (val && val >= 20) {
      this.unlock('hw_turbo_overclock');
    }
    if (type === 'toy_motor' && Number.isFinite(val) && val! > 0) {
      this.unlock('hw_first_toy');
      if (val! >= 10) this.unlock('hw_toy_ten');
    }
    if (type === 'toy_pattern' && target) this.unlock('hw_first_pattern');
    if (type === 'enema_fill' || type === 'enema_drain') this.unlock('hw_first_enema');
    if (type === 'stop') {
      this.unlock('hw_emergency_stop_master');
    }
    this.notify();
  }

  checkDungeonClear(scriptId: string, isFemboy?: boolean, endingType?: string) {
    this.unlock('dungeon_first_clear');

    if (scriptId && !this.metrics.clearedScriptIds.includes(scriptId)) {
      this.metrics.clearedScriptIds.push(scriptId);
      this.metrics.clearedScriptIds = this.metrics.clearedScriptIds.slice(-64);
      this.saveToStorage();
    }
    if (this.metrics.clearedScriptIds.length >= TOTAL_DUNGEON_SCRIPTS) {
      this.unlock('dungeon_grandmaster_mythic');
    }
    if (endingType && !this.metrics.endingTypes.includes(endingType)) {
      this.metrics.endingTypes.push(endingType);
      this.metrics.endingTypes = this.metrics.endingTypes.slice(-16);
      this.saveToStorage();
    }
    if (this.metrics.clearedScriptIds.length >= 3) this.unlock('dungeon_trilogy');
    if (this.metrics.clearedScriptIds.length >= 5) this.unlock('dungeon_five_worlds');
    if (this.metrics.clearedScriptIds.length >= 10) this.unlock('dungeon_ten_worlds');
    if (this.metrics.endingTypes.length >= 3) this.unlock('dungeon_multi_ending');

    if (isFemboy) {
      this.unlock('femboy_first_step');
      if (endingType === 'surrender') {
        this.unlock('femboy_first_dress');
      }
    }

    if (scriptId === 'dom_interrogation') {
      this.unlock('dungeon_agent_survivor');
    } else if (scriptId === 'dom_queen_throne') {
      this.unlock('dungeon_queen_servant');
    } else if (scriptId === 'dom_submarine_enema') {
      this.unlock('dungeon_deep_sea_sailor');
    } else if (scriptId === 'femboy_succubus_school') {
      this.unlock('femboy_succubus_grad');
    } else if (scriptId === 'femboy_prostate_awakening') {
      this.unlock('femboy_prostate_touch');
    }
    this.notify();
  }

  checkFemboyProgress(completedTaskCount: number) {
    if (!Number.isFinite(completedTaskCount)) return;
    this.metrics.trainingTaskCount = Math.max(this.metrics.trainingTaskCount, Math.min(100, Math.floor(completedTaskCount)));
    this.saveToStorage();
    if (this.metrics.trainingTaskCount >= 4) this.unlock('femboy_four_tasks');
    if (this.metrics.trainingTaskCount >= 8) this.unlock('femboy_eight_tasks');
    if (this.metrics.trainingTaskCount >= 16) this.unlock('femboy_sixteen_tasks');
    this.notify();
  }

  checkRitualComplete(ritualId: string) {
    if (!ritualId || ritualId.length > 100) return;
    this.unlock('femboy_first_ritual');
    if (!this.metrics.ritualIds.includes(ritualId)) {
      this.metrics.ritualIds.push(ritualId);
      this.metrics.ritualIds = this.metrics.ritualIds.slice(-32);
      this.saveToStorage();
    }
    if (this.metrics.ritualIds.length >= 3) this.unlock('femboy_ritual_trio');
    this.notify();
  }

  checkHeartRateEvent(event: 'connect' | 'calm_warm' | 'edge_brake') {
    if (event === 'connect') {
      this.unlock('bio_first_pulse');
    } else if (event === 'calm_warm') {
      this.unlock('bio_caught_slacking');
    } else if (event === 'edge_brake') {
      this.unlock('bio_edge_brake');
    }
  }

  recordAdaptiveLoopTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.metrics.adaptiveSeconds = Math.min(864000, this.metrics.adaptiveSeconds + Math.min(30, seconds));
    this.saveToStorage();
    if (this.metrics.adaptiveSeconds >= 5 * 60) this.unlock('bio_five_minutes');
    if (this.metrics.adaptiveSeconds >= 10 * 60) this.unlock('bio_ten_minutes');
    if (this.metrics.adaptiveSeconds >= 20 * 60) this.unlock('bio_symbiosis_mythic');
    this.notify();
  }
}
