import React, { useRef, useState } from 'react';
import { BackupPackage, createBackupPackage, readBackupPackage, restoreBackupPackage } from '../core/ui/dataBackup';
import { exportBinaryFile } from '../core/ui/exportFile';
export function BackupPackagePanel() {
  const [module, setModule] = useState('all'), [media, setMedia] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [preview, setPreview] = useState<BackupPackage | null>(null), [mode, setMode] = useState<'merge' | 'overwrite'>('merge');
  const input = useRef<HTMLInputElement>(null);
  const run = async (work: () => Promise<void>) => { if (busy) return; setBusy(true); try { await work(); } catch (e) { setNotice(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(false); } };
  const previewItemCount = React.useMemo(() => {
    if (!preview?.data) return 0;
    try {
      const parsed = JSON.parse(preview.data);
      return parsed?.snapshot && typeof parsed.snapshot === 'object' ? Object.keys(parsed.snapshot).length : 0;
    } catch {
      return 0;
    }
  }, [preview?.data]);

  return <div className="space-y-3 border-t border-[var(--line)] pt-3"><h4 className="font-bold text-sm">完整文件包备份</h4><p className="ui-muted text-xs">支持最多 50 MB 数据和合计 2 GB 文件包，可包含回收站音频。密钥始终排除。备份未加密，请妥善保管。</p><select aria-label="备份模块" disabled={busy} className="w-full p-2 text-xs" value={module} onChange={e => setModule(e.target.value)}>{Object.entries({ all: '全部模块', tavern: '酒馆', asmr: 'ASMR', training: '训练', wardrobe: '衣橱', dungeon: '地牢', settings: '设置与其他' }).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select><label className="text-xs flex gap-2"><input type="checkbox" disabled={busy || !['all', 'asmr'].includes(module)} checked={media} onChange={e => setMedia(e.target.checked)} />包含本地音频文件（较大，导出会更慢）</label><div className="grid grid-cols-2 gap-2"><button disabled={busy} className="ui-button" onClick={() => void run(async () => { const blob = await createBackupPackage(module, media, setNotice); await exportBinaryFile(`yiciyuan-${module}-${Date.now()}.ycybackup`, blob, setNotice); setNotice('文件包已导出。建议保留一份在其他设备。'); })}>导出文件包</button><button disabled={busy} className="ui-button-secondary" onClick={() => input.current?.click()}>打开文件包恢复</button></div><input type="file" accept=".ycybackup,application/octet-stream" className="hidden" ref={input} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) { setPreview(null); void run(async () => { setNotice('正在校验文件包…'); setPreview(await readBackupPackage(file)); setMode('merge'); setNotice('结构校验通过，请核对恢复内容'); }); } }} />
    {preview && <div className="rounded-xl border border-[var(--line)] p-3 space-y-2 text-xs"><p>{new Date(preview.timestamp).toLocaleString()} · {previewItemCount} 项数据 · {preview.tracks.length} 个音频</p><select aria-label="文件包恢复方式" disabled={busy} className="w-full p-2" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="merge">合并：保留本机同名数据项 / 相同 ID 音频</option><option value="overwrite">覆盖：替换同名数据项 / 相同 ID 音频</option></select><p className="ui-muted">合并按数据项处理，不把同一角色或模块内部数组逐条拼接；本机已有的该项会保留。覆盖也不会删除备份中不存在的本机项目。请先备份当前数据，恢复期间不要操作其他页面。</p><div className="flex gap-2"><button disabled={busy} className="ui-button" onClick={() => { if (!confirm('确认按所选方式恢复？完成后会刷新页面，未保存的编辑将丢失。')) return; void run(async () => { await restoreBackupPackage(preview, mode); setNotice('恢复成功，正在刷新…'); window.location.reload(); }); }}>确认恢复</button><button disabled={busy} className="ui-button-secondary" onClick={() => setPreview(null)}>取消</button></div></div>}{notice && <p role="status" className="ui-muted text-xs break-words">{notice}</p>}
  </div>;
}
