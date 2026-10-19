import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('viewport compat: App.tsx root container has fixed inset-0', async () => {
  const content = await readFile(resolve(ROOT, 'src/App.tsx'), 'utf-8');
  assert.ok(content.includes('app-viewport'), 'App.tsx must use app-viewport class');
  assert.ok(content.includes('fixed inset-0'), 'App.tsx must pin viewport with fixed inset-0');
});

test('viewport compat: index.css defines height for root and app-viewport', async () => {
  const content = await readFile(resolve(ROOT, 'src/index.css'), 'utf-8');
  assert.match(content, /\.app-viewport\s*\{[^}]*position:\s*fixed;/s, 'app-viewport must have position: fixed');
  assert.match(content, /\.app-viewport\s*\{[^}]*height:\s*100%;/s, 'app-viewport must have height: 100%');
  assert.match(content, /html,\s*body,\s*#root\s*\{[^}]*height:\s*100%;/s, 'html, body, #root must have height: 100%');
});

test('viewport compat: index.css provides momentum touch scrolling and pan-y for older Android WebViews', async () => {
  const content = await readFile(resolve(ROOT, 'src/index.css'), 'utf-8');
  assert.ok(content.includes('-webkit-overflow-scrolling: touch;'), 'Must support momentum touch scrolling');
  assert.ok(content.includes('touch-action: pan-y;'), 'Must specify pan-y touch-action');
});

test('viewport compat: TavernChatTab and ChatView containers ensure pure flexbox fill and smooth scroll containment', async () => {
  const tavernContent = await readFile(resolve(ROOT, 'src/components/tavern/TavernChatTab.tsx'), 'utf-8');
  const chatContent = await readFile(resolve(ROOT, 'src/views/ChatView.tsx'), 'utf-8');
  
  assert.ok(tavernContent.includes('flex-1 min-h-0 flex flex-col'), 'TavernChatTab must have flex-1 min-h-0 flex flex-col');
  assert.ok(tavernContent.includes('overflow-y-auto p-3 space-y-3 overscroll-contain'), 'TavernChatTab must contain overscroll');
  
  assert.ok(chatContent.includes('flex-1 min-h-0 flex flex-col'), 'ChatView must have flex-1 min-h-0 flex flex-col');
  assert.ok(chatContent.includes('overflow-y-auto px-3.5 py-3 space-y-3.5 relative z-0 overscroll-contain'), 'ChatView must contain overscroll');
});

test('viewport compat: soft keyboard resize configuration for AndroidManifest and MainActivity', async () => {
  const manifest = await readFile(resolve(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf-8');
  assert.ok(manifest.includes('android:windowSoftInputMode="adjustResize"'), 'AndroidManifest.xml must declare adjustResize');

  const mainActivity = await readFile(resolve(ROOT, 'android/app/src/main/java/com/yiciyuan/aicontroller/MainActivity.java'), 'utf-8');
  assert.ok(mainActivity.includes('SOFT_INPUT_ADJUST_RESIZE'), 'MainActivity must programmatically set SOFT_INPUT_ADJUST_RESIZE');

  const appTsx = await readFile(resolve(ROOT, 'src/App.tsx'), 'utf-8');
  assert.ok(appTsx.includes('handleOuterScroll'), 'App.tsx must stabilize outer window scroll');

  const indexCss = await readFile(resolve(ROOT, 'src/index.css'), 'utf-8');
  assert.match(indexCss, /\.app-viewport\s*\{[^}]*max-height:\s*100%;/s, 'app-viewport must have max-height: 100%');
  assert.match(indexCss, /html,\s*body,\s*#root\s*\{[^}]*max-height:\s*100%;/s, 'html, body, #root must have max-height: 100%');
});

test('viewport compat: safe-area-inset-bottom is clamped to prevent keyboard height leakage on Android 10', async () => {
  const indexHtml = await readFile(resolve(ROOT, 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes("property === '--safe-area-inset-bottom'"), 'index.html must intercept --safe-area-inset-bottom');

  const appTsx = await readFile(resolve(ROOT, 'src/App.tsx'), 'utf-8');
  assert.ok(appTsx.includes('clamp(0.35rem,env(safe-area-inset-bottom,0px),1.75rem)'), 'App.tsx nav bar must clamp safe area bottom');

  const chatView = await readFile(resolve(ROOT, 'src/views/ChatView.tsx'), 'utf-8');
  assert.ok(chatView.includes('clamp(0px,env(safe-area-inset-bottom,0px),1.75rem)'), 'ChatView must clamp safe area bottom');

  const tavernTab = await readFile(resolve(ROOT, 'src/components/tavern/TavernChatTab.tsx'), 'utf-8');
  assert.ok(!tavernTab.includes('bottom-[calc(9.3rem+env('), 'TavernChatTab must not have unclamped safe area bottom');
  assert.ok(tavernTab.includes('clamp(0px,env(safe-area-inset-bottom,0px),1.75rem)'), 'TavernChatTab popups must clamp safe area bottom');

  const emergencyBtn = await readFile(resolve(ROOT, 'src/components/EmergencyStopBtn.tsx'), 'utf-8');
  assert.ok(emergencyBtn.includes('clamp(0px,env(safe-area-inset-bottom,0px),1.75rem)'), 'EmergencyStopBtn must clamp safe area bottom');

  const indexCss = await readFile(resolve(ROOT, 'src/index.css'), 'utf-8');
  assert.ok(indexCss.includes('clamp(0px, env(safe-area-inset-bottom, 0px), 1.75rem)'), 'index.css composer must clamp safe area bottom');
});


test('viewport compat: soft-keyboard detection never fires on desktop clicks', async () => {
  const appTsx = await readFile(resolve(ROOT, 'src/App.tsx'), 'utf-8');
  // 电脑浏览器窗口天然比屏幕矮：以屏幕高度为基准会把任何一次点击误判为键盘弹出，底部导航随之隐藏且不可点击
  assert.ok(!appTsx.includes('window.screen'), 'keyboard baseline must not use screen height');
  assert.ok(appTsx.includes('isTextEntryFocused'), 'keyboard state requires a focused text field');
  assert.ok(appTsx.includes('isTouchDevice'), 'keyboard state requires a touch device');
  assert.ok(appTsx.includes('Capacitor.isNativePlatform()'), 'Keyboard plugin is registered only on native platforms');
});
