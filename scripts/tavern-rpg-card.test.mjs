import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** 角色卡驱动课题：身份来自卡字段，节奏不能盖过人格；切卡不能把 A 的进度写进 B。 */

const load = async () => {
  const entryPoint = fileURLToPath(new URL('../src/core/tavern/tavernRpg.ts', import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const lin = {
  id: 'card-lin',
  name: '林夏',
  description: '在旧书店值夜班的人，习惯把话放得很轻。',
  personality: '说话慢，先问你累不累，只用短句。',
  scenario: '雨天的旧书店后间，约好一起整理书架。',
  mesExamples: '林夏：先坐下。水还热。',
};
const zhou = {
  id: 'card-zhou',
  name: '周衡',
  description: '档案室的值班员，只认编号和完成情况。',
  personality: '只说结论，点名，不说多余的安慰。',
  scenario: '清晨的档案室，桌上只有编号和当天清单。',
  firstMessage: '周衡：报编号，然后开始。',
};

test('两张卡在同一节奏下，课题、评价和次日仍各自引用自己的卡', async () => {
  const m = await load();
  const names = { char: '训练者', user: '学徒' };
  const linVoice = m.readCardVoice(lin, 'new-game');
  const zhouVoice = m.readCardVoice(zhou, 'new-game');
  const linState = m.createRpgState('contract', names, { trainerStyle: 'strict', cardVoice: linVoice });
  const zhouState = m.createRpgState('contract', names, { trainerStyle: 'strict', cardVoice: zhouVoice });

  assert.equal(linState.guidance.style, zhouState.guidance.style);
  assert.match(linState.guidance.assignment.title, /林夏/);
  assert.match(linState.guidance.assignment.title, /说话慢/);
  assert.match(zhouState.guidance.assignment.title, /周衡/);
  assert.match(zhouState.guidance.assignment.title, /只说结论/);
  assert.doesNotMatch(linState.guidance.assignment.title, /周衡|只说结论/);
  assert.doesNotMatch(zhouState.guidance.assignment.title, /林夏|说话慢/);
  assert.match(linState.guidance.assignment.steps.find((step) => step.id === 'practice').detail, /旧书店/);
  assert.match(zhouState.guidance.assignment.steps.find((step) => step.id === 'practice').detail, /档案室/);
  assert.match(linState.premise, /旧书店/);
  assert.doesNotMatch(linState.premise, /档案室/);

  const linPrompt = m.buildRpgPrompt(linState, names);
  const zhouPrompt = m.buildRpgPrompt(zhouState, names);
  assert.match(linPrompt, /说话慢，先问你累不累/);
  assert.match(zhouPrompt, /只说结论，点名/);
  assert.match(linPrompt, /执行节奏/);
  assert.doesNotMatch(linPrompt, /只说结论/);
  assert.match(linPrompt, /身份以这些字段为准|身份、口气和关系以角色卡字段为准/);

  const linDeclined = m.applyGuidanceAction(linState, { type: 'decline' });
  const zhouDeclined = m.applyGuidanceAction(zhouState, { type: 'decline' });
  assert.match(linDeclined.state.guidance.memory.map((entry) => entry.text).join('\n'), /林夏：说话慢/);
  assert.match(zhouDeclined.state.guidance.memory.map((entry) => entry.text).join('\n'), /周衡：只说结论/);
  assert.doesNotMatch(linDeclined.message, /说话慢|只说结论|旧书店|档案室/);

  const linReported = m.applyGuidanceAction(linDeclined.state, { type: 'report', report: 'honest' });
  const home = linReported.state.locations.find((loc) => loc.services.includes('rest'));
  const nextDay = m.restUntilMorning({ ...linReported.state, currentId: home.id }, () => 0);
  assert.match(nextDay.state.guidance.assignment.title, /林夏/);
  assert.match(nextDay.state.guidance.assignment.title, /说话慢|昨天你说了实话/);
  assert.doesNotMatch(nextDay.state.guidance.assignment.title, /周衡|只说结论/);
  assert.equal(nextDay.state.day, 2);
});

test('缺字段时不编造人格，也不把节奏名称写成角色性格', async () => {
  const m = await load();
  const voice = m.readCardVoice({ id: 'blank', name: '阿宁' }, 'new-game');
  assert.deepEqual(voice.present, []);
  const state = m.createRpgState('contract', { char: '阿宁', user: '学徒' }, { trainerStyle: 'strict', cardVoice: voice });
  assert.match(state.guidance.assignment.title, /没有填写人格/);
  assert.doesNotMatch(state.guidance.assignment.title, /日程教官/);
  const prompt = m.buildRpgPrompt(state, { char: '阿宁', user: '学徒' });
  assert.match(prompt, /人格：这张卡没有填写/);
  assert.match(prompt, /不要用训练节奏的名称代替人格/);
  assert.match(prompt, /执行节奏（只决定松紧，不覆盖身份）：日程教官/);
});

test('旧档补上当前卡时不改天数和地点，也不能把进度搬到另一张卡', async () => {
  const m = await load();
  const names = { char: '林夏', user: '学徒' };
  const created = m.createRpgState('contract', names, { trainerStyle: 'gentle' });
  const legacy = m.normalizeRpgState({ ...created, version: 4, day: 9, points: 44, guidance: { ...created.guidance, voice: undefined } });
  assert.equal(legacy.guidance.voice, undefined);
  assert.equal(legacy.day, 9);
  assert.equal(legacy.points, 44);
  const bound = m.bindMissingCardVoice(legacy, m.readCardVoice(lin, 'continue'));
  assert.equal(bound.day, 9);
  assert.equal(bound.points, 44);
  assert.equal(bound.currentId, legacy.currentId);
  assert.equal(bound.guidance.voice.cardId, 'card-lin');
  assert.equal(bound.guidance.voice.source, 'continue');
  const kept = m.bindMissingCardVoice(bound, m.readCardVoice(zhou, 'continue'));
  assert.equal(kept.guidance.voice.cardId, 'card-lin');
  const refused = m.adoptCardVoice(bound, m.readCardVoice(zhou, 'card-edit'));
  assert.equal(refused.guidance.voice.cardId, 'card-lin');
  assert.equal(refused.day, 9);

  const edited = m.readCardVoice({ ...lin, personality: '先问你今天想不想说话。' }, 'card-edit');
  assert.equal(m.cardVoiceDrift(bound.guidance.voice, edited), true);
  const adopted = m.adoptCardVoice(bound, edited);
  assert.equal(adopted.day, 9);
  assert.equal(adopted.points, 44);
  assert.match(adopted.guidance.assignment.title, /先问你今天想不想说话/);
  assert.equal(adopted.guidance.assignment.placeId, bound.guidance.assignment.placeId);
  assert.equal(adopted.guidance.assignment.steps[0].status, bound.guidance.assignment.steps[0].status);

  const snapshotted = m.rememberSnapshot(adopted, 'msg-1');
  snapshotted.guidance = { ...snapshotted.guidance, trust: 3 };
  const restored = m.restoreSnapshot(snapshotted, 'msg-1');
  assert.equal(restored.day, 9);
  assert.equal(restored.guidance.voice.cardId, 'card-lin');
  assert.match(restored.guidance.voice.personality, /先问你今天想不想说话/);
  assert.notEqual(restored.guidance.trust, 3);
});

test('切卡后丢弃上一张卡的内存，拒绝把 A 的进度写到 B', async () => {
  const m = await load();
  const names = { char: '训练者', user: '学徒' };
  const stateA = m.createRpgState('contract', names, { cardVoice: m.readCardVoice(lin, 'new-game') });
  const stateB = { ...m.createRpgState('contract', names, { cardVoice: m.readCardVoice(zhou, 'new-game') }), day: 6, points: 70 };
  const disk = new Map([['card-lin', stateA], ['card-zhou', stateB]]);
  const active = 'card-zhou';
  const switched = m.rpgStateAfterCardSwitch({
    previousCardId: 'card-lin',
    nextCardId: active,
    inMemory: { ...stateA, day: 4, points: 15 },
    load: (id) => disk.get(id) ?? null,
  });
  assert.equal(switched.discardedInMemory, true);
  assert.equal(switched.state.day, 6);
  assert.equal(switched.state.points, 70);
  assert.match(switched.state.guidance.voice.name, /周衡/);
  if (m.acceptRpgWrite('card-lin', active)) disk.set(active, stateA);
  assert.equal(disk.get('card-zhou').day, 6);
  assert.equal(disk.get('card-lin').day, 1);
  assert.equal(m.acceptRpgWrite('card-zhou', active), true);
  const sameCard = m.rpgStateAfterCardSwitch({
    previousCardId: 'card-zhou',
    nextCardId: 'card-zhou',
    inMemory: stateB,
    load: (id) => disk.get(id) ?? null,
  });
  assert.equal(sameCard.discardedInMemory, false);
  assert.equal(sameCard.state, stateB);
});
