/**
 * 酒馆训练日程：多步奇遇支线事件链（Chained Narrative Encounters）
 * 包含「失落的日记」、「雪见暖汤」、「反叛的火种」等可跨天跨地推进的连续叙事。
 */
import type { RpgChoice, RpgLocationKind, RpgStatKey, RpgTraineeStats } from './tavernRpgContent';
import type { RpgWeatherKey } from './tavernRpgWeather';

export interface RpgChainedEventStep {
  chainId: string;
  step: number;
  nextStep: number;
  title: string;
  text: string;
  kinds: RpgLocationKind[];
  weather?: RpgWeatherKey[];
  choices: RpgChoice[];
  gain?: Partial<RpgTraineeStats>;
  stressDelta?: number;
  newTraitId?: string;
  condition?: (stats: RpgTraineeStats, stress: number, violations: number, day?: number) => boolean;
}

export const RPG_CHAINED_EVENTS: RpgChainedEventStep[] = [
  // ─── 支线 1：失落的日记 (Lost Diary) ──────────────────────────────────────
  {
    chainId: 'lost_diary',
    step: 0,
    nextStep: 1,
    title: '抽屉深处的黑皮记事本',
    text: '整理卧榻角落时，你在床底暗格发现了一本磨损严重的旧黑皮记事本，封皮上烫印着属于调教者的私密家徽。锁扣松动，泛黄的书页仿佛在引诱着你的视线。',
    kinds: ['bedroom'],
    condition: (_stats, _stress, _violations, day) => (day ?? 1) >= 2,
    choices: [
      { text: '小心翼翼翻开残页窥看', check: { stat: 'shame', dc: 11 } },
      { text: '克制好奇，擦拭干净后放回暗格' },
    ],
    gain: { shame: -2, devotion: 1 },
  },
  {
    chainId: 'lost_diary',
    step: 1,
    nextStep: 2,
    title: '泛黄的残缺旧痕',
    text: '在差事与行走的间隙，你脑海中不断浮现记事本里记录的第一任学徒……字里行间原来隐藏着调教者曾经被深信之人背叛的旧伤，这或许正是他严酷规训背后的保护壳。',
    kinds: ['shop', 'work', 'cafe'],
    choices: [
      { text: '买下一个红漆火漆封印，准备妥善保管日记' },
      { text: '默默将这些秘密记在心底' },
    ],
    gain: { devotion: 3 },
  },
  {
    chainId: 'lost_diary',
    step: 2,
    nextStep: 3,
    title: '坦白与灵魂的钥匙',
    text: '晚间休息前，你双手捧着记事本跪在调教者面前主动坦白。调教者先是身体一僵，眼神掠过防备与沉痛，但看到你温顺仰望的真诚目光，终于长叹一声揉了揉你的头发：『原来你全看到了……既然知晓了我的软肋，这辈子就不许逃走了。』',
    kinds: ['playroom', 'home', 'bedroom'],
    choices: [
      { text: '双手握住他的手腕：『我永远都在这里。』' },
    ],
    gain: { devotion: 5, obedience: 3 },
    stressDelta: -15,
  },

  // ─── 支线 2：雪见暖汤 (Snow Warmth) ──────────────────────────────────────
  {
    chainId: 'snow_warmth',
    step: 0,
    nextStep: 1,
    title: '初雪落下的冰霜',
    text: '窗外漫天鹅毛大雪，刺骨的寒气顺着走廊蔓延。调教者走过你身旁时，伸手探了探你冻得发红的指尖，眉宇间掠过一丝少见的在意。',
    kinds: ['outdoor', 'special'],
    weather: ['snow'],
    choices: [
      { text: '将冻僵的手缩进调教者的掌心暖和' },
      { text: '规矩站直：『我不冷，可以继续受训。』', check: { stat: 'endurance', dc: 12 } },
    ],
    gain: { endurance: 2, devotion: 2 },
  },
  {
    chainId: 'snow_warmth',
    step: 1,
    nextStep: 2,
    title: '热汤氤氲的水雾',
    text: '在大雪纷飞的傍晚，调教者将你带进了弥漫着白茫茫水雾的私密温泉浴室。水波轻晃，温热的水流漫过肌肤，褪去了连日规训的所有酸痛与疲累。',
    kinds: ['bath'],
    choices: [
      { text: '红着脸帮调教者擦拭后背' },
      { text: '温顺地伏在池边享受安抚' },
    ],
    gain: { shame: -2, devotion: 3 },
    stressDelta: -20,
  },
  {
    chainId: 'snow_warmth',
    step: 2,
    nextStep: 3,
    title: '壁炉前的轻语',
    text: '沐浴后披着厚厚的毛毯依偎在壁炉旁，柴火噼啪作响。调教者递来热茶，在雪夜的火光中轻轻抚摸你的后颈：『冷的话，今晚就准你靠着我睡。』',
    kinds: ['home', 'bedroom'],
    choices: [
      { text: '像猫一样钻进对方的怀里闭上双眼' },
    ],
    gain: { devotion: 5 },
    stressDelta: -10,
  },

  // ─── 支线 3：反叛的火种 (Rebel Spark) ────────────────────────────────────
  {
    chainId: 'rebel_spark',
    step: 0,
    nextStep: 1,
    title: '紧绷的锁链声',
    text: '连续的家规违抗与严厉责罚，让空气中的火药味浓得几乎要滴出水来。你别过头拒绝直视调教者的眼睛，下颌因倔强而咬得泛白。',
    kinds: ['playroom', 'work'],
    condition: (_stats, _stress, violations) => violations >= 2,
    choices: [
      { text: '直视对方的眼睛，倔强到底' },
      { text: '垂下眼睫小声认错', check: { stat: 'obedience', dc: 13 } },
    ],
    gain: { endurance: 3 },
    stressDelta: 10,
  },
  {
    chainId: 'rebel_spark',
    step: 1,
    nextStep: 2,
    title: '被私藏的钥匙',
    text: '在清扫训练器材时，你偶然在架子底部瞥见了一柄备用的小黄铜钥匙。如果悄悄藏起它，或许能解开夜里的约束具……',
    kinds: ['shop', 'work', 'playroom'],
    choices: [
      { text: '悄悄将钥匙藏进袖口', check: { stat: 'endurance', dc: 14 } },
      { text: '犹豫再三，还是双手奉交给调教者' },
    ],
    gain: { obedience: -2, endurance: 2 },
  },
  {
    chainId: 'rebel_spark',
    step: 2,
    nextStep: 3,
    title: '抉择的十字路口',
    text: '夜色深沉，寒风吹拂。如果你踏出这一步，外面的自由天地近在咫尺；但宅邸中那个虽严厉却唯独将私密目光投给你的身影，同样深深刻在你的心底。',
    kinds: ['outdoor', 'special', 'bedroom'],
    choices: [
      { text: '转身狂奔回宅邸，抱紧调教者寻求安心' },
      { text: '留下一纸短信，决然迈入风雪中出逃' },
    ],
    gain: { devotion: -5, obedience: -5 },
  },
];

/** 获取当前地点、天气和进度下可触发的支线奇遇事件 */
export const findAvailableChainStep = (
  locationKind: RpgLocationKind,
  weather: RpgWeatherKey,
  chains: Record<string, number>,
  stats: RpgTraineeStats,
  stress: number,
  violations: number,
  day: number = 1
): RpgChainedEventStep | null => {
  for (const event of RPG_CHAINED_EVENTS) {
    const currentStep = chains[event.chainId] ?? 0;
    if (currentStep !== event.step) continue;
    if (!event.kinds.includes(locationKind)) continue;
    if (event.weather && !event.weather.includes(weather)) continue;
    if (event.condition && !event.condition(stats, stress, violations, day)) continue;
    return event;
  }
  return null;
};
