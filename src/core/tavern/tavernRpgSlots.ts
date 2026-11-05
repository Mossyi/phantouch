/**
 * 训练日程的存档槽：一张角色卡可以保留多段训练（不同世界或不同进度），随时切换。
 * 存档里不带回滚快照，体积更小；最多 5 个，「自动存档」按世界名覆盖同名的那一个。
 */
import { STAGES, normalizeRpgState, type TavernRpgState } from './tavernRpg';

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
  let next = auto ? slots.filter((entry) => !(entry.auto && entry.worldName === state.worldName)) : slots;
  if (next.length >= MAX_RPG_SLOTS) {
    // 满了：自动存档挤掉最旧的自动存档；手动存档不覆盖，提示用户删
    const oldestAuto = [...next].filter((entry) => entry.auto).sort((a, b) => a.savedAt - b.savedAt)[0];
    if (!oldestAuto) return { slots: listRpgSlots(cardId), error: `存档最多 ${MAX_RPG_SLOTS} 个，先删掉一个。` };
    next = next.filter((entry) => entry !== oldestAuto);
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
