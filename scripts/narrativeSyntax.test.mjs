import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function bundled(path, plugins = []) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins,
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
}

test('narrative syntax tokenizes physical actions (* and ** and *** and _ and ＊)', async () => {
  const { parseNarrativeTokens } = await bundled('src/components/tavern/TavernMessageContent.tsx');

  const text = '*轻轻走上前* 看着你 **微低下头咬紧嘴唇** ***深吸了一口气*** _缓缓靠在你的怀里_ ＊全角星号动作＊ ~调皮地眨眨眼~ ～全角波浪线动作～';
  const tokens = parseNarrativeTokens(text);

  const actionTokens = tokens.filter((t) => t.type === 'action');
  assert.equal(actionTokens.length, 7);
  assert.equal(actionTokens[0].text, '*轻轻走上前*');
  assert.equal(actionTokens[1].text, '**微低下头咬紧嘴唇**');
  assert.equal(actionTokens[2].text, '***深吸了一口气***');
  assert.equal(actionTokens[3].text, '_缓缓靠在你的怀里_');
  assert.equal(actionTokens[4].text, '＊全角星号动作＊');
  assert.equal(actionTokens[5].text, '~调皮地眨眨眼~');
  assert.equal(actionTokens[6].text, '～全角波浪线动作～');

  // Test multi-line action across paragraph breaks
  const multilineText = '*第一段动作描写\n\n第二段动作描写* “台词”';
  const multilineTokens = parseNarrativeTokens(multilineText);
  assert.equal(multilineTokens[0].type, 'action');
  assert.equal(multilineTokens[0].text, '*第一段动作描写\n\n第二段动作描写*');
});

test('narrative syntax tokenizes dialogue in Chinese and Japanese quotes', async () => {
  const { parseNarrativeTokens } = await bundled('src/components/tavern/TavernMessageContent.tsx');

  const text = '“主人，你回来啦。” 「今天的训练如何？」 『最终誓约』 "Are you ready?"';
  const tokens = parseNarrativeTokens(text);

  const dialogueTokens = tokens.filter((t) => t.type === 'dialogue');
  assert.equal(dialogueTokens.length, 4);
  assert.equal(dialogueTokens[0].text, '“主人，你回来啦。”');
  assert.equal(dialogueTokens[1].text, '「今天的训练如何？」');
  assert.equal(dialogueTokens[2].text, '『最终誓约』');
  assert.equal(dialogueTokens[3].text, '"Are you ready?"');
});

test('narrative syntax tokenizes thoughts and mental activities in parentheses', async () => {
  const { parseNarrativeTokens } = await bundled('src/components/tavern/TavernMessageContent.tsx');

  const text = '（心跳不由自主地加快……） 看着地面 (心里有些犹豫)';
  const tokens = parseNarrativeTokens(text);

  const thoughtTokens = tokens.filter((t) => t.type === 'thought');
  assert.equal(thoughtTokens.length, 2);
  assert.equal(thoughtTokens[0].text, '（心跳不由自主地加快……）');
  assert.equal(thoughtTokens[1].text, '(心里有些犹豫)');
});

test('narrative syntax tokenizes system status and brackets', async () => {
  const { parseNarrativeTokens } = await bundled('src/components/tavern/TavernMessageContent.tsx');

  const text = '【好感度 +10】 [系统判定：通过]';
  const tokens = parseNarrativeTokens(text);

  const bracketTokens = tokens.filter((t) => t.type === 'bracket');
  assert.equal(bracketTokens.length, 2);
  assert.equal(bracketTokens[0].text, '【好感度 +10】');
  assert.equal(bracketTokens[1].text, '[系统判定：通过]');
});

test('narrative syntax supports multi-line quotes and preserves markdown links', async () => {
  const { parseNarrativeTokens } = await bundled('src/components/tavern/TavernMessageContent.tsx');

  const multiLineDialogue = '“第一句对话。\n第二句对话，紧接着上一句。”';
  const tokens1 = parseNarrativeTokens(multiLineDialogue);
  assert.equal(tokens1.length, 1);
  assert.equal(tokens1[0].type, 'dialogue');

  const mdLink = '请查看 [说明文档](https://example.com) 获取更多信息';
  const tokens2 = parseNarrativeTokens(mdLink);
  const linkBracket = tokens2.find((t) => t.type === 'bracket');
  assert.equal(linkBracket, undefined, 'Markdown links should not be parsed as system brackets');
});

test('narrative syntax identifies in-progress tokens during streaming', async () => {
  const { parseNarrativeTokens } = await bundled('src/components/tavern/TavernMessageContent.tsx');

  const streamAction = '角色*正在向你缓步走来';
  const tokens1 = parseNarrativeTokens(streamAction);
  assert.equal(tokens1[1].type, 'action');
  assert.equal(tokens1[1].text, '*正在向你缓步走来');

  const streamDialogue = '轻声说道：“请稍等片刻';
  const tokens2 = parseNarrativeTokens(streamDialogue);
  assert.equal(tokens2[1].type, 'dialogue');
  assert.equal(tokens2[1].text, '“请稍等片刻');

  const streamThought = '看着远方（心中不禁泛起一丝波澜';
  const tokens3 = parseNarrativeTokens(streamThought);
  assert.equal(tokens3[1].type, 'thought');
  assert.equal(tokens3[1].text, '（心中不禁泛起一丝波澜');
});

test('narrative syntax extracts dialogue nested inside action asterisks', async () => {
  const { parseNarrativeTokens } = await bundled('src/components/tavern/TavernMessageContent.tsx');

  const nested = '*走过去，微笑着说：“你好啊，今天过得开心吗？” 随后拍了拍你的肩*';
  const tokens = parseNarrativeTokens(nested);

  assert.equal(tokens[0].type, 'action');
  assert.equal(tokens[0].text, '*走过去，微笑着说：');
  assert.equal(tokens[1].type, 'dialogue');
  assert.equal(tokens[1].text, '“你好啊，今天过得开心吗？”');
  assert.equal(tokens[2].type, 'action');
  assert.equal(tokens[2].text, ' 随后拍了拍你的肩*');
});

test('narrative syntax supports curly right quotes and implicit dialogue in action/thought responses', async () => {
  const { parseNarrativeTokens } = await bundled('src/components/tavern/TavernMessageContent.tsx');

  // Both curly right quotes
  const curly = '”你好啊” *微笑*';
  const curlyTokens = parseNarrativeTokens(curly);
  assert.equal(curlyTokens[0].type, 'dialogue');
  assert.equal(curlyTokens[0].text, '”你好啊”');

  // Implicit dialogue when card has no explicit quotes
  const cardMes = '（指尖轻轻划过你的下巴，嘴角挑起一抹玩味的笑意）哎呀... 看看是谁送上门来了？';
  const cardTokens = parseNarrativeTokens(cardMes);
  assert.equal(cardTokens[0].type, 'thought');
  assert.equal(cardTokens[1].type, 'dialogue');
  assert.equal(cardTokens[1].text, '哎呀... 看看是谁送上门来了？');
});

