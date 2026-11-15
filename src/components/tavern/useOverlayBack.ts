import { useEffect, useRef } from 'react';
import { bindBackLayer, type BackLayerKind } from '../../core/platform/overlayBack';

/** 打开时登记一层返回目标。后登记的同类浮层先关。 */
export const useBackLayer = (open: boolean, close: () => void, kind: BackLayerKind = 'overlay') => {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return undefined;
    return bindBackLayer(kind, () => closeRef.current());
  }, [open, kind]);
};

/** 浮层打开时，返回键先关掉这一层。 */
export const useOverlayBack = (close: () => void, enabled = true) => useBackLayer(enabled, close, 'overlay');
