import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../src/components/tavern/useScrollIntoView.ts', import.meta.url), 'utf8');
const world = readFileSync(new URL('../src/components/tavern/TavernWorldbookManager.tsx', import.meta.url), 'utf8');
const presets = readFileSync(new URL('../src/components/tavern/TavernPlayerPresetsTab.tsx', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../src/components/tavern/TavernTextRulesTab.tsx', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../src/views/ChatView.tsx', import.meta.url), 'utf8');

test('长列表里的编辑区会滚进当前视野', () => {
  assert.match(hook, /scrollIntoView\(\{ block: 'start'/);
  assert.match(world, /useScrollIntoView<HTMLDivElement>\(entryDraft\?\.id/);
  assert.match(world, /ref=\{entryEditorRef\}/);
  assert.match(presets, /useScrollIntoView<HTMLDivElement>\(draft \? \(draft\.id \|\| 'new-preset'\) : null\)/);
  assert.match(presets, /ref=\{draftRef\}/);
  assert.match(rules, /useScrollIntoView<HTMLElement>\(draft\?\.id/);
  assert.match(rules, /ref=\{draftRef\}/);
});

test('伴侣对话输入框同样在框内滚动', () => {
  assert.match(chat, /max-h-\[40vh\]/);
  assert.match(chat, /overflow-y-auto/);
  assert.match(chat, /visualViewport\?\.height/);
});
