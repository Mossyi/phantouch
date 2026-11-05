import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** 酒馆训练日程：用户是被调教者。地图、系统动作、训练属性检定、目标、免罚券、AI 标签解析与限幅、回滚、开关 */

const loadBundledModule = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const load = () => loadBundledModule('../src/core/tavern/tavernRpg.ts');
const names = { char: '莉莉丝', user: '小猫' };
const byName = (state, name) => state.locations.find((loc) => loc.name === name);

test('开局：用户从自己的卧室出发；训练属性属于用户；硬件奖惩默认关闭', async () => {
  const { createRpgState, getReachableLocations, getLocation } = await load();
  const state = createRpgState('contract', names);
  assert.equal(getLocation(state, state.currentId).name, '卧室');
  assert.deepEqual(getReachableLocations(state).map((loc) => loc.name).sort(), ['客厅', '浴室'].sort());
  assert.deepEqual(state.trainee, { obedience: 10, endurance: 10, shame: 60, devotion: 10 });
  assert.deepEqual([state.day, state.period, state.stamina, state.points], [1, 0, 100, 20]);
  assert.equal(state.hardware.punishOnFail, false);
  assert.equal(state.hardware.rewardOnSuccess, false);
  assert.match(state.premise, /小猫自愿和莉莉丝签下/);
  assert.ok(byName(state, '训练室').description.includes('莉莉丝'));

  const custom = createRpgState('custom', names, { startName: '阁楼', dayLimit: 7 });
  assert.deepEqual(custom.locations.map((loc) => loc.name), ['阁楼', '奖励柜']);
  assert.equal(custom.dayLimit, 7);
});

test('系统动作：相邻移动；积分兑换；差事耗体力和时段；休息恢复；用休息券回体力；免罚券不能手动用', async () => {
  const { createRpgState, travelTo, buyItem, doWork, restUntilMorning, itemUseAction } = await load();
  let state = createRpgState('contract', names);
  assert.match(travelTo(state, byName(state, '街区').id).error, /还没被发现/);
  state = travelTo(state, byName(state, '客厅').id).state;
  assert.match(restUntilMorning(state).error, /卧室/);

  assert.match(buyItem(state, '免罚券').error, /积分不够/);
  state = { ...state, points: 100, stamina: 50 };
  state = buyItem(state, '休息券').state;
  state = buyItem(state, '免罚券').state;
  assert.equal(state.points, 10);
  const used = itemUseAction(state, '休息券');
  assert.equal(used.state.stamina, 80);
  assert.equal(used.state.inventory.some((item) => item.name === '休息券'), false);
  assert.match(used.message, /休息券（体力 \+30）/);
  assert.match(itemUseAction(state, '免罚券').error, /自动使用/);

  state = travelTo(used.state, byName(used.state, '厨房').id).state;
  const worked = doWork(state);
  assert.deepEqual([worked.state.points, worked.state.stamina, worked.state.period], [25, 70, 1]);
  assert.match(doWork({ ...state, stamina: 5 }).error, /体力不够/);
  assert.match(doWork({ ...state, period: 3 }).error, /太晚/);

  const tired = { ...createRpgState('contract', names), stamina: 10, period: 3 };
  const rested = restUntilMorning(tired);
  assert.deepEqual([rested.state.day, rested.state.period, rested.state.stamina], [2, 0, 100]);
});

test('检定：用用户的训练属性做修正（30 为基准，羞耻反向），体力低 -2；20 必成、1 必败；免罚券失败时自动消耗', async () => {
  const { createRpgState, rollCheck, formatCheckResult, checkModifier, consumePardon, buyItem } = await load();
  const state = createRpgState('contract', names);
  assert.equal(checkModifier(state, 'obedience'), -2, '服从 10');
  assert.equal(checkModifier(state, 'shame'), 1, '羞耻 60 → 放得开 40');
  assert.equal(checkModifier({ ...state, trainee: { ...state.trainee, endurance: 70 } }, 'endurance'), 4);
  assert.equal(checkModifier({ ...state, stamina: 10 }, 'shame'), -1);
  const mid = rollCheck({ ...state, trainee: { ...state.trainee, endurance: 50 } }, { stat: 'endurance', dc: 12 }, () => 0.45);
  assert.deepEqual([mid.roll, mid.mod, mid.total, mid.success], [10, 2, 12, true]);
  assert.equal(rollCheck(state, { stat: 'obedience', dc: 25 }, () => 0.999).success, true);
  assert.equal(rollCheck(state, { stat: 'obedience', dc: 2 }, () => 0).success, false);
  assert.match(formatCheckResult(rollCheck(state, { stat: 'shame', dc: 10 }, () => 0.45)), /克服羞耻检定：d20=10 \+1 = 11 \/ 难度 10 · 成功/);

  assert.equal(consumePardon(state).used, false);
  let withPardon = { ...state, currentId: byName(state, '客厅').id, points: 200 };
  withPardon = buyItem(buyItem(withPardon, '免罚券').state, '免罚券').state;
  const once = consumePardon(withPardon);
  assert.equal(once.used, true);
  assert.equal(once.state.inventory.find((item) => item.name === '免罚券').qty, 1);
});

test('目标：按用户训练属性自动达成并发积分；已达成的不重复发', async () => {
  const { createRpgState, evaluateGoals } = await load();
  const state = createRpgState('contract', names);
  const first = evaluateGoals({ ...state, trainee: { obedience: 45, endurance: 10, shame: 25, devotion: 10 } });
  assert.deepEqual(first.completed.map((quest) => quest.title), ['学会规矩', '放下羞耻']);
  assert.equal(first.state.points, 20 + 40 + 60);
  assert.equal(evaluateGoals(first.state).completed.length, 0);
});

test('解析：训练属性增减、积分（兼容 gold）、容忍 +数值与尾逗号、截断标签；回应选项带检定', async () => {
  const { parseRpgUpdate, stripRpgTags } = await load();
  const reply = '「跪好。」她垂眸看着你。\n<!--RPG:{"train":{"obedience":+3,"忍耐":"+2","shame":"-2","unknown":5},"stamina":-12,"gold":+5,"discover":[{"name":"天台","kind":"阳台","dir":"北"}],"items":{"add":["发夹x2"]},"time":"+1","choices":[{"text":"乖乖跪好"},{"text":"坚持不动","check":"耐受:12"},"小声求饶|devotion:8",]}-->\n<!--STATUS:{"favor":"+1"}-->';
  const update = parseRpgUpdate(reply);
  assert.deepEqual(update.train, { obedience: 3, endurance: 2, shame: -2 });
  assert.equal(update.stamina, -12);
  assert.equal(update.points, 5);
  assert.equal(update.discover[0].kind, 'outdoor');
  assert.deepEqual(update.itemsAdd, [{ name: '发夹', qty: 2 }]);
  assert.deepEqual(update.choices.map((choice) => choice.check), [undefined, { stat: 'endurance', dc: 12 }, { stat: 'devotion', dc: 8 }]);
  assert.equal(stripRpgTags(reply).includes('RPG'), false);
  assert.ok(stripRpgTags(reply).includes('STATUS'));
  assert.equal(parseRpgUpdate('好。<!--RPG:{"points":-5,"choices":["走"]}').points, -5);
  assert.equal(stripRpgTags('好的。<!--RPG:{"points":-5', true), '好的。');
  assert.equal(stripRpgTags('好的。<!-', true), '好的。');
  assert.equal(parseRpgUpdate('没有标签'), null);
});

test('应用：训练属性单轮 ±8；体力、积分限幅且积分不为负；不相邻移动被拒；时间最多到深夜；系统目标不让 AI 改', async () => {
  const { createRpgState, applyRpgUpdate, parseRpgUpdate, getReachableLocations, getLocation } = await load();
  const state = { ...createRpgState('contract', names), period: 2, points: 10 };
  const { state: next, notes } = applyRpgUpdate(state, parseRpgUpdate('<!--RPG:{"train":{"obedience":"+50","shame":"-30"},"discover":[{"name":"阳台","kind":"outdoor","dir":"南"}],"move":"街区","stamina":"-99","points":"-99","items":{"remove":["魔杖"],"add":[{"name":"项圈"}]},"time":"+3","quests":[{"title":"学会规矩","status":"done"},{"title":"背诵家规","objective":"今晚前背熟"}],"choices":["跪好"]}-->'));
  assert.deepEqual([next.trainee.obedience, next.trainee.shame], [18, 52]);
  const balcony = byName(next, '阳台');
  assert.ok(getReachableLocations(next).includes(balcony));
  assert.deepEqual([balcony.x, balcony.y], [0, 1]);
  assert.equal(getLocation(next, next.currentId).name, '卧室', '街区不相邻');
  assert.equal(next.stamina, 60, '单轮最多 -40');
  assert.equal(next.points, 0, '最多扣 30，且不为负');
  assert.ok(next.inventory.some((item) => item.name === '项圈'));
  assert.ok(notes.some((n) => n.text.includes('魔杖')));
  assert.deepEqual([next.period, next.day], [3, 1]);
  assert.equal(next.quests.find((q) => q.title === '学会规矩').status, 'active');
  assert.ok(next.quests.some((q) => q.title === '背诵家规'));
});

test('回滚与存储校验；旧版存档不加载；开关默认关闭', async () => {
  const { createRpgState, applyRpgUpdate, parseRpgUpdate, rememberSnapshot, restoreSnapshot, normalizeRpgState, isRpgModeEnabled, setRpgModeEnabled } = await load();
  const state = rememberSnapshot(createRpgState('manor', names), 'msg_1');
  const changed = applyRpgUpdate(state, parseRpgUpdate('<!--RPG:{"stamina":"-20","points":"+10","train":{"obedience":"+5"}}-->')).state;
  const restored = restoreSnapshot(changed, 'msg_1');
  assert.deepEqual([restored.stamina, restored.points, restored.trainee.obedience], [100, 20, 10]);
  assert.equal(restoreSnapshot(restored, 'msg_1'), null);

  const loaded = normalizeRpgState(JSON.parse(JSON.stringify({ ...state, stamina: 500, trainee: { obedience: 999 }, hardware: { punishOnFail: true, punishLevel: 9999, punishSeconds: 60 } })));
  assert.equal(loaded.stamina, 100);
  assert.deepEqual(loaded.trainee, { obedience: 100, endurance: 10, shame: 60, devotion: 10 });
  assert.equal(loaded.hardware.punishLevel, 200);
  assert.equal(loaded.hardware.punishSeconds, 5);
  assert.equal(normalizeRpgState({ version: 2, locations: [{}] }), null);

  const storage = new Map();
  globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
  try {
    assert.equal(isRpgModeEnabled(), false);
    setRpgModeEnabled(true);
    assert.equal(isRpgModeEnabled(), true);
  } finally {
    delete globalThis.localStorage;
  }
});
