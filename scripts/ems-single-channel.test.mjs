import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * 单通道 EMS 配置（其中一路上限 = 0）的回归测试。
 *
 * 报告背景：用户只接一路电极片时会把另一路上限设为 0。此前"随机强度"类玩法
 * （重塑的芭比实验室 / 神经刻印 / 全视之眼 / 场景导演，以及悬浮窗步进）
 * 一律用 Math.min(maxA, maxB) 当作可用上限 ⇒ 恒为 0 ⇒ 静默不出电、无任何提示。
 *
 * 正确语义：**只要有一路可用，随机请求就应按"已启用的最强通道"取范围**；
 * 上限为 0 的通道由 setEmsStrength 的按通道夹取保证永不输出（安全不变量）。
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

const setupManager = async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const { DeviceManager } = await loadBundledModule('../src/core/deviceManager.ts');
  const manager = DeviceManager.getInstance();
  await manager.switchMode('ble');
  manager.updateSafetyConfig({ emergencyLock: false, vibrationFeedback: false, autoPlayVoice: false });

  const emsPackets = [];
  const ems = manager.bleManagers.ems;
  ems.getEmsProtocolVersion = () => 'coyote_v3';
  ems.isConnected = () => true;
  ems.sendPacket = async (packet) => { emsPackets.push(Uint8Array.from(packet)); };
  for (const category of ['toy', 'enema']) {
    const ble = manager.bleManagers[category];
    ble.isConnected = () => false;
    ble.sendPacket = async () => {};
  }
  manager.currentState.devices.ems.isConnected = true;
  manager.currentState.connectionStatus = 'connected';

  return {
    manager,
    emsPackets,
    cleanup: async () => {
      await manager.emergencyStop().catch(() => {});
      await sleep(20);
      manager.simulator?.destroy?.();
      delete globalThis.__YCY_DEVICE_MANAGER__;
      delete globalThis.localStorage;
    },
  };
};

const sample = (manager, times = 30, maxAllowed = 200) => (
  Array.from({ length: times }, () => manager.getRandomEmsStrength(maxAllowed))
);

test('单通道上限为 0 时，随机 EMS 强度必须仍落在可用通道的区间内', async () => {
  const { manager, cleanup } = await setupManager();
  try {
    manager.updateSafetyConfig({ maxEmsStrengthA: 200, maxEmsStrengthB: 0, minEmsStrength: 35 });

    assert.equal(manager.getSafetyConfig().maxEmsStrengthB, 0, 'B 通道上限应保持为 0');
    assert.equal(
      manager.getSafetyConfig().minEmsStrength,
      35,
      '随机下限不应因为另一路被关闭而被清零',
    );

    const values = sample(manager);
    assert.ok(values.every((value) => value > 0), `不得出现 0（会静默跳过电击）：${values.join(',')}`);
    assert.ok(values.every((value) => value >= 35), `不得低于配置下限 35：${values.join(',')}`);
    assert.ok(values.every((value) => value <= 200), `不得高于通道 A 上限 200：${values.join(',')}`);
    assert.ok(values.some((value) => value > 100), '必须真正用上通道 A 的上限区间');
  } finally {
    await cleanup();
  }
});

test('两路上限都为 0 时，随机强度必须为 0（确实没有任何可用通道）', async () => {
  const { manager, cleanup } = await setupManager();
  try {
    manager.updateSafetyConfig({ maxEmsStrengthA: 0, maxEmsStrengthB: 0 });
    assert.equal(manager.getRandomEmsStrength(200), 0);
    assert.equal(manager.getRandomEmsStrengthInConfiguredRange(), 0);
  } finally {
    await cleanup();
  }
});

test('仅启用 B 通道时同样可用（对称性）', async () => {
  const { manager, cleanup } = await setupManager();
  try {
    manager.updateSafetyConfig({ maxEmsStrengthA: 0, maxEmsStrengthB: 120, minEmsStrength: 10 });
    const values = sample(manager, 30, 200);
    assert.ok(values.every((value) => value > 0 && value <= 120), `应落在 1-120：${values.join(',')}`);
  } finally {
    await cleanup();
  }
});

test('安全不变量：上限为 0 的通道绝不能被写入输出（郊狼 V3 实包校验）', async () => {
  const { manager, emsPackets, cleanup } = await setupManager();
  try {
    manager.updateSafetyConfig({ maxEmsStrengthA: 200, maxEmsStrengthB: 0, minEmsStrength: 35 });

    const strength = manager.getRandomEmsStrength(100);
    assert.ok(strength > 0, '重塑类玩法应取到非零强度');
    await manager.setEmsStrength('AB', strength);
    await sleep(250);

    assert.ok(manager.getState().ems.strengthA > 0, '通道 A 应处于输出状态');
    assert.equal(manager.getState().ems.strengthB, 0, '通道 B 上限为 0，必须保持 0');

    const b0 = emsPackets.filter((packet) => packet[0] === 0xb0);
    assert.ok(b0.length > 0, '应下发 V3 的 0xB0 包');
    assert.ok(b0.every((packet) => packet[3] === 0), 'B 通道强度字节必须恒为 0');
    assert.ok(
      b0.some((packet) => packet[2] > 0 && Array.from(packet.slice(8, 12)).some((value) => value > 0)),
      'A 通道必须收到携带非零波形强度切片的包（否则郊狼无输出）',
    );
  } finally {
    await cleanup();
  }
});

test('maxAllowed 参数仍然生效，不会被通道上限放大', async () => {
  const { manager, cleanup } = await setupManager();
  try {
    manager.updateSafetyConfig({ maxEmsStrengthA: 200, maxEmsStrengthB: 200, minEmsStrength: 10 });
    const values = sample(manager, 40, 50);
    assert.ok(values.every((value) => value <= 50), `不得突破 maxAllowed=50：${values.join(',')}`);
    assert.ok(values.every((value) => value >= 10));
  } finally {
    await cleanup();
  }
});

test('随机下限钳制到已启用的最强通道，而不是较弱通道', async () => {
  const { manager, cleanup } = await setupManager();
  try {
    manager.updateSafetyConfig({ maxEmsStrengthA: 180, maxEmsStrengthB: 200, minEmsStrength: 200 });
    assert.equal(
      manager.getSafetyConfig().minEmsStrength,
      200,
      '用户设定的随机下限不应被较弱通道压到 180（那会让单通道用户丢失下限）',
    );
    assert.equal(manager.getRandomEmsStrengthInConfiguredRange(), 200);
  } finally {
    await cleanup();
  }
});
