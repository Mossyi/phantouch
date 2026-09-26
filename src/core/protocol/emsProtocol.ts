/**
 * 役次元 EMS 二代 BLE 协议（FF30/FF31/FF32）。
 * 固定模式数据包同时携带 A/B 通道强度与 1-16 模式编号。
 */
export class YCYEMSProtocol {
  static readonly BLE_SERVICE_UUID = '0000ff30-0000-1000-8000-00805f9b34fb';
  static readonly BLE_WRITE_UUID = '0000ff31-0000-1000-8000-00805f9b34fb';
  static readonly BLE_NOTIFY_UUID = '0000ff32-0000-1000-8000-00805f9b34fb';
  static readonly MAX_STRENGTH = 276;

  static checksum(data: Uint8Array): number {
    return Array.from(data).reduce((sum, value) => sum + value, 0) & 0xff;
  }

  static buildFixedModePacket(strengthA: number, strengthB: number, modeA: number = 1, modeB: number = 1): Uint8Array {
    const a = Number.isFinite(strengthA) ? Math.min(this.MAX_STRENGTH, Math.max(0, Math.round(strengthA))) : 0;
    const b = Number.isFinite(strengthB) ? Math.min(this.MAX_STRENGTH, Math.max(0, Math.round(strengthB))) : 0;
    const normalizedModeA = Number.isFinite(modeA) ? Math.min(16, Math.max(1, Math.round(modeA))) : 1;
    const normalizedModeB = Number.isFinite(modeB) ? Math.min(16, Math.max(1, Math.round(modeB))) : 1;
    const raw = new Uint8Array([
      0x35,
      0x11,
      0x01,
      (a >> 8) & 0xff,
      a & 0xff,
      normalizedModeA,
      (b >> 8) & 0xff,
      b & 0xff,
      normalizedModeB,
    ]);
    const packet = new Uint8Array(10);
    packet.set(raw);
    packet[9] = this.checksum(raw);
    return packet;
  }

  static buildV1ChannelPacket(channel: 1 | 2 | 3, strength: number, mode: number = 1): Uint8Array {
    const value = Number.isFinite(strength) ? Math.min(this.MAX_STRENGTH, Math.max(0, Math.round(strength))) : 0;
    const normalizedMode = Number.isFinite(mode) ? Math.min(16, Math.max(1, Math.round(mode))) : 1;
    const raw = new Uint8Array([
      0x35,
      0x11,
      channel,
      value > 0 ? 0x01 : 0x00,
      (value >> 8) & 0xff,
      value & 0xff,
      normalizedMode,
      0x00,
      0x00,
    ]);
    const packet = new Uint8Array(10);
    packet.set(raw);
    packet[9] = this.checksum(raw);
    return packet;
  }

  static buildStopPacket(): Uint8Array {
    return this.buildFixedModePacket(0, 0, 1, 1);
  }

  static buildV1StopPacket(): Uint8Array {
    return this.buildV1ChannelPacket(3, 0, 1);
  }

  static parseNotifyPacket(bytes: Uint8Array): {
    type: 'channelA' | 'channelB' | 'battery' | 'unknown';
    data?: { strength?: number; mode?: number; battery?: number; isActive?: boolean };
  } {
    if (bytes.length < 4 || bytes[0] !== 0x35 || bytes[1] !== 0x71) return { type: 'unknown' };
    if (this.checksum(bytes.slice(0, -1)) !== bytes[bytes.length - 1]) return { type: 'unknown' };
    if ((bytes[2] === 0x01 || bytes[2] === 0x02) && bytes.length >= 9) {
      return {
        type: bytes[2] === 0x01 ? 'channelA' : 'channelB',
        data: {
          isActive: bytes[4] === 0x01,
          strength: (bytes[5] << 8) | bytes[6],
          mode: bytes[7],
        },
      };
    }
    if (bytes[2] === 0x04 && bytes.length >= 5) {
      return bytes[3] <= 100
        ? { type: 'battery', data: { battery: bytes[3] } }
        : { type: 'unknown' };
    }
    return { type: 'unknown' };
  }
}
