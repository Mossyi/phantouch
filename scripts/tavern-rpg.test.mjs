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
  const state = m.createRpgStateFromTemplate(template, { char: '莉莉丝', user: '小猫' }, { courses });
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

const seq = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

test('地点事件：到达时按概率触发；同地点同一天只一次；冷却期内不重复；事件选项排在 AI 选项前面', async () => {
  const m = await load();
  const base = m.createRpgState('contract', names);
  const living = byName(base, '客厅').id;
  const miss = m.travelTo(base, living, seq(0.9));
  assert.equal(miss.message, '🧭 前往：客厅');
  const hit = m.travelTo(base, living, seq(0.1, 0));
  assert.match(hit.message, /✨ 地点事件：突击抽查/);
  assert.ok(hit.state.pendingEvents.some((e) => e.includes('突击抽查') && e.includes('马上背出来')));
  assert.deepEqual(hit.state.eventChoices.map((c) => c.text), ['马上背出来', '请求再给一点时间']);
  // 同一天再来一次不会再触发
  const back = m.travelTo(hit.state, byName(hit.state, '卧室').id, seq(0.9));
  const again = m.travelTo(back.state, living, seq(0.1, 0));
  assert.doesNotMatch(again.message, /地点事件/);
  // 第二天：突击抽查在冷却中，换成别的事件
  const nextDay = m.travelTo({ ...back.state, day: 2 }, living, seq(0.1, 0));
  assert.match(nextDay.message, /地点事件/);
  assert.doesNotMatch(nextDay.message, /突击抽查/);
  // AI 回复后：事件选项在前，AI 选项去重补在后面
  const applied = m.applyRpgUpdate(hit.state, m.parseRpgUpdate('<!--RPG:{"choices":["马上背出来","哭着求饶","乖乖跪好"]}-->'), seq(0.9)).state;
  assert.deepEqual(applied.choices.map((c) => c.text), ['马上背出来', '请求再给一点时间', '哭着求饶', '乖乖跪好']);
  assert.equal(applied.choices[0].check.stat, 'obedience');
  assert.deepEqual(applied.eventChoices, []);
  // AI 漏了标签时也能用上事件选项
  assert.deepEqual(m.applyRpgUpdate(hit.state, null).state.choices.map((c) => c.text), ['马上背出来', '请求再给一点时间']);
});

test('调教者传唤：时间推进后可能传唤；按时到达有奖励；过时没到记失败加压力；同时只有一个传唤', async () => {
  const m = await load();
  let state = goTo(m, m.createRpgState('contract', names), '客厅');
  state = { ...state, plan: [] };
  // 课程推进时段后触发传唤（random：检定 20 → 传唤概率命中 → 选第一个候选）
  const course = m.runCourse(state, 'recite', seq(0.95, 0.1, 0));
  const summon = m.activeSummon(course.state);
  assert.ok(summon, '应该有传唤');
  assert.deepEqual(summon.deadline, { day: 1, period: 2 });
  assert.ok(course.state.pendingEvents.some((e) => e.includes('传话')));
  assert.equal(m.maybeSummon(course.state, seq(0)).quests.filter((q) => q.target).length, 1, '同时只有一个传唤');
  const prompt = m.buildRpgPrompt(course.state, names);
  assert.ok(prompt.includes('限时传唤'));

  // 按时到达
  const target = m.getLocation(course.state, summon.target);
  const path = m.getNeighborIds(course.state, course.state.currentId).includes(target.id) ? [target.name] : ['卧室', target.name];
  let arrived = course.state;
  for (const name of path) arrived = m.travelTo(arrived, byName(arrived, name).id, seq(0.9)).state;
  if (m.getLocation(arrived, arrived.currentId).id === target.id) {
    assert.equal(arrived.quests.find((q) => q.target === target.id).status, 'done');
    assert.equal(arrived.points, course.state.points + 10);
    assert.equal(arrived.trainee.devotion, course.state.trainee.devotion + 1);
  }

  // 过时没到
  const late = m.expireSummons({ ...course.state, period: 3 });
  assert.equal(late.quests.find((q) => q.target).status, 'failed');
  assert.equal(late.stress, course.state.stress + 3);
  assert.ok(late.pendingEvents.some((e) => e.includes('没有按时')));
});

test('训练回忆：里程碑写进状态和提示词；最近几天的日报摘要也在提示词里', async () => {
  const m = await load();
  let state = m.createRpgState('contract', names);
  state = m.evaluateProgress({ ...state, day: 3, trainee: { ...state.trainee, obedience: 45 } }).state;
  assert.deepEqual(state.milestones.map((x) => x.text), ['达成目标「学会规矩」', '进入阶段「学习规矩」']);
  state = goTo(m, state, '卧室');
  const rested = m.restUntilMorning(state, seq(0.9)).state;
  const prompt = m.buildRpgPrompt(rested, names);
  assert.match(prompt, /训练回忆.*第3天达成目标「学会规矩」/);
  assert.match(prompt, /最近几天：第3天课程 0 次/);
});

test('AI 生成世界带专属事件；存档读回事件仍在', async () => {
  const gen = await loadGen();
  const m = await load();
  const raw = JSON.stringify({
    worldName: '温泉旅馆', premise: '安全词是「雪」。',
    locations: [{ id: 'r', name: '客房', kind: 'bedroom', desc: '榻榻米' }, { id: 'o', name: '露天温泉', kind: 'bath', desc: '雪景' }, { id: 'p', name: '茶室', kind: 'playroom', desc: '安静' }],
    links: [['r', 'o'], ['r', 'p']],
    events: [
      { title: '雪落进温泉', text: '{{char}}让{{user}}在雪里多泡一会儿', kinds: ['bath'], periods: [3], choices: [{ text: '乖乖泡着', check: 'endurance:11' }, '想出去|devotion:9'] },
      { title: '没有地点', text: '不会出现', kinds: ['castle'] },
      { title: '', text: '没标题' },
    ],
  });
  const world = gen.parseGeneratedWorld(raw, { theme: '温泉', dayLimit: 7 });
  assert.equal(world.events.length, 1);
  assert.deepEqual(world.events[0].choices, [{ text: '乖乖泡着', check: { stat: 'endurance', dc: 11 } }, { text: '想出去', check: { stat: 'devotion', dc: 9 } }]);
  const state = m.createRpgStateFromTemplate(world.template, names, { courses: world.courses, events: world.events });
  assert.ok(m.allLocationEvents(state).some((e) => e.id === 'aie_0'));
  const reloaded = m.normalizeRpgState(JSON.parse(JSON.stringify(state)));
  assert.equal(reloaded.customEvents[0].title, '雪落进温泉');
});

test('存档槽：最多 5 个，满了拒绝而不是悄悄覆盖；自动存档只覆盖同一局；两局同名世界互不覆盖；不保存回滚快照', async () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
  try {
    const slots = await loadBundledModule('../src/core/tavern/tavernRpgSlots.ts');
    const m = await load();
    const runA = m.rememberSnapshot(m.createRpgState('contract', names), 'msg');
    const runB = m.createRpgState('contract', names);
    assert.notEqual(runA.runId, runB.runId);
    let result = slots.saveRpgSlot('card', runA, '第一段', false);
    assert.deepEqual(result.slots[0].state.snapshots, []);
    slots.saveRpgSlot('card', { ...runA, day: 5 }, '', true);
    result = slots.saveRpgSlot('card', { ...runA, day: 6 }, '', true);
    assert.equal(result.slots.filter((s) => s.auto).length, 1, '同一局只留最新的自动存档');
    result = slots.saveRpgSlot('card', { ...runB, day: 2 }, '', true);
    assert.equal(result.slots.filter((s) => s.auto).length, 2, '同名世界的另一局不会覆盖 A 的自动存档');
    slots.saveRpgSlot('card', runB, '二', false);
    result = slots.saveRpgSlot('card', runB, '三', false);
    assert.equal(result.slots.length, 5);
    const full = slots.saveRpgSlot('card', runB, '第六个', false);
    assert.match(full.error, /最多 5 个/);
    assert.equal(full.slots.length, 5, '满了不覆盖任何存档');
    assert.match(slots.saveRpgSlot('card', m.createRpgState('manor', names), '', true).error, /最多 5 个/, '新一局的自动存档也不会挤掉别人');
    assert.equal(slots.saveRpgSlot('card', { ...runB, day: 3 }, '', true).error, undefined, '同一局的自动存档仍可覆盖');
    const loaded = slots.loadRpgSlot('card', result.slots.find((s) => s.name === '第一段').id);
    assert.equal(loaded.worldName, '契约训练');
    assert.ok(slots.slotLocationIds('card').has(loaded.currentId));
    const currentSlots = slots.listRpgSlots('card');
    assert.equal(slots.deleteRpgSlot('card', currentSlots[0].id).length, 4);
  } finally {
    delete globalThis.localStorage;
  }
});

test('回归：AI 改不了传唤任务；课程/差事/休息后忽略 AI 的 time；照抄示例的占位内容被丢弃；券类用完即扣；选项去重；期满事件不溢出', async () => {
  const m = await load();
  let state = goTo(m, m.createRpgState('contract', names), '客厅');
  // 传唤任务只由系统结算
  state = m.maybeSummon({ ...state, plan: [] }, seq(0, 0));
  const summon = m.activeSummon(state);
  assert.ok(summon);
  const tampered = m.applyRpgUpdate(state, m.parseRpgUpdate(`<!--RPG:{"quests":[{"title":"${summon.title}","status":"done"}],"choices":["好"]}-->`), seq(0.9)).state;
  assert.equal(m.activeSummon(tampered)?.title, summon.title, 'AI 不能把传唤标成完成');
  assert.equal(tampered.points, state.points);

  // 课程推进过时间，本轮 AI 再写 time 会被忽略
  const course = m.runCourse({ ...state, quests: state.quests.filter((q) => !q.target) }, 'recite', seq(0.95, 0.9));
  assert.equal(course.state.period, 1);
  assert.equal(course.state.timeLocked, true);
  const afterReply = m.applyRpgUpdate(course.state, m.parseRpgUpdate('<!--RPG:{"time":"+1","choices":["好"]}-->'), seq(0.9)).state;
  assert.equal(afterReply.period, 1, '不会重复推进');
  assert.equal(afterReply.timeLocked, false);
  const freeTalk = m.applyRpgUpdate(afterReply, m.parseRpgUpdate('<!--RPG:{"time":"+1","choices":["好"]}-->'), seq(0.9)).state;
  assert.equal(freeTalk.period, 2, '普通对话里的 time 照常生效');

  // 照抄示例的占位内容
  const copied = m.parseRpgUpdate('<!--RPG:{"move":"地点名","discover":[{"name":"新地点","kind":"outdoor"}],"items":{"add":[{"name":"物品","qty":1}],"remove":["用掉的物品"]},"rules":{"add":["新家规"]},"quests":[{"title":"临时任务"}],"choices":[{"text":"跪好"},{"text":"跪好","check":"endurance:12"},"求饶","跪 好"]}-->');
  assert.equal(copied.move, undefined);
  assert.deepEqual([copied.discover.length, copied.itemsAdd.length, copied.itemsRemove.length, copied.rulesAdd.length, copied.quests.length], [0, 0, 0, 0, 0]);
  assert.deepEqual(copied.choices, [{ text: '跪好', check: { stat: 'endurance', dc: 12 } }, { text: '求饶', check: undefined }], '同名选项只留一个，带检定的优先');

  // 券类用完即扣
  let bag = { ...goTo(m, m.createRpgState('contract', names), '客厅'), points: 100 };
  bag = m.buyItem(bag, '撒娇券').state;
  const used = m.itemUseAction(bag, '撒娇券');
  assert.equal(used.message, '🧭 使用：撒娇券');
  assert.equal(used.state.inventory.some((i) => i.name === '撒娇券'), false);
  assert.ok(m.itemUseAction(bag, '契约书').state.inventory.some((i) => i.name === '契约书'), '契约书这种信物用了也还在');

  // 期满那天的事件队列不会超长
  let ending = { ...m.createRpgState('contract', names), day: 30, pendingEvents: ['a', 'b', 'c', 'd', 'e', 'f'] };
  ending = m.restUntilMorning(ending, seq(0.9)).state;
  assert.ok(ending.pendingEvents.length <= 6);
  assert.ok(ending.pendingEvents.some((e) => e.includes('续约')), '结局事件不能被挤掉');
});
