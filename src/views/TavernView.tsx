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
import { SegmentedTabs, SegmentedTabItem } from '../components/SegmentedTabs';
import { BookOpen, Contact, MessagesSquare, NotebookPen, Puzzle, SlidersHorizontal, Target, UserRound } from 'lucide-react';

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

  const subTabs: SegmentedTabItem<typeof activeSubTab>[] = [
    { id: 'chat', label: '对谈', icon: MessagesSquare },
    { id: 'cards', label: '角色', icon: Contact },
    { id: 'player', label: '预设', icon: UserRound },
    { id: 'lorebook', label: '世界书', icon: BookOpen },
    { id: 'text_rules', label: '规则', icon: Puzzle },
    { id: 'quests', label: '悬赏', icon: Target },
    { id: 'diary', label: '日记', icon: NotebookPen },
    { id: 'api', label: '设置', icon: SlidersHorizontal },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full overflow-hidden">
      <div className="subnav-bar shrink-0 px-3 py-2 z-30">
        <SegmentedTabs
          ariaLabel="酒馆分区"
          items={subTabs}
          value={activeSubTab}
          onChange={setActiveSubTab}
          className="mx-auto max-w-md"
        />
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
        <div className="flex-1 min-h-0 overflow-y-auto max-w-md mx-auto w-full px-3.5 py-3 pb-36 overscroll-contain">
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
