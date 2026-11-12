import { useEffect, useRef } from 'react';
import { bindOverlayBack } from '../../core/platform/overlayBack';

/** 浮层打开时，安卓返回键先关掉这一层，而不是直接退出应用。 */
export const useOverlayBack = (close: () => void) => {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => bindOverlayBack(() => closeRef.current()), []);
};
