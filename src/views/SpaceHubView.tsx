import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { AchievementsView } from './AchievementsView';
import { DeviceView } from './DeviceView';
import { SettingsView } from './SettingsView';
import { Trophy, Bluetooth, Settings } from 'lucide-react';

export const SpaceHubView: React.FC = () => {
  const { activeTab, setActiveTab, deviceState } = useAppStore();

  const subTabs = [
    { id: 'settings', label: '系统设置', icon: Settings },
    {
      id: 'device',
      label: '设备连接',
      icon: Bluetooth,
      badge: deviceState.connectionStatus === 'connected' ? '已连' : undefined,
    },
    { id: 'achievements', label: '成就殿堂', icon: Trophy },
  ];

  // 确保当前选中的是有效的 subTab
  const currentSubTab = ['settings', 'device', 'achievements'].includes(activeTab)
    ? activeTab
    : 'settings';

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
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 flex items-center justify-center gap-1.5 relative active:scale-95 ${
                  isActive
                    ? 'liquid-pill-active'
                    : 'text-slate-600 hover:text-pink-600 hover:bg-white/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold shadow-xs ${isActive ? 'bg-white/25 text-white' : 'bg-emerald-600 text-white'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
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
