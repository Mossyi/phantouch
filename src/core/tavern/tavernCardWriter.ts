import { TavernCardParser } from './tavernCardParser';
import { TavernCharacterCard } from './tavernTypes';
import { stripThinkingArtifacts } from './tavernTextSanitizer';

export const TAVERN_CARD_WRITER_SYSTEM_PROMPT = `你是一名专业的 SillyTavern Character Card V2 角色设计师。
根据用户需求创作一张可长期角色扮演的角色卡，只输出一个 JSON 对象，不要 Markdown、解释或代码围栏。
JSON 必须包含：name、avatar、tags、description、personality、scenario、firstMessage、mesExamples、systemPromptAddon、alternateGreetings、creatorNotes、worldBookEntries。
avatar 只用一个合适的 emoji；tags 是字符串数组；alternateGreetings 最多 3 条；worldBookEntries 最多 5 条，每条格式为 {"keywords":["关键词"],"content":"设定"}。
使用 {{user}} 和 {{char}} 占位符。角色应有稳定动机、鲜明说话方式、可延展场景和自然开场，不要声称已经控制、读取或操作任何真实硬件。`;

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const extractJsonObject = (response: string): unknown => {
  if (typeof response !== 'string' || !response.trim() || response.length > 500_000) return null;
  const trimmed = response.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

export const buildTavernCardWriterRequest = (brief: string) => {
  const safeBrief = typeof brief === 'string' ? brief.trim().slice(0, 2_000) : '';
  if (!safeBrief) throw new Error('请先描述你想创建的角色');
  return `请根据以下需求创作完整角色卡：\n${safeBrief}`;
};

export const parseAIGeneratedTavernCard = (response: string): TavernCharacterCard | null => {
  const cleanResponse = stripThinkingArtifacts(response, false);
  const payload = extractJsonObject(cleanResponse);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === 'object' && !Array.isArray(root.data)
    ? root.data as Record<string, unknown>
    : root;

  const requiredFields = [
    text(data.name),
    text(data.description),
    text(data.personality),
    text(data.scenario),
    text(data.firstMessage ?? data.first_mes),
  ];
  if (requiredFields.some((value) => !value)) return null;

  const tags = Array.isArray(data.tags)
    ? data.tags
    : text(data.tag).split('/').map((tag) => tag.trim()).filter(Boolean);
  const rawWorldBookEntries = Array.isArray(data.worldBookEntries) ? data.worldBookEntries : [];
  const worldBookEntries = rawWorldBookEntries.slice(0, 5).map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const item = entry as Record<string, unknown>;
    return {
      keys: Array.isArray(item.keywords) ? item.keywords : item.keys,
      content: item.content,
      enabled: true,
    };
  }).filter(Boolean);

  const parsed = TavernCardParser.parseJsonCard(JSON.stringify({
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: data.name,
      avatar: data.avatar,
      tags,
      description: data.description,
      personality: data.personality,
      scenario: data.scenario,
      first_mes: data.firstMessage ?? data.first_mes,
      mes_example: data.mesExamples ?? data.mes_example,
      system_prompt: data.systemPromptAddon ?? data.system_prompt,
      post_history_instructions: data.postHistoryInstructions ?? data.post_history_instructions,
      alternate_greetings: data.alternateGreetings ?? data.alternate_greetings,
      creator_notes: data.creatorNotes ?? data.creator_notes,
      creator: 'AI 角色卡工坊',
      character_book: worldBookEntries.length > 0 ? { entries: worldBookEntries } : undefined,
    },
  }));

  return parsed ? {
    ...parsed,
    hardwareEnchanted: false,
    creator: 'AI 角色卡工坊',
    source: 'ai_generated',
  } : null;
};
