/**
 * OpenAI 兼容的 Function Calling Tools 列表定义
 */
export const LLM_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'set_ems_strength',
      description: '调节电击器 (EMS) 的通道强度。可单独调节 A 通道、B 通道或同时调节 AB 通道。',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            enum: ['A', 'B', 'AB'],
            description: '电击通道：A (通道A), B (通道B), AB (双通道同时)'
          },
          strength: {
            type: 'integer',
            minimum: 0,
            maximum: 200,
            description: '电击强度数值，范围 0 - 200。0 表示关闭。请根据对话情绪渐进调节，不要瞬间拉满。'
          }
        },
        required: ['channel', 'strength']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_ems_wave',
      description: '向电击器 (EMS) 发送特定节奏的脉冲电击波形。拥有 24+ 种专业波形。',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            enum: ['A', 'B', 'AB'],
            description: '目标通道'
          },
          wave_name: {
            type: 'string',
            enum: [
              'breathe', 'tide', 'combo', 'fast_pinch', 'pinch_crescendo', 'heartbeat', 'compress', 'rhythm_step',
              'electric_sting', 'numbing_buzz', 'staircase_shock', 'edging_spark', 'cyclone_surge', 'intermittent_tease', 'deep_muscle_clamp', 'sensory_tickle',
              'punish_thunder', 'morse_code', 'sawtooth_grind', 'chaos_random', 'orgasm_drain', 'heartbeat_rush', 'magnetic_flow', 'silent_creep'
            ],
            description: '内置波形ID：electric_sting(毒蜂蜇刺), numbing_buzz(酥麻微流), staircase_shock(九重天阶梯), edging_spark(边缘火花), cyclone_surge(龙卷旋风), punish_thunder(天谴狂雷), orgasm_drain(高潮榨取), breathe(呼吸), tide(潮汐), combo(连击)等'
          }
        },
        required: ['channel', 'wave_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_toy_motor',
      description: '调节飞机杯/跳蛋的 3 个独立马达速率。',
      parameters: {
        type: 'object',
        properties: {
          motor_a: {
            type: 'integer',
            minimum: 0,
            maximum: 20,
            description: '马达 A 速率（飞机杯：主抽插/主震动），范围 0 - 20。'
          },
          motor_b: {
            type: 'integer',
            minimum: 0,
            maximum: 20,
            description: '马达 B 速率（飞机杯：吮吸/夹紧马达），范围 0 - 20。'
          },
          motor_c: {
            type: 'integer',
            minimum: 0,
            maximum: 20,
            description: '马达 C 速率（飞机杯：旋转/绞磨马达），范围 0 - 20。'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toy_pattern',
      description: '触发飞机杯/跳蛋预设的拟真律动模式，拥有 30+ 款拟真抽插、深度吸吮、边缘控射与调教模式。',
      parameters: {
        type: 'object',
        properties: {
          pattern_name: {
            type: 'string',
            enum: [
              'gentle', 'breathe', 'sensual_foreplay', 'wave_caress', 'pulse', 'wave',
              'deep_thrust', 'piston_burst', 'nine_shallow_one_deep', 'cervix_hit', 'short_stroke', 'spiral_drill', 'irregular_thrust',
              'suction_grip', 'pulsing_swallow', 'vacuum_lock', 'throat_deep', 'tongue_flutter', 'slow_churn',
              'edging_tease', 'denial_torture', 'punishment_surge', 'rollercoaster', 'climax_milking', 'stamina_test_1'
            ],
            description: '预设模式ID：deep_thrust(深层抽插), piston_burst(极速活塞), nine_shallow_one_deep(九浅一深), cervix_hit(宫口撞击), throat_deep(深喉吞没), suction_grip(紧致吮吸), denial_torture(射精剥夺), edging_tease(边缘控射), climax_milking(强行榨干)等'
          },
          duration_sec: {
            type: 'integer',
            minimum: 1,
            maximum: 3600,
            description: '持续时间（秒），默认 30 秒。'
          }
        },
        required: ['pattern_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toy_turbo',
      description: '【一键超频暴走】瞬间将所有马达拉满至 20 极速冲刺，随后平稳回落。常用于高潮冲刺或严厉惩罚。',
      parameters: {
        type: 'object',
        properties: {
          duration_sec: {
            type: 'integer',
            minimum: 1,
            maximum: 60,
            description: '暴走持续秒数，默认 5 秒。'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toy_edge',
      description: '【边缘控射】开启耐力控射调教：升温爬升 -> 极峰 -> 瞬间急停断电断刺激冷场 -> 循环。',
      parameters: {
        type: 'object',
        properties: {
          rounds: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            description: '控射轮数，默认 3 轮。'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enema_fill',
      description: '控制智能灌肠机蠕动泵正转注水。',
      parameters: {
        type: 'object',
        properties: {
          duration_sec: {
            type: 'integer',
            minimum: 1,
            maximum: 60,
            description: '注水持续秒数，范围 1 - 60 秒。'
          }
        },
        required: ['duration_sec']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enema_drain',
      description: '控制智能灌肠机反转回抽并启动抽水泵排空泄压。',
      parameters: {
        type: 'object',
        properties: {
          duration_sec: {
            type: 'integer',
            minimum: 1,
            maximum: 60,
            description: '排空持续秒数，范围 1 - 60 秒。'
          }
        },
        required: ['duration_sec']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enema_pattern',
      description: '播放智能灌肠机预设的注水/冲洗/憋胀耐力调教流程。拥有 15 款专业流程。',
      parameters: {
        type: 'object',
        properties: {
          pattern_name: {
            type: 'string',
            enum: [
              'pre_fill', 'slow_fill', 'deep_infuse', 'micro_drip',
              'pulse_rinse', 'fast_drain', 'deep_vacuum_drain', 'clean_flush',
              'wave_cycle', 'hold_endurance', 'extreme_hold_90s', 'stair_infusion_hold', 'sudden_surge', 'water_tease_loop', 'spa_massage'
            ],
            description: '流程名称：hold_endurance(初级憋胀30s), extreme_hold_90s(极限憋胀90s), stair_infusion_hold(阶梯充水), wave_cycle(潮汐循环), sudden_surge(突击强灌), clean_flush(全自动清洗)等'
          }
        },
        required: ['pattern_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'emergency_stop',
      description: '【AI 会话安全停止】立即清零所有电击、马达和灌肠泵输出，但不会激活全局急停锁。仅在用户明确要求停止全部输出或出现明确安全风险时调用；不要把剧情中的停顿、临界急刹或普通求饶误判为全局急停。调用后本轮不得再下发硬件动作。',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: '急停原因说明'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_device_status',
      description: '查询当前设备连接状态、各通道实时强度、马达速率、灌肠机压力传感器数据及电量。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];
