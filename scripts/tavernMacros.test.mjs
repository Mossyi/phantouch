import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function bundled(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
}

test('tavernMacros correctly expands {{char}}, {{user}}, datetime and random choices', async () => {
  const { expandTavernMacros } = await bundled('src/core/tavern/tavernMacros.ts');

  // 1. Basic replacement with custom context
  const context = {
    char: '爱丽丝',
    user: '指挥官',
    date: new Date('2026-09-07T15:30:00Z'),
  };

  const template = '你好，{{user}}！我是{{char}}。<user>看到<bot>了吗？当前时间是{{time}}，今天是{{date}}，{{weekday}}。';
  const expanded = expandTavernMacros(template, context);

  assert.ok(expanded.includes('你好，指挥官！我是爱丽丝。'));
  assert.ok(expanded.includes('指挥官看到爱丽丝了吗？'));
  assert.ok(expanded.includes('当前时间是'));
  assert.ok(expanded.includes('2026-09-'));
  assert.ok(expanded.includes('星期'));

  // 2. Default fallbacks
  assert.equal(expandTavernMacros('{{char}} vs {{user}}'), 'AI vs 旅人');
  assert.equal(expandTavernMacros(''), '');
  assert.equal(expandTavernMacros(null), '');

  // 3. Random macro choices
  const randomTemplate = '你获得了{{random::金币::钻石::银币}}！';
  const randomResult = expandTavernMacros(randomTemplate, context);
  assert.ok(
    randomResult === '你获得了金币！' ||
    randomResult === '你获得了钻石！' ||
    randomResult === '你获得了银币！'
  );

  // 4. Random macro comma variant
  const commaTemplate = '天气是{{random:晴天,阴天,雨天}}';
  const commaResult = expandTavernMacros(commaTemplate, context);
  assert.ok(['天气是晴天', '天气是阴天', '天气是雨天'].includes(commaResult));

  // 5. Special characters in char or user name ($100, $Alice, etc.)
  const specialResult = expandTavernMacros('{{user}} 给 {{char}} 转账', {
    char: '$Alice_99',
    user: '$User_1',
  });
  assert.equal(specialResult, '$User_1 给 $Alice_99 转账');
});
