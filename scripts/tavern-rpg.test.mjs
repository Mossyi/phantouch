import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** 酒馆训练日程：用户是被调教者。课程、特质、阶段、压力、家规、课表、日报、结局、营业时段、AI 标签解析与限幅、回滚 */

const loadBundledModule = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const load = () => loadBundledModule('../src/core/tavern/tavernRpg.ts');
const names = { char: '莉莉丝', user: '小猫' };
const byName = (state, name) => state.locations.find((loc) => loc.name === name);
const fixed = (value) => () => value;
const goTo = (m, state, ...path) => path.reduce((s, name) => m.travelTo(s, byName(s, name).id).state, state);

test('开局：用户在自己的卧室；带家规、目标和今日课表；硬件奖惩默认关闭', async () => {
  const m = await load();
  const state = m.createRpgState('contract', names);
  assert.equal(m.getLocation(state, state.currentId).name, '卧室');
  assert.deepEqual(state.trainee, { obedience: 10, endurance: 10, shame: 70, devotion: 10 });
  assert.deepEqual([state.stamina, state.stress, state.points, state.stage], [100, 0, 20, 0]);
  assert.equal(state.rules.length, 3);
  assert.ok(state.rules[0].text.includes('莉莉丝'));
  assert.equal(state.plan.length, 4);
  assert.equal(state.plan[3].courseId, 'report', '深夜安排晚间汇报');
  assert.ok(state.plan.slice(0, 3).every((slot) => m.isCourseUnlocked(state, m.getCourse(slot.courseId))));
  assert.equal(state.hardware.punishOnFail, false);
  assert.equal(state.hardware.rewardOnSuccess, false);
  const custom = m.createRpgState('custom', names, { startName: '阁楼', dayLimit: 7 });
  assert.deepEqual(custom.locations.map((loc) => loc.name), ['阁楼', '训练室', '奖励柜']);
});

test('课程：按地点和等级解锁；系统掷骰并结算属性、积分、体力、压力、时段和课表', async () => {
  const m = await load();
  let state = m.createRpgState('contract', names);
  state = goTo(m, state, '客厅');
  const here = m.getCoursesHere(state);
  assert.ok(here.find((e) => e.course.id === 'recite').available);
  assert.match(here.find((e) => e.course.id === 'kneel').reason, /耐受 入门/);
  state = { ...state, plan: [{ period: 0, courseId: 'recite', done: false }] };

  const pass = m.runCourse(state, 'recite', fixed(0.95)); // d20=20
  assert.equal(pass.check.success, true);
  assert.deepEqual([pass.state.trainee.obedience, pass.state.points, pass.state.stamina, pass.state.stress, pass.state.period], [13, 25, 96, 1, 1]);
  assert.equal(pass.state.plan[0].done, true);
  assert.match(pass.message, /课程：规矩复述.*今日课表/);
  assert.match(pass.message, /系统已结算：服从 \+3、积分 \+5、体力 -4、压力 \+1/);

  const fail = m.runCourse(state, 'recite', fixed(0)); // d20=1
  assert.equal(fail.check.success, false);
  assert.equal(fail.state.trainee.obedience, 11, '失败也有一点经验');
  assert.equal(fail.state.points, 20);
  assert.equal(fail.state.stress, 5, '课程 +1，失败 +4');
  assert.equal(fail.state.counters.fails.obedience, 1);

  assert.match(m.runCourse(state, 'bath').error, /不能进行/);
  assert.match(m.runCourse({ ...state, stress: 90 }, 'recite').error, /压力太大/);
  const tired = goTo(m, { ...m.createRpgState('contract', names), stress: 90, stamina: 50 }, '浴室');
  const relax = m.runCourse(tired, 'bath');
  assert.deepEqual([relax.state.stress, relax.state.stamina], [80, 65], '放松课程在高压时也能做');
});

test('检定修正：属性 + 特质 - 体力低 - 压力高；特质按累计表现获得并排进事件', async () => {
  const m = await load();
  const base = m.createRpgState('contract', names);
  assert.equal(m.checkModifier(base, 'obedience'), -2);
  assert.equal(m.checkModifier(base, 'shame'), 0, '羞耻 70 → 放得开 30');
  assert.equal(m.checkModifier({ ...base, stamina: 10, stress: 70 }, 'shame'), -4);
  const docile = { ...base, counters: { ...base.counters, passes: { ...base.counters.passes, obedience: 8 } } };
  const progressed = m.evaluateProgress(docile);
  assert.deepEqual(progressed.newTraits, ['docile']);
  assert.equal(m.checkModifier(progressed.state, 'obedience'), -1);
  assert.ok(progressed.state.pendingEvents.some((e) => e.includes('乖巧')));
  assert.equal(m.evaluateProgress(progressed.state).newTraits.length, 0, '特质只给一次');
});

test('阶段提升与目标达成都会生成事件；事件在下一次应用 AI 回复时清空', async () => {
  const m = await load();
  const state = m.createRpgState('contract', names);
  const grown = m.evaluateProgress({ ...state, trainee: { obedience: 45, endurance: 45, shame: 40, devotion: 45 } });
  assert.equal(grown.stageUp, true);
  assert.equal(grown.state.stage, 2);
  assert.deepEqual(grown.completed.map((q) => q.title), ['学会规矩', '坚持住', '放下羞耻']);
  assert.equal(grown.state.points, 20 + 40 + 40 + 60);
  assert.ok(grown.state.pendingEvents.some((e) => e.includes('渐入佳境')));
  const prompt = m.buildRpgPrompt(grown.state, names);
  assert.ok(prompt.includes('【本轮需要回应的事件】'));
  assert.ok(prompt.includes('请让莉莉丝') || prompt.includes('请莉莉丝'), '事件里的占位符替换成角色名');
  const after = m.applyRpgUpdate(grown.state, m.parseRpgUpdate('<!--RPG:{"choices":["好"]}-->'));
  assert.deepEqual(after.state.pendingEvents, []);
});

test('家规：用户可加可删；AI 立规每轮一条；违规计数、扣积分、加压力并影响守规矩特质', async () => {
  const m = await load();
  let state = m.createRpgState('contract', names);
  assert.match(m.addRule(state, '  ').error, /不能为空/);
  state = m.addRule(state, '吃饭前要先说谢谢').state;
  assert.equal(state.rules.length, 4);
  assert.match(m.addRule(state, '吃饭前要先说谢谢').error, /已经有/);
  state = m.removeRule(state, 3);
  assert.equal(state.rules.length, 3);

  const { state: next } = m.applyRpgUpdate({ ...state, points: 20 }, m.parseRpgUpdate('<!--RPG:{"rules":{"add":["不许撒谎","第二条"],"violated":[1,"敲门"]},"choices":["对不起"]}-->'));
  assert.equal(next.rules.length, 4, '每轮只接受一条新家规');
  assert.equal(next.rules[3].by, 'trainer');
  assert.deepEqual(next.rules.slice(0, 2).map((r) => r.violations), [1, 1]);
  assert.deepEqual([next.points, next.stress, next.today.violations], [10, 6, 2]);
});

test('休息：生成日报、发课表奖励、压力下降、排新课表；连续守规矩累计天数', async () => {
  const m = await load();
  let state = m.createRpgState('contract', names);
  state = goTo(m, state, '客厅');
  state = { ...state, plan: [{ period: 0, courseId: 'recite', done: false }, { period: 3, courseId: 'report', done: false }] };
  state = m.runCourse(state, 'recite', fixed(0.95)).state;
  state = m.runCourse(state, 'report', fixed(0.95)).state;
  state = { ...state, stress: 50 };
  assert.match(m.restUntilMorning(state).error, /卧室/);
  state = goTo(m, state, '卧室');
  const rested = m.restUntilMorning(state, fixed(0.5));
  const report = rested.state.reports.at(-1);
  assert.deepEqual([report.planDone, report.planTotal, report.bonus, report.courses, report.passed], [2, 2, 40, 2, 2]);
  assert.deepEqual(report.deltas, { obedience: 3, devotion: 3 });
  assert.deepEqual([rested.state.day, rested.state.period, rested.state.stamina, rested.state.stress], [2, 0, 100, 20]);
  assert.equal(rested.state.counters.cleanDays, 1);
  assert.equal(rested.state.plan.length, 4);
  assert.ok(rested.state.plan.every((slot) => !slot.done));
  assert.match(rested.message, /今日小结：完成课程 2 次；检定 2 成 0 败；课表 2\/2；没有违反家规；服从 \+3、依恋 \+3；积分 \+50（含课表奖励 40）/);
});

test('期满给出结局并排进事件；可以续约', async () => {
  const m = await load();
  let state = { ...m.createRpgState('contract', names), day: 30, trainee: { obedience: 70, endurance: 40, shame: 50, devotion: 45 } };
  const rested = m.restUntilMorning(state, fixed(0.5)).state;
  assert.equal(rested.ending.title, '模范学徒');
  assert.ok(rested.pendingEvents.some((e) => e.includes('续约')));
  const renewed = m.renewContract(rested);
  assert.deepEqual([renewed.dayLimit, renewed.ending], [60, null]);
  assert.equal(m.computeEnding({ obedience: 10, endurance: 10, shame: 90, devotion: 10 }, []).title, '未完成的契约');
});

test('营业时段：不开放的地点去不了；差事和兑换也看时段', async () => {
  const m = await load();
  let state = goTo(m, m.createRpgState('contract', names), '客厅', '街区');
  assert.match(m.travelTo(state, byName(state, '街角咖啡馆').id).error, /清晨不开放/);
  state = { ...state, period: 1 };
  assert.equal(m.travelTo(state, byName(state, '街角咖啡馆').id).error, undefined);
  const kitchen = goTo(m, { ...m.createRpgState('contract', names), period: 3 }, '客厅', '厨房');
  assert.equal(m.getLocation(kitchen, kitchen.currentId).name, '客厅', '深夜厨房不开放');
});

test('物品：兑换、回体力/减压力、免罚券自动消耗', async () => {
  const m = await load();
  let state = { ...goTo(m, m.createRpgState('contract', names), '客厅'), points: 200, stamina: 50, stress: 40 };
  state = m.buyItem(m.buyItem(m.buyItem(state, '休息券').state, '抱抱券').state, '免罚券').state;
  assert.equal(state.points, 85);
  state = m.itemUseAction(state, '休息券').state;
  state = m.itemUseAction(state, '抱抱券').state;
  assert.deepEqual([state.stamina, state.stress], [80, 25]);
  assert.match(m.itemUseAction(state, '免罚券').error, /自动使用/);
  const pardon = m.consumePardon(state);
  assert.equal(pardon.used, true);
  assert.equal(pardon.state.inventory.some((item) => item.name === '免罚券'), false);
});

test('解析与应用：训练属性 ±8、体力/压力/积分限幅、不相邻移动被拒、没有标签时保留选项', async () => {
  const m = await load();
  const state = { ...m.createRpgState('contract', names), period: 2, points: 10, choices: [{ text: '旧选项' }] };
  const reply = '「跪好。」\n<!--RPG:{"train":{"obedience":+50,"忍耐":"+2","shame":"-30"},"stamina":-99,"stress":"+40","points":-99,"move":"街区","discover":[{"name":"阳台","kind":"阳台","dir":"南"}],"items":{"add":["发夹x2"],"remove":["魔杖"]},"time":"+3","quests":[{"title":"学会规矩","status":"done"}],"choices":[{"text":"跪好"},{"text":"坚持不动","check":"耐受:12"},"小声求饶|devotion:8",]}-->\n<!--STATUS:{"favor":"+1"}-->';
  const update = m.parseRpgUpdate(reply);
  assert.deepEqual(update.choices.map((c) => c.check), [undefined, { stat: 'endurance', dc: 12 }, { stat: 'devotion', dc: 8 }]);
  const { state: next, notes } = m.applyRpgUpdate(state, update);
  assert.deepEqual(next.trainee, { obedience: 18, endurance: 12, shame: 62, devotion: 10 });
  assert.deepEqual([next.stamina, next.stress, next.points, next.period], [60, 15, 0, 3]);
  assert.equal(m.getLocation(next, next.currentId).name, '卧室');
  assert.deepEqual([byName(next, '阳台').x, byName(next, '阳台').y], [0, 1]);
  assert.ok(notes.some((n) => n.text.includes('魔杖')));
  assert.equal(next.quests.find((q) => q.title === '学会规矩').status, 'active');
  assert.equal(m.stripRpgTags(reply).includes('RPG'), false);
  assert.ok(m.stripRpgTags(reply).includes('STATUS'));
  assert.equal(m.stripRpgTags('好的。<!--RPG:{"points":-5', true), '好的。');

  const missing = m.applyRpgUpdate(state, m.parseRpgUpdate('没有标签'));
  assert.equal(missing.missingTag, true);
  assert.deepEqual(missing.state.choices, [{ text: '旧选项' }]);
});

test('回滚、存储校验、旧版存档不加载、开关默认关闭', async () => {
  const m = await load();
  const state = m.rememberSnapshot(m.createRpgState('manor', names), 'msg_1');
  const changed = m.applyRpgUpdate(state, m.parseRpgUpdate('<!--RPG:{"stamina":"-20","points":"+10","train":{"obedience":"+5"},"rules":{"violated":[1]}}-->')).state;
  const restored = m.restoreSnapshot(changed, 'msg_1');
  assert.deepEqual([restored.stamina, restored.points, restored.trainee.obedience, restored.rules[0].violations], [100, 20, 10, 0]);
  assert.equal(m.restoreSnapshot(restored, 'msg_1'), null);

  const loaded = m.normalizeRpgState(JSON.parse(JSON.stringify({ ...state, stress: 500, traits: ['docile', 'fake'], trainee: { obedience: 999 }, hardware: { punishOnFail: true, punishLevel: 9999, punishSeconds: 60 } })));
  assert.equal(loaded.stress, 100);
  assert.deepEqual(loaded.traits, ['docile']);
  assert.deepEqual(loaded.trainee, { obedience: 100, endurance: 10, shame: 70, devotion: 10 });
  assert.equal(loaded.hardware.punishLevel, 200);
  assert.equal(m.normalizeRpgState({ version: 3, locations: [{}] }), null);

  const storage = new Map();
  globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
  try {
    assert.equal(m.isRpgModeEnabled(), false);
    m.setRpgModeEnabled(true);
    assert.equal(m.isRpgModeEnabled(), true);
  } finally {
    delete globalThis.localStorage;
  }
});

const loadGen = () => loadBundledModule('../src/core/tavern/tavernRpgWorldGen.ts');

test('AI 生成世界：容忍代码块和尾逗号；去重、补齐必需地点、接通孤立地点、按方位排布；课程限幅', async () => {
  const gen = await loadGen();
  const m = await load();
  const raw = '好的，这是世界：\n```json\n' + JSON.stringify({
    worldName: '魅魔的城堡塔楼很高很高很高',
    premise: '{{user}}自愿留在{{char}}的城堡，安全词是「月光」。',
    locations: [
      { id: 'room', name: '塔顶卧房', kind: 'bedroom', desc: '月光照进来', open: [1, 2] },
      { id: 'hall', name: '大厅', kind: 'home', desc: '烛火通明', dir: '南' },
      { id: 'hall2', name: '大厅', kind: 'home', desc: '重复的' },
      { id: 'dungeon', name: '地下训练场', kind: 'playroom', desc: '很安静', dir: '南' },
      { id: 'garden', name: '月下花园', kind: 'outdoor', desc: '只在夜里开', open: [3] },
      { id: 'lonely', name: '孤塔', kind: 'special', desc: '没人连它' },
    ],
    links: [['room', 'hall'], ['hall', 'dungeon'], ['大厅', '月下花园'], ['room', 'room']],
    rules: ['见到主人要行礼', '', '不许私自离开城堡'],
    courses: [
      { name: '月光冥想', desc: '静坐', kinds: ['playroom'], stat: 'devotion', dc: 99, stamina: 99, stress: 50, gain: { devotion: 50 }, points: 999, unlockLevel: 9 },
      { name: '放松泡澡', relief: true, stamina: 30, stress: 40, kinds: ['bath'] },
    ],
  }).replace(/}]/, '},]') + '\n```\n希望你喜欢';
  const world = gen.parseGeneratedWorld(raw, { theme: '魅魔城堡', dayLimit: 14 });
  assert.ok(world);
  const { template, courses, fixes } = world;
  assert.equal(template.name.length <= 12, true);
  assert.deepEqual(template.locations.map((l) => l.name), ['塔顶卧房', '大厅', '地下训练场', '月下花园', '孤塔', '奖励柜', '杂务间']);
  assert.equal(template.locations[0].open, undefined, '卧室全天开放');
  assert.deepEqual(template.locations.find((l) => l.name === '月下花园').open, [3]);
  assert.ok(fixes.some((f) => f.includes('孤塔')));
  assert.ok(fixes.some((f) => f.includes('奖励柜')) && fixes.some((f) => f.includes('杂务间')));
  const hall = template.locations.find((l) => l.name === '大厅');
  assert.deepEqual([hall.x, hall.y], [0, 1], '按「南」放在卧房下方');
  const coords = template.locations.map((l) => `${l.x},${l.y}`);
  assert.equal(new Set(coords).size, coords.length, '位置不重叠');
  assert.deepEqual(template.rules, ['见到主人要行礼', '不许私自离开城堡']);
  assert.equal(template.dayLimit, 14);
  assert.deepEqual(courses[0], { id: 'ai_0', name: '月光冥想', description: '静坐', kinds: ['playroom'], check: { stat: 'devotion', dc: 18 }, stamina: 25, stress: 8, gain: { devotion: 6 }, points: 20, unlock: { stat: 'devotion', level: 3 }, relief: false });
  assert.equal(courses[1].relief, true);
  assert.equal(courses[1].kinds[0], 'playroom', '没有浴室时放松课改到训练室');
  assert.deepEqual([courses[1].stamina, courses[1].stress], [-20, -20]);

  // 开局：专属课程进课程列表，地点连通、只能走相邻
  const state = m.createRpgStateFromTemplate(template, { char: '莉莉丝', user: '小猫' }, courses);
  assert.equal(m.getLocation(state, state.currentId).name, '塔顶卧房');
  assert.ok(state.rules[0].text.includes('行礼'));
  assert.ok(state.premise.includes('莉莉丝'));
  const inTraining = m.travelTo(m.travelTo(state, `${template.id}_${template.locations[1].key}`).state, `${template.id}_${template.locations[2].key}`).state;
  const here = m.getCoursesHere(inTraining);
  assert.ok(here.some((e) => e.course.id === 'ai_0' && !e.available && /依恋/.test(e.reason)));
  assert.ok(here.some((e) => e.course.id === 'ai_1' && e.available));
  const relaxed = m.runCourse({ ...inTraining, stress: 50, stamina: 50 }, 'ai_1');
  assert.deepEqual([relaxed.state.stress, relaxed.state.stamina], [30, 70]);
  // 存档读回后专属课程还在，课表里引用的专属课程不丢
  const reloaded = m.normalizeRpgState(JSON.parse(JSON.stringify({ ...relaxed.state, plan: [{ period: 0, courseId: 'ai_1', done: false }] })));
  assert.equal(reloaded.customCourses.length, 2);
  assert.equal(reloaded.plan.length, 1);

  assert.equal(gen.parseGeneratedWorld('不是 JSON', { theme: '', dayLimit: 30 }), null);
  assert.equal(gen.parseGeneratedWorld('{"locations":[{"name":"只有一个"}]}', { theme: '', dayLimit: 30 }), null);
});

test('探索周边：最多两个新地点，挂在当前位置旁；不允许探索出休息/兑换/差事地点；同名只补连线', async () => {
  const gen = await loadGen();
  const m = await load();
  const state = m.createRpgState('contract', names);
  const request = gen.buildExploreRequest(state, names);
  assert.ok(request.includes('现在在「卧室」'));
  const entries = gen.parseExploredLocations('```json\n{"locations":[{"name":"小阳台","kind":"outdoor","desc":"能看星星","dir":"南","open":[2,3]},{"name":"秘密仓库","kind":"shop","desc":"偷偷卖东西"},{"name":"第三个","kind":"home"}]}\n```');
  assert.equal(entries.length, 2);
  assert.equal(entries[1].kind, 'special');
  const result = m.discoverLocations(state, entries, 2);
  assert.equal(result.added.length, 2);
  const balcony = result.state.locations.find((l) => l.name === '小阳台');
  assert.deepEqual([balcony.x, balcony.y, balcony.open], [0, 1, [2, 3]]);
  assert.deepEqual(balcony.services, []);
  assert.ok(m.getReachableLocations(result.state).some((l) => l.name === '小阳台'));
  const again = m.discoverLocations(result.state, [{ name: '客厅', kind: 'home', dir: '', desc: '', from: undefined }], 2);
  assert.equal(again.added.length, 0);
});
