import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * DG-LAB 灵猫控射传感器 / 负鼠震动控制器接入，以及役次元电极未接入提示。
 * 封包字节对照官方文档示例：https://github.com/DG-LAB-OPENSOURCE/DG-LAB-OPENSOURCE
 */

const loadBundledModule = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
const bytesOf = (text) => Uint8Array.from(text.match(/../g).map((h) => parseInt(h, 16)));

test('灵猫协议：50 / 66 指令与 D0 压力解析符合官方示例', async () => {
  const { CivetProtocol } = await loadBundledModule('../src/core/protocol/dglabAccessoryProtocol.ts');
  const start = CivetProtocol.buildReportingPacket(true);
  assert.equal(start.length, 17);
  assert.equal(hex(start), '5001D0' + '00'.repeat(14));
  assert.equal(hex(CivetProtocol.buildReportingPacket(false)), '500100' + '00'.repeat(14));
  assert.equal(hex(CivetProtocol.buildZeroPressurePacket()), '66000000000000000000000002');
  assert.equal(hex(CivetProtocol.buildDisplayOrientationPacket(3)), '66000000000000000000030000');

  const frame = (lo, hi) => {
    const bytes = new Uint8Array(17);
    bytes[0] = 0xd0; bytes[1] = 0x01; bytes[8] = lo; bytes[9] = hi;
    return bytes;
  };
  assert.deepEqual(CivetProtocol.parseNotifyPacket(frame(0x16, 0x03)), { type: 'pressure', pressureKpa: 7.9 });
  assert.deepEqual(CivetProtocol.parseNotifyPacket(frame(0xa8, 0x06)), { type: 'pressure', pressureKpa: 17.04 });
  assert.equal(CivetProtocol.parseNotifyPacket(Uint8Array.from([0xb1, 0, 0, 0])).type, 'unknown');
});

test('负鼠协议：B3 / B0 / B2 封包符合官方示例', async () => {
  const { OpossumProtocol } = await loadBundledModule('../src/core/protocol/dglabAccessoryProtocol.ts');
  assert.equal(hex(OpossumProtocol.buildIntensityPacket(160, null)), 'B3A0FF');
  assert.equal(hex(OpossumProtocol.buildIntensityPacket(null, 200)), 'B3FFC8');
  assert.equal(hex(OpossumProtocol.buildIntensityPacket(10, 20)), 'B30A14');
  assert.equal(hex(OpossumProtocol.buildIntensityPacket(999, -5)), 'B3C800', '强度夹在 0-200');

  const pulse = OpossumProtocol.buildPulsePacket([10, 20, 30, 150], [1, 2, 3, 4]);
  assert.equal(pulse.length, 20);
  assert.equal(hex(pulse), 'B0' + '00'.repeat(7) + '0A141E64' + '00'.repeat(4) + '01020304', '脉冲值夹在 0-100，越界会让整个通道被丢弃');

  const display = OpossumProtocol.buildDisplayPacket(50, 80);
  assert.equal(hex(display), 'B2' + 'FFFF00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0809' + '3250');
  assert.deepEqual(OpossumProtocol.parseNotifyPacket(Uint8Array.from([0xb3, 0x0a, 0x14])), { type: 'intensity', intensityA: 10, intensityB: 20 });
  assert.equal(OpossumProtocol.rateToIntensity(20), 200);
  assert.equal(OpossumProtocol.intensityToRate(55), 6);
});

test('0x180C 设备识别：按蓝牙名区分郊狼 3.0 / 灵猫 / 负鼠，名称缺失时按连接入口推断', async () => {
  const { identifyDGLabV3Family } = await loadBundledModule('../src/core/protocol/dglabAccessoryProtocol.ts');
  assert.equal(identifyDGLabV3Family('47L121000'), 'coyote_v3');
  assert.equal(identifyDGLabV3Family('47L124000'), 'civet');
  assert.equal(identifyDGLabV3Family('47L127000'), 'opossum');
  assert.equal(identifyDGLabV3Family(''), 'unknown');

  const { BLEManager } = await loadBundledModule('../src/core/bluetooth/bleManager.ts');
  const ble = new BLEManager();
  // 用户点的是「连接电击设备」，但选中的是灵猫：必须识别成传感器，后续会以类型不匹配拒绝连接，绝不发电击包
  assert.equal(ble.resolveDGLabV3Family('47L124000', 'ems').category, 'sensor');
  assert.equal(ble.getEmsProtocolVersion(), 'v2', '灵猫不能把 EMS 协议切到郊狼 V3');
  assert.equal(ble.resolveDGLabV3Family('47L127000', 'ems').category, 'toy');
  assert.equal(ble.getToyProtocol(), 'opossum');
  assert.equal(ble.resolveDGLabV3Family(null, 'toy').model, 'opossum');
  assert.equal(ble.resolveDGLabV3Family(null, 'sensor').model, 'civet');
  assert.deepEqual(ble.resolveDGLabV3Family('47L121000', 'ems'), { model: 'coyote_v3', category: 'ems' });
  assert.equal(ble.getEmsProtocolVersion(), 'coyote_v3');
  await ble.disconnect();
  assert.equal(ble.getDGLabModel(), 'unknown', '断开后复位型号');
});

const setupManager = async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  delete globalThis.__YCY_DEVICE_MANAGER__;
  const { DeviceManager } = await loadBundledModule('../src/core/deviceManager.ts');
  const manager = DeviceManager.getInstance();
  await manager.switchMode('ble');
  for (const category of ['ems', 'toy', 'enema', 'sensor']) {
    manager.bleManagers[category].isConnected = () => false;
    manager.bleManagers[category].sendPacket = async () => {};
  }
  manager.updateSafetyConfig({
    maxToyMotorARate: 20,
    maxToyMotorBRate: 20,
    maxToyMotorCRate: 20,
    emergencyLock: false,
    vibrationFeedback: false,
  });
  return manager;
};

const teardown = async (manager) => {
  await manager.emergencyStop().catch(() => {});
  await sleep(150);
  manager.simulator?.destroy?.();
  delete globalThis.__YCY_DEVICE_MANAGER__;
  delete globalThis.localStorage;
};

const attachOpossum = (manager) => {
  const toy = manager.bleManagers.toy;
  const packets = [];
  toy.isConnected = () => true;
  toy.getToyProtocol = () => 'opossum';
  toy.sendPacket = async (packet) => { packets.push(Uint8Array.from(packet)); };
  manager.currentState.devices.toy.isConnected = true;
  manager.currentState.toy.protocol = 'opossum';
  return packets;
};

test('负鼠：马达速率映射为 B3 强度并持续推送 B0 震动脉冲，停止与急停发负鼠自己的停止包', async () => {
  const manager = await setupManager();
  const packets = attachOpossum(manager);
  try {
    await manager.setToyMotor(5, 3, 7);
    const b3 = packets.filter((p) => p[0] === 0xb3);
    assert.equal(hex(b3[0]), 'B3321E', 'A=5 档 → 50，B=3 档 → 30');
    assert.ok(packets.some((p) => p[0] === 0xb2 && p[22] === 50 && p[23] === 30), '下发强度后同步屏幕显示');
    assert.equal(manager.getState().toy.motorC, 0, '负鼠没有 C 路');

    await sleep(350);
    const frames = packets.filter((p) => p[0] === 0xb0);
    assert.ok(frames.length >= 3, `100ms 推流，350ms 内应有 ≥3 帧，实际 ${frames.length}`);
    assert.equal(hex(frames.at(-1)), 'B0' + '00'.repeat(7) + '64646464' + '00'.repeat(4) + '64646464');
    assert.equal(packets.some((p) => p[0] === 0x35), false, '不能向负鼠发送役次元玩具包');

    packets.length = 0;
    await manager.setToyMotor(0, 0, 0);
    assert.ok(packets.some((p) => hex(p) === 'B30000'));
    await sleep(250);
    const afterStop = packets.filter((p) => p[0] === 0xb0 && p.slice(8).some((v) => v > 0));
    assert.equal(afterStop.length, 0, '停止后不再推送非零脉冲');

    await manager.setToyMotor(10, 10, 0);
    packets.length = 0;
    await manager.emergencyStop();
    assert.ok(packets.some((p) => hex(p) === 'B30000'), '急停向负鼠发 B3 归零');
    await sleep(250);
    assert.equal(packets.filter((p) => p[0] === 0xb0 && p.slice(8).some((v) => v > 0)).length, 0, '急停后推流停止');
  } finally {
    await teardown(manager);
  }
});

test('负鼠：机身按键把强度调过安全上限时立即压回，并同步显示', async () => {
  const manager = await setupManager();
  const packets = attachOpossum(manager);
  try {
    manager.updateSafetyConfig({ maxToyMotorBRate: 2 });
    manager.handleBleNotify(Uint8Array.from([0xb3, 0x00, 150]), 'toy');
    await sleep(20);
    assert.ok(packets.some((p) => hex(p) === 'B30014'), 'B 通道压回上限 2 档（强度 20）');
    assert.equal(manager.getState().toy.motorB, 2);
  } finally {
    await teardown(manager);
  }
});

test('灵猫：连接后开启压力上报，上报写入状态，归零指令可用', async () => {
  const manager = await setupManager();
  const sensor = manager.bleManagers.sensor;
  const packets = [];
  sensor.scanAndConnect = async () => ({ id: 'civet-1', name: '47L124000', category: 'sensor' });
  sensor.isConnected = () => true;
  sensor.sendPacket = async (packet) => { packets.push(Uint8Array.from(packet)); };
  try {
    await manager.connectBle('sensor');
    assert.equal(hex(packets[0]), '5001D0' + '00'.repeat(14));
    const state = manager.getState();
    assert.equal(state.devices.sensor.isConnected, true);
    assert.match(state.devices.sensor.name, /灵猫/);

    const report = new Uint8Array(17);
    report[0] = 0xd0; report[8] = 0x16; report[9] = 0x03;
    manager.handleBleNotify(report, 'sensor');
    assert.equal(manager.getState().sensor.pressureKpa, 7.9);

    await manager.zeroPressureSensor();
    assert.equal(hex(packets.at(-1)), '66000000000000000000000002');

    const { civetPressureToDetectorUnits } = await loadBundledModule('../src/core/discipline/edgingEngine.ts');
    assert.equal(civetPressureToDetectorUnits(7.9), 990);
    assert.equal(civetPressureToDetectorUnits(-1), 200);
  } finally {
    await teardown(manager);
  }
});

test('役次元电击器：通道回报电极未接入且正在要求放电时给出可见提示', async () => {
  const manager = await setupManager();
  const ems = manager.bleManagers.ems;
  ems.isConnected = () => true;
  ems.getEmsProtocolVersion = () => 'v2';
  manager.currentState.devices.ems.isConnected = true;
  manager.updateSafetyConfig({ maxEmsStrengthA: 200, maxEmsStrengthB: 200 });
  const refusals = [];
  const unsubscribe = manager.subscribeOutputRefusal((refusal) => refusals.push(refusal));
  const { YCYEMSProtocol } = await loadBundledModule('../src/core/protocol/emsProtocol.ts');
  const report = (connection) => {
    const raw = Uint8Array.from([0x35, 0x71, 0x01, connection, 0x01, 0x00, 0x1e, 0x01]);
    return Uint8Array.from([...raw, YCYEMSProtocol.checksum(raw)]);
  };
  try {
    await manager.setEmsStrength('A', 30);
    manager.handleBleNotify(report(0x01), 'ems');
    assert.equal(refusals.length, 0, '电极已接入时不提示');
    manager.handleBleNotify(report(0x00), 'ems');
    assert.equal(refusals.length, 1);
    assert.equal(refusals[0].reason, 'electrode_off');
    manager.handleBleNotify(report(0x00), 'ems');
    assert.equal(refusals.length, 1, '10 秒内不重复提示');
  } finally {
    unsubscribe();
    await teardown(manager);
  }
});

test('役次元灌肠机：AES 加解密与官方文档示例一致', async () => {
  const { YCYEnemaProtocol } = await loadBundledModule('../src/core/protocol/enemaProtocol.ts');
  assert.equal(hex(YCYEnemaProtocol.encrypt16b(bytesOf('BF0FA00101003C5A15D81EC2D3724A63'))), '1A464D2FC299C556140ACE015084751D');
  assert.deepEqual(
    YCYEnemaProtocol.parseNotifyPacket(bytesOf('8B3D701508C05FFEF90BC3587635F8C4')),
    { type: 'status', data: { peristaltic: 1, waterPump: 0 } },
  );
});
