import React, { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { BarbieLabEngine, BarbieLabState } from '../../core/discipline/barbieLabEngine';
import { BarbieFeatureSuite } from './BarbieFeatureSuite';

export const BarbieLabTab: React.FC = () => {
  const engine = BarbieLabEngine.getInstance();
  const [state, setState] = useState<BarbieLabState>(() => engine.getState());

  useEffect(() => engine.subscribe(setState), [engine]);

  return (
    <div className="space-y-4 pb-2">
      <section className="liquid-card relative overflow-hidden p-5 shadow-[0_18px_45px_rgba(236,72,153,0.12)]">
        <div className="absolute -right-6 -top-7 grid h-32 w-32 place-items-center rounded-full bg-white/60 text-6xl blur-[0.1px] shadow-sm">🎀</div>
        <div className="relative max-w-[78%]">
          <p className="text-[10px] font-black tracking-[0.18em] text-pink-600">BARBIE TRANSFORMATION LAB</p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-800">芭比蜕变实验室</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">为 {state.displayName} 集中呈现可检测、可记录的训练工具。</p>
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-pink-200/90 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-pink-700 shadow-2xs backdrop-blur-xs">
            <Sparkles className="h-3 w-3 text-pink-500 shrink-0" />
            <span>提示：部分功能需要支持视觉的模型</span>
          </div>
        </div>
      </section>

      <BarbieFeatureSuite ritualVoicePromptsEnabled={state.consent.useVoicePrompts} />

      <section className="liquid-card p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-pink-100/80 text-pink-600 shadow-xs"><ShieldCheck className="h-5 w-5" /></div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-black text-slate-800">仪式提示偏好</h3><span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">仅本地保存</span></div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">需要停止时请直接使用页面顶部或悬浮急停。硬件反馈必须在上方控制台为本次打开单独授权。</p>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-700"><input type="checkbox" checked={state.consent.useVoicePrompts} onChange={(event) => engine.updateConsent({ useVoicePrompts: event.target.checked })} className="accent-pink-500" />传感器仪式中播放语音提示</label>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-center gap-1.5 pb-2 text-[10px] text-slate-500 font-medium"><LockKeyhole className="h-3 w-3" />配置与训练记录仅保存在本设备</div>
    </div>
  );
};
