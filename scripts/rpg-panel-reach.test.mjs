import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const panel = readFileSync(new URL('../src/components/tavern/TavernRpgPanel.tsx', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../src/components/tavern/TavernChatTab.tsx', import.meta.url), 'utf8');

test('检定和押注卡片固定在滚动区外面，分页条有左右按钮', () => {
  const scrollAt = panel.indexOf('min-h-0 flex-1 space-y-3 overflow-y-auto');
  const dockAt = panel.indexOf('data-rpg-check-dock');
  assert.ok(scrollAt > 0 && dockAt > scrollAt, '押注卡片要排在可滚动列表之后');
  assert.ok(!panel.slice(scrollAt, dockAt).includes('data-rpg-check-dock'));
  assert.match(panel, /aria-label="训练日程分页向右"/);
  assert.match(panel, /aria-label="训练日程分页向左"/);
  assert.match(panel, /fill="transparent"/);
  assert.match(panel, /还没解锁/);
});

test('称号、转折和提示在生成中仍然能点，出行和课程会先提示等待', () => {
  const start = chat.indexOf('const runRpgAction');
  const sensor = chat.indexOf('具身感应挑战拦截');
  const body = chat.slice(start, sensor);
  const equip = body.indexOf("action.type === 'equipTitle'");
  const tension = body.indexOf("action.type === 'tension'");
  const wait = body.indexOf('if (isLoading)');
  assert.ok(equip > 0 && tension > equip && wait > tension);
  assert.match(body, /上一条还在生成/);
  assert.equal(body.includes('if (!current || isLoading) return'), false);
  const cancel = chat.indexOf('const handleSensorChallengeCancel');
  const cancelBody = chat.slice(cancel, cancel + 420);
  assert.match(cancelBody, /sensorBypassed:\s*true/);
  assert.match(cancelBody, /pendingStakeRef\.current/);
  assert.match(chat, /challengePassed === undefined && !action\.sensorBypassed/);
});

test('旧存档没有 fun 时，转折开关和称号佩戴不会抛错', async () => {
  const entryPoint = fileURLToPath(new URL('../src/core/tavern/tavernRpg.ts', import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  const rpg = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  const state = rpg.createRpgState('contract', { char: '林夏', user: '学员' });
  delete state.fun;
  const off = rpg.setTensionEnabled(state, false);
  assert.equal(off.fun.tension.enabled, false);
  assert.equal(off.day, state.day);
  assert.equal(off.points, state.points);
  const worn = rpg.equipRpgTitle(off, 'clean_week');
  assert.equal(worn.fun.equipped, null);
  const unlocked = rpg.equipRpgTitle({ ...off, fun: { ...off.fun, unlocked: ['clean_week'] } }, 'clean_week');
  assert.equal(unlocked.fun.equipped, 'clean_week');
});
