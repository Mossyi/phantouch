import { TavernCharacterCard } from './tavernTypes';
import { stripThinkingArtifacts } from './tavernTextSanitizer';

interface ImagePromptMessage {
  id?: string;
  role: string;
  content: string;
  speakerCardId?: string;
}

export const TAVERN_IMAGE_PROMPT_SYSTEM = `你是专业的 AI 绘图正向提示词提炼器。
根据角色设定与近期对话，提取对话最新时刻真正可见的主体、成年人物外观、服装、表情、姿态、互动、环境、构图、镜头、光线、色彩与画风。
优先表现用户所选 AI 回复对应的画面，并利用前文消除人物、地点和动作歧义。
只输出一段英文、逗号分隔的正向绘图提示词，最多 1200 个字符；不要复述对话，不要解释，不要标题，不要 Markdown，不要 JSON，不要负面提示词，不要写 no、without、exclude 等否定要求。所有人物必须明确为 21 岁以上成年人。`;

const cleanContextText = (value: unknown, maxLength: number): string => (
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : ''
);

export const buildTavernImagePromptRequest = (
  card: TavernCharacterCard,
  messages: ImagePromptMessage[],
  sourceMessageId?: string,
): string => {
  const sourceIndex = sourceMessageId
    ? messages.findIndex((message) => message.id === sourceMessageId)
    : messages.length - 1;
  const scopedMessages = messages
    .slice(0, sourceIndex >= 0 ? sourceIndex + 1 : messages.length)
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && cleanContextText(message.content, 1).length > 0)
    .slice(-12);
  const transcript = scopedMessages.map((message) => {
    const speaker = message.role === 'user'
      ? '{{user}}'
      : message.speakerCardId && message.speakerCardId !== card.id ? `角色(${message.speakerCardId})` : card.name;
    return `${speaker}：${cleanContextText(message.content, 1_200)}`;
  }).join('\n');

  return [
    '请从下面的角色设定和近期对话中提炼本次生图所需的正向提示词。',
    `【主角色】${cleanContextText(card.name, 100)}`,
    `【角色外观与设定】${cleanContextText(card.description, 1_600)}`,
    card.personality ? `【性格气质】${cleanContextText(card.personality, 800)}` : '',
    `【基础场景】${cleanContextText(card.scenario, 1_200)}`,
    `【截至所选回复的近期对话】\n${transcript || cleanContextText(card.firstMessage, 1_200)}`,
    '输出要求：只返回最终英文正向提示词。',
  ].filter(Boolean).join('\n\n').slice(0, 16_000);
};

export const parseTavernPositiveImagePrompt = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  let text = stripThinkingArtifacts(value, false).trim();
  if (!text) return '';
  text = text.replace(/^```(?:json|text|markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const candidate = (parsed as Record<string, unknown>).prompt
        ?? (parsed as Record<string, unknown>).positive_prompt
        ?? (parsed as Record<string, unknown>).positivePrompt;
      if (typeof candidate === 'string') text = candidate.trim();
    }
  } catch {
    // Plain text is the expected response format.
  }
  text = text
    .replace(/^(?:positive\s*prompt|prompt|正向提示词|正面提示词)\s*[:：]\s*/i, '')
    .split(/\n\s*(?:negative\s*prompt|负面提示词|反向提示词)\s*[:：]/i)[0]
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_200);
  if (/^(?:抱歉|对不起|无法|不能)/.test(text) || /^i\s+(?:(?:am\s+)?sorry|cannot)\b/i.test(text)) return '';
  return text.length >= 12 ? text : '';
};

export const createFallbackTavernImagePrompt = (
  card: TavernCharacterCard,
  messages: ImagePromptMessage[],
  sourceMessageId?: string,
): string => {
  const source = messages.find((message) => message.id === sourceMessageId)
    || [...messages].reverse().find((message) => message.role === 'assistant');
  return [
    'cinematic role-playing scene',
    'all human characters are adults aged 21 or older',
    cleanContextText(card.name, 100),
    cleanContextText(card.description, 700),
    cleanContextText(card.scenario, 500),
    cleanContextText(source?.content, 1_000),
    'coherent character identity',
    'expressive pose and facial expression',
    'detailed environment',
    'cinematic composition and lighting',
  ].filter(Boolean).join(', ').slice(0, 3_000);
};
