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

test('tavernStatusHud correctly normalizes, parses delta tags, and clamps 0-100', async () => {
  setupLocalStorage();
  const {
    DEFAULT_TAVERN_CHARACTER_STATS,
    normalizeCharacterStats,
    parseAndApplyStatusUpdate,
    loadCharacterStats,
    saveCharacterStats,
    resetCharacterStats,
    deleteCharacterStats,
  } = await bundled('src/core/tavern/tavernStatusHud.ts');

  // 1. Defaults and normalization
  const normalized = normalizeCharacterStats({ favor: 120, obedience: -10, arousal: '55', mood: ' 微笑 ' });
  assert.equal(normalized.favor, 100);
  assert.equal(normalized.obedience, 0);
  assert.equal(normalized.arousal, 55);
  assert.equal(normalized.mood, '微笑');

  // 2. Parse relative delta in HTML comment
  const initial = { favor: 40, obedience: 30, arousal: 10, shame: 50, mood: '普通' };
  const rawReply = '（脸颊泛起一丝红晕）主、主人您怎么能这样看我...<!--STATUS:{"favor":"+5","obedience":"+10","arousal":"+25","shame":"-5","mood":"羞赧心慌"}-->';

  const result = parseAndApplyStatusUpdate(rawReply, initial);
  assert.equal(result.updated, true);
  assert.equal(result.cleanedText, '（脸颊泛起一丝红晕）主、主人您怎么能这样看我...');
  assert.equal(result.nextStats.favor, 45);
  assert.equal(result.nextStats.obedience, 40);
  assert.equal(result.nextStats.arousal, 35);
  assert.equal(result.nextStats.shame, 45);
  assert.equal(result.nextStats.mood, '羞赧心慌');

  // 3. Clamping upper and lower bounds on delta
  const extremeResult = parseAndApplyStatusUpdate(
    '回复内容<!--STATUS:{"favor":"+200","shame":"-100"}-->',
    initial
  );
  assert.equal(extremeResult.nextStats.favor, 100);
  assert.equal(extremeResult.nextStats.shame, 0);

  // 4. Persistence roundtrip
  saveCharacterStats('card_alice', extremeResult.nextStats);
  const loaded = loadCharacterStats('card_alice');
  assert.equal(loaded.favor, 100);
  assert.equal(loaded.shame, 0);

  // 5. Reset & Delete
  const reset = resetCharacterStats('card_alice');
  assert.equal(reset.favor, DEFAULT_TAVERN_CHARACTER_STATS.favor);
  assert.equal(loadCharacterStats('card_alice').favor, DEFAULT_TAVERN_CHARACTER_STATS.favor);
  deleteCharacterStats('card_alice');
  assert.equal(loadCharacterStats('card_alice').favor, DEFAULT_TAVERN_CHARACTER_STATS.favor);

  // 6. Tolerate unquoted plus signs and single quotes in JSON payload
  const unquotedResult = parseAndApplyStatusUpdate(
    '回复内容<!--STATUS:{"favor":+5,"obedience":+3,"arousal":-2,\'mood\':\'轻笑\'}-->',
    initial
  );
  assert.equal(unquotedResult.updated, true);
  assert.equal(unquotedResult.cleanedText, '回复内容');
  assert.equal(unquotedResult.nextStats.favor, 45);
  assert.equal(unquotedResult.nextStats.obedience, 33);
  assert.equal(unquotedResult.nextStats.arousal, 8);
  assert.equal(unquotedResult.nextStats.mood, '轻笑');

  // 7. XML tag format <STATUS>{...}</STATUS>
  const xmlResult = parseAndApplyStatusUpdate(
    '回复内容<STATUS>{"favor":"+3","mood":"微笑"}</STATUS>',
    initial
  );
  assert.equal(xmlResult.updated, true);
  assert.equal(xmlResult.cleanedText, '回复内容');
  assert.equal(xmlResult.nextStats.favor, 43);

  // 8. Fallback inference when model outputs no tag
  const fallbackResult = parseAndApplyStatusUpdate(
    '（脸色微红，低声应答）',
    initial,
    '我最喜欢你了，要乖乖听话哦'
  );
  assert.equal(fallbackResult.updated, true);
  assert.equal(fallbackResult.nextStats.favor > initial.favor, true);
  assert.equal(fallbackResult.nextStats.obedience > initial.obedience, true);

  // 9. Tolerate trailing commas in JSON payload
  const trailingCommaResult = parseAndApplyStatusUpdate(
    '回复内容<!--STATUS:{"favor":"+6","mood":"心动",}-->',
    initial
  );
  assert.equal(trailingCommaResult.updated, true);
  assert.equal(trailingCommaResult.cleanedText, '回复内容');
  assert.equal(trailingCommaResult.nextStats.favor, 46);
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
