import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const load = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const rpg = await load('../src/core/tavern/tavernRpg.ts');
const overlays = await load('../src/core/platform/overlayBack.ts');

const heart = { type: 'heart_rate', targetValue: 95, durationSeconds: 10, label: '心率', instruction: '保持' };

test('没连上心率设备时，残留的 75 不算达标，按住屏幕才算平复', () => {
  const stale = rpg.sensorDisplayedValue({ type: 'heart_rate', holding: false, deviceConnected: false, deviceValue: 75 });
  assert.equal(stale, 108);
  assert.equal(rpg.evaluateSensorChallenge(heart, stale), false);
  const held = rpg.sensorDisplayedValue({ type: 'heart_rate', holding: true, deviceConnected: false, deviceValue: 75 });
  assert.equal(held, 72);
  assert.equal(rpg.evaluateSensorChallenge(heart, held), true);
  const live = rpg.sensorDisplayedValue({ type: 'heart_rate', holding: false, deviceConnected: true, deviceValue: 80 });
  assert.equal(live, 80);
  assert.equal(rpg.evaluateSensorChallenge(heart, live), true);
  const high = rpg.sensorDisplayedValue({ type: 'heart_rate', holding: false, deviceConnected: true, deviceValue: 120 });
  assert.equal(rpg.evaluateSensorChallenge(heart, high), false);
});

test('同一次感应挑战的完成和跳过只能结算一次', () => {
  const claim = { token: null };
  assert.equal(rpg.claimSettlement(claim, 1), true);
  assert.equal(rpg.claimSettlement(claim, 1), false);
  assert.equal(rpg.claimSettlement(claim, Number.NaN), false);
  assert.equal(rpg.claimSettlement(claim, 2), true);
});

test('押注超过当前积分时不会把积分扣成负数', () => {
  const state = rpg.createRpgState('contract', { char: '林夏', user: '学员' });
  state.points = 4;
  const failed = rpg.runCourse({ ...state, points: 4 }, 'recite', () => 0, { stake: 100 });
  assert.equal(failed.error, undefined);
  assert.equal(failed.check.stake, 4);
  assert.ok(failed.state.points >= 0);
  const won = rpg.runCourse({ ...state, points: 4 }, 'recite', () => 0.99, { stake: 100 });
  assert.equal(won.check.stake, 4);
  assert.ok(won.state.points >= 4);
});

test('旧背包缺数量、数量非法时不会变成 NaN', () => {
  const state = rpg.createRpgState('contract', { char: '林夏', user: '学员' });
  const loaded = rpg.normalizeRpgState({
    ...state,
    inventory: [
      { name: '甜点', effect: { stamina: 10 } },
      { name: '坏掉的', qty: -2 },
      { name: '太多', qty: 150 },
      { qty: 3 },
    ],
  });
  assert.deepEqual(loaded.inventory.map((item) => [item.name, item.qty]), [['甜点', 1], ['太多', 99]]);
  const used = rpg.itemUseAction(loaded, '甜点');
  assert.equal(used.state.stamina, Math.min(100, loaded.stamina + 10));
  assert.equal(used.state.inventory.some((item) => item.name === '甜点'), false);
  assert.equal(Number.isNaN(used.state.stamina), false);
});

test('返回键只关闭最上面的浮层', () => {
  const stack = overlays.createOverlayStack();
  const closed = [];
  const removePanel = stack.push(() => closed.push('panel'));
  const removeSensor = stack.push(() => closed.push('sensor'));
  assert.equal(stack.closeTop(), true);
  assert.deepEqual(closed, ['sensor']);
  removeSensor();
  assert.equal(stack.closeTop(), true);
  assert.deepEqual(closed, ['sensor', 'panel']);
  removePanel();
  assert.equal(stack.closeTop(), false);
});
