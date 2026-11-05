import React from 'react';
import { Check, Palette } from 'lucide-react';
import { getUiTheme, setUiTheme, subscribeUiTheme, UI_THEMES, type UiThemeOption } from '../core/ui/theme';

/** 设置 → 通用 → 界面主题：四套主题即点即换，选择保存在本机 */
export const ThemePicker: React.FC = () => {
  const theme = React.useSyncExternalStore(subscribeUiTheme, getUiTheme, getUiTheme);

  return (
    <section className="liquid-card p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-pink-50 text-pink-600">
          <Palette className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-800">界面主题</h3>
          <p className="text-[11px] text-slate-500">即点即换，只保存在这台设备上</p>
        </div>
      </div>
      <div role="radiogroup" aria-label="界面主题" className="grid grid-cols-2 gap-2.5">
        {UI_THEMES.map((option) => (
          <ThemeOptionButton key={option.id} option={option} selected={option.id === theme} onSelect={() => setUiTheme(option.id)} />
        ))}
      </div>
    </section>
  );
};

const ThemeOptionButton: React.FC<{ option: UiThemeOption; selected: boolean; onSelect: () => void }> = ({ option, selected, onSelect }) => {
  const { swatch } = option;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="group relative overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.98]"
      style={{
        boxShadow: selected
          ? '0 0 0 2px var(--brand), 0 8px 20px -10px rgba(0,0,0,0.35)'
          : '0 0 0 1px var(--line)',
      }}
    >
      {/* 缩略预览：全部用内联颜色，不受当前主题覆盖 */}
      <div className="relative h-24 p-2.5" style={{ background: swatch.background }}>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: swatch.accent }} />
          <span className="h-1.5 w-12 rounded-full" style={{ background: swatch.ink, opacity: 0.75 }} />
        </div>
        <div className="mt-2 rounded-lg p-2" style={{ background: swatch.card, boxShadow: '0 4px 12px -6px rgba(0,0,0,0.35)' }}>
          <span className="block h-1.5 w-16 rounded-full" style={{ background: swatch.ink, opacity: 0.8 }} />
          <span className="mt-1.5 block h-1.5 w-10 rounded-full" style={{ background: swatch.muted }} />
          <span className="mt-2 block h-3 w-11 rounded-full" style={{ background: swatch.accent }} />
        </div>
        {selected && (
          <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full" style={{ background: swatch.accent, color: '#fff' }}>
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="text-[13px] font-bold text-slate-800">{option.name}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{option.description}</p>
      </div>
    </button>
  );
};
