/**
 * 训练日程的场景舞台：背景用已生成的地点插画，否则用地点类型的默认图。
 * 时段和天气只决定叠层，不请求模型。
 */
import bedroom from '../../assets/rpg-scenes/bedroom.webp';
import home from '../../assets/rpg-scenes/home.webp';
import bath from '../../assets/rpg-scenes/bath.webp';
import playroom from '../../assets/rpg-scenes/playroom.webp';
import shop from '../../assets/rpg-scenes/shop.webp';
import work from '../../assets/rpg-scenes/work.webp';
import cafe from '../../assets/rpg-scenes/cafe.webp';
import outdoor from '../../assets/rpg-scenes/outdoor.webp';
import type { RpgLocationKind } from './tavernRpgContent';
import type { TavernEmotionKey } from './tavernTypes';

export const RPG_SCENE_BACKGROUNDS: Record<Exclude<RpgLocationKind, 'special'>, string> = {
  bedroom,
  home,
  bath,
  playroom,
  shop,
  work,
  cafe,
  outdoor,
};

export const RPG_SCENE_FALLBACK_KIND = 'home' as const;

export type SceneBackgroundSource = 'generated' | 'kind' | 'fallback';

export interface SceneBackground {
  src: string | null;
  source: SceneBackgroundSource;
  kind: string;
}

const IMAGE_SOURCE = /^(?:https?:|data:image\/|blob:)/i;

export const isSceneImage = (value?: string | null) => Boolean(value && IMAGE_SOURCE.test(value.trim()));

export const resolveSceneBackground = (
  kind: string | null | undefined,
  generated?: string | null,
  defaults: Partial<Record<string, string>> = RPG_SCENE_BACKGROUNDS,
  fallbackKind = RPG_SCENE_FALLBACK_KIND,
): SceneBackground => {
  const normalized = typeof kind === 'string' ? kind : '';
  if (isSceneImage(generated)) return { src: generated!.trim(), source: 'generated', kind: normalized || fallbackKind };
  const own = defaults[normalized];
  if (own) return { src: own, source: 'kind', kind: normalized };
  const fallback = defaults[fallbackKind] ?? null;
  return { src: fallback, source: 'fallback', kind: normalized || fallbackKind };
};

export type PeriodLightId = 'dawn' | 'day' | 'dusk' | 'night';

export interface PeriodLight {
  id: PeriodLightId;
  label: string;
  /** 叠在背景上的颜色，清晨暖、白天几乎透明、黄昏橙、深夜蓝。 */
  wash: string;
  vignette: string;
}

export const PERIOD_LIGHTS: PeriodLight[] = [
  { id: 'dawn', label: '清晨', wash: 'rgba(255, 206, 156, 0.34)', vignette: 'rgba(120, 72, 36, 0.18)' },
  { id: 'day', label: '白天', wash: 'rgba(255, 255, 255, 0.06)', vignette: 'rgba(40, 48, 64, 0.12)' },
  { id: 'dusk', label: '黄昏', wash: 'rgba(232, 112, 42, 0.38)', vignette: 'rgba(92, 32, 12, 0.28)' },
  { id: 'night', label: '深夜', wash: 'rgba(16, 28, 72, 0.58)', vignette: 'rgba(2, 6, 18, 0.55)' },
];

export const periodLight = (period: number): PeriodLight => PERIOD_LIGHTS[period] ?? PERIOD_LIGHTS[1];

export type SceneWeatherFx = 'none' | 'rain' | 'snow' | 'fog';

export const weatherFx = (weather: string | null | undefined): SceneWeatherFx => {
  if (weather === 'rain' || weather === 'snow' || weather === 'fog') return weather;
  return 'none';
};

export interface SceneSprite {
  mode: 'image' | 'plate';
  src: string;
  emotion: string;
}

export const resolveSceneSprite = (
  portrait: { avatar?: string; expressions?: Partial<Record<string, string>> | null } | null | undefined,
  emotion: string | null | undefined,
): SceneSprite => {
  const key = emotion || 'neutral';
  const expressions = portrait?.expressions;
  const specific = expressions?.[key];
  const neutral = expressions?.neutral;
  const avatar = portrait?.avatar || '';
  const src = (typeof specific === 'string' && specific.trim())
    || (typeof neutral === 'string' && neutral.trim())
    || avatar;
  return { mode: isSceneImage(src) ? 'image' : 'plate', src, emotion: key };
};

export type SceneMode = 'open' | 'collapsed' | 'off';

const SCENE_MODE_KEY = 'ycy_rpg_scene_mode';

export const loadSceneMode = (): SceneMode => {
  try {
    const value = localStorage.getItem(SCENE_MODE_KEY);
    if (value === 'collapsed' || value === 'off' || value === 'open') return value;
  } catch {
    // ignore
  }
  return 'open';
};

export const saveSceneMode = (mode: SceneMode) => {
  try {
    localStorage.setItem(SCENE_MODE_KEY, mode);
  } catch {
    // ignore
  }
};

export const CHECK_TIER_BANNER: Record<string, string> = {
  crit: '大成功',
  success: '成功',
  costly: '勉强成功',
  fail: '失败',
  critFail: '大失败',
};
