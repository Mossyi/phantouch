import React from 'react';
import {
  X,
  Bookmark,
  Camera,
  Download,
  EyeOff,
  Eye,
  Play,
  RefreshCw,
  RotateCcw,
  Copy,
  Volume2,
  GitBranch,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { TavernCharacterCard } from '../../core/tavern/tavernTypes';
import { resolveActiveCardSprite } from '../../core/tavern/tavernEmotions';
import { isSentenceTruncated } from '../../core/tavern/tavernTextSanitizer';
import { TavernMessageContent } from './TavernMessageContent';
import { TavernAvatar } from './TavernAvatar';
import type { ChatMsg } from './TavernChatTab';

export interface TavernMessageItemProps {
  msg: ChatMsg;
  isUser: boolean;
  messageSpeaker: TavernCharacterCard;
  isGroupScene: boolean;
  isLocated: boolean;
  fontSize: number;
  narrativeHighlight: boolean;
  searchQuery: string;
  isBookmarked: boolean;
  continuingMessageId: string | null;
  regeneratingMessageId: string | null;
  isLoading: boolean;
  aiImageGeneratingId: string | null;
  suggestionPanel: {
    messageId: string;
    loading: boolean;
    items: string[];
    batch: number;
  } | null;
  onNodeRef: (id: string, node: HTMLDivElement | null) => void;
  onTouchStart: (event: React.TouchEvent<HTMLDivElement>, msg: ChatMsg) => void;
  onTouchMove: () => void;
  onTouchEnd: (event: React.TouchEvent<HTMLDivElement>, msgId: string, hasCandidates: boolean) => void;
  onTouchCancel: () => void;
  onContextMenu: (event: React.MouseEvent, msg: ChatMsg) => void;
  onPreviewImage: (img: string) => void;
  onRemoveImage: (msgId: string, index: number) => void;
  onViewFlashImage: (params: { url: string; saveUrl?: string; msgId: string; ephemeral: boolean }) => void;
  onDownloadSceneCard: (url: string) => void;
  onContinueMessage: (msg: ChatMsg) => void;
  onRegenerateMessage: (msg: ChatMsg) => void;
  onRequestSuggestions: (msg: ChatMsg, batch?: number) => void;
  onCloseSuggestions: () => void;
  onSelectSuggestion: (suggestion: string) => void;
  onCopyMessage: (content: string) => void;
  onSpeak: (content: string, speakerCardId?: string) => void;
  onSaveCheckpoint: (msg: ChatMsg) => void;
  onGenerateAiImage: (msg: ChatMsg) => void;
  onSwitchCandidate: (msgId: string, direction: -1 | 1) => void;
  onDeleteCandidate: (msgId: string) => void;
}

export const TavernMessageItem: React.FC<TavernMessageItemProps> = React.memo(({
  msg,
  isUser,
  messageSpeaker,
  isGroupScene,
  isLocated,
  fontSize,
  narrativeHighlight,
  searchQuery,
  isBookmarked,
  continuingMessageId,
  regeneratingMessageId,
  isLoading,
  aiImageGeneratingId,
  suggestionPanel,
  onNodeRef,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  onContextMenu,
  onPreviewImage,
  onRemoveImage,
  onViewFlashImage,
  onDownloadSceneCard,
  onContinueMessage,
  onRegenerateMessage,
  onRequestSuggestions,
  onCloseSuggestions,
  onSelectSuggestion,
  onCopyMessage,
  onSpeak,
  onSaveCheckpoint,
  onGenerateAiImage,
  onSwitchCandidate,
  onDeleteCandidate,
}) => {
  const isLocalGeneratedImage = msg.flashImage?.kind === 'generated';
  const isAiGeneratedImage = msg.flashImage?.kind === 'ai';
  const isPersistentImage = isLocalGeneratedImage || isAiGeneratedImage;

  return (
    <div
      ref={(node) => onNodeRef(msg.id, node)}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2 ${isLocated ? 'ring-2 ring-amber-500 rounded-2xl' : ''}`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-pink-50 border border-white/90 flex items-center justify-center text-lg shrink-0 overflow-hidden shadow-xs">
          <TavernAvatar avatar={resolveActiveCardSprite(messageSpeaker, msg.emotion)} name={messageSpeaker.name} />
        </div>
      )}

      <div
        onTouchStart={(event) => onTouchStart(event, msg)}
        onTouchMove={onTouchMove}
        onTouchEnd={(event) => onTouchEnd(event, msg.id, Boolean(msg.candidateReplies && msg.candidateReplies.length > 1))}
        onTouchCancel={onTouchCancel}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(event, msg);
        }}
        className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed space-y-2 relative ${
          isUser
            ? msg.isOOC
              ? 'bg-slate-100/95 text-slate-700 border border-slate-300/80 italic shadow-sm'
              : 'liquid-bubble-user shadow-md'
            : msg.isSeseBoosted
            ? 'liquid-bubble-sese text-slate-900 shadow-md'
            : 'liquid-bubble-ai text-slate-800 shadow-md'
        }`}
      >
        {msg.isOOC && <span className="text-[9px] font-mono text-cyan-700 block mb-0.5">[OOC 戏外发言]</span>}
        {msg.isSeseBoosted && <span className="text-[9px] font-mono text-pink-600 font-bold block mb-0.5">🔥 [狂暴瑟瑟增强回复]</span>}
        {!isUser && isGroupScene && <span className="text-[9px] font-mono text-violet-700 block mb-0.5">{messageSpeaker.name} 发言</span>}

        {isUser && msg.images && msg.images.length > 0 && (
          <div className="flex flex-wrap gap-2 my-1.5">
            {msg.images.map((img: string, i: number) => (
              <div key={i} className="relative group/img inline-block">
                <img
                  src={img}
                  alt="发送的图片"
                  onClick={() => onPreviewImage(img)}
                  className="max-h-36 max-w-48 rounded-xl object-cover border border-white/20 cursor-pointer hover:opacity-90 transition-opacity"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveImage(msg.id, i);
                  }}
                  title="移除此图片附件"
                  aria-label="移除此图片附件"
                  className="absolute -top-1.5 -right-1.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-full p-1 shadow-md opacity-80 hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {msg.content ? (
          <p
            className="whitespace-pre-wrap font-sans"
            style={{ fontSize, lineHeight: 1.6 }}
          >
            <TavernMessageContent
              content={msg.content}
              searchQuery={searchQuery}
              enabled={narrativeHighlight}
              isUser={isUser && !msg.isOOC}
              isDark={false}
            />
            {isBookmarked && (
              <span className="ml-1.5 inline-flex items-center text-amber-400 align-middle" title="已收藏">
                <Bookmark className="h-3 w-3 fill-amber-400/80" />
              </span>
            )}
          </p>
        ) : (
          isBookmarked && (
            <div className="mt-1 flex items-center text-amber-400" title="已收藏">
              <Bookmark className="h-3 w-3 fill-amber-400/80" />
            </div>
          )
        )}

        {/* 限时氛围图卡片 */}
        {msg.flashImage && (
          <div className="mt-2 p-2.5 bg-slate-950/80 rounded-xl border border-pink-500/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-pink-300 flex items-center gap-1">
                <Camera className="w-3.5 h-3.5 text-pink-400" />
                <span>{msg.flashImage.caption}</span>
              </span>
              <span className="text-[9px] font-mono text-amber-400">
                {isAiGeneratedImage ? 'AI 生成' : isLocalGeneratedImage ? '本地图卡' : msg.flashImage.isBurned ? '已过期' : '5秒限时查看'}
              </span>
            </div>

            {isPersistentImage ? (
              <div className="space-y-2">
                <button
                  onClick={() => onViewFlashImage({ url: msg.flashImage!.url, saveUrl: msg.flashImage!.downloadUrl, msgId: msg.id, ephemeral: false })}
                  className="block w-full overflow-hidden rounded-lg border border-pink-500/40"
                >
                  <img src={msg.flashImage.url} alt={msg.flashImage.caption} className="max-h-56 w-full object-cover" />
                </button>
                <button
                  onClick={() => void onDownloadSceneCard(msg.flashImage!.downloadUrl || msg.flashImage!.url)}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-slate-800 py-2 text-[10px] font-bold text-cyan-300"
                >
                  <Download className="h-3.5 w-3.5" />保存图片
                </button>
              </div>
            ) : msg.flashImage.isBurned ? (
              <div className="h-20 rounded-lg bg-slate-900 flex items-center justify-center text-slate-500 text-xs gap-1">
                <EyeOff className="w-4 h-4" />
                <span>图片引用已移除</span>
              </div>
            ) : (
              <button
                onClick={() => onViewFlashImage({ url: msg.flashImage!.url, msgId: msg.id, ephemeral: true })}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-pink-600 to-purple-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all"
              >
                <Eye className="w-4 h-4" />
                <span>点击查看氛围图（限时 5 秒）</span>
              </button>
            )}
          </div>
        )}

        {!isUser && !isPersistentImage && (
          <div className="mt-1.5 border-t border-pink-100/90 pt-1.5">
            <div className="flex items-center gap-1 text-slate-400">
              {isSentenceTruncated(msg.content) && (
                <button
                  onClick={() => void onContinueMessage(msg)}
                  disabled={Boolean(continuingMessageId) || Boolean(regeneratingMessageId) || isLoading}
                  aria-label="继续续写未完回复"
                  title="检测到该回复未写完整，点击让角色接着写完"
                  className="flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-2.5 py-1 text-[9px] font-black text-white shadow-sm shadow-pink-500/25 hover:from-pink-600 hover:to-rose-600 active:scale-95 disabled:opacity-50"
                >
                  <Play className={`h-2.5 w-2.5 fill-current ${continuingMessageId === msg.id ? 'animate-pulse' : ''}`} />
                  <span>{continuingMessageId === msg.id ? '正在续写…' : '继续'}</span>
                </button>
              )}
              <button
                onClick={() => void onRegenerateMessage(msg)}
                disabled={Boolean(regeneratingMessageId) || isLoading}
                aria-label={regeneratingMessageId === msg.id ? '正在重新生成' : '重新生成回复'}
                title="重新生成回复（仅文本，不重放硬件动作）"
                className="rounded-full p-1.5 hover:bg-pink-50 hover:text-pink-600 transition-colors disabled:cursor-wait disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${regeneratingMessageId === msg.id ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => {
                  if (suggestionPanel && suggestionPanel.messageId === msg.id) {
                    onCloseSuggestions();
                  } else {
                    void onRequestSuggestions(msg);
                  }
                }}
                aria-label="帮我想想"
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold transition-colors ${suggestionPanel && suggestionPanel.messageId === msg.id ? 'bg-pink-100 text-pink-700 border border-pink-200' : 'hover:bg-pink-50 hover:text-pink-600 text-slate-500'}`}
              >
                <RotateCcw className="h-3 w-3" />
                <span>帮我想想</span>
              </button>
              <button onClick={() => void onCopyMessage(msg.content)} aria-label="复制回复" title="复制回复" className="rounded-full p-1.5 hover:bg-pink-50 hover:text-pink-600 transition-colors"><Copy className="h-3.5 w-3.5" /></button>
              <button onClick={() => onSpeak(msg.content, msg.speakerCardId)} aria-label="朗读回复" title="朗读回复" className="rounded-full p-1.5 hover:bg-pink-50 hover:text-pink-600 transition-colors"><Volume2 className="h-3.5 w-3.5" /></button>
              <button onClick={() => onSaveCheckpoint(msg)} aria-label="保存消息检查点" title="保存到这条回复并创建分支检查点" className="rounded-full p-1.5 hover:bg-pink-50 hover:text-pink-600 transition-colors"><GitBranch className="h-3.5 w-3.5" /></button>
              <button
                onClick={() => void onGenerateAiImage(msg)}
                disabled={Boolean(aiImageGeneratingId)}
                aria-label={aiImageGeneratingId === msg.id ? 'AI 正在生成图片' : 'AI 生成本条回复图片'}
                title="使用 AI 根据本条回复生成图片"
                className="rounded-full p-1.5 hover:bg-pink-50 hover:text-pink-600 transition-colors disabled:cursor-wait disabled:opacity-50"
              >
                {aiImageGeneratingId === msg.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              </button>
            </div>

            {msg.candidateReplies && msg.candidateReplies.length > 1 && (
              <div className="liquid-glass-subtle mt-2 flex items-center gap-1 rounded-xl px-2 py-1 text-[9px] text-slate-700">
                <button onClick={() => onSwitchCandidate(msg.id, -1)} aria-label="上一条回复候选" title="上一条候选 (支持触屏左右滑动)" className="rounded-lg p-1 hover:bg-white/80 hover:text-pink-700 transition-colors"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="min-w-0 flex-1 text-center font-bold select-none">候选 {(msg.activeCandidateIndex ?? Math.max(0, msg.candidateReplies.indexOf(msg.content))) + 1}/{msg.candidateReplies.length}</span>
                <button onClick={() => onSwitchCandidate(msg.id, 1)} aria-label="下一条回复候选" title="下一条候选 (支持触屏左右滑动)" className="rounded-lg p-1 hover:bg-white/80 hover:text-pink-700 transition-colors"><ChevronRight className="h-3.5 w-3.5" /></button>
                <button onClick={() => onDeleteCandidate(msg.id)} aria-label="删除此候选" title="删除当前候选回复" className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors"><Trash2 className="h-3 w-3" /></button>
              </div>
            )}

            {suggestionPanel && suggestionPanel.messageId === msg.id && (
              <div className="tavern-floating-panel mt-2 space-y-1.5 rounded-xl border border-pink-200 bg-white/95 p-2 shadow-sm">
                {suggestionPanel.loading ? (
                  <div className="flex items-center gap-2 px-1 py-2 text-[9px] text-pink-600">
                    <Sparkles className="h-3.5 w-3.5 animate-spin" />
                    <span>正在结合剧情生成回复建议...</span>
                  </div>
                ) : (
                  <>
                    {suggestionPanel.items.map((suggestion, index) => (
                      <button key={`${suggestionPanel.batch}_${index}`} onClick={() => onSelectSuggestion(suggestion)} className="flex w-full items-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-[10px] leading-relaxed text-slate-700 hover:bg-pink-50 hover:text-pink-800 transition-colors">
                        <span className="mt-0.5 shrink-0 text-pink-400">↩</span>
                        <span>{suggestion}</span>
                      </button>
                    ))}
                    <div className="flex items-center gap-1 border-t border-pink-100 pt-1.5">
                      <button onClick={() => void onRequestSuggestions(msg, suggestionPanel.batch + 1)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] text-slate-500 hover:bg-pink-50 hover:text-pink-600 transition-colors"><RefreshCw className="h-3 w-3" />换一批</button>
                      <button onClick={onCloseSuggestions} aria-label="关闭回复建议" className="rounded-lg p-1 text-slate-400 hover:bg-pink-50 hover:text-pink-600 transition-colors"><X className="h-3 w-3" /></button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
