import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { PRESET_PERSONAS } from '../core/ai/personaPrompts';
import { CompanionMatchCandidate } from '../core/ai/companionMatcher';
import { CompanionMatchModal } from '../components/CompanionMatchModal';
import { isLocalApiBaseUrl } from '../core/apiBaseUrl';
import { ActionCard } from '../components/ActionCard';
import { CompanionMessageItem } from '../components/CompanionMessageItem';
import {
  Send,
  Trash2,
  Sparkles,
  ChevronDown,
  Plus,
  X,
  UserPlus,
  Pencil,
  Zap,
  Copy,
  Volume2,
  VolumeX,
  Square,
  Mic,
  Headphones,
  MoreHorizontal,
} from 'lucide-react';

export const ChatView: React.FC = () => {
  const {
    messages,
    isChatLoading,
    sendChatMessage,
    clearMessages,
    isAutoDomination,
    toggleAutoDomination,
    llmConfig,
    selectPersona,
    customPersonas,
    addCustomPersona,
    updateCustomPersona,
    deleteCustomPersona,
    getAllPersonas,
    safetyConfig,
    setSafetyConfig,
    isSpeaking,
    speakMessage,
    stopSpeaking,
    isListening,
    speechTranscript,
    startVoiceInput,
    stopVoiceInput,
    cancelVoiceInput,
    chatHardwareEnabled,
    setChatHardwareEnabled,
    stopChatGeneration,
    triggerEmergencyStop,
    addMessage,
    chatDisplayConfig,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);

  // 自定义人格表单
  const [formName, setFormName] = useState('');
  const [formTag, setFormTag] = useState('');
  const [formAvatar, setFormAvatar] = useState('🖤');
  const [formDesc, setFormDesc] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formGreeting, setFormGreeting] = useState('');
  const [formGender, setFormGender] = useState<'male' | 'female'>('female');
  const [formPitch, setFormPitch] = useState(1.0);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(40);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  const allPersonas = getAllPersonas();
  const currentPersona =
    allPersonas.find((p) => p.id === llmConfig.selectedPersonaId) || PRESET_PERSONAS[0];
  const canUseConfiguredLlm = Boolean(llmConfig.apiKey || isLocalApiBaseUrl(llmConfig.baseUrl));

  useEffect(() => {
    setVisibleHistoryCount(40);
  }, [llmConfig.selectedPersonaId]);

  const renderedMessages = useMemo(() => {
    if (messages.length <= visibleHistoryCount) return messages;
    return messages.slice(-visibleHistoryCount);
  }, [messages, visibleHistoryCount]);

  const handleCopyMessage = useCallback((content: string) => {
    void navigator.clipboard?.writeText(content);
  }, []);

  const handleSpeakMessage = useCallback((content: string, voiceConfig?: any) => {
    void speakMessage(content, voiceConfig || currentPersona.voiceConfig);
  }, [speakMessage, currentPersona.voiceConfig]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isChatLoading]);

  // 智能自动调教循环
  useEffect(() => {
    let autoTimer: ReturnType<typeof setTimeout>;
    if (
      isAutoDomination &&
      chatHardwareEnabled &&
      !safetyConfig.emergencyLock &&
      canUseConfiguredLlm &&
      !input.trim() &&
      !isListening &&
      !isChatLoading &&
      !isSpeaking &&
      !showModal &&
      !showMatchModal &&
      !showPersonaMenu
    ) {
      // 15秒没人说话自动触发下一轮调教
      autoTimer = setTimeout(() => {
        sendChatMessage('(主人没有说话，正在等待你的调教。请自行决定下一步的硬件惩罚或奖励并下发指令，然后对主人说话。)', true);
      }, 15000);
    }
    return () => clearTimeout(autoTimer);
  }, [
    canUseConfiguredLlm,
    chatHardwareEnabled,
    input,
    isAutoDomination,
    isChatLoading,
    isListening,
    isSpeaking,
    safetyConfig.emergencyLock,
    sendChatMessage,
    showModal,
    showMatchModal,
    showPersonaMenu,
  ]);

  const handleSend = () => {
    if (!input.trim() || isChatLoading) return;
    sendChatMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleToggleVoiceInput = () => {
    if (isListening) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };

  useEffect(() => () => {
    cancelVoiceInput();
    stopChatGeneration();
    stopSpeaking();
  }, [cancelVoiceInput, stopChatGeneration, stopSpeaking]);

  const handleOpenCreateModal = () => {
    setEditingPersonaId(null);
    setFormName('');
    setFormTag('');
    setFormAvatar('🖤');
    setFormDesc('');
    setFormPrompt(`你是一个自定义的幻触设备控制角色。
你拥有控制主人硬件（电击器 EMS、飞机杯马达、智能灌肠机等）的权限。
你的控制原则：
1. 根据对话情境积极使用 Tool Calls 工具控制设备。
2. 保持设定的独特口吻与性格。
3. 关注安全底线，收到急停或求饶时合理响应。`);
    setFormGreeting('你好，我已经准备好接管你的设备了... 准备好开始了吗？');
    setFormGender('female');
    setFormPitch(1.0);
    setShowModal(true);
    setShowPersonaMenu(false);
  };

  const handleOpenEditModal = (persona: (typeof customPersonas)[number]) => {
    setEditingPersonaId(persona.id);
    setFormName(persona.name);
    setFormTag(persona.tag);
    setFormAvatar(persona.avatar);
    setFormDesc(persona.description);
    setFormPrompt(persona.systemPrompt);
    setFormGreeting(persona.greetingMessage);
    setFormGender(persona.voiceConfig?.gender || 'female');
    setFormPitch(persona.voiceConfig?.pitch || 1);
    setShowModal(true);
    setShowPersonaMenu(false);
  };

  const handleSaveCustomPersona = () => {
    if (!formName.trim() || !formPrompt.trim()) return;
    const personaPatch = {
      name: formName.trim(),
      tag: formTag.trim() || '自定义人格',
      avatar: formAvatar.trim() || '🖤',
      color: '#38bdf8',
      description: formDesc.trim() || '用户自定义专属人格',
      systemPrompt: formPrompt.trim(),
      greetingMessage: formGreeting.trim() || '你好呀，我已接管控制权。',
      voiceConfig: {
        gender: formGender,
        pitch: formPitch,
        rate: 1.0,
      },
    };
    if (editingPersonaId) {
      updateCustomPersona(editingPersonaId, personaPatch);
      selectPersona(editingPersonaId);
    } else {
      const createdId = addCustomPersona(personaPatch);
      if (createdId) selectPersona(createdId);
    }
    setShowModal(false);
  };

  const handleToggleAutoDomination = () => {
    if (isAutoDomination) {
      toggleAutoDomination();
      return;
    }
    if (!canUseConfiguredLlm) {
      alert('请先在“系统设置”中配置模型 API Key。');
      return;
    }
    if (!chatHardwareEnabled || safetyConfig.emergencyLock) {
      alert(safetyConfig.emergencyLock ? '急停锁已激活，请先在设备设置中解除。' : '请先开启本会话的硬件联动权限。');
      return;
    }
    if (confirm('自动调教会在你没有输入时持续请求 AI，并可能自动下发硬件指令。确认开启吗？')) {
      toggleAutoDomination();
    }
  };

  const handleToggleHardware = () => {
    if (chatHardwareEnabled) {
      setChatHardwareEnabled(false);
      return;
    }
    if (safetyConfig.emergencyLock) {
      alert('急停锁已激活，请先在设备设置中解除后再授权。');
      return;
    }
    if (confirm('开启后，当前 AI 伴侣可以在安全上限内调用真实硬件工具。确认授权吗？')) {
      setChatHardwareEnabled(true);
    }
  };

  const handleMatchedCompanion = (candidate: CompanionMatchCandidate) => {
    const personaId = addCustomPersona(candidate.persona);
    if (personaId) {
      setChatHardwareEnabled(false);
      selectPersona(personaId);
    }
    setShowMatchModal(false);
  };

  const quickPrompts: Array<{ label: string; text: string }> = [
    { label: '⚡ 加点刺激', text: '我觉得现在的强度有点轻，再给我加点刺激吧！' },
    { label: '🥺 呜呜求饶', text: '好强烈... 我快受不了了，稍微轻一点嘛主人~' },
    { label: '🔥 极速活塞', text: '开启飞机杯极速活塞模式，全速冲刺！' },
    { label: '🌸 温柔慢调', text: '可以换成温柔一点的呼吸节奏吗？' },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full max-w-md mx-auto relative bg-transparent overflow-hidden">
      {/* 顶部角色选择与语音栏 (Apple Liquid Header) */}
      <div className="liquid-header shrink-0 relative z-30 flex items-center justify-between px-3.5 py-2">
        <div className="relative">
          <button
            onClick={() => setShowPersonaMenu(!showPersonaMenu)}
            className="liquid-btn flex min-w-0 items-center gap-2 rounded-2xl border border-white/90 bg-white/80 backdrop-blur-md px-3 py-1.5 text-xs font-semibold shadow-[0_2px_12px_rgba(233,104,146,0.1)] transition-all hover:border-pink-300"
          >
            <span className="text-base">{currentPersona.avatar}</span>
            <div className="min-w-0 text-left">
              <span className="block max-w-[155px] sm:max-w-[210px] truncate font-black leading-none text-[#263247]">
                {currentPersona.name}
              </span>
              <span className="mt-1 block max-w-[155px] sm:max-w-[210px] truncate text-[10px] font-semibold text-[#b93765]">
                {currentPersona.tag}
              </span>
            </div>
            <ChevronDown className="ml-0.5 h-3.5 w-3.5 shrink-0 text-[#d94d7f]" />
          </button>

          {/* 角色下拉菜单与背景遮罩 */}
          {showPersonaMenu && (
            <>
              {/* 全局点击遮罩：点击任意空白区域自动收起菜单 */}
              <div
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs"
                onClick={() => setShowPersonaMenu(false)}
              />

              <div className="frosted-feather-glass absolute left-0 top-12 z-50 max-h-[70vh] w-72 space-y-3 overflow-y-auto rounded-3xl p-3 shadow-2xl animate-in fade-in slide-in-from-top-2">
                {/* 新建人格按钮 */}
                <button
                  onClick={handleOpenCreateModal}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 text-white text-xs font-bold shadow-md shadow-pink-900/50 active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" /> 自定义新建人格 (Prompt + 音色)
                </button>

                {/* 自定义人格列表 */}
                {customPersonas.length > 0 && (
                  <div>
                    <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#b93765]">
                      🎨 我的自定义人格 ({customPersonas.length})
                    </p>
                    <div className="space-y-1">
                      {customPersonas.map((persona) => (
                        <div
                          key={persona.id}
                          onClick={() => {
                            selectPersona(persona.id);
                            setShowPersonaMenu(false);
                          }}
                          className={`flex items-start justify-between p-2 rounded-xl cursor-pointer transition-all ${
                            persona.id === currentPersona.id
                              ? 'border border-[#f2a8c0] bg-[#fff0f4]'
                              : 'hover:bg-[#f7f7f8]'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-lg">{persona.avatar}</span>
                            <div>
                              <p className="text-xs font-bold text-[#263247]">{persona.name}</p>
                              <p className="line-clamp-1 text-[10px] text-[#667085]">{persona.tag}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(persona);
                              }}
                              className="text-slate-500 hover:text-cyan-400 p-1"
                              title="编辑该自定义人格"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`确定要删除自定义人格 "${persona.name}" 吗？`)) {
                                  deleteCustomPersona(persona.id);
                                }
                              }}
                              className="text-slate-500 hover:text-rose-400 p-1"
                              title="删除该自定义人格"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 官方预设人格（按专题分组） */}
                <div className="space-y-3">
                  {/* 🌸 雌堕与身心重塑专区 */}
                  <div>
                    <p className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[#b93765]">
                      <span>🌸 雌堕与身心重塑专区 ({PRESET_PERSONAS.slice(0, 3).length}位)</span>
                    </p>
                    <div className="space-y-1">
                      {PRESET_PERSONAS.slice(0, 3).map((persona) => (
                        <div
                          key={persona.id}
                          onClick={() => {
                            selectPersona(persona.id);
                            setShowPersonaMenu(false);
                          }}
                          className={`flex items-start gap-2.5 p-2 rounded-xl cursor-pointer transition-all ${
                            persona.id === currentPersona.id
                              ? 'border border-[#f2a8c0] bg-[#fff0f4] shadow-sm'
                              : 'hover:bg-[#f7f7f8]'
                          }`}
                        >
                          <span className="text-xl shrink-0">{persona.avatar}</span>
                          <div>
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-bold text-[#263247]">{persona.name}</p>
                              <span className="font-mono text-[9px] text-[#b93765]">
                                [{persona.tag.split('/')[0]}]
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 font-sans text-[10px] text-[#667085]">
                              {persona.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 🐺 经典支配与硬核特训专区 */}
                  <div>
                    <p className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[#405d67]">
                      <span>🐺 经典支配与硬核伴侣 ({PRESET_PERSONAS.slice(3).length}位)</span>
                    </p>
                    <div className="space-y-1">
                      {PRESET_PERSONAS.slice(3).map((persona) => (
                        <div
                          key={persona.id}
                          onClick={() => {
                            selectPersona(persona.id);
                            setShowPersonaMenu(false);
                          }}
                          className={`flex items-start gap-2.5 p-2 rounded-xl cursor-pointer transition-all ${
                            persona.id === currentPersona.id
                              ? 'border border-[#b9cbd1] bg-[#f0f5f6] shadow-sm'
                              : 'hover:bg-[#f7f7f8]'
                          }`}
                        >
                          <span className="text-xl shrink-0">{persona.avatar}</span>
                          <div>
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-bold text-[#263247]">{persona.name}</p>
                              <span className="font-mono text-[9px] text-[#405d67]">
                                [{persona.tag.split('/')[0]}]
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 font-sans text-[10px] text-[#667085]">
                              {persona.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 右侧控制：硬件联动、语音朗读与更多菜单 */}
        <div className="flex items-center gap-1.5 relative">
          <button
            onClick={handleToggleHardware}
            className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-all ${
              chatHardwareEnabled
                ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-xs font-black'
                : 'bg-white/90 text-slate-600 border-pink-100/90 hover:bg-pink-50/50 hover:text-pink-600 shadow-2xs'
            }`}
            title={chatHardwareEnabled ? 'AI 硬件联动已授权，点击切换为纯文字' : '纯文字模式，点击授权硬件联动'}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{chatHardwareEnabled ? '硬件' : '文字'}</span>
          </button>

          {/* TTS 自动朗读切换 */}
          {isSpeaking ? (
            <button
              onClick={stopSpeaking}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white animate-pulse shadow-sm"
              title="正在说话，点击打断"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>停止</span>
            </button>
          ) : (
            <button
              onClick={() => setSafetyConfig({ autoPlayVoice: !safetyConfig.autoPlayVoice })}
              className={`p-1.5 rounded-xl border transition-all ${
                safetyConfig.autoPlayVoice
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs'
                  : 'bg-white/90 text-slate-600 border-pink-100/90 hover:bg-pink-50/50 shadow-2xs'
              }`}
              title={safetyConfig.autoPlayVoice ? '自动语音朗读：已开启' : '自动语音朗读：已静音'}
            >
              {safetyConfig.autoPlayVoice ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4" />}
            </button>
          )}

          {/* 更多功能聚合按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowMoreActions(!showMoreActions)}
              className={`p-1.5 rounded-xl border transition-all relative ${
                showMoreActions || isAutoDomination || safetyConfig.handsFreeVoiceMode
                  ? 'bg-pink-100 text-pink-700 border-pink-300'
                  : 'bg-white/90 text-slate-600 border-pink-100/90 hover:bg-pink-50/50 shadow-2xs'
              }`}
              title="更多伴侣互动设置"
            >
              <MoreHorizontal className="w-4 h-4" />
              {(isAutoDomination || safetyConfig.handsFreeVoiceMode) && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-pink-500 animate-ping" />
              )}
            </button>

            {/* 更多功能下拉卡片 */}
            {showMoreActions && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xs"
                  onClick={() => setShowMoreActions(false)}
                />
                <div className="frosted-feather-glass absolute right-0 top-11 z-50 w-52 space-y-1 rounded-2xl p-2 shadow-2xl border border-white/95 animate-in fade-in slide-in-from-top-2">
                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      setShowMatchModal(true);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-pink-50/80 hover:text-pink-700 transition-all text-left"
                  >
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-pink-500" />
                      <span>匹配专属伴侣</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">问卷</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      handleToggleAutoDomination();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-pink-50/80 hover:text-pink-700 transition-all text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>AI 自动调教</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isAutoDomination ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {isAutoDomination ? '进行中' : '关闭'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      const next = !safetyConfig.handsFreeVoiceMode;
                      setSafetyConfig({ handsFreeVoiceMode: next });
                      if (next) startVoiceInput();
                      else cancelVoiceInput();
                      setShowMoreActions(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-pink-50/80 hover:text-cyan-700 transition-all text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Headphones className="w-4 h-4 text-cyan-500" />
                      <span>免提对讲模式</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      safetyConfig.handsFreeVoiceMode ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {safetyConfig.handsFreeVoiceMode ? '开启' : '关闭'}
                    </span>
                  </button>

                  <div className="h-px bg-pink-100/80 my-1" />

                  <button
                    onClick={() => {
                      setShowMoreActions(false);
                      if (confirm(`确定要清空与【${currentPersona.name}】的历史聊天记录吗？`)) {
                        clearMessages();
                      }
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-all text-left"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    <span>清空聊天历史</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 消息滚动列表 (自适应高度，仅内容滚动) */}
      <div ref={chatContainerRef} className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-3.5 relative z-0">
        {messages.length > visibleHistoryCount && (
          <div className="flex items-center justify-center gap-2 py-1 animate-fade-in">
            <button
              type="button"
              onClick={() => setVisibleHistoryCount((prev) => Math.min(messages.length, prev + 40))}
              className="liquid-chip flex items-center gap-1 px-3 py-1 text-[11px] font-semibold text-slate-500 hover:text-pink-600 transition-colors rounded-full"
            >
              <span>📜 查看更早记录（已收拢 {messages.length - visibleHistoryCount} 条）</span>
            </button>
            {messages.length - visibleHistoryCount > 40 && (
              <button
                type="button"
                onClick={() => setVisibleHistoryCount(messages.length)}
                className="text-[10px] text-slate-400 hover:text-pink-600 underline transition-colors"
              >
                全部展开
              </button>
            )}
          </div>
        )}

        {renderedMessages.map((msg) => (
          <CompanionMessageItem
            key={msg.id}
            msg={msg}
            personaAvatar={currentPersona.avatar}
            voiceConfig={currentPersona.voiceConfig}
            fontSize={chatDisplayConfig.companionFontSize}
            onCopy={handleCopyMessage}
            onSpeak={handleSpeakMessage}
          />
        ))}

        {/* 正在录音时的波纹反馈提示 */}
        {isListening && (
          <div className="flex items-center gap-2 text-xs text-rose-900 bg-rose-100 border border-rose-300 p-2.5 rounded-2xl w-fit animate-pulse shadow-sm font-bold">
            <Mic className="w-4 h-4 text-rose-600 animate-bounce" />
            <span>
              正在倾听您的声音... {speechTranscript ? `“${speechTranscript}”` : '(请直接开口说话)'}
            </span>
          </div>
        )}

        {isChatLoading && (
          <div className="flex items-center gap-2 text-xs text-pink-900 bg-pink-100 border border-pink-300 p-2.5 rounded-2xl w-fit animate-pulse shadow-sm font-bold">
            <Sparkles className="w-3.5 h-3.5 animate-spin text-pink-600" />
            <span>{currentPersona.name} 正在生成回复{chatHardwareEnabled ? '并按授权处理设备' : ''}...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入区 (Apple Liquid Dock) */}
      <div className="liquid-dock shrink-0 pb-[calc(3.8rem+env(safe-area-inset-bottom,0px))] z-20">
        {/* 快捷互动小气泡 (粉色系主题) */}
        <div className="px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none border-b border-white/60">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => {
                void sendChatMessage(qp.text);
              }}
              disabled={isChatLoading}
              className="liquid-chip shrink-0 px-3 py-1 text-[11px] font-bold active:scale-95 disabled:opacity-40 text-pink-900"
            >
              {qp.label}
            </button>
          ))}
        </div>

        {/* 底部输入栏：支持文字输入 + 麦克风实时语音输入 */}
        <div className="p-2.5">
          <div className="flex items-center gap-2">
            {/* 麦克风语音录制按钮 */}
            <button
              onClick={handleToggleVoiceInput}
              className={`liquid-btn p-2.5 rounded-2xl border transition-all active:scale-95 shrink-0 ${
                isListening
                  ? 'bg-rose-600 text-white border-rose-500 animate-pulse shadow-md shadow-rose-500/30'
                  : 'bg-white/80 hover:bg-white text-pink-700 border-white/90 shadow-xs backdrop-blur-md'
              }`}
              title={isListening ? '点击结束语音输入' : '点击开启麦克风说话'}
            >
              {isListening ? <Mic className="w-4 h-4 animate-bounce" /> : <Mic className="w-4 h-4" />}
            </button>

            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isListening
                  ? '正在聆听您的声音...'
                  : canUseConfiguredLlm
                  ? `和 ${currentPersona.name} 对话...`
                  : '请在【系统设置】中填入 API Key'
              }
              disabled={isChatLoading}
              className="liquid-input flex-1 min-w-0 min-h-[3.25rem] max-h-28 resize-none text-xs sm:text-sm px-3.5 py-2 outline-none font-medium leading-relaxed"
            />

            {isChatLoading ? (
              <button
                type="button"
                onClick={stopChatGeneration}
                className="liquid-btn bg-rose-50 text-rose-600 p-2.5 rounded-2xl border border-rose-200 shadow-sm transition-all active:scale-95 shrink-0"
                title="停止生成（不会自动停止硬件）"
                aria-label="停止生成"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="liquid-btn bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2.5 rounded-2xl shadow-md shadow-pink-500/25 transition-all active:scale-95 shrink-0 font-bold"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================= 自定义人格弹窗 Modal ================= */}
      {showMatchModal && <CompanionMatchModal onClose={() => setShowMatchModal(false)} onStart={handleMatchedCompanion} />}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white/98 backdrop-blur-2xl border border-pink-200/90 rounded-3xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5 space-y-3.5 shadow-[0_24px_50px_-10px_rgba(244,63,142,0.22)] text-slate-800">
            <div className="flex items-center justify-between border-b border-pink-100 pb-2.5">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-pink-500" /> {editingPersonaId ? '编辑自定义 AI 人格' : '创建自定义 AI 人格'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-xl hover:bg-pink-50 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-1">
                  <label className="text-[11px] text-slate-500 font-bold block mb-1">头像 Emoji</label>
                  <input
                    type="text"
                    value={formAvatar}
                    onChange={(e) => setFormAvatar(e.target.value)}
                    placeholder="🖤"
                    className="w-full text-center text-lg bg-slate-50/80 border border-pink-100 rounded-xl py-1.5 outline-none focus:border-pink-400 focus:bg-white text-slate-800 font-medium"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-[11px] text-slate-500 font-bold block mb-1">角色名称</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="例如: 傲娇学姐 / 毒舌管家"
                    className="w-full bg-slate-50/80 border border-pink-100 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none focus:border-pink-400 focus:bg-white font-medium"
                  />
                </div>
              </div>

              {/* 声音性别与音色 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500 font-bold block mb-1">声线类型</label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value as any)}
                    className="w-full bg-slate-50/80 border border-pink-100 text-slate-800 text-xs rounded-xl px-2 py-2 outline-none focus:border-pink-400 focus:bg-white font-medium"
                  >
                    <option value="male">磁性男声 (Male)</option>
                    <option value="female">娇柔/冷艳女声 (Female)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-500 font-bold block mb-1">音调 (Pitch: {formPitch})</label>
                  <input
                    type="range"
                    min={0.7}
                    max={1.4}
                    step={0.05}
                    value={formPitch}
                    onChange={(e) => setFormPitch(Number(e.target.value))}
                    className="w-full accent-pink-500 mt-2 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-bold block mb-1">性格标签 (Tag)</label>
                <input
                  type="text"
                  value={formTag}
                  onChange={(e) => setFormTag(e.target.value)}
                  placeholder="例如: 傲娇 / 嘴硬心软 / 渐进电击"
                  className="w-full bg-slate-50/80 border border-pink-100 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none focus:border-pink-400 focus:bg-white font-medium"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-bold block mb-1">角色简介</label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="用一句话说明角色背景与互动方式"
                  className="w-full bg-slate-50/80 border border-pink-100 text-slate-800 text-xs rounded-xl p-2.5 outline-none resize-none focus:border-pink-400 focus:bg-white font-medium"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-bold block mb-1">开场第一句问候语 (Greeting)</label>
                <input
                  type="text"
                  value={formGreeting}
                  onChange={(e) => setFormGreeting(e.target.value)}
                  placeholder="角色切入时的首条打招呼台词"
                  className="w-full bg-slate-50/80 border border-pink-100 text-slate-800 text-xs rounded-xl px-3 py-2 outline-none focus:border-pink-400 focus:bg-white font-medium"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-bold block mb-1">系统人设提示词 (System Prompt)</label>
                <textarea
                  rows={5}
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  placeholder="详细定义角色的语气、行为模式、调教原则及如何使用 Tool Calls 控制设备..."
                  className="w-full bg-slate-50/80 border border-pink-100 text-slate-800 text-xs rounded-xl p-2.5 outline-none font-mono resize-none leading-relaxed focus:border-pink-400 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition active:scale-95"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveCustomPersona}
                  disabled={!formName.trim() || !formPrompt.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-40 text-white text-xs font-black shadow-sm shadow-pink-500/20 transition active:scale-95"
                >
                  {editingPersonaId ? '保存修改并生效' : '保存并生效'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
