import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const load = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const pngChunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
};

const textChunk = (keyword, text) => pngChunk('tEXt', Buffer.concat([
  Buffer.from(keyword, 'latin1'),
  Buffer.from([0]),
  Buffer.from(text, 'latin1'),
]));

const pngWithCards = (chunks) => Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  ...chunks,
  pngChunk('IEND', Buffer.alloc(0)),
]);

test('角色卡导入：V1、损坏 JSON、对象式世界书，以及 PNG 里 ccv3 优先于旧 chara', async () => {
  const { TavernCardParser } = await load('../src/core/tavern/tavernCardParser.ts');

  const v1 = TavernCardParser.parseJsonCard(JSON.stringify({
    name: '林夏',
    first_mes: '先坐下。水还热。',
    personality: '安静',
    hardware_enchanted: true,
  }));
  assert.equal(v1?.name, '林夏');
  assert.equal(v1?.firstMessage, '先坐下。水还热。');
  assert.equal(v1?.hardwareEnchanted, false, '导入的卡不能因为 JSON 字段就打开硬件');

  assert.equal(TavernCardParser.parseJsonCard('{'), null);
  assert.equal(TavernCardParser.parseJsonCard(''), null);
  assert.equal(TavernCardParser.parseJsonCard('{"spec":"chara_card_v2","data":{}}'), null);
  assert.equal(TavernCardParser.parseJsonCard(`{"name":"${'书'.repeat(2_000_001)}"}`), null);

  const v2 = TavernCardParser.parseJsonCard(JSON.stringify({
    spec: 'chara_card_v2',
    data: {
      name: '周衡',
      first_mes: '先报编号。',
      character_book: {
        entries: {
          0: { keys: ['档案室'], content: '只收结论。', enabled: true, secondary_keys: ['目录'] },
          1: { keys: ['停用'], content: '这条不该出现', enabled: false },
        },
      },
    },
  }));
  assert.equal(v2?.name, '周衡');
  assert.equal(v2?.worldBookEntries?.length, 2);
  assert.deepEqual(v2?.worldBookEntries?.[0].keywords, ['档案室']);
  assert.deepEqual(v2?.worldBookEntries?.[0].secondaryKeywords, ['目录']);
  assert.equal(v2?.worldBookEntries?.[1].enabled, false);
  assert.equal(TavernCardParser.buildWorldBookContext(v2, '请打开档案室的目录').includes('只收结论'), true);
  assert.equal(TavernCardParser.buildWorldBookContext(v2, '停用').includes('不该出现'), false);

  const oldCard = Buffer.from(JSON.stringify({ name: '旧卡', first_mes: '旧开场' })).toString('base64');
  const newCard = Buffer.from(JSON.stringify({ spec: 'chara_card_v3', data: { name: '新卡', first_mes: '新开场' } })).toString('base64');
  const png = pngWithCards([
    textChunk('chara', oldCard),
    textChunk('ccv3', newCard),
  ]);
  const embedded = TavernCardParser.readEmbeddedCharacterJson(png);
  const fromPng = TavernCardParser.parseJsonCard(embedded);
  assert.equal(fromPng?.name, '新卡');
  assert.equal(fromPng?.firstMessage, '新开场');

  const onlyOld = TavernCardParser.parseJsonCard(TavernCardParser.readEmbeddedCharacterJson(pngWithCards([
    textChunk('chara', oldCard),
  ])));
  assert.equal(onlyOld?.name, '旧卡');
  assert.equal(TavernCardParser.readEmbeddedCharacterJson(Buffer.from('not a png')), null);

  const brokenV3 = pngWithCards([
    textChunk('chara', oldCard),
    textChunk('ccv3', Buffer.from('not-json').toString('base64')),
  ]);
  assert.equal(TavernCardParser.parseJsonCard(TavernCardParser.readEmbeddedCharacterJson(brokenV3))?.name, '旧卡');
});

test('损坏的日程和聊天存档会被忽略，不抛错，也不改成另一张卡', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  try {
    const rpg = await load('../src/core/tavern/tavernRpg.ts');
    storage.set('ycy_tavern_rpg_card_broken', '{');
    assert.equal(rpg.loadRpgState('card_broken'), null);
    storage.set('ycy_tavern_rpg_card_array', '[1,2,3]');
    assert.equal(rpg.loadRpgState('card_array'), null);
    const fresh = rpg.createRpgState('contract', { char: '林夏', user: '学员' });
    assert.equal(rpg.saveRpgState('card_lin', fresh), true);
    assert.equal(rpg.loadRpgState('card_lin').day, 1);
    assert.equal(rpg.loadRpgState('card_other'), null);

    const { TavernStore } = await load('../src/core/tavern/tavernData.ts');
    storage.set('ycy_tavern_chat_card_broken', '{not json');
    const store = TavernStore.getInstance();
    assert.equal(store.getSession('card_broken'), null);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.__YCY_DEVICE_MANAGER__;
  }
});
