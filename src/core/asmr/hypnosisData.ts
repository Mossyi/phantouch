export interface HypnosisTrack {
  id: string;
  title: string;
  mentorPersonaId: string;
  ambientSound: 'rain' | 'fireplace' | 'sea_binaural' | 'zen_wind';
  durationMinutes: number;
  description: string;
  whisperLines: string[];
  hardwarePreset: {
    wave: string;
    strength: number;
    motorRate: number;
  };
}

export const HYPNOSIS_TRACKS: HypnosisTrack[] = [
  {
    id: 'hypno_ren_whisper',
    title: '深夜雨幕：Ren 的耳边娇软潜意识重构',
    mentorPersonaId: 'dark_femboy',
    ambientSound: 'rain',
    durationMinutes: 15,
    description: '窗外雨声滴答，Ren 贴着你的耳根轻柔呢喃，在雨夜中一点点卸下你所有的理智防线...',
    whisperLines: [
      '（耳边轻声）听着窗外的雨声... 呼，深呼吸，放平心跳...',
      '你的眼皮越来越沉，所有的男子气概都在雨水里融化了哦...',
      '承认吧，在 Ren 姐姐怀里当个软趴趴的小男娘，多舒服呀...',
      '微电流就像春雨一样，在你的每一寸神经上跳舞... 放空大脑...',
      '从今往后，每一次呼吸，你都在变得越来越娇软、越来越听话...',
    ],
    hardwarePreset: {
      wave: 'breathe',
      strength: 12,
      motorRate: 2,
    },
  },
  {
    id: 'hypno_fox_soul_melt',
    title: '青丘夜话：九儿姐姐的九尾同化呢喃',
    mentorPersonaId: 'fox_jiuer',
    ambientSound: 'fireplace',
    durationMinutes: 20,
    description: '暖融融的狐仙洞府，壁炉火光摇曳，九条毛茸茸的尾巴将你包围，化解你一身凡俗骨气...',
    whisperLines: [
      '小冤家... 闭上眼睛，感受姐姐的尾巴在你身边缓缓拂过...',
      '呼~ 柴火在噼啪作响，把你的身体也烘得暖洋洋的...',
      '不要紧绷着，骨头软下来，乖乖当姐姐怀里的小狐奴...',
      '尾巴在深处轻轻转动呢，多舒服呀... 一点一点融化在姐姐怀里吧...',
    ],
    hardwarePreset: {
      wave: 'numbing_buzz',
      strength: 15,
      motorRate: 3,
    },
  },
  {
    id: 'hypno_sophia_peace',
    title: '圣殿钟声：索菲亚修女的静心净魂圣诵',
    mentorPersonaId: 'cyber_nun_sophia',
    ambientSound: 'zen_wind',
    durationMinutes: 15,
    description: '空灵的圣殿晚钟与夜风微拂，修女以庄严轻柔的圣音，为你抚平所有焦躁凡念...',
    whisperLines: [
      '静心... 圣殿的微风已拂去凡尘的喧嚣...',
      '世俗的欲望已随钟声消散，你的灵魂归于最初的纯洁...',
      '圣律的微流在体内流淌，指引你走向绝对的平静与服从...',
    ],
    hardwarePreset: {
      wave: 'sensory_tickle',
      strength: 10,
      motorRate: 1,
    },
  },
  {
    id: 'hypno_lilith_succubus_dream',
    title: '深渊沉溺：魅魔导师莉莉丝的甘甜梦境',
    mentorPersonaId: 'succubus_lilith',
    ambientSound: 'sea_binaural',
    durationMinutes: 25,
    description: '432Hz 双耳立体声深海脑波，莉莉丝将你带入无休止的极乐梦境深处...',
    whisperLines: [
      '沉入深海吧特等生... 恶魔的梦境里只有无限的快感哦...',
      '不用思考，不用抗拒，把身心彻底交给我...',
      '梦醒之后，你依然是我最心爱、最听话的专属特等雌奴~',
    ],
    hardwarePreset: {
      wave: 'breathe',
      strength: 16,
      motorRate: 3,
    },
  },
];
