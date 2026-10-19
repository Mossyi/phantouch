import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * 电击安全上限回归测试（4 类缺陷）：
 *  1. AI 工具下发的电击没有时长 ⇒ 可无限期输出（P0）
 *  2. emsProtocolVersion 跨设备黏连 ⇒ 换设备后发错协议包 / 选错 GATT 特征
 *  3. 酒馆世界书（DZMM）单通道时给模型的档位区间是 0-0 ⇒ 永远不下发
 *  4. 灌肠 loop 流程没有总时长上限 ⇒ 可无限循环泵水
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

const setup = async () => {
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

  const emsPackets = [];
  const enemaPackets = [];
  const ems = manager.bleManagers.ems;
  ems.getEmsProtocolVersion = () => 'coyote_v3';
  ems.isConnected = () => true;
  ems.sendPacket = async (packet) => { emsPackets.push(Uint8Array.from(packet)); };
  const enema = manager.bleManagers.enema;
  enema.isConnected = () => true;
  enema.sendPacket = async (packet) => { enemaPackets.push(Uint8Array.from(packet)); };
  manager.bleManagers.toy.isConnected = () => false;
  manager.bleManagers.toy.sendPacket = async () => {};
  manager.currentState.devices.ems.isConnected = true;
  manager.currentState.devices.enema.isConnected = true;
  manager.currentState.connectionStatus = 'connected';

  manager.updateSafetyConfig({
    maxEmsStrengthA: 200,
    maxEmsStrengthB: 200,
    minEmsStrength: 35,
    maxEnemaDurationSec: 60,
    emergencyLock: false,
    vibrationFeedback: false,
    autoPlayVoice: false,
  });

  return {
    manager,
    emsPackets,
    enemaPackets,
    cleanup: async () => {
      await manager.stopEnema?.().catch?.(() => undefined);
      await manager.emergencyStop().catch(() => {});
      await sleep(20);
      manager.simulator?.destroy?.();
      delete globalThis.__YCY_DEVICE_MANAGER__;
      delete globalThis.localStorage;
    },
  };
};

// ───────────────────────── 1. 电击时长上限 ─────────────────────────
test('setEmsStrength 带时长：到点必须自动归零', async () => {
  const { manager, cleanup } = await setup();
  try {
    const message = await manager.setEmsStrength('AB', 50, 1);
    assert.match(message, /自动归零/, '返回信息应说明会自动归零');
    assert.equal(manager.getState().ems.strengthA, 50);

    await sleep(1300);
    assert.equal(manager.getState().ems.strengthA, 0, '1 秒后必须自动归零');
    assert.equal(manager.getState().ems.strengthB, 0);
    assert.equal(manager.getState().ems.isShocking, false);
  } finally {
    await cleanup();
  }
});

test('setEmsStrength 不传时长或显式传 0：保持原有语义（由调用方管理）', async () => {
  const { manager, cleanup } = await setup();
  try {
    await manager.setEmsStrength('A', 30);
    await sleep(1200);
    assert.equal(manager.getState().ems.strengthA, 30, '不传时长不应被自动归零');

    await manager.setEmsStrength('A', 40, 0);
    await sleep(1200);
    assert.equal(manager.getState().ems.strengthA, 40, '传 0 表示调用方自行管理，不得自动归零');
  } finally {
    await cleanup();
  }
});

test('AI 工具 schema 必须暴露 duration_sec，且工具调用真的会限时', async () => {
  const { manager, cleanup } = await setup();
  try {
    const { LLM_TOOLS } = await loadBundledModule('../src/core/ai/toolDefinitions.ts');
    for (const toolName of ['set_ems_strength', 'send_ems_wave']) {
      const tool = LLM_TOOLS.find((item) => item.function.name === toolName);
      assert.ok(tool, `${toolName} 工具应存在`);
      assert.ok(
        tool.function.parameters.properties.duration_sec,
        `${toolName} 必须向模型暴露 duration_sec，否则模型无法限时`,
      );
    }

    // 走真实的工具执行路径（TS private 只是编译期约束）
    const { LLMClient } = await loadBundledModule('../src/core/ai/llmClient.ts');
    const client = new LLMClient({ baseUrl: 'https://example.invalid', apiKey: 'k', model: 'm' });
    const result = await client.executeTool('set_ems_strength', {
      channel: 'AB',
      strength: 45,
      duration_sec: 1,
    });
    assert.equal(result.success, true, `工具应执行成功：${result.summary}`);
    assert.equal(manager.getState().ems.strengthA, 45);

    await sleep(1300);
    assert.equal(
      manager.getState().ems.strengthA,
      0,
      'AI 工具下发的电击必须在上限时长后自动归零（P0）',
    );
  } finally {
    await cleanup();
  }
});

// ───────────────────────── 2. 协议版本不乱串 ─────────────────────────
test('断开连接后 EMS 协议版本必须复位，不得黏连到下一台设备', async () => {
  const { manager, cleanup } = await setup();
  try {
    const ems = manager.bleManagers.ems;
    // 本用例要验证真实实现：移除 setup() 里为构造郊狼包而打的固定桩。
    delete ems.getEmsProtocolVersion;

    ems.setEmsProtocolVersion('coyote_v3');
    assert.equal(ems.getEmsProtocolVersion(), 'coyote_v3');

    await ems.disconnect();
    assert.equal(
      ems.getEmsProtocolVersion(),
      'v2',
      'disconnect() 必须复位到中性默认值，否则下次会把役次元设备误判成郊狼',
    );
  } finally {
    await cleanup();
  }
});

// ───────────────────────── 3. 世界书档位不再 0-0 ─────────────────────────
test('单通道配置下，世界书不能再把 min(A,B) 当作可用上限', async () => {
  const { resolveEnabledEmsCeiling } = await loadBundledModule('../src/core/safetyLimits.ts');
  assert.equal(resolveEnabledEmsCeiling(200, 0, 200), 200, 'A 通道可用时应取 200（旧实现会得 0）');
  assert.equal(resolveEnabledEmsCeiling(0, 0, 200), 0, '两路都关闭时才允许为 0');
  assert.equal(resolveEnabledEmsCeiling(120, 80, 200), 120, '应取已启用的较强通道');

  // 注意：这里刻意不 import hardwareLorebook —— 它会连带拉起 useAppStore 与各引擎的
  // 常驻 interval，导致测试进程无法退出。改用仓库既有的「源码契约」校验方式
  // （view-compat / viewport-compat 等测试也是这么做的）。
  const { readFile } = await import('node:fs/promises');
  const targets = [
    ['src/core/tavern/hardwareLorebook.ts', '世界书 AI 档位'],
    ['src/components/tavern/TavernLorebookTab.tsx', '世界书档位显示'],
  ];
  for (const [relative, label] of targets) {
    const text = await readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
    assert.ok(
      text.includes('resolveEnabledEmsCeiling'),
      `${label} 必须改用 resolveEnabledEmsCeiling`,
    );
    assert.ok(
      !/Math\.min\(\s*safety(?:Config)?\.maxEmsStrengthA/.test(text),
      `${label} 不得再退回 Math.min(maxEmsStrengthA, maxEmsStrengthB)（单通道时会得 0-0 档位）`,
    );
  }
});

// ───────────────────────── 4. 灌肠流程总时长上限 ─────────────────────────
test('灌肠 loop 流程必须在总时长上限处停止（不再无限循环）', async () => {
  const { manager, enemaPackets, cleanup } = await setup();
  try {
    const message = await manager.playEnemaPattern('micro_drip', 1);
    assert.match(message, /总时长上限/, '返回信息应说明总时长上限');
    await sleep(1500);

    assert.equal(
      manager.getState().enema.activePattern,
      null,
      '到点后必须清空当前流程（否则 loop 会一直跑下去）',
    );
    assert.equal(manager.getState().enema.peristalticState, 0);
    assert.equal(manager.getState().enema.waterPumpState, 0);
    assert.ok(enemaPackets.length > 0, '过程中应确实下发过泵指令');
  } finally {
    await cleanup();
  }
});
