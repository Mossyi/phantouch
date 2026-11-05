import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** 内置角色卡：字段完整、id 唯一；新增的调教角色都约定了安全词 */

const loadBundledModule = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

test('内置角色卡字段完整、id 唯一、短名可用于训练日程', async () => {
  const { PRESET_TAVERN_CARDS } = await loadBundledModule('../src/core/tavern/presetCards.ts');
  assert.ok(PRESET_TAVERN_CARDS.length >= 11);
  const ids = PRESET_TAVERN_CARDS.map((card) => card.id);
  assert.equal(new Set(ids).size, ids.length, 'id 不能重复');
  for (const card of PRESET_TAVERN_CARDS) {
    for (const field of ['id', 'name', 'avatar', 'tag', 'description', 'personality', 'scenario', 'firstMessage']) {
      assert.ok(typeof card[field] === 'string' && card[field].trim(), `${card.id} 缺少 ${field}`);
    }
    assert.equal(card.source, 'preset');
    const shortName = card.name.split(/\s*[·・|｜]\s*/)[0];
    assert.ok(shortName && shortName.length <= 8, `${card.name} 的短名太长：${shortName}`);
  }
});

test('新增的调教角色都约定了安全词，并给出调教风格和建议回复', async () => {
  const { PRESET_TAVERN_CARDS } = await loadBundledModule('../src/core/tavern/presetCards.ts');
  const added = ['tavern_vera_gentle', 'tavern_irene_drill', 'tavern_kuzunoha_fox', 'tavern_zero_lab_ai', 'tavern_eleanor_vampire', 'tavern_twin_demons'];
  for (const id of added) {
    const card = PRESET_TAVERN_CARDS.find((entry) => entry.id === id);
    assert.ok(card, `缺少 ${id}`);
    assert.match(card.firstMessage, /安全词|终止指令|收手/, `${id} 开场白要约定安全词`);
    assert.match(card.systemPromptAddon, /安全词|终止指令/, `${id} 的系统补充要说明安全词`);
    assert.ok(card.alternateGreetings.length >= 2, `${id} 至少两条备选开场白`);
    assert.ok(card.suggestedReplies.length >= 3, `${id} 至少三条建议回复`);
    assert.equal(card.hardwareEnchanted, true);
  }
});
