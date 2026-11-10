import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('横向日程条允许左右滑动，不再被竖向手势锁死', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const horizontal = css.slice(css.indexOf('.overflow-x-auto'));
  assert.match(horizontal, /touch-action:\s*pan-x pan-y/);
  assert.equal(css.includes('.overflow-x-auto,\n  [class*="overflow-y-auto"]'), false);
  const panel = readFileSync(new URL('../src/components/tavern/TavernRpgPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /label="日程动作"/);
  assert.match(panel, /aria-label="训练日程分页"/);
  assert.match(panel, /strip\.scrollLeft \+= event\.deltaY/);
  assert.match(panel, /\$\{label\}向右/);
  assert.equal(panel.includes('scrollbar-none'), false);
});
