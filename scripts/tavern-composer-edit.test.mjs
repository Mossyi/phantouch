import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const chat = readFileSync(new URL('../src/components/tavern/TavernChatTab.tsx', import.meta.url), 'utf8');
const cards = readFileSync(new URL('../src/components/tavern/TavernCardsTab.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('酒馆输入框超过视口四成后在框内滚动，外层滚动守卫不把光标拉回开头', () => {
  assert.match(chat, /max-h-\[40vh\]/);
  assert.match(chat, /overflow-y-auto/);
  assert.match(chat, /visualViewport\?\.height/);
  assert.equal(chat.includes('Math.min(Math.max(el.scrollHeight, 60), 128)'), false);
  assert.match(app, /tag === 'TEXTAREA'/);
});

test('角色卡编辑打开在页面最上层，不藏在列表滚动位置上面', () => {
  assert.match(cards, /createPortal\(/);
  assert.match(cards, /role="dialog"/);
  assert.match(cards, /aria-label=\{editingCard\.name \? `编辑角色：\$\{editingCard\.name\}`/);
  assert.match(cards, /z-\[10020\]/);
});
