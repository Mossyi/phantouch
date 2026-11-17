import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  storySegments,
  type ImmersiveMemoryFacts,
  type ImmersiveStoryView,
} from '../../core/tavern/immersiveStory';

interface ImmersiveStoryCardProps {
  view: ImmersiveStoryView;
  memory: ImmersiveMemoryFacts;
  onPickMove: (text: string) => void;
}

const Section: React.FC<{
  id: string;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ id, title, subtitle, open, onToggle, children }) => (
  <section className="overflow-hidden rounded-xl border border-rose-300/40 bg-[#4a1028]/80 text-rose-50">
    <button
      type="button"
      aria-expanded={open}
      aria-controls={id}
      onClick={onToggle}
      className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold leading-tight">{title}</span>
        <span className="block text-[8px] font-semibold uppercase tracking-[0.16em] text-amber-200/90">{subtitle}</span>
      </span>
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-rose-100 transition ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && (
      <div id={id} className="space-y-1 border-t border-rose-200/20 px-3 py-2 text-[11px] leading-relaxed text-rose-50/95">
        {children}
      </div>
    )}
  </section>
);

const statusLines = (view: ImmersiveStoryView): Array<[string, string]> => (
  [
    ['时间', view.status.time],
    ['地点', view.status.place],
    ['衣着', view.status.outfit],
    ['心情', view.status.mood],
    ['内心', view.status.inner],
  ] as Array<[string, string]>
).filter((entry) => entry[1]);

export const ImmersiveStoryCard: React.FC<ImmersiveStoryCardProps> = ({ view, memory, onPickMove }) => {
  const [open, setOpen] = useState({ status: false, group: false, sketch: false, memory: false, moves: true });
  const toggle = (key: keyof typeof open) => setOpen((current) => ({ ...current, [key]: !current[key] }));
  const lines = statusLines(view);

  return (
    <div className="min-w-0 space-y-2 rounded-xl bg-[#2a0a16]/92 p-2.5">
      <div className="whitespace-pre-wrap break-words text-[13px] leading-7 text-rose-50/90">
        {storySegments(view.body).map((segment, index) => (
          <span key={`${segment.kind}-${index}`} className={segment.kind === 'dialogue' ? 'text-white' : 'text-rose-100/75'}>
            {segment.text}
          </span>
        ))}
      </div>
      <Section id="immersive-status" title="状态栏" subtitle="Status" open={open.status} onToggle={() => toggle('status')}>
        {lines.length === 0 ? <p>这次回复没有给出剧情状态。</p> : lines.map(([label, value]) => (
          <p key={label} className="break-words"><span className="text-amber-100/80">{label}：</span>{value}</p>
        ))}
      </Section>
      <Section id="immersive-group" title="角色群聊" subtitle="Group chat" open={open.group} onToggle={() => toggle('group')}>
        {view.group.length === 0 ? <p>这张角色卡没有可单独发言的配角。</p> : view.group.map((line) => (
          <p key={`${line.name}-${line.line}`} className="break-words"><span className="text-amber-100/80">{line.name}：</span>{line.line}</p>
        ))}
      </Section>
      <Section id="immersive-sketch" title="小剧场" subtitle="Sketch" open={open.sketch} onToggle={() => toggle('sketch')}>
        <p className="break-words">{view.sketch || '这次没有场外小剧场。'}</p>
      </Section>
      <Section id="immersive-memory" title="记忆区" subtitle="Memory" open={open.memory} onToggle={() => toggle('memory')}>
        {!memory.enabled && <p>长期记忆没有注入当前对话。</p>}
        {memory.pinned && <p className="break-words"><span className="text-amber-100/80">固定事实：</span>{memory.pinned}</p>}
        {memory.summaryInjected ? (
          <p className="break-words"><span className="text-amber-100/80">当前分支摘要：</span>{memory.summary}</p>
        ) : (
          <p>当前分支还没有可注入的剧情摘要。</p>
        )}
        {memory.staleSummary && <p className="break-words">来源原文已经变化，旧摘要没有注入：{memory.staleSummary}</p>}
        {memory.unplaced && <p className="break-words">未归属旧摘要不会自动混入：{memory.unplaced}</p>}
        <p>
          {memory.autoOn
            ? `自动整理已开启，每 ${memory.autoEvery} 条新回复才尝试更新。当前还有 ${memory.pendingCount} 条未纳入摘要。`
            : `自动整理没有开启。当前有 ${memory.pendingCount} 条回复还没纳入摘要。`}
        </p>
      </Section>
      <Section id="immersive-moves" title="下一步" subtitle="Your move" open={open.moves} onToggle={() => toggle('moves')}>
        {view.moves.length === 0 ? <p>没有建议的下一步，可以直接输入。</p> : view.moves.map((move) => (
          <button
            key={move}
            type="button"
            onClick={() => onPickMove(move)}
            className="block w-full break-words rounded-lg border border-rose-200/30 bg-white/10 px-2 py-1.5 text-left text-rose-50 hover:bg-white/15"
          >
            {move}
          </button>
        ))}
        <p className="text-[9px] text-rose-100/70">点一条只填入输入框，可以修改后再发送。</p>
      </Section>
    </div>
  );
};
