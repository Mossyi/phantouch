import React from 'react';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';

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
  // 标签放不下时在边缘加渐隐，提示还能横向滑动（否则靠右的标签很容易被忽略）
  const [overflow, setOverflow] = React.useState({ left: false, right: false });
  const updateOverflow = React.useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const left = track.scrollLeft > 4;
    const right = track.scrollLeft + track.clientWidth < track.scrollWidth - 4;
    setOverflow((current) => (current.left === left && current.right === right ? current : { left, right }));
  }, []);

  React.useEffect(() => {
    updateOverflow();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(track);
    return () => observer.disconnect();
  }, [updateOverflow, items.length]);

  React.useEffect(() => {
    const track = trackRef.current;
    const active = track?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!track || !active) return;
    const left = active.offsetLeft - (track.clientWidth - active.offsetWidth) / 2;
    track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [value]);

  const scrollBy = (distance: number) => trackRef.current?.scrollBy({ left: distance, behavior: 'smooth' });
  return (
    <div className={`relative ${className}`}>
      {overflow.left && (
        <button type="button" aria-label={`${ariaLabel}向左`} onClick={() => scrollBy(-160)} className="absolute left-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {/* data-allow-scroll：App 的滚动拦截器会把未标记容器的横向偏移强制归零 */}
      <div
        ref={trackRef}
        role="tablist"
        aria-label={ariaLabel}
        data-allow-scroll="true"
        onScroll={updateOverflow}
        className={`segmented-track ${overflow.left || overflow.right ? '!px-8' : ''} ${overflow.left ? 'segmented-track--more-left' : ''} ${overflow.right ? 'segmented-track--more-right' : ''}`}
      >
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
      {overflow.right && (
        <button type="button" aria-label={`${ariaLabel}向右`} onClick={() => scrollBy(160)} className="absolute right-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
