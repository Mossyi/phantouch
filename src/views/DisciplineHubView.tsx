import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { ControlView } from './ControlView';
import { PatternsView } from './PatternsView';
import { HeartRateView } from './HeartRateView';
import { EdgingView } from './EdgingView';
import { ContractView } from './ContractView';
import { Sliders, Waves, Heart, Ban, Lock } from 'lucide-react';

export const DisciplineHubView: React.FC = () => {
  const { activeTab, setActiveTab, heartRateState, edgingState, contractState } = useAppStore();

  const subTabs = [
    { id: 'control', label: '控制', icon: Sliders },
    { id: 'patterns', label: '工坊', icon: Waves },
    {
      id: 'heartrate',
      label: '心率',
      icon: Heart,
      badge: heartRateState?.isConnected ? `${heartRateState.currentBpm}` : undefined,
    },
    {
      id: 'edging',
      label: '控射',
      icon: Ban,
      badge: edgingState?.isActive ? `${edgingState.completedRounds}/${edgingState.targetRounds}` : undefined,
    },
    {
      id: 'contract',
      label: '契约',
      icon: Lock,
      badge: contractState?.isActive ? '锁定' : undefined,
    },
  ];

  // 确保当前选中的是有效的 subTab
  const currentSubTab = ['control', 'patterns', 'heartrate', 'edging', 'contract'].includes(activeTab)
    ? activeTab
    : 'control';

  return (
    <div className="flex flex-col min-h-full">
      {/* 🍎 顶部优雅的微型滑动分段控制器 (Apple Liquid Glass Segmented Pill) */}
      <div className="liquid-header sticky top-0 z-20 shrink-0 px-3 py-2">
        <div className="liquid-pill-track max-w-md mx-auto flex gap-1 p-1 overflow-x-auto scrollbar-none">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 flex items-center justify-center gap-1.5 relative active:scale-95 ${
                  isActive
                    ? 'liquid-pill-active'
                    : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold shadow-xs ${isActive ? 'bg-white/25 text-white' : 'bg-rose-500 text-white'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 渲染具体的子调控视图 */}
      <div className="flex-1">
        {currentSubTab === 'control' && <ControlView />}
        {currentSubTab === 'patterns' && <PatternsView />}
        {currentSubTab === 'heartrate' && <HeartRateView />}
        {currentSubTab === 'edging' && <EdgingView />}
        {currentSubTab === 'contract' && <ContractView />}
      </div>
    </div>
  );
};
