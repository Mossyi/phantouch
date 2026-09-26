import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { AlertTriangle, Mic, CheckCircle2, ShieldAlert } from 'lucide-react';

export const ContractSurgeModal: React.FC = () => {
  const { contractState, answerSurgeCheck, startVoiceInput, isListening, speechTranscript } = useAppStore();

  const surge = contractState?.currentSurgeCheck;

  if (!contractState?.isActive || !surge || surge.isAnswered) {
    return null;
  }

  const handleVoiceAnswer = () => {
    startVoiceInput();
  };

  const handleQuickAnswer = (text: string) => {
    answerSurgeCheck(text);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
      <div className="bg-white/98 backdrop-blur-2xl border-2 border-rose-400 rounded-3xl p-5 max-w-sm w-full shadow-[0_24px_60px_rgba(244,63,94,0.35)] space-y-4 text-center relative overflow-hidden text-slate-800">
        {/* 背景光效 */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rose-100/50 via-transparent to-transparent pointer-events-none" />

        <div className="flex items-center justify-center gap-2 text-rose-600">
          <ShieldAlert className="w-6 h-6 animate-bounce" />
          <h3 className="text-base font-black tracking-wider uppercase">🚨 契约突袭查岗</h3>
        </div>

        {/* 15 秒倒计时圆环 */}
        <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-rose-400/30 animate-ping" />
          <div className="w-16 h-16 rounded-full bg-rose-50 border-2 border-rose-400 flex flex-col items-center justify-center shadow-lg">
            <span className="text-2xl font-black text-rose-600 font-mono leading-none">
              {surge.remainingSeconds}
            </span>
            <span className="text-[9px] text-rose-500 font-mono mt-0.5">秒</span>
          </div>
        </div>

        {/* 提问内容 */}
        <div className="bg-rose-50/70 p-3.5 rounded-2xl border border-rose-200 shadow-inner">
          <p className="text-xs text-rose-900 leading-relaxed font-bold">
            {surge.question}
          </p>
        </div>

        {isListening && (
          <div className="text-xs text-pink-700 bg-pink-50 p-2.5 rounded-xl border border-pink-200 animate-pulse font-bold">
            <p>正在聆听: {speechTranscript ? `“${speechTranscript}”` : '请直接开口回答...'}</p>
          </div>
        )}

        {/* 应答按钮群 */}
        <div className="space-y-2 pt-1">
          <button
            onClick={handleVoiceAnswer}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-600 text-white text-xs font-black shadow-md shadow-rose-500/25 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <Mic className="w-4 h-4 animate-pulse" /> 开启麦克风语音回答
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleQuickAnswer('在听话，我没有松懈')}
              className="py-2 rounded-xl bg-white hover:bg-rose-50 text-slate-700 text-xs font-bold border border-rose-200 active:scale-95 transition shadow-xs"
            >
              🩸 在听话，没松懈
            </button>
            <button
              onClick={() => handleQuickAnswer('主人，我还在坚持')}
              className="py-2 rounded-xl bg-white hover:bg-rose-50 text-slate-700 text-xs font-bold border border-rose-200 active:scale-95 transition shadow-xs"
            >
              🙇 主人，在坚持
            </button>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 font-medium">
          ⚠️ 15 秒超时未应答将判定为怠慢违逆，强制加罚 2 分钟并执行惩戒狂暴！
        </p>
      </div>
    </div>
  );
};
