import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const load = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const overlays = await load('../src/core/platform/overlayBack.ts');

test('返回键先关浮层，再退二级页，再退底栏，最后才退出', () => {
  const stack = overlays.createBackStack();
  const order = [];
  let unbindTab;
  let unbindSubnav;
  let unbindOld;
  let unbindNew;
  unbindTab = stack.push('tab', () => { order.push('tab'); unbindTab(); });
  unbindSubnav = stack.push('subnav', () => { order.push('subnav'); unbindSubnav(); });
  unbindOld = stack.push('overlay', () => { order.push('overlay-old'); unbindOld(); });
  unbindNew = stack.push('overlay', () => { order.push('overlay-new'); unbindNew(); });
  assert.equal(stack.handleBack(), 'closed');
  assert.deepEqual(order, ['overlay-new']);
  unbindOld();
  assert.equal(stack.handleBack(), 'closed');
  assert.equal(stack.handleBack(), 'closed');
  assert.equal(stack.handleBack(), 'exit');
  assert.deepEqual(order, ['overlay-new', 'subnav', 'tab']);
});

test('叠着的浮层按打开顺序从后往前关，Esc 不改底栏', () => {
  const stack = overlays.createBackStack();
  const order = [];
  let unbindTab;
  let unbindA;
  let unbindB;
  unbindTab = stack.push('tab', () => { order.push('tab'); unbindTab(); });
  unbindA = stack.push('overlay', () => { order.push('a'); unbindA(); });
  unbindB = stack.push('overlay', () => { order.push('b'); unbindB(); });
  assert.equal(stack.handleEscape(), true);
  assert.equal(stack.handleEscape(), true);
  assert.equal(stack.handleEscape(), false);
  assert.deepEqual(order, ['b', 'a']);
  assert.equal(stack.handleBack(), 'closed');
  assert.equal(stack.handleBack(), 'exit');
  assert.deepEqual(order, ['b', 'a', 'tab']);
});

test('什么都没打开时返回键才是退出', () => {
  const stack = overlays.createBackStack();
  assert.equal(stack.handleBack(), 'exit');
  const unbind = stack.push('overlay', () => {});
  assert.equal(stack.size, 1);
  unbind();
  assert.equal(stack.size, 0);
  assert.equal(stack.handleBack(), 'exit');
});

test('应用只挂一个返回键监听，Esc 只关浮层，不接管浏览器后退', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const stack = readFileSync(new URL('../src/core/platform/overlayBack.ts', import.meta.url), 'utf8');
  assert.match(app, /ensureAppBackListener\(\)/);
  assert.match(app, /useBackLayer\(!atHome/);
  assert.match(app, /handleEscape\(\)/);
  assert.match(stack, /App\.addListener\('backButton'/);
  assert.doesNotMatch(stack, /popstate/);
  assert.doesNotMatch(app, /popstate/);
});
