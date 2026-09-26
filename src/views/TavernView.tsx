import React, { useState } from 'react';
import { TavernStore } from '../core/tavern/tavernData';
import { TavernCharacterCard } from '../core/tavern/tavernTypes';
import { TavernCardsTab } from '../components/tavern/TavernCardsTab';
import { TavernChatTab } from '../components/tavern/TavernChatTab';
import { TavernLorebookTab } from '../components/tavern/TavernLorebookTab';
import { TavernQuestsTab } from '../components/tavern/TavernQuestsTab';
import { TavernDiaryCapsuleTab } from '../components/tavern/TavernDiaryCapsuleTab';
import { TavernApiTab } from '../components/tavern/TavernApiTab';
import { TavernPlayerPresetsTab } from '../components/tavern/TavernPlayerPresetsTab';
import { TavernTextRulesTab } from '../components/tavern/TavernTextRulesTab';

export const TavernView: React.FC = () => {
  const store = TavernStore.getInstance();
  const [activeSubTab, setActiveSubTab] = useState<'cards' | 'chat' | 'player' | 'lorebook' | 'text_rules' | 'quests' | 'diary' | 'api'>('chat');
  const [activeCard, setActiveCard] = useState<TavernCharacterCard>(store.getActiveCard());
  const [openCardWriterRequest, setOpenCardWriterRequest] = useState(0);
  const [conversationWriterRequest, setConversationWriterRequest] = useState<{ id: number; brief: string } | null>(null);

  const handleSelectCard = (card: TavernCharacterCard) => {
    setActiveCard(card);
    store.setActiveCard(card.id);
  };

  const handleSelectCardAndChat = (card: TavernCharacterCard) => {
    handleSelectCard(card);
    setActiveSubTab('chat');
  };

  const subTabs = [
    { id: 'chat', label: '💬 对谈' },
    { id: 'cards', label: '🎴 角色' },
    { id: 'player', label: '👤 预设' },
    { id: 'lorebook', label: '📖 世界书' },
    { id: 'text_rules', label: '🧩 规则' },
    { id: 'quests', label: '🎯 悬赏' },
    { id: 'diary', label: '📓 日记' },
    { id: 'api', label: '⚙️ 设置' },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full h-full overflow-hidden">
      {/* 🍎 顶部滑动分段控制器 (visionOS Floating Liquid Pill Slider) */}
      <div className="liquid-header shrink-0 px-2.5 py-2 z-30">
        <div className="liquid-pill-track max-w-md mx-auto flex gap-1 p-1 overflow-x-auto scrollbar-none rounded-[1.25rem]">
          {subTabs.map((tab) => {
            const isSelected = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`py-1.5 px-3 rounded-xl text-xs font-black whitespace-nowrap transition-all flex items-center justify-center shrink-0 active:scale-95 ${
                  isSelected
                    ? 'bg-white/95 text-pink-600 shadow-[0_4px_16px_rgba(244,63,142,0.2),inset_0_1.5px_2px_#ffffff] border border-white scale-[1.03]'
                    : 'text-slate-500 hover:text-pink-600 hover:bg-white/50'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 渲染具体的子模块 */}
      {activeSubTab === 'chat' ? (
        <TavernChatTab key={activeCard.id} activeCard={activeCard} onOpenCardWriter={(brief) => {
          if (brief) {
            setConversationWriterRequest((current) => ({ id: (current?.id ?? 0) + 1, brief }));
          } else {
            setOpenCardWriterRequest((value) => value + 1);
          }
          setActiveSubTab('cards');
        }} />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto max-w-md mx-auto w-full px-3.5 py-3 pb-36">
          {activeSubTab === 'cards' && <TavernCardsTab onSelectCard={handleSelectCard} onSelectCardAndChat={handleSelectCardAndChat} openAiWriterRequest={openCardWriterRequest} conversationWriterRequest={conversationWriterRequest} />}
          {activeSubTab === 'player' && <TavernPlayerPresetsTab />}
          {activeSubTab === 'lorebook' && <TavernLorebookTab />}
          {activeSubTab === 'text_rules' && <TavernTextRulesTab />}
          {activeSubTab === 'quests' && <TavernQuestsTab />}
          {activeSubTab === 'diary' && <TavernDiaryCapsuleTab />}
          {activeSubTab === 'api' && <TavernApiTab />}
        </div>
      )}
    </div>
  );
};
