/** 安卓返回键的统一栈。浮层后进先出，然后才是二级页和底栏。 */

export type BackLayerKind = 'overlay' | 'subnav' | 'tab';

type BackLayer = {
  id: number;
  kind: BackLayerKind;
  close: () => void;
};

const kindRank: Record<BackLayerKind, number> = { overlay: 3, subnav: 2, tab: 1 };

export const createBackStack = () => {
  let nextId = 1;
  const layers: BackLayer[] = [];
  return {
    push(kind: BackLayerKind, close: () => void) {
      const id = nextId++;
      layers.push({ id, kind, close });
      return () => {
        const index = layers.findIndex((layer) => layer.id === id);
        if (index >= 0) layers.splice(index, 1);
      };
    },
    /** 关掉最高的一层。没有可关的层时返回 exit。 */
    handleBack(): 'closed' | 'exit' {
      let best: BackLayer | null = null;
      for (const layer of layers) {
        if (!best || kindRank[layer.kind] > kindRank[best.kind] || (layer.kind === best.kind && layer.id > best.id)) {
          best = layer;
        }
      }
      if (!best) return 'exit';
      best.close();
      return 'closed';
    },
    handleEscape(): boolean {
      let best: BackLayer | null = null;
      for (const layer of layers) {
        if (layer.kind !== 'overlay') continue;
        if (!best || layer.id > best.id) best = layer;
      }
      if (!best) return false;
      best.close();
      return true;
    },
    get size() {
      return layers.length;
    },
    kinds() {
      return layers.map((layer) => layer.kind);
    },
  };
};

/** 旧测试仍用这套只含浮层的栈。 */
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

export const backStack = createBackStack();

export const bindBackLayer = (kind: BackLayerKind, close: () => void) => backStack.push(kind, close);

export const bindOverlayBack = (close: () => void) => bindBackLayer('overlay', close);

export const handleAppBack = (): 'closed' | 'exit' => {
  const result = backStack.handleBack();
  if (result === 'exit') {
    void import('@capacitor/app').then(({ App }) => App.exitApp()).catch(() => undefined);
  }
  return result;
};

export const handleEscape = () => backStack.handleEscape();

let backListener: { remove: () => Promise<void> } | null = null;
let backListenerStarting = false;

/** 整个应用只挂一个返回键监听，空栈时才交给系统退出。 */
export const ensureAppBackListener = () => {
  if (backListener || backListenerStarting || typeof window === 'undefined') return;
  backListenerStarting = true;
  const win = window as Window & { __ycyHandleAppBack?: typeof handleAppBack };
  win.__ycyHandleAppBack = handleAppBack;
  void import('@capacitor/app').then(async ({ App }) => {
    backListener = await App.addListener('backButton', () => {
      handleAppBack();
    });
  }).catch(() => undefined).finally(() => {
    backListenerStarting = false;
  });
};
