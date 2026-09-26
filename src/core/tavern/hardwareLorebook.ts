import { LorebookEntry } from './tavernTypes';
import { DeviceManager } from '../deviceManager';
import { EMSWaveEngine } from '../protocol/waveEngine';
import { TOY_PATTERNS } from '../protocol/toyPatterns';

export type LorebookMessageSource = 'user' | 'assistant';

export const HARDWARE_LOREBOOK_WAVES = EMSWaveEngine.getAllWaves().map((wave) => ({
  id: wave.id,
  name: wave.name,
}));
export const HARDWARE_LOREBOOK_TOY_PATTERNS = Object.values(TOY_PATTERNS).map((pattern) => ({
  id: pattern.id,
  name: pattern.name,
}));
const HARDWARE_LOREBOOK_WAVE_IDS = new Set(HARDWARE_LOREBOOK_WAVES.map((wave) => wave.id));
const HARDWARE_LOREBOOK_TOY_PATTERN_IDS = new Set(HARDWARE_LOREBOOK_TOY_PATTERNS.map((pattern) => pattern.id));
const HARDWARE_LOREBOOK_STORAGE_VERSION = 5;
const HARDWARE_LOREBOOK_VERSION_KEY = 'ycy_hardware_lorebook_version';
const RETIRED_HARDWARE_LOREBOOK_IDS = new Set(['lb_orgasm_edge', 'lb_enema_safety_stop', 'lb_ems_explicit_stop']);

export const DEFAULT_HARDWARE_LOREBOOK: LorebookEntry[] = [
  {
    id: 'lb_mercy',
    keywords: ['求饶', '受不了了', '轻一点', '太麻了', '主人饶命'],
    content: '【世界书触发】受试者心理防线突破并向你求饶。系统判定为服从度上升，已自动切换为轻柔呼吸波抚慰。',
    matchScope: 'user',
    priority: 5,
    cooldownSec: 3,
    hardwareAction: {
      type: 'ems_wave',
      target: 'breathe',
      stopMode: 'timed',
      durationSec: 6,
    },
    enabled: true,
  },
  {
    id: 'lb_piston_burst',
    keywords: ['快一点', '用力', '超频', '深一点', '全速'],
    content: '【世界书触发】用户请求加强刺激，允许 AI 在玩家设定的安全范围内决定马达挡位与持续时间。',
    matchScope: 'user',
    priority: 5,
    cooldownSec: 3,
    hardwareAction: {
      type: 'toy_motor',
      stopMode: 'timed',
      durationSec: 8,
    },
    enabled: true,
  },
  {
    id: 'lb_punish_sawtooth',
    keywords: ['不听话', '反抗', '不肯', '嘴硬', '惩罚你'],
    content: '【世界书触发】执行惩教协议，具体电击挡位与持续时间由 AI 在玩家设定的安全范围内决定。',
    matchScope: 'user',
    priority: 6,
    cooldownSec: 3,
    hardwareAction: {
      type: 'ems_strength',
      target: 'AB',
      stopMode: 'timed',
      durationSec: 8,
    },
    enabled: true,
  },
  {
    id: 'lb_ai_enforcement',
    keywords: ['执行惩罚', '接受电击', '惩罚脉冲', '加一轮电击'],
    content: '【世界书触发】角色已明确宣布执行惩罚，允许 AI 在用户设置的时长上限内决定本次脉冲时间。',
    matchScope: 'assistant',
    priority: 9,
    cooldownSec: 5,
    hardwareAction: {
      type: 'ems_wave',
      target: 'sawtooth_grind',
      stopMode: 'timed',
      durationSec: 8,
    },
    enabled: true,
  },
  {
    id: 'lb_ai_posture_order',
    keywords: ['跪好', '趴好', '保持不动', '不许动', '双手抱头'],
    content: '【世界书触发】角色下达了明确姿势命令，可用短促节奏脉冲作为动作提示。',
    matchScope: 'assistant',
    priority: 6,
    cooldownSec: 6,
    hardwareAction: {
      type: 'ems_wave',
      target: 'rhythm_step',
      stopMode: 'timed',
      durationSec: 5,
    },
    enabled: true,
  },
  {
    id: 'lb_ai_countdown',
    keywords: ['倒计时开始', '数到三', '三秒倒计时', '最后三秒'],
    content: '【世界书触发】角色开始倒计时，心跳节拍会在 AI 决定的安全时长内提供节奏提示。',
    matchScope: 'assistant',
    priority: 7,
    cooldownSec: 5,
    hardwareAction: {
      type: 'ems_wave',
      target: 'heartbeat',
      stopMode: 'timed',
      durationSec: 6,
    },
    enabled: true,
  },
  {
    id: 'lb_ai_training_start',
    keywords: ['训练开始', '考核开始', '现在开始上课', '第一项命令'],
    content: '【世界书触发】角色正式开始训练，用轻量呼吸波作为开场提示。',
    matchScope: 'assistant',
    priority: 5,
    cooldownSec: 10,
    hardwareAction: {
      type: 'ems_wave',
      target: 'breathe',
      stopMode: 'timed',
      durationSec: 4,
    },
    enabled: true,
  },
  {
    id: 'lb_user_defiance',
    keywords: ['我不要', '我拒绝', '偏不', '我不服', '不听你的'],
    secondaryKeywords: ['主人', '导师', '命令', '惩罚', '训练'],
    content: '【世界书触发】用户在训练语境中明确反抗，触发一段由 AI 决定时长的提醒脉冲。',
    matchScope: 'user',
    priority: 7,
    cooldownSec: 6,
    hardwareAction: {
      type: 'ems_wave',
      target: 'heartbeat',
      stopMode: 'timed',
      durationSec: 6,
    },
    enabled: true,
  },
  {
    id: 'lb_user_accepts_punishment',
    keywords: ['我错了', '我认罚', '接受惩罚', '请惩罚我', '我会听话'],
    content: '【世界书触发】用户主动认罚或确认服从，触发轻量反馈脉冲。',
    matchScope: 'user',
    priority: 6,
    cooldownSec: 5,
    hardwareAction: {
      type: 'ems_wave',
      target: 'sensory_tickle',
      stopMode: 'timed',
      durationSec: 4,
    },
    enabled: true,
  },
  {
    id: 'lb_toy_gentle_warmup',
    keywords: ['轻柔一点', '慢慢来', '先预热', '温柔启动'],
    secondaryKeywords: ['飞机杯', '玩具', '马达', '律动'],
    content: '【世界书触发】用户请求温和预热，可启用轻柔渐入律动；保持角色原有语气，不要用设备播报替代回复。',
    matchScope: 'user',
    priority: 6,
    cooldownSec: 12,
    hardwareAction: { type: 'toy_pattern', target: 'gentle', stopMode: 'timed', durationSec: 30 },
    enabled: true,
  },
  {
    id: 'lb_toy_deep_thrust',
    keywords: ['深一点', '顶到底', '深层抽插', '慢进深顶'],
    secondaryKeywords: ['飞机杯', '玩具', '马达', '抽插'],
    content: '【世界书触发】用户明确要求深层节奏，可启用慢进深顶律动，实际时长仍由 AI 在上限内决定。',
    matchScope: 'user',
    priority: 7,
    cooldownSec: 10,
    hardwareAction: { type: 'toy_pattern', target: 'deep_thrust', stopMode: 'timed', durationSec: 35 },
    enabled: true,
  },
  {
    id: 'lb_toy_nine_shallow_deep',
    keywords: ['九浅一深', '浅几下再深', '浅深交替'],
    content: '【世界书触发】对话明确指定九浅一深节奏，可启用对应飞机杯律动预设。',
    matchScope: 'both',
    priority: 8,
    cooldownSec: 12,
    hardwareAction: { type: 'toy_pattern', target: 'nine_shallow_one_deep', stopMode: 'timed', durationSec: 40 },
    enabled: true,
  },
  {
    id: 'lb_toy_suction_grip',
    keywords: ['加强吸力', '吸紧一点', '紧致吮吸', '锁紧吸住'],
    secondaryKeywords: ['飞机杯', '玩具', '吮吸', '吸力'],
    content: '【世界书触发】用户要求加强吮吸，可启用紧致吮吸律动；不得超过玩家设置的马达上限。',
    matchScope: 'user',
    priority: 7,
    cooldownSec: 10,
    hardwareAction: { type: 'toy_pattern', target: 'suction_grip', stopMode: 'timed', durationSec: 30 },
    enabled: true,
  },
  {
    id: 'lb_toy_edge_tease',
    keywords: ['边缘控制', '控射', '吊着别结束', '快到就停'],
    secondaryKeywords: ['飞机杯', '玩具', '马达', '训练'],
    content: '【世界书触发】用户请求边缘控制，可启用间歇挑逗律动，并保留随时停止的安全边界。',
    matchScope: 'user',
    priority: 8,
    cooldownSec: 15,
    hardwareAction: { type: 'toy_pattern', target: 'edging_tease', stopMode: 'timed', durationSec: 45 },
    enabled: true,
  },
  {
    id: 'lb_toy_ai_piston_order',
    keywords: ['极速活塞', '全速冲刺', '高速抽插', '加速冲刺'],
    secondaryKeywords: ['飞机杯', '玩具', '马达', '活塞'],
    content: '【世界书触发】角色明确宣布高速飞机杯动作，可在安全上限内启用短时极速活塞律动。',
    matchScope: 'assistant',
    priority: 8,
    cooldownSec: 12,
    hardwareAction: { type: 'toy_pattern', target: 'piston_burst', stopMode: 'timed', durationSec: 20 },
    enabled: true,
  },
  {
    id: 'lb_toy_ai_slow_churn',
    keywords: ['慢慢磨', '缓慢研磨', '低速磨动', '慢速旋磨'],
    secondaryKeywords: ['飞机杯', '玩具', '马达', '杯子'],
    content: '【世界书触发】角色进入低速研磨情节，可启用慢速律动，不改变当前角色文风。',
    matchScope: 'assistant',
    priority: 6,
    cooldownSec: 12,
    hardwareAction: { type: 'toy_pattern', target: 'slow_churn', stopMode: 'timed', durationSec: 35 },
    enabled: true,
  },
  {
    id: 'lb_toy_ai_climax_finish',
    keywords: ['最后冲刺', '准许释放', '完成最后一轮', '进入收尾'],
    secondaryKeywords: ['飞机杯', '玩具', '马达', '训练'],
    content: '【世界书触发】角色明确进入本轮收尾，可启用短时收尾律动；若用户表达停止则以急停规则优先。',
    matchScope: 'assistant',
    priority: 7,
    cooldownSec: 20,
    hardwareAction: { type: 'toy_pattern', target: 'climax_milking', stopMode: 'timed', durationSec: 18 },
    enabled: true,
  },
  {
    id: 'lb_enema_gentle_fill',
    keywords: ['开始注水', '缓慢注入', '少量注水', '温和灌注'],
    secondaryKeywords: ['灌肠器', '灌肠机', '蠕动泵', '注水'],
    content: '【世界书触发】用户明确请求灌肠器温和注水，只允许短时灌注，并受玩家设置的灌肠时长范围限制。',
    matchScope: 'user',
    priority: 8,
    cooldownSec: 20,
    hardwareAction: { type: 'enema_fill', stopMode: 'timed', durationSec: 8 },
    enabled: true,
  },
  {
    id: 'lb_enema_drain_request',
    keywords: ['开始排水', '立即排空', '帮我排掉', '抽水排出'],
    secondaryKeywords: ['灌肠器', '灌肠机', '水', '排空'],
    content: '【世界书触发】用户明确请求排水，可启动限时排空；排水请求优先于新的注水动作。',
    matchScope: 'user',
    priority: 9,
    cooldownSec: 8,
    hardwareAction: { type: 'enema_drain', stopMode: 'timed', durationSec: 20 },
    enabled: true,
  },
  {
    id: 'lb_enema_ai_fill',
    keywords: ['开始灌注', '启动注水', '打开蠕动泵'],
    secondaryKeywords: ['灌肠器', '灌肠机', '注水', '灌注'],
    content: '【世界书触发】角色明确下达灌注动作，可由 AI 在用户时长边界内决定是否执行短时注水。',
    matchScope: 'assistant',
    priority: 8,
    cooldownSec: 20,
    hardwareAction: { type: 'enema_fill', stopMode: 'timed', durationSec: 8 },
    enabled: true,
  },
  {
    id: 'lb_ems_gentle_current',
    keywords: ['轻柔电流', '微弱一点', '轻轻电一下', '柔和脉冲'],
    secondaryKeywords: ['电击', '电流', 'EMS', '脉冲'],
    content: '【世界书触发】用户明确要求轻柔 EMS 反馈，可启用短时羽毛轻抚波形；实际档位不得低于或高于玩家设置的安全范围。',
    matchScope: 'user',
    priority: 6,
    cooldownSec: 8,
    hardwareAction: { type: 'ems_wave', target: 'sensory_tickle', stopMode: 'timed', durationSec: 6 },
    enabled: true,
  },
  {
    id: 'lb_ems_tide_request',
    keywords: ['潮汐电流', '波浪电击', '起伏脉冲', '一阵一阵'],
    secondaryKeywords: ['电击', '电流', 'EMS', '脉冲'],
    content: '【世界书触发】用户指定起伏式电流，可启用潮汐波形，并由 AI 在安全上限内决定短时档位。',
    matchScope: 'user',
    priority: 7,
    cooldownSec: 9,
    hardwareAction: { type: 'ems_wave', target: 'tide', stopMode: 'timed', durationSec: 10 },
    enabled: true,
  },
  {
    id: 'lb_ems_combo_request',
    keywords: ['连续点射', '短促连击', '快速脉冲', '来几下电击'],
    secondaryKeywords: ['电击', '电流', 'EMS', '脉冲'],
    content: '【世界书触发】用户明确请求短促连续刺激，可启用限时连击波形，不得转换为持续输出。',
    matchScope: 'user',
    priority: 7,
    cooldownSec: 10,
    hardwareAction: { type: 'ems_wave', target: 'combo', stopMode: 'timed', durationSec: 7 },
    enabled: true,
  },
  {
    id: 'lb_ems_ai_staircase',
    keywords: ['逐级加码', '一档档增加', '阶梯脉冲', '慢慢提高电流'],
    secondaryKeywords: ['电击', '电流', 'EMS', '脉冲', '惩罚'],
    content: '【世界书触发】角色明确宣布阶梯式 EMS 动作，可启用九重天阶梯波形；角色台词保持原样，动作作为附加执行。',
    matchScope: 'assistant',
    priority: 8,
    cooldownSec: 12,
    hardwareAction: { type: 'ems_wave', target: 'staircase_shock', stopMode: 'timed', durationSec: 10 },
    enabled: true,
  },
  {
    id: 'lb_ems_ai_warning_pulse',
    keywords: ['警告脉冲', '提醒你一下', '短暂警告', '给你一点教训'],
    secondaryKeywords: ['电击', '电流', 'EMS', '脉冲', '惩罚'],
    content: '【世界书触发】角色发出明确的 EMS 警告，可启用短时心跳节拍作为提示，不延长为持续动作。',
    matchScope: 'assistant',
    priority: 7,
    cooldownSec: 10,
    hardwareAction: { type: 'ems_wave', target: 'heartbeat', stopMode: 'timed', durationSec: 5 },
    enabled: true,
  },
];

const HARDWARE_ACTION_TYPES = new Set<LorebookEntry['hardwareAction'] extends infer T
  ? T extends { type: infer U } ? U : never
  : never>(['ems_wave', 'ems_strength', 'toy_motor', 'toy_pattern', 'enema_fill', 'enema_drain', 'brake_stop']);

const normalizeStringList = (value: unknown, limit: number): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 100))
    .filter(Boolean))]
    .slice(0, limit);
};

export const normalizeLorebookEntry = (value: unknown, index = 0): LorebookEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<LorebookEntry>;
  const keywords = normalizeStringList(entry.keywords, 30);
  if (keywords.length === 0 || typeof entry.content !== 'string') return null;

  const rawId = typeof entry.id === 'string' ? entry.id : `lb_recovered_${index}`;
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) || `lb_recovered_${index}`;
  const secondaryKeywords = normalizeStringList(entry.secondaryKeywords, 30);
  const rawPriority = Number(entry.priority);
  const rawCooldown = Number(entry.cooldownSec);
  const matchScope: NonNullable<LorebookEntry['matchScope']> = ['user', 'assistant', 'both'].includes(String(entry.matchScope))
    ? entry.matchScope as NonNullable<LorebookEntry['matchScope']>
    : 'user';
  let hardwareAction: LorebookEntry['hardwareAction'];
  const action = entry.hardwareAction;
  if (action && typeof action === 'object' && HARDWARE_ACTION_TYPES.has(action.type)) {
    const rawDuration = Number(action.durationSec);
    if (action.type === 'brake_stop') {
      hardwareAction = { type: 'brake_stop' };
    } else {
      const rawTarget = typeof action.target === 'string' ? action.target.trim().slice(0, 100) : '';
      hardwareAction = {
        type: action.type,
        target: action.type === 'ems_wave'
          ? (HARDWARE_LOREBOOK_WAVE_IDS.has(rawTarget) ? rawTarget : 'breathe')
          : action.type === 'toy_pattern'
            ? (HARDWARE_LOREBOOK_TOY_PATTERN_IDS.has(rawTarget) ? rawTarget : 'gentle')
            : action.type === 'ems_strength' && ['A', 'B', 'AB'].includes(rawTarget) ? rawTarget : undefined,
        durationSec: Number.isFinite(rawDuration) ? Math.max(1, Math.min(3600, Math.round(rawDuration))) : 10,
        stopMode: action.type === 'enema_fill' || action.type === 'enema_drain'
          ? 'timed'
          : action.stopMode === 'timed' ? 'timed' : 'persistent',
      };
    }
  }

  return {
    id,
    keywords,
    secondaryKeywords: secondaryKeywords.length > 0 ? secondaryKeywords : undefined,
    content: entry.content.trim().slice(0, 4000),
    matchScope,
    priority: Number.isFinite(rawPriority) ? Math.max(1, Math.min(10, Math.round(rawPriority))) : 5,
    cooldownSec: Number.isFinite(rawCooldown) ? Math.max(1, Math.min(300, Math.round(rawCooldown))) : 3,
    hardwareAction,
    enabled: entry.enabled !== false,
  };
};

const canMatchSource = (entry: LorebookEntry, source: LorebookMessageSource) => {
  const scope = entry.matchScope || 'user';
  return scope === 'both' || scope === source;
};

export const matchHardwareLorebookEntries = (
  entries: LorebookEntry[],
  text: string,
  source: LorebookMessageSource = 'user',
): LorebookEntry[] => {
  const normalizedText = typeof text === 'string' ? text.trim().slice(0, 20_000).toLocaleLowerCase() : '';
  if (!normalizedText) return [];
  return entries.filter((entry) => {
    if (!entry.enabled || !canMatchSource(entry, source)) return false;
    const primaryHit = entry.keywords.some((keyword) => normalizedText.includes(keyword.trim().toLocaleLowerCase()));
    const secondaryHit = !entry.secondaryKeywords?.length
      || entry.secondaryKeywords.some((keyword) => normalizedText.includes(keyword.trim().toLocaleLowerCase()));
    return primaryHit && secondaryHit;
  });
};

const ruleSpecificity = (entry: LorebookEntry) => (
  (entry.secondaryKeywords?.length ? 10_000 : 0)
  + Math.max(0, ...entry.keywords.map((keyword) => keyword.length))
);

export const selectHardwareLorebookActions = (matchedEntries: LorebookEntry[]): LorebookEntry[] => {
  const candidates = matchedEntries
    .filter((entry) => entry.hardwareAction)
    .sort((left, right) => (
      (right.priority || 5) - (left.priority || 5)
      || ruleSpecificity(right) - ruleSpecificity(left)
      || left.id.localeCompare(right.id)
    ));
  const brakeRule = candidates.find((entry) => entry.hardwareAction?.type === 'brake_stop');
  if (brakeRule) return [brakeRule];

  const selected: LorebookEntry[] = [];
  const usedOutputs = new Set<'ems' | 'toy' | 'enema'>();
  for (const entry of candidates) {
    const type = entry.hardwareAction?.type;
    const output = type === 'toy_motor' || type === 'toy_pattern'
      ? 'toy'
      : type === 'enema_fill' || type === 'enema_drain' ? 'enema' : 'ems';
    if (usedOutputs.has(output)) continue;
    usedOutputs.add(output);
    selected.push(entry);
  }
  return selected;
};

export interface HardwareLorebookMatchResult {
  matchedEntries: LorebookEntry[];
  actionEntries: LorebookEntry[];
  deferredActionEntries: LorebookEntry[];
  injectedContext: string;
}

export interface LorebookAiOutputLimits {
  minimumEms: number;
  maximumEms: number;
  minimumToy: number;
  maximumToy: number;
  minimumEnemaSec?: number;
  maximumEnemaSec?: number;
}

export interface LorebookAiActionRequest {
  token: string;
  entries: Array<{
    id: string;
    maximumSec: number | null;
    minimumLevel: number;
    maximumLevel: number;
  }>;
  instruction: string;
}

export const createLorebookAiActionRequest = (
  entries: LorebookEntry[],
  limits: LorebookAiOutputLimits,
  tokenFactory: () => string = () => (
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`
  ),
): LorebookAiActionRequest | null => {
  const unique = new Map<string, LorebookAiActionRequest['entries'][number]>();
  for (const entry of entries) {
    const action = entry.hardwareAction;
    if (!action || action.type === 'brake_stop') continue;
    const isToy = action.type === 'toy_motor';
    const usesLevel = action.type === 'ems_wave' || action.type === 'ems_strength' || isToy;
    const maximumLevel = usesLevel
      ? Math.max(0, Math.round(isToy ? limits.maximumToy : limits.maximumEms))
      : 1;
    const minimumLevel = usesLevel
      ? Math.max(0, Math.min(maximumLevel, Math.round(isToy ? limits.minimumToy : limits.minimumEms)))
      : 1;
    const isEnema = action.type === 'enema_fill' || action.type === 'enema_drain';
    const actionMaximumSec = Math.max(1, Math.min(3600, Math.round(action.durationSec || 10)));
    const maximumSec = action.stopMode === 'timed'
      ? isEnema
        ? Math.min(actionMaximumSec, Math.max(0, Math.round(limits.maximumEnemaSec ?? 60)))
        : actionMaximumSec
      : null;
    if (maximumSec !== null && maximumSec <= 0) continue;
    unique.set(entry.id, {
      id: entry.id,
      maximumSec,
      minimumLevel,
      maximumLevel,
    });
    if (unique.size >= 30) break;
  }
  if (unique.size === 0) return null;
  const token = tokenFactory().replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'duration';
  const candidates = [...unique.values()];
  const options = candidates.map((item) => (
    item.maximumSec === null
      ? `- ${item.id}: 运行标志 0或1，档位 ${item.minimumLevel}-${item.maximumLevel}`
      : `- ${item.id}: 时长 0-${item.maximumSec} 秒，档位 ${item.minimumLevel}-${item.maximumLevel}`
  )).join('\n');
  return {
    token,
    entries: candidates,
    instruction: `【本地硬件世界书 AI 决策】\n以下规则可能在本轮命中。请结合对话决定是否执行、实际档位与实际持续时间；时长/运行标志为 0 表示跳过。档位必须处于用户设置的最小值与最大值之间，时长不得超过用户上限。若规则确实命中，请在回复末尾追加 [[YCY_HW:${token}:规则ID:时长或运行标志:档位]]。这是供 App 解析的控制标记，不要解释。\n${options}`,
  };
};

export interface LorebookAiActionDecision {
  durationSec: number | null;
  level: number;
}

export const parseLorebookAiActionDecisions = (
  reply: string,
  request: LorebookAiActionRequest | null,
): { cleanedReply: string; decisions: Map<string, LorebookAiActionDecision> } => {
  const decisions = new Map<string, LorebookAiActionDecision>();
  if (!request || typeof reply !== 'string') return { cleanedReply: reply, decisions };
  const requestEntries = new Map(request.entries.map((entry) => [entry.id, entry]));
  const marker = new RegExp(`\\[\\[YCY_HW:${request.token}:([a-zA-Z0-9_-]{1,100}):(\\d{1,4}):(\\d{1,3})\\]\\]`, 'g');
  const cleanedReply = reply.replace(marker, (_full, id: string, rawDuration: string, rawLevel: string) => {
    const candidate = requestEntries.get(id);
    if (!candidate) return '';
    const requestedDuration = Math.max(0, Math.round(Number(rawDuration)));
    if (requestedDuration === 0) return '';
    const durationSec = candidate.maximumSec === null
      ? null
      : Math.min(candidate.maximumSec, requestedDuration);
    const level = Math.max(candidate.minimumLevel, Math.min(candidate.maximumLevel, Math.round(Number(rawLevel))));
    if (level <= 0) return '';
    decisions.set(id, { durationSec, level });
    return '';
  }).replace(/\[\[YCY_HW:[^\]]{0,300}\]\]/g, '').trim();
  return { cleanedReply, decisions };
};

const cloneDefaultEntries = (): LorebookEntry[] => DEFAULT_HARDWARE_LOREBOOK.map((entry) => ({
  ...entry,
  keywords: [...entry.keywords],
  secondaryKeywords: entry.secondaryKeywords ? [...entry.secondaryKeywords] : undefined,
  hardwareAction: entry.hardwareAction ? { ...entry.hardwareAction } : undefined,
}));

export class HardwareLorebookEngine {
  private static instance: HardwareLorebookEngine;
  private entries: LorebookEntry[] = [];
  private lastTriggeredAt: Map<string, number> = new Map();

  private constructor() {
    this.load();
  }

  static getInstance(): HardwareLorebookEngine {
    if (!HardwareLorebookEngine.instance) {
      HardwareLorebookEngine.instance = new HardwareLorebookEngine();
    }
    return HardwareLorebookEngine.instance;
  }

  private load() {
    try {
      const saved = localStorage.getItem('ycy_hardware_lorebook');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        this.entries = Array.isArray(parsed)
          ? parsed
            .slice(0, 200)
            .map(normalizeLorebookEntry)
            .filter((entry): entry is LorebookEntry => entry !== null && !RETIRED_HARDWARE_LOREBOOK_IDS.has(entry.id))
          : cloneDefaultEntries();
      } else {
        this.entries = cloneDefaultEntries();
      }
      const storedVersion = Number(localStorage.getItem(HARDWARE_LOREBOOK_VERSION_KEY) || 0);
      if (storedVersion < HARDWARE_LOREBOOK_STORAGE_VERSION) {
        this.entries = this.entries.filter(
          (entry) => !RETIRED_HARDWARE_LOREBOOK_IDS.has(entry.id) && entry.hardwareAction?.type !== 'brake_stop',
        );
        const existingIds = new Set(this.entries.map((entry) => entry.id));
        this.entries.push(...cloneDefaultEntries().filter((entry) => !existingIds.has(entry.id)));
        const legacyPunishment = this.entries.find((entry) => entry.id === 'lb_punish_sawtooth');
        if (legacyPunishment?.content.includes('50 档')) {
          legacyPunishment.content = DEFAULT_HARDWARE_LOREBOOK.find((entry) => entry.id === legacyPunishment.id)!.content;
        }
        localStorage.setItem(HARDWARE_LOREBOOK_VERSION_KEY, String(HARDWARE_LOREBOOK_STORAGE_VERSION));
        this.save();
      }
    } catch {
      this.entries = cloneDefaultEntries();
    }
  }

  save() {
    try {
      localStorage.setItem('ycy_hardware_lorebook', JSON.stringify(this.entries));
    } catch {}
  }

  getEntries(): LorebookEntry[] {
    return this.entries.map((entry) => ({
      ...entry,
      keywords: [...entry.keywords],
      secondaryKeywords: entry.secondaryKeywords ? [...entry.secondaryKeywords] : undefined,
      hardwareAction: entry.hardwareAction ? { ...entry.hardwareAction } : undefined,
    }));
  }

  addEntry(entry: Omit<LorebookEntry, 'id'>): LorebookEntry {
    const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const normalized = normalizeLorebookEntry({
      ...entry,
      id: `lb_${suffix}`,
    });
    if (!normalized) throw new Error('世界书条目至少需要一个关键词和有效内容');
    const newEntry = normalized;
    this.entries.push(newEntry);
    this.save();
    return newEntry;
  }

  updateEntry(id: string, patch: Partial<Omit<LorebookEntry, 'id'>>): LorebookEntry | null {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const current = this.entries[index];
    const normalized = normalizeLorebookEntry({
      ...current,
      ...patch,
      id: current.id,
      hardwareAction: patch.hardwareAction
        ? { ...current.hardwareAction, ...patch.hardwareAction }
        : current.hardwareAction,
    }, index);
    if (!normalized) return null;
    this.entries[index] = normalized;
    this.save();
    return { ...normalized, keywords: [...normalized.keywords] };
  }

  toggleEntry(id: string) {
    const item = this.entries.find((e) => e.id === id);
    if (item) {
      item.enabled = !item.enabled;
      this.save();
    }
  }

  deleteEntry(id: string) {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.lastTriggeredAt.delete(id);
    this.save();
  }

  resetDefaults() {
    this.entries = cloneDefaultEntries();
    this.lastTriggeredAt.clear();
    try {
      localStorage.setItem(HARDWARE_LOREBOOK_VERSION_KEY, String(HARDWARE_LOREBOOK_STORAGE_VERSION));
    } catch {}
    this.save();
  }

  previewText(text: string, source: LorebookMessageSource = 'user'): HardwareLorebookMatchResult {
    const matchedEntries = matchHardwareLorebookEntries(this.entries, text, source);
    return {
      matchedEntries,
      actionEntries: selectHardwareLorebookActions(matchedEntries),
      deferredActionEntries: [],
      injectedContext: matchedEntries.map((entry) => entry.content).join('\n'),
    };
  }

  getAssistantAiActionCandidates(): LorebookEntry[] {
    return this.entries
      .filter((entry) => entry.enabled && entry.hardwareAction?.type !== 'brake_stop')
      .filter((entry) => entry.matchScope === 'assistant' || entry.matchScope === 'both')
      .sort((left, right) => (right.priority || 5) - (left.priority || 5))
      .slice(0, 30);
  }

  createAiActionRequest(entries: LorebookEntry[]): LorebookAiActionRequest | null {
    const safety = DeviceManager.getInstance().getSafetyConfig();
    return createLorebookAiActionRequest(entries, {
      minimumEms: safety.minEmsStrength,
      maximumEms: Math.min(safety.maxEmsStrengthA, safety.maxEmsStrengthB),
      minimumToy: safety.minToyMotorRate,
      maximumToy: Math.max(safety.maxToyMotorARate, safety.maxToyMotorBRate, safety.maxToyMotorCRate),
      minimumEnemaSec: safety.minEnemaDurationSec,
      maximumEnemaSec: safety.maxEnemaDurationSec,
    });
  }

  /**
   * 检查文本是否命中世界书关键词，并自动执行硬件动作与返回附加上下文
   */
  processText(
    text: string,
    source: LorebookMessageSource = 'user',
    options: { deferAiActions?: boolean } = { deferAiActions: true },
  ): HardwareLorebookMatchResult {
    const matchedEntries = matchHardwareLorebookEntries(this.entries, text, source);
    const selectedEntries = selectHardwareLorebookActions(matchedEntries);
    const now = Date.now();
    const actionEntries = selectedEntries.filter((entry) => (
      now - (this.lastTriggeredAt.get(entry.id) || 0) >= (entry.cooldownSec || 3) * 1000
    ));
    actionEntries.forEach((entry) => this.lastTriggeredAt.set(entry.id, now));

    const deferredActionEntries = options.deferAiActions === false
      ? []
      : actionEntries.filter((entry) => entry.hardwareAction?.type !== 'brake_stop');
    const immediateEntries = actionEntries.filter((entry) => !deferredActionEntries.includes(entry));
    if (immediateEntries.length > 0) {
      void this.executeActionsSequentially(immediateEntries).catch((error) => {
        console.warn('世界书即时动作执行失败:', error);
      });
    }

    return {
      matchedEntries,
      actionEntries,
      deferredActionEntries,
      injectedContext: matchedEntries.map((entry) => entry.content).join('\n'),
    };
  }

  async executeAiActionDecision(entryId: string, decision: LorebookAiActionDecision): Promise<boolean> {
    const entry = this.entries.find((item) => item.id === entryId && item.enabled);
    const action = entry?.hardwareAction;
    if (!entry || !action || action.type === 'brake_stop') return false;
    const safety = DeviceManager.getInstance().getSafetyConfig();
    const isToy = action.type === 'toy_motor';
    const usesLevel = action.type === 'ems_wave' || action.type === 'ems_strength' || isToy;
    const maximum = isToy
      ? Math.max(safety.maxToyMotorARate, safety.maxToyMotorBRate, safety.maxToyMotorCRate)
      : usesLevel ? Math.min(safety.maxEmsStrengthA, safety.maxEmsStrengthB) : 1;
    const minimum = usesLevel
      ? Math.min(maximum, isToy ? safety.minToyMotorRate : safety.minEmsStrength)
      : 1;
    const level = usesLevel ? Math.max(minimum, Math.min(maximum, Math.round(decision.level))) : 1;
    if (level <= 0) return false;

    let durationSec: number | null = null;
    if (action.stopMode === 'timed') {
      if (decision.durationSec === null || !Number.isFinite(decision.durationSec)) return false;
      durationSec = Math.max(1, Math.min(action.durationSec || 10, Math.round(decision.durationSec)));
    }
    await this.executeHardwareAction(entry, level, durationSec);
    return true;
  }

  private async executeActionsSequentially(entries: LorebookEntry[]): Promise<void> {
    for (const entry of entries) {
      if (entry.hardwareAction?.type === 'brake_stop') await this.executeHardwareAction(entry);
    }
  }

  private async executeHardwareAction(
    entry: LorebookEntry,
    aiLevel?: number,
    aiDurationSec: number | null = null,
  ): Promise<void> {
    if (!entry.hardwareAction) return;
    const dev = DeviceManager.getInstance();
    const act = entry.hardwareAction;

    if (act.type === 'brake_stop') {
      await dev.emergencyStop();
      return;
    }
    if (!Number.isFinite(aiLevel) || Number(aiLevel) <= 0) return;
    const level = Math.round(Number(aiLevel));

    const outputType: 'ems' | 'toy' | 'enema' = act.type === 'toy_motor' || act.type === 'toy_pattern'
      ? 'toy'
      : act.type === 'enema_fill' || act.type === 'enema_drain' ? 'enema' : 'ems';

    if (act.type === 'ems_wave' && act.target) {
      // 先把强度压到 AI 本轮的安全决策值，避免切换波形时短暂沿用旧的较高强度。
      await dev.setEmsStrength('AB', level);
      await dev.sendEmsWave('AB', act.target);
    } else if (act.type === 'ems_strength') {
      const channel = act.target === 'A' || act.target === 'B' ? act.target : 'AB';
      await dev.setEmsStrength(channel, level);
    } else if (act.type === 'toy_motor') {
      await dev.setToyMotor(level, Math.round(level * 0.8), Math.round(level * 0.9));
    } else if (act.type === 'toy_pattern' && act.target && aiDurationSec !== null) {
      await dev.playToyPattern(act.target, aiDurationSec);
    } else if (act.type === 'enema_fill' && aiDurationSec !== null) {
      await dev.enemaFill(aiDurationSec);
    } else if (act.type === 'enema_drain' && aiDurationSec !== null) {
      await dev.enemaDrain(aiDurationSec);
    }

    if (act.stopMode === 'timed' && aiDurationSec !== null) {
      if (outputType === 'ems') dev.scheduleOutputStop('ems', aiDurationSec);
      else if (act.type === 'toy_motor') dev.scheduleOutputStop('toy', aiDurationSec);
    }
  }
}
