import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function bundled(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
}

test('Enema Protocol: V2 constants and packet parsing compatibility', async () => {
  const { YCYEnemaProtocol } = await bundled('src/core/protocol/enemaProtocol.ts');

  // 1. 常量检验：必须存在 2.0 (FF50/FF51/FF52) 定义
  assert.equal(YCYEnemaProtocol.BLE_SERVICE_UUID, '0000ffb0-0000-1000-8000-00805f9b34fb');
  assert.equal(YCYEnemaProtocol.BLE_WRITE_UUID, '0000ffb1-0000-1000-8000-00805f9b34fb');
  assert.equal(YCYEnemaProtocol.BLE_NOTIFY_UUID, '0000ffb2-0000-1000-8000-00805f9b34fb');

  assert.equal(YCYEnemaProtocol.BLE_SERVICE_V2_UUID, '0000ff50-0000-1000-8000-00805f9b34fb');
  assert.equal(YCYEnemaProtocol.BLE_WRITE_V2_UUID, '0000ff51-0000-1000-8000-00805f9b34fb');
  assert.equal(YCYEnemaProtocol.BLE_NOTIFY_V2_UUID, '0000ff52-0000-1000-8000-00805f9b34fb');

  // 2. 指令构建与加解密测试
  const fillPacket = YCYEnemaProtocol.buildPeristalticPacket(1, 15);
  assert.equal(fillPacket.length, 16);
  const plainFill = YCYEnemaProtocol.decrypt16b(fillPacket);
  assert.equal(plainFill[0], 0xbf);
  assert.equal(plainFill[1], 0x0f);
  assert.equal(plainFill[2], 0xa0);
  assert.equal(plainFill[3], 0x01);
  assert.equal(plainFill[4], 0x01); // 正转注水
  assert.equal((plainFill[5] << 8) | plainFill[6], 15); // 15秒

  // 3. 2.0 状态通知包解析兼容性 (兼容 0xb0 与 0x50 标识)
  const plainStatusV2 = new Uint8Array(16);
  plainStatusV2[0] = 0xbf;
  plainStatusV2[1] = 0x0f;
  plainStatusV2[2] = 0x50; // 2.0 常见标识
  plainStatusV2[3] = 0x01;
  plainStatusV2[4] = 0x02; // 蠕动泵反转
  plainStatusV2[5] = 0x01; // 抽水泵运行
  const cipherStatusV2 = YCYEnemaProtocol.encrypt16b(plainStatusV2);

  const parsedStatus = YCYEnemaProtocol.parseNotifyPacket(cipherStatusV2);
  assert.equal(parsedStatus.type, 'status');
  assert.equal(parsedStatus.data?.peristaltic, 2);
  assert.equal(parsedStatus.data?.waterPump, 1);

  // 4. 2.0 压力传感器通知包解析兼容性
  const plainPressureV2 = new Uint8Array(16);
  plainPressureV2[0] = 0xbf;
  plainPressureV2[1] = 0x0f;
  plainPressureV2[2] = 0x50;
  plainPressureV2[3] = 0x02;
  plainPressureV2[4] = 0x01;
  plainPressureV2[5] = 0x2c; // pA = 300
  plainPressureV2[6] = 0x00;
  plainPressureV2[7] = 0x96; // pB = 150
  const cipherPressureV2 = YCYEnemaProtocol.encrypt16b(plainPressureV2);

  const parsedPressure = YCYEnemaProtocol.parseNotifyPacket(cipherPressureV2);
  assert.equal(parsedPressure.type, 'pressure');
  assert.equal(parsedPressure.data?.pressureA, 300);
  assert.equal(parsedPressure.data?.pressureB, 150);

  // 5. 2.0 电量通知包解析兼容性
  const plainBatteryV2 = new Uint8Array(16);
  plainBatteryV2[0] = 0xbf;
  plainBatteryV2[1] = 0x0f;
  plainBatteryV2[2] = 0x50;
  plainBatteryV2[3] = 0x03;
  plainBatteryV2[4] = 85; // 85%
  const cipherBatteryV2 = YCYEnemaProtocol.encrypt16b(plainBatteryV2);

  const parsedBattery = YCYEnemaProtocol.parseNotifyPacket(cipherBatteryV2);
  assert.equal(parsedBattery.type, 'battery');
  assert.equal(parsedBattery.data?.battery, 85);

  // 6. 1.0 标准通知包也必须继续保持完全兼容
  const plainStatusV1 = new Uint8Array(16);
  plainStatusV1[0] = 0xbf;
  plainStatusV1[1] = 0x0f;
  plainStatusV1[2] = 0xb0; // 1.0 标识
  plainStatusV1[3] = 0x01;
  plainStatusV1[4] = 0x01;
  plainStatusV1[5] = 0x00;
  const cipherStatusV1 = YCYEnemaProtocol.encrypt16b(plainStatusV1);
  const parsedStatusV1 = YCYEnemaProtocol.parseNotifyPacket(cipherStatusV1);
  assert.equal(parsedStatusV1.type, 'status');
  assert.equal(parsedStatusV1.data?.peristaltic, 1);

  // 7. 回显 0xa0 指令头的通知包兼容
  const plainEcho = new Uint8Array([0xbf, 0x0f, 0xa0, 0x03, 99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const parsedEcho = YCYEnemaProtocol.parseNotifyPacket(plainEcho);
  assert.equal(parsedEcho.type, 'battery');
  assert.equal(parsedEcho.data?.battery, 99);

  // 8. 明文上报包容错测试
  const plaintextNotify = new Uint8Array([0xbf, 0x0f, 0x50, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const parsedPlaintext = YCYEnemaProtocol.parseNotifyPacket(plaintextNotify);
  assert.equal(parsedPlaintext.type, 'status');
  assert.equal(parsedPlaintext.data?.peristaltic, 1);
});

