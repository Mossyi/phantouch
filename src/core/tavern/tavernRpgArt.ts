/**
 * 训练日程的地点插画：用户配置的生图模型画出来，压缩后存在 IndexedDB（localStorage 放不下图片）。
 * 键为「角色卡 id::地点 id」，结束训练时整卡清空。
 */
import { RPG_PERIOD_LABELS, type RpgLocation } from './tavernRpg';

const DB_NAME = 'ycy_tavern_rpg_art';
const STORE = 'art';
const AUTO_KEY = 'ycy_tavern_rpg_art_auto';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = () => {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('当前环境不支持 IndexedDB'));
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('打开插画库失败'));
    };
  });
  return dbPromise;
};

const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('插画库读写失败'));
  });
};

const artKey = (cardId: string, locationId: string) => `${cardId}::${locationId}`;

/** 读取这张角色卡所有地点的插画：{ 地点 id: dataURL } */
export const loadRpgArt = async (cardId: string): Promise<Record<string, string>> => {
  try {
    const keys = await run('readonly', (store) => store.getAllKeys(IDBKeyRange.bound(`${cardId}::`, `${cardId}::￿`)));
    const entries = await Promise.all(keys.map(async (key) => [String(key).slice(cardId.length + 2), await run<string>('readonly', (store) => store.get(key))] as const));
    return Object.fromEntries(entries.filter(([, value]) => typeof value === 'string' && value.startsWith('data:image/')));
  } catch {
    return {};
  }
};

export const saveRpgArt = (cardId: string, locationId: string, dataUrl: string) =>
  run('readwrite', (store) => store.put(dataUrl, artKey(cardId, locationId))).then(() => undefined);

export const deleteRpgArt = (cardId: string, locationId: string) =>
  run('readwrite', (store) => store.delete(artKey(cardId, locationId))).then(() => undefined).catch(() => undefined);

export const clearRpgArt = (cardId: string) =>
  run('readwrite', (store) => store.delete(IDBKeyRange.bound(`${cardId}::`, `${cardId}::￿`))).then(() => undefined).catch(() => undefined);

/** 进入没有插画的地点时自动画一张（会消耗生图额度，默认关闭） */
export const isRpgArtAutoEnabled = () => {
  try {
    return localStorage.getItem(AUTO_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setRpgArtAutoEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(AUTO_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
};

const PERIOD_LIGHT = ['清晨的柔和晨光', '明亮的白天自然光', '黄昏的暖橙色夕阳光', '深夜的昏暗暖色灯光'];

/** 地点插画的提示词：只画场景、不画人物，避免和角色立绘冲突 */
export const buildLocationArtPrompt = (location: RpgLocation, worldName: string, period: number) => [
  `「${worldName}」中的场景：${location.name}。${location.description}`,
  `${PERIOD_LIGHT[period] ?? PERIOD_LIGHT[1]}（${RPG_PERIOD_LABELS[period] ?? ''}）`,
  '精致的二次元动画背景美术，室内或室外空镜，没有人物，构图干净，柔和光影，细节丰富，16:9 横幅',
  'anime background art, scenery, no humans, empty room or landscape, soft lighting, highly detailed, wide shot',
].join('\n');
