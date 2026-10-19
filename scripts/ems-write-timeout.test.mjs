import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * 硬件写入队列超时回归测试。
 *
 * 背景：硬件写入是一条 promise 链，一次永不 settle 的 BLE 写会让它后面所有指令
 * （包括归零）永久排队，而 UI 状态在 await 之前就已更新 —— 表现为
 * "界面显示 40 档、设备毫无动静、连用滑块归零都没反应，且没有任何报错"。
 *
 * 期望：超时后放弃该次写入、恢复队列、本地归零、绕过队列直发停止包；
 *       只有连停止包都送不出去时才升级为全局急停锁（不因一次慢写永久锁死 App）。
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
const isV3 = (packet) => packet.length === 20 && packet[0] === 0xb0;
const isStopPacket = (packet) => isV3(packet) && packet[2] === 0 && packet[3] === 0;

const WRITE_TIMEOUT_MS = 300;

const setup = async (sendPacket) => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  delete globalThis.__YCY_DEVICE_MANAGER__;
  const { DeviceManager, HardwareWriteTimeoutError } = await loadBundledModule('../src/core/deviceManager.ts');
  const manager = DeviceManager.getInstance();
  await manager.switchMode('ble');
  manager.setHardwareWriteTimeoutMs(WRITE_TIMEOUT_MS);

  const packets = [];
  const ems = manager.bleManagers.ems;
  ems.getEmsProtocolVersion = () => 'coyote_v3';
  ems.isConnected = () => true;
  ems.sendPacket = (packet) => sendPacket(packet, packets);
  for (const category of ['toy', 'enema']) {
    const ble = manager.bleManagers[category];
    ble.isConnected = () => false;
    ble.sendPacket = async () => {};
  }
  manager.currentState.devices.ems.isConnected = true;
  manager.currentState.connectionStatus = 'connected';

  const refusals = [];
  manager.subscribeOutputRefusal((refusal) => { refusals.push(refusal); });

  manager.updateSafetyConfig({
    maxEmsStrengthA: 200,
    maxEmsStrengthB: 200,
    minEmsStrength: 35,
    emergencyLock: false,
    vibrationFeedback: false,
    autoPlayVoice: false,
  });

  return {
    manager,
    packets,
    refusals,
    HardwareWriteTimeoutError,
    cleanup: async () => {
      await manager.emergencyStop().catch(() => {});
      await sleep(20);
      manager.simulator?.destroy?.();
      delete globalThis.__YCY_DEVICE_MANAGER__;
      delete globalThis.localStorage;
    },
  };
};

test('一次挂起的写入不再永久卡死队列：超时抛错，后续指令恢复正常', async () => {
  let call = 0;
  const { manager, packets, HardwareWriteTimeoutError, cleanup } = await setup((packet) => {
    call += 1;
    if (call === 1) return new Promise(() => {}); // 永不 settle
    packets.push(Uint8Array.from(packet));
    return Promise.resolve();
  });
  try {
    await assert.rejects(
      () => manager.setEmsStrength('AB', 40),
      (error) => error instanceof HardwareWriteTimeoutError,
      '挂起的写入必须在超时后抛错，而不是永远 await 不回来',
    );

    // 队列已恢复：后续指令必须能正常完成并真的写出包
    const before = packets.length;
    await manager.setEmsStrength('B', 20);
    await sleep(200);
    assert.ok(packets.length > before, '超时之后的新指令必须能正常写出');
    assert.equal(manager.getState().ems.strengthB, 20);
  } finally {
    await cleanup();
  }
});

test('写入超时：本地归零、绕过队列直发停止包、且不锁存全局急停', async () => {
  let call = 0;
  const { manager, packets, refusals, cleanup } = await setup((packet) => {
    call += 1;
    if (call === 1) return new Promise(() => {});
    packets.push(Uint8Array.from(packet));
    return Promise.resolve();
  });
  try {
    await manager.setEmsStrength('AB', 40).catch(() => undefined);
    await sleep(50);

    assert.equal(manager.getState().ems.strengthA, 0, '超时后本地必须归零');
    assert.equal(manager.getState().ems.strengthB, 0, '超时后本地必须归零');
    assert.equal(manager.getState().ems.isShocking, false);
    assert.ok(packets.some(isStopPacket), '必须绕过卡住的队列直发停止包，让设备真正停机');
    assert.equal(
      manager.getSafetyConfig().emergencyLock,
      false,
      '一次慢写不应永久锁死整个 App（停止包已送出）',
    );
    assert.equal(refusals.at(-1)?.reason, 'write_timeout', '必须上报 write_timeout，便于 UI 提示');
  } finally {
    await cleanup();
  }
});

test('写入超时且停止包也送不出去：必须升级为全局急停锁（安全底线）', async () => {
  let call = 0;
  const { manager, cleanup } = await setup(() => {
    call += 1;
    if (call === 1) return new Promise(() => {});      // 数据写入挂起
    return Promise.reject(new Error('ble link dead')); // 停止包也发不出去
  });
  try {
    await manager.setEmsStrength('AB', 40).catch(() => undefined);
    await sleep(80);
    assert.equal(
      manager.getSafetyConfig().emergencyLock,
      true,
      '无法确认停机时必须保守锁定',
    );
  } finally {
    await cleanup();
  }
});

test('正常写入（不挂起）不会被超时逻辑误伤', async () => {
  const { manager, packets, HardwareWriteTimeoutError, cleanup } = await setup((packet, sink) => {
    sink.push(Uint8Array.from(packet));
    return Promise.resolve();
  });
  try {
    const message = await manager.setEmsStrength('AB', 25);
    assert.doesNotMatch(message, /超时/);
    assert.equal(manager.getState().ems.strengthA, 25);
    assert.ok(packets.length > 0);
    assert.equal(manager.getSafetyConfig().emergencyLock, false);
    assert.ok(HardwareWriteTimeoutError);
  } finally {
    await cleanup();
  }
});
