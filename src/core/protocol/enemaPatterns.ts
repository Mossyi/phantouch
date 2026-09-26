import { EnemaPatternDef } from '../../types';

export const ENEMA_PATTERNS: Record<string, EnemaPatternDef> = {
  // ================= 1. 准备与温和灌注 =================
  pre_fill: {
    id: 'pre_fill',
    name: '预润湿·低速试注',
    category: '准备阶段',
    description: '短时低速注水排空气体，温和润湿直肠前段',
    loop: false,
    sequence: [
      [1, 0, 3.0],
      [0, 0, 2.0],
      [1, 0, 5.0],
      [0, 0, 1.0]
    ]
  },
  slow_fill: {
    id: 'slow_fill',
    name: '缓慢灌注·温和充盈',
    category: '灌注模式',
    description: '平稳持续注水，适合初次使用或慢调扩张',
    loop: false,
    sequence: [
      [1, 0, 8.0],
      [0, 0, 3.0],
      [1, 0, 10.0],
      [0, 0, 3.0],
      [1, 0, 12.0],
      [0, 0, 2.0]
    ]
  },
  deep_infuse: {
    id: 'deep_infuse',
    name: '深层充注·阶梯扩容',
    category: '灌注模式',
    description: '多阶梯递进注水，注水时间逐级延长，深度充盈',
    loop: false,
    sequence: [
      [1, 0, 6.0],
      [0, 0, 4.0],
      [1, 0, 10.0],
      [0, 0, 5.0],
      [1, 0, 15.0],
      [0, 0, 5.0],
      [1, 0, 20.0],
      [0, 0, 2.0]
    ]
  },
  micro_drip: {
    id: 'micro_drip',
    name: '微量漫浸 (极温和水滴)',
    category: '灌注模式',
    description: '每次仅注水 1.5 秒后停顿，极慢速温和浸润',
    loop: true,
    sequence: [
      [1, 0, 1.5],
      [0, 0, 2.5],
      [1, 0, 2.0],
      [0, 0, 3.0]
    ]
  },

  // ================= 2. 冲洗与排空专区 =================
  pulse_rinse: {
    id: 'pulse_rinse',
    name: '脉冲点射·间歇冲刷',
    category: '冲洗模式',
    description: '注水与短暂停顿交替进行，形成脉冲波流冲刷腔壁',
    loop: true,
    sequence: [
      [1, 0, 2.0],
      [0, 0, 1.0],
      [1, 0, 2.5],
      [0, 0, 1.0],
      [1, 0, 3.0],
      [0, 0, 1.5],
      [1, 0, 3.5],
      [0, 0, 1.5]
    ]
  },
  fast_drain: {
    id: 'fast_drain',
    name: '极速排空·全面泄压',
    category: '排空模式',
    description: '蠕动泵反转回抽 + 抽水泵辅助全面开启，快速彻底排空',
    loop: false,
    sequence: [
      [2, 1, 15.0],
      [2, 1, 15.0],
      [0, 0, 1.0]
    ]
  },
  deep_vacuum_drain: {
    id: 'deep_vacuum_drain',
    name: '负压深抽·终极排尽',
    category: '排空模式',
    description: '双泵高负压持续抽吸 40 秒，确保深层毫无残余积水',
    loop: false,
    sequence: [
      [2, 1, 20.0],
      [2, 1, 20.0],
      [0, 0, 1.0]
    ]
  },
  clean_flush: {
    id: 'clean_flush',
    name: '全自动深层清洗 (3轮循环)',
    category: '清洗模式',
    description: '3 轮完整的【自动灌注 -> 浸润翻滚 -> 强力排空】标准清洗循环',
    loop: false,
    sequence: [
      // 轮次 1
      [1, 0, 10.0], [0, 0, 5.0], [2, 1, 10.0], [0, 0, 3.0],
      // 轮次 2
      [1, 0, 14.0], [0, 0, 6.0], [2, 1, 14.0], [0, 0, 3.0],
      // 轮次 3
      [1, 0, 18.0], [0, 0, 8.0], [2, 1, 20.0], [0, 0, 1.0]
    ]
  },

  // ================= 3. 耐力挑战与憋胀调教专区 =================
  wave_cycle: {
    id: 'wave_cycle',
    name: '潮汐循环·注抽往复',
    category: '调教玩法',
    description: '注水充盈 -> 短暂停顿 -> 回抽泄压，潮汐般往复循环',
    loop: true,
    sequence: [
      [1, 0, 8.0],   // 注水 8s
      [0, 0, 4.0],   // 保持 4s
      [2, 0, 6.0],   // 回抽 6s
      [0, 0, 3.0]    // 间歇 3s
    ]
  },
  hold_endurance: {
    id: 'hold_endurance',
    name: '憋胀耐力·初级控水',
    category: '调教玩法',
    description: '注水充盈后强制断水保持憋胀 30 秒，考验耐受极限',
    loop: false,
    sequence: [
      [1, 0, 15.0],  // 大量注水
      [0, 0, 30.0],  // 强制憋胀保持 30 秒
      [1, 0, 10.0],  // 二次加注
      [0, 0, 45.0],  // 极限保持 45 秒
      [2, 1, 15.0]   // 安全自动排空
    ]
  },
  extreme_hold_90s: {
    id: 'extreme_hold_90s',
    name: '极限界限·90秒憋胀死守',
    category: '调教玩法',
    description: '高压注满后长达 90 秒的高压封锁，严禁排空',
    loop: false,
    sequence: [
      [1, 0, 20.0],  // 满额注水
      [0, 0, 90.0],  // 极限界限憋胀 90 秒
      [2, 1, 20.0]   // 彻底排空
    ]
  },
  stair_infusion_hold: {
    id: 'stair_infusion_hold',
    name: '阶梯充水·层层加码',
    category: '调教玩法',
    description: '注10s->憋15s -> 再注10s->憋25s -> 再注10s->憋40s',
    loop: false,
    sequence: [
      [1, 0, 10.0], [0, 0, 15.0],
      [1, 0, 10.0], [0, 0, 25.0],
      [1, 0, 10.0], [0, 0, 40.0],
      [2, 1, 25.0]
    ]
  },
  sudden_surge: {
    id: 'sudden_surge',
    name: '突击强灌 (急骤冲击)',
    category: '调教玩法',
    description: '突击高速大流量注水 18 秒，紧接着紧急制动封堵',
    loop: false,
    sequence: [
      [1, 0, 18.0],
      [0, 0, 30.0],
      [2, 1, 15.0]
    ]
  },
  water_tease_loop: {
    id: 'water_tease_loop',
    name: '戏弄·注抽交织',
    category: '调教玩法',
    description: '刚开始回抽泄压又瞬间强力反灌，打破肠道预期',
    loop: true,
    sequence: [
      [1, 0, 6.0],
      [2, 0, 3.0], // 刚泄压
      [1, 0, 8.0], // 突然反灌
      [0, 0, 4.0]
    ]
  },
  spa_massage: {
    id: 'spa_massage',
    name: '水流微波水疗 SPA',
    category: '准备阶段',
    description: '微小水流平稳进出按摩，舒缓肠道紧张',
    loop: true,
    sequence: [
      [1, 0, 4.0],
      [0, 0, 2.0],
      [2, 0, 3.0],
      [0, 0, 2.0]
    ]
  }
};
