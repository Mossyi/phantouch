export type SceneDirectorStyle = 'gentle' | 'academy' | 'story';
export type SceneDirectorTheme = 'commute' | 'academy' | 'night' | 'studio' | 'masquerade' | 'gala' | 'backstage' | 'reality';
export type SceneDirectorRelationship = 'mentor' | 'partners' | 'rivals' | 'spotlight';
export type SceneDirectorPacing = 'slow' | 'balanced' | 'cinematic';
export type SceneDirectorBranchMode = 'agency' | 'mystery' | 'challenge';
export type SceneDirectorLevel = 'off' | 'low' | 'medium' | 'high';
export type SceneDirectorStepKind = 'checkin' | 'warmup' | 'calibration' | 'scene' | 'choice' | 'finale' | 'cooldown' | 'review';

export interface SceneDirectorChoice {
  id: string;
  label: string;
  response: string;
  intensityEffect: 'softer' | 'steady' | 'stronger';
}

export interface SceneDirectorStep {
  id: string;
  kind: SceneDirectorStepKind;
  title: string;
  direction: string;
  durationSec: number;
  toyLevel: SceneDirectorLevel;
  emsLevel: SceneDirectorLevel;
  checkpoint: boolean;
  choices?: SceneDirectorChoice[];
}

export interface SceneDirectorPlan {
  version: 2;
  title: string;
  synopsis: string;
  style: SceneDirectorStyle;
  theme: SceneDirectorTheme;
  relationship: SceneDirectorRelationship;
  pacing: SceneDirectorPacing;
  branchMode: SceneDirectorBranchMode;
  targetMinutes: number;
  steps: SceneDirectorStep[];
}

export interface SceneDirectorPlanOptions {
  style: SceneDirectorStyle;
  theme: SceneDirectorTheme;
  targetMinutes: number;
  focusAreas: string[];
  customPremise?: string;
  relationship?: SceneDirectorRelationship;
  pacing?: SceneDirectorPacing;
  branchMode?: SceneDirectorBranchMode;
}

export const SCENE_DIRECTOR_THEMES: Array<{
  id: SceneDirectorTheme;
  title: string;
  icon: string;
  synopsis: string;
}> = [
  { id: 'commute', title: '秘密通勤', icon: '🚌', synopsis: '在虚构的通勤场景中保持镇定，分支会改变节奏而非判定对错。' },
  { id: 'academy', title: '芭比学院', icon: '🎓', synopsis: '以课表、口令和自我表达练习组成的渐进式课堂。' },
  { id: 'night', title: '午夜片场', icon: '🌙', synopsis: '灯光、脚步与等待感组成的电影式慢节奏剧情。' },
  { id: 'studio', title: '自由片场', icon: '🎬', synopsis: '使用用户填写的前提生成私密场景，不套用公共空间情节。' },
  { id: 'masquerade', title: '假面舞会', icon: '🎭', synopsis: '在身份线索与舞步选择之间，决定今晚要揭开什么秘密。' },
  { id: 'gala', title: '红毯首秀', icon: '✨', synopsis: '从后台准备到聚光灯亮起，完成属于你的主角登场。' },
  { id: 'backstage', title: '后台救场', icon: '🎟️', synopsis: '演出前出现意外，你要与搭档合作改变原定剧本。' },
  { id: 'reality', title: '真人秀挑战', icon: '📺', synopsis: '用数个可选择的小任务推进录制，不设置淘汰或惩罚。' },
];

export const SCENE_DIRECTOR_RELATIONSHIPS: Array<{
  id: SceneDirectorRelationship;
  title: string;
  synopsis: string;
}> = [
  { id: 'mentor', title: '导演与新人', synopsis: '由导演提供提示，你决定是否采纳。' },
  { id: 'partners', title: '默契搭档', synopsis: '共同完成一件临时任务，重视配合。' },
  { id: 'rivals', title: '友好对手', synopsis: '有一点竞争感，但没有失败惩罚。' },
  { id: 'spotlight', title: '主角试镜', synopsis: '你是镜头中心，导演根据反馈改戏。' },
];

export const SCENE_DIRECTOR_PACING_OPTIONS: Array<{
  id: SceneDirectorPacing;
  title: string;
  synopsis: string;
}> = [
  { id: 'slow', title: '慢热铺垫', synopsis: '更多环境与情绪铺垫' },
  { id: 'balanced', title: '平衡推进', synopsis: '铺垫、选择与高潮均衡' },
  { id: 'cinematic', title: '戏剧转折', synopsis: '更快进入事件与反转' },
];

export const SCENE_DIRECTOR_BRANCH_OPTIONS: Array<{
  id: SceneDirectorBranchMode;
  title: string;
  synopsis: string;
}> = [
  { id: 'agency', title: '角色抉择', synopsis: '用态度和关系决定下一幕' },
  { id: 'mystery', title: '线索探索', synopsis: '跟随、调查或揭开线索' },
  { id: 'challenge', title: '舞台挑战', synopsis: '选择不同难度的小任务' },
];

const STYLE_COPY: Record<SceneDirectorStyle, { title: string; voice: string }> = {
  gentle: { title: '温柔陪伴', voice: '导演用舒缓、肯定的语气提醒你掌握自己的节奏。' },
  academy: { title: '芭比学院', voice: '导师给出清晰课表与短口令，每一步都有完成标准。' },
  story: { title: '剧情章节', voice: '镜头、环境与角色台词推动剧情，但所有选择都没有惩罚性答案。' },
};

const THEME_COPY: Record<SceneDirectorTheme, { title: string; setting: string; first: string; second: string; finale: string }> = {
  commute: {
    title: '秘密通勤',
    setting: '清晨的虚构车厢缓慢启动，你需要在环境变化中保持自己的呼吸节奏。',
    first: '车辆进入轻微颠簸路段。把注意力留在呼吸和肩颈，不需要向任何人证明什么。',
    second: '到站提示逐渐靠近。导演改变镜头速度，让你选择维持节奏或主动放慢。',
    finale: '终点就在前方。最后一个镜头只要求你保持清醒，并记住停止按钮始终有效。',
  },
  academy: {
    title: '芭比学院',
    setting: '今天的教室只有你和训练导师，课表会根据每次反馈调整。',
    first: '第一堂课是姿态与表达。跟随短口令完成动作，然后判断当前节奏是否合适。',
    second: '第二堂课加入灯光和节拍。完成不是服从测试，而是找到你愿意继续的强度。',
    finale: '结课铃即将响起。用一句肯定自己的话完成今天的最后镜头。',
  },
  night: {
    title: '午夜片场',
    setting: '片场灯光逐渐变暗，远处脚步声只是剧情提示，安全控制仍在你手里。',
    first: '第一个长镜头从安静开始，节拍缓慢升起，导演等待你的状态反馈。',
    second: '脚步声靠近又远去，镜头切换到你的选择：继续悬念，或者让场景柔和下来。',
    finale: '灯光重新亮起。最后一幕会在短暂高点后完整归零。',
  },
  studio: {
    title: '自由片场',
    setting: '这是只属于本次会话的自由片场，所有情节都必须服从你的边界与停止指令。',
    first: '导演根据你的场景前提推进第一幕，并在幕末停下来等待反馈。',
    second: '第二幕只延续你选择保留的元素；任何不合适的内容都可以跳过。',
    finale: '用一个明确、可控的收束镜头结束故事，然后进入冷却。',
  },
  masquerade: {
    title: '假面舞会',
    setting: '邀请函只写了时间和一枚图案，舞会中的每个人似乎都知道一部分真相。',
    first: '乐声响起，一位戴着同款徽记的角色从人群中走来。你可以回应，也可以先观察周围线索。',
    second: '第二支舞开始前，隐藏的身份出现破绽。导演把决定权交给你：靠近真相、改变目标或暂时退场。',
    finale: '钟声响起，面具是否摘下由你决定。故事会保留你选择的秘密并安全收束。',
  },
  gala: {
    title: '红毯首秀',
    setting: '后台倒计时已经开始，你将完成准备、采访与正式登场三个镜头。',
    first: '造型与灯光刚刚就位，导演请你选择本次登场想传达的气质，并用一句话完成预演。',
    second: '临场采访出现了计划外的问题。你可以正面回答、幽默转场，或请搭档接过话题。',
    finale: '聚光灯落在最后一个站位上。用你选择的姿态完成谢幕，然后让全部节奏归零。',
  },
  backstage: {
    title: '后台救场',
    setting: '正式演出前，原定方案突然失效，你和搭档需要在有限时间内重排一幕。',
    first: '提示板缺了一页。先确认你愿意承担的角色，再从现有线索中选出新的开场。',
    second: '排练中出现第二个意外。导演不会替你决定，而是让你的选择真实改变接下来的台词和走位。',
    finale: '临时改编顺利衔接到终幕。保留最有效的合作方式，并在掌声提示后结束。',
  },
  reality: {
    title: '真人秀挑战',
    setting: '这是一场没有淘汰机制的虚构录制，每个挑战都可降级、跳过或改写。',
    first: '第一张任务卡要求完成一个简短表达挑战。内容和难度由你选，导演只负责计时与提示。',
    second: '第二张任务卡加入剧情反转。你可以迎接挑战、换成合作任务，或直接进入收尾。',
    finale: '录制进入总结镜头。选出最喜欢的一次决定，为这一集写下片尾句。',
  },
};

const RELATIONSHIP_COPY: Record<SceneDirectorRelationship, { title: string; opening: string }> = {
  mentor: { title: '导演与新人', opening: '导演先解释本幕目标，等待你确认后才给出下一条提示。' },
  partners: { title: '默契搭档', opening: '搭档与你共享同一个目标，你们可以随时交换主导权。' },
  rivals: { title: '友好对手', opening: '对手提出一场友好较量；任何一方都可以改规则或退出。' },
  spotlight: { title: '主角试镜', opening: '镜头以你为中心，导演会根据你的表达即时调整剧本。' },
};

const PACING_COPY: Record<SceneDirectorPacing, { title: string; first: string; finale: string }> = {
  slow: { title: '慢热铺垫', first: '先留出一段观察和进入角色的时间。', finale: '终幕保持克制，让情绪自然落地。' },
  balanced: { title: '平衡推进', first: '铺垫结束后进入明确事件。', finale: '终幕回应前面的选择，并完整收束。' },
  cinematic: { title: '戏剧转折', first: '开场很快出现一个计划外事件。', finale: '终幕揭示反转，但不替你决定角色的答案。' },
};

const BRANCH_COPY: Record<SceneDirectorBranchMode, { title: string; direction: string; choices: SceneDirectorChoice[] }> = {
  agency: {
    title: '角色抉择',
    direction: '选择你的角色如何回应。这个决定会写入下一幕，而不是立即发送一条固定指令。',
    choices: [
      { id: 'agency-open', label: '坦率表达真实想法', response: '你选择坦率回应。下一幕将围绕这份态度继续，而不是替你作答。', intensityEffect: 'steady' },
      { id: 'agency-distance', label: '保留一点距离与悬念', response: '你选择暂时保留。下一幕会增加观察与留白，并放慢节奏。', intensityEffect: 'softer' },
      { id: 'agency-lead', label: '主动改变关系走向', response: '你接过了叙事主动权。下一幕将回应你提出的新方向。', intensityEffect: 'stronger' },
    ],
  },
  mystery: {
    title: '线索分岔',
    direction: '当前线索可以从三个方向解释。选择调查方式，下一幕会沿选中的线索继续。',
    choices: [
      { id: 'mystery-follow', label: '跟随最明显的线索', response: '你沿着主要线索继续，下一幕将更快接近答案。', intensityEffect: 'steady' },
      { id: 'mystery-observe', label: '留在原地仔细观察', response: '你选择观察细节。下一幕会降低节奏，并补充遗漏的信息。', intensityEffect: 'softer' },
      { id: 'mystery-reveal', label: '直接揭开隐藏真相', response: '你决定提前揭晓。下一幕将进入反转，并保留再次改向的机会。', intensityEffect: 'stronger' },
    ],
  },
  challenge: {
    title: '挑战选择',
    direction: '选择接下来任务的玩法。跳过或降低难度同样算有效推进。',
    choices: [
      { id: 'challenge-standard', label: '完成标准剧情任务', response: '你接受标准任务。下一幕按当前节奏展开。', intensityEffect: 'steady' },
      { id: 'challenge-coop', label: '改为轻量合作任务', response: '任务改为合作模式，下一幕会减少压力并增加搭档提示。', intensityEffect: 'softer' },
      { id: 'challenge-bonus', label: '加入一个可跳过的反转', response: '导演加入一层可跳过的反转，但仍会在关键处等待你的选择。', intensityEffect: 'stronger' },
    ],
  },
};

const clampMinutes = (value: number): number => {
  if (!Number.isFinite(value)) return 10;
  return Math.max(5, Math.min(20, Math.round(value)));
};

const cleanText = (value: unknown, fallback: string, maxLength: number): string => {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength) || fallback;
};

const stepDuration = (totalSec: number, fraction: number): number => Math.max(15, Math.round(totalSec * fraction));

export const buildLocalSceneDirectorPlan = (options: SceneDirectorPlanOptions): SceneDirectorPlan => {
  const minutes = clampMinutes(options.targetMinutes);
  const totalSec = minutes * 60;
  const theme = THEME_COPY[options.theme];
  const style = STYLE_COPY[options.style];
  const relationshipId = options.relationship || 'mentor';
  const pacingId = options.pacing || 'balanced';
  const branchMode = options.branchMode || 'agency';
  const relationship = RELATIONSHIP_COPY[relationshipId];
  const pacing = PACING_COPY[pacingId];
  const branch = BRANCH_COPY[branchMode];
  const focus = options.focusAreas.filter(Boolean).slice(0, 2).join('、') || '节奏与表达';
  const customPremise = cleanText(options.customPremise, '', 240);
  const synopsis = [theme.setting, `角色关系：${relationship.title}。`, `叙事节奏：${pacing.title}。`, customPremise ? `玩家设定：${customPremise}` : ''].filter(Boolean).join(' ');

  return {
    version: 2,
    title: `${theme.title} · ${relationship.title}`,
    synopsis,
    style: options.style,
    theme: options.theme,
    relationship: relationshipId,
    pacing: pacingId,
    branchMode,
    targetMinutes: minutes,
    steps: [
      {
        id: 'checkin', kind: 'checkin', title: '开拍确认', durationSec: stepDuration(totalSec, 0.06),
        direction: `确认身体状态、安全词和停止按钮。今天重点关注${focus}。`, toyLevel: 'off', emsLevel: 'off', checkpoint: false,
      },
      {
        id: 'warmup', kind: 'warmup', title: '灯光热身', durationSec: stepDuration(totalSec, 0.14),
        direction: `${style.voice} ${relationship.opening} 先完成四轮缓慢呼吸，让身体适应灯光与声音。`, toyLevel: 'low', emsLevel: 'off', checkpoint: false,
      },
      {
        id: 'calibration', kind: 'calibration', title: '节奏校准', durationSec: stepDuration(totalSec, 0.1),
        direction: '短暂体验低等级节奏；如果不合适，立即选择“太强”或暂停。', toyLevel: 'low', emsLevel: 'off', checkpoint: true,
      },
      {
        id: 'scene-one', kind: 'scene', title: '第一幕', durationSec: stepDuration(totalSec, 0.2),
        direction: `${pacing.first} ${theme.first}`, toyLevel: 'medium', emsLevel: 'off', checkpoint: true,
      },
      {
        id: 'branch', kind: 'choice', title: branch.title, durationSec: 0,
        direction: branch.direction, toyLevel: 'off', emsLevel: 'off', checkpoint: false,
        choices: branch.choices,
      },
      {
        id: 'scene-two', kind: 'scene', title: '第二幕', durationSec: stepDuration(totalSec, 0.24),
        direction: theme.second, toyLevel: 'medium', emsLevel: 'low', checkpoint: true,
      },
      {
        id: 'finale', kind: 'finale', title: '可选终幕', durationSec: stepDuration(totalSec, 0.12),
        direction: `${pacing.finale} ${theme.finale}`, toyLevel: 'high', emsLevel: 'medium', checkpoint: true,
      },
      {
        id: 'cooldown', kind: 'cooldown', title: '关机冷却', durationSec: stepDuration(totalSec, 0.1),
        direction: '所有硬件输出归零。放松肩颈、喝水，并确认身体没有持续不适。', toyLevel: 'off', emsLevel: 'off', checkpoint: false,
      },
      {
        id: 'review', kind: 'review', title: '片尾复盘', durationSec: 0,
        direction: '记录最喜欢的片段、需要调整的节奏，以及下次是否保留本次设置。', toyLevel: 'off', emsLevel: 'off', checkpoint: false,
      },
    ],
  };
};

const STEP_KINDS = new Set<SceneDirectorStepKind>(['checkin', 'warmup', 'calibration', 'scene', 'choice', 'finale', 'cooldown', 'review']);
const LEVELS = new Set<SceneDirectorLevel>(['off', 'low', 'medium', 'high']);
const EFFECTS = new Set<SceneDirectorChoice['intensityEffect']>(['softer', 'steady', 'stronger']);

export const normalizeSceneDirectorPlan = (
  value: unknown,
  fallback: SceneDirectorPlan,
): SceneDirectorPlan => {
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Partial<SceneDirectorPlan>;
  if (!Array.isArray(raw.steps) || raw.steps.length < 5 || raw.steps.length > 10) return fallback;

  const steps = raw.steps.flatMap((candidate, index): SceneDirectorStep[] => {
    if (!candidate || typeof candidate !== 'object' || !STEP_KINDS.has(candidate.kind)) return [];
    const candidateRecord = candidate as unknown as Record<string, unknown>;
    if (['strength', 'rate', 'command', 'wave', 'deviceCommand', 'raw'].some((key) => key in candidateRecord)) return [];
    const duration = Number(candidate.durationSec);
    const kind = candidate.kind;
    const choices = kind === 'choice' && Array.isArray(candidate.choices)
      ? candidate.choices.slice(0, 3).flatMap((choice, choiceIndex): SceneDirectorChoice[] => {
          if (!choice || typeof choice !== 'object') return [];
          const effect = EFFECTS.has(choice.intensityEffect) ? choice.intensityEffect : 'steady';
          return [{
            id: `choice-${index}-${choiceIndex}`,
            label: cleanText(choice.label, `选择 ${choiceIndex + 1}`, 80),
            response: cleanText(choice.response, '导演接受了你的选择。', 240),
            intensityEffect: effect,
          }];
        })
      : undefined;
    if (kind === 'choice' && (!choices || choices.length < 2)) return [];
    return [{
      id: `ai-step-${index}`,
      kind,
      title: cleanText(candidate.title, `第 ${index + 1} 幕`, 60),
      direction: cleanText(candidate.direction, '保持舒适节奏，并随时反馈。', 500),
      durationSec: kind === 'choice' || kind === 'review' ? 0 : Math.max(15, Math.min(300, Math.round(Number.isFinite(duration) ? duration : 60))),
      toyLevel: LEVELS.has(candidate.toyLevel) ? candidate.toyLevel : 'off',
      emsLevel: LEVELS.has(candidate.emsLevel) ? candidate.emsLevel : 'off',
      checkpoint: candidate.checkpoint === true,
      choices,
    }];
  });

  if (steps.length !== raw.steps.length) return fallback;
  if (steps[0].kind !== 'checkin' || steps[steps.length - 1].kind !== 'review') return fallback;
  if (!steps.some((step) => step.kind === 'cooldown')) return fallback;
  const totalDuration = steps.reduce((sum, step) => sum + step.durationSec, 0);
  if (totalDuration > fallback.targetMinutes * 60 * 1.15) return fallback;

  return {
    version: 2,
    title: cleanText(raw.title, fallback.title, 100),
    synopsis: cleanText(raw.synopsis, fallback.synopsis, 500),
    style: fallback.style,
    theme: fallback.theme,
    relationship: fallback.relationship,
    pacing: fallback.pacing,
    branchMode: fallback.branchMode,
    targetMinutes: fallback.targetMinutes,
    steps,
  };
};

export const parseSceneDirectorPlanJson = (text: string, fallback: SceneDirectorPlan): SceneDirectorPlan => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return normalizeSceneDirectorPlan(JSON.parse(cleaned), fallback);
  } catch {
    return fallback;
  }
};

export const getSceneDirectorLevelCeiling = (level: SceneDirectorLevel, maximum: number): number => {
  const safeMaximum = Number.isFinite(maximum) ? Math.max(0, maximum) : 0;
  const ratio = level === 'low' ? 0.35 : level === 'medium' ? 0.65 : level === 'high' ? 1 : 0;
  return Math.round(safeMaximum * ratio);
};
