import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const load = async () => {
  const entryPoint = fileURLToPath(new URL('../src/core/tavern/tavernRpgScene.ts', import.meta.url));
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
    loader: { '.webp': 'dataurl' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

test('场景背景：生成图优先，否则用地点类型，特殊和未知退回居所', async () => {
  const scene = await load();
  const generated = scene.resolveSceneBackground('bath', 'data:image/webp;base64,AAAA');
  assert.equal(generated.source, 'generated');
  assert.equal(generated.src.startsWith('data:image/webp'), true);
  const kind = scene.resolveSceneBackground('cafe', '');
  assert.equal(kind.source, 'kind');
  assert.equal(kind.src, scene.RPG_SCENE_BACKGROUNDS.cafe);
  const special = scene.resolveSceneBackground('special', null);
  assert.equal(special.source, 'fallback');
  assert.equal(special.src, scene.RPG_SCENE_BACKGROUNDS.home);
  const unknown = scene.resolveSceneBackground('attic', 'not-a-url');
  assert.equal(unknown.source, 'fallback');
  assert.equal(unknown.src, scene.RPG_SCENE_BACKGROUNDS.home);
  for (const key of ['bedroom', 'home', 'bath', 'playroom', 'shop', 'work', 'cafe', 'outdoor']) {
    assert.equal(typeof scene.RPG_SCENE_BACKGROUNDS[key], 'string');
    assert.ok(scene.RPG_SCENE_BACKGROUNDS[key].length > 32);
  }
});

test('时段叠层和天气效果按当前时段、天气对应', async () => {
  const scene = await load();
  assert.deepEqual(scene.PERIOD_LIGHTS.map((item) => item.id), ['dawn', 'day', 'dusk', 'night']);
  assert.equal(scene.periodLight(0).label, '清晨');
  assert.equal(scene.periodLight(2).id, 'dusk');
  assert.match(scene.periodLight(3).wash, /16,\s*28,\s*72/);
  assert.equal(scene.periodLight(9).id, 'day');
  assert.equal(scene.weatherFx('rain'), 'rain');
  assert.equal(scene.weatherFx('snow'), 'snow');
  assert.equal(scene.weatherFx('fog'), 'fog');
  assert.equal(scene.weatherFx('clear'), 'none');
  assert.equal(scene.weatherFx('storm'), 'none');
});

test('立绘：当前表情、平静差分、头像图片，否则只留名牌', async () => {
  const scene = await load();
  const card = {
    avatar: 'data:image/png;base64,BBBB',
    expressions: { neutral: 'data:image/png;base64,NEUT', blush: 'data:image/png;base64,BLUSH' },
  };
  assert.equal(scene.resolveSceneSprite(card, 'blush').src.endsWith('BLUSH'), true);
  assert.equal(scene.resolveSceneSprite(card, 'blush').mode, 'image');
  assert.equal(scene.resolveSceneSprite(card, 'angry').src.endsWith('NEUT'), true);
  const avatarOnly = scene.resolveSceneSprite({ avatar: 'https://example.com/a.png' }, 'smile');
  assert.equal(avatarOnly.mode, 'image');
  const plate = scene.resolveSceneSprite({ avatar: '🎴' }, 'neutral');
  assert.equal(plate.mode, 'plate');
  assert.equal(plate.src, '🎴');
  assert.equal(scene.resolveSceneSprite(null, 'smile').mode, 'plate');
});

test('默认场景图压到 1MB 以内，场景开关记在本地且不影响存档字段', async () => {
  const dir = fileURLToPath(new URL('../src/assets/rpg-scenes/', import.meta.url));
  const files = readdirSync(dir).filter((name) => name.endsWith('.webp'));
  assert.equal(files.length, 8);
  const total = files.reduce((sum, name) => sum + statSync(`${dir}${name}`).size, 0);
  assert.ok(total < 1_000_000, `背景合计 ${total} 字节`);
  const scene = await load();
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  assert.equal(scene.loadSceneMode(), 'open');
  scene.saveSceneMode('off');
  assert.equal(scene.loadSceneMode(), 'off');
  delete globalThis.localStorage;
});
