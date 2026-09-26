import React, { lazy, Suspense } from 'react';
import { useAppStore } from './store/useAppStore';
import { DeviceStatusBar } from './components/DeviceStatusBar';
import { FloatingEmergencyStop } from './components/EmergencyStopBtn';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { ContractSurgeModal } from './components/ContractSurgeModal';
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
    <div className="h-[100dvh] flex flex-col bg-transparent text-slate-800 select-none overflow-hidden relative">
      {/* 🌸 visionOS High-Performance Luxury Liquid Ambient Mesh (Zero-GPU-Lag Gradient Mesh) */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 65% 55% at 5% 5%, rgba(251, 182, 206, 0.35) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 95% 15%, rgba(254, 205, 211, 0.38) 0%, transparent 65%),
            radial-gradient(ellipse 70% 60% at 20% 90%, rgba(244, 114, 182, 0.22) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 80% 85%, rgba(253, 226, 236, 0.45) 0%, transparent 60%),
            linear-gradient(180deg, #ffffff 0%, #fffbfc 50%, #fff7fa 100%)
          `,
        }}
        aria-hidden="true"
      />

      {/* 顶部设备状态栏 */}
      <DeviceStatusBar />

      {/* PWA 桌面化安装横幅提示 */}
      <PWAInstallBanner />

      {/* 突击查岗悬浮响应弹窗 */}
      <ContractSurgeModal />

      {/* 主视图区域 (自适应填满剩余空间，杜绝双滚动条) */}
      <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        <Suspense fallback={<div className="flex-1 grid place-items-center text-sm font-bold text-pink-500">正在打开…</div>}>
          {activeTab === 'chat' && <ChatView />}
          {activeTab === 'tavern' && <TavernView />}
          {(activeTab === 'femboy_training' || activeTab === ('dungeon' as any)) && (
            <div className="flex-1 min-h-0 overflow-y-auto pb-16">
              <FemboyTrainingView />
            </div>
          )}
          {isDisciplineActive && (
            <div className="flex-1 min-h-0 overflow-y-auto pb-16">
              <DisciplineHubView />
            </div>
          )}
          {isSpaceActive && (
            <div className="flex-1 min-h-0 overflow-y-auto pb-16">
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

      {/* 🍎 苹果原生晶莹吸底导览栏 (Bottom-anchored Liquid Bar) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 w-full liquid-bottom-bar select-none">
        <div className="w-full grid grid-cols-5 items-center px-2 pt-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom,0px))]">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.isActive;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={tab.action}
                aria-label={tab.label}
                className="flex flex-col items-center justify-center py-0.5 px-0.5 rounded-xl transition-all duration-200 active:scale-90 relative"
              >
                <div
                  className={`relative w-11 h-7 rounded-xl transition-all duration-300 flex items-center justify-center ${
                    active
                      ? 'bg-gradient-to-r from-pink-500/18 via-rose-500/18 to-pink-500/12 text-pink-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.95),0_2px_8px_rgba(244,63,142,0.14)] border border-pink-200/80 scale-105'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/60'
                  }`}
                >
                  <Icon
                    className={`w-[1.2rem] h-[1.2rem] transition-all duration-300 ${
                      active ? 'scale-105 stroke-[2.3] text-pink-600 drop-shadow-[0_1px_3px_rgba(244,63,142,0.35)]' : 'stroke-[1.8]'
                    }`}
                  />
                  {tab.badge && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[8px] bg-gradient-to-r from-pink-500 to-rose-500 text-white font-mono animate-pulse font-black shadow-md shadow-pink-500/30 border border-white">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`mt-0.5 text-[9.5px] leading-tight tracking-tight transition-colors duration-200 truncate w-full text-center ${
                    active ? 'font-black text-pink-600 drop-shadow-[0_1px_1px_rgba(244,63,142,0.12)]' : 'font-bold text-slate-500'
                  }`}
                >
                  {tab.label}
                </span>
                {active ? (
                  <span className="h-[2px] w-3 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 shadow-xs shadow-pink-500/50 mt-0.5" />
                ) : (
                  <span className="h-[2px] w-3 mt-0.5 opacity-0" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default App;
