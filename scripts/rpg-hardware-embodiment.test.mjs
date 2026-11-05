import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const loadBundledModule = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const load = () => loadBundledModule('../src/core/tavern/tavernRpg.ts');
const names = { char: '莉莉丝', user: '小猫' };

test('硬件设置：支持家规惩罚、超时传唤惩罚、差事微震档位与具身挑战开关，值经过校验限幅', async () => {
  const m = await load();
  const state = m.createRpgState('contract', names);

  // 默认值检查
  assert.equal(state.hardware.punishOnFail, false);
  assert.equal(state.hardware.rewardOnSuccess, false);
  assert.equal(state.hardware.punishOnViolation, false);
  assert.equal(state.hardware.punishOnSummonOverdue, false);
  assert.equal(state.hardware.wearToyOnErrands, false);
  assert.equal(state.hardware.wearToyLevel, 2);
  assert.equal(state.hardware.sensorChallengesEnabled, true);

  // 归一化与限幅校验
  const normalized = m.normalizeRpgState({
    ...state,
    hardware: {
      punishOnViolation: true,
      punishOnSummonOverdue: true,
      wearToyOnErrands: true,
      wearToyLevel: 99, // 应该被限幅到 5
      sensorChallengesEnabled: false,
    },
  });

  assert.equal(normalized.hardware.punishOnViolation, true);
  assert.equal(normalized.hardware.punishOnSummonOverdue, true);
  assert.equal(normalized.hardware.wearToyOnErrands, true);
  assert.equal(normalized.hardware.wearToyLevel, 5);
  assert.equal(normalized.hardware.sensorChallengesEnabled, false);
});

test('具身挑战课程：括约肌耐力保持与心率自律课程具备正确的感应指标配置', async () => {
  const m = await load();
  const pelvic = m.getCourse('pelvic_endurance');
  assert.ok(pelvic, '包含 pelvic_endurance 课程');
  assert.equal(pelvic.sensorChallenge?.type, 'pressure');
  assert.equal(pelvic.sensorChallenge?.targetValue, 25);
  assert.equal(pelvic.sensorChallenge?.durationSeconds, 10);
  assert.ok(pelvic.kinds.includes('playroom'));

  const heart = m.getCourse('heart_calm');
  assert.ok(heart, '包含 heart_calm 课程');
  assert.equal(heart.sensorChallenge?.type, 'heart_rate');
  assert.equal(heart.sensorChallenge?.targetValue, 95);
  assert.equal(heart.sensorChallenge?.durationSeconds, 10);
  assert.ok(heart.kinds.includes('playroom'));
});

test('具身挑战算法：evaluateSensorChallenge 正确判定压力维持与心率自律', async () => {
  const m = await load();
  const pressureChallenge = {
    type: 'pressure',
    targetValue: 25,
    durationSeconds: 10,
    label: '压力测试',
    instruction: '',
  };

  assert.equal(m.evaluateSensorChallenge(pressureChallenge, 24.9), false, '低于 25 kPa 不达标');
  assert.equal(m.evaluateSensorChallenge(pressureChallenge, 25.0), true, '达到 25 kPa 达标');
  assert.equal(m.evaluateSensorChallenge(pressureChallenge, 40.2), true, '超过 25 kPa 达标');

  const hrChallenge = {
    type: 'heart_rate',
    targetValue: 95,
    durationSeconds: 10,
    label: '心率自律',
    instruction: '',
  };

  assert.equal(m.evaluateSensorChallenge(hrChallenge, 0), false, '无心率数据不达标');
  assert.equal(m.evaluateSensorChallenge(hrChallenge, 75), true, '75 bpm 平稳达标');
  assert.equal(m.evaluateSensorChallenge(hrChallenge, 95), true, '95 bpm 临界达标');
  assert.equal(m.evaluateSensorChallenge(hrChallenge, 110), false, '110 bpm 心率过快未达标');
});

test('课程具身判定接入：runCourse 支持 challengePassed 显式注入与判定反馈', async () => {
  const m = await load();
  let state = m.createRpgState('contract', names);
  // 解锁课程所需属性（endurance level 1 要求 >= 20）
  state = { ...state, trainee: { ...state.trainee, endurance: 25 } };
  // 移动到训练室
  const playroom = state.locations.find((l) => l.name === '地下室') || state.locations.find((l) => l.kind === 'playroom');
  state = m.travelTo(state, playroom.id).state;

  // 1. 模拟具身挑战成功
  const passResult = m.runCourse(state, 'pelvic_endurance', () => 0.1, { challengePassed: true });
  assert.ok(passResult.check?.success, '具身挑战成功时检定必定通过');
  assert.match(passResult.message, /具身硬件挑战：达成目标/);

  // 2. 模拟具身挑战失败
  const failResult = m.runCourse(state, 'pelvic_endurance', () => 0.99, { challengePassed: false });
  assert.equal(failResult.check?.success, false, '具身挑战失败时检定必定不通过');
  assert.match(failResult.message, /具身硬件挑战：未达标/);
});

test('传唤过期检测：countNewlyExpiredSummons 精确捕捉新过期的传唤并触发硬件惩罚预备', async () => {
  const m = await load();
  let state = m.createRpgState('contract', names);

  // 构造一个在白天截止的传唤
  const summonQuest = {
    title: '到训练室报到',
    objective: '白天结束前到训练室',
    status: 'active',
    target: 'loc_playroom',
    deadline: { day: 1, period: 1 },
  };

  const before = {
    ...state,
    quests: [summonQuest, ...state.quests],
    day: 1,
    period: 1,
  };

  // 尚未超时（处于 deadline 时段内）
  const activeNext = m.expireSummons(before);
  assert.equal(m.countNewlyExpiredSummons(before, activeNext), 0, '未超时不计入');

  // 时间推进到黄昏（period 2），传唤过期
  const advanced = {
    ...before,
    period: 2,
  };
  const expiredNext = m.expireSummons(advanced);
  assert.equal(m.countNewlyExpiredSummons(before, expiredNext), 1, '新过期传唤被精准检测到');

  // 已经过期的传唤再次检测不重复计入
  assert.equal(m.countNewlyExpiredSummons(expiredNext, expiredNext), 0, '已过期不重复计入');
});

test('家规违规判定增量：AI 回复应用后违规差值可作为硬件惩罚触发依据', async () => {
  const m = await load();
  const state = m.createRpgState('contract', names);
  const beforeViolations = state.today.violations;

  // AI 判定违规（按 1-based 序号引用第 1 条家规）
  const replyWithViolation = '<!--RPG:{"rules":{"violated":[1]}}-->';
  const applied = m.applyRpgUpdate(state, m.parseRpgUpdate(replyWithViolation));
  const diff = applied.state.today.violations - beforeViolations;

  assert.equal(diff, 1, '产生 1 次违规增量');
  assert.ok(applied.notes.some((n) => n.text.includes('违反家规')));
});
