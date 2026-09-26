import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Sparkles, X } from 'lucide-react';
import { CompanionGender, CompanionMatchCandidate, createCompanionCandidates } from '../core/ai/companionMatcher';

const genderOptions: Array<{ id: CompanionGender; label: string; icon: string }> = [
  { id: 'male', label: '男生', icon: '♂' },
  { id: 'female', label: '女生', icon: '♀' },
  { id: 'femboy', label: '伪娘', icon: '⚧' },
];

interface Props { onClose: () => void; onStart: (candidate: CompanionMatchCandidate) => void; }

export const CompanionMatchModal: React.FC<Props> = ({ onClose, onStart }) => {
  const [selfGender, setSelfGender] = useState<CompanionGender>('male');
  const [aiGender, setAiGender] = useState<CompanionGender>('female');
  const [candidates, setCandidates] = useState<CompanionMatchCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const loadCandidates = () => {
    const nextRound = round + 1;
    setRound(nextRound);
    setCandidates(createCompanionCandidates(selfGender, aiGender, Date.now() + nextRound * 997));
    setSelectedId(null);
  };
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  // A full matching run contains four batches of five candidates.
  const remaining = Math.max(0, 25 - round * 5);

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0f172a]/55 p-3 backdrop-blur-sm">
    <section className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-[#dfe3e8] bg-[#fcfcfd] shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b border-[#e9edf2] px-4 py-3">
        <div className="flex items-center gap-2"><button type="button" onClick={() => candidates.length ? setCandidates([]) : onClose()} className="rounded-lg p-1 text-[#475569] hover:bg-[#f1f4f6]"><ChevronLeft className="h-4 w-4" /></button><h2 className="flex items-center gap-1.5 text-sm font-black text-[#1f2937]"><Sparkles className="h-4 w-4 text-pink-500" />{candidates.length ? '选择 AI 助手' : '选择匹配偏好'}</h2></div>
        <div className="flex items-center gap-1 text-[10px] font-semibold text-[#5f6b78]">{candidates.length && <><span>剩余: {remaining}/20</span><ChevronLeft className="ml-1 h-3.5 w-3.5" /><button type="button" onClick={loadCandidates} className="rounded-lg p-1 text-[#475569] hover:bg-pink-50 hover:text-pink-600" title="换一批"><RefreshCw className="h-3.5 w-3.5" /></button><ChevronRight className="h-3.5 w-3.5" /></>}<button type="button" onClick={onClose} className="ml-1 rounded-lg p-1 text-[#475569] hover:bg-[#f1f4f6]"><X className="h-4 w-4" /></button></div>
      </header>
      {!candidates.length ? <div className="space-y-5 overflow-y-auto p-4"><GenderPicker title="我想以什么身份匹配" value={selfGender} onChange={setSelfGender} /><GenderPicker title="想匹配哪类 AI" value={aiGender} onChange={setAiGender} /><div className="rounded-2xl border border-pink-100 bg-pink-50 p-3 text-[10px] font-medium leading-relaxed text-[#475569]">将为你随机挑选 20 位类人 AI 候选。创建后是本地纯文字伴侣，硬件联动保持关闭。</div><button type="button" onClick={loadCandidates} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f58dac] py-3 text-xs font-black text-white shadow-lg shadow-pink-200 active:scale-[0.98]"><Sparkles className="h-4 w-4" />开始匹配</button></div> : <><div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">{candidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => setSelectedId(candidate.id)} className={`w-full rounded-2xl border px-3 py-3 text-left transition-all ${selectedId === candidate.id ? 'border-pink-500 bg-pink-50/60 shadow-[0_5px_14px_rgba(236,72,153,0.1)]' : 'border-[#d5dae1] bg-white hover:border-pink-300'}`}><span className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 via-violet-100 to-cyan-100 text-2xl shadow-sm">{candidate.avatar}</span><span className="min-w-0"><b className="block text-[13px] font-extrabold text-[#263247]">{candidate.name}</b><span className="mt-1 block truncate text-[11px] font-medium leading-5 text-[#536273]">{candidate.greeting}</span></span></span></button>)}</div><footer className="flex shrink-0 gap-3 border-t border-[#e9edf2] bg-white p-3"><button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-[#cbd2da] py-2.5 text-xs font-extrabold text-[#344054] hover:bg-[#f7f8fa]">取消</button><button type="button" disabled={!selected} onClick={() => selected && onStart(selected)} className={`flex-1 rounded-2xl py-2.5 text-xs font-black ${selected ? 'bg-[#f58dac] text-white' : 'cursor-not-allowed bg-[#f8d9e3] text-[#8d294d]'}`}>开始对话</button></footer></>}
    </section>
  </div>;
};

const GenderPicker: React.FC<{ title: string; value: CompanionGender; onChange: (value: CompanionGender) => void }> = ({ title, value, onChange }) => <div><p className="mb-2 text-[11px] font-black text-[#344054]">{title}</p><div className="grid grid-cols-3 gap-2">{genderOptions.map((option) => <button key={option.id} type="button" onClick={() => onChange(option.id)} className={`rounded-2xl border p-3 text-center ${value === option.id ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-[#d5dae1] bg-white text-[#475569]'}`}><span className="block text-xl">{option.icon}</span><span className="mt-1 block text-[10px] font-bold">{option.label}</span></button>)}</div></div>;
