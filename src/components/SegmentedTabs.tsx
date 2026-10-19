import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  badge?: string;
}

interface SegmentedTabsProps<T extends string> {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * 各页面统一的二级导航：浅灰轨道 + 白色浮起选中项。
 * 标签过多时横向滚动，并在切换时把选中项滚入可视区域。
 */
export function SegmentedTabs<T extends string>({ items, value, onChange, ariaLabel, className = '' }: SegmentedTabsProps<T>) {
  const trackRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const track = trackRef.current;
    const active = track?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!track || !active) return;
    const left = active.offsetLeft - (track.clientWidth - active.offsetWidth) / 2;
    track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [value]);

  return (
    // data-allow-scroll：App 的滚动拦截器会把未标记容器的横向偏移强制归零
    <div ref={trackRef} role="tablist" aria-label={ariaLabel} data-allow-scroll="true" className={`segmented-track ${className}`}>
      {items.map((item) => {
        const Icon = item.icon;
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className="segmented-item"
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={selected ? 2.4 : 2} />}
            <span>{item.label}</span>
            {item.badge && <span className="segmented-badge">{item.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
