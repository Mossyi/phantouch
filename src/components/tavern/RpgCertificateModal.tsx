import React, { useRef, useState } from 'react';
import { Award, CheckCircle2, Download, Sparkles, X, Shield, Star } from 'lucide-react';
import type { RpgEnding, TavernRpgState } from '../../core/tavern/tavernRpg';
import { RPG_STAT_LABELS, STAT_KEYS } from '../../core/tavern/tavernRpgContent';

interface RpgCertificateModalProps {
  ending: RpgEnding;
  state: TavernRpgState;
  charName: string;
  userName: string;
  onClose: () => void;
}

export const RpgCertificateModal: React.FC<RpgCertificateModalProps> = ({
  ending,
  state,
  charName,
  userName,
  onClose,
}) => {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const rank: string = ending.rank ?? 'A';
  const rankMap: Record<string, string> = {
    S: 'from-amber-400 via-yellow-300 to-amber-500 text-amber-950 border-amber-300 shadow-amber-500/30',
    A: 'from-purple-400 via-pink-300 to-purple-500 text-purple-950 border-purple-300 shadow-purple-500/30',
    B: 'from-blue-400 via-cyan-300 to-blue-500 text-blue-950 border-blue-300 shadow-blue-500/30',
    C: 'from-slate-400 via-zinc-300 to-slate-500 text-slate-950 border-slate-300 shadow-slate-500/30',
  };
  const rankColors = rankMap[rank] || rankMap.A;

  const handleExportPng = async () => {
    if (!certificateRef.current || isExporting) return;
    setIsExporting(true);
    setExportMessage('正在生成证书长图...');
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(certificateRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0f172a',
        logging: false,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `酒馆训练结业证书-${ending.title}-${userName}.png`;
      link.href = dataUrl;
      link.click();
      setExportMessage('长图导出成功！已保存至下载目录。');
      setTimeout(() => setExportMessage(null), 3000);
    } catch (err) {
      setExportMessage(`导出失败：${err instanceof Error ? err.message : '未知错误'}`);
      setTimeout(() => setExportMessage(null), 3500);
    } finally {
      setIsExporting(false);
    }
  };

  const totalChecks = (state.counters.passes.obedience ?? 0)
    + (state.counters.passes.endurance ?? 0)
    + (state.counters.passes.shame ?? 0)
    + (state.counters.passes.devotion ?? 0);

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl my-8 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* 顶部控制栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <span className="font-semibold text-slate-200 text-sm">结业受训证书 · 回忆典藏</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 证书主体区域（供 html2canvas 渲染） */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[75vh]">
          <div
            ref={certificateRef}
            className="relative p-6 sm:p-8 rounded-xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-2 border-amber-500/50 shadow-2xl text-slate-100 overflow-hidden"
          >
            {/* 证书四角装饰 */}
            <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-amber-400/80 pointer-events-none" />
            <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-amber-400/80 pointer-events-none" />
            <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-amber-400/80 pointer-events-none" />
            <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-amber-400/80 pointer-events-none" />

            {/* 水印底纹 */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
              <Shield className="w-96 h-96 text-amber-300" />
            </div>

            {/* 证书抬头 */}
            <div className="text-center relative z-10 mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs tracking-widest uppercase mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Certificate of Discipline & Devotion</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold tracking-wider text-amber-200">
                训练结业认证典书
              </h2>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                编号：YCY-RPG-{state.runId ? state.runId.slice(-8) : Date.now().toString().slice(-8)}
              </p>
            </div>

            {/* 学员与导师信息 */}
            <div className="relative z-10 bg-slate-900/60 border border-slate-800 rounded-lg p-4 mb-5 text-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400">受训学员：</span>
                <span className="font-semibold text-amber-100 text-base">{userName}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400">主导调教者：</span>
                <span className="font-semibold text-rose-300 text-base">{charName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">训练历程：</span>
                <span className="text-slate-300">共历经 {state.day} 天 · 续约 {state.renewCount ?? 0} 次</span>
              </div>
            </div>

            {/* 结局评级与专属评定 */}
            <div className="relative z-10 text-center my-6">
              <div className="inline-block relative">
                <div
                  className={`w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-gradient-to-br ${rankColors} border-2 flex items-center justify-center font-serif font-black text-3xl sm:text-4xl shadow-lg mb-3`}
                >
                  {rank}
                </div>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5 text-amber-400">
                  {Array.from({ length: rank === 'S' ? 5 : rank === 'A' ? 4 : rank === 'B' ? 3 : 2 }).map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-amber-400" />
                  ))}
                </div>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-amber-300 mt-2">{ending.title}</h3>
              {ending.quote && (
                <p className="italic text-slate-300 text-sm mt-2 px-4 py-1.5 bg-slate-900/40 rounded-lg border border-slate-800/80 inline-block max-w-md">
                  {ending.quote}
                </p>
              )}
              <p className="text-xs sm:text-sm text-slate-300/90 mt-3 text-left leading-relaxed px-2">
                {ending.summary}
              </p>
            </div>

            {/* 训练最终四维雷达数据 */}
            <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
              {STAT_KEYS.map((key) => (
                <div key={key} className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-slate-400 mb-1">{RPG_STAT_LABELS[key]}</div>
                  <div className="text-lg font-bold text-amber-300">{state.trainee[key]}</div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full"
                      style={{ width: `${Math.min(100, state.trainee[key])}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* 累计训练手账统计 */}
            <div className="relative z-10 grid grid-cols-3 gap-2 text-center text-xs text-slate-400 bg-slate-900/50 p-3 rounded-lg border border-slate-800 mb-6">
              <div>
                <span className="block text-slate-200 font-bold text-sm">{state.counters.courses}</span>
                完成课程
              </div>
              <div>
                <span className="block text-slate-200 font-bold text-sm">{totalChecks}</span>
                检定通过
              </div>
              <div>
                <span className="block text-slate-200 font-bold text-sm">{state.points}</span>
                累计积分
              </div>
            </div>

            {/* 契约印戳签名 */}
            <div className="relative z-10 flex items-center justify-between pt-4 border-t border-slate-800/80">
              <div className="text-xs text-slate-500">
                <span>契约成立日：第 1 天</span>
                <br />
                <span>结业认证日：第 {state.day} 天</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-12 h-12 rounded-full border-2 border-rose-500/80 bg-rose-950/40 flex items-center justify-center text-rose-400 font-serif font-bold text-xs shadow-inner shadow-rose-900/50 transform -rotate-12">
                  专属印鉴
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">见证与导师</div>
                  <div className="font-serif font-bold text-rose-300 text-sm">{charName}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {exportMessage || '支持高清长图导出与本地分享保存'}
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleExportPng}
              disabled={isExporting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? '生成长图中...' : '导出高清长图'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
