/**
 * DG-LAB 配件蓝牙协议：灵猫控射传感器 (Civet) 与负鼠震动控制器 (Opossum)
 * 官方开源规范: https://github.com/DG-LAB-OPENSOURCE/DG-LAB-OPENSOURCE
 *
 * 郊狼 3.0、灵猫、负鼠共用同一组 GATT（服务 0x180C，写 0x150A，通知 0x150B），
 * 只能靠蓝牙名区分。把灵猫或负鼠误判成郊狼会向它们写入电击 B0 包，因此识别必须先于一切写入。
 */

export const DGLAB_DEVICE_NAMES = {
  COYOTE_V3: '47L121000',
  WIRELESS_SENSOR: '47L120100',
  CIVET: '47L124000',
  OPOSSUM: '47L127000',
} as const;

export type DGLabV3FamilyModel = 'coyote_v3' | 'civet' | 'opossum' | 'unknown';

/** 按蓝牙名识别共用 0x180C 服务的 DG-LAB 设备；名称缺失或不认识时返回 unknown。 */
export const identifyDGLabV3Family = (name: string | null | undefined): DGLabV3FamilyModel => {
  const normalized = (name || '').trim().toUpperCase();
  if (!normalized) return 'unknown';
  if (normalized.startsWith(DGLAB_DEVICE_NAMES.CIVET)) return 'civet';
  if (normalized.startsWith(DGLAB_DEVICE_NAMES.OPOSSUM)) return 'opossum';
  if (normalized.startsWith(DGLAB_DEVICE_NAMES.COYOTE_V3)) return 'coyote_v3';
  const lower = normalized.toLowerCase();
  if (lower.includes('civet') || normalized.includes('灵猫')) return 'civet';
  if (lower.includes('opossum') || normalized.includes('负鼠')) return 'opossum';
  if (lower.includes('coyote 3') || lower.includes('coyote3')) return 'coyote_v3';
  return 'unknown';
};

const clampByte = (value: number, min: number, max: number): number => (
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : min
);

// ================= 灵猫控射传感器 =================

export class CivetProtocol {
  /** 指示灯颜色：官方示例中 01 = 黄色 */
  static readonly DEFAULT_COLOR = 0x01;

  /**
   * 50 指令：开始 / 停止压力上报（17 字节）
   * 0x50 + 颜色 + D0(开始)/00(停止) + 14 字节 00
   */
  static buildReportingPacket(enabled: boolean, color: number = this.DEFAULT_COLOR): Uint8Array {
    const packet = new Uint8Array(17);
    packet[0] = 0x50;
    packet[1] = clampByte(color, 0, 0xff);
    packet[2] = enabled ? 0xd0 : 0x00;
    return packet;
  }

  /** 66 指令：压力读数归零（13 字节：0x66 + 9×00 + 方向 00 + 0002） */
  static buildZeroPressurePacket(): Uint8Array {
    const packet = new Uint8Array(13);
    packet[0] = 0x66;
    packet[11] = 0x00;
    packet[12] = 0x02;
    return packet;
  }

  /** 66 指令：设置屏幕方向（01 / 03 交替），不归零压力 */
  static buildDisplayOrientationPacket(orientation: 1 | 3): Uint8Array {
    const packet = new Uint8Array(13);
    packet[0] = 0x66;
    packet[10] = orientation;
    return packet;
  }

  /**
   * 解析 D0 压力上报（每 100ms 一次，17 字节）：第 8、9 字节为小端 int16，单位 0.01 kPa
   */
  static parseNotifyPacket(bytes: Uint8Array): { type: 'pressure'; pressureKpa: number } | { type: 'unknown' } {
    if (!bytes || bytes.length < 10 || bytes[0] !== 0xd0) return { type: 'unknown' };
    const raw = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt16(8, true);
    return { type: 'pressure', pressureKpa: raw / 100 };
  }
}

// ================= 负鼠震动控制器 =================

export class OpossumProtocol {
  /** 通道强度上限（B3 指令） */
  static readonly MAX_INTENSITY = 200;
  /** 震动脉冲每 25ms 一个强度值，0-100；越界会让整个通道的数据被丢弃 */
  static readonly MAX_PULSE = 100;
  static readonly UNCHANGED = 0xff;

  /** 50 指令：主指示灯颜色 + 按键上报开关（3 字节） */
  static buildButtonReportingPacket(enabled: boolean, color: number = 0x01): Uint8Array {
    return new Uint8Array([0x50, clampByte(color, 0, 0xff), enabled ? 0x01 : 0x00]);
  }

  /**
   * B3 指令：设置 A/B 通道强度（0-200），传 null 表示该通道保持不变（0xFF）
   */
  static buildIntensityPacket(intensityA: number | null, intensityB: number | null): Uint8Array {
    const encode = (value: number | null) => (value === null ? this.UNCHANGED : clampByte(value, 0, this.MAX_INTENSITY));
    return new Uint8Array([0xb3, encode(intensityA), encode(intensityB)]);
  }

  /**
   * B0 指令：A/B 通道 100ms 震动脉冲数据（20 字节，需每 100ms 发送一次）
   * 0xB0 + 7×00 + A 通道 4 字节 + 4×00 + B 通道 4 字节
   */
  static buildPulsePacket(pulseA: number[], pulseB: number[]): Uint8Array {
    const packet = new Uint8Array(20);
    packet[0] = 0xb0;
    for (let i = 0; i < 4; i++) {
      packet[8 + i] = clampByte(pulseA[i] ?? 0, 0, this.MAX_PULSE);
      packet[16 + i] = clampByte(pulseB[i] ?? 0, 0, this.MAX_PULSE);
    }
    return packet;
  }

  /**
   * B2 指令：同步屏幕上显示的通道强度（连接主机时屏幕不会自行刷新）
   * 0xB2 + 21 字节固定内容 + A 强度 + B 强度（共 24 字节，Android 建议 MTU 144）
   */
  static buildDisplayPacket(intensityA: number, intensityB: number): Uint8Array {
    const fixed = [
      0xff, 0xff, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x08, 0x09,
    ];
    return new Uint8Array([
      0xb2,
      ...fixed,
      clampByte(intensityA, 0, this.MAX_INTENSITY),
      clampByte(intensityB, 0, this.MAX_INTENSITY),
    ]);
  }

  static buildStopPacket(): Uint8Array {
    return this.buildIntensityPacket(0, 0);
  }

  /** 解析 B3 强度上报 / D0 按键上报 */
  static parseNotifyPacket(bytes: Uint8Array):
    | { type: 'intensity'; intensityA: number; intensityB: number }
    | { type: 'buttons'; seq: number; mask: number }
    | { type: 'unknown' } {
    if (!bytes || bytes.length === 0) return { type: 'unknown' };
    if (bytes[0] === 0xb3 && bytes.length >= 3) {
      return {
        type: 'intensity',
        intensityA: Math.min(this.MAX_INTENSITY, bytes[1]),
        intensityB: Math.min(this.MAX_INTENSITY, bytes[2]),
      };
    }
    if (bytes[0] === 0xd0 && bytes.length >= 4) {
      return { type: 'buttons', seq: bytes[1], mask: (bytes[2] << 8) | bytes[3] };
    }
    return { type: 'unknown' };
  }

  /** 玩具马达速率（0-20）与负鼠通道强度（0-200）的换算 */
  static rateToIntensity(rate: number): number {
    return clampByte(rate * 10, 0, this.MAX_INTENSITY);
  }

  static intensityToRate(intensity: number): number {
    return clampByte(intensity / 10, 0, 20);
  }
}
