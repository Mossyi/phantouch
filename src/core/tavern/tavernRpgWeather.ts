/**
 * 酒馆训练日程：天气系统
 * 每日清晨根据权重刷新天气，对课程、差事、移动、生图和 AI 描写产生动态影响。
 */

export type RpgWeatherKey = 'clear' | 'rain' | 'snow' | 'fog';

export interface RpgWeatherMeta {
  key: RpgWeatherKey;
  label: string;
  icon: string;
  description: string;
  promptHint: string;
}

export const RPG_WEATHER_META: Record<RpgWeatherKey, RpgWeatherMeta> = {
  clear: {
    key: 'clear',
    label: '晴朗',
    icon: '☀️',
    description: '阳光明媚，户外差事积分收益 +20%，户外训练耐力消耗减少',
    promptHint: '今天晴空万里，阳光透过窗格洒在室内，适宜出行与户外规矩练习。',
  },
  rain: {
    key: 'rain',
    label: '暴雨',
    icon: '🌧️',
    description: '大雨倾盆，户外差事暂停；居所与训练室的课程依恋提升效果额外 +1',
    promptHint: '窗外暴雨如注，雨水急促敲打着窗沿，昏暗的室内将两人圈定在私密狭小的空间中。',
  },
  snow: {
    key: 'snow',
    label: '大雪',
    icon: '❄️',
    description: '银装素裹，浴室沐浴与安抚时间效果翻倍（压力额外 -5），温泉格外惬意',
    promptHint: '庭院与屋顶积满厚厚白雪，寒气凛冽，唯有壁炉与彼此的体温能抵御严寒。',
  },
  fog: {
    key: 'fog',
    label: '薄雾',
    icon: '🌫️',
    description: '晨雾弥漫，探索周边概率提升 50%，身体在朦胧中更易平复心率',
    promptHint: '浓雾笼罩着周围的街道与建筑，视线朦胧，神秘而带有几分隔绝尘世的私密感。',
  },
};

export const ALL_WEATHERS: RpgWeatherKey[] = ['clear', 'rain', 'snow', 'fog'];

/** 每日清晨随机抽取天气（晴朗 45%，暴雨 25%，大雪 15%，薄雾 15%） */
export const rollWeather = (random: () => number = Math.random): RpgWeatherKey => {
  const roll = random();
  if (roll < 0.45) return 'clear';
  if (roll < 0.70) return 'rain';
  if (roll < 0.85) return 'snow';
  return 'fog';
};

export const normalizeWeather = (val: unknown): RpgWeatherKey => {
  if (typeof val === 'string' && (val === 'clear' || val === 'rain' || val === 'snow' || val === 'fog')) {
    return val;
  }
  return 'clear';
};
