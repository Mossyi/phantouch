import { DungeonChoice, DungeonGenerationSource, DungeonScript, DungeonStep } from '../../types';

export const DUNGEON_CUSTOM_SCRIPTS_STORAGE_KEY = 'ycy_dungeon_custom_scripts_v1';
export const DUNGEON_DELETED_BUILTINS_STORAGE_KEY = 'ycy_dungeon_deleted_builtins_v1';
export const DUNGEON_RECYCLE_BIN_STORAGE_KEY = 'ycy_dungeon_recycle_bin_v1';
export const DUNGEON_PERMANENTLY_DELETED_BUILTINS_STORAGE_KEY = 'ycy_dungeon_permanently_deleted_builtins_v1';

export interface DungeonRecycleItem {
  scriptId: string;
  title: string;
  avatar: string;
  category: DungeonScript['category'];
  isBuiltin: boolean;
  deletedAt: number;
  script?: DungeonScript;
}

const isRecord = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const cleanText = (value: unknown, maxLength: number, fallback = '') => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback
);

const normalizeChoice = (value: unknown, index: number): DungeonChoice | null => {
  if (!isRecord(value)) return null;
  const text = cleanText(value.text, 4000);
  if (!text) return null;
  const attitude = ['submissive', 'defiant', 'begging', 'neutral'].includes(value.attitude)
    ? value.attitude as DungeonChoice['attitude']
    : 'neutral';
  const choice: DungeonChoice = {
    id: cleanText(value.id, 200, `choice_${index + 1}`),
    text,
    attitude,
    replyDialogue: cleanText(value.replyDialogue, 20_000, '你的决定让故事进入了新的方向。'),
    nextStepId: value.nextStepId === 'ending' ? 'ending' : 'next_ai_expand',
  };
  if (isRecord(value.hardwareAction)) {
    const type = cleanText(value.hardwareAction.type, 30) as NonNullable<DungeonChoice['hardwareAction']>['type'];
    const target = cleanText(value.hardwareAction.target, 200);
    const allowed = ['ems_wave', 'ems_strength', 'toy_pattern', 'toy_turbo', 'enema_pattern', 'stop'];
    if (allowed.includes(type) && (target || type === 'stop' || type === 'ems_strength')) {
      const numericValue = Number(value.hardwareAction.value);
      const duration = Number(value.hardwareAction.durationSec);
      choice.hardwareAction = {
        type,
        target,
        value: Number.isFinite(numericValue) ? Math.max(0, Math.min(200, Math.round(numericValue))) : undefined,
        durationSec: Number.isFinite(duration) ? Math.max(1, Math.min(300, Math.round(duration))) : undefined,
      };
    }
  }
  if (value.nextStepId === 'ending') {
    choice.endingTitle = cleanText(value.endingTitle, 500) || undefined;
    choice.endingDesc = cleanText(value.endingDesc, 20_000) || undefined;
    if (['surrender', 'conquer', 'punished', 'released'].includes(value.endingType)) {
      choice.endingType = value.endingType;
    }
  }
  return choice;
};

const normalizeStep = (value: unknown, fallbackAvatar: string): DungeonStep | null => {
  if (!isRecord(value)) return null;
  const narrative = cleanText(value.narrative, 100_000);
  const dialogue = cleanText(value.dialogue, 100_000);
  const choices = Array.isArray(value.choices)
    ? value.choices.slice(0, 6).map(normalizeChoice).filter((choice): choice is DungeonChoice => choice !== null)
    : [];
  if (!narrative || choices.length === 0) return null;
  return {
    id: 'step_1',
    speaker: cleanText(value.speaker, 500, '地牢引导者'),
    avatar: cleanText(value.avatar, 100, fallbackAvatar),
    narrative,
    dialogue: dialogue || '欢迎来到由你的想象创造的地牢，故事现在开始。',
    choices,
    generationSource: ['cloud', 'local', 'offline'].includes(value.generationSource)
      ? value.generationSource as DungeonGenerationSource
      : undefined,
    generationNotice: cleanText(value.generationNotice, 1000) || undefined,
  };
};

export const normalizeCustomDungeonScript = (value: unknown): DungeonScript | null => {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 200);
  const title = cleanText(value.title, 200);
  const avatar = cleanText(value.avatar, 100, '🪄');
  const firstStep = normalizeStep(isRecord(value.steps) ? value.steps.step_1 : undefined, avatar);
  if (!/^ai_dungeon_[a-zA-Z0-9_-]+$/.test(id) || !title || !firstStep) return null;
  const createdAt = Number(value.createdAt);
  const source = ['cloud', 'local', 'offline'].includes(value.generationSource)
    ? value.generationSource as DungeonGenerationSource
    : 'offline';
  return {
    id,
    title,
    subtitle: cleanText(value.subtitle, 500, '由 AI 即时创作的互动长篇'),
    category: value.category === '雌堕身心重塑' ? '雌堕身心重塑' : '经典硬核支配',
    isFemboy: Boolean(value.isFemboy),
    avatar,
    bgGradient: cleanText(value.bgGradient, 300, 'from-cyan-950 via-slate-950 to-rose-950'),
    difficulty: cleanText(value.difficulty, 100, 'AI 动态'),
    tags: Array.isArray(value.tags)
      ? value.tags.map((tag) => cleanText(tag, 50)).filter(Boolean).slice(0, 6)
      : ['AI原创', '无限续写'],
    description: cleanText(value.description, 4000, '一个根据自定义设定即时生成、可无限续写的互动地牢。'),
    initialStepId: 'step_1',
    steps: { step_1: firstStep },
    isAiGenerated: true,
    creatorPrompt: cleanText(value.creatorPrompt, 4000),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    generationSource: source,
    generationNotice: cleanText(value.generationNotice, 1000) || undefined,
  };
};

const normalizeRecycleItem = (value: unknown): DungeonRecycleItem | null => {
  if (!isRecord(value)) return null;
  const scriptId = cleanText(value.scriptId, 200);
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(scriptId)) return null;
  const isBuiltin = Boolean(value.isBuiltin);
  const script = isBuiltin ? undefined : normalizeCustomDungeonScript(value.script);
  if (!isBuiltin && !script) return null;
  const deletedAt = Number(value.deletedAt);
  return {
    scriptId,
    title: cleanText(value.title, 200, script?.title || scriptId),
    avatar: cleanText(value.avatar, 100, script?.avatar || '🗑️'),
    category: value.category === '雌堕身心重塑' ? '雌堕身心重塑' : '经典硬核支配',
    isBuiltin,
    deletedAt: Number.isFinite(deletedAt) ? deletedAt : Date.now(),
    script: script || undefined,
  };
};

export class DungeonScriptLibrary {
  private static instance: DungeonScriptLibrary;

  static getInstance(): DungeonScriptLibrary {
    if (!DungeonScriptLibrary.instance) DungeonScriptLibrary.instance = new DungeonScriptLibrary();
    return DungeonScriptLibrary.instance;
  }

  private restoreStorageValue(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {}
  }

  private readStorageValue(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  getCustomScripts(): DungeonScript[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(DUNGEON_CUSTOM_SCRIPTS_STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(normalizeCustomDungeonScript)
        .filter((script): script is DungeonScript => script !== null)
        .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));
    } catch {
      return [];
    }
  }

  save(script: DungeonScript): DungeonScript | null {
    const normalized = normalizeCustomDungeonScript(script);
    if (!normalized) return null;
    try {
      const next = [normalized, ...this.getCustomScripts().filter((item) => item.id !== normalized.id)];
      localStorage.setItem(DUNGEON_CUSTOM_SCRIPTS_STORAGE_KEY, JSON.stringify(next));
      return normalized;
    } catch {
      return null;
    }
  }

  delete(scriptId: string): boolean {
    try {
      const next = this.getCustomScripts().filter((item) => item.id !== scriptId);
      localStorage.setItem(DUNGEON_CUSTOM_SCRIPTS_STORAGE_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  getRecycleBin(): DungeonRecycleItem[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(DUNGEON_RECYCLE_BIN_STORAGE_KEY) || '[]');
      const current = Array.isArray(parsed)
        ? parsed.map(normalizeRecycleItem).filter((item): item is DungeonRecycleItem => item !== null)
        : [];
      const legacyIds = JSON.parse(localStorage.getItem(DUNGEON_DELETED_BUILTINS_STORAGE_KEY) || '[]');
      if (Array.isArray(legacyIds)) {
        for (const value of legacyIds) {
          if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) continue;
          if (!current.some((item) => item.scriptId === value)) {
            current.push({
              scriptId: value,
              title: value,
              avatar: '📕',
              category: '经典硬核支配',
              isBuiltin: true,
              deletedAt: Date.now(),
            });
          }
        }
        if (legacyIds.length > 0) {
          localStorage.setItem(DUNGEON_RECYCLE_BIN_STORAGE_KEY, JSON.stringify(current));
          localStorage.removeItem(DUNGEON_DELETED_BUILTINS_STORAGE_KEY);
        }
      }
      return current.sort((left, right) => right.deletedAt - left.deletedAt).slice(0, 500);
    } catch {
      return [];
    }
  }

  moveToRecycleBin(script: DungeonScript, isBuiltin: boolean): DungeonRecycleItem | null {
    const storedScript = isBuiltin ? undefined : normalizeCustomDungeonScript(script);
    if (!isBuiltin && !storedScript) return null;
    const item: DungeonRecycleItem = {
      scriptId: script.id,
      title: script.title,
      avatar: script.avatar,
      category: script.category,
      isBuiltin,
      deletedAt: Date.now(),
      script: storedScript || undefined,
    };
    const recycleSnapshot = this.readStorageValue(DUNGEON_RECYCLE_BIN_STORAGE_KEY);
    const customSnapshot = this.readStorageValue(DUNGEON_CUSTOM_SCRIPTS_STORAGE_KEY);
    try {
      const nextRecycleBin = [item, ...this.getRecycleBin().filter((existing) => existing.scriptId !== script.id)];
      if (!isBuiltin) {
        const nextCustomScripts = this.getCustomScripts().filter((existing) => existing.id !== script.id);
        localStorage.setItem(DUNGEON_CUSTOM_SCRIPTS_STORAGE_KEY, JSON.stringify(nextCustomScripts));
      }
      localStorage.setItem(DUNGEON_RECYCLE_BIN_STORAGE_KEY, JSON.stringify(nextRecycleBin));
      return item;
    } catch {
      this.restoreStorageValue(DUNGEON_CUSTOM_SCRIPTS_STORAGE_KEY, customSnapshot);
      this.restoreStorageValue(DUNGEON_RECYCLE_BIN_STORAGE_KEY, recycleSnapshot);
      return null;
    }
  }

  restore(scriptId: string): boolean {
    const item = this.getRecycleBin().find((candidate) => candidate.scriptId === scriptId);
    if (!item) return false;
    const recycleSnapshot = this.readStorageValue(DUNGEON_RECYCLE_BIN_STORAGE_KEY);
    const customSnapshot = this.readStorageValue(DUNGEON_CUSTOM_SCRIPTS_STORAGE_KEY);
    try {
      if (!item.isBuiltin && item.script) {
        const nextCustomScripts = [
          item.script,
          ...this.getCustomScripts().filter((script) => script.id !== item.scriptId),
        ];
        localStorage.setItem(DUNGEON_CUSTOM_SCRIPTS_STORAGE_KEY, JSON.stringify(nextCustomScripts));
      }
      const next = this.getRecycleBin().filter((candidate) => candidate.scriptId !== scriptId);
      localStorage.setItem(DUNGEON_RECYCLE_BIN_STORAGE_KEY, JSON.stringify(next));
      return true;
    } catch {
      this.restoreStorageValue(DUNGEON_CUSTOM_SCRIPTS_STORAGE_KEY, customSnapshot);
      this.restoreStorageValue(DUNGEON_RECYCLE_BIN_STORAGE_KEY, recycleSnapshot);
      return false;
    }
  }

  permanentlyDelete(scriptId: string): boolean {
    const current = this.getRecycleBin();
    const item = current.find((candidate) => candidate.scriptId === scriptId);
    if (!item) return false;
    const recycleSnapshot = this.readStorageValue(DUNGEON_RECYCLE_BIN_STORAGE_KEY);
    const permanentSnapshot = this.readStorageValue(DUNGEON_PERMANENTLY_DELETED_BUILTINS_STORAGE_KEY);
    try {
      if (item.isBuiltin) {
        const deletedIds = this.getPermanentlyDeletedBuiltinIds();
        if (!deletedIds.includes(scriptId)) deletedIds.push(scriptId);
        localStorage.setItem(DUNGEON_PERMANENTLY_DELETED_BUILTINS_STORAGE_KEY, JSON.stringify(deletedIds));
      }
      localStorage.setItem(
        DUNGEON_RECYCLE_BIN_STORAGE_KEY,
        JSON.stringify(current.filter((item) => item.scriptId !== scriptId)),
      );
      return true;
    } catch {
      this.restoreStorageValue(DUNGEON_PERMANENTLY_DELETED_BUILTINS_STORAGE_KEY, permanentSnapshot);
      this.restoreStorageValue(DUNGEON_RECYCLE_BIN_STORAGE_KEY, recycleSnapshot);
      return false;
    }
  }

  getDeletedBuiltinIds(): string[] {
    return [...new Set([
      ...this.getRecycleBin().filter((item) => item.isBuiltin).map((item) => item.scriptId),
      ...this.getPermanentlyDeletedBuiltinIds(),
    ])];
  }

  getPermanentlyDeletedBuiltinIds(): string[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(DUNGEON_PERMANENTLY_DELETED_BUILTINS_STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(id)))].slice(0, 500);
    } catch {
      return [];
    }
  }

  deleteBuiltin(scriptId: string): void {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(scriptId) || this.getDeletedBuiltinIds().includes(scriptId)) return;
    try {
      const item: DungeonRecycleItem = {
        scriptId,
        title: scriptId,
        avatar: '📕',
        category: '经典硬核支配',
        isBuiltin: true,
        deletedAt: Date.now(),
      };
      localStorage.setItem(DUNGEON_RECYCLE_BIN_STORAGE_KEY, JSON.stringify([item, ...this.getRecycleBin()]));
    } catch {}
  }

  restoreBuiltins(): void {
    try {
      const customItems = this.getRecycleBin().filter((item) => !item.isBuiltin);
      localStorage.setItem(DUNGEON_RECYCLE_BIN_STORAGE_KEY, JSON.stringify(customItems));
      localStorage.removeItem(DUNGEON_DELETED_BUILTINS_STORAGE_KEY);
    } catch {}
  }
}
