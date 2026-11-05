import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** 酒馆日程模式：地图、系统动作（移动/购物/打工/休息）、检定、目标判定、AI 标签解析与限幅、回滚、开关 */

const loadBundledModule = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const load = () => loadBundledModule('../src/core/tavern/tavernRpg.ts');
const names = { char: '莉莉丝', user: '小猫' };
const stats = (overrides = {}) => ({ favor: 30, obedience: 20, arousal: 0, shame: 40, ...overrides });
const byName = (state, name) => state.locations.find((loc) => loc.name === name);

test('开局：从卧室出发，相邻地点可见；没有生命值；硬件奖惩默认关闭', async () => {
  const { createRpgState, getReachableLocations, getLocation } = await load();
  const state = createRpgState('contract', names);
  assert.equal(getLocation(state, state.currentId).name, '卧室');
  assert.deepEqual(getReachableLocations(state).map((loc) => loc.name).sort(), ['客厅', '浴室'].sort());
  assert.equal(byName(state, '街区').discovered, false);
  assert.deepEqual([state.day, state.period, state.stamina, state.dayLimit], [1, 0, 100, 30]);
  assert.equal('hp' in state, false);
  assert.equal(state.hardware.punishOnFail, false);
  assert.equal(state.hardware.rewardOnSuccess, false);
  assert.ok(state.premise.includes('莉莉丝') && state.premise.includes('小猫'));

  const custom = createRpgState('custom', names, { startName: '阁楼', dayLimit: 7 });
  assert.equal(custom.locations.length, 1);
  assert.deepEqual(custom.locations[0].services, ['rest']);
  assert.equal(custom.dayLimit, 7);
});

test('系统动作：移动只能去相邻地点；购物扣钱进背包；打工推进时段；深夜不能打工；只能在卧室休息', async () => {
  const { createRpgState, travelTo, buyItem, doWork, restUntilMorning, itemUseAction } = await load();
  let state = createRpgState('contract', names);
  assert.match(travelTo(state, byName(state, '街区').id).error, /还没被发现/);
  const toLiving = travelTo(state, byName(state, '客厅').id);
  assert.equal(toLiving.message, '🧭 前往：客厅');
  state = toLiving.state;
  assert.match(restUntilMorning(state).error, /卧室/);
  state = travelTo(state, byName(state, '街区').id).state;
  state = travelTo(state, byName(state, '杂货店').id).state;

  assert.match(buyItem(state, '不存在').error, /买不到/);
  const bought = buyItem(state, '项圈');
  assert.equal(bought.state.gold, 75);
  assert.ok(bought.state.inventory.some((item) => item.name === '项圈'));
  assert.match(bought.message, /购买：项圈/);
  state = bought.state;
  assert.match(buyItem({ ...state, gold: 5 }, '新衣服').error, /金币不够/);
  assert.equal(itemUseAction(state, '项圈').message, '🧭 使用：项圈');
  assert.match(itemUseAction(state, '魔杖').error, /没有/);

  assert.match(doWork(state).error, /没有活/);
  state = travelTo(state, byName(state, '街区').id).state;
  state = travelTo(state, byName(state, '街角咖啡馆').id).state;
  const worked = doWork(state);
  assert.deepEqual([worked.state.gold, worked.state.period], [115, 1]);
  assert.match(doWork({ ...state, period: 3 }).error, /关门/);

  const tired = { ...createRpgState('contract', names), stamina: 10, period: 3 };
  const rested = restUntilMorning(tired);
  assert.deepEqual([rested.state.day, rested.state.period, rested.state.stamina], [2, 0, 100]);
  assert.match(rested.message, /第 1 天结束/);
});

test('检定：用角色状态栏属性做修正（50 为基准），体力低再 -2；20 必成、1 必败', async () => {
  const { createRpgState, rollCheck, formatCheckResult, checkModifier } = await load();
  const state = createRpgState('contract', names);
  assert.equal(checkModifier(state, stats({ obedience: 70 }), 'obedience'), 2);
  assert.equal(checkModifier({ ...state, stamina: 10 }, stats({ obedience: 70 }), 'obedience'), 0);
  const mid = rollCheck(state, stats({ obedience: 70 }), { stat: 'obedience', dc: 12 }, () => 0.45); // roll 10
  assert.deepEqual([mid.roll, mid.mod, mid.total, mid.success], [10, 2, 12, true]);
  assert.equal(rollCheck(state, stats(), { stat: 'favor', dc: 25 }, () => 0.999).success, true);
  assert.equal(rollCheck(state, stats({ favor: 100 }), { stat: 'favor', dc: 2 }, () => 0).success, false);
  assert.match(formatCheckResult(mid), /服从检定：d20=10 \+2 = 12 \/ 难度 12 · 成功/);
});

test('目标：按状态栏数值自动达成并发奖励；已达成的不重复发', async () => {
  const { createRpgState, evaluateGoals } = await load();
  const state = createRpgState('contract', names);
  const first = evaluateGoals(state, stats({ favor: 55, shame: 20 }));
  assert.deepEqual(first.completed.map((quest) => quest.title), ['建立信任', '坦诚相待']);
  assert.equal(first.state.gold, 120 + 60 + 80);
  assert.equal(evaluateGoals(first.state, stats({ favor: 90, shame: 0 })).completed.length, 0);
});

test('解析：容忍 +数值、尾逗号、截断的标签；检定用状态属性名', async () => {
  const { parseRpgUpdate, stripRpgTags } = await load();
  const reply = '她红着脸点头。\n<!--RPG:{"stamina":-12,"gold":+5,"discover":[{"name":"天台","kind":"户外","dir":"北","desc":"能看到星星"}],"items":{"add":["发夹x2"],"remove":[{"name":"甜点"}]},"time":"+1","choices":[{"text":"让她跪坐","check":"服从:12"},"夸奖她|favor:8",{"text":"一起看电视"},]}-->\n<!--STATUS:{"favor":"+1"}-->';
  const update = parseRpgUpdate(reply);
  assert.equal(update.stamina, -12);
  assert.equal(update.gold, 5);
  assert.equal(update.discover[0].kind, 'outdoor');
  assert.deepEqual(update.itemsAdd, [{ name: '发夹', qty: 2 }]);
  assert.deepEqual(update.choices.map((choice) => choice.check), [{ stat: 'obedience', dc: 12 }, { stat: 'favor', dc: 8 }, undefined]);
  assert.equal(stripRpgTags(reply).includes('RPG'), false);
  assert.ok(stripRpgTags(reply).includes('STATUS'), '只去掉日程标签，状态标签留给状态栏解析');
  assert.equal(parseRpgUpdate('好。<!--RPG:{"gold":-5,"choices":["走"]}').gold, -5);
  assert.equal(stripRpgTags('好的。<!--RPG:{"gold":-5', true), '好的。');
  assert.equal(stripRpgTags('好的。<!-', true), '好的。');
  assert.equal(parseRpgUpdate('没有标签'), null);
});

test('应用：新地点挂到当前位置；不相邻移动被拒；体力和金币单轮限幅；不能消耗没有的物品；时间最多到深夜；系统目标不让 AI 改', async () => {
  const { createRpgState, applyRpgUpdate, parseRpgUpdate, getReachableLocations, getLocation } = await load();
  const state = { ...createRpgState('contract', names), period: 2 };
  const { state: next, notes } = applyRpgUpdate(state, parseRpgUpdate('<!--RPG:{"discover":[{"name":"阳台","kind":"outdoor","dir":"南"}],"move":"街区","stamina":"-99","gold":"+999","items":{"remove":["魔杖"],"add":[{"name":"花束"}]},"time":"+3","quests":[{"title":"建立信任","status":"done"},{"title":"一起看日出","objective":"早起"}],"choices":["去阳台","休息"]}-->'));
  const balcony = byName(next, '阳台');
  assert.ok(getReachableLocations(next).includes(balcony));
  assert.deepEqual([balcony.x, balcony.y], [0, 1]);
  assert.equal(getLocation(next, next.currentId).name, '卧室', '街区不相邻');
  assert.equal(next.stamina, 60, '单轮最多 -40');
  assert.equal(next.gold, 220, '单轮最多 +100');
  assert.ok(next.inventory.some((item) => item.name === '花束'));
  assert.ok(notes.some((n) => n.text.includes('魔杖')));
  assert.equal(next.period, 3);
  assert.equal(next.day, 1, '不会自动跨天');
  assert.equal(next.quests.find((q) => q.title === '建立信任').status, 'active');
  assert.ok(next.quests.some((q) => q.title === '一起看日出'));
  assert.equal(next.turn, 1);
});

test('回滚与存储校验；开关默认关闭', async () => {
  const { createRpgState, applyRpgUpdate, parseRpgUpdate, rememberSnapshot, restoreSnapshot, normalizeRpgState, isRpgModeEnabled, setRpgModeEnabled } = await load();
  let state = rememberSnapshot(createRpgState('manor', names), 'msg_1');
  const changed = applyRpgUpdate(state, parseRpgUpdate('<!--RPG:{"stamina":"-20","gold":"+50"}-->')).state;
  const restored = restoreSnapshot(changed, 'msg_1');
  assert.deepEqual([restored.stamina, restored.gold], [100, 200]);
  assert.equal(restoreSnapshot(restored, 'msg_1'), null);

  const loaded = normalizeRpgState(JSON.parse(JSON.stringify({ ...state, stamina: 500, hardware: { punishOnFail: true, punishLevel: 9999, punishSeconds: 60 } })));
  assert.equal(loaded.stamina, 100);
  assert.equal(loaded.hardware.punishLevel, 200);
  assert.equal(loaded.hardware.punishSeconds, 5);
  assert.equal(loaded.hardware.rewardOnSuccess, false);
  assert.equal(normalizeRpgState({ version: 1, locations: [{}] }), null, '旧的战斗版存档不再加载');

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
