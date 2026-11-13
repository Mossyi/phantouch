import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const bannerSrc = readFileSync(new URL('../src/components/PWAInstallBanner.tsx', import.meta.url), 'utf8');
const appSrc = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const tabsSrc = readFileSync(new URL('../src/components/SegmentedTabs.tsx', import.meta.url), 'utf8');
const chatSrc = readFileSync(new URL('../src/components/tavern/TavernChatTab.tsx', import.meta.url), 'utf8');
const sensorSrc = readFileSync(new URL('../src/components/tavern/RpgSensorChallengeModal.tsx', import.meta.url), 'utf8');

test('安装条让开顶栏和二级导航，分区条可以翻到屏幕外的入口', () => {
  assert.equal(bannerSrc.includes('fixed '), false);
  const main = appSrc.indexOf('<main');
  const banner = appSrc.indexOf('<PWAInstallBanner />');
  const view = appSrc.indexOf("activeTab === 'tavern' && <TavernView");
  assert.ok(main > 0 && banner > main && view > banner);
  assert.match(tabsSrc, /aria-label=\{\`\$\{ariaLabel\}向右\`\}/);
  assert.match(chatSrc, /useOverlayBack\(\(\) => setShowActionMenu\(false\), showActionMenu\)/);
  assert.match(chatSrc, /useOverlayBack\(\(\) => setShowGroupModal\(false\), showGroupModal\)/);
  assert.match(sensorSrc, /if \(event\.key === 'Escape'\) cancel\(\)/);
});
