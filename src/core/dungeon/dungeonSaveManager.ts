import { DungeonEndingType, DungeonRunState, DungeonStep, DungeonChoice } from '../../types';
import { DEFAULT_DUNGEON_RUN_STATE, normalizeDungeonRunState } from './dungeonRunState';

export interface DungeonHistoryItem {
  stepId: string;
  speaker: string;
  avatar: string;
  narrative: string;
  dialogue: string;
  chosenText?: string;
  stateAfter?: DungeonRunState;
  timestamp: number;
}

export interface DungeonSaveRecord {
  scriptId: string;
  currentStepId: string;
  history: DungeonHistoryItem[];
  customSteps?: Record<string, DungeonStep>;
  runState: DungeonRunState;
  totalWordsRead: number;
  progressPct: number;
  lastUpdated: number;
}

export interface DungeonEndingRecord {
  id: string;
  scriptId: string;
  title: string;
  description: string;
  type: DungeonEndingType;
  routeSummary: string;
  state: DungeonRunState;
  unlockedAt: number;
}

export interface DungeonManualSlot {
  slot: 1 | 2 | 3;
  label: string;
  savedAt: number;
  record: DungeonSaveRecord;
}

const STORAGE_KEY_SAVES = 'ycy_dungeon_script_saves_v2';
const STORAGE_KEY_LAST_SCRIPT = 'ycy_dungeon_last_active_script_id';
const STORAGE_KEY_UNLOCKED_ENDINGS = 'ycy_dungeon_unlocked_endings_v2';
const STORAGE_KEY_ENDING_GALLERY = 'ycy_dungeon_ending_gallery_v1';
const STORAGE_KEY_MANUAL_SLOTS = 'ycy_dungeon_manual_slots_v1';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const normalizeChoice = (value: unknown, index: number): DungeonChoice | null => {
  if (!isRecord(value) || typeof value.text !== 'string' || typeof value.replyDialogue !== 'string' || typeof value.nextStepId !== 'string') {
    return null;
  }
  const attitudes: DungeonChoice['attitude'][] = ['submissive', 'defiant', 'begging', 'neutral'];
  const attitude = attitudes.includes(value.attitude as DungeonChoice['attitude'])
    ? value.attitude as DungeonChoice['attitude']
    : 'neutral';
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.slice(0, 200) : `choice-${index}`;
  const choice: DungeonChoice = {
    id,
    text: value.text.slice(0, 4000),
    attitude,
    replyDialogue: value.replyDialogue.slice(0, 20_000),
    nextStepId: value.nextStepId.slice(0, 200),
  };

  if (isRecord(value.hardwareAction)) {
    const actionTypes = ['ems_wave', 'ems_strength', 'toy_pattern', 'toy_turbo', 'enema_pattern', 'stop'] as const;
    const actionType = value.hardwareAction.type;
    if (actionTypes.includes(actionType as typeof actionTypes[number]) && typeof value.hardwareAction.target === 'string') {
      const numericValue = Number(value.hardwareAction.value);
      const durationSec = Number(value.hardwareAction.durationSec);
      choice.hardwareAction = {
        type: actionType as DungeonChoice['hardwareAction'] extends infer T ? T extends { type: infer U } ? U : never : never,
        target: value.hardwareAction.target.slice(0, 200),
        value: Number.isFinite(numericValue) ? numericValue : undefined,
        durationSec: Number.isFinite(durationSec) ? Math.max(0, Math.min(86_400, durationSec)) : undefined,
      };
    }
  }

  if (typeof value.endingTitle === 'string') choice.endingTitle = value.endingTitle.slice(0, 500);
  if (typeof value.endingDesc === 'string') choice.endingDesc = value.endingDesc.slice(0, 20_000);
  if (['surrender', 'conquer', 'punished', 'released'].includes(String(value.endingType))) {
    choice.endingType = value.endingType as DungeonChoice['endingType'];
  }
  return choice;
};

const normalizeStep = (value: unknown, fallbackId: string): DungeonStep | null => {
  if (!isRecord(value) || typeof value.narrative !== 'string' || typeof value.dialogue !== 'string' || !Array.isArray(value.choices)) {
    return null;
  }
  const choices = value.choices
    .slice(0, 30)
    .map(normalizeChoice)
    .filter((choice): choice is DungeonChoice => choice !== null);
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.slice(0, 200) : fallbackId,
    speaker: typeof value.speaker === 'string' ? value.speaker.slice(0, 500) : '',
    avatar: typeof value.avatar === 'string' ? value.avatar.slice(0, 100) : '📖',
    narrative: value.narrative.slice(0, 100_000),
    dialogue: value.dialogue.slice(0, 100_000),
    choices,
    generationSource: ['cloud', 'local', 'offline'].includes(String(value.generationSource))
      ? value.generationSource as DungeonStep['generationSource']
      : undefined,
    generationNotice: typeof value.generationNotice === 'string' ? value.generationNotice.slice(0, 1000) : undefined,
  };
};

const normalizeHistoryItem = (value: unknown): DungeonHistoryItem | null => {
  if (!isRecord(value) || typeof value.stepId !== 'string' || typeof value.narrative !== 'string' || typeof value.dialogue !== 'string') {
    return null;
  }
  const timestamp = Number(value.timestamp);
  return {
    stepId: value.stepId.slice(0, 200),
    speaker: typeof value.speaker === 'string' ? value.speaker.slice(0, 500) : '',
    avatar: typeof value.avatar === 'string' ? value.avatar.slice(0, 100) : '📖',
    narrative: value.narrative.slice(0, 100_000),
    dialogue: value.dialogue.slice(0, 100_000),
    chosenText: typeof value.chosenText === 'string' ? value.chosenText.slice(0, 4000) : undefined,
    stateAfter: value.stateAfter ? normalizeDungeonRunState(value.stateAfter) : undefined,
    timestamp: Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : Date.now(),
  };
};

const normalizeSaveRecord = (value: unknown, storageKey: string): DungeonSaveRecord | null => {
  if (!isRecord(value) || typeof value.currentStepId !== 'string') return null;
  const scriptId = typeof value.scriptId === 'string' && value.scriptId === storageKey ? value.scriptId : storageKey;
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(scriptId)) return null;
  const history = Array.isArray(value.history)
    ? value.history.slice(-500).map(normalizeHistoryItem).filter((item): item is DungeonHistoryItem => item !== null)
    : [];
  const customSteps: Record<string, DungeonStep> = {};
  if (isRecord(value.customSteps)) {
    Object.entries(value.customSteps).slice(0, 500).forEach(([stepId, stepValue]) => {
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(stepId)) return;
      const step = normalizeStep(stepValue, stepId);
      if (step) customSteps[stepId] = step;
    });
  }
  const totalWordsRead = Number(value.totalWordsRead);
  const progressPct = Number(value.progressPct);
  const lastUpdated = Number(value.lastUpdated);
  return {
    scriptId,
    currentStepId: value.currentStepId.slice(0, 200),
    history,
    customSteps,
    runState: normalizeDungeonRunState(value.runState),
    totalWordsRead: Number.isFinite(totalWordsRead) ? Math.max(0, Math.min(100_000_000, totalWordsRead)) : 0,
    progressPct: Number.isFinite(progressPct) ? Math.max(0, Math.min(100, progressPct)) : 0,
    lastUpdated: Number.isFinite(lastUpdated) && lastUpdated >= 0 ? lastUpdated : Date.now(),
  };
};

export class DungeonSaveManager {
  private static instance: DungeonSaveManager;

  static getInstance(): DungeonSaveManager {
    if (!DungeonSaveManager.instance) {
      DungeonSaveManager.instance = new DungeonSaveManager();
    }
    return DungeonSaveManager.instance;
  }

  /**
   * 获取所有剧本的存档数据
   */
  getAllSaves(): Record<string, DungeonSaveRecord> {
    try {
      const data = localStorage.getItem(STORAGE_KEY_SAVES);
      if (!data) return {};
      const parsed = JSON.parse(data);
      if (!isRecord(parsed)) return {};
      const result: Record<string, DungeonSaveRecord> = {};
      Object.entries(parsed).slice(0, 500).forEach(([scriptId, value]) => {
        const record = normalizeSaveRecord(value, scriptId);
        if (record) result[scriptId] = record;
      });
      return result;
    } catch {
      return {};
    }
  }

  /**
   * 获取单个剧本的专属存档
   */
  getSave(scriptId: string): DungeonSaveRecord | null {
    const all = this.getAllSaves();
    return all[scriptId] || null;
  }

  /**
   * 获取最后一次活跃游玩的剧本 ID
   */
  getLastActiveScriptId(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY_LAST_SCRIPT);
    } catch {
      return null;
    }
  }

  /**
   * 保存当前剧本的实时阅读位置与历史轨迹
   */
  saveProgress(
    scriptId: string,
    currentStepId: string,
    currentStep: DungeonStep,
    chosenText?: string,
    customStep?: DungeonStep,
    totalStepsInScript: number = 10,
    runState?: DungeonRunState,
  ): DungeonSaveRecord {
    const all = this.getAllSaves();
    const existing = all[scriptId] || {
      scriptId,
      currentStepId,
      history: [],
      customSteps: {},
      runState: { ...DEFAULT_DUNGEON_RUN_STATE },
      totalWordsRead: 0,
      progressPct: 0,
      lastUpdated: Date.now(),
    };

    const previousHistory = existing.history || [];
    const hasReadStep = previousHistory.some((item) => item.stepId === currentStepId);
    const hasRecordedChoice = Boolean(chosenText) && previousHistory.some(
      (item) => item.stepId === currentStepId && item.chosenText === chosenText
    );
    const addedWordCount =
      (hasReadStep ? 0 : (currentStep.narrative?.length || 0) + (currentStep.dialogue?.length || 0)) +
      (chosenText && !hasRecordedChoice ? chosenText.length : 0);
    const totalWords = (existing.totalWordsRead || 0) + addedWordCount;

    // 追加历史记录
    const historyItem: DungeonHistoryItem = {
      stepId: currentStepId,
      speaker: currentStep.speaker,
      avatar: currentStep.avatar || '📖',
      narrative: currentStep.narrative,
      dialogue: currentStep.dialogue,
      chosenText,
      stateAfter: normalizeDungeonRunState(runState || existing.runState),
      timestamp: Date.now(),
    };

    // 去重或追加
    const nextHistory = previousHistory.map((item) => ({ ...item }));
    const lastHistoryItem = nextHistory[nextHistory.length - 1];
    if (!lastHistoryItem || lastHistoryItem.stepId !== currentStepId) {
      nextHistory.push(historyItem);
    } else if (chosenText && !lastHistoryItem.chosenText) {
      lastHistoryItem.chosenText = chosenText;
      lastHistoryItem.stateAfter = normalizeDungeonRunState(runState || existing.runState);
    }
    const uniqueVisitedSteps = new Set(nextHistory.map((item) => item.stepId)).size;
    const progressPct = Math.min(100, Math.round((uniqueVisitedSteps / Math.max(totalStepsInScript, 1)) * 100));

    const nextCustomSteps = { ...(existing.customSteps || {}) };
    if (customStep) {
      nextCustomSteps[customStep.id] = customStep;
    }

    const updatedRecord: DungeonSaveRecord = {
      scriptId,
      currentStepId,
      history: nextHistory.slice(-500),
      customSteps: nextCustomSteps,
      runState: normalizeDungeonRunState(runState || existing.runState),
      totalWordsRead: totalWords,
      progressPct,
      lastUpdated: Date.now(),
    };

    all[scriptId] = updatedRecord;

    try {
      localStorage.setItem(STORAGE_KEY_SAVES, JSON.stringify(all));
      localStorage.setItem(STORAGE_KEY_LAST_SCRIPT, scriptId);
    } catch (e) {
      console.warn('保存地牢进度失败:', e);
    }

    return updatedRecord;
  }

  rewindToHistory(scriptId: string, historyIndex: number): DungeonSaveRecord | null {
    const all = this.getAllSaves();
    const existing = all[scriptId];
    if (!existing || !Number.isInteger(historyIndex) || historyIndex < 0 || historyIndex >= existing.history.length) return null;
    const history = existing.history.slice(0, historyIndex + 1);
    const target = history[history.length - 1];
    const updated: DungeonSaveRecord = {
      ...existing,
      currentStepId: target.stepId,
      history,
      runState: normalizeDungeonRunState(target.stateAfter),
      progressPct: Math.min(existing.progressPct, Math.round((history.length / Math.max(existing.history.length, 1)) * existing.progressPct)),
      lastUpdated: Date.now(),
    };
    all[scriptId] = updated;
    try {
      localStorage.setItem(STORAGE_KEY_SAVES, JSON.stringify(all));
      localStorage.setItem(STORAGE_KEY_LAST_SCRIPT, scriptId);
    } catch {}
    return updated;
  }

  getManualSlots(scriptId: string): DungeonManualSlot[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_MANUAL_SLOTS) || '{}');
      if (!isRecord(parsed) || !Array.isArray(parsed[scriptId])) return [];
      return parsed[scriptId].slice(0, 3).flatMap((value: unknown): DungeonManualSlot[] => {
        if (!isRecord(value)) return [];
        const slot = Number(value.slot);
        const record = normalizeSaveRecord(value.record, scriptId);
        if (![1, 2, 3].includes(slot) || !record) return [];
        const savedAt = Number(value.savedAt);
        return [{
          slot: slot as 1 | 2 | 3,
          label: typeof value.label === 'string' ? value.label.slice(0, 80) : `存档 ${slot}`,
          savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
          record,
        }];
      });
    } catch {
      return [];
    }
  }

  saveManualSlot(scriptId: string, slot: 1 | 2 | 3, label?: string): DungeonManualSlot | null {
    const record = this.getSave(scriptId);
    if (!record) return null;
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_MANUAL_SLOTS) || '{}');
      const all = isRecord(parsed) ? parsed : {};
      const current = this.getManualSlots(scriptId).filter((item) => item.slot !== slot);
      const saved: DungeonManualSlot = {
        slot,
        label: (label || `存档 ${slot} · ${record.currentStepId}`).slice(0, 80),
        savedAt: Date.now(),
        record: JSON.parse(JSON.stringify(record)),
      };
      all[scriptId] = [...current, saved].sort((left, right) => left.slot - right.slot);
      localStorage.setItem(STORAGE_KEY_MANUAL_SLOTS, JSON.stringify(all));
      return saved;
    } catch {
      return null;
    }
  }

  loadManualSlot(scriptId: string, slot: 1 | 2 | 3): DungeonSaveRecord | null {
    const saved = this.getManualSlots(scriptId).find((item) => item.slot === slot);
    if (!saved) return null;
    const all = this.getAllSaves();
    const record = { ...saved.record, lastUpdated: Date.now() };
    all[scriptId] = record;
    try {
      localStorage.setItem(STORAGE_KEY_SAVES, JSON.stringify(all));
      localStorage.setItem(STORAGE_KEY_LAST_SCRIPT, scriptId);
    } catch {
      return null;
    }
    return record;
  }

  /**
   * 重置单篇剧本的进度（重新开始）
   */
  resetScriptProgress(scriptId: string): void {
    const all = this.getAllSaves();
    delete all[scriptId];
    try {
      localStorage.setItem(STORAGE_KEY_SAVES, JSON.stringify(all));
      const last = localStorage.getItem(STORAGE_KEY_LAST_SCRIPT);
      if (last === scriptId) {
        localStorage.removeItem(STORAGE_KEY_LAST_SCRIPT);
      }
    } catch {}
  }

  /**
   * 删除自定义剧本时一并清理其进度、手动存档与结局记录。
   */
  deleteScriptData(scriptId: string): void {
    this.resetScriptProgress(scriptId);
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_MANUAL_SLOTS) || '{}');
      if (isRecord(parsed)) {
        delete parsed[scriptId];
        localStorage.setItem(STORAGE_KEY_MANUAL_SLOTS, JSON.stringify(parsed));
      }
    } catch {}
    try {
      const endings = this.getUnlockedEndings();
      delete endings[scriptId];
      localStorage.setItem(STORAGE_KEY_UNLOCKED_ENDINGS, JSON.stringify(endings));
    } catch {}
    try {
      const gallery = this.getEndingGallery().filter((ending) => ending.scriptId !== scriptId);
      localStorage.setItem(STORAGE_KEY_ENDING_GALLERY, JSON.stringify(gallery));
    } catch {}
  }

  /**
   * 记录已通关的结局
   */
  unlockEnding(scriptId: string, endingTitle: string): string[] {
    try {
      const all = this.getUnlockedEndings();
      const currentList = all[scriptId] || [];
      if (!currentList.includes(endingTitle)) {
        currentList.push(endingTitle);
        all[scriptId] = currentList;
        localStorage.setItem(STORAGE_KEY_UNLOCKED_ENDINGS, JSON.stringify(all));
      }
      return currentList;
    } catch {
      return [endingTitle];
    }
  }

  unlockDetailedEnding(record: Omit<DungeonEndingRecord, 'id' | 'unlockedAt'>): DungeonEndingRecord {
    const normalizedState = normalizeDungeonRunState(record.state);
    const id = `${record.scriptId}:${record.type}`;
    const ending: DungeonEndingRecord = {
      id,
      scriptId: record.scriptId.slice(0, 200),
      title: record.title.slice(0, 500),
      description: record.description.slice(0, 20_000),
      type: record.type,
      routeSummary: record.routeSummary.slice(0, 1000),
      state: normalizedState,
      unlockedAt: Date.now(),
    };
    try {
      const current = this.getEndingGallery().filter((item) => item.id !== id);
      localStorage.setItem(STORAGE_KEY_ENDING_GALLERY, JSON.stringify([...current, ending].slice(-500)));
    } catch {}
    return ending;
  }

  getEndingGallery(): DungeonEndingRecord[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_ENDING_GALLERY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(-500).flatMap((value: unknown): DungeonEndingRecord[] => {
        if (!isRecord(value) || typeof value.scriptId !== 'string' || typeof value.title !== 'string') return [];
        const type = String(value.type) as DungeonEndingType;
        if (!['surrender', 'conquer', 'punished', 'released'].includes(type)) return [];
        const unlockedAt = Number(value.unlockedAt);
        return [{
          id: typeof value.id === 'string' ? value.id.slice(0, 500) : `${value.scriptId}:${type}`,
          scriptId: value.scriptId.slice(0, 200),
          title: value.title.slice(0, 500),
          description: typeof value.description === 'string' ? value.description.slice(0, 20_000) : '',
          type,
          routeSummary: typeof value.routeSummary === 'string' ? value.routeSummary.slice(0, 1000) : '',
          state: normalizeDungeonRunState(value.state),
          unlockedAt: Number.isFinite(unlockedAt) ? unlockedAt : Date.now(),
        }];
      });
    } catch {
      return [];
    }
  }

  /**
   * 获取所有已解锁结局
   */
  getUnlockedEndings(): Record<string, string[]> {
    try {
      const data = localStorage.getItem(STORAGE_KEY_UNLOCKED_ENDINGS);
      if (!data) return {};
      const parsed = JSON.parse(data);
      if (!isRecord(parsed)) return {};
      const result: Record<string, string[]> = {};
      Object.entries(parsed).slice(0, 500).forEach(([scriptId, endings]) => {
        if (!/^[a-zA-Z0-9_-]{1,200}$/.test(scriptId) || !Array.isArray(endings)) return;
        result[scriptId] = [...new Set(
          endings
            .filter((ending): ending is string => typeof ending === 'string')
            .map((ending) => ending.slice(0, 500)),
        )].slice(0, 500);
      });
      return result;
    } catch {
      return {};
    }
  }
}
