import React, { useState } from 'react';
import { VoiceTrainingSessionRecord } from '../../core/voice/voiceTraining';
import { getBarbieRitualDayKey } from '../../core/discipline/barbieRitual';
import { exportTextFile } from '../../core/ui/exportFile';

export function VoiceHistoryPanel({ records }: { records: VoiceTrainingSessionRecord[] }) {
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState('');
  const [exercise, setExercise] = useState('reading');
  const labels: Record<string, string> = { warmup: '轻柔热身', glide: '平滑滑音', reading: '自然朗读', expression: '语调表达' };
  const comparable = records.filter(r => r.exercise === exercise && r.completedAt <= Date.now()).sort((a, b) => b.completedAt - a.completedAt);
  const current = comparable.slice(0, 3), previous = comparable.slice(3, 6);
  const average = (items: VoiceTrainingSessionRecord[]) => Math.round(items.reduce((sum, r) => sum + r.stabilityPercent, 0) / items.length);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const since = new Date(now); since.setDate(since.getDate() - days + 1);
  const recent = records.filter(record => record.completedAt >= since.getTime());
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(since); date.setDate(date.getDate() + index);
    const key = getBarbieRitualDayKey(date);
    const items = recent.filter(record => getBarbieRitualDayKey(new Date(record.completedAt)) === key);
    return { key, count: items.length, score: items.length ? Math.round(items.reduce((sum, item) => sum + item.stabilityPercent, 0) / items.length) : 0 };
  });
  const pages = Math.max(1, Math.ceil(records.length / 10));
  const safePage = Math.min(page, pages - 1);
  return <section className="ui-card space-y-3">
    <div className="flex items-center justify-between gap-2"><h4 className="font-bold">训练历史与趋势</h4><select aria-label="训练趋势范围" value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>近 7 天</option><option value={30}>近 30 天</option></select></div>
    <div className="rounded-xl border border-[var(--line)] p-3 space-y-2 text-xs"><label>同类练习复盘<select className="ml-2 p-1" value={exercise} onChange={e => setExercise(e.target.value)}>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><p>{comparable.length >= 6 ? `最近 3 次平均稳定度 ${average(current)}%，此前 3 次 ${average(previous)}%，变化 ${average(current) - average(previous) > 0 ? '+' : ''}${average(current) - average(previous)} 个百分点。` : `此练习已有 ${comparable.length} 次记录，达到 6 次后可比较最近两组表现。`}</p><p className="ui-muted">只比较同类练习。文本、环境或目标区调整也会影响表现，数值不是声线好坏的评判。</p></div>
    <p className="ui-muted text-xs">本期 {recent.length} 次 · {Math.round(recent.reduce((sum, item) => sum + item.durationSec, 0) / 60)} 分钟 · 以下为每日平均稳定度</p>
    <div className="flex h-28 items-end gap-1" aria-label="每日稳定度图">{daily.map(day => <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${day.key}：${day.count}次，稳定度${day.score}%`}><div className="rounded-t bg-[#b82d60]" style={{ height: day.count ? `${Math.max(3, day.score)}%` : '2px', opacity: day.count ? 1 : 0.2 }} /><span className="text-center text-[10px]">{day.key.slice(-2)}</span></div>)}</div>
    <details><summary className="cursor-pointer text-xs">查看每日数值</summary><div className="max-h-48 overflow-auto text-xs">{daily.map(day => <p key={day.key}>{day.key} · {day.count ? `${day.count} 次 · ${day.score}%` : '未训练'}</p>)}</div></details>
    <p className="ui-muted text-xs">已保留 {records.length} 条，最多 1000 条；旧版本已移除的历史无法恢复。</p>
    {records.slice(safePage * 10, safePage * 10 + 10).map(record => <div key={record.id} className="border-t border-[var(--line)] pt-2 text-xs"><p>{new Date(record.completedAt).toLocaleString()} · {record.durationSec} 秒</p><p className="ui-muted">均值 {record.averagePitchHz} Hz · 稳定 {record.stabilityPercent}% · 目标区 {record.targetHitPercent}%</p></div>)}
    <div className="flex items-center justify-between gap-2"><button className="ui-button-secondary" disabled={!safePage} onClick={() => setPage(safePage - 1)}>上一页</button><span className="text-xs">{safePage + 1}/{pages}</span><button className="ui-button-secondary" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>下一页</button></div>
    <button className="ui-button-secondary w-full" disabled={!records.length} onClick={() => void exportTextFile('voice-training-history.json', JSON.stringify({ version: 1, records }, null, 2)).then(() => setNotice('训练记录已导出。')).catch(() => setNotice('未完成导出，请重试。'))}>导出全部训练记录</button>{notice && <p role="status" className="text-xs">{notice}</p>}
  </section>;
}
