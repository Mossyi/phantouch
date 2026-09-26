import { stripThinkingArtifacts } from './tavernTextSanitizer';

const cleanSuggestion = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/^\s*(?:[-*•]|\d+[.)、]|[A-Da-d][.)])\s*/, '')
    .replace(/^\s*["“”']|["“”']\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
};

export const parseTavernReplySuggestions = (raw: unknown): string[] => {
  if (typeof raw !== 'string') return [];
  const text = stripThinkingArtifacts(raw, false).trim().slice(0, 20_000);
  const candidates: unknown[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const jsonCandidates = [fenced, text, text.match(/\[[\s\S]*\]/)?.[0]].filter(Boolean) as string[];
  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) candidates.push(...parsed);
      else if (Array.isArray(parsed?.suggestions)) candidates.push(...parsed.suggestions);
      if (candidates.length > 0) break;
    } catch {}
  }
  if (candidates.length === 0) candidates.push(...text.split(/\r?\n/));
  const unique = new Set<string>();
  for (const candidate of candidates) {
    const cleaned = cleanSuggestion(candidate);
    if (cleaned.length < 2) continue;
    unique.add(cleaned);
    if (unique.size >= 4) break;
  }
  return [...unique];
};

export const createFallbackTavernReplySuggestions = (batch = 0): string[] => {
  const groups = [
    [
      '我顺着当前的气氛回应，并观察对方下一步的反应。',
      '我先追问这件事背后的原因，再决定是否配合。',
      '我提出自己的条件，希望把剧情引向另一种结果。',
      '我暂时保持沉默，用动作和神态推动场景继续。',
    ],
    [
      '我主动靠近一步，把刚才没有说完的话继续说下去。',
      '我注意到一个细节，试着从这里寻找剧情突破口。',
      '我用玩笑缓和气氛，同时试探对方真正的意图。',
      '我拒绝立刻作答，要求对方先给出更明确的解释。',
    ],
    [
      '我回想此前发生的事，指出其中前后矛盾的地方。',
      '我选择暂时配合，但保留随时改变决定的权利。',
      '我把话题转向两人的关系，询问对方真实的感受。',
      '我推动时间向后发展，看看这个选择会带来什么变化。',
    ],
  ];
  return groups[Math.abs(Math.trunc(batch)) % groups.length];
};

export const buildTavernSuggestionPrompt = (batch: number): string => `
你是角色扮演聊天界面的“帮我想想”辅助器。请根据此前对话，给用户四条下一句回复建议。
要求：使用用户第一人称；每条独立、自然、20到100字；四条在配合、追问、转折和推进剧情上有所区别；不要替角色回答；不要生成任何设备、硬件或电击控制指令。
这是第 ${Math.max(1, Math.trunc(batch) + 1)} 批，请避免与此前常见措辞重复。
只返回 JSON 字符串数组，不要解释，例如：["建议一","建议二","建议三","建议四"]
`.trim();
