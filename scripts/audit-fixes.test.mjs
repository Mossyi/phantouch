import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';

const load = async (relativePath) => {
  const result = await build({ entryPoints: [relativePath], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

test('找不到人格时回到默认男主导，不落到列表第一位', async () => {
  const { getPersonaPrompt, PRESET_PERSONAS } = await load('src/core/ai/personaPrompts.ts');
  const fallback = getPersonaPrompt('missing-persona');
  const male = PRESET_PERSONAS.find((persona) => persona.id === 'male_dom');
  assert.equal(fallback, male.systemPrompt);
  assert.notEqual(fallback, PRESET_PERSONAS[0].systemPrompt);
});

test('更新下载只接受 http 链接，方舟请求会带上图片', async () => {
  const updater = await load('src/core/updater/appUpdater.ts');
  assert.equal(updater.pickApkUrl({ mirrorApkUrl: 'javascript:alert(1)', apkUrl: 'https://example.com/app.apk' }), 'https://example.com/app.apk');
  assert.equal(updater.pickApkUrl({ apkUrl: 'javascript:alert(1)' }), undefined);
  assert.equal(updater.openDownloadUrl('javascript:alert(1)'), false);
  const llm = await load('src/core/ai/llmClient.ts');
  const input = llm.convertChatMessagesToResponsesInput([
    { role: 'user', content: [{ type: 'text', text: '看这张图' }, { type: 'image_url', image_url: { url: 'https://example.com/a.png' } }] },
  ]);
  assert.equal(input[0].content[0].text, '看这张图');
  assert.equal(input[0].content[1].image_url, 'https://example.com/a.png');
  assert.equal(llm.nextToolCallIndex(undefined, 1), 1);
  assert.equal(llm.nextToolCallIndex(2, 1), 2);
  assert.equal(llm.nextToolCallIndex('nope', 1), null);
});
