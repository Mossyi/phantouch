/**
 * 训练日程的存档槽：一张角色卡可以保留多段训练（不同世界或不同进度），随时切换。
 * 存档里不带回滚快照，体积更小；最多 5 个，满了就拒绝（不悄悄覆盖别的存档）；「自动存档」只覆盖同一局（runId）之前的自动存档。
 */
import { STAGES, normalizeRpgState, saveRpgState, type TavernRpgState } from './tavernRpg';
import { clearRpgArt } from './tavernRpgArt';

export interface RpgSaveSlot {
  id: string;
  name: string;
  savedAt: number;
  worldName: string;
  day: number;
  stageName: string;
  auto: boolean;
  state: TavernRpgState;
}

export const MAX_RPG_SLOTS = 5;
const slotsKey = (cardId: string) => `ycy_tavern_rpg_slots_${cardId}`;

const readSlots = (cardId: string): RpgSaveSlot[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(slotsKey(cardId)) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((slot): RpgSaveSlot[] => {
      const state = normalizeRpgState(slot?.state);
      if (!state || typeof slot.id !== 'string') return [];
      return [{
        id: slot.id,
        name: typeof slot.name === 'string' ? slot.name.slice(0, 20) : state.worldName,
        savedAt: Number(slot.savedAt) || 0,
        worldName: state.worldName,
        day: state.day,
        stageName: STAGES[state.stage]?.name ?? '',
        auto: slot.auto === true,
        state,
      }];
    });
  } catch {
    return [];
  }
};

const writeSlots = (cardId: string, slots: RpgSaveSlot[]): string | undefined => {
  try {
    localStorage.setItem(slotsKey(cardId), JSON.stringify(slots));
    return undefined;
  } catch {
    return '本地存储空间不够了，删掉一些存档再试。';
  }
};

export const listRpgSlots = (cardId: string) => readSlots(cardId).sort((a, b) => b.savedAt - a.savedAt);

/** 存一份档。auto=true 时按世界名覆盖已有的自动存档；手动存档满了就报错 */
export const saveRpgSlot = (cardId: string, state: TavernRpgState, name: string, auto = false): { slots: RpgSaveSlot[]; error?: string } => {
  const slots = readSlots(cardId);
  const slot: RpgSaveSlot = {
    id: `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: (name.trim() || state.worldName).slice(0, 20),
    savedAt: Date.now(),
    worldName: state.worldName,
    day: state.day,
    stageName: STAGES[state.stage]?.name ?? '',
    auto,
    state: { ...state, snapshots: [] },
  };
  // 自动存档按「这一局」覆盖：同一个模板开的两局不会互相覆盖
  let next = auto ? slots.filter((entry) => !(entry.auto && entry.state.runId === state.runId)) : slots;
  if (next.length >= MAX_RPG_SLOTS) {
    // 满了就拒绝，不悄悄挤掉别的存档（那可能是另一局唯一的进度）
    return { slots: listRpgSlots(cardId), error: `存档最多 ${MAX_RPG_SLOTS} 个，先在设置里删掉一个。` };
  }
  next = [...next, slot];
  const error = writeSlots(cardId, next);
  return { slots: listRpgSlots(cardId), error };
};

export const deleteRpgSlot = (cardId: string, slotId: string) => {
  writeSlots(cardId, readSlots(cardId).filter((slot) => slot.id !== slotId));
  return listRpgSlots(cardId);
};

export const loadRpgSlot = (cardId: string, slotId: string): TavernRpgState | null =>
  readSlots(cardId).find((slot) => slot.id === slotId)?.state ?? null;

/** 所有存档用到的地点 id（结束训练时，这些地点的插画要留着） */
export const slotLocationIds = (cardId: string) => new Set(readSlots(cardId).flatMap((slot) => slot.state.locations.map((loc) => loc.id)));

/** 删除角色卡时清掉它的训练进度、存档和插画 */
export const deleteRpgDataForCard = (cardId: string) => {
  saveRpgState(cardId, null);
  try {
    localStorage.removeItem(slotsKey(cardId));
  } catch {
    // ignore
  }
  void clearRpgArt(cardId);
};
