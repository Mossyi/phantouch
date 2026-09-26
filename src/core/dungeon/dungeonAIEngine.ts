import { DungeonEndingType, DungeonRunState, DungeonScript, DungeonStep, DungeonChoice } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { isLocalApiBaseUrl, parseApiBaseUrl } from '../apiBaseUrl';
import { fetchTextWithTimeout } from '../httpClient';
import { buildDungeonEnding, DEFAULT_DUNGEON_RUN_STATE, normalizeDungeonRunState } from './dungeonRunState';

export class DungeonAIEngine {
  private static instance: DungeonAIEngine;

  static getInstance(): DungeonAIEngine {
    if (!DungeonAIEngine.instance) {
      DungeonAIEngine.instance = new DungeonAIEngine();
    }
    return DungeonAIEngine.instance;
  }

  private extractJsonObject(raw: string): string | null {
    const start = raw.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < raw.length; index++) {
      const char = raw[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) return raw.slice(start, index + 1);
    }
    return null;
  }

  private sanitizeHardwareAction(action: any) {
    if (!action || typeof action !== 'object') return undefined;
    const allowedTypes = new Set(['ems_wave', 'ems_strength', 'toy_pattern', 'toy_turbo', 'enema_pattern', 'stop']);
    if (!allowedTypes.has(action.type)) return undefined;
    const target = typeof action.target === 'string' ? action.target.slice(0, 80) : '';
    if (action.type !== 'stop' && action.type !== 'ems_strength' && !target) return undefined;
    const duration = Number(action.durationSec);
    const value = Number(action.value);
    return {
      type: action.type,
      target,
      ...(Number.isFinite(duration) ? { durationSec: Math.min(300, Math.max(1, Math.round(duration))) } : {}),
      ...(Number.isFinite(value) ? { value: Math.min(200, Math.max(0, Math.round(value))) } : {}),
    };
  }

  /**
   * 根据用户的一句话设定创建可保存、可无限续写的全新地牢剧本。
   */
  async createScript(concept: string, signal?: AbortSignal): Promise<DungeonScript> {
    const llmConfig = useAppStore.getState().llmConfig;
    const safeConcept = concept.trim().slice(0, 4000);
    if (!safeConcept) throw new Error('请先填写地牢题材或角色设定');
    const createdAt = Date.now();
    const id = `ai_dungeon_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
    const localModel = isLocalApiBaseUrl(llmConfig.baseUrl);
    let fallbackReason = llmConfig.apiKey || localModel
      ? '模型返回异常，已使用离线创作模板。'
      : '未配置可用模型，已使用离线创作模板。';

    const buildOfflineScript = (): DungeonScript => {
      const isFemboy = /男娘|女装|雌堕|性转|伪娘/.test(safeConcept);
      const titleSeed = safeConcept.replace(/[\r\n]+/g, ' ').slice(0, 22);
      const speaker = isFemboy ? '幻境引导者' : '地牢引导者';
      const avatar = isFemboy ? '🌙' : '🗝️';
      return {
        id,
        title: `AI 地牢 · ${titleSeed}`,
        subtitle: '从你的设定出发，每一次选择都由 AI 继续创作',
        category: isFemboy ? '雌堕身心重塑' : '经典硬核支配',
        isFemboy,
        avatar,
        bgGradient: 'from-cyan-950 via-slate-950 to-rose-950',
        difficulty: 'AI 动态 · 无上限',
        tags: ['AI原创', '无限续写', '自由分支'],
        description: safeConcept,
        initialStepId: 'step_1',
        steps: {
          step_1: {
            id: 'step_1',
            speaker,
            avatar,
            narrative: `世界正在依照你的设定重组：${safeConcept}。远处的门扉缓慢开启，光影勾勒出一条从未被写进任何固定剧本的道路。这里没有预先规定的篇数，接下来的场景、人物关系与命运转折都会跟随你的选择继续生长。`,
            dialogue: '这是只属于你的故事。告诉我你准备以怎样的姿态迈出第一步，我会让这座地牢记住每一个选择。',
            choices: [
              { id: 'ai_open_1', text: '谨慎观察环境，先确认人物与规则。', attitude: 'neutral', replyDialogue: '谨慎让你捕捉到了被忽略的细节。', nextStepId: 'next_ai_expand' },
              { id: 'ai_open_2', text: '主动接近核心角色，推动故事快速展开。', attitude: 'submissive', replyDialogue: '你的主动回应让双方关系迅速升温。', nextStepId: 'next_ai_expand' },
              { id: 'ai_open_3', text: '拒绝既定安排，寻找一条完全不同的路线。', attitude: 'defiant', replyDialogue: '你的反向选择撕开了新的故事分支。', nextStepId: 'next_ai_expand' },
            ],
            generationSource: 'offline',
            generationNotice: fallbackReason,
          },
        },
        isAiGenerated: true,
        creatorPrompt: safeConcept,
        createdAt,
        generationSource: 'offline',
        generationNotice: fallbackReason,
      };
    };

    if ((llmConfig.apiKey && llmConfig.apiKey.trim()) || localModel) {
      try {
        const rawUrl = parseApiBaseUrl(llmConfig.baseUrl || 'https://api.deepseek.com/v1');
        if (!rawUrl) throw new Error('地牢 AI API 地址无效');
        const url = rawUrl.endsWith('/chat/completions') ? rawUrl : `${rawUrl}/chat/completions`;
        const prompt = `你是一名互动小说总编剧。请根据用户设定创作一个可无限续写的中文互动地牢开篇。
用户设定：${safeConcept}

只输出严格合法的 JSON，字段如下：
{
  "title": "简短有辨识度的剧本名",
  "subtitle": "一句吸引人的副标题",
  "category": "雌堕身心重塑 或 经典硬核支配",
  "isFemboy": false,
  "avatar": "一个 emoji",
  "difficulty": "难度描述",
  "tags": ["标签1", "标签2", "标签3"],
  "description": "完整世界观、主要角色、冲突和长期故事方向",
  "speaker": "开场核心角色名",
  "narrative": "800-2000字、有场景感和悬念的第一幕",
  "dialogue": "核心角色的开场对白",
  "choices": [
    {"text":"选择文本","attitude":"neutral","replyDialogue":"角色即时回应","nextStepId":"next_ai_expand"}
  ]
}
要求 choices 必须有 3 个，attitude 只能是 submissive/defiant/begging/neutral，全部使用 next_ai_expand。硬件动作只可作为可选建议，绝不能声称已经控制设备。不要预设总篇数或强制结局。`;
        const { response, text: responseText } = await fetchTextWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(llmConfig.apiKey.trim() ? { Authorization: `Bearer ${llmConfig.apiKey.trim()}` } : {}),
            },
            body: JSON.stringify({
              model: llmConfig.model || 'deepseek-chat',
              messages: [{ role: 'system', content: prompt }],
              temperature: 0.9,
              max_tokens: 5000,
            }),
            signal,
          },
          { timeoutMs: 60_000, maxBytes: 5_000_000, timeoutMessage: 'AI 剧本创作超过 60 秒' },
        );
        if (!response.ok) throw new Error(`模型请求失败 (${response.status})`);
        const data = JSON.parse(responseText);
        const jsonText = this.extractJsonObject(data.choices?.[0]?.message?.content || '');
        if (!jsonText) throw new Error('模型未返回有效 JSON');
        const parsed = JSON.parse(jsonText);
        const rawChoices = Array.isArray(parsed.choices) ? parsed.choices.slice(0, 3) : [];
        const narrative = typeof parsed.narrative === 'string' ? parsed.narrative.trim().slice(0, 20_000) : '';
        if (!narrative || rawChoices.length < 2) throw new Error('AI 剧本结构不完整');
        const source: DungeonStep['generationSource'] = localModel ? 'local' : 'cloud';
        const avatar = typeof parsed.avatar === 'string' ? parsed.avatar.slice(0, 20) : '🪄';
        const isFemboy = Boolean(parsed.isFemboy) || parsed.category === '雌堕身心重塑';
        const choices = rawChoices.map((choice: any, index: number): DungeonChoice => ({
          id: `ai_open_${index + 1}`,
          text: typeof choice.text === 'string' ? choice.text.slice(0, 1000) : `探索分支 ${index + 1}`,
          attitude: ['submissive', 'defiant', 'begging', 'neutral'].includes(choice.attitude) ? choice.attitude : 'neutral',
          replyDialogue: typeof choice.replyDialogue === 'string' ? choice.replyDialogue.slice(0, 2000) : '故事因你的选择产生了新的变化。',
          hardwareAction: this.sanitizeHardwareAction(choice.hardwareAction),
          nextStepId: 'next_ai_expand',
        }));
        return {
          id,
          title: typeof parsed.title === 'string' ? parsed.title.slice(0, 200) : 'AI 原创地牢',
          subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle.slice(0, 500) : '由 AI 即时生成的互动长篇',
          category: isFemboy ? '雌堕身心重塑' : '经典硬核支配',
          isFemboy,
          avatar,
          bgGradient: 'from-cyan-950 via-slate-950 to-rose-950',
          difficulty: typeof parsed.difficulty === 'string' ? parsed.difficulty.slice(0, 100) : 'AI 动态 · 无上限',
          tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag: unknown) => typeof tag === 'string').slice(0, 5) : ['AI原创', '无限续写'],
          description: typeof parsed.description === 'string' ? parsed.description.slice(0, 4000) : safeConcept,
          initialStepId: 'step_1',
          steps: {
            step_1: {
              id: 'step_1',
              speaker: typeof parsed.speaker === 'string' ? parsed.speaker.slice(0, 200) : '地牢引导者',
              avatar,
              narrative,
              dialogue: typeof parsed.dialogue === 'string' ? parsed.dialogue.slice(0, 5000) : '欢迎进入这段由你的选择不断书写的故事。',
              choices,
              generationSource: source,
              generationNotice: source === 'local' ? '由本地模型创作' : '由云端模型创作',
            },
          },
          isAiGenerated: true,
          creatorPrompt: safeConcept,
          createdAt,
          generationSource: source,
          generationNotice: source === 'local' ? '由本地模型创作' : '由云端模型创作',
        };
      } catch (error: any) {
        if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
        fallbackReason = `模型创作失败，已使用离线模板：${String(error?.message || error).slice(0, 300)}`;
      }
    }
    return buildOfflineScript();
  }

  /**
   * 基于当前地牢剧情上下文、历史前情与用户自定义动作，生成完整的互动续写章节。
   */
  async expandStory(
    script: DungeonScript,
    currentStep: DungeonStep,
    historyContext: string[],
    customAction?: string,
    signal?: AbortSignal,
    runState: DungeonRunState = DEFAULT_DUNGEON_RUN_STATE,
    forceEnding = false,
  ): Promise<DungeonStep> {
    const store = useAppStore.getState();
    const llmConfig = store.llmConfig;
    const safeCustomAction = typeof customAction === 'string' ? customAction.trim().slice(0, 2000) : '';
    const safeHistory = historyContext.slice(-4).map((item) => String(item).slice(0, 5000));
    const normalizedRunState = normalizeDungeonRunState(runState);
    const mustEnd = forceEnding;
    let fallbackReason = llmConfig.apiKey || isLocalApiBaseUrl(llmConfig.baseUrl)
      ? '模型返回异常，已使用离线剧情模板。'
      : '未配置可用模型，已使用离线剧情模板。';

    const systemPrompt = `你是一名殿堂级视觉小说与互动地牢冒险文学大师。
你正在主笔创作长篇互动小说《${script.title}》。
【剧本核心设定】
- 主题背景：${script.description}
- 核心角色：${currentStep.speaker} (${script.avatar})
- 调教与生理互动风格：极度沉浸、文学级细腻心理与肉体感官描摹、微电流/震动/灌肠等幻触硬件深度附魔、身心渐进瓦解与深层支配。

【当前剧情节点】
- 当前幕序：${currentStep.id}
- 前情提要与抉择历史：
${safeHistory.join('\n')}

【用户本幕行动/抉择】
${safeCustomAction ? `用户主动采取了以下行动：【${safeCustomAction}】` : `剧情沿着当前情境自然向更深层次的未知领域推演。`}

【创作输出要求】
请输出一个高密度、完整的后续剧情节点（必须是严格合法的 JSON 格式，建议 1200-3000 个中文字符），包含：
1. narrative: 细腻、连贯且富有张力的场景与心理描写。
2. dialogue: ${currentStep.speaker} 的当面长篇威压/挑逗/诱导对白，语气生动抓人。
    3. choices: 2~3 个后续分支抉择，每个抉择必须包含 text、attitude (submissive/defiant/begging/neutral)、replyDialogue，以及可选 hardwareAction。
4. 每个 choice 必须包含 nextStepId，继续故事时为 "next_ai_expand"，自然收束时为 "ending"。结局选项还要包含 endingType、endingTitle、endingDesc。
5. 当前为第 ${normalizedRunState.aiChapters + 1} 个 AI 章节。${mustEnd ? '用户主动要求收束，本章所有选项必须为 ending。' : '这是无限续写模式，不得因为章节数强制结束；可以继续，也可以在剧情自然完整时提供一个可选 ending。'}
6. 硬件动作只是剧情建议，客户端会根据玩家本次授权决定是否执行；不得声称未经授权已经控制设备。

【严格 JSON 输出格式】
{
  "narrative": "长篇深度环境与肉体心理描摹...",
  "dialogue": "角色的长篇沉浸台词...",
  "choices": [
    {
      "id": "opt_1",
      "text": "用户的顺从抉择...",
      "attitude": "submissive",
      "replyDialogue": "角色回应...",
      "hardwareAction": { "type": "ems_wave", "target": "breathe", "durationSec": 15 },
      "nextStepId": "next_ai_expand"
    },
    {
      "id": "opt_2",
      "text": "用户的抗拒或求饶抉择...",
      "attitude": "defiant",
      "replyDialogue": "角色回应...",
      "nextStepId": "ending",
      "endingType": "released",
      "endingTitle": "协商离场",
      "endingDesc": "双方在边界清晰的前提下结束本次探索。"
    }
  ]
}`;

    const userPrompt = safeCustomAction
      ? `用户当前选择或输入了动作：${safeCustomAction}。请以此为触发点，创作下一幕长篇沉浸剧情，并输出对应 JSON。`
      : `请以 ${currentStep.speaker} 的视角和当前地牢设定的深度，长篇推演下一幕危机与身心高潮剧情，输出对应 JSON。`;

    if ((llmConfig.apiKey && llmConfig.apiKey.trim()) || isLocalApiBaseUrl(llmConfig.baseUrl)) {
      try {
        const rawUrl = parseApiBaseUrl(llmConfig.baseUrl || 'https://api.deepseek.com/v1');
        if (!rawUrl) throw new Error('地牢 AI API 地址无效');
        const url = rawUrl.endsWith('/chat/completions') ? rawUrl : `${rawUrl}/chat/completions`;

        const { response: resp, text: responseText } = await fetchTextWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(llmConfig.apiKey.trim() ? { 'Authorization': `Bearer ${llmConfig.apiKey.trim()}` } : {}),
            },
            body: JSON.stringify({
              model: llmConfig.model || 'deepseek-chat',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.85,
              max_tokens: 4000,
            }),
            signal,
          },
          { timeoutMs: 45_000, maxBytes: 5_000_000, timeoutMessage: '地牢 AI 请求超过 45 秒' },
        );

        if (resp.ok) {
          const data = JSON.parse(responseText);
          const raw = data.choices?.[0]?.message?.content || '';
          const jsonText = this.extractJsonObject(raw);
          if (jsonText) {
            const parsed = JSON.parse(jsonText);
            const narrative = typeof parsed.narrative === 'string' ? parsed.narrative.slice(0, 12000) : '';
            const dialogue = typeof parsed.dialogue === 'string' ? parsed.dialogue.slice(0, 4000) : '';
            const rawChoices = Array.isArray(parsed.choices) ? parsed.choices.slice(0, 3) : [];
            if (!narrative || rawChoices.length < 2) throw new Error('AI 地牢返回的数据结构不完整');
            const nextId = `step_ai_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const source: DungeonStep['generationSource'] = isLocalApiBaseUrl(rawUrl) ? 'local' : 'cloud';
            return {
              id: nextId,
              speaker: currentStep.speaker,
              avatar: currentStep.avatar || script.avatar,
              narrative,
              dialogue: dialogue || '（凝视着你，嘴角泛起意味深长的笑意）',
              choices: rawChoices.map((c: any, idx: number) => {
                const requestedEnding = mustEnd || c.nextStepId === 'ending';
                const endingType = ['surrender', 'conquer', 'punished', 'released'].includes(c.endingType)
                  ? c.endingType as DungeonEndingType
                  : undefined;
                return {
                  id: `c_ai_${idx}_${Date.now()}`,
                  text: typeof c.text === 'string' ? c.text.slice(0, 1000) : requestedEnding ? '结束本次探索' : '继续深入探索...',
                  attitude: ['submissive', 'defiant', 'begging', 'neutral'].includes(c.attitude) ? c.attitude : 'neutral',
                  replyDialogue: typeof c.replyDialogue === 'string' ? c.replyDialogue.slice(0, 2000) : '你的选择让故事走向了新的阶段。',
                  hardwareAction: requestedEnding ? undefined : this.sanitizeHardwareAction(c.hardwareAction),
                  nextStepId: requestedEnding ? 'ending' : 'next_ai_expand',
                  ...(requestedEnding ? {
                    endingType,
                    endingTitle: typeof c.endingTitle === 'string' ? c.endingTitle.slice(0, 500) : undefined,
                    endingDesc: typeof c.endingDesc === 'string' ? c.endingDesc.slice(0, 20_000) : undefined,
                  } : {}),
                } as DungeonChoice;
              }),
              generationSource: source,
              generationNotice: source === 'local' ? '由本地模型生成' : '由云端模型生成',
            };
          }
        }
      } catch (e: any) {
        if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
        console.warn('AI 地牢长篇动态扩写请求异常，回退至离线深度模板:', e);
        fallbackReason = `模型生成失败，已回退离线模板：${String(e?.message || e).slice(0, 300)}`;
      }
    }

    // 离线深度扩写兜底模板
    const nextId = `step_offline_${Date.now()}`;
    const fallbackEnding = buildDungeonEnding(script, normalizedRunState);
    return {
      id: nextId,
      speaker: currentStep.speaker,
      avatar: currentStep.avatar || script.avatar,
      narrative: `随着暗门后齿轮转动的巨响，地牢深处的地热与微电流雾气愈发浓郁。你感到每一寸被设备贴合的肌肤都在隐隐发烫，空气中的压迫感仿佛凝固成了实质。${currentStep.speaker} 踩着坚定的步履来到你面前，目光如利刃般剖开你仅存的伪装。`,
      dialogue: `你以为这就结束了吗？真正的身心试炼才刚刚拉开帷幕。在这片属于我的绝对领地里，你的一切反抗都只是最甜美的助燃剂~ 准备好迎接更深一重的蜕变了吗？`,
      choices: mustEnd ? [
        {
          id: `c_off_end_${Date.now()}`,
          text: '整理这段经历，结束本次探索。',
          attitude: 'neutral',
          replyDialogue: '故事在这里告一段落，你带着自己的选择离开了地牢。',
          nextStepId: 'ending',
          endingType: fallbackEnding.type,
          endingTitle: fallbackEnding.title,
          endingDesc: fallbackEnding.desc,
        },
      ] : [
        {
          id: `c_off_1_${Date.now()}`,
          text: '（双腿发软，彻底放弃抵抗）任凭处置... 我愿意承受更深层次的洗礼...',
          attitude: 'submissive',
          replyDialogue: '很好，顺从才是通往极乐的唯一钥匙~ 微电流全面唤醒！',
          hardwareAction: { type: 'ems_wave', target: 'rhythm_step', durationSec: 15 },
          nextStepId: 'next_ai_expand',
        },
        {
          id: `c_off_2_${Date.now()}`,
          text: '（紧咬牙关，眼神顽强）我绝不会轻易向你屈服！',
          attitude: 'defiant',
          replyDialogue: '我就喜欢看你这副骨头硬却不得不娇喘的样子！加倍惩戒！',
          hardwareAction: { type: 'toy_pattern', target: 'punishment_surge', durationSec: 20 },
          nextStepId: 'next_ai_expand',
        },
      ],
      generationSource: 'offline',
      generationNotice: fallbackReason,
    };
  }
}
