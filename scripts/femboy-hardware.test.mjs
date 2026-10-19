import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * 重塑（特训营）硬件下发回归测试。
 *
 * 报告背景：郊狼 3.0（V3）用户在酒馆 / 伴侣里电击正常，但重塑模块完全无输出。
 * 根因：特训营任务同时声明 EMS 与马达，马达属于**可选**外设；
 * 一旦马达未连接或写入失败，异常会中止整条 EMS 下发序列并把已输出归零。
 * 郊狼 V3 的强度包必须携带波形强度切片才会真正输出，因此表现为"完全无感"。
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

/** V3 的 0xB0 包中，波形强度切片位于 byte 8-11（A）与 16-19（B）。 */
const carriesWaveIntensity = (packet) => (
  packet[0] === 0xb0
  && Array.from(packet.slice(8, 12)).some((value) => value > 0)
  && Array.from(packet.slice(16, 20)).some((value) => value > 0)
);

const createHarness = async ({ toyConnected, toyFailMode = 'none', emsConnected = true }) => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };

  const { DeviceManager } = await loadBundledModule('../src/core/deviceManager.ts');
  const { FemboyTrainingEngine } = await loadBundledModule('../src/core/discipline/femboyTrainingEngine.ts');

  const manager = DeviceManager.getInstance();
  await manager.switchMode('ble');
  manager.updateSafetyConfig({
    maxEmsStrengthA: 200,
    maxEmsStrengthB: 200,
    emergencyLock: false,
    vibrationFeedback: false,
    autoPlayVoice: false,
  });

  const emsPackets = [];
  const emsBle = manager.bleManagers.ems;
  emsBle.getEmsProtocolVersion = () => 'coyote_v3';
  emsBle.isConnected = () => emsConnected;
  emsBle.sendPacket = async (packet) => { emsPackets.push(Uint8Array.from(packet)); };

  const toyBle = manager.bleManagers.toy;
  toyBle.getEmsProtocolVersion = () => 'v1';
  toyBle.isConnected = () => toyConnected;
  let toyWriteCount = 0;
  toyBle.sendPacket = async () => {
    toyWriteCount += 1;
    // 'dead' 表示链路彻底断开（连停止指令都发不出去）；
    // 'transient' 表示只有第一次写入抖动，随后恢复。
    if (toyFailMode === 'dead') throw new Error('toy link dead');
    if (toyFailMode === 'transient' && toyWriteCount === 1) throw new Error('toy write timeout');
  };

  const enemaBle = manager.bleManagers.enema;
  enemaBle.isConnected = () => false;
  enemaBle.sendPacket = async () => {};

  // 状态镜像必须与 BLE 桩一致，否则等于在测一个现实中不存在的组合
  manager.currentState.connectionStatus = 'connected';
  manager.currentState.devices.ems.isConnected = emsConnected;
  manager.currentState.devices.toy.isConnected = toyConnected;

  const engine = FemboyTrainingEngine.getInstance();
  engine.abortTask(false);
  const task = engine.getTasks().find((item) => (
    item.stage === 1 && item.hardwareConfig.emsStrengthA && item.hardwareConfig.toyPattern
  ));
  assert.ok(task, '应能取到同时含 EMS 与马达配置的 1 阶段任务');

  return {
    manager,
    engine,
    task,
    emsPackets,
    cleanup: async () => {
      engine.abortTask(false);
      await sleep(30);
      await manager.emergencyStop().catch(() => {});
      manager.simulator?.destroy?.();
      delete globalThis.__YCY_DEVICE_MANAGER__;
      delete globalThis.localStorage;
    },
  };
};

test('重塑特训营：马达未连接不得中止电击，郊狼 V3 必须收到带波形强度的电击包', async () => {
  const { manager, engine, task, emsPackets, cleanup } = await createHarness({ toyConnected: false });
  try {
    assert.equal(engine.startTask(task.id, true), true);
    await sleep(400);

    const session = engine.getState().activeSession;
    assert.ok(session, '任务应仍在进行中，而不是被可选外设拖停');
    assert.equal(session.isPaused, false, '马达只是可选外设，不得暂停整个特训');

    const withIntensity = emsPackets.filter(carriesWaveIntensity);
    assert.ok(
      withIntensity.length > 0,
      '郊狼 V3 必须收到携带非零波形强度切片的 0xB0 包；只有强度书签包时设备完全无输出',
    );
    assert.ok(manager.getState().ems.strengthA > 0, '电击应保持在输出状态');
  } finally {
    await cleanup();
  }
});

test('重塑特训营：马达写入抖动不得连累电击，也不得永久锁死全局急停', async () => {
  const { manager, engine, task, emsPackets, cleanup } = await createHarness({
    toyConnected: true,
    toyFailMode: 'transient',
  });
  try {
    assert.equal(engine.startTask(task.id, true), true);
    await sleep(400);

    assert.equal(
      manager.getSafetyConfig().emergencyLock,
      false,
      '一次可恢复的马达写入失败不应锁死全局急停（否则整个 App 都被锁死）',
    );
    assert.equal(engine.getState().activeSession?.isPaused, false, '核心电击正常时不应暂停特训');
    assert.ok(emsPackets.filter(carriesWaveIntensity).length > 0, '电击应继续携带波形强度输出');
  } finally {
    await cleanup();
  }
});

test('重塑特训营：马达链路彻底断开且无法确认停机时，仍必须锁定全局急停', async () => {
  const { manager, engine, task, cleanup } = await createHarness({
    toyConnected: true,
    toyFailMode: 'dead',
  });
  try {
    engine.startTask(task.id, true);
    await sleep(400);

    assert.equal(
      manager.getSafetyConfig().emergencyLock,
      true,
      '连停止指令都发不出去时必须保守锁定，这是原有的安全底线',
    );
  } finally {
    await cleanup();
  }
});

test('重塑特训营：EMS 才是核心输出，未连接时仍必须暂停并明确提示', async () => {
  const { engine, task, cleanup } = await createHarness({ toyConnected: false, emsConnected: false });
  try {
    engine.startTask(task.id, true);
    await sleep(400);

    const session = engine.getState().activeSession;
    assert.ok(session, '会话对象应存在');
    assert.equal(session.isPaused, true, '核心电击设备缺失必须暂停任务');
    assert.match(session.currentTip, /EMS|电击/, '提示必须指明是电击设备的问题');
  } finally {
    await cleanup();
  }
});

test('重塑特训营：设备齐备时电击与马达都应正常启动', async () => {
  const { manager, engine, task, emsPackets, cleanup } = await createHarness({ toyConnected: true });
  try {
    assert.equal(engine.startTask(task.id, true), true);
    await sleep(400);

    assert.equal(engine.getState().activeSession?.isPaused, false, '设备齐备时不应暂停');
    assert.ok(emsPackets.filter(carriesWaveIntensity).length > 0, '电击应携带波形强度输出');
    assert.equal(manager.getSafetyConfig().emergencyLock, false);
  } finally {
    await cleanup();
  }
});
