import { SignInCodeEngine } from '../tavern/signInCodeEngine';
import { exportTavernRepository } from '../tavern/tavernChatRepository';
import { listLocalAsmrCategories, listLocalAsmrTracks, getLocalAsmrBlob, restoreLocalAsmrLibrary, validateLocalAsmrFile, LocalAsmrCategory, LocalAsmrTrack } from '../asmr/localAudioLibrary';

const MAGIC = 'YCYBK001';
const MAX_HEADER = 50_000_000;
const MAX_PACKAGE = 2_000_000_000;
export interface BackupPackage { data: string; categories: LocalAsmrCategory[]; tracks: Array<{ metadata: LocalAsmrTrack; blob: Blob }>; timestamp: number; module: string }
export async function createBackupPackage(module: string, media: boolean, status: (message: string) => void = () => {}): Promise<Blob> {
  status('正在整理数据…');
  const data = await SignInCodeEngine.generateCompleteBackup(module, true);
  const includeAudio = module === 'all' || module === 'asmr';
  const categories = includeAudio ? await listLocalAsmrCategories() : [];
  const records = includeAudio && media ? await listLocalAsmrTracks(true) : [];
  const parts: Blob[] = [];
  let total = 0;
  for (const track of records) {
    status(`正在打包音频 ${parts.length + 1}/${records.length}…`);
    const blob = await getLocalAsmrBlob(track.id);
    if (blob.size !== track.size) throw new Error(`“${track.title}”文件大小不一致，请重新导入后备份`);
    total += blob.size;
    if (total > MAX_PACKAGE - MAX_HEADER) throw new Error('音频包超过 1.95 GB，请先分批整理音频');
    parts.push(blob);
  }
  const manifest = new Blob([JSON.stringify({ format: MAGIC, timestamp: Date.now(), module, data: JSON.parse(data), categories, tracks: records })]);
  if (manifest.size > MAX_HEADER) throw new Error('备份数据超过 50 MB，请按模块分别导出');
  const prefix = new Uint8Array(12); prefix.set(new TextEncoder().encode(MAGIC)); new DataView(prefix.buffer).setUint32(8, manifest.size, true);
  return new Blob([prefix, manifest, ...parts], { type: 'application/octet-stream' });
}

export async function readBackupPackage(file: Blob): Promise<BackupPackage> {
  if (file.size < 12 || file.size > MAX_PACKAGE) throw new Error('备份包为空、损坏或超过 2 GB');
  const prefix = await file.slice(0, 12).arrayBuffer();
  if (new TextDecoder().decode(prefix.slice(0, 8)) !== MAGIC) throw new Error('不是受支持的幻触备份包');
  const length = new DataView(prefix).getUint32(8, true);
  if (!length || length > MAX_HEADER || 12 + length > file.size) throw new Error('备份目录损坏');
  const raw = JSON.parse(await file.slice(12, 12 + length).text());
  if (raw?.format !== MAGIC || !Array.isArray(raw.categories) || raw.categories.length > 31 || !Array.isArray(raw.tracks) || raw.tracks.length > 200 || !raw.data?.snapshot || typeof raw.data.snapshot !== 'object' || Array.isArray(raw.data.snapshot)) throw new Error('备份结构无效');
  const data = JSON.stringify(raw.data);
  const validation = SignInCodeEngine.restoreFromCode(data, { extended: true, dryRun: true });
  if (!validation.success) throw new Error(validation.message);
  const validId = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);
  const categoryIds = new Set<string>(['uncategorized']);
  const categories: LocalAsmrCategory[] = raw.categories.map((c: any) => {
    if (!c || !validId(c.id) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 30 || (c.id !== 'uncategorized' && categoryIds.has(c.id))) throw new Error('分类信息无效或重复');
    categoryIds.add(c.id); return { id: c.id, name: c.name.trim(), createdAt: Number(c.createdAt) || 0 };
  });
  const ids = new Set<string>(); let offset = 12 + length;
  const tracks = raw.tracks.map((t: any) => {
    if (!t || !validId(t.id) || ids.has(t.id) || typeof t.title !== 'string' || !t.title.trim() || t.title.length > 100 || typeof t.fileName !== 'string' || t.fileName.length > 180 || typeof t.mimeType !== 'string' || t.mimeType.length > 100 || !Number.isSafeInteger(t.size) || validateLocalAsmrFile({ name: t.fileName, type: t.mimeType, size: t.size }) || offset + t.size > file.size) throw new Error('音频目录或文件长度无效');
    ids.add(t.id);
    const blob = file.slice(offset, offset + t.size, t.mimeType); offset += t.size;
    const metadata: LocalAsmrTrack = { id: t.id, title: t.title, fileName: t.fileName, size: t.size, mimeType: t.mimeType, categoryId: categoryIds.has(t.categoryId) ? t.categoryId : 'uncategorized', createdAt: Number.isFinite(t.createdAt) ? t.createdAt : 0, favorite: t.favorite === true, deletedAt: Number.isFinite(t.deletedAt) && t.deletedAt > 0 ? t.deletedAt : 0 };
    return { metadata, blob };
  });
  if (offset !== file.size) throw new Error('备份文件长度不匹配，可能损坏');
  return { data, categories, tracks, timestamp: Number(raw.timestamp) || 0, module: String(raw.module || 'all') };
}

export async function restoreBackupPackage(bundle: BackupPackage, mode: 'merge' | 'overwrite'): Promise<void> {
  const payload = JSON.parse(bundle.data);
  const repository = await exportTavernRepository();
  // IndexedDB-only conversations count as existing data in non-destructive merge mode.
  if (mode === 'merge') {
    for (const item of repository.sessions) delete payload.snapshot[`ycy_tavern_chat_${item.cardId}`];
    for (const item of repository.archives) delete payload.snapshot[`ycy_tavern_archives_${item.cardId}`];
  }
  const json = JSON.stringify(payload);
  const previous = new Map<string, string | null>();
  try {
    await restoreLocalAsmrLibrary(bundle.categories, bundle.tracks, mode, () => {
      for (const key of Object.keys(payload.snapshot)) {
        previous.set(key, localStorage.getItem(key));
        const sessionId = key.match(/^ycy_tavern_chat_([a-zA-Z0-9_-]{1,160})$/)?.[1];
        const archiveId = key.match(/^ycy_tavern_archives_([a-zA-Z0-9_-]{1,160})$/)?.[1];
        const timestampKey = sessionId ? `ycy_tavern_session_updated_${sessionId}` : archiveId ? `ycy_tavern_archive_library_updated_${archiveId}` : null;
        if (timestampKey) previous.set(timestampKey, localStorage.getItem(timestampKey));
      }
      const restored = SignInCodeEngine.restoreFromCode(json, { extended: true, mode });
      if (!restored.success) throw new Error(restored.message);
    });
  } catch (error) {
    try { for (const [key, value] of previous) if (localStorage.getItem(key) !== value) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } }
    catch { throw new Error('恢复失败，且本机空间不足导致回滚不完整，请保留备份文件并清理空间后重试'); }
    throw error;
  }
}
