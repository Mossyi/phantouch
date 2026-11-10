import React, { useEffect, useState } from 'react';
import type { PeriodLight, SceneMode, SceneSprite, SceneWeatherFx } from '../../core/tavern/tavernRpgScene';
import { CHECK_TIER_BANNER } from '../../core/tavern/tavernRpgScene';

export interface SceneRollCue {
  id: string;
  roll: number;
  tier: string;
  stake: number;
  net: number;
}

interface RpgSceneStageProps {
  locationName: string;
  backgroundSrc: string | null;
  light: PeriodLight;
  weather: SceneWeatherFx;
  sprite: SceneSprite;
  speakerName: string;
  dayText: string;
  periodLabel: string;
  title: string | null;
  stamina: number;
  stress: number;
  tension: number | null;
  roll: SceneRollCue | null;
  twistToken: string | null;
  toast: string | null;
  mode: SceneMode;
  onMode: (mode: SceneMode) => void;
  onDismissToast?: () => void;
}

const stillMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const RpgSceneStage: React.FC<RpgSceneStageProps> = ({
  locationName, backgroundSrc, light, weather, sprite, speakerName, dayText, periodLabel, title,
  stamina, stress, tension, roll, twistToken, toast, mode, onMode, onDismissToast,
}) => {
  const [previousSrc, setPreviousSrc] = useState<string | null>(null);
  const [currentSrc, setCurrentSrc] = useState(backgroundSrc);
  const [shake, setShake] = useState(false);
  const [showRoll, setShowRoll] = useState(false);
  const still = stillMotion();

  useEffect(() => {
    if (backgroundSrc === currentSrc) return;
    setPreviousSrc(currentSrc);
    setCurrentSrc(backgroundSrc);
  }, [backgroundSrc, currentSrc]);

  useEffect(() => {
    if (!twistToken) return;
    setShake(true);
    const timer = window.setTimeout(() => setShake(false), still ? 0 : 640);
    return () => window.clearTimeout(timer);
  }, [twistToken, still]);

  useEffect(() => {
    if (!roll) return;
    setShowRoll(true);
    const timer = window.setTimeout(() => setShowRoll(false), still ? 900 : 2400);
    return () => window.clearTimeout(timer);
  }, [roll?.id, still]);

  if (mode === 'off') return null;
  if (mode === 'collapsed') {
    return (
      <button type="button" onClick={() => onMode('open')} aria-label="展开场景" className="mx-3 mt-2 flex items-center justify-between rounded-2xl border border-pink-100 bg-pink-50/80 px-3 py-2 text-left text-[11px] font-bold text-slate-700">
        <span className="truncate">{locationName} · {periodLabel} · {dayText}</span>
        <span className="shrink-0 text-pink-600">展开场景</span>
      </button>
    );
  }

  return (
    <section aria-label="训练场景" className={`relative mx-3 mt-2 h-[42vw] max-h-[13.5rem] min-h-[9.5rem] overflow-hidden rounded-2xl border border-pink-100 bg-gradient-to-br from-slate-800 via-slate-700 to-pink-900 sm:h-56 ${shake && !still ? 'rpg-scene-shake' : ''}`}>
      {previousSrc && <img src={previousSrc} alt="" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500" />}
      {currentSrc ? <img key={currentSrc} src={currentSrc} alt="" className="rpg-scene-bg absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0" style={{ background: light.wash }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent 40%, ${light.vignette} 100%)` }} />
      {weather !== 'none' && !still && <div className={`rpg-weather rpg-weather-${weather}`} aria-hidden />}
      {weather === 'fog' && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-white/35 to-transparent" />}
      <div className="absolute inset-y-0 right-[8%] flex items-end">
        {sprite.mode === 'image' ? (
          <img key={`${sprite.emotion}:${sprite.src}`} src={sprite.src} alt={speakerName} className="rpg-sprite-enter h-[92%] max-w-[46%] object-contain object-bottom drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]" />
        ) : (
          <div className="mb-10 rounded-2xl bg-black/45 px-3 py-1.5 text-[12px] font-black text-white backdrop-blur-sm">{speakerName}</div>
        )}
      </div>
      <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2 text-white">
        <div className="min-w-0 rounded-xl bg-black/40 px-2 py-1 backdrop-blur-sm">
          <p className="truncate text-[12px] font-black">{locationName}</p>
          <p className="text-[10px] text-white/85">{dayText} · {periodLabel}{title ? ` · ${title}` : ''}</p>
        </div>
        <button type="button" onClick={() => onMode('collapsed')} aria-label="收起场景" className="rounded-full bg-black/40 px-2 py-1 text-[10px] font-bold backdrop-blur-sm">收起</button>
      </div>
      <div className="absolute bottom-2 left-2 space-y-1 text-[10px] font-bold text-white">
        <div className="flex items-center gap-1"><span className="w-7">体力</span><span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/30"><span className="block h-full bg-emerald-300" style={{ width: `${Math.max(0, Math.min(100, stamina))}%` }} /></span><span>{stamina}</span></div>
        <div className="flex items-center gap-1"><span className="w-7">压力</span><span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/30"><span className="block h-full bg-sky-300" style={{ width: `${Math.max(0, Math.min(100, stress))}%` }} /></span><span>{stress}</span></div>
      </div>
      {tension !== null && <div className="absolute bottom-2 right-2 rounded-full bg-amber-500/90 px-2 py-1 text-[10px] font-black text-white">⚡ {tension} 回合后有变数</div>}
      {showRoll && roll && (
        <div className={`absolute inset-0 grid place-items-center bg-black/25 ${still ? '' : 'rpg-die-banner'}`} aria-label="检定结果">
          <div className="rounded-2xl bg-white/95 px-4 py-3 text-center text-slate-800 shadow-lg">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-violet-600 text-2xl font-black text-white">{roll.roll}</div>
            <p className="mt-1 text-[13px] font-black">{CHECK_TIER_BANNER[roll.tier] || roll.tier}</p>
            {roll.stake > 0 && <p className="text-[11px] font-bold text-violet-700">{roll.net > 0 ? `积分 +${roll.net}` : roll.net < 0 ? `积分 ${roll.net}` : '押注退回'}</p>}
          </div>
        </div>
      )}
      {toast && (
        <button type="button" onClick={onDismissToast} className="absolute left-1/2 top-12 max-w-[80%] -translate-x-1/2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-900 shadow">
          {toast}
        </button>
      )}
    </section>
  );
};
