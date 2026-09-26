import React, { useEffect, useRef, useState } from 'react';
import { listLocalAsmrTracks } from '../core/asmr/localAudioLibrary';
import { exportTavernRepository } from '../core/tavern/tavernChatRepository';
import { SignInCodeEngine } from '../core/tavern/signInCodeEngine';
import { exportTextFile } from '../core/ui/exportFile';
import { BackupPackagePanel } from './BackupPackagePanel';

const formatSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
export function DataManagementPanel({ compact = false }: { compact?: boolean }) {
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [migrationText, setMigrationText] = useState('');
  const [preview, setPreview] = useState<{ json: string; count: number; date: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const refresh = async () => {
    const groups: Record<string, number> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i); if (!key?.startsWith('ycy_')) continue;
        const group = key.includes('tavern') ? '酒馆本地数据' : key.includes('wardrobe') ? '衣橱日记' : /barbie|pavlov|femboy/.test(key) ? '训练记录' : key.includes('dungeon') ? '地牢与存档' : '设置与其他';
        groups[group] = (groups[group] || 0) + new TextEncoder().encode(localStorage.getItem(key) || '').byteLength;
      }
      const [audio, chat] = await Promise.all([listLocalAsmrTracks(true), exportTavernRepository()]);
      groups['本地音频（含回收站）'] = audio.reduce((sum, track) => sum + track.size, 0);
      groups['聊天数据库（含冗余副本）'] = new TextEncoder().encode(JSON.stringify(chat)).byteLength;
      if (mounted.current) setUsage(groups);
    } catch { if (mounted.current) { setUsage(groups); setNotice('部分存储暂时无法读取，请点击刷新重试。'); } }
  };
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; }; }, []);
  const exportBackup = async () => {
    setBusy(true); setNotice('正在读取最新记录…');
    try { const json = await SignInCodeEngine.generateCompleteBackup(); await exportTextFile(`yiciyuan-backup-${Date.now()}.json`, json); setNotice('备份文件已导出，API Key 与音频文件不包含在内。'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '导出失败'); }
    finally { setBusy(false); }
  };
  const readBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setPreview(null);
    try {
      if (file.size > 5_000_000) throw new Error('备份文件超过 5 MB，请使用分批导出的文件。');
      const json = await file.text(); const data = JSON.parse(json);
      if (!data || !data.snapshot || typeof data.snapshot !== 'object' || Array.isArray(data.snapshot)) throw new Error('请选择本地数据备份 JSON；旧版系统配置请在下方配置导入中恢复。');
      const count = Object.keys(data.snapshot).length; if (!count || count > 500) throw new Error('备份为空或项目数量超限。');
      const timestamp = Number(data.timestamp);
      setPreview({ json, count, date: Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : '未知时间' });
    } catch (error) { setNotice(error instanceof Error ? error.message : '读取失败'); }
  };
  const previewCode = () => {
    try {
      if (!migrationText.trim() || migrationText.length > 7_000_000) throw new Error('迁移内容为空或过大');
      const json = migrationText.trim().startsWith('{') ? migrationText.trim() : new TextDecoder().decode(Uint8Array.from(atob(migrationText.trim()), char => char.charCodeAt(0)));
      const data = JSON.parse(json);
      if (!data?.snapshot || typeof data.snapshot !== 'object' || Array.isArray(data.snapshot)) throw new Error('迁移内容无效');
      const count = Object.keys(data.snapshot).length;
      if (!count || count > 500 || json.length > 5_000_000) throw new Error('迁移数据项为空或超过上限');
      setPreview({ json, count, date: data.timestamp ? new Date(data.timestamp).toLocaleString() : '未知时间' });
    } catch (error) { setNotice(error instanceof Error ? error.message : '迁移码无效'); }
  };
  return <section className="ui-card space-y-3">
    <div className="flex items-center justify-between gap-2"><h3 className="font-bold">{compact ? '本地酒馆备份与迁移' : '本地数据管理'}</h3><button className="ui-button-secondary" disabled={busy} onClick={() => void refresh()}>刷新</button></div>
    {!compact && <dl className="space-y-2 text-xs">{Object.entries(usage).map(([name, bytes]) => <div className="flex justify-between gap-2" key={name}><dt>{name}</dt><dd>{formatSize(bytes)}</dd></div>)}</dl>}
    <p className="ui-muted text-xs leading-relaxed">普通 JSON 备份包含角色、聊天、草稿、训练、日记、地牢和设置，不含音频原文件与 API Key。下方完整文件包可包含音频。占用为数据估算，不含应用安装包。</p>
    <div className="grid grid-cols-2 gap-2"><button className="ui-button" disabled={busy} onClick={() => void exportBackup()}>{busy ? '导出中…' : '导出数据备份'}</button><button className="ui-button-secondary" disabled={busy} onClick={() => input.current?.click()}>选择备份恢复</button></div>
    <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={readBackup} />
    <details><summary className="text-xs cursor-pointer">迁移码与粘贴恢复</summary><textarea aria-label="迁移码或备份 JSON" className="mt-2 w-full p-2 text-xs" rows={3} value={migrationText} onChange={e => setMigrationText(e.target.value)} maxLength={7000000} placeholder="粘贴旧版迁移码或备份 JSON" /><div className="flex gap-2"><button className="ui-button-secondary" disabled={busy} onClick={previewCode}>预览恢复</button><button className="ui-button-secondary" disabled={busy} onClick={() => { setBusy(true); void SignInCodeEngine.generateCompleteBackup().then(json => { const bytes = new TextEncoder().encode(json); let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); setMigrationText(btoa(binary)); setNotice('迁移码已生成，请复制文本；较大备份建议使用 JSON 文件。'); }).catch(error => setNotice(error instanceof Error ? error.message : '生成失败')).finally(() => setBusy(false)); }}>生成迁移码</button></div></details>
    {preview && <div className="rounded-xl border border-[var(--line)] p-3 space-y-2 text-xs"><p>备份时间：{preview.date} · {preview.count} 项</p><p>恢复会覆盖本机同名数据，建议先导出当前数据。API Key 不会导入，恢复后需重新配置。</p><div className="flex gap-2"><button className="ui-button" disabled={busy} onClick={() => { const result = SignInCodeEngine.restoreFromCode(preview.json); setNotice(result.message); if (result.success) { setBusy(true); setTimeout(() => window.location.reload(), 1200); } }}>确认恢复</button><button className="ui-button-secondary" onClick={() => setPreview(null)}>取消</button></div></div>}
    {notice && <p className="ui-muted text-xs break-words" role="status">{notice}</p>}
    <BackupPackagePanel />
  </section>;
}
