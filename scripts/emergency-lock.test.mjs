import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { YCYEMSProtocol } from '../src/core/protocol/emsProtocol.ts';

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

/** 构造设备回报「通道 A 正在输出 strength」的通知包（役次元 BLE 协议）。 */
const buildChannelANotify = (strength) => {
  const bytes = new Uint8Array([0x35, 0x71, 0x01, 0x00, 0x01, (strength >> 8) & 0xff, strength & 0xff, 0x01, 0x00, 0x00]);
  bytes[9] = YCYEMSProtocol.checksum(bytes.slice(0, 9));
  return bytes;
};

/**
 * 建立一个「BLE 模式 + EMS 已连接」的管理器，并返回驱动硬件通知的入口。
 * 通知回调就是真实 BLE 协议栈递送数据的接缝。
 */
const createBleManager = async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };

  const { DeviceManager } = await loadBundledModule('../src/core/deviceManager.ts');
  const manager = DeviceManager.getInstance();
  manager.updateSafetyConfig({
    maxEmsStrengthA: 200,
    maxEmsStrengthB: 200,
    emergencyLock: false,
    vibrationFeedback: false,
  });

  const emsBle = manager.bleManagers.ems;
  emsBle.getEmsProtocolVersion = () => 'v1';
  emsBle.isConnected = () => true;
  emsBle.sendPacket = async () => {};
  // 玩具 / 灌肠通道同样按「已连接」桩接，便于验证锁定会一并清零
  for (const category of ['toy', 'enema']) {
    const ble = manager.bleManagers[category];
    ble.isConnected = () => true;
    ble.sendPacket = async () => {};
  }
  manager.currentMode = 'ble';

  return {
    manager,
    reportChannelA: (strength) => manager.handleBleNotify(buildChannelANotify(strength), 'ems'),
    cleanup: async () => {
      await manager.emergencyStop().catch(() => {});
      manager.simulator?.destroy?.();
      delete globalThis.__YCY_DEVICE_MANAGER__;
      delete globalThis.localStorage;
    },
  };
};

test('急停锁：下调上限后设备残留上报不锁定，但超过旧授权值仍立刻锁定', async () => {
  const { manager, reportChannelA, cleanup } = await createBleManager();
  try {
    // 200 上限下正常输出 150
    await manager.setEmsStrength('A', 150);
    assert.equal(manager.getState().ems.strengthA, 150);

    // 下调上限到 100：立即停止输出，但不锁
    manager.updateSafetyConfig({ maxEmsStrengthA: 100 });
    assert.equal(manager.getState().ems.strengthA, 0, '下调上限后输出应归零');
    assert.equal(manager.getSafetyConfig().emergencyLock, false, '下调上限本身不应锁定');

    // 停止指令送达前，设备按旧值回报一次：属于残留上报，不锁、也不回写显示状态
    reportChannelA(150);
    assert.equal(manager.getSafetyConfig().emergencyLock, false, '残留上报不应触发急停锁');
    assert.equal(manager.getState().ems.strengthA, 0, '残留上报不应把已归零的显示状态改回去');

    // 但设备若报出超过「旧授权值」的强度，说明是真的跑飞，必须立刻锁定
    reportChannelA(180);
    assert.equal(manager.getSafetyConfig().emergencyLock, true, '超过旧授权值的回报必须锁定');
  } finally {
    await cleanup();
  }
});

test('急停锁：豁免窗口过后，持续超限的设备仍会被锁定', async () => {
  const { manager, reportChannelA, cleanup } = await createBleManager();
  try {
    await manager.setEmsStrength('A', 150);
    manager.updateSafetyConfig({ maxEmsStrengthA: 100 });

    // 把豁免窗口拨到过去，模拟停止指令早已送达、设备却仍卡在 150
    manager.emsStaleReportGraceUntil = Date.now() - 1;
    reportChannelA(150);

    assert.equal(
      manager.getSafetyConfig().emergencyLock,
      true,
      '豁免窗口结束后仍卡在超限输出，必须锁定',
    );
  } finally {
    await cleanup();
  }
});

test('急停锁：未上调上限时，设备超限回报立即锁定', async () => {
  const { manager, reportChannelA, cleanup } = await createBleManager();
  try {
    manager.updateSafetyConfig({ maxEmsStrengthA: 100 });
    reportChannelA(150);
    assert.equal(manager.getSafetyConfig().emergencyLock, true, '无豁免窗口时应立即锁定');
  } finally {
    await cleanup();
  }
});

test('急停锁：锁定期间拒绝一切输出指令，解锁后恢复', async () => {
  const { manager, cleanup } = await createBleManager();
  try {
    manager.updateSafetyConfig({ emergencyLock: true });
    assert.equal(manager.getSafetyConfig().emergencyLock, true);

    assert.match(await manager.setEmsStrength('A', 50), /急停锁已激活/, '锁定期间电击应被拒绝');
    assert.match(await manager.setToyMotor(10, 0, 0), /急停锁已激活/, '锁定期间马达应被拒绝');
    assert.equal(manager.getState().ems.strengthA, 0);
    assert.equal(manager.getState().toy.motorA, 0);

    // 解锁后恢复可用
    manager.updateSafetyConfig({ emergencyLock: false });
    assert.equal(manager.getSafetyConfig().emergencyLock, false);
    await manager.setEmsStrength('A', 50);
    assert.equal(manager.getState().ems.strengthA, 50, '解锁后应能重新输出');
  } finally {
    await cleanup();
  }
});

test('急停锁：锁定会立即清零正在进行的输出', async () => {
  const { manager, cleanup } = await createBleManager();
  try {
    await manager.setEmsStrength('A', 120);
    await manager.setToyMotor(5, 5, 5);
    assert.equal(manager.getState().ems.strengthA, 120);

    manager.updateSafetyConfig({ emergencyLock: true });
    // emergencyStop 是异步落地，等一拍
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(manager.getState().ems.strengthA, 0, '锁定时电击应清零');
    assert.equal(manager.getState().toy.motorA, 0, '锁定时马达应清零');
  } finally {
    await cleanup();
  }
});
