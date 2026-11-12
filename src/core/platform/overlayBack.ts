/** 同时打开的浮层只关最上面一层。安卓返回键和测试都走这里。 */
export const createOverlayStack = () => {
  const stack: Array<() => void> = [];
  return {
    push(close: () => void) {
      stack.push(close);
      return () => {
        const index = stack.lastIndexOf(close);
        if (index >= 0) stack.splice(index, 1);
      };
    },
    closeTop() {
      const close = stack[stack.length - 1];
      if (!close) return false;
      close();
      return true;
    },
    get size() {
      return stack.length;
    },
  };
};

export const overlayBackStack = createOverlayStack();

let listener: { remove: () => Promise<void> } | null = null;
let attaching = false;

const ensureListener = () => {
  if (listener || attaching || overlayBackStack.size === 0) return;
  attaching = true;
  void import('@capacitor/app').then(async ({ App }) => {
    if (overlayBackStack.size === 0) return;
    listener = await App.addListener('backButton', () => {
      overlayBackStack.closeTop();
    });
  }).catch(() => undefined).finally(() => {
    attaching = false;
    if (overlayBackStack.size === 0 && listener) {
      void listener.remove();
      listener = null;
    }
  });
};

export const bindOverlayBack = (close: () => void) => {
  const unbind = overlayBackStack.push(close);
  ensureListener();
  return () => {
    unbind();
    if (overlayBackStack.size === 0 && listener) {
      void listener.remove();
      listener = null;
    }
  };
};
