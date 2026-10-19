import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { AchievementsView } from './AchievementsView';
import { DeviceView } from './DeviceView';
import { SettingsView } from './SettingsView';
import { Trophy, Bluetooth, Settings } from 'lucide-react';
import { SegmentedTabs } from '../components/SegmentedTabs';

export const SpaceHubView: React.FC = () => {
  const { activeTab, setActiveTab, deviceState } = useAppStore();

  const subTabs = [
    { id: 'settings' as const, label: '系统设置', icon: Settings },
    {
      id: 'device' as const,
      label: '设备连接',
      icon: Bluetooth,
      badge: deviceState.connectionStatus === 'connected' ? '已连' : undefined,
    },
    { id: 'achievements' as const, label: '成就殿堂', icon: Trophy },
  ];

  // 确保当前选中的是有效的 subTab
  const currentSubTab = ['settings', 'device', 'achievements'].includes(activeTab)
    ? activeTab
    : 'settings';

  return (
    <div className="flex flex-col min-h-full">
      <div className="subnav-bar sticky top-0 z-20 shrink-0 px-3 py-2">
        <SegmentedTabs
          ariaLabel="设置分区"
          items={subTabs}
          value={currentSubTab as (typeof subTabs)[number]['id']}
          onChange={(id) => setActiveTab(id)}
          className="mx-auto max-w-md"
        />
      </div>

      {/* 渲染具体的子视图 */}
      <div className="flex-1">
        {currentSubTab === 'achievements' && <AchievementsView />}
        {currentSubTab === 'device' && <DeviceView />}
        {currentSubTab === 'settings' && <SettingsView />}
      </div>
    </div>
  );
};
