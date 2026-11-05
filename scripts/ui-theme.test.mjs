import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** 可切换界面主题：默认仍为玫瑰石英，选择持久化，主题样式不泄漏到默认主题 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const loadBundledModule = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

test('主题列表：四套主题，默认玫瑰石英，非法值回退默认', async () => {
  const { UI_THEMES, DEFAULT_UI_THEME, normalizeUiTheme } = await loadBundledModule('../src/core/ui/theme.ts');
  assert.deepEqual(UI_THEMES.map((theme) => theme.id), ['rose', 'neon', 'minimal', 'aurora']);
  assert.equal(DEFAULT_UI_THEME, 'rose');
  assert.equal(normalizeUiTheme('neon'), 'neon');
  assert.equal(normalizeUiTheme('<script>'), 'rose');
  assert.equal(normalizeUiTheme(undefined), 'rose');
});

test('切换主题：写入 html[data-theme]、同步状态栏颜色并持久化；默认主题移除属性', async () => {
  const storage = new Map();
  const attributes = new Map();
  const meta = { content: '', setAttribute: (key, value) => { if (key === 'content') meta.content = value; } };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.document = {
    documentElement: {
      style: {},
      setAttribute: (key, value) => attributes.set(key, value),
      removeAttribute: (key) => attributes.delete(key),
    },
    querySelector: () => meta,
  };
  try {
    const { setUiTheme, loadUiTheme, UI_THEME_STORAGE_KEY } = await loadBundledModule('../src/core/ui/theme.ts');
    assert.equal(loadUiTheme(), 'rose', '没有保存过时用默认主题');
    setUiTheme('neon');
    assert.equal(attributes.get('data-theme'), 'neon');
    assert.equal(document.documentElement.style.colorScheme, 'dark');
    assert.equal(meta.content, '#0e0a12');
    assert.equal(JSON.parse(storage.get(UI_THEME_STORAGE_KEY)), 'neon');
    assert.equal(loadUiTheme(), 'neon');
    setUiTheme('rose');
    assert.equal(attributes.has('data-theme'), false);
    assert.equal(document.documentElement.style.colorScheme, 'light');
  } finally {
    delete globalThis.localStorage;
    delete globalThis.document;
  }
});

test('index.html 的启动脚本与主题列表保持一致，避免启动时闪默认配色', async () => {
  const { UI_THEMES, UI_THEME_STORAGE_KEY } = await loadBundledModule('../src/core/ui/theme.ts');
  const html = await readFile(`${ROOT}/index.html`, 'utf-8');
  assert.ok(html.includes(`localStorage.getItem('${UI_THEME_STORAGE_KEY}')`));
  for (const theme of UI_THEMES.filter((item) => item.id !== 'rose')) {
    assert.ok(html.includes(`theme === '${theme.id}'`), `启动脚本缺少主题 ${theme.id}`);
  }
});

test('themes.css 的每条规则都限定在 html[data-theme="..."] 下，不影响默认主题', async () => {
  const css = (await readFile(`${ROOT}/src/styles/themes.css`, 'utf-8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  const blockPattern = /([^{}]+)\{[^{}]*\}/g;
  let match;
  while ((match = blockPattern.exec(css))) {
    const selectorText = match[1].replace(/@media[^{]*$/, '').trim();
    if (!selectorText || selectorText.startsWith('@')) continue;
    selectors.push(...selectorText.split(/,(?![^(]*\))/).map((item) => item.trim()).filter(Boolean));
  }
  assert.ok(selectors.length > 100, `解析到的选择器过少：${selectors.length}`);
  const leaking = selectors.filter((selector) => !/^html\[data-theme="(neon|minimal|aurora)"\]/.test(selector));
  assert.deepEqual(leaking, []);
  for (const theme of ['neon', 'minimal', 'aurora']) {
    assert.ok(css.includes(`html[data-theme="${theme}"] {`), `${theme} 缺少变量定义`);
  }
});
