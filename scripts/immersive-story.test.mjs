import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';

const load = async (relativePath) => {
  const result = await build({ entryPoints: [relativePath], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const story = await load('src/core/tavern/immersiveStory.ts');
const branch = await load('src/core/tavern/tavernBranchMemory.ts');

const cast = {
  protagonist: '阿宁',
  playerName: '旅人',
  cardText: '阿宁在旧书店工作。配角只有店员周晚。',
};

const block = (payload) => `${story.IMMERSIVE_START}\n${JSON.stringify(payload)}\n${story.IMMERSIVE_END}`;

test('沉浸提示不写死参考角色，也不覆盖人设或硬件', () => {
  const prompt = story.buildImmersiveStoryPrompt('阿宁');
  assert.match(prompt, /不得改写人设/);
  assert.match(prompt, /不得声称执行了任何真实设备/);
  assert.match(prompt, /不要输出分数/);
  assert.equal(prompt.includes('林知夏'), false);
});

test('恶意 HTML 和分数被丢掉，配角必须来自角色卡', () => {
  const raw = [
    '夜色落在窗上。「你还要继续吗？」',
    block({
      time: '<script>alert(1)</script>子夜',
      place: '<img src=x onerror=alert(1)>旧书店',
      outfit: '灰外套',
      mood: '平静',
      inner: '想把话说完',
      affection: 16,
      lust: 20,
      group: [
        { name: '周晚', line: '<b>我先去关门。</b>' },
        { name: '林知夏', line: '不该出现的人' },
        { name: '阿宁', line: '主角不进群聊' },
        { name: '旅人', line: '玩家不进群聊' },
      ],
      sketch: '场外只剩翻书声',
      moves: ['我问周晚为什么还没走。', '我在柜台坐下。', '我把话题转到明天。', '第四条不该留下'],
    }),
  ].join('\n');
  const view = story.parseImmersiveStory(raw, cast);
  assert.equal(view.structured, true);
  assert.match(view.body, /你还要继续吗/);
  assert.equal(view.status.time.includes('<'), false);
  assert.equal(view.status.place.includes('<'), false);
  assert.match(view.status.time, /子夜/);
  assert.deepEqual(view.group.map((line) => line.name), ['周晚']);
  assert.equal(view.group[0].line.includes('<'), false);
  assert.equal(view.moves.length, 3);
  assert.equal(JSON.stringify(view).includes('affection'), false);
});

test('截断和坏格式回落正文，不留下标记', () => {
  const truncated = story.parseImmersiveStory(`正文还在。\n${story.IMMERSIVE_START}\n{"time":"子夜"`, cast);
  assert.equal(truncated.structured, false);
  assert.equal(truncated.body, '正文还在。');
  assert.equal(truncated.body.includes('YCY_IMMERSIVE'), false);
  const messy = story.finalizeImmersiveReply('只有普通对白。「明天见。」', cast);
  assert.equal(messy, '只有普通对白。「明天见。」');
  const streamed = story.immersiveStreamingText(`正文一半\n${story.IMMERSIVE_START}\n{"time":`);
  assert.equal(streamed, '正文一半');
});

test('候选切换只看当前文本，模式开关按会话保存', () => {
  const first = story.composeStoredImmersiveReply('第一段', {
    body: '第一段',
    status: { time: '清晨', place: '', outfit: '', mood: '', inner: '' },
    group: [],
    sketch: '',
    moves: ['我先出门。'],
    structured: true,
  });
  const second = story.composeStoredImmersiveReply('第二段', {
    body: '第二段',
    status: { time: '深夜', place: '', outfit: '', mood: '', inner: '' },
    group: [],
    sketch: '',
    moves: ['我留下。'],
    structured: true,
  });
  const candidates = [first, second];
  const active = candidates[1];
  assert.equal(story.parseImmersiveStory(active, cast).moves[0], '我留下。');
  assert.equal(story.parseImmersiveStory(candidates[0], cast).status.time, '清晨');

  const library = branch.migrateLegacyBranchMemory({ summary: '' }, []);
  const enabled = branch.setActiveSessionImmersive(library, true);
  const restored = branch.normalizeBranchLibrary(JSON.parse(JSON.stringify(enabled)));
  assert.equal(branch.activeBranchSession(restored).immersiveStory, true);
  const disabled = branch.normalizeBranchLibrary(JSON.parse(JSON.stringify(branch.setActiveSessionImmersive(enabled, false))));
  assert.equal(branch.activeBranchSession(disabled).immersiveStory, undefined);
  const forked = branch.forkBranchSession(enabled, []);
  assert.equal(branch.activeBranchSession(forked).immersiveStory, true);
  const fresh = branch.startFreshBranchSession(enabled);
  assert.equal(branch.activeBranchSession(fresh).immersiveStory, undefined);
});

test('记忆区使用真实摘要和待整理数量，不把失效摘要当成已写入', () => {
  const messages = [
    { id: 'u1', role: 'user', content: '我们约定暗号是青梅' },
    { id: 'a1', role: 'assistant', content: '记住了' },
  ];
  const facts = story.readImmersiveMemoryFacts(messages, {
    enabled: true,
    summary: '已经去了北城',
    summaryValid: false,
    staleSummary: '已经去了北城',
    unplacedSummary: '对不上的旧摘要',
    autoSummarize: false,
    autoEveryMessages: 12,
    pinnedMemory: '玩家希望被称作旅人',
  });
  assert.equal(facts.summaryInjected, false);
  assert.equal(facts.summary, '');
  assert.match(facts.staleSummary, /北城/);
  assert.match(facts.unplaced, /对不上/);
  assert.equal(facts.pendingCount, 2);
  assert.equal(facts.autoEvery, 12);
  assert.equal(facts.autoOn, false);
  assert.equal(JSON.stringify(facts).includes('已整合'), false);
});
