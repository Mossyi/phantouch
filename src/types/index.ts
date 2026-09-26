// 设备类型
export type DeviceCategory = 'ems' | 'toy' | 'enema' | 'all';
export type ToyType = 'cup' | 'egg' | 'toy'; // 飞机杯 / 跳蛋 / 通用

// 连接模式
export type ConnectionMode = 'ble' | 'bridge' | 'simulator' | 'dglab';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// EMS 电击器状态
export interface EMSState {
  strengthA: number; // 0 - 200
  strengthB: number; // 0 - 200
  limitA: number;    // 最大限制
  limitB: number;
  partA: string;     // 作用部位描述，如 "敏感带"
  partB: string;
  activeWaveA: string | null;
  activeWaveB: string | null;
  isShocking: boolean;
}

// 飞机杯 / 跳蛋 (Toy) 状态
export interface ToyState {
  type: ToyType;
  motorA: number;    // 0 - 20 (抽插 / 主震动)
  motorB: number;    // 0 - 20 (吮吸 / 夹紧)
  motorC: number;    // 0 - 20 (旋转 / 绞磨)
  partA: string;
  partB: string;
  partC: string;
  activePattern: string | null;
  patternRemainingSec: number;
  isTurbo: boolean;
}

// 智能灌肠机 (Enema) 状态
export interface EnemaState {
  peristalticState: number; // 0=停止, 1=正转注水, 2=反转抽水
  waterPumpState: number;   // 0=停止, 1=开启
  pressureA: number;        // 实时压力 A
  pressureB: number;        // 实时压力 B
  battery: number;          // 0 - 100
  activePattern: string | null;
  patternRemainingSec: number;
  isHoldChallenge: boolean;
}

export interface DeviceSystemState {
  connectionMode: ConnectionMode;
  connectionStatus: ConnectionStatus; // Legacy/Aggregate status
  deviceName: string;                 // Aggregate name
  deviceId: string | null;            // Legacy ID
  batteryLevel: number;               // Aggregate battery
  lastHeartbeat: number;
  devices: {
    ems: { isConnected: boolean; name: string | null };
    toy: { isConnected: boolean; name: string | null };
    enema: { isConnected: boolean; name: string | null };
  };
  ems: EMSState;
  toy: ToyState;
  enema: EnemaState;
}

// 安全限制与全局反馈设置
export type TTSEngineType = 'siliconflow' | 'volcengine_tts' | 'edge_neural' | 'browser_native';
export type STTEngineType = 'browser' | 'siliconflow' | 'volcengine';

export interface TtsVoiceProfile {
  id: string;
  name: string;
  engine: Extract<TTSEngineType, 'siliconflow' | 'volcengine_tts'>;
  baseVoiceId: string;
  baseVoiceName: string;
  rate: number;
  pitch: number;
  gain: number;
  createdAt: number;
}

export interface SafetyConfig {
  maxEmsStrengthA: number;  // 默认 100/200
  maxEmsStrengthB: number;  // 默认 100/200
  minEmsStrength: number;   // 自动玩法随机电击下限，停止与手动控制不受影响
  maxToyMotorARate: number; // 默认 20 (A通道上限:主抽插/震动)
  maxToyMotorBRate: number; // 默认 20 (B通道上限:吮吸/夹紧)
  maxToyMotorCRate: number; // 默认 20 (C通道上限:旋转/其它)
  minToyMotorRate: number;  // 自动玩法随机马达下限，按实际启用通道上限截断
  minEnemaDurationSec: number; // 自动灌肠单次泵运行时长下限
  maxEnemaDurationSec: number; // 灌肠单次泵运行时长上限，0 表示禁用
  emergencyLock: boolean;   // 急停锁
  vibrationFeedback: boolean; // 手机震动反馈
  voiceFeedback: boolean;   // 语控反馈
  autoPlayVoice: boolean;   // AI 回复时自动朗读
  handsFreeVoiceMode: boolean; // 连续免提对讲模式
  sttEngine: STTEngineType; // 语音识别引擎: 浏览器 / 硅基流动 / 火山豆包语音
  siliconflowSttApiKey?: string;
  siliconflowSttModel?: string;
  volcengineSttApiKey?: string; // 新版豆包语音控制台 X-Api-Key
  volcengineSttAppId?: string; // 旧版控制台 APP ID
  volcengineSttAccessKey?: string; // 旧版控制台 Access Token
  volcengineSttResourceId?: string;
  ttsEngine: TTSEngineType; // 语音合成引擎: 硅基流动 / 火山豆包 / 微软Edge免费 / 浏览器原生
  siliconflowTtsApiKey?: string; // 硅基流动 TTS 专用 Key，不与 LLM 配置混用
  siliconflowTtsModel?: string; // 硅基流动可用模型
  siliconflowTtsVoice?: string; // 硅基流动系统预置音色，如 anna / alex
  volcengineTtsResourceId?: string; // 火山豆包语音资源 ID，如 seed-tts-2.0
  volcengineTtsVoice?: string; // 火山豆包语音音色 ID
  voiceRate: number;        // 全局语速倍率 0.5 - 1.5
  voicePitch: number;       // 全局音调 0.5 - 1.5
  voiceGain: number;        // 全局音量增益 -10dB - 10dB
}

// 角色音色设置
export interface VoiceConfig {
  gender: 'male' | 'female';
  pitch: number; // 0.5 - 1.5
  rate: number;  // 0.5 - 1.5
  gain?: number; // 音量增益 -10dB - 10dB
  absoluteTuning?: boolean; // true 时角色声线参数不再与全局参数相乘
  preserveNarration?: boolean; // 酒馆长回复朗读时保留括号内的叙述与动作
  voiceName?: string;
  neuralVoice?: string;     // 微软神经自然语音 ID (如 zh-CN-YunxiNeural)
  siliconflowVoice?: string; // 硅基流动大模型发音人 (如 alex, bella, anna, benjamin)
  volcengineVoice?: string; // 火山豆包语音合成 2.0 发音人 ID
}

// AI 相关定义
export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  selectedPersonaId: string;
}

export interface AIPersona {
  id: string;
  name: string;
  tag: string;
  avatar: string;
  color: string;
  description: string;
  systemPrompt: string;
  greetingMessage: string;
  voiceConfig?: VoiceConfig;
  isCustom?: boolean;
}

export interface ToolActionLog {
  id: string;
  toolName: string;
  args: Record<string, any>;
  summary: string;
  timestamp: number;
  success: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolActionLog[];
  isStreaming?: boolean;
  isHidden?: boolean;
  images?: string[];
}

// 模式定义
export interface ToyPatternDef {
  id: string;
  name: string;
  category: string;
  description: string;
  loop: boolean;
  sequence: [number, number, number, number][]; // [motorA, motorB, motorC, durationSec]
}

export interface EnemaPatternDef {
  id: string;
  name: string;
  category: string;
  description: string;
  loop: boolean;
  sequence: [number, number, number][]; // [peristalticDir, waterPumpState, durationSec]
}

export interface EMSWaveDef {
  id: string;
  name: string;
  durationMs: number;
  data: number[];
}

// 赛博契约与锁权调教定义
export type ContractIntensity = 'mild' | 'standard' | 'severe' | 'hardcore';

export interface SurgeCheckEvent {
  id: string;
  question: string;
  deadlineTimestamp: number; // 截止时间戳 (通常15秒)
  remainingSeconds: number;
  isAnswered: boolean;
  passed?: boolean;
}

export interface DisciplineContractState {
  isActive: boolean;
  contractId: string;
  durationMinutes: number;
  remainingSeconds: number;
  startTime: number;
  intensity: ContractIntensity;
  totalSurgeChecks: number;
  passedSurgeChecks: number;
  failedSurgeChecks: number;
  currentSurgeCheck: SurgeCheckEvent | null;
  historyLogs: string[];
}

// 高潮剥夺与边缘控射 (基于肛塞/括约肌压力传感器自适应闭环)
export type EdgingPhase = 'warming' | 'denying' | 'cooldown' | 'milking_release' | 'idle';

export interface EdgingDenialState {
  isActive: boolean;
  targetRounds: number;          // 目标控射轮数 (如 3 / 5 / 10 轮)
  completedRounds: number;       // 已完成控射轮数
  currentPhase: EdgingPhase;
  arousalPercent: number;        // 欲望蓄力槽 0% ~ 100%
  currentPressure: number;       // 传感器实时压力
  baselinePressure: number;      // 平静基线压力
  cooldownRemainingSec: number;  // 强制冷场倒计时
  autoBrakeCount: number;        // 传感器自动识别急刹触发次数
  historyLogs: string[];
}

// 互动剧情地牢 (Interactive Story Dungeon)
export type DungeonEndingType = 'surrender' | 'conquer' | 'punished' | 'released';
export type DungeonHardwareMode = 'text' | 'simulator' | 'real';
export type DungeonGenerationSource = 'cloud' | 'local' | 'offline';

export interface DungeonRunState {
  resolve: number;
  submission: number;
  trust: number;
  risk: number;
  turns: number;
  aiChapters: number;
  routeTags: string[];
}

export interface DungeonChoice {
  id: string;
  text: string;
  attitude: 'submissive' | 'defiant' | 'begging' | 'neutral';
  replyDialogue: string;
  hardwareAction?: {
    type: 'ems_wave' | 'ems_strength' | 'toy_pattern' | 'toy_turbo' | 'enema_pattern' | 'stop';
    target: string;
    value?: number;
    durationSec?: number;
  };
  nextStepId: string; // 步骤 ID 或 'ending'
  endingTitle?: string;
  endingDesc?: string;
  endingType?: DungeonEndingType;
}

export interface DungeonStep {
  id: string;
  speaker: string;
  avatar: string;
  narrative: string;
  dialogue: string;
  choices: DungeonChoice[];
  generationSource?: DungeonGenerationSource;
  generationNotice?: string;
}

export interface DungeonScript {
  id: string;
  title: string;
  subtitle: string;
  category: '雌堕身心重塑' | '经典硬核支配';
  isFemboy: boolean;
  avatar: string;
  bgGradient: string;
  difficulty: string;
  tags: string[];
  description: string;
  initialStepId: string;
  steps: Record<string, DungeonStep>;
  isAiGenerated?: boolean;
  creatorPrompt?: string;
  createdAt?: number;
  generationSource?: DungeonGenerationSource;
  generationNotice?: string;
}

// 蓝牙手环与心率自适应调教定义
export type HeartRateZone = 'calm' | 'excited' | 'edge_climax' | 'overload_danger';
// 成就系统与专属头衔定义
export type AchievementCategory = 'femboy' | 'hardware' | 'biometrics' | 'dungeon';
export type AchievementRarity = 'bronze' | 'silver' | 'gold' | 'mythic';

export interface Achievement {
  id: string;
  title: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  icon: string;
  description: string;
  flavorText: string;
  rewardTitle: string;
  hiddenRewardVoice?: string;
  unlockedAt: number | null;
  progress?: { current: number; max: number };
}

export interface HeartRateState {
  isConnected: boolean;
  deviceName: string;
  isSimulator: boolean;
  currentBpm: number;
  minBpm: number;
  maxBpm: number;
  avgBpm: number;
  currentZone: HeartRateZone;
  isAutoAdaptiveLoopActive: boolean;
  historyBpm: { time: number; bpm: number }[];
  historyLogs: string[];
}

// 阶段化雌堕重塑特训营定义
export type TrainingStage = 1 | 2 | 3 | 4;

export interface TrainingTask {
  id: string;
  stage: TrainingStage;
  title: string;
  subtitle: string;
  durationMinutes: number;
  mentorPersonaId: string;
  icon: string;
  postureRequirement: string;
  clothingRequirement: string;
  description: string;
  category?: 'voice' | 'posture' | 'style' | 'story' | 'mindfulness' | 'review';
  difficulty?: 1 | 2 | 3 | 4;
  steps?: string[];
  reflectionPrompt?: string;
  hardwareConfig: {
    emsWave?: string;
    emsStrengthA?: number;
    emsStrengthB?: number;
    toyPattern?: string;
    toyMotorRate?: number;
  };
  mentorVoiceIntro: string;
  mentorVoiceOutro: string;
}

export interface FemboyTrainingSession {
  taskId: string;
  stage: TrainingStage;
  totalSeconds: number;
  remainingSeconds: number;
  isPaused: boolean;
  startedAt: number;
  currentTip: string;
  hardwareEnabled: boolean;
}

export interface FemboyTrainingState {
  currentStage: TrainingStage;
  totalTrainingMinutes: number;
  completedTaskIds: string[];
  activeSession: FemboyTrainingSession | null;
  dailyStreak: number;
  lastCheckInDate: string | null;
}
