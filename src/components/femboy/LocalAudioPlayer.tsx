import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getLocalAsmrBlob, LocalAsmrTrack } from '../../core/asmr/localAudioLibrary';
import { readPreference, writePreference } from '../../core/ui/localPreferences';

export interface LocalAudioPlayerHandle { play: (track: LocalAsmrTrack) => Promise<void>; stop: () => void }
interface Props {
  tracks: LocalAsmrTrack[];
  queueIds?: string[];
  onActiveChange: (track: LocalAsmrTrack | null) => void;
  onStatus: (text: string) => void;
  onBeforePlay: () => void;
}
const POSITION_KEY = 'ycy_asmr_positions';
export const LocalAudioPlayer = forwardRef<LocalAudioPlayerHandle, Props>((props, ref) => {
  const latest = useRef(props); latest.current = props;
  const audioRef = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const current = useRef<LocalAsmrTrack | null>(null);
  const url = useRef('');
  const lastWrite = useRef(0);
  const [active, setActive] = useState<LocalAsmrTrack | null>(null);
  const [mode, setMode] = useState('sequence');
  const modeRef = useRef(mode); modeRef.current = mode;
  const [deadline, setDeadline] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(speed); speedRef.current = speed;

  const remember = (finished = false) => {
    if (!current.current || !audioRef.current) return;
    const stored = readPreference<Record<string, number>>(POSITION_KEY, {});
    const positions = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    const seconds = audioRef.current.currentTime;
    const next = Object.fromEntries(Object.entries(positions).filter(([id, time]) => id !== current.current!.id && Number.isFinite(time)).slice(-199));
    next[current.current.id] = finished ? 0 : (Number.isFinite(seconds) ? seconds : 0);
    if (!writePreference(POSITION_KEY, next)) latest.current.onStatus('播放进度保存失败，本地空间可能不足。');
    writePreference('ycy_asmr_last_track', current.current.id);
  };
  const release = () => {
    request.current++;
    remember();
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.onloadedmetadata = null; audio.removeAttribute('src'); audio.load(); }
    current.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = '';
  };
  const stop = () => { release(); setActive(null); latest.current.onActiveChange(null); };
  const play = async (track: LocalAsmrTrack, resume = true) => {
    if (current.current?.id === track.id && audioRef.current?.src && resume) {
      const audio = audioRef.current;
      if (!audio.paused) audio.pause();
      else try { await audio.play(); } catch { latest.current.onStatus('播放失败，请再次点击播放。'); }
      return;
    }
    latest.current.onBeforePlay();
    stop();
    const generation = request.current;
    latest.current.onStatus('正在读取音频…');
    try {
      const blob = await getLocalAsmrBlob(track.id);
      if (request.current !== generation || !audioRef.current) return;
      const audio = audioRef.current;
      current.current = track;
      url.current = URL.createObjectURL(blob);
      const positions = readPreference<Record<string, number>>(POSITION_KEY, {});
      const position = resume ? Number(positions?.[track.id]) : 0;
      audio.onloadedmetadata = () => {
        if (generation !== request.current) return;
        if (Number.isFinite(position) && position > 0 && position < audio.duration - 2) audio.currentTime = position;
      };
      audio.src = url.current;
      audio.playbackRate = speedRef.current;
      await audio.play();
      if (request.current !== generation) return;
      setActive(track); latest.current.onActiveChange(track);
      latest.current.onStatus('离线播放中；进度自动保存，点击曲目可暂停或继续。');
    } catch (error) {
      if (request.current !== generation) return;
      stop(); latest.current.onStatus(error instanceof Error ? error.message : '播放失败');
    }
  };
  const step = (offset: number, ended = false) => {
    const track = latest.current.tracks.find(item => item.id === current.current?.id) || current.current;
    if (!track) return;
    const explicit = (latest.current.queueIds || []).flatMap(id => latest.current.tracks.filter(item => item.id === id));
    const queue = explicit.some(item => item.id === track.id) ? explicit : latest.current.tracks.filter(item => item.categoryId === track.categoryId);
    const index = queue.findIndex(item => item.id === track.id);
    if (ended) { remember(true); if (audioRef.current) audioRef.current.currentTime = 0; }
    if (ended && modeRef.current === 'single') { stop(); return; }
    if (ended && modeRef.current === 'repeat') { void play(track, false); return; }
    const next = index + offset;
    if (!queue.length || index < 0 || (ended && next >= queue.length && modeRef.current !== 'loop')) { stop(); return; }
    void play(queue[(next + queue.length) % queue.length], !ended);
  };
  useImperativeHandle(ref, () => ({ play, stop }));
  useEffect(() => () => release(), []);
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); setRemaining(seconds);
      if (!seconds) { stop(); setDeadline(0); latest.current.onStatus('定时停止已生效。'); }
    };
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [deadline]);
  const lastId = readPreference<string>('ycy_asmr_last_track', '');
  const lastTrack = props.tracks.find(track => track.id === lastId);
  return <div className="ui-card space-y-3 m-3" aria-label="本地音频播放器">
    <div className="flex items-center justify-between gap-2"><strong className="min-w-0 break-words">{active?.title || '离线播放器'}</strong>{active && <button className="ui-button-secondary" onClick={stop}>停止</button>}</div>
    <audio ref={audioRef} controls preload="metadata" className="w-full" onEnded={() => step(1, true)} onPause={() => remember()} onSeeked={() => remember()} onTimeUpdate={() => { if (Date.now() - lastWrite.current > 2000) { lastWrite.current = Date.now(); remember(); } }} onError={() => { if (current.current) { stop(); latest.current.onStatus('音频无法播放，请检查格式或重新导入。'); } }} />
    {!active && lastTrack && <button className="ui-button-secondary w-full" onClick={() => void play(lastTrack)}>继续上次：{lastTrack.title}</button>}
    <div className="grid grid-cols-2 gap-2"><button disabled={!active} className="ui-button-secondary" onClick={() => step(-1)}>上一首</button><button disabled={!active} className="ui-button-secondary" onClick={() => step(1)}>下一首</button></div>
    <div className="grid grid-cols-2 gap-3 text-xs">
      <label>播放顺序<select className="mt-1 w-full p-2" value={mode} onChange={e => setMode(e.target.value)}><option value="sequence">分类内顺序播放</option><option value="single">播完停止</option><option value="repeat">单曲循环</option><option value="loop">分类循环</option></select></label>
      <label>倍速<select className="mt-1 w-full p-2" value={speed} onChange={e => { const value = Number(e.target.value); setSpeed(value); if (audioRef.current) audioRef.current.playbackRate = value; }}>{[0.75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value} 倍</option>)}</select></label>
      <label>定时停止<select className="mt-1 w-full p-2" value={deadline ? 'active' : '0'} onChange={e => setDeadline(Number(e.target.value) ? Date.now() + Number(e.target.value) * 60000 : 0)}><option value="0">不定时</option>{deadline > 0 && <option value="active">剩余 {Math.ceil(remaining / 60)} 分钟</option>}{[5,15,30,60].map(n => <option key={n} value={n}>{n} 分钟后</option>)}</select></label>
    </div><p className="ui-muted text-xs">离开模块时暂停并保存进度。曲目在自建列表中时按列表播放，否则按所属分类播放。</p>
  </div>;
});
