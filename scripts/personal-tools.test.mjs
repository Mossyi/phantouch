import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
async function bundled(path) { const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' }); return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`); }
function setup() { const values = new Map(); globalThis.localStorage = { get length() { return values.size; }, key(i) { return [...values.keys()][i] ?? null; }, getItem(k) { return values.get(k) ?? null; }, setItem(k, v) { values.set(k, String(v)); }, removeItem(k) { values.delete(k); } }; return values; }
test('message finder uses literal matching, safe highlight parts and character-isolated bookmarks', async () => {
  setup(); const finder = await bundled('src/core/tavern/messageFinder.ts');
  const messages = [{ id: 'a', content: 'Hello [x] <script>' }, { id: 'b', content: 'hello' }];
  assert.deepEqual(finder.findMessageIds(messages, 'HELLO'), ['a', 'b']);
  assert.deepEqual(finder.findMessageIds(messages, '[x]'), ['a']);
  const parts = finder.highlightMessage(messages[0].content, '[x]');
  assert.equal(parts.filter(p => p.hit)[0].text, '[x]'); assert.equal(parts.map(p => p.text).join(''), messages[0].content);
  finder.toggleMessageBookmark('alice', { ...messages[0], role: 'assistant' });
  assert.equal(finder.loadMessageBookmarks('alice').length, 1); assert.equal(finder.loadMessageBookmarks('bob').length, 0);
  localStorage.setItem = () => { throw new Error('full'); };
  assert.throws(() => finder.toggleMessageBookmark('alice', { ...messages[0], role: 'assistant' }), /保存失败/);
  assert.equal(finder.loadMessageBookmarks('alice').length, 1);
});
test('weekly plan uses Monday and local calendar boundaries, deduplicates records and excludes future sessions', async () => {
  setup(); const plan = await bundled('src/core/discipline/weeklyPlan.ts');
  const now = new Date(2026, 8, 7, 10, 0), monday = new Date(2026, 8, 7, 0, 1).getTime();
  const schedule = plan.normalizeWeeklyPlan({ paused: false, days: [{ task: 'voice', sessions: 2 }, { task: 'forged', sessions: -1 }] });
  const session = { id: 's1', completedAt: monday, durationSec: 30 };
  const progress = plan.getWeekProgress(schedule, { voiceHistory: [session, session, { ...session, id: 'short', durationSec: 2 }, { ...session, id: 'future', completedAt: now.getTime() + 3600000 }, { ...session, id: 'sunday', completedAt: monday - 3600000 }], postureHistory: [] }, now);
  assert.equal(progress[0].key, '2026-09-07'); assert.equal(progress[0].today, true); assert.equal(progress[0].completed, 1); assert.equal(progress[0].met, false);
  assert.equal(progress[1].task, 'rest'); assert.equal(progress.length, 7);
  plan.saveWeeklyPlan(schedule); assert.equal(plan.loadWeeklyPlan().days[0].sessions, 2);
});
test('personal items and combinations survive reload and preserve diary name snapshots after edits and archive', async () => {
  setup(); const { WardrobeEngine, normalizeWardrobeState } = await bundled('src/core/wardrobe/wardrobeData.ts'), engine = WardrobeEngine.getInstance();
  engine.savePersonalItem({ id: 'personal-test', name: 'Blue shirt', category: 'casual', image: 'data:image/jpeg;base64,YQ==' });
  engine.setOwnership('personal-test', 'owned');
  engine.saveLook({ id: 'look-test', name: 'Weekend', itemIds: ['personal-test', 'outfit_maid_classic'] });
  const entry = engine.addDiary({ outfitId: 'look-test', title: 'Today', content: 'Comfortable', mood: 'calm', scene: 'home', tags: [], minutes: 10, comfort: 4, confidence: 4, styleScore: 4 });
  assert.deepEqual(entry.outfitSnapshot, ['Blue shirt', '经典黑白蕾丝女仆裙']);
  engine.savePersonalItem({ id: 'personal-test', name: 'Renamed', archived: true });
  engine.saveLook({ id: 'look-test', name: 'Weekend', itemIds: ['personal-test'], archived: true });
  const recovered = normalizeWardrobeState(JSON.parse(localStorage.getItem('ycy_wardrobe_state')));
  assert.equal(recovered.diaries.length, 1); assert.equal(recovered.diaries[0].outfitSnapshot[0], 'Blue shirt');
  assert.equal(recovered.ownership['personal-test'], 'owned');
  assert.equal(engine.getItems().some(i => i.id === 'look-test'), false); assert.equal(engine.getItems(true).some(i => i.id === 'look-test'), true);
  const mutable = engine.getState(); mutable.diaries[0].outfitSnapshot[0] = 'tampered'; assert.equal(engine.getState().diaries[0].outfitSnapshot[0], 'Blue shirt');
});
test('personal wardrobe rejects invalid imports and rolls back failed writes including diary changes', async () => {
  const values = setup(); const { WardrobeEngine, normalizeWardrobeState } = await bundled('src/core/wardrobe/wardrobeData.ts'), engine = WardrobeEngine.getInstance();
  engine.savePersonalItem({ id: 'personal-good', name: 'Shirt', image: 'https://unknown.example/image.jpg' });
  assert.equal(engine.getState().customItems[0].image, '/wardrobe/personal-placeholder.svg');
  const recovered = normalizeWardrobeState({ customItems: [{ id: 'bad', name: 'No' }, { id: 'personal-a', name: 'A', image: 'data:image/svg+xml;base64,eA==' }], looks: [{ id: 'look-b', name: 'B', itemIds: ['missing'] }] });
  assert.equal(recovered.customItems.length, 1); assert.equal(recovered.looks.length, 0);
  const before = values.get('ycy_wardrobe_state'); localStorage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => engine.savePersonalItem({ id: 'personal-good', name: 'Must not persist' }), /保存失败/);
  assert.equal(engine.getState().customItems[0].name, 'Shirt'); assert.equal(values.get('ycy_wardrobe_state'), before);
  assert.throws(() => engine.addDiary({ outfitId: 'personal-good', content: 'No room', title: '', mood: '', scene: '', tags: [], minutes: 1, comfort: 3, confidence: 3, styleScore: 3 }), /保存失败/);
  assert.equal(engine.getState().diaries.length, 0);
});
test('new bookmarks, weekly plans and personal wardrobe are included in their module backups', async () => {
  setup(); const { SignInCodeEngine } = await bundled('src/core/tavern/signInCodeEngine.ts');
  localStorage.setItem('ycy_tavern_bookmarks_alice', JSON.stringify([{ id: 'one', content: 'saved' }]));
  localStorage.setItem('ycy_training_weekly_plan', JSON.stringify({ paused: true }));
  localStorage.setItem('ycy_wardrobe_state', JSON.stringify({ customItems: [] }));
  assert.ok(JSON.parse(SignInCodeEngine.generateSignInCode({ module: 'tavern' }).jsonStr).snapshot.ycy_tavern_bookmarks_alice);
  assert.ok(JSON.parse(SignInCodeEngine.generateSignInCode({ module: 'training' }).jsonStr).snapshot.ycy_training_weekly_plan);
  assert.ok(JSON.parse(SignInCodeEngine.generateSignInCode({ module: 'wardrobe' }).jsonStr).snapshot.ycy_wardrobe_state);
});
