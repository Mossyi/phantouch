import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * 「电击被静默拒绝 / 波形无法产生输出」回归测试。
 *
 * 两条被修复的行为：
 *  A. 波形只决定形状，幅度来自强度。强度为 0 时郊狼不会写任何包，而模式工坊的
 *     波形按钮、悬浮窗锯齿波、AI 的 send_ems_wave、契约查岗与控射推进都只调波形
 *     不设强度 ⇒ "注入了波形却毫无感觉"。现在会自动按「最小强度下限」起振。
 *  B. 急停锁 / 通道上限为 0 / 无法起振 这几种拒绝返回的是字符串而不是异常，
 *     `void x(...).catch(()=>{})` 永远收不到反馈 ⇒ 用户只看到"点了没反应"。
 *     现在会通过 subscribeOutputRefusal 上报，UI 侧有全局提示。
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

/** V3 的 0xB0 包：byte2/3 是 A/B 强度，byte8-11 / 16-19 是波形强度切片 */
const isV3 = (packet) => packet.length === 20 && packet[0] === 0xb0;
const liveOutput = (packet) => isV3(packet)
  && (packet[2] > 0 || packet[3] > 0)
  && (Array.from(packet.slice(8, 12)).some((v) => v > 0) || Array.from(packet.slice(16, 20)).some((v) => v > 0));

const setup = async (safety = {}) => {
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

  const packets = [];
  const ems = manager.bleManagers.ems;
  ems.getEmsProtocolVersion = () => 'coyote_v3';
  ems.isConnected = () => true;
  ems.sendPacket = async (packet) => { packets.push(Uint8Array.from(packet)); };
  for (const category of ['toy', 'enema']) {
    const ble = manager.bleManagers[category];
    ble.isConnected = () => false;
    ble.sendPacket = async () => {};
  }
  manager.currentState.devices.ems.isConnected = true;
  manager.currentState.connectionStatus = 'connected';

  const refusals = [];
  const unsubscribe = manager.subscribeOutputRefusal((refusal) => { refusals.push(refusal); });

  manager.updateSafetyConfig({
    maxEmsStrengthA: 200,
    maxEmsStrengthB: 200,
    minEmsStrength: 35,
    emergencyLock: false,
    vibrationFeedback: false,
    autoPlayVoice: false,
    ...safety,
  });

  return {
    manager,
    packets,
    refusals,
    unsubscribe,
    cleanup: async () => {
      unsubscribe();
      await manager.emergencyStop().catch(() => {});
      await sleep(20);
      manager.simulator?.destroy?.();
      delete globalThis.__YCY_DEVICE_MANAGER__;
      delete globalThis.localStorage;
    },
  };
};

test('强度为 0 时注入波形：自动按最小强度下限起振，郊狼收到真实输出', async () => {
  const { manager, packets, cleanup } = await setup();
  try {
    assert.equal(manager.getState().ems.strengthA, 0, '前置：初始强度为 0');
    assert.equal(manager.getState().ems.strengthB, 0, '前置：初始强度为 0');

    const message = await manager.sendEmsWave('AB', 'punish_thunder');
    await sleep(250);

    assert.match(message, /已自动按安全下限/, '返回信息必须说明自动起振，便于 UI/模型观察');
    assert.equal(manager.getState().ems.strengthA, 35, 'A 通道应被抬到配置下限 35');
    assert.equal(manager.getState().ems.strengthB, 35, 'B 通道应被抬到配置下限 35');
    assert.ok(packets.some(liveOutput), '必须写出携带非零波形强度切片的包，否则设备无输出');
  } finally {
    await cleanup();
  }
});

test('强度已经非 0 时注入波形：不得改动既有强度，也不出现起振提示', async () => {
  const { manager, cleanup } = await setup();
  try {
    await manager.setEmsStrength('A', 60);
    const message = await manager.sendEmsWave('A', 'tide');
    assert.doesNotMatch(message, /已自动按安全下限/);
    assert.equal(manager.getState().ems.strengthA, 60, '既有强度必须保持不变');
  } finally {
    await cleanup();
  }
});

test('上限为 0 的通道不会被自动起振（安全不变量）', async () => {
  const { manager, packets, cleanup } = await setup({ maxEmsStrengthB: 0 });
  try {
    await manager.sendEmsWave('AB', 'punish_thunder');
    await sleep(250);

    assert.ok(manager.getState().ems.strengthA > 0, '可用通道 A 应被起振');
    assert.equal(manager.getState().ems.strengthB, 0, '上限为 0 的 B 通道必须保持 0');
    const b0 = packets.filter(isV3);
    assert.ok(b0.length > 0);
    assert.ok(b0.every((packet) => packet[3] === 0), 'B 通道强度字节必须恒为 0');
  } finally {
    await cleanup();
  }
});

test('最小下限为 0 且强度为 0：波形必须明确拒绝，而不是假装成功', async () => {
  const { manager, packets, refusals, cleanup } = await setup({ minEmsStrength: 0 });
  try {
    const message = await manager.sendEmsWave('AB', 'breathe');
    await sleep(120);

    assert.match(message, /不会产生任何输出/);
    assert.ok(!packets.some(liveOutput), '不得写出任何有效输出包');
    assert.equal(manager.getState().ems.strengthA, 0);
    assert.equal(refusals.at(-1)?.reason, 'zero_strength', '必须上报 zero_strength 拒绝事件');
  } finally {
    await cleanup();
  }
});

test('急停锁锁存：强度与波形都必须上报 emergency_lock 拒绝', async () => {
  const { manager, refusals, cleanup } = await setup({ emergencyLock: true });
  try {
    const strengthMessage = await manager.setEmsStrength('AB', 50);
    assert.match(strengthMessage, /急停锁/);
    assert.equal(refusals.at(-1)?.reason, 'emergency_lock');
    assert.equal(manager.getState().ems.strengthA, 0);

    const waveMessage = await manager.sendEmsWave('AB', 'breathe');
    assert.match(waveMessage, /急停锁/);
    assert.equal(refusals.at(-1)?.reason, 'emergency_lock');
  } finally {
    await cleanup();
  }
});

test('两路上限都为 0：设置强度必须上报 no_usable_channel 并拒绝', async () => {
  const { manager, refusals, cleanup } = await setup({ maxEmsStrengthA: 0, maxEmsStrengthB: 0 });
  try {
    const message = await manager.setEmsStrength('AB', 50);
    assert.match(message, /安全上限为 0/);
    assert.equal(refusals.at(-1)?.reason, 'no_usable_channel');
    assert.equal(manager.getState().ems.strengthA, 0);
    assert.equal(manager.getState().ems.strengthB, 0);
  } finally {
    await cleanup();
  }
});

test('退订后不再收到拒绝事件', async () => {
  const { manager, refusals, unsubscribe, cleanup } = await setup({ emergencyLock: true });
  try {
    unsubscribe();
    await manager.setEmsStrength('AB', 50);
    assert.equal(refusals.length, 0, '退订后不应再有任何回调');
  } finally {
    await cleanup();
  }
});

test('autoStartStrength:false —— 先波形后强度的调用方不会被自动起振', async () => {
  const { manager, packets, refusals, cleanup } = await setup();
  try {
    const message = await manager.sendEmsWave('AB', 'breathe', undefined, { autoStartStrength: false });
    assert.doesNotMatch(message, /已自动按安全下限/);
    assert.doesNotMatch(message, /不会产生任何输出/, '调用方马上会设强度，此处不应拒绝');
    assert.equal(manager.getState().ems.strengthA, 0, '不得自动起振');
    assert.equal(manager.getState().ems.strengthB, 0, '不得自动起振');
    assert.ok(!packets.some(liveOutput), '此时不应有任何有效输出包');
    assert.equal(refusals.length, 0, '不应上报拒绝');

    // 紧随其后的真实强度（低于默认下限 35）必须能直接生效
    await manager.setEmsStrength('AB', 12);
    await sleep(200);
    assert.equal(manager.getState().ems.strengthA, 12);
    assert.equal(manager.getState().ems.strengthB, 12);
    assert.ok(packets.some(isV3), '应写出 V3 包');
  } finally {
    await cleanup();
  }
});
