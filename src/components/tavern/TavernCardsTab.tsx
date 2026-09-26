import React, { useEffect, useState, useRef } from 'react';
import { TavernStore } from '../../core/tavern/tavernData';
import { TavernCardParser } from '../../core/tavern/tavernCardParser';
import { TavernCharacterCard, TavernEmotionKey } from '../../core/tavern/tavernTypes';
import { CANONICAL_TAVERN_EMOTIONS } from '../../core/tavern/tavernEmotions';
import { createStoredWallpaper, createStoredSprite } from '../../core/tavern/tavernImageStorage';
import {
  buildTavernCardWriterRequest,
  parseAIGeneratedTavernCard,
  TAVERN_CARD_WRITER_SYSTEM_PROMPT,
} from '../../core/tavern/tavernCardWriter';
import { DZMMApiClient } from '../../core/tavern/dzmmApiClient';
import { LLMClient } from '../../core/ai/llmClient';
import { TTSManager } from '../../core/voice/ttsManager';
import { getTavernTtsVoiceOptions, resolveTavernVoiceConfig } from '../../core/tavern/tavernVoice';
import { BountyQuestEngine } from '../../core/tavern/bountyQuestEngine';
import { deleteCharacterStats } from '../../core/tavern/tavernStatusHud';
import { exportTextFile } from '../../core/ui/exportFile';
import { useAppStore } from '../../store/useAppStore';
import { Download, Upload, Zap, Trash2, WandSparkles, Sparkles, Save, X, RefreshCw, Pencil, Plus, Image as ImageIcon, BookOpen, Volume2, Eye, Check } from 'lucide-react';

const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_LENGTH = 280_000;

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('图片读取失败'));
  reader.onload = () => resolve(String(reader.result));
  reader.readAsDataURL(file);
});

const loadDataUrlImage = (dataUrl: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onerror = () => reject(new Error('图片无法解码'));
  image.onload = () => resolve(image);
  image.src = dataUrl;
});

const createStoredAvatar = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) throw new Error('请选择 PNG、JPEG、WebP 或 GIF 图片');
  if (file.size > MAX_AVATAR_UPLOAD_BYTES) throw new Error('头像图片不能超过 5 MB');

  const source = await readFileAsDataUrl(file);
  if (file.type === 'image/gif') {
    if (source.length > MAX_AVATAR_DATA_URL_LENGTH) throw new Error('GIF 头像压缩后仍过大，请换用小于 200 KB 的 GIF 或静态图片');
    return source;
  }

  const image = await loadDataUrlImage(source);
  const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = largestSide > 512 ? 512 / largestSide : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前设备无法处理头像图片');
  context.drawImage(image, 0, 0, width, height);

  for (const quality of [0.86, 0.76, 0.66, 0.55, 0.45]) {
    const compressed = canvas.toDataURL('image/webp', quality);
    if (compressed.length <= MAX_AVATAR_DATA_URL_LENGTH) return compressed;
  }

  // 极端复杂高细节图片二次自适应降采样至 384px 保证压缩成功
  const fallbackScale = Math.min(384 / largestSide, 1);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * fallbackScale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * fallbackScale));
  const fallbackCtx = canvas.getContext('2d');
  if (fallbackCtx) {
    fallbackCtx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.75, 0.6, 0.45]) {
      const compressed = canvas.toDataURL('image/webp', quality);
      if (compressed.length <= MAX_AVATAR_DATA_URL_LENGTH) return compressed;
    }
  }

  throw new Error('图片压缩后仍过大，请换用更简单或更小的图片');
};

interface Props {
  onSelectCard: (card: TavernCharacterCard) => void;
  onSelectCardAndChat: (card: TavernCharacterCard) => void;
  openAiWriterRequest?: number;
  conversationWriterRequest?: { id: number; brief: string } | null;
}

export const TavernCardsTab: React.FC<Props> = ({ onSelectCard, onSelectCardAndChat, openAiWriterRequest = 0, conversationWriterRequest = null }) => {
  const store = TavernStore.getInstance();
  const llmConfig = useAppStore((state) => state.llmConfig);
  const safetyConfig = useAppStore((state) => state.safetyConfig);
  const ttsVoiceProfiles = useAppStore((state) => state.ttsVoiceProfiles);
  const [cards, setCards] = useState<TavernCharacterCard[]>(store.getCards());
  const [activeCardId, setActiveCardId] = useState(store.getActiveCard().id);
  const [isImporting, setIsImporting] = useState(false);
  const [showAiWriter, setShowAiWriter] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [writerError, setWriterError] = useState<string | null>(null);
  const [generatedCard, setGeneratedCard] = useState<TavernCharacterCard | null>(null);
  const [editingCard, setEditingCard] = useState<TavernCharacterCard | null>(null);
  const [studioStep, setStudioStep] = useState<'basic' | 'greeting' | 'lorebook' | 'voice' | 'visuals' | 'preview'>('basic');
  const [visualUploadError, setVisualUploadError] = useState<string | null>(null);
  const [uploadingEmotion, setUploadingEmotion] = useState<TavernEmotionKey | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const wallpaperFileInputRef = useRef<HTMLInputElement | null>(null);
  const spriteFileInputRef = useRef<HTMLInputElement | null>(null);
  const writerRequestRef = useRef<AbortController | null>(null);
  const handledConversationWriterRequestRef = useRef(0);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [generatingFieldKey, setGeneratingFieldKey] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const singleFieldRequestRef = useRef<AbortController | null>(null);

  const showNotice = (msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setActionNotice(msg);
    noticeTimerRef.current = window.setTimeout(() => setActionNotice(null), 3000);
  };

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);
  const currentTtsLabel = safetyConfig.ttsEngine === 'siliconflow'
    ? '硅基流动 TTS'
    : safetyConfig.ttsEngine === 'volcengine_tts'
      ? '火山豆包 TTS 2.0'
      : safetyConfig.ttsEngine === 'edge_neural'
        ? 'Edge / Android 本地语音'
        : '浏览器本地语音';
  const currentTtsVoiceOptions = getTavernTtsVoiceOptions(safetyConfig.ttsEngine);
  const currentTtsVoiceProfiles = safetyConfig.ttsEngine === 'siliconflow' || safetyConfig.ttsEngine === 'volcengine_tts'
    ? ttsVoiceProfiles.filter((profile) => profile.engine === safetyConfig.ttsEngine)
    : [];

  useEffect(() => () => {
    writerRequestRef.current?.abort();
    singleFieldRequestRef.current?.abort();
  }, []);
  useEffect(() => {
    if (openAiWriterRequest > 0) {
      setWriterError(null);
      setGeneratedCard(null);
      setShowAiWriter(true);
    }
  }, [openAiWriterRequest]);

  const handleSelectCard = (card: TavernCharacterCard) => {
    onSelectCard(card);
    setActiveCardId(card.id);
  };

  const handleToggleEnchant = (e: React.MouseEvent, cardId: string) => {
    e.stopPropagation();
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    if (!card.hardwareEnchanted && card.source !== 'preset') {
      const accepted = confirm(
        `开启后，角色【${card.name}】的提示词将能够触发真实硬件工具。请仅对你信任且已经检查过的角色卡开启。\n\n确定继续吗？`
      );
      if (!accepted) return;
    }
    store.toggleCardEnchant(cardId);
    setCards(store.getCards());
  };

  const handleDeleteCard = (e: React.MouseEvent, card: TavernCharacterCard) => {
    e.stopPropagation();
    if (cards.length <= 1) {
      alert('酒馆至少需要保留一张角色卡。请先创建或导入另一张角色卡。');
      return;
    }
    if (confirm(`确定删除角色卡【${card.name}】吗？\n\n该角色的本地聊天记录也会一并删除，此操作无法撤销。`)) {
      if (!store.deleteCard(card.id)) return;
      deleteCharacterStats(card.id);
      const nextActiveCard = store.getActiveCard();
      setCards(store.getCards());
      setActiveCardId(nextActiveCard.id);
      onSelectCard(nextActiveCard);
    }
  };

  const updateGeneratedCard = (field: keyof TavernCharacterCard, value: string) => {
    setGeneratedCard((current) => current ? { ...current, [field]: value } : current);
  };

  const handleGenerateCard = async (briefOverride?: string) => {
    if (isGenerating) return;
    setWriterError(null);
    let requestText = '';
    try {
      requestText = buildTavernCardWriterRequest(briefOverride ?? aiBrief);
    } catch (error) {
      setWriterError(error instanceof Error ? error.message : '角色需求无效');
      return;
    }

    const controller = new AbortController();
    writerRequestRef.current?.abort();
    writerRequestRef.current = controller;
    setIsGenerating(true);
    try {
      const tavernConfig = store.getTavernModelConfig();
      let reply = '';
      if (tavernConfig.provider === 'dzmm') {
        const writerCard: TavernCharacterCard = {
          id: 'ai_card_writer',
          name: 'AI 角色卡工坊',
          avatar: '🪄',
          tag: '角色设计',
          description: '专业 SillyTavern Character Card V2 角色设计师。',
          personality: '严谨、富有想象力、严格遵循 JSON 输出格式。',
          scenario: '正在根据用户需求设计新角色。',
          firstMessage: '请描述你想创建的角色。',
          hardwareEnchanted: false,
          creator: '役次元',
          source: 'preset',
        };
        reply = await DZMMApiClient.chatWithCard({
          apiToken: tavernConfig.apiKey,
          model: tavernConfig.model,
          userName: tavernConfig.userName,
          card: writerCard,
          messages: [{ role: 'user', content: requestText }],
          systemPrompt: TAVERN_CARD_WRITER_SYSTEM_PROMPT,
          signal: controller.signal,
        });
      } else {
        const useCustomModel = tavernConfig.provider === 'custom';
        const client = new LLMClient({
          ...llmConfig,
          apiKey: useCustomModel ? tavernConfig.apiKey : llmConfig.apiKey,
          baseUrl: useCustomModel ? tavernConfig.baseUrl : llmConfig.baseUrl,
          model: useCustomModel ? tavernConfig.model : llmConfig.model,
          selectedPersonaId: 'custom',
        }, { hardwareToolsEnabled: false });
        const result = await client.sendMessage([{
          id: `card_writer_${Date.now()}`,
          role: 'user',
          content: requestText,
          timestamp: Date.now(),
        }], [], TAVERN_CARD_WRITER_SYSTEM_PROMPT, controller.signal);
        reply = result.reply;
      }

      if (controller.signal.aborted) return;
      const card = parseAIGeneratedTavernCard(reply);
      if (!card) throw new Error('AI 返回的角色卡字段不完整，请重试或补充更具体的需求');
      setGeneratedCard(card);
    } catch (error) {
      if (!controller.signal.aborted) {
        setWriterError(error instanceof Error ? error.message : 'AI 角色卡生成失败');
      }
    } finally {
      if (writerRequestRef.current === controller) writerRequestRef.current = null;
      if (!controller.signal.aborted) setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!conversationWriterRequest || conversationWriterRequest.id === handledConversationWriterRequestRef.current) return;
    handledConversationWriterRequestRef.current = conversationWriterRequest.id;
    setWriterError(null);
    setGeneratedCard(null);
    setAiBrief(conversationWriterRequest.brief);
    setShowAiWriter(true);
    void handleGenerateCard(conversationWriterRequest.brief);
  }, [conversationWriterRequest?.id]);

  const handleSaveGeneratedCard = () => {
    if (!generatedCard) return;
    const card = parseAIGeneratedTavernCard(JSON.stringify({
      ...generatedCard,
      firstMessage: generatedCard.firstMessage,
      tags: generatedCard.tag.split('/').map((tag) => tag.trim()).filter(Boolean),
    }));
    if (!card) {
      setWriterError('角色名称、简介、性格、场景和开场白都不能为空');
      return;
    }
    const savedCard = {
      ...card,
      id: generatedCard.id,
      hardwareEnchanted: false,
      creator: 'AI 角色卡工坊',
      source: 'ai_generated' as const,
    };
    store.addCard(savedCard);
    BountyQuestEngine.getInstance().incrementProgress('tavern_card');
    setCards(store.getCards());
    setActiveCardId(savedCard.id);
    onSelectCard(savedCard);
    setGeneratedCard(null);
    setAiBrief('');
    setShowAiWriter(false);
    setWriterError(null);
  };

  const handleExportCard = async (event: React.MouseEvent, card: TavernCharacterCard) => {
    event.stopPropagation();
    try {
      const json = TavernCardParser.exportJsonCard(card);
      const safeName = card.name.replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim().replace(/\.+$/, '').slice(0, 60) || 'character-card';
      const fileName = `${safeName}.json`;
      await exportTextFile(fileName, json, {
        dialogTitle: `导出角色卡【${card.name}】`,
        text: `角色卡：${card.name}`,
      });
      showNotice(`角色卡【${card.name}】已导出`);
    } catch (error) {
      console.error('导出角色卡失败:', error);
      const isCanceled = error instanceof Error && /cancel/i.test(error.message);
      if (!isCanceled) {
        alert(error instanceof Error ? `导出失败: ${error.message}` : '角色卡导出失败，请重试');
      }
    }
  };

  const openStudioEditor = (event: React.MouseEvent, card: TavernCharacterCard) => {
    event.stopPropagation();
    singleFieldRequestRef.current?.abort();
    setGeneratingFieldKey(null);
    setEditingCard(JSON.parse(JSON.stringify(card)) as TavernCharacterCard);
    setStudioStep('basic');
  };

  const handleCreateNewCard = () => {
    singleFieldRequestRef.current?.abort();
    setGeneratingFieldKey(null);
    const newCard: TavernCharacterCard = {
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: '',
      avatar: '🎴',
      tag: '原创角色',
      description: '',
      personality: '',
      scenario: '',
      firstMessage: '',
      mesExamples: '',
      systemPromptAddon: '',
      postHistoryInstructions: '',
      alternateGreetings: [],
      creatorNotes: '',
      hardwareEnchanted: false,
      source: 'preset',
      creator: '本地创作者',
    };
    setEditingCard(newCard);
    setStudioStep('basic');
    setShowAiWriter(false);
  };

  const closeStudioEditor = () => {
    singleFieldRequestRef.current?.abort();
    setGeneratingFieldKey(null);
    setEditingCard(null);
  };

  const buildCharacterSummary = (card: TavernCharacterCard): string => {
    const parts: string[] = [];
    if (card.name.trim()) parts.push(`【角色名称】：${card.name.trim()}`);
    if (card.tag.trim()) parts.push(`【分类标签】：${card.tag.trim()}`);
    const intro = (card.introduction || card.description || '').trim();
    if (intro) parts.push(`【角色简介】：${intro}`);
    if (card.personality.trim()) parts.push(`【性格人设】：${card.personality.trim()}`);
    if (card.scenario.trim()) parts.push(`【初始场景】：${card.scenario.trim()}`);
    if (card.detailedDescription?.trim()) parts.push(`【详细设定】：${card.detailedDescription.trim()}`);
    if (card.firstMessage.trim()) parts.push(`【首条开场白】：${card.firstMessage.trim()}`);
    return parts.length > 0 ? `当前已有的人设背景信息如下：\n${parts.join('\n')}` : '（目前尚未填写其他设定，请自由发挥一位富有二次元魅力的人设）';
  };

  const executeAiCompletion = async (promptText: string, systemPromptText: string, signal?: AbortSignal): Promise<string> => {
    const tavernConfig = store.getTavernModelConfig();
    if (tavernConfig.provider === 'dzmm') {
      const writerCard: TavernCharacterCard = {
        id: 'ai_field_writer',
        name: 'AI 设定助手',
        avatar: '🪄',
        tag: '设定辅助',
        description: '专业 SillyTavern 角色人设精修助手。',
        personality: '文笔精炼生动，严格遵循输出要求。',
        scenario: '协助构思人设细节。',
        firstMessage: '准备就绪。',
        hardwareEnchanted: false,
        creator: '役次元',
        source: 'preset',
      };
      return await DZMMApiClient.chatWithCard({
        apiToken: tavernConfig.apiKey,
        model: tavernConfig.model,
        userName: tavernConfig.userName,
        card: writerCard,
        messages: [{ role: 'user', content: promptText }],
        systemPrompt: systemPromptText,
        signal,
      });
    } else {
      const useCustomModel = tavernConfig.provider === 'custom';
      const client = new LLMClient({
        ...llmConfig,
        apiKey: useCustomModel ? tavernConfig.apiKey : llmConfig.apiKey,
        baseUrl: useCustomModel ? tavernConfig.baseUrl : llmConfig.baseUrl,
        model: useCustomModel ? tavernConfig.model : llmConfig.model,
        selectedPersonaId: 'custom',
      }, { hardwareToolsEnabled: false });
      const result = await client.sendMessage([{
        id: `field_writer_${Date.now()}`,
        role: 'user',
        content: promptText,
        timestamp: Date.now(),
      }], [], systemPromptText, signal);
      return result.reply;
    }
  };

  const getFieldDisplayName = (key: string): string => {
    const map: Record<string, string> = {
      name: '角色名',
      tag: '标签',
      description: '角色介绍',
      personality: '性格特点',
      scenario: '初始场景',
      firstMessage: '首条开场白',
      mesExamples: '对话范例',
      systemPromptAddon: '系统补充指令',
      detailedDescription: '详细描述',
      suggestedReplies: '建议回复',
      lorebook: '世界书条目',
    };
    return map[key] || key;
  };

  const handleGenerateSingleField = async (fieldKey: 'name' | 'tag' | 'description' | 'personality' | 'scenario' | 'firstMessage' | 'mesExamples' | 'systemPromptAddon' | 'detailedDescription' | 'suggestedReplies' | 'lorebook') => {
    if (!editingCard || generatingFieldKey) return;
    const controller = new AbortController();
    singleFieldRequestRef.current?.abort();
    singleFieldRequestRef.current = controller;
    setGeneratingFieldKey(fieldKey);

    try {
      const summary = buildCharacterSummary(editingCard);
      let prompt = '';
      const systemPrompt = '你是一位专业的二次元角色设定与剧情编剧大师，熟悉 SillyTavern 角色卡设定。请直接输出最终内容，严禁带有多余的问候、前言、解释或 Markdown 代码块标记（如 ```）。';

      switch (fieldKey) {
        case 'name':
          prompt = `${summary}\n\n请为该角色起一个富有魅力、契合人设的精美名字（可包含中文译名或中英文名）。${editingCard.name.trim() ? `用户当前草稿名字为【${editingCard.name}】，可在此基础上美化润色。` : ''}\n只输出名字本身，不要任何引号、括号或多余说明。`;
          break;
        case 'tag':
          prompt = `${summary}\n\n请为该角色总结构思 2 到 4 个最核心的标签属性，使用英文正斜杠 / 分隔（例如：傲娇/机娘/青梅竹马）。只输出标签文本，不要多余说明。`;
          break;
        case 'description':
          prompt = `${summary}\n\n${editingCard.description.trim() ? `用户已有草稿：【${editingCard.description}】\n请在此基础上润色丰富` : '请为该角色编写'}一段引人入胜的角色卡简介（展示给用户，约100~200字），概括其身份定位、外貌特征与核心魅力。直接输出简介正文。`;
          break;
        case 'personality':
          prompt = `${summary}\n\n${editingCard.personality.trim() ? `用户已有草稿：【${editingCard.personality}】\n请在此基础上润色丰富` : '请为该角色详细设定'}性格特征、心理机制、待人处事方式与说话习惯风格（如傲娇、毒舌、粘人、理性等）。直接输出性格描写文本。`;
          break;
        case 'scenario':
          prompt = `${summary}\n\n${editingCard.scenario.trim() ? `用户已有草稿：【${editingCard.scenario}】\n请在此基础上润色丰富` : '请为该角色设计'}初次相遇或故事开端时的初始场景与背景设定（包括环境氛围、双方所处情境、事件契机）。直接输出场景文本。`;
          break;
        case 'firstMessage':
          prompt = `${summary}\n\n请为该角色创作极富代入感的首条开场白！动作和神态心理描写用星号包裹（如 *轻咬嘴唇，微微移开视线*），角色台词用中文双引号包裹。开场需要生动引出互动并给用户留下回复空间。直接输出开场白正文，不要加前缀。`;
          break;
        case 'mesExamples':
          prompt = `${summary}\n\n请为该角色编写一段代表性的对话范例，展示其性格与说话方式。严格按照 SillyTavern 标准范例格式：\n<START>\n{{user}}: （玩家的互动或发言）\n{{char}}: （角色的回应，包含动作描写与台词）\n直接输出范例文本，不要额外解释。`;
          break;
        case 'systemPromptAddon':
          prompt = `${summary}\n\n请为该角色编写系统补充指令（System Prompt Addon），规范 AI 在扮演该角色时的说话口吻、行为底线、特定称呼习惯与沉浸式要求。直接输出指令条目。`;
          break;
        case 'detailedDescription':
          prompt = `${summary}\n\n${editingCard.detailedDescription?.trim() ? `用户已有草稿：【${editingCard.detailedDescription}】\n请在此基础上丰富` : '请为该角色撰写'}详细背景档案（外貌身材、日常穿着、过往经历、隐秘爱好与弱点）。直接输出详细设定文本。`;
          break;
        case 'suggestedReplies':
          prompt = `${summary}\n\n${editingCard.firstMessage ? `开场白：${editingCard.firstMessage}\n` : ''}请为玩家构思 3 到 4 条接下来可以回复的内容（每行一条，玩家第一人称视角），涵盖不同互动态度。每行一条直接输出。`;
          break;
        case 'lorebook':
          prompt = `${summary}\n\n请为该角色构思一条扩充世界观的专属世界书条目。必须严格以 JSON 格式输出，包含 keywords 数组和 content 文本：\n{"keywords": ["关键词1", "关键词2"], "content": "条目详细剧情设定内容"}\n只输出合法的 JSON 代码，不要任何额外说明。`;
          break;
      }

      const reply = await executeAiCompletion(prompt, systemPrompt, controller.signal);
      if (controller.signal.aborted) return;

      const cleaned = reply.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

      if (fieldKey === 'name') {
        const cleanName = cleaned.replace(/["'“”‘’]/g, '').trim().slice(0, 100);
        if (cleanName) updateEditingCard('name', cleanName);
      } else if (fieldKey === 'tag') {
        const cleanTag = cleaned.replace(/[,，]/g, '/').replace(/\s+/g, '').trim().slice(0, 120);
        if (cleanTag) updateEditingCard('tag', cleanTag);
      } else if (fieldKey === 'description') {
        updateEditingCard('description', cleaned.slice(0, 12000));
        updateEditingCard('introduction', cleaned.slice(0, 12000));
      } else if (fieldKey === 'personality') {
        updateEditingCard('personality', cleaned.slice(0, 8000));
      } else if (fieldKey === 'scenario') {
        updateEditingCard('scenario', cleaned.slice(0, 8000));
      } else if (fieldKey === 'firstMessage') {
        updateEditingCard('firstMessage', cleaned.slice(0, 12000));
      } else if (fieldKey === 'mesExamples') {
        updateEditingCard('mesExamples', cleaned.slice(0, 12000));
      } else if (fieldKey === 'systemPromptAddon') {
        updateEditingCard('systemPromptAddon', cleaned.slice(0, 12000));
      } else if (fieldKey === 'detailedDescription') {
        updateEditingCard('detailedDescription', cleaned.slice(0, 20000));
      } else if (fieldKey === 'suggestedReplies') {
        const lines = cleaned.split(/\n+/).map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim()).filter(Boolean).slice(0, 12);
        if (lines.length > 0) updateEditingCard('suggestedReplies', lines);
      } else if (fieldKey === 'lorebook') {
        try {
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map(String).filter(Boolean) : [editingCard.name || '核心设定'];
            const content = typeof parsed.content === 'string' ? parsed.content.trim() : cleaned;
            const newEntry = {
              id: `studio_world_${Date.now()}`,
              keywords: keywords.length > 0 ? keywords : ['设定词'],
              content: content || '条目设定内容',
              enabled: true,
            };
            updateEditingCard('worldBookEntries', [...(editingCard.worldBookEntries || []), newEntry]);
          }
        } catch {
          const newEntry = {
            id: `studio_world_${Date.now()}`,
            keywords: [editingCard.name || '背景设定'],
            content: cleaned.slice(0, 4000),
            enabled: true,
          };
          updateEditingCard('worldBookEntries', [...(editingCard.worldBookEntries || []), newEntry]);
        }
      }

      showNotice(`AI 已生成【${getFieldDisplayName(fieldKey)}】`);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('单字段 AI 生成失败:', err);
        alert(err instanceof Error ? `生成失败: ${err.message}` : 'AI 生成失败，请重试');
      }
    } finally {
      if (singleFieldRequestRef.current === controller) {
        singleFieldRequestRef.current = null;
      }
      if (!controller.signal.aborted) {
        setGeneratingFieldKey(null);
      }
    }
  };

  const handleAiFillNextField = () => {
    if (!editingCard) return;
    if (!editingCard.name.trim()) {
      setStudioStep('basic');
      void handleGenerateSingleField('name');
    } else if (!editingCard.description.trim()) {
      setStudioStep('basic');
      void handleGenerateSingleField('description');
    } else if (!editingCard.personality.trim()) {
      setStudioStep('basic');
      void handleGenerateSingleField('personality');
    } else if (!editingCard.scenario.trim()) {
      setStudioStep('basic');
      void handleGenerateSingleField('scenario');
    } else if (!editingCard.firstMessage.trim()) {
      setStudioStep('greeting');
      void handleGenerateSingleField('firstMessage');
    } else if (!editingCard.mesExamples?.trim()) {
      setStudioStep('greeting');
      void handleGenerateSingleField('mesExamples');
    } else if (!editingCard.systemPromptAddon?.trim()) {
      setStudioStep('basic');
      void handleGenerateSingleField('systemPromptAddon');
    } else {
      showNotice('所有核心字段均已填写，可继续手动微调或前往预览保存');
    }
  };

  const renderFieldHeader = (
    label: string,
    fieldKey: 'name' | 'tag' | 'description' | 'personality' | 'scenario' | 'firstMessage' | 'mesExamples' | 'systemPromptAddon' | 'detailedDescription' | 'suggestedReplies',
    customAiLabel?: string
  ) => {
    const isGenerating = generatingFieldKey === fieldKey;
    const hasValue = Boolean(
      fieldKey === 'suggestedReplies'
        ? editingCard?.suggestedReplies?.length
        : fieldKey === 'detailedDescription'
          ? editingCard?.detailedDescription?.trim()
          : (editingCard?.[fieldKey as keyof TavernCharacterCard] as string | undefined)?.trim()
    );
    const buttonText = isGenerating
      ? '生成中...'
      : hasValue
        ? 'AI 润色'
        : (customAiLabel || 'AI 构思');

    return (
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-bold text-slate-600">{label}</span>
        <button
          type="button"
          onClick={() => void handleGenerateSingleField(fieldKey)}
          disabled={Boolean(generatingFieldKey)}
          className="flex items-center gap-1 rounded-lg border border-pink-200/90 bg-pink-50/80 px-2 py-0.5 text-[8.5px] font-bold text-pink-700 hover:bg-pink-100 hover:border-pink-300 transition active:scale-95 disabled:opacity-40 shadow-xs"
        >
          <Sparkles className={`h-2.5 w-2.5 text-pink-500 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{buttonText}</span>
        </button>
      </div>
    );
  };

  const updateEditingCard = <K extends keyof TavernCharacterCard>(field: K, value: TavernCharacterCard[K]) => {
    setEditingCard((current) => current ? { ...current, [field]: value } : current);
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarUploadError(null);
    try {
      updateEditingCard('avatar', await createStoredAvatar(file));
    } catch (error) {
      setAvatarUploadError(error instanceof Error ? error.message : '头像上传失败');
    }
  };

  const handleWallpaperUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setVisualUploadError(null);
    try {
      const stored = await createStoredWallpaper(file);
      updateEditingCard('sceneWallpaper', stored);
      if (editingCard?.sceneWallpaperOverlay === undefined) {
        updateEditingCard('sceneWallpaperOverlay', 0.65);
      }
    } catch (error) {
      setVisualUploadError(error instanceof Error ? error.message : '壁纸上传失败');
    }
  };

  const handleSpriteUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const emotion = uploadingEmotion;
    event.target.value = '';
    if (!file || !emotion) return;
    setVisualUploadError(null);
    try {
      const stored = await createStoredSprite(file);
      const currentExpressions = editingCard?.expressions || {};
      updateEditingCard('expressions', {
        ...currentExpressions,
        [emotion]: stored,
      });
    } catch (error) {
      setVisualUploadError(error instanceof Error ? error.message : '立绘差分上传失败');
    } finally {
      setUploadingEmotion(null);
    }
  };

  const triggerUploadSprite = (emotion: TavernEmotionKey) => {
    setUploadingEmotion(emotion);
    setVisualUploadError(null);
    spriteFileInputRef.current?.click();
  };

  const removeSprite = (emotion: TavernEmotionKey) => {
    if (!editingCard?.expressions) return;
    const next = { ...editingCard.expressions };
    delete next[emotion];
    updateEditingCard('expressions', Object.keys(next).length > 0 ? next : undefined);
  };

  const removeWallpaper = () => {
    updateEditingCard('sceneWallpaper', undefined);
  };

  const saveStudioCard = () => {
    if (!editingCard) return;
    const cleanCard = TavernCardParser.parseJsonCard(TavernCardParser.exportJsonCard(editingCard));
    if (!cleanCard) {
      alert('角色名称、简介、性格、场景和开场白至少需要填写其中的基础内容。');
      return;
    }
    const savedCard: TavernCharacterCard = {
      ...cleanCard,
      id: editingCard.id,
      avatar: editingCard.avatar,
      sceneWallpaper: editingCard.sceneWallpaper,
      sceneWallpaperOverlay: editingCard.sceneWallpaperOverlay,
      expressions: editingCard.expressions,
      hardwareEnchanted: editingCard.hardwareEnchanted,
      source: editingCard.source,
      creator: editingCard.creator,
    };
    store.addCard(savedCard);
    BountyQuestEngine.getInstance().incrementProgress('tavern_card');
    setCards(store.getCards());
    setEditingCard(null);
    setActiveCardId(savedCard.id);
    onSelectCard(savedCard);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      let newCard: TavernCharacterCard | null = null;
      const lowerName = file.name.toLocaleLowerCase();
      if (lowerName.endsWith('.png') || file.type === 'image/png') {
        newCard = await TavernCardParser.parsePngCard(file);
      } else if (lowerName.endsWith('.json') || file.type === 'application/json') {
        const text = await file.text();
        newCard = TavernCardParser.parseJsonCard(text);
      }

      if (newCard) {
        if (newCard.avatar && typeof newCard.avatar === 'string' && newCard.avatar.length > 500_000) {
          newCard.avatar = '🎴';
        }
        const existingCards = store.getCards();
        const sameNameCard = existingCards.find((c) => c.name.trim().toLowerCase() === newCard!.name.trim().toLowerCase());
        if (sameNameCard) {
          const shouldUpdate = window.confirm(`检测到已存在同名角色【${sameNameCard.name}】。\n\n• 点击【确定】：覆盖更新该角色设定，并【保留现有会话与记忆】\n• 点击【取消】：导入为独立的新角色`);
          if (shouldUpdate) {
            newCard.id = sameNameCard.id;
          }
        }
        store.addCard(newCard);
        BountyQuestEngine.getInstance().incrementProgress('tavern_card');
        setCards(store.getCards());
        setActiveCardId(newCard.id);
        onSelectCard(newCard);
      } else {
        alert('解析角色卡失败，请确保是标准的 SillyTavern PNG 或 JSON 文件。');
      }
    } catch (err) {
      console.error(err);
      alert('导入出错，请重试。');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {actionNotice && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white/95 backdrop-blur-md px-4 py-2.5 text-xs font-bold text-emerald-800 shadow-xl shadow-emerald-500/10 pointer-events-none transition-all">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}
      {/* 顶部导入与说明横幅 (Apple Liquid Card) */}
      <section className="liquid-card relative overflow-hidden p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/90 bg-pink-50/80 text-2xl shadow-xs">
              🎴
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <span>本地角色卡工坊</span>
              </h3>
              <p className="text-[10px] text-slate-500">兼容 SillyTavern PNG / JSON；导入后默认纯文字，更安全</p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              type="button"
              onClick={handleCreateNewCard}
              className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-xs font-black shadow-sm shadow-pink-500/20 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>手动添加角色</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".png,.json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="px-3.5 py-2 rounded-2xl border border-pink-200 bg-white/90 hover:bg-pink-50/80 text-pink-700 text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isImporting ? '解析中...' : '导入角色卡'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAiWriter((current) => !current);
                setWriterError(null);
              }}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-pink-100 bg-pink-50/70 px-3.5 py-1.5 text-[11px] font-bold text-pink-700 active:scale-95 hover:bg-pink-100 transition"
            >
              <WandSparkles className="h-3 w-3" />
              AI 全自动写卡
            </button>
          </div>
        </div>
      </section>

      {showAiWriter && (
        <section className="rounded-3xl border border-pink-200/90 bg-white/95 backdrop-blur-xl p-5 shadow-[0_12px_36px_rgba(233,104,146,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-black text-pink-700"><WandSparkles className="h-4 w-4 text-pink-500" />AI 角色卡编剧</p>
              <p className="mt-1 text-[9.5px] leading-relaxed text-slate-500">描述身份、性格、关系、背景与说话风格。生成后可逐项修改，确认前不会保存。</p>
            </div>
            <button type="button" onClick={() => setShowAiWriter(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-600" aria-label="关闭 AI 角色卡编剧"><X className="h-4 w-4" /></button>
          </div>

          <textarea
            value={aiBrief}
            onChange={(event) => setAiBrief(event.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="例如：一位来自月面都市的冷面机械师，和用户是互相嘴硬的老搭档；说话简短毒舌，但遇到危险会保护用户……"
            className="mt-3 w-full resize-none rounded-2xl border border-pink-100 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-pink-300 focus:bg-white"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[9px] text-slate-400">{aiBrief.length}/2000 · 使用当前酒馆模型通道</span>
            <button type="button" onClick={() => void handleGenerateCard()} disabled={isGenerating || !aiBrief.trim()} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-3.5 py-2 text-[10px] font-black text-white shadow-sm shadow-pink-500/20 disabled:opacity-40 active:scale-95">
              <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? '正在创作...' : generatedCard ? '重新生成' : '生成角色卡'}
            </button>
          </div>

          {writerError && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-[10px] leading-relaxed text-rose-700">{writerError}</p>}

          {generatedCard && (
            <div className="mt-4 space-y-3 border-t border-pink-100 pt-4">
              <div className="grid grid-cols-[64px_1fr] gap-2">
                <label className="text-[9px] font-bold text-slate-500">头像 Emoji<input value={generatedCard.avatar} onChange={(event) => updateGeneratedCard('avatar', event.target.value)} maxLength={8} className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-center text-xl text-slate-800 outline-none focus:border-pink-300 focus:bg-white" /></label>
                <label className="text-[9px] font-bold text-slate-500">角色名称<input value={generatedCard.name} onChange={(event) => updateGeneratedCard('name', event.target.value)} maxLength={100} className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-pink-300 focus:bg-white" /></label>
              </div>
              <label className="block text-[9px] font-bold text-slate-500">标签（用 / 分隔）<input value={generatedCard.tag} onChange={(event) => updateGeneratedCard('tag', event.target.value)} maxLength={120} className="mt-1 w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white" /></label>
              {([
                ['description', '角色简介', 12000, 3],
                ['personality', '性格与说话方式', 8000, 3],
                ['scenario', '初始场景', 8000, 3],
                ['firstMessage', '开场白', 12000, 4],
                ['mesExamples', '对话范例', 12000, 4],
                ['systemPromptAddon', '角色补充指令', 12000, 3],
              ] as const).map(([field, label, maxLength, rows]) => (
                <label key={field} className="block text-[9px] font-bold text-slate-500">{label}<textarea value={generatedCard[field] || ''} onChange={(event) => updateGeneratedCard(field, event.target.value)} maxLength={maxLength} rows={rows} className="mt-1 w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white" /></label>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(event) => void handleExportCard(event, generatedCard)}
                  className="flex items-center justify-center gap-1 rounded-2xl border border-pink-200 bg-pink-50/80 px-3.5 py-2.5 text-xs font-bold text-pink-700 hover:bg-pink-100 transition active:scale-98 shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  导出 JSON
                </button>
                <button
                  type="button"
                  onClick={handleSaveGeneratedCard}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 py-2.5 text-xs font-black text-white shadow-sm shadow-pink-500/20 active:scale-98"
                >
                  <Save className="h-4 w-4" />
                  确认并保存角色卡
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {editingCard && (
        <section className="tavern-card-studio rounded-3xl border border-pink-200/90 bg-white/98 backdrop-blur-xl p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-black text-slate-800">
                <Pencil className="h-4 w-4 text-pink-500" />
                {editingCard.name ? `编辑角色：${editingCard.name}` : '手动新建角色卡'}
              </h3>
              <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
                支持纯手打输入，也可配合右侧 AI 助手逐行构思润色。保存仅写入本机，安全可控。
              </p>
            </div>
            <button
              type="button"
              onClick={closeStudioEditor}
              aria-label="关闭角色编辑"
              className="rounded-lg border border-pink-100 bg-white p-1.5 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* AI 协同创作助手快捷横幅 */}
          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-pink-200/80 bg-gradient-to-r from-pink-50/90 via-white to-pink-50/50 p-3 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-pink-100 text-pink-600 shrink-0">
                <WandSparkles className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-pink-800">AI 逐行构思与手打协同</p>
                <p className="text-[8.5px] text-slate-500">可全手打输入，亦可点击每行右侧【AI 生成/润色】单项构思</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAiFillNextField}
              disabled={Boolean(generatingFieldKey)}
              className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 text-white px-2.5 py-1.5 text-[9.5px] font-black shadow-xs active:scale-95 transition shrink-0"
            >
              <Sparkles className={`h-3 w-3 ${generatingFieldKey ? 'animate-spin' : ''}`} />
              <span>{generatingFieldKey ? '正在构思...' : '顺次构思下一项'}</span>
            </button>
          </div>

          <div className="mt-3 flex gap-1 overflow-x-auto rounded-2xl border border-pink-100/90 bg-white/80 p-1 backdrop-blur-md scrollbar-none shadow-xs">
            {([
              ['basic', '核心身份', Pencil],
              ['greeting', '开场对话', Plus],
              ['lorebook', '世界书', BookOpen],
              ['voice', 'TTS语音', Volume2],
              ['visuals', '壁纸与差分', ImageIcon],
              ['preview', '预览发布', Eye],
            ] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setStudioStep(id)} className={`flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-2 text-[9px] font-bold transition ${studioStep === id ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm shadow-pink-500/20' : 'text-slate-500 hover:text-slate-800 hover:bg-pink-50/50'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
          </div>

          {studioStep === 'basic' && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-[88px_1fr] gap-2">
                <div className="text-[9px] font-bold text-slate-500">
                  头像
                  <div className="mt-1 flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-2xl border border-pink-200 bg-pink-50 text-2xl text-slate-700 shadow-xs">
                    {/^(?:https:|data:image\/)/i.test(editingCard.avatar) ? (
                      <img src={editingCard.avatar} alt="角色头像预览" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : (
                      editingCard.avatar || '🎴'
                    )}
                  </div>
                  <input ref={avatarFileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void handleAvatarUpload(event)} className="hidden" />
                  <button type="button" onClick={() => avatarFileInputRef.current?.click()} className="mt-1.5 flex w-[72px] items-center justify-center gap-1 rounded-lg border border-pink-200 bg-pink-50/80 px-1 py-1.5 text-[9px] font-bold text-pink-700 hover:bg-pink-100 transition active:scale-95"><Upload className="h-3 w-3" />上传</button>
                </div>
                <div className="space-y-2">
                  <div>
                    {renderFieldHeader('角色名', 'name', 'AI 取名')}
                    <input
                      value={editingCard.name}
                      onChange={(event) => updateEditingCard('name', event.target.value)}
                      maxLength={100}
                      placeholder="例如：蕾拉 / Layla"
                      className="w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                    />
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-500 mb-1">图片网址或 Emoji</span>
                    <input
                      value={editingCard.avatar}
                      onChange={(event) => { setAvatarUploadError(null); updateEditingCard('avatar', event.target.value); }}
                      placeholder="https://example.com/avatar.webp 或 😈"
                      maxLength={300000}
                      className="w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-pink-300 focus:bg-white"
                    />
                    <button type="button" onClick={() => { setAvatarUploadError(null); updateEditingCard('avatar', '🎴'); }} className="mt-1 text-[9px] font-bold text-pink-500 hover:text-pink-600">恢复默认头像</button>
                  </div>
                </div>
              </div>
              {avatarUploadError && <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-[10px] text-rose-700">{avatarUploadError}</p>}

              <div>
                {renderFieldHeader('角色卡介绍（展示给用户，不等于提示词）', 'description', 'AI 扩写简介')}
                <textarea
                  value={editingCard.introduction ?? editingCard.description}
                  onChange={(event) => { updateEditingCard('introduction', event.target.value); updateEditingCard('description', event.target.value); }}
                  maxLength={12000}
                  rows={3}
                  placeholder="概括角色的身份、外表与吸引力，展示在名录列表中（可自己手打，也可点击右上角 AI 扩写）"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 mb-1">图库（每行一个 HTTPS 图片地址；本地只保存链接）</label>
                <textarea
                  value={(editingCard.galleryImages || []).join('\n')}
                  onChange={(event) => updateEditingCard('galleryImages', event.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 8))}
                  rows={2}
                  placeholder="https://example.com/character-cover.webp"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-pink-300 focus:bg-white"
                />
              </div>

              <div>
                {renderFieldHeader('标签（用 / 分隔）', 'tag', 'AI 提取标签')}
                <input
                  value={editingCard.tag}
                  onChange={(event) => updateEditingCard('tag', event.target.value)}
                  maxLength={120}
                  placeholder="例如：冷面机师 / 傲娇 / 战友"
                  className="w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                />
              </div>

              <div>
                {renderFieldHeader('性格特点', 'personality', 'AI 构思性格')}
                <textarea
                  value={editingCard.personality}
                  onChange={(event) => updateEditingCard('personality', event.target.value)}
                  maxLength={8000}
                  rows={3}
                  placeholder="描述角色性格、心理弱点、待人态度与语言习惯风格（可自己手打，也可点击右上角 AI 构思）"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                />
              </div>

              <div>
                {renderFieldHeader('初始场景', 'scenario', 'AI 构思场景')}
                <textarea
                  value={editingCard.scenario}
                  onChange={(event) => updateEditingCard('scenario', event.target.value)}
                  maxLength={8000}
                  rows={3}
                  placeholder="初遇或开篇时的环境场所、双方所处状况及互动动机（可手打，或由 AI 构思）"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                />
              </div>

              <div>
                {renderFieldHeader('系统指令', 'systemPromptAddon', 'AI 补充指令')}
                <textarea
                  value={editingCard.systemPromptAddon || ''}
                  onChange={(event) => updateEditingCard('systemPromptAddon', event.target.value)}
                  maxLength={12000}
                  rows={4}
                  placeholder="设定专属系统提示词补丁，如说话语气约束、沉浸规则等（可选，可由 AI 补充）"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                />
              </div>

              <div>
                {renderFieldHeader('建议回复（每行一条，最多 12 条）', 'suggestedReplies', 'AI 生成预设')}
                <textarea
                  value={(editingCard.suggestedReplies || []).join('\n')}
                  onChange={(event) => updateEditingCard('suggestedReplies', event.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 12))}
                  maxLength={6000}
                  rows={3}
                  placeholder="开局给玩家的快捷回复气泡选项，每行一条（可选，可点击 AI 自动构思）"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                />
              </div>

              <div>
                {renderFieldHeader('详细描述', 'detailedDescription', 'AI 详细扩写')}
                <textarea
                  value={editingCard.detailedDescription || ''}
                  onChange={(event) => updateEditingCard('detailedDescription', event.target.value)}
                  maxLength={20000}
                  rows={5}
                  placeholder="角色的深度外貌特征、生活习惯、过往生平与隐秘秘密（可选，可由 AI 丰富扩写）"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                />
              </div>
            </div>
          )}

          {studioStep === 'greeting' && (
            <div className="mt-4 space-y-3">
              <div>
                {renderFieldHeader('首条开场白', 'firstMessage', 'AI 写开场白')}
                <textarea
                  value={editingCard.firstMessage}
                  onChange={(event) => updateEditingCard('firstMessage', event.target.value)}
                  maxLength={12000}
                  rows={5}
                  placeholder="角色的第一句话，用 *包裹动作心理*，用 “双引号包裹台词”（可自己输入，也可点击右上角 AI 写开场白）"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                />
              </div>

              <div>
                <span className="block text-[9px] font-bold text-slate-600 mb-1">备用开场白（每行一条）</span>
                <textarea
                  value={(editingCard.alternateGreetings || []).join('\n')}
                  onChange={(event) => updateEditingCard('alternateGreetings', event.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 20))}
                  maxLength={120000}
                  rows={4}
                  placeholder="其他不同情境下的开场白备选，每行一条（可选）"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                />
              </div>

              <div>
                {renderFieldHeader('对话范例', 'mesExamples', 'AI 生成对话范例')}
                <textarea
                  value={editingCard.mesExamples || ''}
                  onChange={(event) => updateEditingCard('mesExamples', event.target.value)}
                  maxLength={12000}
                  rows={6}
                  placeholder="<START>\n{{user}}: （玩家的互动或提问）\n{{char}}: （角色的典型回应，包含动作与台词）"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-pink-300 focus:bg-white"
                />
              </div>

              <div>
                <span className="block text-[9px] font-bold text-slate-600 mb-1">历史后置指令</span>
                <textarea
                  value={editingCard.postHistoryInstructions || ''}
                  onChange={(event) => updateEditingCard('postHistoryInstructions', event.target.value)}
                  maxLength={12000}
                  rows={4}
                  placeholder="放在对话历史最末尾的强化指令（如强调不要替用户说话，可选）"
                  className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2.5 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white placeholder:text-slate-400/80"
                />
              </div>
            </div>
          )}

          {studioStep === 'lorebook' && (
            <div className="mt-4 space-y-3">
              <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-2.5 text-[9px] leading-relaxed text-amber-800">
                角色内置世界书只作为剧情上下文。导入或编辑不会自动开启硬件规则；设备规则仍必须在“世界书 → 硬件触发规则”中由用户单独创建。
              </p>
              {(editingCard.worldBookEntries || []).map((entry, index) => (
                <div key={entry.id} className="space-y-2 rounded-2xl border border-pink-100/90 bg-white/95 p-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-pink-700">条目 {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => updateEditingCard('worldBookEntries', (editingCard.worldBookEntries || []).filter((_, itemIndex) => itemIndex !== index))}
                      className="text-[9px] text-rose-500 hover:text-rose-600"
                    >
                      删除
                    </button>
                  </div>
                  <input
                    value={entry.keywords.join(', ')}
                    onChange={(event) => updateEditingCard('worldBookEntries', (editingCard.worldBookEntries || []).map((item, itemIndex) => itemIndex === index ? { ...item, keywords: event.target.value.split(',').map((word) => word.trim()).filter(Boolean).slice(0, 30) } : item))}
                    placeholder="关键词，使用逗号分隔"
                    className="w-full rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                  />
                  <textarea
                    value={entry.content}
                    onChange={(event) => updateEditingCard('worldBookEntries', (editingCard.worldBookEntries || []).map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value } : item))}
                    rows={3}
                    placeholder="填写命中关键词后自动注入的剧情世界观设定"
                    className="w-full resize-y rounded-xl border border-pink-100 bg-slate-50/60 p-2 text-xs leading-relaxed text-slate-800 outline-none focus:border-pink-300 focus:bg-white"
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateSingleField('lorebook')}
                  disabled={Boolean(generatingFieldKey)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-pink-200 bg-pink-50/80 py-2.5 text-[10px] font-bold text-pink-700 hover:bg-pink-100 transition active:scale-95 disabled:opacity-40 shadow-xs"
                >
                  <Sparkles className={`h-3.5 w-3.5 text-pink-500 ${generatingFieldKey === 'lorebook' ? 'animate-spin' : ''}`} />
                  <span>{generatingFieldKey === 'lorebook' ? 'AI 正在构思设定...' : 'AI 构思世界书条目'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateEditingCard('worldBookEntries', [...(editingCard.worldBookEntries || []), { id: `studio_world_${Date.now()}`, keywords: ['新关键词'], content: '填写命中后注入的剧情设定。', enabled: true }])}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-dashed border-pink-300 bg-white py-2.5 text-[10px] font-bold text-slate-600 hover:bg-pink-50 transition active:scale-95 shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  手动添加空白条目
                </button>
              </div>
            </div>
          )}

          {studioStep === 'voice' && <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-pink-100 bg-pink-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div><p className="text-[10px] font-black text-pink-800">当前全局引擎</p><p className="mt-0.5 text-xs font-black text-slate-800">{currentTtsLabel}</p></div>
                <span className="rounded-full bg-pink-100 px-2 py-1 text-[9px] font-bold text-pink-700">系统设置同步</span>
              </div>
              <p className="mt-2 text-[9px] leading-4 text-slate-500">角色音色只在保存时的 TTS 引擎中生效。切换到其他引擎或音色不可用时，会自动使用系统设置中的全局预设音色。</p>
            </div>
            <label className="flex items-center justify-between rounded-xl border border-pink-100 bg-white p-3 text-xs font-bold text-slate-800">启用角色专属 TTS 音色<input type="checkbox" checked={editingCard.voiceSettings?.enabled === true} onChange={(event) => updateEditingCard('voiceSettings', { ...(editingCard.voiceSettings || { enabled: false }), enabled: event.target.checked })} className="h-4 w-4 accent-pink-500" /></label>

            {editingCard.voiceSettings?.enabled === true && currentTtsVoiceOptions.length > 0 && <>
              {editingCard.voiceSettings.engine && editingCard.voiceSettings.engine !== safetyConfig.ttsEngine && <p className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[9px] font-bold leading-4 text-amber-800">该角色保存的是 {editingCard.voiceSettings.engine === 'siliconflow' ? '硅基流动' : '火山豆包'} 音色，与当前引擎不同；聊天中暂时使用全局预设。选择下方音色可改为当前引擎。</p>}
              <div className="grid grid-cols-2 gap-2">
                {currentTtsVoiceOptions.map((voice) => {
                  const selected = editingCard.voiceSettings?.engine === safetyConfig.ttsEngine && editingCard.voiceSettings?.voiceId === voice.id;
                  return <button key={voice.id} type="button" title={voice.id} onClick={() => updateEditingCard('voiceSettings', {
                    ...(editingCard.voiceSettings || { enabled: true }),
                    enabled: true,
                    engine: safetyConfig.ttsEngine === 'siliconflow' ? 'siliconflow' : 'volcengine_tts',
                    voiceId: voice.id,
                    voiceName: voice.name,
                    profileId: undefined,
                  })} className={`rounded-xl border px-2.5 py-2.5 text-left transition-all ${selected ? 'border-pink-400 bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm' : 'border-pink-100 bg-white text-slate-700 hover:border-pink-200'}`}><span className="block truncate text-[10px] font-bold">{voice.name}</span><span className={`mt-0.5 block text-[8.5px] ${selected ? 'text-white/90' : 'text-slate-400'}`}>{voice.gender} · {voice.detail}</span></button>;
                })}
              </div>

              {currentTtsVoiceProfiles.length > 0 && <div className="space-y-2 rounded-2xl border border-pink-100 bg-pink-50/40 p-3">
                <div><p className="text-[10px] font-black text-pink-800">已保存的角色声线</p><p className="mt-0.5 text-[8.5px] text-slate-500">来自系统设置的声线工坊，选择后会连同调音参数一起应用。</p></div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {currentTtsVoiceProfiles.map((profile) => {
                    const selected = editingCard.voiceSettings?.profileId === profile.id;
                    return <button key={profile.id} type="button" onClick={() => updateEditingCard('voiceSettings', {
                      enabled: true,
                      engine: profile.engine,
                      voiceId: profile.baseVoiceId,
                      voiceName: profile.baseVoiceName,
                      profileId: profile.id,
                      speed: profile.rate,
                      pitch: profile.pitch,
                      gain: profile.gain,
                    })} className={`rounded-xl border px-2.5 py-2 text-left transition ${selected ? 'border-pink-400 bg-pink-500 text-white' : 'border-pink-100 bg-white text-slate-700'}`}>
                      <span className="block truncate text-[10px] font-bold">{profile.name}</span>
                      <span className={`mt-0.5 block truncate text-[8.5px] ${selected ? 'text-white/90' : 'text-slate-400'}`}>{profile.baseVoiceName} · {profile.rate.toFixed(1)}x · {profile.gain > 0 ? '+' : ''}{profile.gain}dB</span>
                    </button>;
                  })}
                </div>
              </div>}

              {resolveTavernVoiceConfig(editingCard.voiceSettings, safetyConfig.ttsEngine) && <div className="space-y-2 rounded-2xl border border-pink-100 bg-white p-3">
                <div className="flex items-center justify-between text-[9px] font-bold text-slate-600"><span>角色语速</span><span className="font-mono text-pink-600">{(editingCard.voiceSettings?.speed ?? 1).toFixed(1)}x</span></div>
                <input type="range" min={0.7} max={1.4} step={0.1} value={editingCard.voiceSettings?.speed ?? 1} onChange={(event) => updateEditingCard('voiceSettings', { ...editingCard.voiceSettings!, profileId: undefined, speed: Number(event.target.value) })} className="w-full accent-pink-500" />
                {safetyConfig.ttsEngine === 'volcengine_tts' && <><div className="flex items-center justify-between text-[9px] font-bold text-slate-600"><span>角色音调</span><span className="font-mono text-cyan-600">{(editingCard.voiceSettings?.pitch ?? 1).toFixed(2)}x</span></div><input type="range" min={0.8} max={1.3} step={0.05} value={editingCard.voiceSettings?.pitch ?? 1} onChange={(event) => updateEditingCard('voiceSettings', { ...editingCard.voiceSettings!, profileId: undefined, pitch: Number(event.target.value) })} className="w-full accent-cyan-500" /></>}
                <div className="flex items-center justify-between text-[9px] font-bold text-slate-600"><span>角色音量增益</span><span className="font-mono text-amber-600">{(editingCard.voiceSettings?.gain ?? 0) > 0 ? '+' : ''}{editingCard.voiceSettings?.gain ?? 0} dB</span></div>
                <input type="range" min={-10} max={10} step={1} value={editingCard.voiceSettings?.gain ?? 0} onChange={(event) => updateEditingCard('voiceSettings', { ...editingCard.voiceSettings!, profileId: undefined, gain: Number(event.target.value) })} className="w-full accent-amber-500" />
              </div>}
              {!resolveTavernVoiceConfig(editingCard.voiceSettings, safetyConfig.ttsEngine) && <p className="rounded-xl bg-slate-50 px-3 py-2 text-[9px] font-bold text-slate-500">尚未选择当前引擎的角色音色，实际朗读将使用全局预设。</p>}
            </>}

            {editingCard.voiceSettings?.enabled === true && currentTtsVoiceOptions.length === 0 && <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[9px] font-bold leading-4 text-slate-600">当前引擎没有可供角色单独选择的在线音色，角色会直接使用系统设置中的全局预设。</p>}
            <button type="button" onClick={() => void TTSManager.getInstance().speak(`你好，我是${editingCard.name}，这是我的角色语音试听。`, resolveTavernVoiceConfig(editingCard.voiceSettings, safetyConfig.ttsEngine)).catch((err) => console.warn('TTS preview error:', err))} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-pink-200 bg-pink-50/70 py-2.5 text-[10px] font-black text-pink-700 hover:bg-pink-100 transition active:scale-95"><Volume2 className="h-3.5 w-3.5" />试听当前实际音色</button>
          </div>}

          {studioStep === 'visuals' && (
            <div className="mt-4 space-y-4">
              <input
                ref={wallpaperFileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handleWallpaperUpload(e)}
                className="hidden"
              />
              <input
                ref={spriteFileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handleSpriteUpload(e)}
                className="hidden"
              />

              {visualUploadError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-2.5 text-[10px] text-rose-700">
                  {visualUploadError}
                </div>
              )}

              {/* 专属场景背景壁纸 */}
              <div className="rounded-2xl border border-pink-100 bg-white/90 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5 text-pink-500" />
                      角色专属场景壁纸
                    </h5>
                    <p className="text-[9px] text-slate-500">
                      进入该角色聊天时自动呈现专属场景，带安全暗色遮罩保护文字可读性
                    </p>
                  </div>
                  {editingCard.sceneWallpaper && (
                    <button
                      type="button"
                      onClick={removeWallpaper}
                      className="text-[9px] font-bold text-rose-500 hover:text-rose-600"
                    >
                      移除壁纸
                    </button>
                  )}
                </div>

                {editingCard.sceneWallpaper ? (
                  <div className="relative h-36 w-full overflow-hidden rounded-xl border border-pink-100">
                    <img
                      src={editingCard.sceneWallpaper}
                      alt="场景壁纸预览"
                      className="h-full w-full object-cover"
                    />
                    <div
                      className="absolute inset-0 flex flex-col justify-end p-2.5 backdrop-blur-[1px]"
                      style={{
                        backgroundColor: `rgba(2, 6, 23, ${editingCard.sceneWallpaperOverlay ?? 0.65})`,
                      }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow">
                        实机暗度预览 (遮罩 {Math.round((editingCard.sceneWallpaperOverlay ?? 0.65) * 100)}%)
                      </span>
                      <span className="text-[8.5px] text-slate-300 drop-shadow">
                        “角色台词与动作描述在此背景下保持清晰可读”
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => wallpaperFileInputRef.current?.click()}
                    className="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-pink-200 bg-pink-50/30 p-3 text-center transition-colors hover:border-pink-400 hover:bg-pink-50/60"
                  >
                    <Upload className="h-5 w-5 text-pink-500 mb-1" />
                    <span className="text-[10px] font-bold text-slate-700">点击上传专属场景壁纸</span>
                    <span className="text-[8.5px] text-slate-400">支持横图/竖图，自动优化压缩至 WebP</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => wallpaperFileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-pink-200 bg-pink-50/80 py-2 text-[10px] font-bold text-pink-700 hover:bg-pink-100 transition active:scale-95"
                  >
                    <Upload className="h-3 w-3" />
                    {editingCard.sceneWallpaper ? '替换壁纸图片' : '选择图片上传'}
                  </button>
                </div>

                {editingCard.sceneWallpaper && (
                  <div className="space-y-1.5 pt-1 border-t border-pink-100">
                    <div className="flex items-center justify-between text-[9px] font-bold text-slate-600">
                      <span>安全暗色遮罩</span>
                      <span className="font-mono text-pink-600">
                        {Math.round((editingCard.sceneWallpaperOverlay ?? 0.65) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={0.9}
                      step={0.05}
                      value={editingCard.sceneWallpaperOverlay ?? 0.65}
                      onChange={(e) => updateEditingCard('sceneWallpaperOverlay', Number(e.target.value))}
                      className="w-full accent-pink-500"
                    />
                    <p className="text-[8px] text-slate-400">
                      数值越高背景越暗，气泡和动作着色文字越突出。推荐 60% ~ 75%。
                    </p>
                  </div>
                )}
              </div>

              {/* 角色专属表情差分立绘 */}
              <div className="rounded-2xl border border-pink-100 bg-white/90 p-3 space-y-3">
                <div>
                  <h5 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span className="text-sm">🎭</span>
                    8 槽位表情差分立绘
                  </h5>
                  <p className="text-[9px] text-slate-500">
                    AI 驱动：对话中根据描写动作（如*脸红*、*咬唇*）、生理状态（情欲/羞耻）与标签自动切换立绘。未上传差分自动回退至平常或头像。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CANONICAL_TAVERN_EMOTIONS.map((info) => {
                    const key = info.key;
                    const spriteUrl = editingCard.expressions?.[key];
                    return (
                      <div
                        key={key}
                        className={`flex flex-col items-center rounded-xl border p-2 text-center transition-all ${
                          spriteUrl
                            ? 'border-pink-200 bg-pink-50/40 shadow-xs'
                            : 'border-slate-100 bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-sm">{info.icon}</span>
                          <span className="text-[9.5px] font-black text-slate-700">{info.label}</span>
                        </div>
                        <span className="text-[8px] font-mono text-slate-400 mb-1.5">({key})</span>

                        <div className="relative h-24 w-full overflow-hidden rounded-lg bg-white border border-pink-100 flex items-center justify-center mb-1.5">
                          {spriteUrl ? (
                            <img
                              src={spriteUrl}
                              alt={info.label}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-1 text-slate-300">
                              <span className="text-2xl opacity-40">{info.icon}</span>
                              <span className="text-[7.5px] mt-0.5 text-slate-400">缺省回退</span>
                            </div>
                          )}
                        </div>

                        <div className="flex w-full gap-1">
                          <button
                            type="button"
                            onClick={() => triggerUploadSprite(key)}
                            className="flex-1 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 py-1 text-[8.5px] font-bold text-white transition shadow-xs active:scale-95"
                          >
                            {spriteUrl ? '替换' : '上传'}
                          </button>
                          {spriteUrl && (
                            <button
                              type="button"
                              onClick={() => removeSprite(key)}
                              className="rounded-lg bg-slate-100 hover:bg-rose-50 px-1.5 py-1 text-[8.5px] text-slate-400 hover:text-rose-500 transition"
                              title="清除该差分"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {studioStep === 'preview' && (
            <div className="mt-4 space-y-3">
              <div className="rounded-3xl border border-pink-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl text-2xl border border-pink-100 bg-pink-50">
                    {/^(?:https:|data:image\/)/i.test(editingCard.avatar) ? <img src={editingCard.avatar} alt={editingCard.name} className="h-full w-full object-cover" /> : editingCard.avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-800">{editingCard.name || '未命名角色'}</p>
                    <p className="text-[10px] text-pink-600">{editingCard.tag || '未分类'}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-600">{editingCard.introduction || editingCard.description || '填写角色介绍后会显示在这里。'}</p>
                <div className="mt-3 rounded-2xl border border-pink-100 bg-pink-50/40 p-3 text-xs leading-relaxed text-slate-700">{editingCard.firstMessage || '填写开场白后可预览。'}</div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-2xl border border-pink-100 bg-white p-3 shadow-xs">
                <div>
                  <p className="text-[10px] font-black text-slate-800">导出此卡 JSON 文件</p>
                  <p className="text-[8.5px] text-slate-500">Character Card V2 兼容格式，可用于备份或导入其他酒馆客户端</p>
                </div>
                <button
                  type="button"
                  onClick={(event) => void handleExportCard(event, editingCard)}
                  className="flex items-center gap-1.5 rounded-xl border border-pink-200 bg-pink-50/80 px-3 py-2 text-[10px] font-black text-pink-700 hover:bg-pink-100 transition active:scale-95 shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  导出角色卡
                </button>
              </div>

              <p className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-2.5 text-[9px] leading-relaxed text-emerald-800">本页不直接发布到 DZMM。点击下方保存后，亦可在角色列表点击导出按钮得到兼容 JSON，再由你主动导入或上传到目标平台。</p>
            </div>
          )}

          <div className="mt-4 flex gap-2 border-t border-pink-100 pt-3"><button type="button" onClick={() => setEditingCard(null)} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition active:scale-95">取消</button><button type="button" onClick={saveStudioCard} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 py-2.5 text-xs font-black text-white shadow-sm shadow-pink-500/20 active:scale-95"><Save className="h-4 w-4" />保存本地角色卡</button></div>
        </section>
      )}

      {/* 角色卡展厅列表 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black text-slate-800">
            酒馆名录 ({cards.length})
          </span>
          <span className="text-[10px] text-pink-600 font-mono">
            导入卡默认关闭硬件联动
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {cards.map((card) => {
            const isSelected = activeCardId === card.id;

            return (
              <div
                key={card.id}
                className={`p-4 rounded-3xl transition-all relative overflow-hidden ${
                  isSelected
                    ? 'liquid-card-selected'
                    : 'liquid-card'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  {/* 头像展示 */}
                  <div className="w-14 h-14 rounded-2xl bg-pink-50/70 border border-white/90 flex items-center justify-center text-3xl shrink-0 overflow-hidden shadow-xs">
                    {/^(?:https:|data:image\/)/i.test(card.avatar) ? (
                      <img src={card.avatar} alt={card.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <span>{card.avatar}</span>
                    )}
                  </div>

                  {/* 角色信息 */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <h4 className="text-xs font-black text-slate-800 truncate">{card.name}</h4>
                        <span className="liquid-chip text-[9px] font-mono text-pink-700 px-2 py-0.5 shrink-0">
                          {card.tag.split('/')[0]}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSelectCard(card);
                          }}
                          type="button"
                          aria-pressed={isSelected}
                          aria-label={`选择角色 ${card.name}`}
                          className={`rounded-xl px-2.5 py-1 text-[9px] font-bold transition active:scale-95 ${
                            isSelected
                              ? 'liquid-pill-active'
                              : 'liquid-btn border border-white/80 bg-white/70 backdrop-blur-md text-slate-600 hover:text-pink-600 hover:bg-white'
                          }`}
                        >
                          {isSelected ? '当前' : '选中'}
                        </button>
                        <button
                          onClick={(event) => void handleExportCard(event, card)}
                          type="button"
                          aria-label={`导出角色 ${card.name}`}
                          title="导出 Character Card V2 JSON"
                          className="p-1 text-slate-400 hover:text-pink-600 transition"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(event) => openStudioEditor(event, card)}
                          type="button"
                          aria-label={`编辑角色 ${card.name}`}
                          title="DZMM Studio 兼容编辑"
                          className="p-1 text-slate-400 hover:text-pink-600 transition"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(event) => handleDeleteCard(event, card)}
                          type="button"
                          disabled={cards.length <= 1}
                          aria-label={`删除角色 ${card.name}`}
                          title={cards.length <= 1 ? '酒馆至少需要保留一张角色卡' : '删除角色卡及其聊天记录'}
                          className="p-1 text-slate-400 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-25 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-600 line-clamp-2 font-sans leading-relaxed">
                      {card.description}
                    </p>

                    {card.worldBookEntries?.length ? (
                      <p className="text-[9px] font-bold text-pink-600">📖 内置世界书 {card.worldBookEntries.length} 条 · 对话时自动匹配</p>
                    ) : null}

                    {(card.sceneWallpaper || (card.expressions && Object.keys(card.expressions).length > 0)) && (
                      <div className="flex flex-wrap gap-1 items-center pt-0.5">
                        {card.sceneWallpaper && (
                          <span className="text-[8.5px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100 flex items-center gap-0.5">
                            <ImageIcon className="w-2.5 h-2.5" />专属壁纸
                          </span>
                        )}
                        {card.expressions && Object.keys(card.expressions).length > 0 && (
                          <span className="text-[8.5px] font-bold text-pink-700 bg-pink-50 px-1.5 py-0.5 rounded border border-pink-100">
                            🎭 差分 ({Object.keys(card.expressions).length})
                          </span>
                        )}
                      </div>
                    )}

                    <div className="pt-1.5 flex items-center justify-between">
                      {/* 硬件附魔开关 */}
                      <button
                        onClick={(e) => handleToggleEnchant(e, card.id)}
                        type="button"
                        aria-pressed={card.hardwareEnchanted}
                        aria-label={`${card.name}：${card.hardwareEnchanted ? '关闭' : '开启'}硬件联动`}
                        className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1 transition-all ${
                          card.hardwareEnchanted
                            ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-xs'
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span>{card.hardwareEnchanted ? '⚡ 硬件支配已附魔' : '纯文字模式'}</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCardAndChat(card);
                        }}
                        type="button"
                        className="px-3 py-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[10px] font-bold shadow-sm shadow-pink-500/20 active:scale-95"
                      >
                        进入酒馆对谈 ➔
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
