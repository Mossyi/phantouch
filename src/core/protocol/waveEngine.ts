import { EMSWaveDef } from '../../types';

/**
 * EMS 电击波形发生器与 24+ 专业级内置波形库
 */
export class EMSWaveEngine {
  private static waves: Map<string, EMSWaveDef> = new Map();
  private static isInitialized = false;

  private static initBuiltinWaves() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    // ================= 经典基础波形 =================
    this.waves.set('breathe', {
      id: 'breathe',
      name: '呼吸起伏',
      durationMs: 4000,
      data: this.generateBreatheWave()
    });

    this.waves.set('tide', {
      id: 'tide',
      name: '潮汐浪涌',
      durationMs: 8000,
      data: this.generateTideWave()
    });

    this.waves.set('combo', {
      id: 'combo',
      name: '极速连击',
      durationMs: 2000,
      data: this.generateComboWave()
    });

    this.waves.set('fast_pinch', {
      id: 'fast_pinch',
      name: '快速按捏',
      durationMs: 3000,
      data: this.generateFastPinchWave()
    });

    this.waves.set('pinch_crescendo', {
      id: 'pinch_crescendo',
      name: '按捏渐强',
      durationMs: 5000,
      data: this.generatePinchCrescendoWave()
    });

    this.waves.set('heartbeat', {
      id: 'heartbeat',
      name: '心跳节拍',
      durationMs: 3000,
      data: this.generateHeartbeatWave()
    });

    this.waves.set('compress', {
      id: 'compress',
      name: '强压收缩',
      durationMs: 4000,
      data: this.generateCompressWave()
    });

    this.waves.set('rhythm_step', {
      id: 'rhythm_step',
      name: '节奏步伐',
      durationMs: 4000,
      data: this.generateRhythmStepWave()
    });

    // ================= 进阶高阶波形 =================
    this.waves.set('electric_sting', {
      id: 'electric_sting',
      name: '毒蜂蜇刺 (锐利尖峰)',
      durationMs: 2500,
      data: this.generateElectricStingWave()
    });

    this.waves.set('numbing_buzz', {
      id: 'numbing_buzz',
      name: '酥麻微流 (高频密集)',
      durationMs: 3000,
      data: this.generateNumbingBuzzWave()
    });

    this.waves.set('staircase_shock', {
      id: 'staircase_shock',
      name: '九重天阶梯 (九阶攀爬)',
      durationMs: 6000,
      data: this.generateStaircaseShockWave()
    });

    this.waves.set('edging_spark', {
      id: 'edging_spark',
      name: '边缘火花 (临界闪击)',
      durationMs: 4500,
      data: this.generateEdgingSparkWave()
    });

    this.waves.set('cyclone_surge', {
      id: 'cyclone_surge',
      name: '龙卷旋风 (螺旋加速)',
      durationMs: 4000,
      data: this.generateCycloneSurgeWave()
    });

    this.waves.set('intermittent_tease', {
      id: 'intermittent_tease',
      name: '间隙挑逗 (偷袭脉冲)',
      durationMs: 5000,
      data: this.generateIntermittentTeaseWave()
    });

    this.waves.set('deep_muscle_clamp', {
      id: 'deep_muscle_clamp',
      name: '深层肌肉痉挛 (持续紧绷)',
      durationMs: 4000,
      data: this.generateDeepMuscleClampWave()
    });

    this.waves.set('sensory_tickle', {
      id: 'sensory_tickle',
      name: '羽毛轻抚 (微弱轻颤)',
      durationMs: 3500,
      data: this.generateSensoryTickleWave()
    });

    // ================= 极限与高潮波形 =================
    this.waves.set('punish_thunder', {
      id: 'punish_thunder',
      name: '天谴狂雷 (强力轰顶)',
      durationMs: 3000,
      data: this.generatePunishThunderWave()
    });

    this.waves.set('morse_code', {
      id: 'morse_code',
      name: '摩斯密码 (长短电报)',
      durationMs: 4000,
      data: this.generateMorseCodeWave()
    });

    this.waves.set('sawtooth_grind', {
      id: 'sawtooth_grind',
      name: '电锯锯齿 (斜率碾磨)',
      durationMs: 3500,
      data: this.generateSawtoothGrindWave()
    });

    this.waves.set('chaos_random', {
      id: 'chaos_random',
      name: '混沌风暴 (不可预测)',
      durationMs: 4000,
      data: this.generateChaosRandomWave()
    });

    this.waves.set('orgasm_drain', {
      id: 'orgasm_drain',
      name: '高潮榨取 (超频群发)',
      durationMs: 3000,
      data: this.generateOrgasmDrainWave()
    });

    this.waves.set('heartbeat_rush', {
      id: 'heartbeat_rush',
      name: '心动过速 (160BPM急促)',
      durationMs: 2500,
      data: this.generateHeartbeatRushWave()
    });

    this.waves.set('magnetic_flow', {
      id: 'magnetic_flow',
      name: '磁力交织 (推拉交替)',
      durationMs: 5000,
      data: this.generateMagneticFlowWave()
    });

    this.waves.set('silent_creep', {
      id: 'silent_creep',
      name: '无声潜行 (暗中递增)',
      durationMs: 6000,
      data: this.generateSilentCreepWave()
    });
  }

  // --- 经典发生器 ---
  private static generateBreatheWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 40; i++) {
      const strength = i < 20 ? Math.floor(i * 5) : Math.floor((40 - i) * 5);
      for (let j = 0; j < 5; j++) wave.push(strength, 0);
    }
    return wave;
  }

  private static generateTideWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 80; i++) {
      const strength = i < 40 ? Math.floor(i * 2.5) : Math.floor((80 - i) * 2.5);
      for (let j = 0; j < 5; j++) wave.push(strength, 0);
    }
    return wave;
  }

  private static generateComboWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 10; i++) {
      wave.push(30, 0, 30, 0, 10, 0, 30, 0, 30, 0, 0, 0);
    }
    return wave;
  }

  private static generateFastPinchWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 30; i++) wave.push(40, 0, 20, 0);
    return wave;
  }

  private static generatePinchCrescendoWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 50; i++) {
      const strength = Math.floor(i * 2);
      wave.push(strength, 0, Math.floor(strength * 0.5), 0);
    }
    return wave;
  }

  private static generateHeartbeatWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 15; i++) wave.push(50, 0, 0, 0, 30, 0, 0, 0, 0, 0);
    return wave;
  }

  private static generateCompressWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 40; i++) {
      const strength = i < 20 ? Math.floor(50 - i * 2) : Math.floor(10 + (i - 20) * 2);
      for (let j = 0; j < 5; j++) wave.push(strength, 0);
    }
    return wave;
  }

  private static generateRhythmStepWave(): number[] {
    const wave: number[] = [];
    const pattern = [40, 0, 0, 0, 20, 0, 20, 0, 0, 0];
    for (let i = 0; i < 20; i++) wave.push(...pattern);
    return wave;
  }

  // --- 高阶发生器 ---
  private static generateElectricStingWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 12; i++) {
      wave.push(80, 0, 0, 0, 0, 0, 90, 0, 0, 0, 0, 0, 0, 0);
    }
    return wave;
  }

  private static generateNumbingBuzzWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 80; i++) {
      wave.push(25, 0, 18, 0);
    }
    return wave;
  }

  private static generateStaircaseShockWave(): number[] {
    const wave: number[] = [];
    const levels = [10, 20, 30, 45, 60, 75, 90, 100, 120];
    for (const lvl of levels) {
      for (let j = 0; j < 10; j++) wave.push(lvl, 0);
    }
    return wave;
  }

  private static generateEdgingSparkWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 6; i++) {
      // 升温 -> 极峰 -> 急停冷场
      wave.push(20, 0, 35, 0, 55, 0, 80, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
    return wave;
  }

  private static generateCycloneSurgeWave(): number[] {
    const wave: number[] = [];
    for (let freq = 1; freq <= 8; freq++) {
      for (let k = 0; k < 6; k++) {
        wave.push(30 + freq * 8, ...Array(Math.max(1, 9 - freq)).fill(0));
      }
    }
    return wave;
  }

  private static generateIntermittentTeaseWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 8; i++) {
      wave.push(45, 0, 0, 0, 0, 0, 0, 0, 60, 0, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
    return wave;
  }

  private static generateDeepMuscleClampWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 25; j++) wave.push(70, 20); // 持续高电平
      for (let k = 0; k < 15; k++) wave.push(0, 0);
    }
    return wave;
  }

  private static generateSensoryTickleWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 50; i++) {
      const s = Math.floor(Math.sin(i * 0.2) * 10 + 12);
      wave.push(s, 0, 0, 0);
    }
    return wave;
  }

  // --- 极限与高潮发生器 ---
  private static generatePunishThunderWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 6; i++) {
      wave.push(110, 0, 120, 0, 90, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
    return wave;
  }

  private static generateMorseCodeWave(): number[] {
    const wave: number[] = [];
    // ... --- ... (SOS)
    for (let r = 0; r < 4; r++) {
      // 点
      wave.push(40, 0, 40, 0, 40, 0, 0, 0);
      // 划
      wave.push(65, 65, 65, 0, 65, 65, 65, 0, 65, 65, 65, 0, 0, 0);
      // 点
      wave.push(40, 0, 40, 0, 40, 0, 0, 0, 0, 0, 0, 0);
    }
    return wave;
  }

  private static generateSawtoothGrindWave(): number[] {
    const wave: number[] = [];
    for (let r = 0; r < 8; r++) {
      for (let step = 5; step <= 65; step += 10) {
        wave.push(step, 0);
      }
      wave.push(0, 0, 0, 0);
    }
    return wave;
  }

  private static generateChaosRandomWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 100; i++) {
      const s = Math.floor(Math.random() * 80 + 10);
      wave.push(s, 0);
    }
    return wave;
  }

  private static generateOrgasmDrainWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 120; i++) {
      wave.push(95, 0, 75, 0);
    }
    return wave;
  }

  private static generateHeartbeatRushWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 30; i++) {
      wave.push(65, 0, 45, 0, 0, 0);
    }
    return wave;
  }

  private static generateMagneticFlowWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 60; i++) {
      const s = Math.floor(Math.abs(Math.sin(i * 0.15)) * 60 + 15);
      wave.push(s, 0, Math.floor(s * 0.4), 0);
    }
    return wave;
  }

  private static generateSilentCreepWave(): number[] {
    const wave: number[] = [];
    for (let i = 0; i < 80; i++) {
      const s = Math.floor(Math.pow(i / 80, 2) * 90);
      wave.push(s, 0);
    }
    return wave;
  }

  static getWave(id: string): EMSWaveDef | undefined {
    this.initBuiltinWaves();
    const aliases: Record<string, string> = {
      sawtooth_climb: 'sawtooth_grind',
      storm_surge: 'cyclone_surge',
      electric_comb: 'combo',
      pulse_train: 'rhythm_step',
    };
    return this.waves.get(id) || this.waves.get(aliases[id]);
  }

  static getAllWaves(): EMSWaveDef[] {
    this.initBuiltinWaves();
    return Array.from(this.waves.values());
  }

  static formatWaveToHex(channelNum: 1 | 2, waveData: number[]): string {
    const hex = waveData
      .map((v) => (Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : 0)
        .toString(16).padStart(2, '0').toUpperCase())
      .join('');
    return `pulse-${channelNum}:${hex}`;
  }
}
