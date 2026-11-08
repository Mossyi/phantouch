import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function bundled(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
}

function setupLocalStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, val) => map.set(key, String(val)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
  return map;
}

test('酒馆好感状态栏已移除：不评分、不注入提示，旧档字段保留且日程仍可加载', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  assert.equal(existsSync('src/components/tavern/TavernStatusHudBar.tsx'), false);
  assert.equal(existsSync('src/core/tavern/tavernStatusHud.ts'), false);
  const chat = readFileSync('src/components/tavern/TavernChatTab.tsx', 'utf8');
  for (const gone of ['TavernStatusHudBar', 'buildStatusPromptInstruction', 'parseAndApplyStatusUpdate', 'loadCharacterStats', '好感', '角色心境', '展开属性栏']) {
    assert.equal(chat.includes(gone), false, gone);
  }
  assert.ok(chat.includes('TavernRpgHud'), '日程条仍在聊天页');

  const rpgSource = readFileSync('src/core/tavern/tavernRpg.ts', 'utf8');
  assert.equal(rpgSource.includes('STATUS'), false);
  assert.ok(rpgSource.includes('obedience'));

  setupLocalStorage();
  const statsKey = 'ycy_tavern_stats_card_reader';
  const storedStats = JSON.stringify({ favor: 88, obedience: 77, arousal: 66, shame: 55, mood: '旧心境' });
  globalThis.localStorage.setItem(statsKey, storedStats);
  const rpg = await bundled('src/core/tavern/tavernRpg.ts');
  const fresh = rpg.createRpgState('contract', { char: '林夏', user: '学员' });
  rpg.saveRpgState('card_reader', fresh);
  const loaded = rpg.loadRpgState('card_reader');
  assert.equal(loaded.trainee.obedience, fresh.trainee.obedience);
  assert.equal(loaded.trainee.shame, fresh.trainee.shame);
  assert.equal(globalThis.localStorage.getItem(statsKey), storedStats, '读日程不得改写或清掉旧好感记录');
  const prompt = rpg.buildRpgPrompt(loaded, { char: '林夏', user: '学员' });
  assert.equal(prompt.includes('STATUS'), false);
  assert.equal(prompt.includes('好感度'), false);
  assert.ok(prompt.includes('服从'));

  const { sanitizeTavernVisibleContent } = await bundled('src/core/tavern/tavernTextSanitizer.ts');
  const visible = sanitizeTavernVisibleContent('今天先看书。<!--STATUS:{"favor":"+5","mood":"旧心境"}-->', false);
  assert.equal(visible, '今天先看书。');
  assert.equal(globalThis.localStorage.getItem(statsKey), storedStats);

  const { SignInCodeEngine } = await bundled('src/core/tavern/signInCodeEngine.ts');
  assert.equal(SignInCodeEngine.isBackupKey(statsKey), true);
});

test('tavern multimodal images and context budgeting preserve messages, budget tokens, and protect storage quotas', async () => {
  setupLocalStorage();
  const {
    normalizeTavernMessages,
    normalizeAttachedImages,
  } = await bundled('src/core/tavern/tavernData.ts');

  const {
    buildTavernContextWindow,
  } = await bundled('src/core/tavern/tavernContext.ts');

  const {
    SignInCodeEngine,
  } = await bundled('src/core/tavern/signInCodeEngine.ts');

  // 1. normalizeAttachedImages deduplication, size limit, and validation
  const validDataUrl = 'data:image/jpeg;base64,' + 'B'.repeat(100);
  const oversizedDataUrl = 'data:image/jpeg;base64,' + 'B'.repeat(900_000);
  const webUrl = 'https://example.com/photo.jpg';
  const rawList = [validDataUrl, oversizedDataUrl, webUrl, 'javascript:alert(1)', validDataUrl];
  const normalizedImages = normalizeAttachedImages(rawList);
  assert.equal(normalizedImages.length, 2);
  assert.equal(normalizedImages[0], validDataUrl);
  assert.equal(normalizedImages[1], webUrl);

  // 2. normalizeTavernMessages preserves images and fills empty content for image-only messages
  const imageOnlyMessages = normalizeTavernMessages([
    {
      id: 'img-1',
      role: 'user',
      content: '',
      images: [validDataUrl],
    },
    {
      id: 'img-2',
      role: 'assistant',
      content: '我看清楚这张图片了',
    },
  ]);
  assert.equal(imageOnlyMessages.length, 2);
  assert.equal(imageOnlyMessages[0].content, '（发送了图片）');
  assert.equal(imageOnlyMessages[0].images?.length, 1);
  assert.equal(imageOnlyMessages[0].images[0], validDataUrl);

  // 3. Multimodal image token budgeting in context window
  const contextResult = buildTavernContextWindow({
    messages: [
      {
        id: 'msg-img',
        role: 'user',
        content: '请分析这张图',
        images: [validDataUrl],
      },
    ],
    systemPrompt: 'You are an AI assistant.',
    generation: { contextWindowTokens: 4096, maxTokens: 1024, historyMessages: 10 },
  });
  assert.equal(contextResult.messages.length, 1);
  assert.equal(contextResult.messages[0].images.length, 1);
  // Image tokens (128) + message overhead + text token count
  assert.equal(contextResult.historyTokens > 130, true);

  // 4. Backup key validation includes character stats
  assert.equal(SignInCodeEngine.isBackupKey('ycy_tavern_stats_card_alice'), true);
  assert.equal(SignInCodeEngine.isBackupKey('ycy_tavern_draft_card_alice'), true);
  assert.equal(SignInCodeEngine.isBackupKey('ycy_tavern_bookmarks_card_alice'), true);
});

test('non-multimodal models isolate historical images and gracefully degrade to text on vision rejection', async () => {
  setupLocalStorage();
  const {
    isMultimodalUnsupportedError,
    hasImageParts,
    degradeApiMessagesToText,
  } = await bundled('src/core/ai/llmClient.ts');

  // 1. Error detection
  assert.equal(isMultimodalUnsupportedError(new Error("Invalid parameter: 'messages[1].content' must be a string.")), true);
  assert.equal(isMultimodalUnsupportedError(new Error("model 'deepseek-chat' does not support image input")), true);
  assert.equal(isMultimodalUnsupportedError(new Error("API 流式请求失败 (400): BadRequest")), true);
  assert.equal(isMultimodalUnsupportedError(new Error("API 请求失败 (422): unprocessable entity")), true);
  assert.equal(isMultimodalUnsupportedError(new Error("Network timeout after 90s")), false);

  // 2. hasImageParts detection
  const textOnlyMessages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'hello' },
  ];
  assert.equal(hasImageParts(textOnlyMessages), false);

  const multimodalMessages = [
    { role: 'system', content: 'system' },
    {
      role: 'user',
      content: [
        { type: 'text', text: '你看这张图' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
      ],
    },
  ];
  assert.equal(hasImageParts(multimodalMessages), true);

  // 3. degradeApiMessagesToText degrades image_url to plain text and leaves no image parts
  degradeApiMessagesToText(multimodalMessages);
  assert.equal(hasImageParts(multimodalMessages), false);
  assert.equal(typeof multimodalMessages[1].content, 'string');
  assert.equal(multimodalMessages[1].content.includes('你看这张图'), true);
  assert.equal(multimodalMessages[1].content.includes('降级为纯文本'), true);
});
