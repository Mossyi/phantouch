import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * 「界面显示在放电、设备却没有输出」类回归测试：
 *  A. 郊狼 V3 的 B1 强度回报迟到超过一帧（100ms）时，旧回报会把强度改回旧值，
 *     推流帧再把旧值发给设备 → 输出在新旧强度之间来回跳，停止后立刻重新开始时也无法稳定。
 *  B. Web Bluetooth 对未声明 writeWithoutResponse 的特征（郊狼 V2/V3 的写特征都是）直接拒绝写入。
 *  C. 波形每 100ms 只取一个采样点，窄尖峰被整段跳过（旋风涌动在 V2 上几乎全程为 0）。
 *  D. DG-LAB 扫码模式：消息类型不符合官方协议（APP 收不到强度与清空指令）、
 *     只下发强度不下发波形（设备不放电）、二维码用的不是服务端分配的 clientId（无法配对）。
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

const installStorage = () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
};

const freshManager = async () => {
  installStorage();
  delete globalThis.__YCY_DEVICE_MANAGER__;
  const { DeviceManager } = await loadBundledModule('../src/core/deviceManager.ts');
  return DeviceManager.getInstance();
};

const teardown = async (manager) => {
  await manager.emergencyStop().catch(() => {});
  await sleep(250);
  manager.simulator?.destroy?.();
  delete globalThis.__YCY_DEVICE_MANAGER__;
  delete globalThis.localStorage;
};

/** 模拟一台郊狼 V3：按 B0 包更新强度，带序列号的改动在 latencyMs 后回 B1。 */
const setupV3WithEcho = async (latencyMs) => {
  const manager = await freshManager();
  await manager.switchMode('ble');
  const ems = manager.bleManagers.ems;
  ems.getEmsProtocolVersion = () => 'coyote_v3';
  ems.isConnected = () => true;
  const device = { A: 0, B: 0, history: [] };
  ems.sendPacket = async (packet) => {
    if (packet[0] !== 0xb0) return;
    const seq = packet[1] >> 4;
    if (((packet[1] >> 2) & 0x03) === 3) device.A = packet[2];
    if ((packet[1] & 0x03) === 3) device.B = packet[3];
    device.history.push(device.A);
    if (seq !== 0) {
      const snapshot = [device.A, device.B];
      setTimeout(() => manager.handleBleNotify(Uint8Array.from([0xb1, seq, snapshot[0], snapshot[1]]), 'ems'), latencyMs);
    }
  };
  for (const category of ['toy', 'enema']) {
    manager.bleManagers[category].isConnected = () => false;
    manager.bleManagers[category].sendPacket = async () => {};
  }
  manager.updateSafetyConfig({
    maxEmsStrengthA: 200,
    maxEmsStrengthB: 200,
    minEmsStrength: 35,
    emergencyLock: false,
    vibrationFeedback: false,
  });
  return { manager, device };
};

test('郊狼 V3：B1 回报迟到 150ms 时，新强度依然稳定生效，不在新旧值之间来回跳', async () => {
  const { manager, device } = await setupV3WithEcho(150);
  try {
    await manager.setEmsStrength('AB', 30);
    await sleep(500);
    await manager.setEmsStrength('AB', 60);
    await sleep(1500);
    const tail = device.history.slice(-10);
    assert.deepEqual(tail, Array(10).fill(60), `设备强度应稳定在 60，实际最近 10 帧：${tail.join(' ')}`);
    assert.equal(manager.getState().ems.strengthA, 60);
  } finally {
    await teardown(manager);
  }
});

test('郊狼 V3：停止后立刻重新开始，迟到的旧回报不会把新输出改回去', async () => {
  const { manager, device } = await setupV3WithEcho(120);
  try {
    await manager.setEmsStrength('AB', 30);
    await sleep(500);
    await manager.setEmsStrength('AB', 0);
    await manager.setEmsStrength('AB', 50);
    await sleep(1500);
    const tail = device.history.slice(-10);
    assert.deepEqual(tail, Array(10).fill(50), `设备强度应稳定在 50，实际最近 10 帧：${tail.join(' ')}`);
    const state = manager.getState().ems;
    assert.equal(state.strengthA, 50);
    assert.equal(state.isShocking, true);
  } finally {
    await teardown(manager);
  }
});

test('郊狼 V3：被忽略的旧回报若超出安全上限，仍然立即锁定急停', async () => {
  const { manager } = await setupV3WithEcho(20);
  try {
    manager.updateSafetyConfig({ maxEmsStrengthA: 50, maxEmsStrengthB: 50 });
    await manager.setEmsStrength('AB', 40);
    await sleep(50);
    const staleSeq = ((manager.coyoteSeq + 7) % 15) + 1;
    manager.handleBleNotify(Uint8Array.from([0xb1, staleSeq, 120, 0]), 'ems');
    await sleep(20);
    assert.equal(manager.getSafetyConfig().emergencyLock, true, '超限回报必须锁急停，不能因为序列号过时被放过');
  } finally {
    await teardown(manager);
  }
});

test('Web Bluetooth：写特征未声明 writeWithoutResponse 时改用有响应写', async () => {
  const { BLEManager } = await loadBundledModule('../src/core/bluetooth/bleManager.ts');
  const ble = new BLEManager();
  ble.isNative = false;
  const calls = [];
  ble.writeCharacteristic = {
    // 郊狼 V2 PWM_AB2 / V3 0x150A 的真实属性：只有 Write
    properties: { write: true, writeWithoutResponse: false },
    writeValueWithoutResponse: async () => {
      calls.push('withoutResponse');
      throw new DOMException('GATT operation not permitted.', 'NotSupportedError');
    },
    writeValueWithResponse: async () => { calls.push('withResponse'); },
    writeValue: async () => { calls.push('writeValue'); },
  };
  await ble.sendPacket(Uint8Array.from([0xb0, 0, 0, 0]));
  assert.deepEqual(calls, ['withResponse']);

  calls.length = 0;
  ble.writeCharacteristic.properties = { write: false, writeWithoutResponse: true };
  ble.writeCharacteristic.writeValueWithoutResponse = async () => { calls.push('withoutResponse'); };
  await ble.sendPacket(Uint8Array.from([0xb0, 0, 0, 0]));
  assert.deepEqual(calls, ['withoutResponse'], '声明了无响应写的特征仍走无响应写');
});

test('波形降采样保留窄尖峰：旋风涌动在 V2 / V3 上不再几乎全程为 0', async () => {
  const { CoyoteWaveformConverter } = await loadBundledModule('../src/core/protocol/coyoteProtocol.ts');
  const { EMSWaveEngine } = await loadBundledModule('../src/core/protocol/waveEngine.ts');
  const wave = EMSWaveEngine.getWave('cyclone_surge');
  const steps = Math.round(wave.durationMs / 100);
  let silentV2 = 0;
  let silentV3 = 0;
  for (let step = 0; step < steps; step++) {
    if (CoyoteWaveformConverter.getV2Step(wave.id, step)[2] === 0) silentV2++;
    if (CoyoteWaveformConverter.getV3Slice(wave.id, step).intensity.every((value) => value === 0)) silentV3++;
  }
  assert.ok(silentV2 <= steps * 0.2, `V2 静默帧 ${silentV2}/${steps} 过多`);
  assert.ok(silentV3 <= steps * 0.2, `V3 静默帧 ${silentV3}/${steps} 过多`);
});

/** 把 DeviceManager 切到 DG-LAB 模式，并用假 WebSocket 记录发出的消息。 */
const setupDglab = async () => {
  const manager = await freshManager();
  await manager.switchMode('dglab');
  const sent = [];
  const client = manager.dglabClient;
  client.ws = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)), close: () => {} };
  client.clientId = 'web-1';
  client.targetId = 'app-1';
  client.status = 'connected';
  manager.updateSafetyConfig({
    maxEmsStrengthA: 200,
    maxEmsStrengthB: 200,
    minEmsStrength: 35,
    emergencyLock: false,
    vibrationFeedback: false,
  });
  return { manager, sent };
};

test('DG-LAB：只设强度也会持续下发波形，消息格式符合官方协议', async () => {
  const { manager, sent } = await setupDglab();
  try {
    await manager.setEmsStrength('AB', 40);
    const strength = sent.filter((m) => m.type === 3);
    assert.deepEqual(strength.map((m) => [m.channel, m.strength]), [[1, 40], [2, 40]]);
    assert.ok(strength.every((m) => m.clientId === 'web-1' && m.targetId === 'app-1' && m.message));

    const pulses = () => sent.filter((m) => m.type === 'clientMsg');
    assert.deepEqual(pulses().map((m) => m.channel).sort(), ['A', 'B'], '设强度后应立即给两个通道下发波形');
    for (const m of pulses()) {
      assert.equal(m.time, 1, '每块波形只推送一次，避免服务端每秒重复入队');
      const frames = JSON.parse(m.message.slice(2));
      assert.equal(frames.length, 10);
      assert.ok(JSON.stringify(m).length < 1950);
    }

    await sleep(1300);
    const perChannel = pulses().filter((m) => m.channel === 'A').length;
    assert.ok(perChannel >= 2 && perChannel <= 3, `1.3 秒内 A 通道应补 1~2 块波形，实际共 ${perChannel} 块`);

    sent.length = 0;
    await manager.setEmsStrength('AB', 0);
    assert.deepEqual(sent.filter((m) => m.type === 3).map((m) => m.strength), [0, 0]);
    assert.deepEqual(sent.filter((m) => m.type === 4).map((m) => [m.channel, m.message]), [[1, 'clear-1'], [2, 'clear-2']]);
    sent.length = 0;
    await sleep(600);
    assert.equal(pulses().length, 0, '强度归零后不再补波形');
  } finally {
    await teardown(manager);
  }
});

test('DG-LAB：急停发出 APP 能识别的归零与清空指令', async () => {
  const { manager, sent } = await setupDglab();
  try {
    await manager.sendEmsWave('AB', 'tide');
    assert.ok(sent.some((m) => m.type === 'clientMsg'), '注入波形后应开始推流');
    sent.length = 0;
    await manager.emergencyStop();
    assert.deepEqual(sent.filter((m) => m.type === 3).map((m) => [m.channel, m.strength]), [[1, 0], [2, 0]]);
    assert.deepEqual(sent.filter((m) => m.type === 4).map((m) => m.channel), [1, 2]);
    assert.equal(sent.some((m) => m.type === 'msg'), false, "type:'msg' 会被官方服务端退回，不能用于控制");
    sent.length = 0;
    await sleep(600);
    assert.equal(sent.filter((m) => m.type === 'clientMsg').length, 0, '急停后推流必须停止');
  } finally {
    await teardown(manager);
  }
});

test('DG-LAB：二维码使用服务端分配的 clientId；服务端不分配时回退到本地 ID', async () => {
  const { DGLabSocketClient } = await loadBundledModule('../src/core/bridge/dglabSocketClient.ts');
  const OriginalWebSocket = globalThis.WebSocket;
  const makeFakeSocket = (assignId) => class FakeWebSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      setTimeout(() => {
        this.onopen?.();
        if (assignId) {
          this.onmessage?.({ data: JSON.stringify({ type: 'bind', clientId: assignId, targetId: '', message: 'targetId' }) });
        }
      }, 5);
    }
    send() {}
    close() { this.readyState = 3; }
  };
  try {
    globalThis.WebSocket = makeFakeSocket('server-assigned-id');
    const client = new DGLabSocketClient();
    const qr = await client.connect('ws://127.0.0.1:9999');
    assert.equal(qr, 'https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#ws://127.0.0.1:9999/server-assigned-id');
    assert.equal(client.getClientId(), 'server-assigned-id');
    client.disconnect();

    globalThis.WebSocket = makeFakeSocket(null);
    DGLabSocketClient.ID_ASSIGN_WAIT_MS = 30;
    const fallback = new DGLabSocketClient();
    const fallbackQr = await fallback.connect('ws://127.0.0.1:9999');
    assert.ok(fallbackQr.endsWith(`/${fallback.getClientId()}`));
    fallback.disconnect();
  } finally {
    globalThis.WebSocket = OriginalWebSocket;
  }
});
