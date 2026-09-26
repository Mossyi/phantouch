const TAVERN_CHAT_DATABASE = 'ycy_tavern_chat_repository';
const TAVERN_CHAT_DATABASE_VERSION = 2;
const TAVERN_SESSION_STORE = 'sessions';
const TAVERN_ARCHIVE_STORE = 'archives';

export interface TavernSessionRecord {
  cardId: string;
  messages: unknown[];
  updatedAt: number;
  version: 1;
}

export interface TavernArchiveRecord {
  cardId: string;
  archives: unknown[];
  updatedAt: number;
  version: 1;
}

let databasePromise: Promise<IDBDatabase | null> | null = null;
const sessionWriteQueues = new Map<string, Promise<boolean>>();
const archiveWriteQueues = new Map<string, Promise<boolean>>();

const openTavernChatDatabase = (): Promise<IDBDatabase | null> => {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(TAVERN_CHAT_DATABASE, TAVERN_CHAT_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(TAVERN_SESSION_STORE)) {
          database.createObjectStore(TAVERN_SESSION_STORE, { keyPath: 'cardId' });
        }
        if (!database.objectStoreNames.contains(TAVERN_ARCHIVE_STORE)) {
          database.createObjectStore(TAVERN_ARCHIVE_STORE, { keyPath: 'cardId' });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); databasePromise = null; };
        resolve(request.result);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  const opening = databasePromise;
  void opening.then((database) => { if (!database && databasePromise === opening) databasePromise = null; });
  return opening;
};

const waitForSessionWrites = async (cardId: string) => {
  const pending = sessionWriteQueues.get(cardId);
  if (pending) await pending.catch(() => false);
};

export const exportTavernRepository = async (): Promise<{ sessions: TavernSessionRecord[]; archives: TavernArchiveRecord[] }> => {
  await Promise.all([...sessionWriteQueues.values(), ...archiveWriteQueues.values()]);
  const database = await openTavernChatDatabase();
  if (!database) throw new Error('聊天数据库暂不可用，请重试后再备份。');
  return new Promise((resolve, reject) => {
    const tx = database.transaction([TAVERN_SESSION_STORE, TAVERN_ARCHIVE_STORE], 'readonly');
    const sessions = tx.objectStore(TAVERN_SESSION_STORE).getAll();
    const archives = tx.objectStore(TAVERN_ARCHIVE_STORE).getAll();
    tx.oncomplete = () => resolve({ sessions: sessions.result, archives: archives.result });
    tx.onerror = () => reject(tx.error || new Error('读取聊天数据库失败'));
    tx.onabort = () => reject(new Error('读取聊天数据库已取消'));
  });
};

const enqueueSessionWrite = (cardId: string, operation: () => Promise<boolean>): Promise<boolean> => {
  const previous = sessionWriteQueues.get(cardId) || Promise.resolve(true);
  const next = previous.catch(() => false).then(operation);
  sessionWriteQueues.set(cardId, next);
  void next.finally(() => {
    if (sessionWriteQueues.get(cardId) === next) sessionWriteQueues.delete(cardId);
  });
  return next;
};

const writeSessionRecord = async (record: TavernSessionRecord): Promise<boolean> => {
  const database = await openTavernChatDatabase();
  if (!database) return false;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(TAVERN_SESSION_STORE, 'readwrite');
      transaction.objectStore(TAVERN_SESSION_STORE).put(record);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
};

export const loadTavernSessionRecord = async (cardId: string): Promise<TavernSessionRecord | null> => {
  await waitForSessionWrites(cardId);
  const database = await openTavernChatDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(TAVERN_SESSION_STORE, 'readonly');
      const request = transaction.objectStore(TAVERN_SESSION_STORE).get(cardId);
      request.onsuccess = () => {
        const value = request.result as Partial<TavernSessionRecord> | undefined;
        if (!value || value.cardId !== cardId || !Array.isArray(value.messages)) {
          resolve(null);
          return;
        }
        resolve({
          cardId,
          messages: value.messages,
          updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0,
          version: 1,
        });
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

export const saveTavernSessionRecord = (
  cardId: string,
  messages: unknown[],
): Promise<boolean> => enqueueSessionWrite(cardId, () => writeSessionRecord({
  cardId,
  messages,
  updatedAt: Date.now(),
  version: 1,
}));

export const deleteTavernSessionRecord = (cardId: string): Promise<boolean> => enqueueSessionWrite(cardId, async () => {
  const database = await openTavernChatDatabase();
  if (!database) return false;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(TAVERN_SESSION_STORE, 'readwrite');
      transaction.objectStore(TAVERN_SESSION_STORE).delete(cardId);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
});

const waitForArchiveWrites = async (cardId: string) => {
  const pending = archiveWriteQueues.get(cardId);
  if (pending) await pending.catch(() => false);
};

const enqueueArchiveWrite = (cardId: string, operation: () => Promise<boolean>): Promise<boolean> => {
  const previous = archiveWriteQueues.get(cardId) || Promise.resolve(true);
  const next = previous.catch(() => false).then(operation);
  archiveWriteQueues.set(cardId, next);
  void next.finally(() => {
    if (archiveWriteQueues.get(cardId) === next) archiveWriteQueues.delete(cardId);
  });
  return next;
};

const writeArchiveRecord = async (record: TavernArchiveRecord): Promise<boolean> => {
  const database = await openTavernChatDatabase();
  if (!database) return false;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(TAVERN_ARCHIVE_STORE, 'readwrite');
      transaction.objectStore(TAVERN_ARCHIVE_STORE).put(record);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
};

export const loadTavernArchiveRecord = async (cardId: string): Promise<TavernArchiveRecord | null> => {
  await waitForArchiveWrites(cardId);
  const database = await openTavernChatDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(TAVERN_ARCHIVE_STORE, 'readonly');
      const request = transaction.objectStore(TAVERN_ARCHIVE_STORE).get(cardId);
      request.onsuccess = () => {
        const value = request.result as Partial<TavernArchiveRecord> | undefined;
        if (!value || value.cardId !== cardId || !Array.isArray(value.archives)) {
          resolve(null);
          return;
        }
        resolve({
          cardId,
          archives: value.archives,
          updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0,
          version: 1,
        });
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

export const saveTavernArchiveRecord = (
  cardId: string,
  archives: unknown[],
): Promise<boolean> => enqueueArchiveWrite(cardId, () => writeArchiveRecord({
  cardId,
  archives,
  updatedAt: Date.now(),
  version: 1,
}));

export const deleteTavernArchiveRecord = (cardId: string): Promise<boolean> => enqueueArchiveWrite(cardId, async () => {
  const database = await openTavernChatDatabase();
  if (!database) return false;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(TAVERN_ARCHIVE_STORE, 'readwrite');
      transaction.objectStore(TAVERN_ARCHIVE_STORE).delete(cardId);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
});
