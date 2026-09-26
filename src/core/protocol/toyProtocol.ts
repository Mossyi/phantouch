/**
 * 役次元玩具（飞机杯 / 跳蛋）BLE 通讯协议封包与校验
 */
export class YCYToyProtocol {
  static readonly BLE_SERVICE_UUID = '0000ff40-0000-1000-8000-00805f9b34fb';
  static readonly BLE_WRITE_UUID   = '0000ff41-0000-1000-8000-00805f9b34fb';
  static readonly BLE_NOTIFY_UUID  = '0000ff42-0000-1000-8000-00805f9b34fb';

  static readonly MAX_RATE = 20;
  static readonly MIN_RATE = 0;

  /**
   * 计算校验和 (所有字节求和后低 8 位)
   */
  static checksum(data: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return sum & 0xff;
  }

  /**
   * 构造查询玩具设备信息数据包: [0x35, 0x10, checksum]
   */
  static buildQueryPacket(): Uint8Array {
    const raw = new Uint8Array([0x35, 0x10]);
    const packet = new Uint8Array(3);
    packet[0] = raw[0];
    packet[1] = raw[1];
    packet[2] = this.checksum(raw);
    return packet;
  }

  /**
   * 构造设置三马达速率数据包: [0x35, 0x12, motorA, motorB, motorC, checksum]
   * 各通道速率范围: 0 - 20
   */
  static buildRatePacket(motorA: number = 0, motorB: number = 0, motorC: number = 0): Uint8Array {
    const normalizeRate = (rate: number) => Number.isFinite(rate)
      ? Math.max(this.MIN_RATE, Math.min(this.MAX_RATE, Math.round(rate)))
      : 0;
    const a = normalizeRate(motorA);
    const b = normalizeRate(motorB);
    const c = normalizeRate(motorC);

    const raw = new Uint8Array([0x35, 0x12, a, b, c]);
    const packet = new Uint8Array(6);
    packet.set(raw);
    packet[5] = this.checksum(raw);
    return packet;
  }

  /**
   * 字节数组转十六进制字符串
   */
  static toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join('');
  }
}
