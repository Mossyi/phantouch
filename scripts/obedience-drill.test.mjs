import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** 语音服从训练：复述计分、连续失败逐级惩罚、超时、中止与统计 */

const loadBundledModule = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const load = () => loadBundledModule('../src/core/discipline/obedienceDrill.ts');

test('复述计分：忽略标点空白；错字按比例扣分；反应越慢系数越低', async () => {
  const { scoreRecitation } = await load();
  assert.equal(scoreRecitation('是，莉莉丝。', '是 莉莉丝', 800).score, 100);
  assert.equal(scoreRecitation('我会乖乖的。', '我会乖乖的', 1500).score, 100);
  const typo = scoreRecitation('我会乖乖的。', '我会乖乖地', 800);
  assert.equal(typo.accuracy, 80, '5 个字错 1 个');
  assert.equal(scoreRecitation('我会乖乖的。', '今天天气不错', 800).accuracy < 30, true);
  assert.equal(scoreRecitation('我听话。', '我听话', 5000).speedFactor, 0.6);
  assert.equal(scoreRecitation('我听话。', '我听话', 3250).speedFactor, 0.8);
  assert.equal(scoreRecitation('我听话。', '我听话', null).speedFactor, 1, '无法测反应时间时不扣分');
  assert.equal(scoreRecitation('我听话。', '我听话我听话我听话', 800).accuracy < 50, true, '多说也扣分');
});

test('口令生成：替换角色名与称呼，按轮数循环；自定义口令为空时不生成', async () => {
  const { buildDrillCommands } = await load();
  const commands = buildDrillCommands({ rounds: 12, difficulty: 'intermediate', customPhrases: [] }, { char: '莉莉丝', user: '小猫' }, () => 0.3);
  assert.equal(commands.length, 12);
  assert.ok(commands.every((command) => !command.includes('{{')), commands.join('|'));
  assert.ok(commands.some((command) => command.includes('莉莉丝')));
  const custom = buildDrillCommands({ rounds: 3, difficulty: 'custom', customPhrases: ['  第一句  ', '', '第二句'] }, { char: 'A', user: 'B' });
  assert.equal(custom.length, 3);
  assert.ok(custom.every((phrase) => phrase === '第一句' || phrase === '第二句'), '自定义口令去掉首尾空白，空行忽略');
  assert.ok(custom.includes('第一句') && custom.includes('第二句'));
  assert.equal(buildDrillCommands({ rounds: 5, difficulty: 'custom', customPhrases: [' '] }, { char: 'A', user: 'B' }).length, 0);
});

const makeDeps = (answers) => {
  const log = { spoken: [], punish: [], rewards: 0, stops: 0 };
  let index = 0;
  return {
    log,
    deps: {
      speak: async (text) => { log.spoken.push(text); },
      listen: async () => answers[index++] ?? null,
      punish: async (level, seconds) => { log.punish.push([level, seconds]); },
      reward: async () => { log.rewards += 1; },
      stopOutputs: () => { log.stops += 1; },
    },
  };
};

const config = (overrides = {}) => ({
  rounds: 4,
  difficulty: 'beginner',
  customPhrases: [],
  hideText: false,
  passScore: 70,
  answerTimeoutMs: 8000,
  consequences: { punishOnFail: true, punishStartLevel: 10, punishMaxLevel: 25, punishStep: 5, punishSeconds: 2, rewardOnPass: true },
  ...overrides,
});

test('训练流程：通过给奖励；连续失败逐级加强惩罚且不超过上限；通过后惩罚回到起始档；超时算失败', async () => {
  const { ObedienceDrill, summarizeDrill } = await load();
  const commands = Array(6).fill('我会乖乖的。');
  const { deps, log } = makeDeps([
    { text: '我会乖乖的', responseMs: 900 },  // 通过
    { text: '我会好好的', responseMs: 900 },  // 60 分失败 1 → 10
    null,                                      // 超时 → 失败 2 → 15
    { text: '你好呀', responseMs: 900 },       // 失败 3，得分 <50 再加一档 → 30 封顶为 25
    { text: '我会乖乖的', responseMs: 900 },  // 通过，连败清零
    { text: '我会好好的', responseMs: 900 },  // 失败 1 → 回到 10
  ]);
  const drill = new ObedienceDrill(commands, config({ rounds: 6 }), deps);
  const results = await drill.run();
  assert.deepEqual(results.map((r) => r.passed), [true, false, false, false, true, false]);
  assert.equal(results[2].timedOut, true);
  assert.deepEqual(log.punish, [[10, 2], [15, 2], [25, 2], [10, 2]]);
  assert.equal(log.rewards, 2);
  assert.ok(log.spoken.includes('怎么不说话？') || log.spoken.some((line) => ['我在等你回答。', '太慢了。'].includes(line)), '超时有专门的反馈');
  assert.equal(drill.getSnapshot().phase, 'finished');
  assert.ok(log.stops >= 1, '结束时停止一切输出');
  const summary = summarizeDrill(results, 'beginner', drill.getSnapshot().bestStreak, 123);
  assert.equal(summary.passed, 2);
  assert.equal(summary.rounds, 6);
  assert.equal(summary.bestStreak, 1);
});

test('训练流程：未开启惩罚时失败也不触发任何硬件；中途停止立即收尾', async () => {
  const { ObedienceDrill } = await load();
  const { deps, log } = makeDeps([{ text: '错的', responseMs: 500 }, { text: '错的', responseMs: 500 }]);
  const quiet = new ObedienceDrill(['我听话。', '我听话。'], config({ consequences: { ...config().consequences, punishOnFail: false, rewardOnPass: false } }), deps);
  await quiet.run();
  assert.deepEqual(log.punish, []);
  assert.equal(log.rewards, 0);

  const slow = makeDeps([]);
  let release;
  slow.deps.listen = () => new Promise((resolve) => { release = resolve; });
  const drill = new ObedienceDrill(['一', '二', '三'], config(), slow.deps);
  const running = drill.run();
  await new Promise((resolve) => setTimeout(resolve, 5));
  drill.stop();
  release({ text: '一', responseMs: 100 });
  await running;
  assert.equal(drill.getSnapshot().phase, 'stopped');
  assert.equal(drill.getSnapshot().results.length, 0, '停止后不再计分');
  assert.deepEqual(slow.log.punish, []);
  assert.ok(slow.log.stops >= 1);
});

test('训练设置：读取时夹取非法值，惩罚默认关闭', async () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
  try {
    const { loadDrillSettings, saveDrillSettings, DEFAULT_DRILL_SETTINGS } = await load();
    assert.equal(loadDrillSettings().consequences.punishOnFail, false);
    saveDrillSettings({ ...DEFAULT_DRILL_SETTINGS, rounds: 999, difficulty: 'hack', consequences: { ...DEFAULT_DRILL_SETTINGS.consequences, punishMaxLevel: 9999, punishSeconds: 60 } });
    const loaded = loadDrillSettings();
    assert.equal(loaded.rounds, 10);
    assert.equal(loaded.difficulty, 'beginner');
    assert.equal(loaded.consequences.punishMaxLevel, 200);
    assert.equal(loaded.consequences.punishSeconds, 5);
  } finally {
    delete globalThis.localStorage;
  }
});
