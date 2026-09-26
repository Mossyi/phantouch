import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function bundled(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
}

test('tavernVisualsAndSprites: deduction, normalization, and sprite fallback logic', async () => {
  const {
    CANONICAL_TAVERN_EMOTIONS,
    CANONICAL_TAVERN_EMOTION_MAP,
    TAVERN_EMOTION_KEYS,
    deduceTavernEmotion,
    resolveActiveCardSprite,
  } = await bundled('src/core/tavern/tavernEmotions.ts');

  const {
    normalizeSceneWallpaper,
    normalizeSceneWallpaperOverlay,
    normalizeExpressions,
  } = await bundled('src/core/tavern/tavernData.ts');

  const { TavernCardParser } = await bundled('src/core/tavern/tavernCardParser.ts');

  // 1. Check canonical emotion categories
  assert.equal(CANONICAL_TAVERN_EMOTIONS.length, 8);
  assert.equal(TAVERN_EMOTION_KEYS.length, 8);
  assert.ok(CANONICAL_TAVERN_EMOTION_MAP['blush']);
  assert.equal(CANONICAL_TAVERN_EMOTION_MAP['blush'].label, '害羞 / 脸红');
  assert.equal(CANONICAL_TAVERN_EMOTION_MAP['aroused'].label, '动情 / 沉沦');

  // 2. Emotion deduction: explicit tag stripping
  const taggedReply = '好的，主人… [emotion:blush] 我马上就去准备！';
  const tagResult = deduceTavernEmotion({ reply: taggedReply });
  assert.equal(tagResult.emotion, 'blush');
  assert.equal(tagResult.source, 'tag');
  assert.equal(tagResult.cleanedReply, '好的，主人…  我马上就去准备！');

  // 3. Emotion deduction: hardware and biometrics
  const hwResult = deduceTavernEmotion({ reply: '你好', hardwareActive: true });
  assert.equal(hwResult.emotion, 'aroused');
  assert.equal(hwResult.source, 'hardware');

  const statsAroused = deduceTavernEmotion({ reply: '等一下…', stats: { arousal: 80, shame: 20, obedience: 50, favor: 50 } });
  assert.equal(statsAroused.emotion, 'aroused');

  const statsBlush = deduceTavernEmotion({ reply: '你别看我…', stats: { arousal: 40, shame: 75, obedience: 50, favor: 50 } });
  assert.equal(statsBlush.emotion, 'blush');

  const statsAngry = deduceTavernEmotion({ reply: '哼！', stats: { arousal: 20, shame: 10, obedience: 10, favor: 20 } });
  assert.equal(statsAngry.emotion, 'angry');

  const statsSmile = deduceTavernEmotion({ reply: '今天天气真好。', stats: { arousal: 20, shame: 10, obedience: 60, favor: 85 } });
  assert.equal(statsSmile.emotion, 'smile');

  // 4. Emotion deduction: regex action heuristics
  const actionBlush = deduceTavernEmotion({ reply: '……才没有呢。*她低下头，两颊浮现出一抹娇羞的绯红*' });
  assert.equal(actionBlush.emotion, 'blush');

  const actionAngry = deduceTavernEmotion({ reply: '*她薄怒地瞪了他一眼，不满地蹙起眉头* 放肆！' });
  assert.equal(actionAngry.emotion, 'angry');

  const actionSad = deduceTavernEmotion({ reply: '*眼眶泛红，泪水在眼里打转* 真的不要我了吗……' });
  assert.equal(actionSad.emotion, 'sad');

  const actionShocked = deduceTavernEmotion({ reply: '*她猛地一震，不可置信地瞪大了双眼* 怎么会这样？！' });
  assert.equal(actionShocked.emotion, 'shocked');

  const actionSmug = deduceTavernEmotion({ reply: '*嘴角微微上扬，露出一抹狡黠玩味的坏笑* 抓到你了哦。' });
  assert.equal(actionSmug.emotion, 'smug');

  const fallbackNeutral = deduceTavernEmotion({ reply: '请问接下来我们要去哪里？' });
  assert.equal(fallbackNeutral.emotion, 'neutral');
  assert.equal(fallbackNeutral.source, 'fallback');

  // 5. Sprite fallback resolution
  const mockCard = {
    id: 'test_card',
    name: '测试角色',
    avatar: 'https://example.com/default_avatar.jpg',
    tag: 'test',
    description: 'test',
    personality: 'test',
    scenario: 'test',
    firstMessage: 'test',
    expressions: {
      neutral: 'data:image/webp;base64,NEUTRAL_SPRITE',
      blush: 'data:image/webp;base64,BLUSH_SPRITE',
      aroused: 'data:image/webp;base64,AROUSED_SPRITE',
    },
  };

  // Exact match
  assert.equal(resolveActiveCardSprite(mockCard, 'blush'), 'data:image/webp;base64,BLUSH_SPRITE');
  assert.equal(resolveActiveCardSprite(mockCard, 'aroused'), 'data:image/webp;base64,AROUSED_SPRITE');

  // Missing emotion -> fall back to neutral sprite
  assert.equal(resolveActiveCardSprite(mockCard, 'angry'), 'data:image/webp;base64,NEUTRAL_SPRITE');
  assert.equal(resolveActiveCardSprite(mockCard, 'shocked'), 'data:image/webp;base64,NEUTRAL_SPRITE');

  // If card has no expressions at all -> fall back to avatar
  const cardNoExpressions = { ...mockCard, expressions: undefined };
  assert.equal(resolveActiveCardSprite(cardNoExpressions, 'blush'), 'https://example.com/default_avatar.jpg');

  // If card is null / undefined -> safe empty string
  assert.equal(resolveActiveCardSprite(null), '');

  // 6. Normalization: Wallpaper and Overlay
  const validDataUrl = 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vuUAAA=';
  assert.equal(normalizeSceneWallpaper(validDataUrl), validDataUrl);
  assert.equal(normalizeSceneWallpaper('https://example.com/wallpaper.png'), 'https://example.com/wallpaper.png');
  assert.equal(normalizeSceneWallpaper('invalid-url-schema'), undefined);

  assert.equal(normalizeSceneWallpaperOverlay(0.65), 0.65);
  assert.equal(normalizeSceneWallpaperOverlay(0.1), 0.2);
  assert.equal(normalizeSceneWallpaperOverlay(0.98), 0.9);
  assert.equal(normalizeSceneWallpaperOverlay('abc'), undefined);

  // 7. Normalization: Expressions
  const normalizedExpr = normalizeExpressions({
    blush: 'data:image/webp;base64,ABC',
    invalid_emotion: 'data:image/webp;base64,XYZ',
  });
  assert.ok(normalizedExpr);
  assert.equal(normalizedExpr.blush, 'data:image/webp;base64,ABC');
  assert.equal(normalizedExpr.invalid_emotion, undefined);

  // 8. Character Card V2 JSON round-trip preserves wallpaper and expressions
  const cardWithVisuals = {
    ...mockCard,
    sceneWallpaper: 'https://example.com/bg.jpg',
    sceneWallpaperOverlay: 0.7,
  };
  const exportedJson = TavernCardParser.exportJsonCard(cardWithVisuals);
  const parsedCard = TavernCardParser.parseJsonCard(exportedJson);
  assert.ok(parsedCard);
  assert.equal(parsedCard.sceneWallpaper, 'https://example.com/bg.jpg');
  assert.equal(parsedCard.sceneWallpaperOverlay, 0.7);
  assert.ok(parsedCard.expressions);
  assert.equal(parsedCard.expressions.blush, 'data:image/webp;base64,BLUSH_SPRITE');
});
