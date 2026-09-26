import { create } from 'zustand';
import {
  DeviceSystemState,
  LLMConfig,
  SafetyConfig,
  ChatMessage,
  AIPersona,
  VoiceConfig,
  DisciplineContractState,
  ContractIntensity,
  EdgingDenialState,
  HeartRateState,
  TtsVoiceProfile,
} from '../types';
import { DeviceManager } from '../core/deviceManager';
import { LLMClient } from '../core/ai/llmClient';
import { PRESET_PERSONAS } from '../core/ai/personaPrompts';
import { TTSManager } from '../core/voice/ttsManager';
import { STTManager } from '../core/voice/sttManager';
import { ContractEngine } from '../core/discipline/contractEngine';
import { EdgingEngine } from '../core/discipline/edgingEngine';
import { HeartRateEngine } from '../core/biometrics/heartRateEngine';
import { FemboyTrainingEngine } from '../core/discipline/femboyTrainingEngine';
import { AmbientAudioEngine } from '../core/asmr/ambientAudioEngine';
import { PitchTracker } from '../core/voice/pitchTracker';
import { DEFAULT_LLM_CONFIG, normalizeLlmConfig } from '../core/llmConfig';
import { isLocalApiBaseUrl, isVolcengineArkApiBaseUrl } from '../core/apiBaseUrl';
import { normalizeToolActionLogs } from '../core/ai/toolActionLog';
import { ChatDisplayConfig, DEFAULT_CHAT_DISPLAY_CONFIG, normalizeChatDisplayConfig } from '../core/ui/chatDisplay';

interface AppStore {
  // 当前 Tab
  activeTab: 'chat' | 'tavern' | 'dungeon' | 'femboy_training' | 'edging' | 'contract' | 'heartrate' | 'achievements' | 'control' | 'patterns' | 'device' | 'settings';
  setActiveTab: (tab: 'chat' | 'tavern' | 'dungeon' | 'femboy_training' | 'edging' | 'contract' | 'heartrate' | 'achievements' | 'control' | 'patterns' | 'device' | 'settings') => void;

  // 设备状态
  deviceState: DeviceSystemState;

  // 赛博契约状态与方法
  contractState: DisciplineContractState;
  startDisciplineContract: (minutes: number, intensity: ContractIntensity) => void;
  answerSurgeCheck: (answer?: string) => void;
  stopDisciplineContract: () => void;

  // 高潮剥夺与边缘控射状态与方法
  edgingState: EdgingDenialState;
  startEdgingSession: (rounds: number) => void;
  triggerEdgingBrake: () => void;
  stopEdgingSession: () => void;
  setEdgingSensitivity: (val: number) => void;

  // 蓝牙手环与心率自适应状态与方法
  heartRateState: HeartRateState;
  connectHeartRateBle: () => Promise<boolean>;
  startHeartRateSimulator: () => void;
  setSimulatedBpm: (bpm: number) => void;
  toggleHeartRateAdaptiveLoop: (active?: boolean) => void;
  disconnectHeartRate: () => void;

  // 安全配置与语音设置
  safetyConfig: SafetyConfig;
  setSafetyConfig: (cfg: Partial<SafetyConfig>) => void;
  ttsVoiceProfiles: TtsVoiceProfile[];
  saveTtsVoiceProfile: (profile: Omit<TtsVoiceProfile, 'id' | 'createdAt'>) => string;
  deleteTtsVoiceProfile: (id: string) => void;
  replaceTtsVoiceProfiles: (profiles: unknown[]) => void;

  // 伴侣与酒馆消息正文显示设置
  chatDisplayConfig: ChatDisplayConfig;
  setChatDisplayConfig: (cfg: Partial<ChatDisplayConfig>) => void;

  // LLM 配置
  llmConfig: LLMConfig;
  setLlmConfig: (cfg: Partial<LLMConfig>) => void;

  // 自定义人格列表
  customPersonas: AIPersona[];
  addCustomPersona: (p: Omit<AIPersona, 'id' | 'isCustom'>) => string | null;
  updateCustomPersona: (id: string, p: Partial<AIPersona>) => void;
  replaceCustomPersonas: (personas: unknown[]) => void;
  deleteCustomPersona: (id: string) => void;
  getAllPersonas: () => AIPersona[];

  // 对话
  messages: ChatMessage[];
  isChatLoading: boolean;
  chatHardwareEnabled: boolean;
  setChatHardwareEnabled: (enabled: boolean) => void;
  stopChatGeneration: () => void;
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  sendChatMessage: (content: string, isAuto?: boolean) => Promise<void>;
  selectPersona: (personaId: string) => void;

  // 自动调教
  isAutoDomination: boolean;
  toggleAutoDomination: () => void;

  // TTS 语音播放状态与方法
  isSpeaking: boolean;
  speakingText: string | null;
  speakMessage: (text: string, voiceOverride?: VoiceConfig) => Promise<void>;
  stopSpeaking: () => void;

  // STT 语音识别状态与方法
  isListening: boolean;
  speechTranscript: string;
  startVoiceInput: () => void;
  stopVoiceInput: () => void;
  cancelVoiceInput: () => void;

  // 自定义临时 System Prompt 覆盖
  customPrompt: string;
  setCustomPrompt: (prompt: string) => void;

  // 悬浮窗与画中画模式
  floatingWindowState: {
    isOpen: boolean;
    isExpanded: boolean;
    isPipActive: boolean;
  };
  setFloatingWindowState: (state: Partial<{ isOpen: boolean; isExpanded: boolean; isPipActive: boolean }>) => void;
  toggleFloatingWindow: () => void;

  // 急停
  triggerEmergencyStop: () => Promise<string>;
}

const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  maxEmsStrengthA: 200,
  maxEmsStrengthB: 200,
  minEmsStrength: 35,
  maxToyMotorARate: 20,
  maxToyMotorBRate: 2,
  maxToyMotorCRate: 20,
  minToyMotorRate: 1,
  minEnemaDurationSec: 1,
  maxEnemaDurationSec: 60,
  emergencyLock: false,
  vibrationFeedback: true,
  voiceFeedback: true,
  autoPlayVoice: true,
  handsFreeVoiceMode: false,
  sttEngine: 'browser',
  siliconflowSttApiKey: '',
  siliconflowSttModel: 'FunAudioLLM/SenseVoiceSmall',
  volcengineSttApiKey: '',
  volcengineSttAppId: '',
  volcengineSttAccessKey: '',
  volcengineSttResourceId: 'volc.bigasr.auc_turbo',
  ttsEngine: 'siliconflow',
  siliconflowTtsApiKey: '',
  siliconflowTtsModel: 'FunAudioLLM/CosyVoice2-0.5B',
  siliconflowTtsVoice: 'anna',
  volcengineTtsResourceId: 'seed-tts-2.0',
  volcengineTtsVoice: 'zh_female_vv_uranus_bigtts',
  voiceRate: 1.0,
  voicePitch: 1.0,
  voiceGain: 0,
};

const safeStorageSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`保存 ${key} 失败:`, error);
  }
};

const loadSavedChatDisplayConfig = (): ChatDisplayConfig => {
  try {
    const saved = localStorage.getItem('ycy_chat_display_config');
    return saved ? normalizeChatDisplayConfig(JSON.parse(saved)) : { ...DEFAULT_CHAT_DISPLAY_CONFIG };
  } catch {
    return { ...DEFAULT_CHAT_DISPLAY_CONFIG };
  }
};

const normalizeCustomPersona = (value: unknown, fallbackId?: string): AIPersona | null => {
  if (!value || typeof value !== 'object') return null;
  const persona = value as Partial<AIPersona>;
  if (typeof persona.name !== 'string' || typeof persona.systemPrompt !== 'string') return null;
  const idSource = typeof persona.id === 'string' ? persona.id : fallbackId || `custom-${Date.now()}`;
  const id = idSource.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  if (!id) return null;
  const gender = persona.voiceConfig?.gender === 'male' ? 'male' : 'female';
  const voicePitch = Number(persona.voiceConfig?.pitch);
  const voiceRate = Number(persona.voiceConfig?.rate);
  return {
    id,
    name: persona.name.trim().slice(0, 80) || '自定义人格',
    tag: typeof persona.tag === 'string' ? persona.tag.trim().slice(0, 100) : '自定义人格',
    avatar: typeof persona.avatar === 'string' ? persona.avatar.trim().slice(0, 100) || '🖤' : '🖤',
    color: typeof persona.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(persona.color) ? persona.color : '#ec4899',
    description: typeof persona.description === 'string' ? persona.description.trim().slice(0, 1000) : '',
    systemPrompt: persona.systemPrompt.trim().slice(0, 20000),
    greetingMessage: typeof persona.greetingMessage === 'string' ? persona.greetingMessage.trim().slice(0, 4000) : '你好呀。',
    voiceConfig: {
      gender,
      pitch: Number.isFinite(voicePitch) ? Math.max(0.5, Math.min(1.5, voicePitch)) : 1,
      rate: Number.isFinite(voiceRate) ? Math.max(0.5, Math.min(1.5, voiceRate)) : 1,
      voiceName: typeof persona.voiceConfig?.voiceName === 'string' ? persona.voiceConfig.voiceName.slice(0, 200) : undefined,
      neuralVoice: typeof persona.voiceConfig?.neuralVoice === 'string' ? persona.voiceConfig.neuralVoice.slice(0, 200) : undefined,
      siliconflowVoice: typeof persona.voiceConfig?.siliconflowVoice === 'string' ? persona.voiceConfig.siliconflowVoice.slice(0, 200) : undefined,
    },
    isCustom: true,
  };
};

const loadSavedLlmConfig = (): LLMConfig => {
  try {
    const s = localStorage.getItem('ycy_llm_config');
    if (s) return normalizeLlmConfig(JSON.parse(s));
  } catch {}
  return { ...DEFAULT_LLM_CONFIG };
};

const loadSavedSafetyConfig = (): SafetyConfig => {
  try {
    const s = localStorage.getItem('ycy_safety_config');
    if (s) return { ...DEFAULT_SAFETY_CONFIG, ...JSON.parse(s) };
  } catch {}
  return DEFAULT_SAFETY_CONFIG;
};

const normalizeTtsVoiceProfile = (value: unknown, fallbackId: string): TtsVoiceProfile | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = value as Partial<TtsVoiceProfile>;
  if (profile.engine !== 'siliconflow' && profile.engine !== 'volcengine_tts') return null;
  const baseVoiceId = typeof profile.baseVoiceId === 'string' ? profile.baseVoiceId.trim().slice(0, 200) : '';
  if (!baseVoiceId) return null;
  const rate = Number(profile.rate);
  const pitch = Number(profile.pitch);
  const gain = Number(profile.gain);
  return {
    id: (typeof profile.id === 'string' ? profile.id : fallbackId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) || fallbackId,
    name: typeof profile.name === 'string' ? profile.name.trim().slice(0, 60) || '未命名角色声线' : '未命名角色声线',
    engine: profile.engine,
    baseVoiceId,
    baseVoiceName: typeof profile.baseVoiceName === 'string' ? profile.baseVoiceName.trim().slice(0, 100) || baseVoiceId : baseVoiceId,
    rate: Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1,
    pitch: Number.isFinite(pitch) ? Math.max(0.5, Math.min(2, pitch)) : 1,
    gain: Number.isFinite(gain) ? Math.max(-10, Math.min(10, gain)) : 0,
    createdAt: Number.isFinite(Number(profile.createdAt)) ? Number(profile.createdAt) : Date.now(),
  };
};

const loadSavedTtsVoiceProfiles = (): TtsVoiceProfile[] => {
  try {
    const saved = localStorage.getItem('ycy_tts_voice_profiles');
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 50)
      .map((profile, index) => normalizeTtsVoiceProfile(profile, `voice-profile-${index}`))
      .filter((profile): profile is TtsVoiceProfile => profile !== null);
  } catch {
    return [];
  }
};

const loadSavedCustomPersonas = (): AIPersona[] => {
  try {
    const s = localStorage.getItem('ycy_custom_personas');
    if (s) {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed
          .slice(0, 100)
          .map((persona, index) => normalizeCustomPersona(persona, `custom-import-${index}`))
          .filter((persona): persona is AIPersona => persona !== null);
      }
    }
  } catch {}
  return [];
};

const loadChatHardwareEnabled = (): boolean => {
  try {
    return localStorage.getItem('ycy_chat_hardware_enabled') !== 'false';
  } catch {
    return true;
  }
};

const loadSavedChatHistory = (personaId: string, defaultGreeting: string): ChatMessage[] => {
  try {
    const s = localStorage.getItem(`ycy_chat_history_${personaId}`);
    if (s) {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = parsed.slice(-200).flatMap((value, index): ChatMessage[] => {
          if (!value || typeof value !== 'object') return [];
          const message = value as Partial<ChatMessage>;
          if (!['user', 'assistant', 'system'].includes(String(message.role)) || typeof message.content !== 'string') {
            return [];
          }
          const timestamp = Number(message.timestamp);
          return [{
            id: typeof message.id === 'string' && message.id.length <= 200
              ? message.id
              : `msg-recovered-${Date.now()}-${index}`,
            role: message.role as ChatMessage['role'],
            content: message.content.slice(0, 200_000),
            timestamp: Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : Date.now(),
            toolCalls: normalizeToolActionLogs(message.toolCalls),
            isStreaming: false,
            isHidden: message.isHidden === true,
          }];
        });
        if (normalized.length > 0) return normalized;
      }
    }
  } catch {}
  return [
    {
      id: `msg-welcome-${Date.now()}`,
      role: 'assistant',
      content: defaultGreeting,
      timestamp: Date.now(),
    },
  ];
};

const saveChatHistory = (personaId: string, messages: ChatMessage[]) => {
  safeStorageSet(`ycy_chat_history_${personaId}`, JSON.stringify(messages.slice(-200)));
  safeStorageSet('ycy_last_active_persona', personaId);
};

const deviceManager = DeviceManager.getInstance();
const ttsManager = TTSManager.getInstance();
const sttManager = STTManager.getInstance();
const contractEngine = ContractEngine.getInstance();
const edgingEngine = EdgingEngine.getInstance();
const heartRateEngine = HeartRateEngine.getInstance();
let llmClient = new LLMClient(loadSavedLlmConfig(), { hardwareToolsEnabled: loadChatHardwareEnabled() });
let handsFreeRestartTimer: ReturnType<typeof setTimeout> | null = null;
let suppressHandsFreeRestartUntil = 0;
let isStartingVoiceInput = false;
let activeChatRequest: AbortController | null = null;
let chatRequestSequence = 0;

export const useAppStore = create<AppStore>((set, get) => {
  deviceManager.subscribeState((newState) => {
    set({ deviceState: newState });
  });

  contractEngine.subscribe((cState) => {
    set({ contractState: cState });
  });

  edgingEngine.subscribe((eState) => {
    set({ edgingState: eState });
  });

  heartRateEngine.subscribe((hrState) => {
    set({ heartRateState: hrState });
  });

  ttsManager.subscribe((isSpeaking, text) => {
    set({ isSpeaking, speakingText: text });
    if (handsFreeRestartTimer) {
      clearTimeout(handsFreeRestartTimer);
      handsFreeRestartTimer = null;
    }
    const store = get();
    if (
      !isSpeaking &&
      !isStartingVoiceInput &&
      Date.now() >= suppressHandsFreeRestartUntil &&
      store?.safetyConfig?.handsFreeVoiceMode &&
      store?.activeTab === 'chat' &&
      !store?.isChatLoading &&
      !store?.isListening
    ) {
      handsFreeRestartTimer = setTimeout(() => {
        handsFreeRestartTimer = null;
        if (Date.now() >= suppressHandsFreeRestartUntil && get()?.activeTab === 'chat') {
          get()?.startVoiceInput?.();
        }
      }, 500);
    }
  });

  const initialLlmConfig = loadSavedLlmConfig();
  const loadedSafetyConfig = loadSavedSafetyConfig();
  const initialTtsVoiceProfiles = loadSavedTtsVoiceProfiles();
  const initialCustomPersonas = loadSavedCustomPersonas();
  const initialChatDisplayConfig = loadSavedChatDisplayConfig();
  deviceManager.updateSafetyConfig(loadedSafetyConfig);
  const initialSafetyConfig = deviceManager.getSafetyConfig();
  ttsManager.configureDefaults({
    enabled: initialSafetyConfig.voiceFeedback,
    rate: initialSafetyConfig.voiceRate,
    pitch: initialSafetyConfig.voicePitch,
    gain: initialSafetyConfig.voiceGain,
    engineType: initialSafetyConfig.ttsEngine,
    siliconflowApiKey: initialSafetyConfig.siliconflowTtsApiKey,
    siliconflowModel: initialSafetyConfig.siliconflowTtsModel,
    siliconflowVoice: initialSafetyConfig.siliconflowTtsVoice,
    volcengineResourceId: initialSafetyConfig.volcengineTtsResourceId,
    volcengineVoice: initialSafetyConfig.volcengineTtsVoice,
    volcengineApiKey: isVolcengineArkApiBaseUrl(initialLlmConfig.baseUrl)
      ? initialLlmConfig.apiKey
      : '',
  });

  const stopActiveSubsystems = () => {
    suppressHandsFreeRestartUntil = Date.now() + 5000;
    if (handsFreeRestartTimer) {
      clearTimeout(handsFreeRestartTimer);
      handsFreeRestartTimer = null;
    }
    activeChatRequest?.abort();
    activeChatRequest = null;
    chatRequestSequence++;
    ttsManager.stop();
    sttManager.stopListening();
    AmbientAudioEngine.getInstance().stop();
    PitchTracker.getInstance().stop();
    contractEngine.stopContract(true);
    edgingEngine.stopSession();
    heartRateEngine.disconnect();
    FemboyTrainingEngine.getInstance().abortTask(false);

    const nextSafety = deviceManager.getSafetyConfig();
    llmClient.setHardwareToolsEnabled(false);
    safeStorageSet('ycy_chat_hardware_enabled', 'false');
    safeStorageSet('ycy_safety_config', JSON.stringify(nextSafety));
    set({
      safetyConfig: nextSafety,
      isChatLoading: false,
      isListening: false,
      isAutoDomination: false,
      chatHardwareEnabled: false,
    });
  };

  deviceManager.subscribeEmergencyStop(stopActiveSubsystems);

  const allPersonas = [...PRESET_PERSONAS, ...initialCustomPersonas];
  const initialPersona = allPersonas.find(p => p.id === initialLlmConfig.selectedPersonaId) || PRESET_PERSONAS[0];
  if (initialPersona.id !== initialLlmConfig.selectedPersonaId) {
    initialLlmConfig.selectedPersonaId = initialPersona.id;
    safeStorageSet('ycy_llm_config', JSON.stringify(initialLlmConfig));
  }

  return {
    activeTab: 'tavern',
    setActiveTab: (tab) => set({ activeTab: tab }),

    deviceState: deviceManager.getState(),
    contractState: contractEngine.getState(),
    edgingState: edgingEngine.getState(),
    heartRateState: heartRateEngine.getState(),

    // 蓝牙手环方法
    connectHeartRateBle: async () => {
      return await heartRateEngine.connectRealBleDevice();
    },
    startHeartRateSimulator: () => {
      heartRateEngine.startSimulator();
    },
    setSimulatedBpm: (bpm) => {
      heartRateEngine.setManualSimulatedBpm(bpm);
    },
    toggleHeartRateAdaptiveLoop: (active) => {
      heartRateEngine.toggleAutoAdaptiveLoop(active);
    },
    disconnectHeartRate: () => {
      heartRateEngine.disconnect();
    },

    // 契约
    startDisciplineContract: (minutes, intensity) => {
      contractEngine.startContract(minutes, intensity);
    },
    answerSurgeCheck: (answer) => {
      contractEngine.answerSurgeCheck(answer);
    },
    stopDisciplineContract: () => {
      contractEngine.stopContract(false);
    },

    // 高潮剥夺
    startEdgingSession: (rounds) => {
      edgingEngine.startEdgingSession(rounds);
    },
    triggerEdgingBrake: () => {
      edgingEngine.triggerDenialBrake(false);
    },
    stopEdgingSession: () => {
      edgingEngine.stopSession();
    },
    setEdgingSensitivity: (val) => {
      edgingEngine.setSensitivity(val);
    },

    safetyConfig: initialSafetyConfig,
    setSafetyConfig: (cfg) => {
      deviceManager.updateSafetyConfig({ ...get().safetyConfig, ...cfg });
      const next = deviceManager.getSafetyConfig();
      safeStorageSet('ycy_safety_config', JSON.stringify(next));
      ttsManager.configureDefaults({
        enabled: next.voiceFeedback,
        rate: next.voiceRate,
        pitch: next.voicePitch,
        gain: next.voiceGain,
        engineType: next.ttsEngine,
        siliconflowApiKey: next.siliconflowTtsApiKey,
        siliconflowModel: next.siliconflowTtsModel,
        siliconflowVoice: next.siliconflowTtsVoice,
        volcengineResourceId: next.volcengineTtsResourceId,
        volcengineVoice: next.volcengineTtsVoice,
      });
      set({ safetyConfig: next });
    },

    chatDisplayConfig: initialChatDisplayConfig,
    setChatDisplayConfig: (cfg) => {
      const next = normalizeChatDisplayConfig({ ...get().chatDisplayConfig, ...cfg });
      safeStorageSet('ycy_chat_display_config', JSON.stringify(next));
      set({ chatDisplayConfig: next });
    },

    ttsVoiceProfiles: initialTtsVoiceProfiles,
    saveTtsVoiceProfile: (profile) => {
      const id = `voice-profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const normalized = normalizeTtsVoiceProfile({ ...profile, id, createdAt: Date.now() }, id);
      if (!normalized) return '';
      set((state) => {
        const next = [...state.ttsVoiceProfiles, normalized].slice(-50);
        safeStorageSet('ycy_tts_voice_profiles', JSON.stringify(next));
        return { ttsVoiceProfiles: next };
      });
      return normalized.id;
    },
    deleteTtsVoiceProfile: (id) => {
      set((state) => {
        const next = state.ttsVoiceProfiles.filter((profile) => profile.id !== id);
        safeStorageSet('ycy_tts_voice_profiles', JSON.stringify(next));
        return { ttsVoiceProfiles: next };
      });
    },
    replaceTtsVoiceProfiles: (profiles) => {
      const next = profiles
        .slice(0, 50)
        .map((profile, index) => normalizeTtsVoiceProfile(profile, `voice-profile-import-${index}`))
        .filter((profile): profile is TtsVoiceProfile => profile !== null);
      safeStorageSet('ycy_tts_voice_profiles', JSON.stringify(next));
      set({ ttsVoiceProfiles: next });
    },

    llmConfig: initialLlmConfig,
    setLlmConfig: (cfg) => {
      set((state) => {
        const next = normalizeLlmConfig(cfg, state.llmConfig);
        safeStorageSet('ycy_llm_config', JSON.stringify(next));
        llmClient.updateConfig(next);
        ttsManager.configureDefaults({
          volcengineApiKey: isVolcengineArkApiBaseUrl(next.baseUrl)
            ? next.apiKey
            : '',
        });
        return { llmConfig: next, isAutoDomination: next.apiKey || isLocalApiBaseUrl(next.baseUrl) ? state.isAutoDomination : false };
      });
    },

    customPersonas: initialCustomPersonas,
    addCustomPersona: (p) => {
      const newPersona = normalizeCustomPersona({
        ...p,
        id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        isCustom: true,
      });
      if (!newPersona) return null;
      set((state) => {
        const next = [...state.customPersonas, newPersona];
        safeStorageSet('ycy_custom_personas', JSON.stringify(next));
        return { customPersonas: next };
      });
      return newPersona.id;
    },
    updateCustomPersona: (id, p) => {
      set((state) => {
        const next = state.customPersonas.map((item) => {
          if (item.id !== id) return item;
          return normalizeCustomPersona({ ...item, ...p, id: item.id }) || item;
        });
        safeStorageSet('ycy_custom_personas', JSON.stringify(next));
        return { customPersonas: next };
      });
    },
    replaceCustomPersonas: (personas) => {
      const next = personas
        .slice(0, 100)
        .map((persona, index) => normalizeCustomPersona(persona, `custom-import-${Date.now()}-${index}`))
        .filter((persona): persona is AIPersona => persona !== null);
      const selectedId = get().llmConfig.selectedPersonaId;
      set({ customPersonas: next });
      safeStorageSet('ycy_custom_personas', JSON.stringify(next));
      const selectedPresetExists = PRESET_PERSONAS.some((persona) => persona.id === selectedId);
      if (!selectedPresetExists && !next.some((persona) => persona.id === selectedId)) {
        get().selectPersona(PRESET_PERSONAS[0].id);
      }
    },
    deleteCustomPersona: (id) => {
      const shouldSelectFallback = get().llmConfig.selectedPersonaId === id;
      const next = get().customPersonas.filter((item) => item.id !== id);
      set({ customPersonas: next });
      safeStorageSet('ycy_custom_personas', JSON.stringify(next));
      if (shouldSelectFallback) get().selectPersona(PRESET_PERSONAS[0].id);
    },
    getAllPersonas: () => {
      return [...PRESET_PERSONAS, ...get().customPersonas];
    },

    selectPersona: (personaId: string) => {
      activeChatRequest?.abort();
      activeChatRequest = null;
      chatRequestSequence++;
      suppressHandsFreeRestartUntil = Date.now() + 1000;
      ttsManager.stop();
      sttManager.stopListening();
      const currentPersonaId = get().llmConfig.selectedPersonaId;
      saveChatHistory(currentPersonaId, get().messages);

      const all = get().getAllPersonas();
      const target = all.find((p) => p.id === personaId) || PRESET_PERSONAS[0];
      const shouldRevokeHardware = target.isCustom === true;
      if (shouldRevokeHardware) {
        llmClient.setHardwareToolsEnabled(false);
        safeStorageSet('ycy_chat_hardware_enabled', 'false');
      }
      get().setLlmConfig({ selectedPersonaId: target.id });

      const targetHistory = loadSavedChatHistory(target.id, target.greetingMessage);
      set({
        messages: targetHistory,
        isChatLoading: false,
        isListening: false,
        speechTranscript: '',
        ...(shouldRevokeHardware ? { chatHardwareEnabled: false, isAutoDomination: false } : {}),
      });

      if (get().safetyConfig.autoPlayVoice && targetHistory.length <= 1) {
        get().speakMessage(target.greetingMessage, target.voiceConfig);
      }
    },

    isSpeaking: false,
    speakingText: null,

    speakMessage: async (text: string, voiceOverride?: VoiceConfig) => {
      // if (!get().safetyConfig.voiceFeedback) return;
      const all = get().getAllPersonas();
      const persona = all.find((p) => p.id === get().llmConfig.selectedPersonaId) || PRESET_PERSONAS[0];
      const cfg = voiceOverride || persona.voiceConfig;
      await ttsManager.speak(
        text,
        cfg,
        get().safetyConfig.voiceRate,
        get().safetyConfig.voicePitch,
        get().safetyConfig.ttsEngine,
        get().safetyConfig.ttsEngine === 'siliconflow'
          ? get().safetyConfig.siliconflowTtsApiKey || ''
          : get().safetyConfig.ttsEngine === 'volcengine_tts' && isVolcengineArkApiBaseUrl(get().llmConfig.baseUrl)
            ? get().llmConfig.apiKey
            : ''
      );
    },

    stopSpeaking: () => {
      ttsManager.stop();
    },

    isListening: false,
    speechTranscript: '',

    startVoiceInput: () => {
      if (isStartingVoiceInput || get().isListening) return;
      isStartingVoiceInput = true;
      if (handsFreeRestartTimer) {
        clearTimeout(handsFreeRestartTimer);
        handsFreeRestartTimer = null;
      }
      ttsManager.stop();

      void sttManager.startListening(
          (transcript, isFinal) => {
            set({ speechTranscript: transcript });
            if (isFinal && transcript.trim()) {
              const currentSurge = get().contractState?.currentSurgeCheck;
              if (currentSurge && !currentSurge.isAnswered) {
                get().answerSurgeCheck(transcript.trim());
              }

              const lower = transcript.toLowerCase();
              if (
                get().edgingState?.isActive &&
                get().edgingState?.currentPhase === 'warming' &&
                (lower.includes('快到了') || lower.includes('受不了') || lower.includes('忍不住') || lower.includes('要射'))
              ) {
                get().triggerEdgingBrake();
              }

              set({ isListening: false, speechTranscript: '' });
              get().sendChatMessage(transcript.trim());
            }
          },
          (isListening, error, isProcessing) => {
            set({ isListening: isListening || isProcessing === true });
            if (error) {
              console.warn('STT Error:', error);
            }
          },
        {
          engine: get().safetyConfig.sttEngine,
          siliconflowApiKey: get().safetyConfig.siliconflowSttApiKey,
          siliconflowModel: get().safetyConfig.siliconflowSttModel,
          volcengineApiKey: get().safetyConfig.volcengineSttApiKey,
          volcengineAppId: get().safetyConfig.volcengineSttAppId,
          volcengineAccessKey: get().safetyConfig.volcengineSttAccessKey,
          volcengineResourceId: get().safetyConfig.volcengineSttResourceId,
        })
        .catch((e: any) => console.warn('开启语音识别失败:', e.message))
        .finally(() => {
          isStartingVoiceInput = false;
        });
    },

    stopVoiceInput: () => {
      sttManager.finishListening();
    },
    cancelVoiceInput: () => {
      sttManager.stopListening();
      set({ isListening: false, speechTranscript: '' });
    },

    customPrompt: '',
    setCustomPrompt: (prompt) => set({ customPrompt: prompt }),

    messages: loadSavedChatHistory(initialPersona.id, initialPersona.greetingMessage),
    isChatLoading: false,
    chatHardwareEnabled: loadChatHardwareEnabled(),
    setChatHardwareEnabled: (enabled) => {
      const next = enabled === true && !get().safetyConfig.emergencyLock;
      activeChatRequest?.abort();
      activeChatRequest = null;
      chatRequestSequence++;
      llmClient.setHardwareToolsEnabled(next);
      safeStorageSet('ycy_chat_hardware_enabled', String(next));
      set({ chatHardwareEnabled: next, isChatLoading: false, isAutoDomination: next ? get().isAutoDomination : false });
    },
    stopChatGeneration: () => {
      activeChatRequest?.abort();
      activeChatRequest = null;
      chatRequestSequence++;
      set({ isChatLoading: false, isAutoDomination: false });
    },
    isAutoDomination: false,
    toggleAutoDomination: () => set((state) => ({
      isAutoDomination: state.isAutoDomination
        ? false
        : Boolean((state.llmConfig.apiKey || isLocalApiBaseUrl(state.llmConfig.baseUrl)) && state.chatHardwareEnabled && !state.safetyConfig.emergencyLock),
    })),

    addMessage: (msg) => {
      const personaId = get().llmConfig.selectedPersonaId;
      set((state) => {
        const next = [
          ...state.messages,
          {
            ...msg,
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: Date.now(),
          },
        ];
        saveChatHistory(personaId, next);
        return { messages: next };
      });
    },

    clearMessages: () => {
      activeChatRequest?.abort();
      activeChatRequest = null;
      chatRequestSequence++;
      const personaId = get().llmConfig.selectedPersonaId;
      const all = get().getAllPersonas();
      const persona = all.find((p) => p.id === personaId) || PRESET_PERSONAS[0];
      const resetMsg: ChatMessage[] = [
        {
          id: `msg-welcome-${Date.now()}`,
          role: 'assistant',
          content: persona.greetingMessage,
          timestamp: Date.now(),
        },
      ];
      set({ messages: resetMsg, isChatLoading: false });
      saveChatHistory(personaId, resetMsg);
      ttsManager.stop();
      sttManager.stopListening();
    },

    sendChatMessage: async (content: string, isHidden?: boolean) => {
      if (!content.trim() || get().isChatLoading) return;

      const personaId = get().llmConfig.selectedPersonaId;
      const requestId = ++chatRequestSequence;
      activeChatRequest?.abort();
      const controller = new AbortController();
      activeChatRequest = controller;
      const userMsg: ChatMessage = {
        id: `msg-user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
        isHidden: isHidden,
      };

      const updatedWithUser = [...get().messages, userMsg];
      set({
        messages: updatedWithUser,
        isChatLoading: true,
      });
      saveChatHistory(personaId, updatedWithUser);

      try {
        const history = updatedWithUser;
        let streamingMessageId: string | null = null;
        const updateStreamingMessage = (partialText: string) => {
          if (controller.signal.aborted || requestId !== chatRequestSequence || get().llmConfig.selectedPersonaId !== personaId) return;
          if (!streamingMessageId) {
            streamingMessageId = `msg-ai-stream-${Date.now()}`;
            set((state) => ({
              messages: [...state.messages, {
                id: streamingMessageId!,
                role: 'assistant',
                content: partialText,
                timestamp: Date.now(),
              }],
            }));
            return;
          }
          set((state) => ({
            messages: state.messages.map((message) => message.id === streamingMessageId
              ? { ...message, content: partialText }
              : message),
          }));
        };
        const res = await llmClient.sendMessage(
          history,
          get().customPersonas,
          get().customPrompt,
          controller.signal,
          updateStreamingMessage,
        );
        if (controller.signal.aborted || requestId !== chatRequestSequence || get().llmConfig.selectedPersonaId !== personaId) return;

        const aiMsg: ChatMessage = {
          id: streamingMessageId || `msg-ai-${Date.now()}`,
          role: 'assistant',
          content: res.reply,
          timestamp: Date.now(),
          toolCalls: res.toolLogs,
        };

        const finalMessages = streamingMessageId
          ? get().messages.map((message) => message.id === streamingMessageId ? aiMsg : message)
          : [...get().messages, aiMsg];
        set({
          messages: finalMessages,
          isChatLoading: false,
        });
        saveChatHistory(personaId, finalMessages);

        if (get().safetyConfig.autoPlayVoice && res.reply) {
          const all = get().getAllPersonas();
          const persona = all.find((p) => p.id === personaId) || PRESET_PERSONAS[0];
          void get().speakMessage(res.reply, persona.voiceConfig).catch((err) => {
            console.warn('TTS auto-play failed:', err);
          });
        }
      } catch (e: any) {
        if (controller.signal.aborted || requestId !== chatRequestSequence || get().llmConfig.selectedPersonaId !== personaId) return;
        const errorMsg: ChatMessage = {
          id: `msg-err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ 请求异常: ${e.message}`,
          timestamp: Date.now(),
        };
        const errMessages = [...get().messages, errorMsg];
        set({
          messages: errMessages,
          isChatLoading: false,
        });
        saveChatHistory(personaId, errMessages);
      } finally {
        if (requestId === chatRequestSequence) {
          activeChatRequest = null;
          set({ isChatLoading: false });
        }
      }
    },

    // 悬浮窗与画中画模式
    floatingWindowState: {
      isOpen: false,
      isExpanded: false,
      isPipActive: false,
    },
    setFloatingWindowState: (cfg) => {
      set((state) => ({
        floatingWindowState: { ...state.floatingWindowState, ...cfg },
      }));
    },
    toggleFloatingWindow: () => {
      set((state) => {
        const nextOpen = !state.floatingWindowState.isOpen;
        return {
          floatingWindowState: {
            ...state.floatingWindowState,
            isOpen: nextOpen,
            isExpanded: nextOpen ? true : false,
          },
        };
      });
    },

    triggerEmergencyStop: async () => {
      return await deviceManager.latchEmergencyStop(true);
    },
  };
});
