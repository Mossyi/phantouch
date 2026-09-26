import { ToyPatternDef } from '../../types';

export const TOY_PATTERNS: Record<string, ToyPatternDef> = {
  // ================= 1. 基础预热与轻抚 =================
  gentle: {
    id: 'gentle',
    name: '轻柔渐入',
    category: '基础预热',
    description: '低速平稳律动，适合初始预热与慢调放松',
    loop: true,
    sequence: [
      [2, 1, 1, 1.0],
      [3, 2, 1, 1.0],
      [5, 2, 2, 1.0],
      [6, 2, 3, 1.5],
      [4, 2, 2, 1.0],
      [2, 1, 1, 1.0]
    ]
  },
  breathe: {
    id: 'breathe',
    name: '呼吸起伏',
    category: '基础预热',
    description: '如呼吸般周期性强弱深长起伏',
    loop: true,
    sequence: [
      [2, 2, 1, 0.8],
      [5, 2, 2, 0.8],
      [9, 2, 4, 0.8],
      [14, 2, 6, 1.0],
      [18, 2, 8, 1.2],
      [14, 2, 6, 1.0],
      [9, 2, 4, 0.8],
      [4, 2, 2, 0.8],
      [0, 0, 0, 0.6]
    ]
  },
  sensual_foreplay: {
    id: 'sensual_foreplay',
    name: '极乐前戏 (微颤挑逗)',
    category: '基础预热',
    description: '微风拂过般的微弱轻颤与若隐若现的触碰',
    loop: true,
    sequence: [
      [2, 1, 0, 1.5],
      [3, 2, 1, 1.5],
      [1, 2, 2, 1.5],
      [3, 1, 3, 1.5],
      [0, 1, 1, 1.0]
    ]
  },
  wave_caress: {
    id: 'wave_caress',
    name: '三段式浪潮蠕动',
    category: '基础预热',
    description: 'A->B->C 马达顺滑阶梯式顺流蠕动挤压',
    loop: true,
    sequence: [
      [8, 2, 0, 0.6],
      [12, 2, 2, 0.6],
      [4, 2, 6, 0.6],
      [0, 2, 15, 0.6],
      [0, 2, 8, 0.6]
    ]
  },

  // ================= 2. 飞机杯·拟真抽插与活塞专区 =================
  deep_thrust: {
    id: 'deep_thrust',
    name: '深层抽插 (慢进深顶)',
    category: '拟真抽插',
    description: '模拟慢进深顶与强力回抽，主马达深度抽吸',
    loop: true,
    sequence: [
      [4, 2, 2, 1.0],
      [10, 2, 3, 0.8],
      [18, 2, 5, 1.2],
      [20, 2, 6, 0.6],
      [8, 2, 3, 0.6],
      [2, 2, 1, 0.8]
    ]
  },
  piston_burst: {
    id: 'piston_burst',
    name: '极速活塞 (高频冲刺)',
    category: '拟真抽插',
    description: '超高频短行程活塞冲刺，瞬间榨干耐力',
    loop: true,
    sequence: [
      [18, 2, 6, 0.2],
      [20, 2, 8, 0.2],
      [16, 2, 5, 0.2],
      [20, 2, 10, 0.25],
      [14, 2, 4, 0.15],
      [19, 2, 7, 0.2]
    ]
  },
  nine_shallow_one_deep: {
    id: 'nine_shallow_one_deep',
    name: '经典·九浅一深',
    category: '拟真抽插',
    description: '9 次高频浅层微震挑逗 + 1 次瞬间全速拉满深顶',
    loop: true,
    sequence: [
      [5, 2, 2, 0.2], [7, 2, 3, 0.2], [5, 2, 2, 0.2],
      [8, 2, 3, 0.2], [6, 2, 2, 0.2], [7, 2, 3, 0.2],
      [5, 2, 2, 0.2], [8, 2, 4, 0.2], [6, 2, 2, 0.2],
      [20, 2, 14, 1.5], // 极深暴击
      [2, 1, 1, 0.8]
    ]
  },
  cervix_hit: {
    id: 'cervix_hit',
    name: '仿生·宫口撞击',
    category: '拟真抽插',
    description: '长停顿蓄力推进，在最顶端产生重击震颤',
    loop: true,
    sequence: [
      [3, 2, 1, 1.0],
      [8, 2, 2, 0.8],
      [14, 2, 4, 0.6],
      [20, 2, 12, 0.4], // 顶端撞击
      [20, 2, 12, 0.4],
      [4, 2, 1, 1.2]
    ]
  },
  short_stroke: {
    id: 'short_stroke',
    name: '浅入急刺 (敏感区)',
    category: '拟真抽插',
    description: '前段浅层高频快速抽动，专注轰炸冠状沟敏感带',
    loop: true,
    sequence: [
      [14, 2, 4, 0.15],
      [17, 2, 5, 0.15],
      [12, 2, 3, 0.15],
      [19, 2, 6, 0.2],
      [0, 2, 2, 0.1]
    ]
  },
  spiral_drill: {
    id: 'spiral_drill',
    name: '深渊钻头 (螺旋反切)',
    category: '拟真抽插',
    description: '主马达持续高转，旋转马达正反向高频螺旋绞割',
    loop: true,
    sequence: [
      [16, 2, 18, 0.8],
      [18, 2, 20, 1.0],
      [14, 2, 16, 0.6],
      [19, 2, 20, 1.2]
    ]
  },
  irregular_thrust: {
    id: 'irregular_thrust',
    name: '无序突袭 (节奏破坏)',
    category: '拟真抽插',
    description: '完全随机长短行程与突变速率，让人无法预判节拍',
    loop: true,
    sequence: [
      [18, 2, 2, 0.2],
      [4, 2, 8, 1.2],
      [20, 2, 14, 0.3],
      [2, 2, 1, 0.9],
      [15, 2, 4, 0.25],
      [19, 2, 15, 0.6]
    ]
  },

  // ================= 3. 飞机杯·紧致吮吸与喉吸包裹 =================
  suction_grip: {
    id: 'suction_grip',
    name: '紧致吮吸 (全腔夹紧)',
    category: '真空吮吸',
    description: '全腔抽真空高压夹紧，配合间歇性脉冲吮吸',
    loop: true,
    sequence: [
      [6, 2, 18, 1.5],
      [8, 2, 20, 2.0],
      [12, 2, 18, 0.6],
      [16, 2, 20, 0.8],
      [4, 2, 15, 1.0]
    ]
  },
  pulsing_swallow: {
    id: 'pulsing_swallow',
    name: '仿生喉吸 (脉冲吞咽)',
    category: '真空吮吸',
    description: '三段式依次递进收紧，仿生喉式吞吐吞咽节拍',
    loop: true,
    sequence: [
      [12, 2, 2, 0.35],
      [4, 2, 4, 0.35],
      [2, 2, 18, 0.35],
      [16, 2, 20, 0.6],
      [2, 2, 2, 0.4]
    ]
  },
  vacuum_lock: {
    id: 'vacuum_lock',
    name: '真空锁死 (负压强吸)',
    category: '真空吮吸',
    description: '长时间满负荷真空吸附，辅以内部高频微震',
    loop: true,
    sequence: [
      [5, 2, 20, 3.0],
      [8, 2, 20, 2.5],
      [12, 2, 20, 2.0],
      [4, 2, 16, 1.0]
    ]
  },
  throat_deep: {
    id: 'throat_deep',
    name: '极致深喉 (全腔吞没)',
    category: '真空吮吸',
    description: '全腔高压负压紧锁 + 内部旋转马达慢速绞磨压榨',
    loop: true,
    sequence: [
      [10, 2, 16, 1.2],
      [15, 2, 18, 1.5],
      [8, 2, 20, 1.0],
      [18, 2, 18, 1.2]
    ]
  },
  tongue_flutter: {
    id: 'tongue_flutter',
    name: '灵舌打圈 (环形密扫)',
    category: '真空吮吸',
    description: 'B/C 双马达快速轮流打圈，仿若灵巧舌尖高速环扫',
    loop: true,
    sequence: [
      [4, 2, 4, 0.25],
      [4, 2, 18, 0.25],
      [8, 2, 8, 0.25],
      [4, 2, 20, 0.25]
    ]
  },
  slow_churn: {
    id: 'slow_churn',
    name: '慢速绞磨 (旋转碾压)',
    category: '真空吮吸',
    description: '旋转与收紧持续高位，主抽送缓慢旋转碾磨',
    loop: true,
    sequence: [
      [6, 2, 12, 1.2],
      [8, 2, 15, 1.5],
      [10, 2, 16, 1.8],
      [7, 2, 13, 1.2],
      [5, 2, 10, 1.0]
    ]
  },

  // ================= 4. 高潮控制与边缘调教专区 =================
  edging_tease: {
    id: 'edging_tease',
    name: '经典·边缘控射',
    category: '高潮控制',
    description: '从慢热一路飙升至极峰，临近射精瞬间急刹冷却',
    loop: true,
    sequence: [
      [4, 2, 2, 1.5],
      [8, 2, 4, 1.5],
      [13, 2, 7, 1.5],
      [17, 2, 10, 1.5],
      [20, 2, 14, 2.0], // 极峰
      [0, 0, 0, 3.0],    // 瞬间急停断电
      [2, 1, 1, 1.5]
    ]
  },
  denial_torture: {
    id: 'denial_torture',
    name: '残忍·射精剥夺',
    category: '高潮控制',
    description: '连续 5 轮在濒临高潮瞬间急刹，反复剥夺射精许可',
    loop: true,
    sequence: [
      [10, 2, 6, 1.0], [16, 2, 10, 1.0], [20, 2, 18, 1.2],
      [0, 0, 0, 4.0], // 强行断电冷场
      [4, 2, 2, 1.0], [14, 2, 8, 1.0], [20, 2, 20, 1.2],
      [0, 0, 0, 5.0]
    ]
  },
  punishment_surge: {
    id: 'punishment_surge',
    name: '惩戒·狂暴冲刷',
    category: '调教情境',
    description: '猝不及防的满负荷狂暴抽打冲击，威严惩戒',
    loop: true,
    sequence: [
      [20, 2, 18, 0.8],
      [0, 0, 0, 0.2],
      [20, 2, 20, 1.2],
      [0, 0, 0, 0.3],
      [19, 2, 16, 0.8],
      [3, 2, 2, 1.0]
    ]
  },
  rollercoaster: {
    id: 'rollercoaster',
    name: '狂澜·过山车',
    category: '调教情境',
    description: '忽快忽慢、强弱大幅震荡的颠簸快感',
    loop: true,
    sequence: [
      [3, 2, 2, 1.0],
      [19, 2, 14, 0.4],
      [4, 2, 1, 1.2],
      [20, 2, 18, 0.5],
      [2, 2, 2, 1.0],
      [18, 2, 12, 0.6]
    ]
  },
  climax_milking: {
    id: 'climax_milking',
    name: '终极·强行榨干',
    category: '高潮控制',
    description: '全通道无间隙拉满至 20 极速，不留喘息强行榨取',
    loop: true,
    sequence: [
      [20, 2, 20, 1.0],
      [19, 2, 20, 0.8],
      [20, 2, 20, 0.8],
      [20, 2, 20, 1.2]
    ]
  },
  stamina_test_1: {
    id: 'stamina_test_1',
    name: '耐力特训·初阶 (阶梯攀升)',
    category: '调教情境',
    description: '每 10 秒恒定提升 2 档转速，考验基础耐受力',
    loop: false,
    sequence: [
      [4, 2, 2, 5.0],
      [8, 2, 4, 5.0],
      [12, 2, 6, 5.0],
      [16, 2, 8, 5.0],
      [18, 2, 12, 5.0],
      [20, 2, 16, 5.0]
    ]
  },
  pulse: {
    id: 'pulse',
    name: '强力脉冲 (交替急停)',
    category: '基础预热',
    description: '交替急停急进的强震脉冲冲击',
    loop: true,
    sequence: [
      [15, 2, 10, 0.3],
      [0, 0, 0, 0.2],
      [18, 2, 12, 0.3],
      [0, 0, 0, 0.2],
      [20, 2, 15, 0.4],
      [0, 0, 0, 0.3]
    ]
  },
  wave: {
    id: 'wave',
    name: '浪涌波纹 (三马达轮转)',
    category: '基础预热',
    description: 'A/B/C 三马达依次轮流增强驱动，如波浪涌动',
    loop: true,
    sequence: [
      [16, 2, 0, 0.4],
      [19, 2, 2, 0.4],
      [6, 2, 4, 0.4],
      [2, 2, 11, 0.4],
      [0, 2, 19, 0.4],
      [3, 2, 17, 0.4]
    ]
  }
};
