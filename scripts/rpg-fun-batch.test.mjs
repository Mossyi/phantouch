import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const load = async () => {
  const entryPoint = fileURLToPath(new URL('../src/core/tavern/tavernRpg.ts', import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const names = { char: '林夏', user: '学员' };

test('四档检定：自然 20、高出 3 点、擦边、低于难度、自然 1，以及成功概率', async () => {
  const m = await load();
  const state = m.createRpgState('contract', names);
  const mod = m.checkModifier(state, 'obedience');
  assert.equal(mod, -2);
  const chances = m.checkChances(mod, 10);
  assert.equal(chances.faces, 20);
  assert.equal(chances.crit, 1);
  assert.equal(chances.critFail, 1);
  assert.equal(chances.successFaces, chances.crit + chances.success + chances.costly);
  assert.equal(chances.successPercent, Math.round((chances.successFaces / 20) * 100));

  const crit = m.rollCheck(state, { stat: 'obedience', dc: 10 }, () => 0.99);
  assert.equal(crit.tier, 'crit');
  assert.equal(crit.roll, 20);
  assert.equal(crit.success, true);
  const strong = m.classifyRoll(15, mod, 10);
  assert.equal(strong.tier, 'success');
  const costly = m.classifyRoll(12, mod, 10);
  assert.equal(costly.tier, 'costly');
  assert.equal(costly.cost.stress, 3);
  assert.equal(costly.success, true);
  const fail = m.classifyRoll(8, mod, 10);
  assert.equal(fail.tier, 'fail');
  assert.equal(fail.success, false);
  const critFail = m.rollCheck(state, { stat: 'obedience', dc: 10 }, () => 0);
  assert.equal(critFail.tier, 'critFail');
  assert.match(m.formatCheckResult({ ...costly, stat: 'obedience', dc: 10, roll: 12, mod, stake: 0, wagerNet: 0, costStress: 3 }), /勉强成功（付出代价：压力 \+3）/);
  const preview = m.previewCheck(state, 'obedience', 10);
  assert.equal(preview.chances.successPercent, chances.successPercent);
});

test('对赌：封顶、三档返还和连胜；不押不改变连胜', async () => {
  const m = await load();
  let state = m.createRpgState('contract', names);
  state = { ...state, points: 8 };
  assert.equal(m.capStake(state.points, 10), 8);
  assert.deepEqual(
    [m.settleWager(8, 5, 'crit').net, m.settleWager(8, 5, 'success').net, m.settleWager(8, 5, 'costly').net, m.settleWager(8, 5, 'fail').net, m.settleWager(8, 5, 'critFail').net],
    [10, 5, 0, -5, -5],
  );
  const go = (random, stake) => m.runCourse(state, 'recite', random, { stake });
  const crit = go(() => 0.99, 5);
  assert.equal(crit.state.points, 8 + 5 + 10, '课程 +5，大成功净赚 10');
  assert.equal(crit.state.fun.wagerStreak, 1);
  const win = m.runCourse(crit.state, 'recite', () => 0.7, { stake: 2 });
  assert.equal(win.check.tier, 'success');
  assert.equal(win.state.fun.wagerBest, 2);
  const quiet = m.runCourse(win.state, 'recite', () => 0.7);
  assert.equal(quiet.state.fun.wagerStreak, 2, '不押注不打断连胜');
  const lost = m.runCourse(quiet.state, 'recite', () => 0, { stake: 4 });
  assert.equal(lost.state.fun.wagerStreak, 0);
  assert.ok(lost.state.fun.rollHistory.length >= 4);
});

test('导演转折：倒计时、到点插入、角色卡转折只用一次，并且可以关闭', async () => {
  const m = await load();
  let state = m.createRpgState('contract', names, { cardTwists: [{ id: 'note', text: '抽屉里多了一张旧照片。' }] });
  assert.equal(state.fun.tension.twists[0].text.includes('旧照片'), true);
  for (let i = 0; i < 3; i += 1) state = m.finishBeat(state, false);
  assert.equal(m.tensionCountdown(state.fun.tension), 3);
  state = m.finishBeat(state, false);
  assert.equal(m.tensionCountdown(state.fun.tension), 2);
  state = m.finishBeat(state, true);
  assert.equal(state.fun.tension.calm, 0);
  for (let i = 0; i < 5; i += 1) state = m.finishBeat(state, false);
  const fired = m.finishBeat(state, false);
  assert.ok(fired.pendingEvents.some((event) => event.includes('旧照片')));
  assert.equal(fired.fun.tension.twists[0].used, true);
  assert.equal(fired.fun.tension.calm, 0);
  const again = Array.from({ length: 6 }, () => false).reduce((current) => m.finishBeat(current, false), fired);
  assert.equal(again.pendingEvents.filter((event) => event.includes('旧照片')).length, 1);
  assert.ok(again.pendingEvents.some((event) => event.startsWith('导演转折：') && !event.includes('旧照片')));
  const off = m.setTensionEnabled(fired, false);
  const stayed = m.finishBeat(off, false);
  assert.equal(stayed.fun.tension.calm, 0);
});

test('称号按条件解锁，只能佩戴已解锁的；旧存档补上默认字段后天数还在', async () => {
  const m = await load();
  const state = m.createRpgState('contract', names);
  const rich = m.evaluateProgress({ ...state, points: 120, day: 14, trainee: { ...state.trainee, devotion: 80, shame: 20 }, traits: ['a', 'b', 'c'], counters: { ...state.counters, cleanDays: 7, courses: 10 }, fun: { ...state.fun, crits: 1, checks: 1, costly: 1, wagerBest: 3, twists: 1, planClears: 1, endingsSeen: ['a', 'b', 'c', 'd', 'e'] } });
  const unlocked = rich.state.fun.unlocked;
  for (const id of ['points_100', 'day_14', 'devotion_80', 'shame_open', 'traits_3', 'clean_week', 'courses_10', 'first_crit', 'wager_streak', 'twist_1', 'plan_clear', 'endings_5']) {
    assert.ok(unlocked.includes(id), id);
  }
  const worn = m.equipRpgTitle(rich.state, 'clean_week');
  assert.match(m.buildRpgPrompt(worn, names), /当前称号：守规的人/);
  assert.equal(m.equipRpgTitle(state, 'clean_week').fun.equipped, null);
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const legacy = { ...state, version: 4, fun: undefined, pendingWager: { dc: 12 }, marks: ['补考过关者'] };
  delete legacy.fun;
  storage.set(`ycy_tavern_rpg_${state.runId}`, JSON.stringify(legacy));
  const loaded = m.loadRpgState(state.runId);
  assert.equal(loaded.day, state.day);
  assert.equal(loaded.points, state.points);
  assert.equal(loaded.currentId, state.currentId);
  assert.equal(loaded.fun.tension.enabled, true);
  assert.deepEqual(loaded.fun.unlocked, []);
  delete globalThis.localStorage;
});
