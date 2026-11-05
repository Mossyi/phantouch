import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * 训练日程扩展测试：
 * Feature 2: 天气系统 + 连续支线奇遇事件链
 * Feature 3: 14 多分支结局树 + 二周目继承与身份反转模式
 * Feature 4: 训练手账回忆画廊 + 结业证书典藏
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

const load = () => loadBundledModule('../src/core/tavern/tavernRpg.ts');
const names = { char: '伊芙琳', user: '玩家' };

test('天气系统：天气抽取、差事天气加成与限制、天气对课程减压与依恋影响', async () => {
  const m = await load();
  // 1. rollWeather 概率覆盖
  const wClear = m.rollWeather(() => 0.1);
  const wRain = m.rollWeather(() => 0.5);
  const wSnow = m.rollWeather(() => 0.75);
  const wFog = m.rollWeather(() => 0.9);
  assert.equal(wClear, 'clear');
  assert.equal(wRain, 'rain');
  assert.equal(wSnow, 'snow');
  assert.equal(wFog, 'fog');

  // 2. 晴朗天气差事收益 +20%
  let state = m.createRpgState('contract', names);
  // 走至差事地点（例如商业街或工坊）
  const workLoc = state.locations.find((l) => l.services.includes('work'));
  if (workLoc) {
    state = { ...state, currentId: workLoc.id, weather: 'clear', stamina: 100, points: 0 };
    const workResult = m.doWork(state);
    const expectedPay = Math.ceil(workLoc.pay * 1.2);
    assert.equal(workResult.state.points, expectedPay);
    assert.match(workResult.message, /晴朗收益 \+20%/);

    // 暴雨天气户外差事被拦截
    const outdoorLoc = { ...workLoc, kind: 'outdoor' };
    let rainState = { ...state, locations: state.locations.map((l) => (l.id === workLoc.id ? outdoorLoc : l)), weather: 'rain' };
    const rainBlocked = m.doWork(rainState);
    assert.match(rainBlocked.error, /暴雨倾盆，户外差事已暂停/);
  }

  // 3. 暴雨天气室内温存课程依恋额外提升
  let homeState = { ...state, weather: 'rain', currentId: state.homeId, trainee: { ...state.trainee, devotion: 20 } };
  const reciteEntry = m.getCoursesHere(homeState).find((e) => e.course.id === 'recite');
  if (reciteEntry) {
    const runRes = m.runCourse(homeState, 'recite', () => 0.95);
    // 基础 recite 获得服从 +3，暴雨在居所额外温存依恋 +1 -> 从 20 变为 21
    assert.equal(runRes.state.trainee.devotion, 21);
  }

  // 4. 大雪天气温浴/安抚额外减压 5 点
  let snowState = { ...state, weather: 'snow', currentId: state.homeId, stress: 50 };
  const aftercareEntry = m.getCoursesHere(snowState).find((e) => e.course.id === 'aftercare');
  if (aftercareEntry) {
    const aftercareRes = m.runCourse(snowState, 'aftercare', () => 0.95);
    // 基础 aftercare 压力 -20，大雪额外 -5 -> 压力减少 25
    assert.equal(aftercareRes.state.stress, 25);
  }
});

test('连续支线奇遇事件链：失落的日记、雪见暖汤三部曲推进与判定', async () => {
  const m = await load();

  // 1. 失落的日记：第 2 天在卧室触发 step 0
  const step0 = m.findAvailableChainStep('bedroom', 'clear', {}, { obedience: 10, endurance: 10, shame: 70, devotion: 10 }, 0, 0, 2);
  assert.ok(step0);
  assert.equal(step0.chainId, 'lost_diary');
  assert.equal(step0.step, 0);
  assert.equal(step0.nextStep, 1);

  // 2. step 1 在工作/商业区触发
  const step1 = m.findAvailableChainStep('work', 'clear', { lost_diary: 1 }, { obedience: 10, endurance: 10, shame: 70, devotion: 10 }, 0, 0, 3);
  assert.ok(step1);
  assert.equal(step1.step, 1);

  // 3. 雪见暖汤：必须在 snow 天气且在户外/浴场触发
  const snowStep0Clear = m.findAvailableChainStep('outdoor', 'clear', {}, { obedience: 10, endurance: 10, shame: 70, devotion: 10 }, 0, 0, 2);
  assert.equal(snowStep0Clear, null); // 晴天不触发

  const snowStep0Snow = m.findAvailableChainStep('outdoor', 'snow', {}, { obedience: 10, endurance: 10, shame: 70, devotion: 10 }, 0, 0, 2);
  assert.ok(snowStep0Snow);
  assert.equal(snowStep0Snow.chainId, 'snow_warmth');
});

test('14 多分支结局树：奇遇结局、模式结局与经典结局全分支判定', async () => {
  const m = await load();

  // 1. 失落的日记共犯结局 (Rank S)
  const diaryEnding = m.computeDetailedEnding(
    { obedience: 50, endurance: 50, shame: 50, devotion: 75 },
    [],
    { eventChains: { lost_diary: 3 }, day: 30 }
  );
  assert.equal(diaryEnding.id, 'secret_sharer');
  assert.equal(diaryEnding.title, '共享秘密的共犯');
  assert.equal(diaryEnding.rank, 'S');

  // 2. 身份反转模式结局 (Rank S)
  const reversalEnding = m.computeDetailedEnding(
    { obedience: 50, endurance: 50, shame: 50, devotion: 50 },
    [],
    { gameMode: 'reversal', day: 30 }
  );
  assert.equal(reversalEnding.id, 'reversal_trainer');
  assert.equal(reversalEnding.title, '逆位执鞭者');
  assert.equal(reversalEnding.rank, 'S');

  // 3. 硬核模式通关结局 (Rank S)
  const hardcoreEnding = m.computeDetailedEnding(
    { obedience: 70, endurance: 70, shame: 30, devotion: 70 }, // 阶段 3+
    [],
    { gameMode: 'hardcore', day: 30 }
  );
  assert.equal(hardcoreEnding.id, 'steel_survivor');
  assert.equal(hardcoreEnding.title, '严苛试炼的幸存者');
  assert.equal(hardcoreEnding.rank, 'S');

  // 4. 雪见暖汤温情避风港结局 (Rank A)
  const snowEnding = m.computeDetailedEnding(
    { obedience: 50, endurance: 50, shame: 50, devotion: 68 },
    [],
    { eventChains: { snow_warmth: 3 }, day: 30 }
  );
  assert.equal(snowEnding.id, 'winter_haven');
  assert.equal(snowEnding.title, '狂风暴雨的避风港');

  // 5. 永恒续约契约结局 (Rank S)
  const eternalEnding = m.computeDetailedEnding(
    { obedience: 50, endurance: 50, shame: 50, devotion: 50 },
    [],
    { renewCount: 2, day: 60 }
  );
  assert.equal(eternalEnding.id, 'eternal_contract');
  assert.equal(eternalEnding.title, '永恒续约契约');

  // 6. 经典原版四维主导结局
  const obedientEnding = m.computeDetailedEnding({ obedience: 75, endurance: 30, shame: 50, devotion: 30 }, []);
  assert.equal(obedientEnding.title, '模范学徒');

  const enduranceEnding = m.computeDetailedEnding({ obedience: 30, endurance: 75, shame: 50, devotion: 30 }, []);
  assert.equal(enduranceEnding.title, '坚韧的伙伴');

  const shameEnding = m.computeDetailedEnding({ obedience: 30, endurance: 30, shame: 20, devotion: 30 }, []); // shame 20 -> effective 80
  assert.equal(shameEnding.title, '放下了矜持');

  const devotionEnding = m.computeDetailedEnding({ obedience: 30, endurance: 30, shame: 50, devotion: 75 }, []);
  assert.equal(devotionEnding.title, '离不开的人');
});

test('二周目继承 (New Game+)：特质继承、积分 30% 继承、硬核与反转模式启动', async () => {
  const m = await load();

  // 1. 继承特质与积分
  const ngpState = m.createRpgState('contract', names, {
    inheritedTraits: ['disciplined'],
    inheritedPoints: 60, // 上周目 200 积分的 30%
    gameMode: 'hardcore',
  });
  assert.ok(ngpState.traits.includes('disciplined'));
  assert.equal(ngpState.points, 20 + 60); // 基础 20 + 继承 60
  assert.equal(ngpState.gameMode, 'hardcore');
  assert.equal(ngpState.stamina, 80); // 硬核模式体力上限 80

  // 2. 身份反转模式提示词构建测试
  const reversalState = m.createRpgState('contract', names, { gameMode: 'reversal' });
  assert.equal(reversalState.gameMode, 'reversal');
  const prompt = m.buildRpgPrompt(reversalState, names);
  assert.match(prompt, /身份反转模式/);
  assert.match(prompt, /天气：/);
});
