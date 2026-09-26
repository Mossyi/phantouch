import React from 'react';
import { Copy, Volume2 } from 'lucide-react';
import { ChatMessage } from '../types';
import { ActionCard } from './ActionCard';

export interface CompanionMessageItemProps {
  msg: ChatMessage;
  personaAvatar: string;
  voiceConfig?: any;
  fontSize: number;
  onCopy: (content: string) => void;
  onSpeak: (content: string, voiceConfig?: any) => void;
}

export const CompanionMessageItem: React.FC<CompanionMessageItemProps> = React.memo(({
  msg,
  personaAvatar,
  voiceConfig,
  fontSize,
  onCopy,
  onSpeak,
}) => {
  if (msg.isHidden) return null;
  const isAssistant = msg.role === 'assistant';

  return (
    <div
      className={`flex items-start gap-2.5 ${isAssistant ? 'justify-start' : 'justify-end'}`}
    >
      {isAssistant && (
        <div className="w-8 h-8 rounded-full bg-pink-100 border border-pink-300 flex items-center justify-center text-base shadow-sm shrink-0">
          {personaAvatar}
        </div>
      )}

      <div className={`max-w-[85%] ${isAssistant ? 'items-start' : 'items-end'}`}>
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed relative group ${
            isAssistant
              ? 'liquid-bubble-ai rounded-tl-sm font-normal text-slate-800'
              : 'liquid-bubble-user rounded-tr-sm font-medium'
          }`}
        >
          <p
            className={`whitespace-pre-wrap break-words ${isAssistant ? 'pr-12' : 'pr-7'}`}
            style={{ fontSize, lineHeight: 1.6 }}
          >
            {msg.content}
          </p>

          {msg.content && (
            <div className="absolute bottom-1 right-1 flex items-center">
              <button
                type="button"
                onClick={() => onCopy(msg.content)}
                className={`p-1 opacity-45 transition-opacity hover:opacity-100 ${isAssistant ? 'text-pink-600 hover:text-pink-900' : 'text-white'}`}
                title="复制消息"
              >
                <Copy className="w-3 h-3" />
              </button>
              {isAssistant && (
                <button
                  type="button"
                  onClick={() => onSpeak(msg.content, voiceConfig)}
                  className="p-1 opacity-50 hover:opacity-100 text-pink-600 hover:text-pink-900 transition-opacity"
                  title="重听该句语音"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* AI 执行动作卡片 */}
        {isAssistant && msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {msg.toolCalls.map((log) => (
              <ActionCard key={log.id} toolLog={log} />
            ))}
          </div>
        )}

        <span className="text-[10px] text-pink-900/60 font-mono font-semibold mt-1 block px-1">
          {new Date(msg.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
});
