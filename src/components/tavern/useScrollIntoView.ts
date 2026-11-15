import { useEffect, useRef } from 'react';

/** 编辑区插在长列表上方时，把当前视野滚到它，避免点了编辑却停在原来的卡片上。 */
export function useScrollIntoView<T extends HTMLElement>(key: string | number | null | undefined) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (key == null || key === '') return;
    ref.current?.scrollIntoView({ block: 'start', inline: 'nearest' });
  }, [key]);
  return ref;
}
