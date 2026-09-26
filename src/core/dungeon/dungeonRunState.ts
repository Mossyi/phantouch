import { DungeonChoice, DungeonEndingType, DungeonRunState, DungeonScript } from '../../types';

export const DEFAULT_DUNGEON_RUN_STATE: DungeonRunState = {
  resolve: 0,
  submission: 0,
  trust: 0,
  risk: 0,
  turns: 0,
  aiChapters: 0,
  routeTags: [],
};

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export const normalizeDungeonRunState = (value: unknown): DungeonRunState => {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<DungeonRunState>
    : {};
  const score = (candidate: unknown) => {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? clampScore(parsed) : 0;
  };
  const counter = (candidate: unknown) => {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1_000_000, Math.round(parsed))) : 0;
  };
  return {
    resolve: score(raw.resolve),
    submission: score(raw.submission),
    trust: score(raw.trust),
    risk: score(raw.risk),
    turns: counter(raw.turns),
    aiChapters: counter(raw.aiChapters),
    routeTags: Array.isArray(raw.routeTags)
      ? [...new Set(raw.routeTags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.slice(0, 50)))].slice(-20)
      : [],
  };
};

export const applyDungeonChoice = (state: DungeonRunState, choice: DungeonChoice): DungeonRunState => {
  const next = normalizeDungeonRunState(state);
  const hardwareRisk = choice.hardwareAction && choice.hardwareAction.type !== 'stop' ? 2 : 0;
  const tag = choice.attitude;
  if (choice.attitude === 'submissive') {
    next.submission += 13;
    next.trust += 4;
  } else if (choice.attitude === 'defiant') {
    next.resolve += 13;
    next.risk += 7;
  } else if (choice.attitude === 'begging') {
    next.submission += 6;
    next.trust += 9;
    next.risk = Math.max(0, next.risk - 3);
  } else {
    next.resolve += 3;
    next.trust += 10;
    next.risk = Math.max(0, next.risk - 2);
  }
  next.risk += hardwareRisk;
  next.turns += 1;
  next.routeTags = [...next.routeTags, tag].slice(-20);
  return normalizeDungeonRunState(next);
};

export const incrementDungeonAiChapter = (state: DungeonRunState): DungeonRunState => normalizeDungeonRunState({
  ...state,
  aiChapters: state.aiChapters + 1,
});

export const getDungeonEndingType = (state: DungeonRunState): DungeonEndingType => {
  const normalized = normalizeDungeonRunState(state);
  if (normalized.trust >= 36 && Math.abs(normalized.resolve - normalized.submission) <= 18) return 'released';
  if (normalized.resolve >= normalized.submission + 10) return 'conquer';
  if (normalized.submission >= normalized.resolve + 10) return 'surrender';
  return normalized.risk >= 22 ? 'punished' : 'released';
};

const ENDING_LABELS: Record<DungeonEndingType, { icon: string; label: string; description: string }> = {
  surrender: { icon: '🌙', label: '沉浸归顺', description: '你沿着顺从路线走到终点，与地牢中的主导者达成了新的关系契约。' },
  conquer: { icon: '⚔️', label: '意志破局', description: '你保持清醒与意志，在最终关口夺回了路线的主动权。' },
  punished: { icon: '🔥', label: '风险反噬', description: '连续的冒险选择让局势失控，你付出代价后被迫结束了本次探索。' },
  released: { icon: '🕊️', label: '协商离场', description: '信任与协商改变了关系走向，你以双方都能接受的方式离开了地牢。' },
};

export const buildDungeonEnding = (script: DungeonScript, state: DungeonRunState, preferred?: DungeonEndingType) => {
  const type = preferred || getDungeonEndingType(state);
  const template = ENDING_LABELS[type];
  return {
    type,
    title: `${template.icon} 结局：${script.title} · ${template.label}`,
    desc: template.description,
  };
};

export const getPlayableDungeonChoices = (choices: DungeonChoice[]): DungeonChoice[] => {
  if (!Array.isArray(choices) || choices.length === 0) {
    return [{
      id: 'fallback_ending',
      text: '剧情已达终点，进入结算。',
      attitude: 'neutral',
      nextStepId: 'ending',
      replyDialogue: '前路已尽，你在地牢中的旅程在此告一段落。',
    }];
  }
  if (choices.length !== 1 || choices[0].nextStepId === 'ending') return choices;
  const primary = choices[0];
  return [
    primary,
    {
      ...primary,
      id: `${primary.id}__defiant`,
      text: '保持自我，拒绝被动接受并寻找突破口。',
      attitude: 'defiant',
      replyDialogue: '你选择保留自己的意志，局势因此出现了新的张力。',
      hardwareAction: undefined,
    },
    {
      ...primary,
      id: `${primary.id}__negotiate`,
      text: '先观察局势，与对方协商下一步的条件。',
      attitude: 'neutral',
      replyDialogue: '你的克制与协商让对方重新评估了接下来的安排。',
      hardwareAction: undefined,
    },
  ];
};

export const describeDungeonRoute = (state: DungeonRunState) => (
  `意志 ${state.resolve} · 服从 ${state.submission} · 信任 ${state.trust} · 风险 ${state.risk} · ${state.turns} 次选择`
);
