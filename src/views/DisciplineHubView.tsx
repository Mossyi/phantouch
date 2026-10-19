import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { ControlView } from './ControlView';
import { PatternsView } from './PatternsView';
import { HeartRateView } from './HeartRateView';
import { EdgingView } from './EdgingView';
import { ContractView } from './ContractView';
import { Sliders, Waves, Heart, Ban, Lock } from 'lucide-react';
import { SegmentedTabs } from '../components/SegmentedTabs';

export const DisciplineHubView: React.FC = () => {
  const { activeTab, setActiveTab, heartRateState, edgingState, contractState } = useAppStore();

  const subTabs = [
    { id: 'control' as const, label: '控制', icon: Sliders },
    { id: 'patterns' as const, label: '工坊', icon: Waves },
    {
      id: 'heartrate' as const,
      label: '心率',
      icon: Heart,
      badge: heartRateState?.isConnected ? `${heartRateState.currentBpm}` : undefined,
    },
    {
      id: 'edging' as const,
      label: '控射',
      icon: Ban,
      badge: edgingState?.isActive ? `${edgingState.completedRounds}/${edgingState.targetRounds}` : undefined,
    },
    {
      id: 'contract' as const,
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
      <div className="subnav-bar sticky top-0 z-20 shrink-0 px-3 py-2">
        <SegmentedTabs
          ariaLabel="强度调控分区"
          items={subTabs}
          value={currentSubTab as (typeof subTabs)[number]['id']}
          onChange={(id) => setActiveTab(id)}
          className="mx-auto max-w-md"
        />
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
