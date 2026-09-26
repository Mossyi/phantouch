export interface LocalAsmrTrack {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: number;
  categoryId: string;
  favorite?: boolean;
  deletedAt?: number;
}

export interface LocalAsmrCategory {
  id: string;
  name: string;
  createdAt: number;
}

export const DEFAULT_LOCAL_ASMR_CATEGORY: LocalAsmrCategory = { id: 'uncategorized', name: '未分类', createdAt: 0 };

export const LOCAL_ASMR_MAX_FILE_BYTES = 200 * 1024 * 1024;
export const LOCAL_ASMR_MAX_TRACKS = 200;

const DB_NAME = 'ycy_local_asmr_library';
const DB_VERSION = 2;
const META_STORE = 'tracks';
const BLOB_STORE = 'audio';
const CATEGORY_STORE = 'categories';
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'webm']);

const cleanTitle = (value: string, fallback = '未命名音频') => {
  const title = typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f]/g, '') : '';
  return (title || fallback).slice(0, 100);
};

export const normalizeLocalAsmrCategoryName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 30);
};

const cleanCategoryId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)
  ? value
  : DEFAULT_LOCAL_ASMR_CATEGORY.id;

const getExtension = (fileName: string) => fileName.toLowerCase().split('.').pop() || '';

export const validateLocalAsmrFile = (file: Pick<File, 'name' | 'size' | 'type'>): string | null => {
  if (!file || typeof file.name !== 'string' || !file.name.trim()) return '音频文件名无效';
  if (!Number.isFinite(file.size) || file.size <= 0) return '音频文件为空';
  if (file.size > LOCAL_ASMR_MAX_FILE_BYTES) return '单个音频不能超过 200 MB';
  const ext = getExtension(file.name);
  const DANGEROUS_EXTENSIONS = new Set(['exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'msi', 'com', 'scr', 'dll']);
  if (DANGEROUS_EXTENSIONS.has(ext)) return '仅支持 MP3、WAV、M4A、AAC、OGG、OPUS、FLAC 或 WEBM 音频';
  const mimeAllowed = typeof file.type === 'string' && file.type.toLowerCase().startsWith('audio/');
  if (!mimeAllowed && !AUDIO_EXTENSIONS.has(ext)) return '仅支持 MP3、WAV、M4A、AAC、OGG、OPUS、FLAC 或 WEBM 音频';
  return null;
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('本地音声库操作失败'));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('本地音声库写入失败'));
  transaction.onabort = () => reject(transaction.error || new Error('本地音声库写入已取消'));
});

const openLibrary = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('当前浏览器不支持离线音频存储'));
    return;
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: 'id' });
    if (!database.objectStoreNames.contains(BLOB_STORE)) database.createObjectStore(BLOB_STORE);
    if (!database.objectStoreNames.contains(CATEGORY_STORE)) database.createObjectStore(CATEGORY_STORE, { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('无法打开本地音声库'));
});

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `asmr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const listLocalAsmrTracks = async (includeDeleted = false): Promise<LocalAsmrTrack[]> => {
  const database = await openLibrary();
  try {
    const transaction = database.transaction(META_STORE, 'readonly');
    const records = await requestResult(transaction.objectStore(META_STORE).getAll()) as LocalAsmrTrack[];
    return records
      .filter((record) => record && typeof record.id === 'string' && typeof record.title === 'string' && (includeDeleted || !record.deletedAt))
      .map((record) => ({ ...record, categoryId: cleanCategoryId(record.categoryId) }))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, LOCAL_ASMR_MAX_TRACKS);
  } finally {
    database.close();
  }
};

export const addLocalAsmrTrack = async (file: File, categoryId = DEFAULT_LOCAL_ASMR_CATEGORY.id): Promise<LocalAsmrTrack> => {
  const validationError = validateLocalAsmrFile(file);
  if (validationError) throw new Error(validationError);
  if ((await listLocalAsmrTracks(true)).length >= LOCAL_ASMR_MAX_TRACKS) throw new Error(`音声库与回收站共可保存 ${LOCAL_ASMR_MAX_TRACKS} 个音频，请先彻底删除不需要的音频`);
  const now = Date.now();
  const metadata: LocalAsmrTrack = {
    id: createId(),
    title: cleanTitle(file.name.replace(/\.[^.]+$/, '')),
    fileName: file.name.slice(0, 180),
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: now,
    categoryId: cleanCategoryId(categoryId),
  };
  const database = await openLibrary();
  try {
    const transaction = database.transaction([META_STORE, BLOB_STORE], 'readwrite');
    transaction.objectStore(META_STORE).put(metadata);
    transaction.objectStore(BLOB_STORE).put(file, metadata.id);
    await transactionDone(transaction);
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    return metadata;
  } finally {
    database.close();
  }
};

export const listLocalAsmrCategories = async (): Promise<LocalAsmrCategory[]> => {
  const database = await openLibrary();
  try {
    const transaction = database.transaction(CATEGORY_STORE, 'readonly');
    const records = await requestResult(transaction.objectStore(CATEGORY_STORE).getAll()) as LocalAsmrCategory[];
    const custom = records
      .filter((record) => record && cleanCategoryId(record.id) !== DEFAULT_LOCAL_ASMR_CATEGORY.id && normalizeLocalAsmrCategoryName(record.name))
      .map((record) => ({ id: cleanCategoryId(record.id), name: normalizeLocalAsmrCategoryName(record.name), createdAt: Number.isFinite(record.createdAt) ? record.createdAt : 0 }))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 30);
    return [DEFAULT_LOCAL_ASMR_CATEGORY, ...custom];
  } finally {
    database.close();
  }
};

export const addLocalAsmrCategory = async (name: string): Promise<LocalAsmrCategory> => {
  const cleanName = normalizeLocalAsmrCategoryName(name);
  if (!cleanName) throw new Error('分类名称不能为空');
  const current = await listLocalAsmrCategories();
  if (current.length >= 31) throw new Error('最多创建 30 个自定义分类');
  if (current.some((category) => category.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) throw new Error('已经存在同名分类');
  const category = { id: createId().replace(/^asmr-/, 'category-'), name: cleanName, createdAt: Date.now() };
  const database = await openLibrary();
  try {
    const transaction = database.transaction(CATEGORY_STORE, 'readwrite');
    transaction.objectStore(CATEGORY_STORE).put(category);
    await transactionDone(transaction);
    return category;
  } finally {
    database.close();
  }
};

export const renameLocalAsmrCategory = async (category: LocalAsmrCategory, name: string): Promise<LocalAsmrCategory> => {
  if (category.id === DEFAULT_LOCAL_ASMR_CATEGORY.id) throw new Error('“未分类”不能重命名');
  const cleanName = normalizeLocalAsmrCategoryName(name);
  if (!cleanName) throw new Error('分类名称不能为空');
  const current = await listLocalAsmrCategories();
  if (current.some((item) => item.id !== category.id && item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) throw new Error('已经存在同名分类');
  const updated = { ...category, name: cleanName };
  const database = await openLibrary();
  try {
    const transaction = database.transaction(CATEGORY_STORE, 'readwrite');
    transaction.objectStore(CATEGORY_STORE).put(updated);
    await transactionDone(transaction);
    return updated;
  } finally {
    database.close();
  }
};

export const moveLocalAsmrTrack = async (track: LocalAsmrTrack, categoryId: string): Promise<LocalAsmrTrack> => {
  const updated = { ...track, categoryId: cleanCategoryId(categoryId) };
  const database = await openLibrary();
  try {
    const transaction = database.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put(updated);
    await transactionDone(transaction);
    return updated;
  } finally {
    database.close();
  }
};

export const deleteLocalAsmrCategory = async (categoryId: string): Promise<void> => {
  if (categoryId === DEFAULT_LOCAL_ASMR_CATEGORY.id) throw new Error('“未分类”不能删除');
  const database = await openLibrary();
  try {
    const transaction = database.transaction([CATEGORY_STORE, META_STORE], 'readwrite');
    transaction.objectStore(CATEGORY_STORE).delete(categoryId);
    const trackStore = transaction.objectStore(META_STORE);
    const records = await requestResult(trackStore.getAll()) as LocalAsmrTrack[];
    records.filter((track) => cleanCategoryId(track.categoryId) === categoryId).forEach((track) => {
      trackStore.put({ ...track, categoryId: DEFAULT_LOCAL_ASMR_CATEGORY.id });
    });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
};

export const getLocalAsmrBlob = async (id: string): Promise<Blob> => {
  const database = await openLibrary();
  try {
    const transaction = database.transaction(BLOB_STORE, 'readonly');
    const blob = await requestResult(transaction.objectStore(BLOB_STORE).get(id));
    if (!(blob instanceof Blob)) throw new Error('音频文件已丢失，请重新导入');
    return blob;
  } finally {
    database.close();
  }
};

export const renameLocalAsmrTrack = async (track: LocalAsmrTrack, title: string): Promise<LocalAsmrTrack> => {
  const updated = { ...track, title: cleanTitle(title, track.title) };
  const database = await openLibrary();
  try {
    const transaction = database.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put(updated);
    await transactionDone(transaction);
    return updated;
  } finally {
    database.close();
  }
};

export const deleteLocalAsmrTrack = async (id: string): Promise<void> => {
  const database = await openLibrary();
  try {
    const transaction = database.transaction([META_STORE, BLOB_STORE], 'readwrite');
    transaction.objectStore(META_STORE).delete(id);
    transaction.objectStore(BLOB_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
};

export async function updateLocalAsmrTracks(ids: string[], patch: { favorite?: boolean; deletedAt?: number; categoryId?: string }): Promise<void> {
  const database = await openLibrary();
  try {
    const tx = database.transaction([META_STORE, CATEGORY_STORE], 'readwrite');
    const done = transactionDone(tx);
    void done.catch(() => {});
    const store = tx.objectStore(META_STORE);
    let category = patch.categoryId;
    if (category && category !== DEFAULT_LOCAL_ASMR_CATEGORY.id) {
      if (!await requestResult(tx.objectStore(CATEGORY_STORE).get(category))) category = DEFAULT_LOCAL_ASMR_CATEGORY.id;
    }
    for (const id of new Set(ids.slice(0, LOCAL_ASMR_MAX_TRACKS))) {
      const record = await requestResult(store.get(id));
      if (record) store.put({ ...record, ...(typeof patch.favorite === 'boolean' ? { favorite: patch.favorite } : {}), ...(typeof patch.deletedAt === 'number' ? { deletedAt: Math.max(0, patch.deletedAt) } : {}), ...(category ? { categoryId: category } : {}) });
    }
    await done;
  } finally { database.close(); }
}

// One transaction covers metadata, blobs and categories; caller can include a synchronous settings restore.
export async function restoreLocalAsmrLibrary(categories: LocalAsmrCategory[], tracks: Array<{ metadata: LocalAsmrTrack; blob: Blob }>, mode: 'merge' | 'overwrite', restoreSettings: () => void): Promise<void> {
  const database = await openLibrary();
  try {
    const tx = database.transaction([META_STORE, BLOB_STORE, CATEGORY_STORE], 'readwrite');
    const done = transactionDone(tx);
    // Attach rejection handling immediately, including when validation aborts the transaction.
    void done.catch(() => {});
    try {
      const meta = tx.objectStore(META_STORE), audio = tx.objectStore(BLOB_STORE), cats = tx.objectStore(CATEGORY_STORE);
      const existing = await requestResult(meta.getAll()) as LocalAsmrTrack[];
      const existingCategories = await requestResult(cats.getAll()) as LocalAsmrCategory[];
      if (new Set([...existing.map(t => t.id), ...tracks.map(t => t.metadata.id)]).size > LOCAL_ASMR_MAX_TRACKS) throw new Error('恢复后音频超过 200 个，请先清理回收站或选择更小的备份');
      if (new Set([...existingCategories.map(c => c.id), ...categories.filter(c => c.id !== 'uncategorized').map(c => c.id)]).size > 30) throw new Error('恢复后分类超过 30 个');
      for (const category of categories) if (category.id !== 'uncategorized' && (mode === 'overwrite' || !existingCategories.some(c => c.id === category.id))) cats.put(category);
      for (const { metadata, blob } of tracks) if (mode === 'overwrite' || !existing.some(t => t.id === metadata.id)) { meta.put(metadata); audio.put(blob, metadata.id); }
      restoreSettings();
    } catch (error) { tx.abort(); await done.catch(() => {}); throw error; }
    await done;
  } finally { database.close(); }
}
