/**
 * DG-LAB Coyote (郊狼) 电击脉冲硬件协议
 * 官方开源规范: https://github.com/dungeonlab-open/dglab-bluetooth-protocol
 * WebSocket 规范: https://github.com/dungeonlab-open/dglab-websocket-simple
 */

import { EMSWaveEngine } from './waveEngine';

// ================= UUID 常量 =================

export const COYOTE_V2_UUIDS = {
  BASE: '955a0000-0fe2-f5aa-a094-84b8d4f3e8ad',
  SERVICE: '955a180b-0fe2-f5aa-a094-84b8d4f3e8ad',
  BATTERY_SERVICE: '955a180a-0fe2-f5aa-a094-84b8d4f3e8ad',
  BATTERY_CHAR: '955a1500-0fe2-f5aa-a094-84b8d4f3e8ad',
  POWER_CHAR: '955a1504-0fe2-f5aa-a094-84b8d4f3e8ad', // PWM_AB2 (Read/Write/Notify, 3 bytes)
  WAVE_B_CHAR: '955a1505-0fe2-f5aa-a094-84b8d4f3e8ad', // PWM_A34 (Read/Write, 3 bytes)
  WAVE_A_CHAR: '955a1506-0fe2-f5aa-a094-84b8d4f3e8ad', // PWM_B34 (Read/Write, 3 bytes)
} as const;

export const COYOTE_V3_UUIDS = {
  BASE: '00000000-0000-1000-8000-00805f9b34fb',
  SERVICE: '0000180c-0000-1000-8000-00805f9b34fb',
  WRITE_CHAR: '0000150a-0000-1000-8000-00805f9b34fb', // Write (up to 20 bytes)
  NOTIFY_CHAR: '0000150b-0000-1000-8000-00805f9b34fb', // Notify (up to 20 bytes)
  BATTERY_SERVICE: '0000180a-0000-1000-8000-00805f9b34fb',
  BATTERY_CHAR: '00001500-0000-1000-8000-00805f9b34fb', // Read/Notify (1 byte)
} as const;

// ================= Coyote V2 协议 (BLE) =================

export class CoyoteV2Protocol {
  static readonly MAX_RAW_STRENGTH = 2047;
  static readonly RAW_PER_APP_LEVEL = 7; // DG-LAB 官方每级强度对应 7 点底层原始值

  /**
   * 将 App 0-200 强度级别折算为 Coyote V2 底层 0-2047 原始数值
   */
  static scaleStrengthToRaw(strength: number): number {
    if (!Number.isFinite(strength) || strength <= 0) return 0;
    const bounded = Math.min(200, Math.max(0, Math.round(strength)));
    return Math.min(this.MAX_RAW_STRENGTH, bounded * this.RAW_PER_APP_LEVEL);
  }

  /**
   * 将 Coyote V2 底层 0-2047 原始数值折算回 App 0-200 级别
   */
  static scaleRawToStrength(raw: number): number {
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    const bounded = Math.min(this.MAX_RAW_STRENGTH, Math.max(0, Math.round(raw)));
    return Math.min(200, Math.round(bounded / this.RAW_PER_APP_LEVEL));
  }

  /**
   * 构建 3 字节 PWM_AB2 强度数据包 (小端序 24-bit 结构)
   * 对应官方 / rezreal / stpihkal 驱动特征值规范
   * Bits 23-22: 保留 (0)
   * Bits 21-11: A 通道实际强度 (11 bits, 0-2047)
   * Bits 10-0:  B 通道实际强度 (11 bits, 0-2047)
   */
  static buildStrengthPacket(strengthA: number, strengthB: number): Uint8Array {
    const rawA = this.scaleStrengthToRaw(strengthA);
    const rawB = this.scaleStrengthToRaw(strengthB);
    const val = ((rawA & 0x7ff) << 11) | (rawB & 0x7ff);
    return new Uint8Array([val & 0xff, (val >> 8) & 0xff, (val >> 16) & 0xff]);
  }

  /**
   * 解析从 PWM_AB2 返回的 3 字节强度状态包 (小端序)
   */
  static parseStrengthPacket(bytes: Uint8Array): {
    rawA: number;
    rawB: number;
    strengthA: number;
    strengthB: number;
  } {
    if (!bytes || bytes.length < 3) {
      return { rawA: 0, rawB: 0, strengthA: 0, strengthB: 0 };
    }
    const val = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
    // 保留位 (bits 22-23) 非零或全 0xFF 为 BLE 错误包，丢弃
    if ((val & 0xC00000) !== 0) {
      return { rawA: 0, rawB: 0, strengthA: 0, strengthB: 0 };
    }
    const rawA = (val >> 11) & 0x7ff;
    const rawB = val & 0x7ff;
    return {
      rawA,
      rawB,
      strengthA: this.scaleRawToStrength(rawA),
      strengthB: this.scaleRawToStrength(rawB),
    };
  }

  /**
   * 构建 3 字节波形参数数据包 (小端序 24-bit 结构)
   * Bits 23-20: 保留 (0)
   * Bits 19-15: Z 脉冲宽度 (5 bits, 0-31, 实际宽度 = Z * 5us)
   * Bits 14-5:  Y 脉冲间隔 (10 bits, 0-1023 ms)
   * Bits 4-0:   X 连续脉冲数 (5 bits, 0-31)
   */
  static buildWavePacket(x: number, y: number, z: number): Uint8Array {
    const clampedX = Math.max(0, Math.min(31, Math.round(Number.isFinite(x) ? x : 1)));
    const clampedY = Math.max(0, Math.min(1023, Math.round(Number.isFinite(y) ? y : 9)));
    const clampedZ = Math.max(0, Math.min(31, Math.round(Number.isFinite(z) ? z : 0)));
    const val = ((clampedZ & 0x1f) << 15) | ((clampedY & 0x3ff) << 5) | (clampedX & 0x1f);
    // 小端序
    return new Uint8Array([val & 0xff, (val >> 8) & 0xff, (val >> 16) & 0xff]);
  }

  /**
   * 根据官方公式计算波形最优 X 与 Y 参数
   * Frequency = X + Y, 取值 (10 ~ 1000)
   * X = ((Frequency / 1000)^0.5) * 15
   * Y = Frequency - X
   */
  static calcXYFromFrequency(frequency: number): { x: number; y: number } {
    const freq = Math.max(10, Math.min(1000, Math.round(Number.isFinite(frequency) ? frequency : 100)));
    const x = Math.round(Math.pow(freq / 1000, 0.5) * 15);
    const y = Math.max(0, freq - x);
    return { x, y };
  }

  /**
   * 构建急停清零包
   */
  static buildStopPacket(): Uint8Array {
    return this.buildStrengthPacket(0, 0);
  }

  /**
   * 预置经典波形序列 [x, y, z]（每个步骤持续约 100ms）
   */
  static getPresetWavePattern(name: string): Array<[number, number, number]> {
    switch (name) {
      case 'breathe': // 呼吸
        return [
          [1, 9, 0],
          [1, 9, 4],
          [1, 9, 8],
          [1, 9, 12],
          [1, 9, 16],
          [1, 9, 20],
          [1, 9, 20],
          [1, 9, 16],
          [1, 9, 10],
          [1, 9, 4],
          [1, 9, 0],
          [1, 9, 0],
        ];
      case 'tide': // 潮汐
        return [
          [1, 9, 0],
          [1, 10, 3],
          [1, 12, 6],
          [1, 13, 10],
          [1, 15, 13],
          [1, 17, 16],
          [1, 18, 20],
          [1, 20, 18],
          [1, 21, 16],
          [1, 23, 15],
          [1, 25, 13],
          [1, 26, 6],
          [1, 9, 0],
        ];
      case 'heartbeat': // 心跳
        return [
          [1, 9, 18],
          [1, 9, 20],
          [1, 9, 0],
          [1, 9, 16],
          [1, 9, 18],
          [1, 9, 0],
          [1, 9, 0],
          [1, 9, 0],
        ];
      case 'electric_sting': // 蜇刺
        return [
          [1, 4, 20],
          [1, 4, 20],
          [1, 9, 0],
          [1, 9, 0],
        ];
      case 'numbing_buzz': // 酥麻高频
        return [
          [1, 4, 10],
          [1, 4, 12],
          [1, 4, 14],
          [1, 4, 12],
        ];
      default:
        return [
          [1, 9, 10],
          [1, 9, 15],
          [1, 9, 10],
          [1, 9, 5],
        ];
    }
  }
}

// ================= Coyote V3 协议 (BLE) =================

export interface CoyoteV3B0Options {
  strengthA?: number; // 0-200
  strengthB?: number; // 0-200
  modeA?: number; // 0=不变, 1=加, 2=减, 3=绝对设置 (0b11)
  modeB?: number; // 0=不变, 1=加, 2=减, 3=绝对设置 (0b11)
  seq?: number; // 0-15 序列号
  waveFreqA?: number[]; // 4 个频率字节 (10-240)
  waveIntensityA?: number[]; // 4 个强度字节 (0-100)
  waveFreqB?: number[]; // 4 个频率字节 (10-240)
  waveIntensityB?: number[]; // 4 个强度字节 (0-100)
}

export class CoyoteV3Protocol {
  static readonly MAX_STRENGTH = 200;

  /**
   * 将 10-1000 频率值转换为 V3 协议传输字节 (10-240)
   */
  static convertFrequencyToV3(inputFreq: number): number {
    if (!Number.isFinite(inputFreq) || inputFreq <= 10) return 10;
    if (inputFreq <= 100) return Math.round(inputFreq);
    if (inputFreq <= 600) return Math.round((inputFreq - 100) / 5 + 100);
    if (inputFreq <= 1000) return Math.round((inputFreq - 600) / 10 + 200);
    return 240;
  }

  /**
   * 构建 20 字节 B0 主控制指令包
   * 结构:
   * Byte 0: 0xB0 (指令 HEAD)
   * Byte 1: (seq & 0x0F) << 4 | ((modeA & 0x03) << 2) | (modeB & 0x03)
   * Byte 2: A 通道设定值 (0-200)
   * Byte 3: B 通道设定值 (0-200)
   * Bytes 4-7: A 通道 4 组波形频率 (各 10-240)
   * Bytes 8-11: A 通道 4 组波形强度 (各 0-100)
   * Bytes 12-15: B 通道 4 组波形频率 (各 10-240)
   * Bytes 16-19: B 通道 4 组波形强度 (各 0-100)
   */
  static buildB0Packet(options: CoyoteV3B0Options): Uint8Array {
    const packet = new Uint8Array(20);
    packet[0] = 0xb0;

    const seq = (Number.isFinite(options.seq) ? options.seq! : 0) & 0x0f;
    const modeA = (Number.isFinite(options.modeA) ? options.modeA! : 3) & 0x03;
    const modeB = (Number.isFinite(options.modeB) ? options.modeB! : 3) & 0x03;
    packet[1] = (seq << 4) | (modeA << 2) | modeB;

    const strA = Math.max(0, Math.min(this.MAX_STRENGTH, Math.round(options.strengthA ?? 0)));
    const strB = Math.max(0, Math.min(this.MAX_STRENGTH, Math.round(options.strengthB ?? 0)));
    packet[2] = strA;
    packet[3] = strB;

    // 波形频率与强度填充
    const freqA = options.waveFreqA || [10, 10, 10, 10];
    const intA = options.waveIntensityA || [0, 0, 0, 0];
    const freqB = options.waveFreqB || [10, 10, 10, 10];
    const intB = options.waveIntensityB || [0, 0, 0, 0];

    for (let i = 0; i < 4; i++) {
      packet[4 + i] = Math.max(10, Math.min(240, Math.round(freqA[i] ?? 10)));
      packet[8 + i] = Math.max(0, Math.min(100, Math.round(intA[i] ?? 0)));
      packet[12 + i] = Math.max(10, Math.min(240, Math.round(freqB[i] ?? 10)));
      packet[16 + i] = Math.max(0, Math.min(100, Math.round(intB[i] ?? 0)));
    }

    return packet;
  }

  /**
   * 构建 7 字节 BF 软上限与频率平衡参数设置包
   * 结构:
   * Byte 0: 0xBF
   * Bytes 1-2: A/B 软上限 (各 0-200)
   * Bytes 3-4: A/B 频率平衡参数 1 (各 0-255)
   * Bytes 5-6: A/B 频率平衡参数 2 (各 0-255)
   */
  static buildBFPacket(
    limitA: number = 200,
    limitB: number = 200,
    freqBalA: number = 128,
    freqBalB: number = 128,
    intBalA: number = 128,
    intBalB: number = 128
  ): Uint8Array {
    return new Uint8Array([
      0xbf,
      Math.max(0, Math.min(200, Math.round(limitA))),
      Math.max(0, Math.min(200, Math.round(limitB))),
      Math.max(0, Math.min(255, Math.round(freqBalA))),
      Math.max(0, Math.min(255, Math.round(freqBalB))),
      Math.max(0, Math.min(255, Math.round(intBalA))),
      Math.max(0, Math.min(255, Math.round(intBalB))),
    ]);
  }

  /**
   * 构建急停清零包
   */
  static buildStopPacket(seq: number = 0): Uint8Array {
    return this.buildB0Packet({
      strengthA: 0,
      strengthB: 0,
      modeA: 3, // 绝对置零
      modeB: 3,
      seq,
      waveIntensityA: [0, 0, 0, 0],
      waveIntensityB: [0, 0, 0, 0],
    });
  }

  /**
   * 解析从 0x150B 返回的通知包
   */
  static parseNotifyPacket(bytes: Uint8Array): {
    type: 'strength' | 'battery' | 'unknown';
    seq?: number;
    strengthA?: number;
    strengthB?: number;
    battery?: number;
  } {
    if (!bytes || bytes.length === 0) return { type: 'unknown' };

    // B1 消息: 0xB1 + seq + strengthA + strengthB
    if (bytes[0] === 0xb1 && bytes.length >= 4) {
      return {
        type: 'strength',
        seq: bytes[1],
        strengthA: Math.min(200, Math.max(0, bytes[2])),
        strengthB: Math.min(200, Math.max(0, bytes[3])),
      };
    }

    // 单字节电量上报 (0x1500)
    if (bytes.length === 1 && bytes[0] <= 100) {
      return {
        type: 'battery',
        battery: bytes[0],
      };
    }

    return { type: 'unknown' };
  }
}

// ================= Coyote 波形与通用波形转换器 =================

/**
 * 取波形数据在 [from, to)（周期内的比例位置）区间里的峰值。
 * 硬件每 100ms（V3 为 25ms）只能接收一个幅度值，若只取区间起点的单个采样，
 * 比采样间隔更窄的尖峰会被整个跳过 —— 例如「旋风涌动」在 V2 上 40 帧里有 38 帧是 0，几乎感觉不到。
 */
function peakInWindow(data: number[], from: number, to: number): number {
  const start = Math.min(data.length - 1, Math.max(0, Math.floor(from * data.length)));
  const end = Math.min(data.length, Math.max(start + 1, Math.ceil(to * data.length)));
  let peak = 0;
  for (let i = start; i < end; i++) {
    const value = data[i];
    if (Number.isFinite(value) && value > peak) peak = value;
  }
  return peak;
}

export class CoyoteWaveformConverter {
  /**
   * 获取指定波形在 step 序号处的 V2 参数 [x, y, z]
   * stepIndex: 每 100ms 递增一次的序号 (10Hz)
   */
  static getV2Step(waveId: string, stepIndex: number): [number, number, number] {
    const wave = EMSWaveEngine.getWave(waveId);
    if (!wave || !wave.data || wave.data.length === 0) {
      const presets = CoyoteV2Protocol.getPresetWavePattern(waveId);
      return presets[stepIndex % presets.length];
    }

    const data = wave.data;
    const totalSteps = Math.max(1, Math.round((wave.durationMs || 3000) / 100));
    const stepInCycle = stepIndex % totalSteps;
    const amp = Math.max(0, Math.min(100, peakInWindow(data, stepInCycle / totalSteps, (stepInCycle + 1) / totalSteps)));

    // z 轴为振幅乘数 (0-31)
    const z = Math.max(0, Math.min(31, Math.round((amp / 100) * 31)));

    // 根据波形特征调整 x (脉冲数 1-8) 与 y (延迟间隔 4-20ms)
    let x = 1;
    let y = 9; // ~100Hz 经典手感
    const id = waveId.toLowerCase();
    if (id.includes('sting') || id.includes('buzz') || id.includes('thunder') || id.includes('spark')) {
      x = 3;
      y = 5; // 锐利高频
    } else if (id.includes('heartbeat') || id.includes('pinch') || id.includes('step') || id.includes('morse')) {
      x = 2;
      y = 16; // 间歇节奏
    } else if (id.includes('drain') || id.includes('chaos') || id.includes('cyclone')) {
      x = 4;
      y = 6; // 极限密集
    }

    return [x, y, z];
  }

  /**
   * 获取指定波形在 step 序号处的 V3 参数 (4 个 25ms 切片)
   * 返回 { freq: number[4], intensity: number[4] }
   */
  static getV3Slice(waveId: string, stepIndex: number): { freq: number[]; intensity: number[] } {
    const wave = EMSWaveEngine.getWave(waveId);
    let baseFreq = 10;
    const id = waveId.toLowerCase();
    if (id.includes('sting') || id.includes('buzz') || id.includes('thunder') || id.includes('spark')) {
      baseFreq = 65; // 锐利
    } else if (id.includes('heartbeat') || id.includes('rush')) {
      baseFreq = 25;
    } else if (id.includes('drain') || id.includes('chaos') || id.includes('cyclone')) {
      baseFreq = 90; // 高频狂暴
    } else if (id.includes('pinch') || id.includes('step') || id.includes('morse')) {
      baseFreq = 15; // 节拍
    }

    const v3Freq = CoyoteV3Protocol.convertFrequencyToV3(baseFreq);

    if (!wave || !wave.data || wave.data.length === 0) {
      return {
        freq: [v3Freq, v3Freq, v3Freq, v3Freq],
        intensity: [60, 80, 100, 70],
      };
    }

    const data = wave.data;
    const totalSteps = Math.max(1, Math.round((wave.durationMs || 3000) / 100));
    const stepInCycle = stepIndex % totalSteps;
    const intensities: number[] = [];

    for (let sub = 0; sub < 4; sub++) {
      const from = (stepInCycle + sub / 4) / totalSteps;
      const to = (stepInCycle + (sub + 1) / 4) / totalSteps;
      const amp = Math.max(0, Math.min(100, Math.round(peakInWindow(data, from, to))));
      intensities.push(amp);
    }

    return {
      freq: [v3Freq, v3Freq, v3Freq, v3Freq],
      intensity: intensities,
    };
  }

  /**
   * 将任意波形转换为 DG-LAB 官方标准的 16 字符 HEX 帧列表
   */
  static convertToDGLabPulses(waveId: string, durationSec: number = 5): string[] {
    const boundedSec = Math.max(1, Math.min(30, Math.round(durationSec)));
    const total100msSteps = boundedSec * 10;
    const frames: string[] = [];

    for (let i = 0; i < total100msSteps; i++) {
      frames.push(this.getDGLabFrame(waveId, i));
    }

    return frames;
  }

  /**
   * 单个 100ms 的 DG-LAB HEX 波形帧（4 字节频率 + 4 字节强度）
   */
  static getDGLabFrame(waveId: string, stepIndex: number): string {
    const slice = this.getV3Slice(waveId, stepIndex);
    const hexFreq = slice.freq
      .map((f) => Math.min(240, Math.max(10, f)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const hexInt = slice.intensity
      .map((v) => Math.min(100, Math.max(0, v)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    return `${hexFreq}${hexInt}`;
  }
}

// ================= DG-LAB WebSocket 中继协议 =================

export class DGLabSocketProtocol {
  /**
   * 构建官方标准终端绑定二维码内容
   * 格式: https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#${wsUrl}/${clientId}
   */
  static buildBindQrUrl(wsUrl: string, clientId: string): string {
    const cleanUrl = wsUrl.trim().replace(/\/+$/, '');
    const cleanId = clientId.trim();
    return `https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#${cleanUrl}/${cleanId}`;
  }

  /**
   * 构建「设置指定通道强度」消息（官方前端协议 type: 3）。
   * 注意：第三方终端发给服务端的消息必须用 type 1/2/3/4/clientMsg，
   * 由服务端转换成 APP 格式（strength-通道+模式+数值）再转发；
   * 若直接发 type:'msg'，官方服务端会把它原样退回给发送方，APP 永远收不到。
   * @param channel 1 = A 通道, 2 = B 通道
   * @param strength 0 - 200
   */
  static buildSetStrengthMessage(
    clientId: string,
    targetId: string,
    channel: 1 | 2,
    strength: number
  ): string {
    const bounded = Math.max(0, Math.min(200, Math.round(strength)));
    return JSON.stringify({
      type: 3,
      clientId,
      targetId,
      channel,
      strength: bounded,
      message: 'set channel',
    });
  }

  /**
   * 构建相对调整强度的消息。官方协议的增减（type 2 / type 1）每次固定 ±1，
   * 因此这里按 value 生成对应条数的消息；mode 2 等同于设置为指定值。
   * @param mode 0 = 减少, 1 = 增加, 2 = 绝对设为指定值
   */
  static buildAdjustStrengthMessage(
    clientId: string,
    targetId: string,
    channel: 1 | 2,
    mode: 0 | 1 | 2,
    value: number
  ): string[] {
    const bounded = Math.max(0, Math.min(200, Math.round(value)));
    if (mode === 2) return [this.buildSetStrengthMessage(clientId, targetId, channel, bounded)];
    const step = JSON.stringify({
      type: mode === 1 ? 2 : 1,
      clientId,
      targetId,
      channel,
      message: 'set channel',
    });
    return Array.from({ length: bounded }, () => step);
  }

  /**
   * 构建清空通道波形队列消息（官方前端协议 type: 4）。
   * 服务端按 channel 字段决定清哪一路（缺省为 A），所以 channel 必须显式携带。
   */
  static buildClearWaveMessage(clientId: string, targetId: string, channel: 1 | 2): string {
    return JSON.stringify({
      type: 4,
      clientId,
      targetId,
      channel,
      message: `clear-${channel}`,
    });
  }

  /**
   * 构建波形下发消息 (HEX 数组格式)。
   * 服务端会在 timeSec 秒内每秒把同一组波形重复推给 APP 一次，所以 pulses 应只含约 1 秒的数据；
   * APP 单条消息最多 100 帧，且整条 JSON 超过 1950 字符会被丢弃。
   */
  static buildPulseMessage(
    clientId: string,
    targetId: string,
    channel: 'A' | 'B',
    pulses: string[],
    timeSec: number = 5
  ): string {
    return JSON.stringify({
      type: 'clientMsg',
      channel,
      time: Math.max(1, Math.min(60, Math.round(timeSec))),
      message: `${channel}:${JSON.stringify(pulses)}`,
      clientId,
      targetId,
    });
  }

  /**
   * 构建心跳包
   */
  static buildHeartbeatMessage(clientId: string, targetId: string): string {
    return JSON.stringify({
      type: 'heartbeat',
      clientId,
      targetId,
      message: '200',
    });
  }

  /**
   * 解析 WebSocket 服务端/APP 推送的消息
   */
  static parseMessage(rawText: string): {
    type: 'bind' | 'strength' | 'feedback' | 'heartbeat' | 'break' | 'error' | 'unknown';
    clientId?: string;
    targetId?: string;
    strengthA?: number;
    strengthB?: number;
    limitA?: number;
    limitB?: number;
    feedbackIndex?: number;
    message?: string;
  } {
    try {
      const data = JSON.parse(rawText);
      const type = data.type;
      const msg = String(data.message || '');

      if (type === 'bind') {
        return {
          type: 'bind',
          clientId: data.clientId,
          targetId: data.targetId,
          message: msg,
        };
      }

      if (type === 'heartbeat') {
        return {
          type: 'heartbeat',
          clientId: data.clientId,
          targetId: data.targetId,
          message: msg,
        };
      }

      if (type === 'break') {
        return {
          type: 'break',
          clientId: data.clientId,
          targetId: data.targetId,
          message: msg,
        };
      }

      if (type === 'error') {
        return {
          type: 'error',
          clientId: data.clientId,
          targetId: data.targetId,
          message: msg,
        };
      }

      // 强度回传格式: strength-A强度+B强度+A上限+B上限
      if (type === 'msg' && msg.startsWith('strength-')) {
        const parts = msg.replace(/^strength-/, '').split('+').map(Number);
        if (parts.length >= 4) {
          return {
            type: 'strength',
            clientId: data.clientId,
            targetId: data.targetId,
            strengthA: Math.min(200, Math.max(0, parts[0])),
            strengthB: Math.min(200, Math.max(0, parts[1])),
            limitA: Math.min(200, Math.max(0, parts[2])),
            limitB: Math.min(200, Math.max(0, parts[3])),
            message: msg,
          };
        }
      }

      // APP 反馈按钮: feedback-0 ~ feedback-9
      if (type === 'msg' && msg.startsWith('feedback-')) {
        const idx = parseInt(msg.replace(/^feedback-/, ''), 10);
        return {
          type: 'feedback',
          clientId: data.clientId,
          targetId: data.targetId,
          feedbackIndex: Number.isFinite(idx) ? idx : undefined,
          message: msg,
        };
      }

      return { type: 'unknown', message: msg };
    } catch {
      return { type: 'unknown' };
    }
  }
}
