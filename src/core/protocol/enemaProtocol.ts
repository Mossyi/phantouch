import CryptoJS from 'crypto-js';

/**
 * 役次元智能灌肠机 BLE 通讯协议封包与 AES-128-ECB 编解码
 */
export class YCYEnemaProtocol {
  static readonly BLE_SERVICE_UUID = '0000ffb0-0000-1000-8000-00805f9b34fb';
  static readonly BLE_WRITE_UUID   = '0000ffb1-0000-1000-8000-00805f9b34fb';
  static readonly BLE_NOTIFY_UUID  = '0000ffb2-0000-1000-8000-00805f9b34fb';

  // 官方固定 AES-128 密钥 (16 字节)
  private static readonly AES_KEY_HEX = 'F638BC9CFA477480AB3242F6B04557A1';

  // 蠕动泵方向
  static readonly PUMP_STOP  = 0x00;
  static readonly PUMP_FILL  = 0x01; // 正转注水
  static readonly PUMP_DRAIN = 0x02; // 反转抽水

  // 抽水泵状态
  static readonly WATER_PUMP_STOP = 0x00;
  static readonly WATER_PUMP_RUN  = 0x01;

  private static getKeyWordArray(): CryptoJS.lib.WordArray {
    return CryptoJS.enc.Hex.parse(this.AES_KEY_HEX);
  }

  /**
   * 使用 AES-128-ECB 加密 16 字节明文
   */
  static encrypt16b(plainBytes16: Uint8Array): Uint8Array {
    if (plainBytes16.length !== 16) {
      throw new Error(`明文长度必须为 16 字节，当前为 ${plainBytes16.length}`);
    }

    const hexStr = Array.from(plainBytes16)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const plainWords = CryptoJS.enc.Hex.parse(hexStr);
    const keyWords = this.getKeyWordArray();

    const encrypted = CryptoJS.AES.encrypt(plainWords, keyWords, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.NoPadding
    });

    const cipherHex = encrypted.ciphertext.toString(CryptoJS.enc.Hex);
    const result = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      result[i] = parseInt(cipherHex.substring(i * 2, i * 2 + 2), 16);
    }
    return result;
  }

  /**
   * 使用 AES-128-ECB 解密 16 字节密文
   */
  static decrypt16b(cipherBytes16: Uint8Array): Uint8Array {
    if (cipherBytes16.length < 16) {
      throw new Error(`密文长度不足 16 字节`);
    }

    const hexStr = Array.from(cipherBytes16.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Hex.parse(hexStr)
    });
    const keyWords = this.getKeyWordArray();

    const decrypted = CryptoJS.AES.decrypt(cipherParams, keyWords, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.NoPadding
    });

    const plainHex = decrypted.toString(CryptoJS.enc.Hex);
    const result = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      result[i] = parseInt(plainHex.substring(i * 2, i * 2 + 2), 16) || 0;
    }
    return result;
  }

  private static getRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return bytes;
  }

  /**
   * 控制蠕动泵指令封包
   * 明文: [0xBF, 0x0F, 0xA0, 0x01, direction, durationHigh, durationLow, 9字节随机数]
   */
  static buildPeristalticPacket(direction: number, durationSec: number): Uint8Array {
    if (![this.PUMP_STOP, this.PUMP_FILL, this.PUMP_DRAIN].includes(direction)) {
      throw new Error('蠕动泵方向必须为 0、1 或 2');
    }
    if (!Number.isFinite(durationSec)) throw new Error('蠕动泵时长必须是有限数值');
    const dur = Math.max(0, Math.min(0xffff, Math.round(durationSec)));
    const plain = new Uint8Array(16);
    plain[0] = 0xbf;
    plain[1] = 0x0f;
    plain[2] = 0xa0;
    plain[3] = 0x01;
    plain[4] = direction & 0xff;
    plain[5] = (dur >> 8) & 0xff;
    plain[6] = dur & 0xff;
    plain.set(this.getRandomBytes(9), 7);
    return this.encrypt16b(plain);
  }

  /**
   * 控制抽水泵指令封包
   * 明文: [0xBF, 0x0F, 0xA0, 0x02, state, durationHigh, durationLow, 9字节随机数]
   */
  static buildWaterPumpPacket(state: number, durationSec: number): Uint8Array {
    if (![this.WATER_PUMP_STOP, this.WATER_PUMP_RUN].includes(state)) {
      throw new Error('抽水泵状态必须为 0 或 1');
    }
    if (!Number.isFinite(durationSec)) throw new Error('抽水泵时长必须是有限数值');
    const dur = Math.max(0, Math.min(0xffff, Math.round(durationSec)));
    const plain = new Uint8Array(16);
    plain[0] = 0xbf;
    plain[1] = 0x0f;
    plain[2] = 0xa0;
    plain[3] = 0x02;
    plain[4] = state & 0xff;
    plain[5] = (dur >> 8) & 0xff;
    plain[6] = dur & 0xff;
    plain.set(this.getRandomBytes(9), 7);
    return this.encrypt16b(plain);
  }

  /**
   * 停止/急停指令封包
   * 明文: [0xBF, 0x0F, 0xA0, 0x03, 12字节随机数]
   */
  static buildStopPacket(): Uint8Array {
    const plain = new Uint8Array(16);
    plain[0] = 0xbf;
    plain[1] = 0x0f;
    plain[2] = 0xa0;
    plain[3] = 0x03;
    plain.set(this.getRandomBytes(12), 4);
    return this.encrypt16b(plain);
  }

  /**
   * 查询工作状态封包
   * 明文: [0xBF, 0x0F, 0xA0, 0x04, 12字节随机数]
   */
  static buildQueryStatusPacket(): Uint8Array {
    const plain = new Uint8Array(16);
    plain[0] = 0xbf;
    plain[1] = 0x0f;
    plain[2] = 0xa0;
    plain[3] = 0x04;
    plain.set(this.getRandomBytes(12), 4);
    return this.encrypt16b(plain);
  }

  /**
   * 查询电量封包
   * 明文: [0xBF, 0x0F, 0xA0, 0x05, 12字节随机数]
   */
  static buildQueryBatteryPacket(): Uint8Array {
    const plain = new Uint8Array(16);
    plain[0] = 0xbf;
    plain[1] = 0x0f;
    plain[2] = 0xa0;
    plain[3] = 0x05;
    plain.set(this.getRandomBytes(12), 4);
    return this.encrypt16b(plain);
  }

  /**
   * 解析灌肠机上报的通知密文 (16 字节)
   */
  static parseNotifyPacket(encryptedBytes: Uint8Array): {
    type: 'status' | 'pressure' | 'battery' | 'unknown';
    data?: any;
  } {
    if (encryptedBytes.length < 16) {
      return { type: 'unknown' };
    }

    try {
      const plain = this.decrypt16b(encryptedBytes);
      if (plain[0] === 0xbf && plain[1] === 0x0f && plain[2] === 0xb0) {
        const cmd = plain[3];
        if (cmd === 0x01) {
          if (![this.PUMP_STOP, this.PUMP_FILL, this.PUMP_DRAIN].includes(plain[4])
            || ![this.WATER_PUMP_STOP, this.WATER_PUMP_RUN].includes(plain[5])) {
            return { type: 'unknown' };
          }
          return {
            type: 'status',
            data: {
              peristaltic: plain[4], // 0=停, 1=正, 2=反
              waterPump: plain[5]   // 0=停, 1=开
            }
          };
        } else if (cmd === 0x02) {
          const pA = (plain[4] << 8) | plain[5];
          const pB = (plain[6] << 8) | plain[7];
          return {
            type: 'pressure',
            data: { pressureA: pA, pressureB: pB }
          };
        } else if (cmd === 0x03) {
          return plain[4] <= 100 ? {
            type: 'battery',
            data: { battery: plain[4] }
          } : { type: 'unknown' };
        }
      }
    } catch {
      // ignore
    }
    return { type: 'unknown' };
  }
}
