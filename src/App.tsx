import React, { lazy, Suspense } from 'react';
import { useAppStore } from './store/useAppStore';
import { DeviceStatusBar } from './components/DeviceStatusBar';
import { FloatingEmergencyStop } from './components/EmergencyStopBtn';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { ContractSurgeModal } from './components/ContractSurgeModal';
import { OutputRefusalToast } from './components/OutputRefusalToast';
import { FloatingPipWindow } from './components/FloatingPipWindow';
import { GlobalUpdateChecker } from './components/GlobalUpdateChecker';
import { ChatView } from './views/ChatView';
const FemboyTrainingView = lazy(() => import('./views/FemboyTrainingView').then((module) => ({ default: module.FemboyTrainingView })));
const DisciplineHubView = lazy(() => import('./views/DisciplineHubView').then((module) => ({ default: module.DisciplineHubView })));
const SpaceHubView = lazy(() => import('./views/SpaceHubView').then((module) => ({ default: module.SpaceHubView })));
const TavernView = lazy(() => import('./views/TavernView').then((module) => ({ default: module.TavernView })));
import {
  MessageSquare,
  Sparkles,
  Sliders,
  Crown,
  Settings,
  Flame,
  Heart,
  Ban,
  Lock,
} from 'lucide-react';

export const App: React.FC = () => {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const contractState = useAppStore((state) => state.contractState);
  const edgingState = useAppStore((state) => state.edgingState);
  const heartRateState = useAppStore((state) => state.heartRateState);

  // 支持通过 URL ?tab= 参数直接切换激活页面
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const hashTab = url.hash.replace(/^#\/?/, '').trim();
      const tabParam = url.searchParams.get('tab') || hashTab;
      if (tabParam === 'dungeon') {
        setActiveTab('femboy_training');
        return;
      }
      if (
        tabParam &&
        [
          'tavern',
          'chat',
          'femboy_training',
          'control',
          'patterns',
          'heartrate',
          'edging',
          'contract',
          'settings',
          'device',
          'achievements',
        ].includes(tabParam)
      ) {
        setActiveTab(tabParam as any);
      }
      const pipParam = url.searchParams.get('pip');
      if (pipParam === 'open' || pipParam === '1') {
        useAppStore.getState().setFloatingWindowState({ isOpen: true, isExpanded: false });
      } else if (pipParam === 'expanded') {
        useAppStore.getState().setFloatingWindowState({ isOpen: true, isExpanded: true });
      }
    } catch {}
  }, [setActiveTab]);

  // 若历史状态保存的是已归入重塑的地牢，自动平滑转至重塑
  React.useEffect(() => {
    if (activeTab === ('dungeon' as any)) {
      setActiveTab('femboy_training');
    }
  }, [activeTab, setActiveTab]);

  const [isKeyboardOpen, setIsKeyboardOpen] = React.useState(false);

  // 视口与软键盘协同管理（全平台兼顾：Android 10/小米 8 原生收缩、现代手机 Android 14/iOS、Web 端）
  React.useEffect(() => {
    let removePluginListeners: (() => void) | undefined;

    // 1. 优先使用 Capacitor Keyboard 插件官方事件（针对 Android 11+ 及 iOS）
    import('@capacitor/keyboard')
      .then(({ Keyboard }) => {
        const showHandle = Keyboard.addListener('keyboardWillShow', () => setIsKeyboardOpen(true));
        const hideHandle = Keyboard.addListener('keyboardWillHide', () => setIsKeyboardOpen(false));
        removePluginListeners = () => {
          showHandle.then((h) => h.remove()).catch(() => {});
          hideHandle.then((h) => h.remove()).catch(() => {});
        };
      })
      .catch(() => {});

    // 2. 双重保底机制：基于视口高度收缩判定软键盘状态（针对 Android 10、老旧机型及 Web 端）
    let initialHeight = typeof window !== 'undefined'
      ? Math.max(window.innerHeight, window.screen?.height ? Math.round(window.screen.height / (window.devicePixelRatio || 1)) : 0, 750)
      : 800;

    const checkViewportHeight = () => {
      const h = window.innerHeight;
      const vh = window.visualViewport?.height ?? h;
      const minH = Math.min(h, vh);

      if (minH >= initialHeight - 50) {
        initialHeight = Math.max(initialHeight, minH);
      }

      const diff = initialHeight - minH;
      if (diff > 140) {
        setIsKeyboardOpen(true);
      } else if (diff < 70) {
        setIsKeyboardOpen(false);
      }
    };

    const handleFocusCheck = () => {
      requestAnimationFrame(checkViewportHeight);
      setTimeout(checkViewportHeight, 150);
      setTimeout(checkViewportHeight, 350);
      setTimeout(checkViewportHeight, 600);
    };

    window.addEventListener('resize', checkViewportHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', checkViewportHeight);
    }
    window.addEventListener('focusin', handleFocusCheck);
    window.addEventListener('focusout', handleFocusCheck);
    const handleOrientationChange = () => {
      setTimeout(() => {
        initialHeight = window.innerHeight;
        checkViewportHeight();
      }, 300);
    };
    window.addEventListener('orientationchange', handleOrientationChange);

    // 捕获阶段拦截：若非允许滚动的内部容器产生任何滚动，强制归零，防止父容器被上推产生空白
    const handleOuterScroll = (e?: Event) => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      const target = e?.target;
      if (target && target instanceof HTMLElement) {
        if (
          target.classList.contains('overflow-y-auto') ||
          target.classList.contains('overflow-x-auto') ||
          target.dataset.allowScroll === 'true'
        ) {
          return;
        }
        if (target.scrollTop !== 0) target.scrollTop = 0;
        if (target.scrollLeft !== 0) target.scrollLeft = 0;
      }
    };

    // 获得焦点时重置非滚动容器的偏移
    const resetNonScrollContainers = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      const frames = document.querySelectorAll<HTMLElement>('.app-viewport, main, #root');
      frames.forEach((el) => {
        if (el.scrollTop !== 0) el.scrollTop = 0;
        if (el.scrollLeft !== 0) el.scrollLeft = 0;
      });
    };

    window.addEventListener('scroll', handleOuterScroll, { capture: true, passive: true });
    window.addEventListener('focusin', resetNonScrollContainers, { capture: true });

    return () => {
      removePluginListeners?.();
      window.removeEventListener('resize', checkViewportHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', checkViewportHeight);
      }
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('focusin', handleFocusCheck);
      window.removeEventListener('focusout', handleFocusCheck);
      window.removeEventListener('focusin', resetNonScrollContainers, { capture: true });
    };
  }, []);

  // 动态同步 body.keyboard-open 类，驱动底部输入框紧贴软键盘
  React.useEffect(() => {
    if (isKeyboardOpen) {
      document.body.classList.add('keyboard-open');
    } else {
      document.body.classList.remove('keyboard-open');
    }
  }, [isKeyboardOpen]);

  // 判定当前主 Tab 激活状态
  const isDisciplineActive = ['control', 'patterns', 'heartrate', 'edging', 'contract'].includes(activeTab);
  const isSpaceActive = ['achievements', 'device', 'settings'].includes(activeTab);

  const mainTabs = [
    {
      id: 'tavern',
      label: '酒馆',
      icon: Flame,
      isActive: activeTab === 'tavern',
      action: () => setActiveTab('tavern'),
    },
    {
      id: 'chat',
      label: '伴侣',
      icon: MessageSquare,
      isActive: activeTab === 'chat',
      action: () => setActiveTab('chat'),
    },
    {
      id: 'femboy_training',
      label: '重塑',
      icon: Sparkles,
      isActive: activeTab === 'femboy_training',
      action: () => setActiveTab('femboy_training'),
    },
    {
      id: 'discipline_hub',
      label: '强度',
      icon: Sliders,
      isActive: isDisciplineActive,
      badge: heartRateState?.isConnected
        ? `${heartRateState.currentBpm}`
        : contractState?.isActive
        ? '锁定'
        : edgingState?.isActive
        ? `${edgingState.completedRounds}`
        : undefined,
      action: () => {
        if (!isDisciplineActive) {
          setActiveTab('control');
        }
      },
    },
    {
      id: 'space_hub',
      label: '设置',
      icon: Settings,
      isActive: isSpaceActive,
      action: () => {
        if (!isSpaceActive) {
          setActiveTab('settings');
        }
      },
    },
  ];

  return (
    <div className="app-viewport fixed inset-0 flex flex-col bg-transparent text-slate-800 select-none overflow-hidden w-full">
      {/* 暖白底色 + 顶部一抹玫瑰光晕（纯渐变，无模糊滤镜，低端机零负担） */}
      <div className="app-backdrop pointer-events-none fixed inset-0 z-0" aria-hidden="true" />

      {/* 顶部设备状态栏 */}
      <DeviceStatusBar />

      {/* PWA 桌面化安装横幅提示 */}
      <PWAInstallBanner />

      {/* 突击查岗悬浮响应弹窗 */}
      <ContractSurgeModal />

      {/* 电击被拒绝（急停锁 / 通道上限为 0 / 强度为 0）时的可见提示，
          避免"点了没反应"的静默失败 */}
      <OutputRefusalToast />

      {/* 主视图区域 (自适应填满剩余空间，杜绝双滚动条) */}
      <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        <Suspense fallback={<div className="flex-1 grid place-items-center text-sm font-semibold text-slate-500">正在打开…</div>}>
          {activeTab === 'chat' && <ChatView />}
          {activeTab === 'tavern' && <TavernView />}
          {(activeTab === 'femboy_training' || activeTab === ('dungeon' as any)) && (
            <div className="flex-1 min-h-0 overflow-y-auto pb-24 overscroll-contain">
              <FemboyTrainingView />
            </div>
          )}
          {isDisciplineActive && (
            <div className="flex-1 min-h-0 overflow-y-auto pb-24 overscroll-contain">
              <DisciplineHubView />
            </div>
          )}
          {isSpaceActive && (
            <div className="flex-1 min-h-0 overflow-y-auto pb-24 overscroll-contain">
              <SpaceHubView />
            </div>
          )}
        </Suspense>
      </main>

      {/* 全局右下悬浮急停按钮 */}
      <FloatingEmergencyStop />

      {/* 📱 极简画中画与赛博悬浮窗组件 */}
      <FloatingPipWindow />

      {/* 🔄 全局更新检查：启动与回到前台时自动检查，不受当前页面影响 */}
      <GlobalUpdateChecker />

      {/* 底部悬浮 Dock：选中项以品牌色图标胶囊标识 */}
      <nav
        aria-label="主导航"
        className={`absolute inset-x-3 z-30 bottom-[calc(0.25rem+clamp(0.35rem,env(safe-area-inset-bottom,0px),1.75rem))] select-none transition-all duration-300 ${
          isKeyboardOpen ? 'translate-y-[150%] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100 pointer-events-auto'
        }`}
      >
        <div className="app-dock mx-auto grid h-14 max-w-md grid-cols-5 items-stretch rounded-[1.375rem] px-1.5 py-1">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.isActive;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={tab.action}
                aria-label={tab.label}
                aria-current={active ? 'page' : undefined}
                className="dock-item relative"
              >
                <span className="dock-icon relative">
                  <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={active ? 2.3 : 1.9} />
                  {tab.badge && (
                    <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-full border-2 border-white bg-rose-500 px-1 text-center font-mono text-[9px] font-black leading-[0.95rem] text-white">
                      {tab.badge}
                    </span>
                  )}
                </span>
                <span className={`w-full truncate text-center text-[10.5px] leading-tight ${active ? 'font-extrabold' : 'font-semibold'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default App;
