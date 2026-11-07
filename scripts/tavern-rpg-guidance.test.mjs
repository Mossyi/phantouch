import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** 调教者课题：接受、拒绝、暂停和界限只改虚构进度，旧档迁移不能丢天数和属性。 */

const loadBundledModule = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const load = () => loadBundledModule('../src/core/tavern/tavernRpg.ts');
const names = { char: '莉莉丝', user: '小猫' };
const practice = (state) => state.guidance.assignment.steps.find((step) => step.id === 'practice');

test('开局由调教者布置课题；风格可选；身份反转不会启动', async () => {
  const m = await load();
  const gentle = m.createRpgState('contract', names, { trainerStyle: 'gentle' });
  assert.equal(gentle.version, 5);
  assert.equal(gentle.guidance.style, 'gentle');
  assert.equal(gentle.guidance.assignment.placeName, '卧室');
  assert.equal(gentle.guidance.assignment.steps.length, 3);
  assert.equal(gentle.hardware.punishOnFail, false);

  const strict = m.createRpgState('contract', names, { trainerStyle: 'strict' });
  assert.equal(strict.guidance.style, 'strict');
  assert.equal(strict.guidance.assignment.placeName, '客厅');
  const prompt = m.buildRpgPrompt(strict, names);
  assert.match(prompt, /日程教官/);
  assert.match(prompt, /不得把拒绝写成同意/);
  assert.doesNotMatch(prompt, /身份反转模式/);

  const retired = m.createRpgState('contract', names, { gameMode: 'reversal' });
  assert.equal(retired.gameMode, 'normal');
  assert.match(m.buildRpgPrompt(retired, names), /接受训练的一方/);
});

test('报到、拒绝和交代会留下信任，拒绝不是违规，消息不含硬件世界书触发词', async () => {
  const m = await load();
  const state = m.createRpgState('contract', names);
  const violations = state.rules[0].violations;
  const arrived = m.applyGuidanceAction(state, { type: 'arrive' });
  assert.equal(arrived.error, undefined);
  assert.equal(arrived.state.guidance.assignment.steps[0].status, 'done');
  assert.equal(arrived.state.guidance.trust, state.guidance.trust + 1);
  assert.match(arrived.message, /报到/);

  const declined = m.applyGuidanceAction({ ...arrived.state, stress: 20 }, { type: 'decline' });
  assert.equal(practice(declined.state).status, 'declined');
  assert.equal(declined.state.guidance.trust, arrived.state.guidance.trust + 3);
  assert.equal(declined.state.stress, 16);
  assert.equal(declined.state.rules[0].violations, violations);
  assert.equal(declined.state.today.violations, 0);
  assert.doesNotMatch(declined.message, /我拒绝|反抗|惩罚|电击|轻一点/);

  const reported = m.applyGuidanceAction(declined.state, { type: 'report', report: 'honest' });
  assert.equal(reported.state.guidance.lastReport, 'honest');
  assert.equal(reported.state.guidance.assignment.steps.find((step) => step.id === 'report').status, 'done');
  assert.ok(reported.state.guidance.memory.some((entry) => entry.text.includes('如实交代')));
  assert.equal(reported.state.hardware.punishOnViolation, false);
});

test('暂停挡住新练习，公开场合界限挡住课程，信任和家规计数不变成惩罚', async () => {
  const m = await load();
  let state = m.createRpgState('contract', names);
  const paused = m.applyGuidanceAction(state, { type: 'pause' });
  assert.equal(paused.state.guidance.boundaries.paused, true);
  assert.equal(paused.state.rules[0].violations, 0);
  const blocked = m.runCourse(paused.state, 'recite');
  assert.match(blocked.error, /暂停/);
  assert.equal(blocked.state, paused.state);

  state = m.applyGuidanceAction(state, { type: 'boundary', key: 'noPublic', value: true }).state;
  assert.match(m.courseRefusal(state.guidance, { name: '外出', stamina: 10 }, 'outdoor'), /不在有别人/);
  assert.equal(m.courseRefusal(state.guidance, { name: '规矩复述', stamina: 4 }, 'bedroom'), null);
  const heavy = m.applyGuidanceAction(state, { type: 'boundary', key: 'noEscalation', value: true }).state;
  assert.match(m.courseRefusal(heavy.guidance, { name: '耐力保持', stamina: 20 }, 'playroom'), /不要再加码/);
});

test('休息后按昨天的交代生成新课题；旧版本 4 存档保留进度并改回由调教者训练', async () => {
  const m = await load();
  let state = m.createRpgState('contract', names, { trainerStyle: 'observer' });
  state = m.applyGuidanceAction(state, { type: 'decline' }).state;
  state = m.applyGuidanceAction(state, { type: 'report', report: 'polished' }).state;
  const home = state.locations.find((loc) => loc.services.includes('rest'));
  state = { ...state, currentId: home.id };
  const rested = m.restUntilMorning(state, () => 0.1);
  assert.equal(rested.state.day, 2);
  assert.equal(rested.state.guidance.boundaries.paused, false);
  assert.equal(rested.state.guidance.trust, state.guidance.trust);
  assert.match(rested.state.guidance.assignment.title, /说得比较好听/);

  const legacy = {
    ...m.createRpgState('contract', names),
    version: 4,
    gameMode: 'reversal',
    day: 12,
    points: 80,
    trainee: { obedience: 33, endurance: 21, shame: 60, devotion: 40 },
    guidance: undefined,
  };
  const loaded = m.normalizeRpgState(legacy);
  assert.equal(loaded.version, 5);
  assert.equal(loaded.gameMode, 'normal');
  assert.equal(loaded.day, 12);
  assert.equal(loaded.points, 80);
  assert.deepEqual(loaded.trainee, legacy.trainee);
  assert.equal(loaded.locations.length, legacy.locations.length);
  assert.equal(loaded.guidance.trust, 40);
  assert.equal(loaded.guidance.memory.filter((entry) => entry.text.includes('身份反转')).length, 1);
  const again = m.normalizeRpgState(loaded);
  assert.equal(again.guidance.memory.filter((entry) => entry.text.includes('身份反转')).length, 1);
  assert.equal(again.day, 12);
  assert.equal(m.normalizeRpgState({ version: 3, locations: [{ id: 'a' }] }), null);
});
