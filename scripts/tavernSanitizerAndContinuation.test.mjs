import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

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
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

test('tavern text sanitizer completely strips thinking tags, leaked proxy codes, and hardware/status tags', async () => {
  const {
    stripThinkingArtifacts,
    stripInternalControlTags,
    sanitizeTavernVisibleContent,
    isSentenceTruncated,
    buildContinuationInstruction,
  } = await loadBundledModule('../src/core/tavern/tavernTextSanitizer.ts');

  // 1. Leaked proxy tags like </think_never_used_UUID> (with and without closing bracket)
  const leakedArkCode = '这是角色回复的最后一句话。</think_never_used_51bce0c785ca2f68081bfa7c>';
  assert.equal(stripThinkingArtifacts(leakedArkCode, false), '这是角色回复的最后一句话。');

  const leakedArkNoBracket = '这是角色回复。\n</think_never_used_51bce0c785ca2f68081bfa7c';
  assert.equal(stripThinkingArtifacts(leakedArkNoBracket, false).trim(), '这是角色回复。');

  // 1.1 Double-bracket think tags like <<think>
  const doubleBracketThink = '<<think>\n内部深度思考\n</think>\n正常台词。';
  assert.equal(stripThinkingArtifacts(doubleBracketThink, false).trim(), '正常台词。');

  const danglingDoubleBracket = '前文<<think>后文';
  assert.equal(stripThinkingArtifacts(danglingDoubleBracket, false).trim(), '前文后文');

  // 2. Unclosed leaked tag at end of message
  const unclosedLeakedTag = '这是角色回复。</think_never_used_51bce0c785ca2f68081bfa7c';
  assert.equal(stripThinkingArtifacts(unclosedLeakedTag, false), '这是角色回复。');

  // 3. Complete DeepSeek-R1 / Doubao think block
  const thinkBlock = '<think>我需要分析用户的身份，给出合乎设定的回答。</think>你醒了？感觉好点了吗？';
  assert.equal(stripThinkingArtifacts(thinkBlock, false), '你醒了？感觉好点了吗？');

  // 4. Custom think_never_used block
  const arkThinkBlock = '<think_never_used_12345>内部思考过程</think_never_used_12345>剧情正文内容。';
  assert.equal(stripThinkingArtifacts(arkThinkBlock, false), '剧情正文内容。');

  // 5. Thought / Reasoning blocks
  const thoughtBlock = '角色说话。<thought>内心秘密思考</thought>继续说话。';
  assert.equal(stripThinkingArtifacts(thoughtBlock, false), '角色说话。继续说话。');

  const reasoningBlock = '<reasoning>深层推导</reasoning>最终台词。';
  assert.equal(stripThinkingArtifacts(reasoningBlock, false), '最终台词。');

  // 6. Streaming unclosed think tag at the beginning and anywhere
  const streamingThink = '<think>正在生成思考过程，尚未结束...';
  assert.equal(stripThinkingArtifacts(streamingThink, true), '');

  const streamingDoneThink = '<think>思考已闭合</think>第一句台词';
  assert.equal(stripThinkingArtifacts(streamingDoneThink, true), '第一句台词');

  assert.equal(stripThinkingArtifacts('前文 <think>中途思考', true).trim(), '前文');

  // 6.1 Markdown code fences, HTML escaped tags and special tokens
  assert.equal(stripThinkingArtifacts('```think\n内部代码推导\n```\n这里是卡片', false).trim(), '这里是卡片');
  assert.equal(stripThinkingArtifacts('&lt;think&gt;HTML转义思考&lt;/think&gt;真实回复', false).trim(), '真实回复');
  assert.equal(stripThinkingArtifacts('<|begin_of_thought|>深度推算<|end_of_thought|>实际回答', false).trim(), '实际回答');

  // 7. Dangling tags
  assert.equal(stripThinkingArtifacts('正文</think>', false), '正文');
  assert.equal(stripThinkingArtifacts('正文<think>', false), '正文');

  // 8. Internal hardware and status control tags (single and multiple)
  const textWithHw = '执行电击动作[[YCY_HW:{"type":"ems","strength":20}]]请注意。';
  assert.equal(stripInternalControlTags(textWithHw, false), '执行电击动作请注意。');

  const textWithStatus = '好感度上升<!-- STATUS: {"favor": 60} -->你做得很棒！';
  assert.equal(stripInternalControlTags(textWithStatus, false), '好感度上升你做得很棒！');

  const textWithMultipleStatus = '前文<!--STATUS:\n{\n    :   ,\n    :   \n}-->中间<!--STATUS:\n{\n    :   \n}-->后文';
  assert.equal(stripInternalControlTags(textWithMultipleStatus, false).replace(/\s+/g, ''), '前文中间后文');

  // 9. Comprehensive visible sanitization & paragraph deduplication (Exact user reproduction)
  const userExactSample = `</think_never_used_51bce0c785ca2f68081bfa7c
对！就是这样！夹紧！小贱狗，你越夹紧爸爸越爽！

(我最后狠狠撞了三下，整根黑屌完全没入，一股滚烫的精液狠狠地射在了你身体最深处，我按着你的头足足停留了半分钟才松开手，你大口喘着气)

真乖，我的母狗，你看，你都习惯了这种感觉了对不对？
<!--STATUS:
{
    :   ,
    :   ,
    :
}-->
</think_never_used_51bce0c785ca2f68081bfa7c
<!--STATUS:
{
    :   ,
    :   ,
    :
}-->
(我最后狠狠撞了三下，整根黑屌完全没入，一股滚烫的精液狠狠地射在了你身体最深处，我按着你的头足足停留了半分钟才松开手，你大口喘着气)`;

  const sanitizedUserSample = sanitizeTavernVisibleContent(userExactSample, false);
  assert.ok(!sanitizedUserSample.includes('think_never_used'));
  assert.ok(!sanitizedUserSample.includes('STATUS'));
  // Paragraph appeared only once
  const occurrences = (sanitizedUserSample.match(/我最后狠狠撞了三下/g) || []).length;
  assert.equal(occurrences, 1);

  // 9.1 Consecutive phrase loop clamping
  const loopingPhrase = '你喜欢被爸爸这样对待对不对？对不对？对不对？对不对？对不对？';
  const dedupedLoop = sanitizeTavernVisibleContent(loopingPhrase, false);
  const loopCount = (dedupedLoop.match(/对不对？/g) || []).length;
  assert.ok(loopCount <= 2);

  // 9.2 Action loops and comma phrase loops
  const actionLoop = '*喘息* *喘息* *喘息* *喘息* *喘息*';
  const dedupedAction = sanitizeTavernVisibleContent(actionLoop, false);
  assert.ok((dedupedAction.match(/喘息/g) || []).length <= 2);

  const commaLoop = '主人，主人，主人，主人，主人，主人！';
  const dedupedComma = sanitizeTavernVisibleContent(commaLoop, false);
  assert.ok((dedupedComma.match(/主人/g) || []).length <= 3);

  // 10. Truncation detection (safely ignores trailing leaked think tags)
  assert.equal(isSentenceTruncated('让你牢牢记住！'), false);
  assert.equal(isSentenceTruncated('（握着你的手微笑道）“明天见。”'), false);
  assert.equal(isSentenceTruncated('射进你骚穴里！\n</think_never_used_51bce0c785ca2f68081bfa7c'), false);
  assert.equal(isSentenceTruncated('操到你连路都走不动，让你牢牢记住当'), true);
  assert.equal(isSentenceTruncated('我刚想开口说，'), true);
  assert.equal(isSentenceTruncated('短文字'), false); // Short messages are not considered truncated

  // 11. Continuation instruction construction (sanitized)
  const dirtyTruncated = '操到你连路都走不动，让你牢牢记住当\n</think_never_used_51bce0c785ca2f68081bfa7c';
  const instruction = buildContinuationInstruction(dirtyTruncated);
  assert.ok(instruction.includes('无缝续写严格指令'));
  assert.ok(instruction.includes('让你牢牢记住当'));
  assert.ok(!instruction.includes('think_never_used'));
  assert.ok(instruction.includes('严禁从头重新开始'));
});

test('mergeContinuationContent seamlessly merges unfinished messages without duplicating echoed prefixes', async () => {
  const { mergeContinuationContent } = await loadBundledModule('../src/core/tavern/tavernTextSanitizer.ts');

  const prev = '今天爸爸要操你一整天，操到你连路都走不动，让你牢牢记住当';
  const cont = '让你牢牢记住当小狗的滋味！乖乖给我趴好！';
  const merged = mergeContinuationContent(prev, cont);
  assert.equal(merged, '今天爸爸要操你一整天，操到你连路都走不动，让你牢牢记住当小狗的滋味！乖乖给我趴好！');

  const prevParagraph = '第一段剧情。\n\n(我狠狠抓着你的头发，眼神冰冷)';
  const contWithEcho = '(我狠狠抓着你的头发，眼神冰冷) 随后一把将你按倒在沙发上！';
  const mergedParagraph = mergeContinuationContent(prevParagraph, contWithEcho);
  const grabCount = (mergedParagraph.match(/我狠狠抓着你的头发/g) || []).length;
  assert.equal(grabCount, 1);
  assert.ok(mergedParagraph.includes('随后一把将你按倒在沙发上！'));
});

test('tavern generation presets default to modern safe token budgets and upgrade legacy limits', async () => {
  const {
    TAVERN_GENERATION_PRESETS,
    normalizeTavernGenerationConfig,
  } = await loadBundledModule('../src/core/tavern/tavernGeneration.ts');

  // Presets have adequate budgets for reasoning models
  assert.ok(TAVERN_GENERATION_PRESETS.balanced.maxTokens >= 3_000);
  assert.ok(TAVERN_GENERATION_PRESETS.creative.maxTokens >= 3_600);
  assert.ok(TAVERN_GENERATION_PRESETS.precise.maxTokens >= 2_000);
  assert.ok(TAVERN_GENERATION_PRESETS.longform.maxTokens >= 4_096);

  // Legacy balanced configs with 1200 maxTokens are automatically upgraded to current preset budget
  const upgradedLegacy = normalizeTavernGenerationConfig({
    presetId: 'balanced',
    maxTokens: 1_200,
  });
  assert.equal(upgradedLegacy.maxTokens, TAVERN_GENERATION_PRESETS.balanced.maxTokens);

  // Custom user configs with specific limits are preserved
  const customConfig = normalizeTavernGenerationConfig({
    presetId: 'custom',
    maxTokens: 1_500,
  });
  assert.equal(customConfig.maxTokens, 1_500);
});
