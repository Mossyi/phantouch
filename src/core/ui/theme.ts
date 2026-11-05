import { readPreference, writePreference } from './localPreferences';

/**
 * 界面主题。默认「玫瑰石英」不设置 data-theme 属性，其余主题通过
 * <html data-theme="..."> 激活 src/styles/themes.css 里对应的覆盖样式。
 * index.html 里有一段内联脚本在样式加载前就读取并应用主题，避免启动时闪一下默认配色。
 */

export type UiThemeId = 'rose' | 'neon' | 'minimal' | 'aurora';

export interface UiThemeOption {
  id: UiThemeId;
  name: string;
  description: string;
  /** 浏览器 / 系统状态栏颜色 */
  themeColor: string;
  /** 设置页缩略预览用的几种代表色 */
  swatch: { background: string; card: string; accent: string; ink: string; muted: string };
}

export const UI_THEME_STORAGE_KEY = 'ycy_ui_theme';
export const DEFAULT_UI_THEME: UiThemeId = 'rose';

export const UI_THEMES: UiThemeOption[] = [
  {
    id: 'rose',
    name: '玫瑰石英',
    description: '默认 · 暖白底与白色卡片，粉色只用于强调',
    themeColor: '#faf7f9',
    swatch: { background: 'linear-gradient(180deg, #fdeef4 0%, #faf7f9 60%)', card: '#ffffff', accent: 'linear-gradient(135deg, #ec5a8f, #e34d6c)', ink: '#221a20', muted: '#d9cfd5' },
  },
  {
    id: 'neon',
    name: '午夜霓虹',
    description: '深色 · 品红与紫色霓虹光，夜里不刺眼',
    themeColor: '#0e0a12',
    swatch: { background: 'radial-gradient(80% 60% at 20% 0%, #3a1748 0%, #0e0a12 70%)', card: 'rgba(36, 27, 44, 0.95)', accent: 'linear-gradient(135deg, #ff4fa3, #c04dff)', ink: '#f5eef6', muted: '#4a3d55' },
  },
  {
    id: 'minimal',
    name: '奶油极简',
    description: 'iOS 风浅色 · 白卡无描边，最清爽',
    themeColor: '#f4f2ef',
    swatch: { background: '#f4f2ef', card: '#ffffff', accent: 'linear-gradient(180deg, #ff6a86, #ff4f72)', ink: '#1c1917', muted: '#e7e3de' },
  },
  {
    id: 'aurora',
    name: '极光玻璃',
    description: '粉紫蓝极光渐变 · 毛玻璃卡片，最梦幻',
    themeColor: '#efe7fd',
    swatch: { background: 'linear-gradient(135deg, #fbc4e0 0%, #d8c4fb 50%, #bfd7fb 100%)', card: 'rgba(255, 255, 255, 0.6)', accent: 'linear-gradient(120deg, #f472b6, #a855f7, #6366f1)', ink: '#2a1d3d', muted: 'rgba(255,255,255,0.75)' },
  },
];

export const normalizeUiTheme = (value: unknown): UiThemeId => (
  UI_THEMES.some((theme) => theme.id === value) ? value as UiThemeId : DEFAULT_UI_THEME
);

export const getUiThemeOption = (id: UiThemeId): UiThemeOption => (
  UI_THEMES.find((theme) => theme.id === id) || UI_THEMES[0]
);

export const loadUiTheme = (): UiThemeId => normalizeUiTheme(readPreference<unknown>(UI_THEME_STORAGE_KEY, DEFAULT_UI_THEME));

let currentTheme: UiThemeId | null = null;
const listeners = new Set<(theme: UiThemeId) => void>();

export const applyUiTheme = (id: UiThemeId) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (id === DEFAULT_UI_THEME) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', id);
  root.style.colorScheme = id === 'neon' ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', getUiThemeOption(id).themeColor);
};

export const getUiTheme = (): UiThemeId => {
  if (currentTheme === null) currentTheme = loadUiTheme();
  return currentTheme;
};

export const setUiTheme = (value: unknown): UiThemeId => {
  const id = normalizeUiTheme(value);
  currentTheme = id;
  writePreference(UI_THEME_STORAGE_KEY, id);
  applyUiTheme(id);
  listeners.forEach((listener) => {
    try { listener(id); } catch (error) { console.warn('主题监听器异常:', error); }
  });
  return id;
};

export const subscribeUiTheme = (listener: (theme: UiThemeId) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 读取当前主题下的 CSS 变量（canvas 绘图用），取不到时用默认值 */
export const readThemeColor = (variable: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
};
