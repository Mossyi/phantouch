import React from 'react';
import { RPG_ICON_PATHS, type RpgIconName } from '../../core/tavern/rpgIcons';
import type { RpgLocationKind } from '../../core/tavern/tavernRpg';

/** game-icons.net 图标（CC BY 3.0），用 currentColor 着色 */
export const RpgIcon: React.FC<{ name: RpgIconName; className?: string; title?: string }> = ({ name, className = 'h-4 w-4', title }) => (
  <svg viewBox="0 0 512 512" className={className} fill="currentColor" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
    {title && <title>{title}</title>}
    <path d={RPG_ICON_PATHS[name]} />
  </svg>
);

export const KIND_ICONS: Record<RpgLocationKind, RpgIconName> = {
  bedroom: 'bed',
  home: 'sofa',
  bath: 'bathtub',
  playroom: 'locked-door',
  shop: 'present',
  work: 'broom',
  cafe: 'coffee-cup',
  outdoor: 'pine-tree',
  special: 'sparkles',
};

const COURSE_ICONS: Record<string, RpgIconName> = {
  recite: 'scroll-unfurled',
  posture: 'body-balance',
  service: 'teapot',
  kneel: 'kneeling',
  command: 'whistle',
  blindfold: 'blindfold',
  errand: 'footsteps',
  hold: 'hourglass',
  pelvic_endurance: 'body-balance',
  heart_calm: 'hearts',
  trust: 'shaking-hands',
  report: 'notebook',
  aftercare: 'hearts',
  bath: 'bathtub',
};
export const courseIcon = (id: string): RpgIconName => COURSE_ICONS[id] ?? 'open-book';

const ITEM_ICONS: Array<[RegExp, RpgIconName]> = [
  [/甜点|点心|糖|蛋糕/, 'cupcake'],
  [/休息|睡/, 'night-sleep'],
  [/抱/, 'heart-wings'],
  [/免罚|券/, 'ticket'],
  [/撒娇|信/, 'love-letter'],
  [/契约|名牌|笔/, 'fountain-pen'],
  [/项圈/, 'heavy-collar'],
  [/缎带|丝带|发夹|蝴蝶结/, 'ribbon'],
  [/铃/, 'ringing-bell'],
  [/蜡烛|香薰/, 'candle-light'],
  [/书|日记/, 'open-book'],
  [/茶/, 'teapot'],
  [/眼罩/, 'blindfold'],
];
export const itemIcon = (name: string): RpgIconName => ITEM_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? 'present';

const TRAIT_ICONS: Record<string, RpgIconName> = {
  docile: 'ringing-bell',
  tough: 'shield',
  open: 'feather',
  clingy: 'heart-wings',
  stubborn: 'lock-picking',
  disciplined: 'laurels',
  diligent: 'medal',
};
export const traitIcon = (id: string): RpgIconName => TRAIT_ICONS[id] ?? 'medal';

export const PERIOD_ICONS: RpgIconName[] = ['sunrise', 'sun', 'sunset', 'night-sky'];
export const STAGE_ICONS: RpgIconName[] = ['candle-light', 'scroll-unfurled', 'meditation', 'ringing-bell', 'crown'];
