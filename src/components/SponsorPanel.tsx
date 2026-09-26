import React, { useEffect, useRef, useState } from 'react';
import { Heart, ExternalLink, Copy, Check, Sparkles, ArrowRight, ShieldCheck, Zap, Key } from 'lucide-react';

interface SponsorPanelProps {
  onGoToAi?: () => void;
}

// 请替换为你自己的赞助页地址；留作占位以免开源仓库关联到原作者账号
export const AFDIAN_PLAN_URL = 'https://afdian.com/a/your-account/plan';

export const SponsorPanel: React.FC<SponsorPanelProps> = ({ onGoToAi }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState('');
  // 提示与「已复制」状态的定时器：卸载时清理，并在新提示到来时重置，
  // 避免上一条的定时器提前清掉新提示，也避免卸载后仍有回调触发状态更新。
  const noticeTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const showNotice = (msg: string) => {
    setNoticeMessage(msg);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNoticeMessage('');
    }, 2500);
  };

  const handleCopyAfdian = async () => {
    try {
      await navigator.clipboard.writeText(AFDIAN_PLAN_URL);
      setCopiedLink(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => {
        copiedTimerRef.current = null;
        setCopiedLink(false);
      }, 2000);
      showNotice('爱发电赞助链接已复制到剪贴板！');
    } catch {
      showNotice('复制失败，请手动长按复制');
    }
  };

  const handleOpenAfdian = () => {
    window.open(AFDIAN_PLAN_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      {noticeMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-slate-900/90 text-white text-xs px-4 py-2.5 shadow-xl border border-pink-500/40 backdrop-blur-md animate-in fade-in slide-in-from-top-3 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-pink-400 animate-spin" />
          <span>{noticeMessage}</span>
        </div>
      )}

      {/* 1. 顶部 Hero：郑重声明本软件完全免费 */}
      <section className="liquid-card p-5 relative overflow-hidden bg-gradient-to-br from-pink-50 via-white to-rose-50/60 border border-pink-200/90 shadow-[0_8px_24px_rgba(236,72,153,0.10)]">
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-pink-300/20 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-md shadow-pink-500/25 shrink-0">
            <Heart className="w-6 h-6 fill-white animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-800">赞助与爱意支持</h3>
              <span className="text-[9px] font-black text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300">
                本软件完全免费
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
              <strong className="text-pink-600 font-black">幻触 (Phantouch) 完全免费</strong>，无任何收费门槛、无内购项目、无内置广告。
            </p>
            <div className="mt-2 p-2.5 bg-amber-50/80 rounded-xl border border-amber-200/80 text-[10px] text-amber-900 leading-relaxed space-y-1">
              <div className="flex items-center gap-1 font-bold text-amber-800">
                <Key className="w-3.5 h-3.5 shrink-0" />
                <span>重要说明：本软件不提供大模型</span>
              </div>
              <p className="text-[9.5px] text-amber-800/90">
                本软件不内置、不提供任何云端大模型与付费中转。大模型（LLM）需要<strong>用户自行准备并填写自己的 API Key</strong>（如 DeepSeek、SiliconFlow 等官方服务商）。您的 API Key 仅保存在本地设备中，绝不上传至任何第三方服务器。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 唯一赞助通道：爱发电 (Afdian) 专属链接 */}
      <section className="liquid-card p-4 space-y-3.5 border border-purple-200/80 bg-gradient-to-br from-purple-50/40 via-white to-pink-50/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm">
              <Zap className="w-4.5 h-4.5 fill-white" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-800">爱发电 (Afdian) 赞助方案</h4>
              <p className="text-[9.5px] text-slate-400">连接创作者与粉丝的会员制平台</p>
            </div>
          </div>
          <span className="text-[9px] font-mono text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-full border border-purple-200 font-bold">
            Creator
          </span>
        </div>

        <p className="text-[10.5px] text-slate-600 leading-relaxed">
          如果您觉得幻触给您带来了乐趣与陪伴，欢迎前往爱发电请作者喝杯咖啡或赞助方案，您的自愿支持将用于后续新功能研发与外设硬件协议适配！
        </p>

        {/* 固定的爱发电会员赞助链接展示 */}
        <div className="p-2.5 bg-white/90 rounded-2xl border border-purple-200/80 flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span className="font-mono text-[10px] text-purple-900 font-bold truncate">
              {AFDIAN_PLAN_URL}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyAfdian}
            className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-[9px] font-bold border border-purple-200 transition shrink-0 flex items-center gap-1"
          >
            {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>{copiedLink ? '已复制' : '复制'}</span>
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleOpenAfdian}
            className="flex-1 py-3 px-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-xs shadow-md shadow-purple-600/20 hover:from-purple-700 hover:to-pink-700 active:scale-[0.98] transition flex items-center justify-center gap-1.5"
          >
            <Zap className="w-4 h-4 fill-white" />
            <span>前往【爱发电】赞助支持方案</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80 ml-0.5" />
          </button>

          <button
            type="button"
            onClick={handleCopyAfdian}
            className="px-3.5 py-3 rounded-2xl bg-white border border-purple-200 hover:border-purple-300 text-purple-700 font-bold text-xs shadow-xs active:scale-[0.98] transition flex items-center gap-1"
            title="复制爱发电网址"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? '已复制' : '复制网址'}</span>
          </button>
        </div>
      </section>

      {/* 3. 核心原则与说明 */}
      <section className="liquid-card p-4 space-y-2.5 border border-pink-100 bg-white/80">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <h4 className="text-xs font-black text-slate-800">软件核心原则与说明</h4>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600">
          <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-100">
            <p className="font-bold text-emerald-700">💖 本软件完全免费</p>
            <p className="text-[8.5px] text-slate-500 mt-0.5">所有功能开箱即用，无付费解锁，无订阅制，绝不逼氪</p>
          </div>
          <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-100">
            <p className="font-bold text-amber-700">🔑 自行配置模型 Key</p>
            <p className="text-[8.5px] text-slate-500 mt-0.5">不提供大模型，用户自备官方 Key，按量付费透明安全</p>
          </div>
          <div className="p-2.5 bg-purple-50/60 rounded-xl border border-purple-100">
            <p className="font-bold text-purple-700">📱 外设硬件协议适配</p>
            <p className="text-[8.5px] text-slate-500 mt-0.5">持续跟进郊狼电击器、各类飞机杯等蓝牙协议驱动开发</p>
          </div>
          <div className="p-2.5 bg-sky-50/60 rounded-xl border border-sky-100">
            <p className="font-bold text-sky-700">🔒 本地离线隐私安全</p>
            <p className="text-[8.5px] text-slate-500 mt-0.5">Key 与会话数据均存本地设备，不上传开发者服务器</p>
          </div>
        </div>
      </section>

      {/* 4. 底部引导前往自备 Key 配置 */}
      {onGoToAi && (
        <button
          type="button"
          onClick={onGoToAi}
          className="w-full py-3 px-4 rounded-2xl bg-white border border-pink-200 hover:border-pink-300 text-pink-600 font-black text-xs shadow-xs hover:bg-pink-50/50 active:scale-[0.99] transition flex items-center justify-between"
        >
          <span className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            <span>下一步：前往配置我的大模型 API Key</span>
          </span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
