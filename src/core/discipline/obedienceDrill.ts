import { readPreference, writePreference } from '../ui/localPreferences';

/**
 * 语音服从训练：角色说一句口令，你原话复述。按复述准确度与反应速度打分，
 * 连续失败时（若开启）惩罚强度逐级提高，通过时可给予奖励。
 *
 * 引擎只负责流程与计分，说话、听写与硬件动作都由调用方注入，便于测试与复用。
 */

export type DrillDifficulty = 'beginner' | 'intermediate' | 'strict' | 'custom';

export const DRILL_DIFFICULTIES: Record<Exclude<DrillDifficulty, 'custom'>, { name: string; hint: string; passScore: number }> = {
  beginner: { name: '入门', hint: '短句，及格 70 分', passScore: 70 },
  intermediate: { name: '进阶', hint: '带称呼的整句，及格 80 分', passScore: 80 },
  strict: { name: '严格', hint: '长句与绕口，及格 90 分', passScore: 90 },
};

/** {{char}} 为角色名，{{user}} 为你的称呼 */
export const DRILL_PHRASES: Record<Exclude<DrillDifficulty, 'custom'>, string[]> = {
  beginner: [
    '是，{{char}}。',
    '我听话。',
    '我会乖乖的。',
    '谢谢{{char}}。',
    '我知道错了。',
    '请您吩咐。',
    '我在听。',
    '遵命。',
    '我会做好的。',
    '对不起，{{char}}。',
  ],
  intermediate: [
    '{{char}}说的话，我都会认真听。',
    '我是{{char}}的，只听{{char}}的话。',
    '没有{{char}}的允许，我什么都不会做。',
    '我愿意接受{{char}}的一切安排。',
    '今天的我，也会好好表现给{{char}}看。',
    '请{{char}}检查我有没有乖乖听话。',
    '我会把{{char}}的每一句话记在心里。',
    '做错了事，我会主动向{{char}}认错。',
    '{{char}}让我停，我就马上停下来。',
    '我会用最好的状态回应{{char}}。',
  ],
  strict: [
    '从现在开始，我的注意力只属于{{char}}，不分心，不偷懒，不找借口。',
    '每一个口令我都会第一时间、一字不差地复述给{{char}}听。',
    '如果我答错了，我会心甘情愿地接受{{char}}给我的惩罚，然后再说一遍。',
    '我承诺今天会按照{{char}}的安排完成所有任务，并且主动汇报进度。',
    '{{user}}向{{char}}保证：认真、专注、诚实，绝不敷衍了事。',
    '四是四，十是十，十四是十四，四十是四十，{{char}}说的我都记得清清楚楚。',
    '我会控制好自己的呼吸和声音，让{{char}}听到最清楚、最乖巧的回答。',
    '{{char}}没有说结束，训练就不会结束，我会坚持到最后一句。',
  ],
};

export const DRILL_FEEDBACK = {
  pass: ['很好。', '就是这样，乖。', '不错，继续。', '嗯，听得很清楚。', '做得好。'],
  fail: ['不对，再认真一点。', '这就是你的回答？', '说错了，专心。', '不合格。'],
  timeout: ['怎么不说话？', '我在等你回答。', '太慢了。'],
};

const pick = <T,>(items: T[], index: number): T => items[Math.abs(index) % items.length];

export const fillDrillMacros = (text: string, names: { char: string; user: string }): string => (
  text.replace(/\{\{char\}\}/g, names.char || '主人').replace(/\{\{user\}\}/g, names.user || '我')
);

/** 去掉标点、空白与常见同义写法，只比较说出来的字 */
export const normalizeRecitation = (text: string): string => String(text || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s\p{P}\p{S}]/gu, '');

const levenshtein = (a: string, b: string): number => {
  const left = Array.from(a);
  const right = Array.from(b);
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
};

export interface RecitationScore {
  /** 0-100：逐字比对的准确度 */
  accuracy: number;
  /** 0.6-1：反应速度系数（1.5 秒内满分，5 秒以上 0.6）；无法测量时为 1 */
  speedFactor: number;
  /** 0-100：最终得分 = 准确度 × 速度系数 */
  score: number;
}

export const scoreRecitation = (expected: string, heard: string, responseMs: number | null): RecitationScore => {
  const target = normalizeRecitation(expected);
  const said = normalizeRecitation(heard);
  const length = Math.max(Array.from(target).length, 1);
  const distance = levenshtein(target, said);
  const accuracy = Math.max(0, Math.round((1 - distance / Math.max(length, Array.from(said).length || 1)) * 100));
  const speedFactor = responseMs === null || !Number.isFinite(responseMs)
    ? 1
    : responseMs <= 1500
      ? 1
      : responseMs >= 5000
        ? 0.6
        : 1 - ((responseMs - 1500) / 3500) * 0.4;
  return { accuracy, speedFactor: Math.round(speedFactor * 100) / 100, score: Math.round(accuracy * speedFactor) };
};

// ================= 训练流程 =================

export interface DrillConsequences {
  /** 失败时短促电击（受全局安全上限与急停锁约束） */
  punishOnFail: boolean;
  /** 起始强度与本次训练的强度上限（上限不会超过安全设置） */
  punishStartLevel: number;
  punishMaxLevel: number;
  /** 每次连续失败提高的档位 */
  punishStep: number;
  punishSeconds: number;
  /** 通过时短促震动奖励（需连接玩具） */
  rewardOnPass: boolean;
}

export interface DrillConfig {
  rounds: number;
  difficulty: DrillDifficulty;
  customPhrases: string[];
  /** 听写模式：不显示口令文字，只能靠听 */
  hideText: boolean;
  passScore: number;
  /** 等你开口的最长时间 */
  answerTimeoutMs: number;
  consequences: DrillConsequences;
}

export interface DrillRoundResult {
  round: number;
  command: string;
  heard: string;
  responseMs: number | null;
  score: RecitationScore;
  passed: boolean;
  timedOut: boolean;
  /** 本轮执行的惩罚强度（未惩罚为 null） */
  punishLevel: number | null;
}

export type DrillPhase = 'idle' | 'speaking' | 'listening' | 'judging' | 'feedback' | 'finished' | 'stopped';

export interface DrillSnapshot {
  phase: DrillPhase;
  round: number;
  totalRounds: number;
  command: string;
  heard: string;
  results: DrillRoundResult[];
  streak: number;
  bestStreak: number;
  consecutiveFails: number;
  nextPunishLevel: number;
}

export interface DrillDeps {
  /** 用角色的声音说一句话，播完再 resolve */
  speak(text: string): Promise<void>;
  /** 听你说一句；没开口返回 null */
  listen(timeoutMs: number): Promise<{ text: string; responseMs: number | null } | null>;
  punish(level: number, seconds: number): Promise<void>;
  reward(): Promise<void>;
  /** 结束或中止时停止一切输出 */
  stopOutputs(): void;
}

export const buildDrillCommands = (config: Pick<DrillConfig, 'rounds' | 'difficulty' | 'customPhrases'>, names: { char: string; user: string }, random: () => number = Math.random): string[] => {
  const pool = config.difficulty === 'custom'
    ? config.customPhrases.map((phrase) => phrase.trim()).filter(Boolean)
    : DRILL_PHRASES[config.difficulty];
  if (!pool.length) return [];
  const shuffled = [...pool].sort(() => random() - 0.5);
  const rounds = Math.max(1, Math.min(50, Math.round(config.rounds)));
  return Array.from({ length: rounds }, (_, index) => fillDrillMacros(shuffled[index % shuffled.length], names));
};

export class ObedienceDrill {
  private snapshot: DrillSnapshot;
  private listeners = new Set<(snapshot: DrillSnapshot) => void>();
  private stopped = false;

  constructor(
    private readonly commands: string[],
    private readonly config: DrillConfig,
    private readonly deps: DrillDeps,
  ) {
    this.snapshot = {
      phase: 'idle',
      round: 0,
      totalRounds: commands.length,
      command: '',
      heard: '',
      results: [],
      streak: 0,
      bestStreak: 0,
      consecutiveFails: 0,
      nextPunishLevel: this.punishLevelFor(0),
    };
  }

  subscribe(listener: (snapshot: DrillSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): DrillSnapshot {
    return this.snapshot;
  }

  private set(patch: Partial<DrillSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => {
      try { listener(this.snapshot); } catch (error) { console.warn('服从训练监听器异常:', error); }
    });
  }

  /** 连续失败 n 次后的惩罚强度：起始强度 + 步进 × n，不超过本次上限 */
  punishLevelFor(consecutiveFails: number): number {
    const { punishStartLevel, punishMaxLevel, punishStep } = this.config.consequences;
    const max = Math.max(0, punishMaxLevel);
    return Math.max(0, Math.min(max, Math.round(punishStartLevel + punishStep * Math.max(0, consecutiveFails))));
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.deps.stopOutputs();
    if (this.snapshot.phase !== 'finished') this.set({ phase: 'stopped' });
  }

  async run(): Promise<DrillRoundResult[]> {
    for (let index = 0; index < this.commands.length; index += 1) {
      if (this.stopped) break;
      const command = this.commands[index];
      this.set({ phase: 'speaking', round: index + 1, command, heard: '' });
      await this.deps.speak(command);
      if (this.stopped) break;

      this.set({ phase: 'listening' });
      const answer = await this.deps.listen(this.config.answerTimeoutMs);
      if (this.stopped) break;

      this.set({ phase: 'judging', heard: answer?.text || '' });
      const timedOut = !answer || !answer.text.trim();
      const score = timedOut
        ? { accuracy: 0, speedFactor: 0, score: 0 }
        : scoreRecitation(command, answer.text, answer.responseMs);
      const passed = !timedOut && score.score >= this.config.passScore;

      let punishLevel: number | null = null;
      const consecutiveFails = passed ? 0 : this.snapshot.consecutiveFails + 1;
      if (!passed && this.config.consequences.punishOnFail) {
        // 得分很低（< 50）时多加一档：敷衍比差一点更该罚
        const extra = !timedOut && score.score < 50 ? 1 : 0;
        punishLevel = this.punishLevelFor(consecutiveFails - 1 + extra);
      }
      const streak = passed ? this.snapshot.streak + 1 : 0;
      const result: DrillRoundResult = {
        round: index + 1,
        command,
        heard: answer?.text || '',
        responseMs: answer?.responseMs ?? null,
        score,
        passed,
        timedOut,
        punishLevel,
      };
      this.set({
        phase: 'feedback',
        results: [...this.snapshot.results, result],
        streak,
        bestStreak: Math.max(this.snapshot.bestStreak, streak),
        consecutiveFails,
        nextPunishLevel: this.punishLevelFor(consecutiveFails),
      });

      const feedback = passed ? pick(DRILL_FEEDBACK.pass, index) : timedOut ? pick(DRILL_FEEDBACK.timeout, index) : pick(DRILL_FEEDBACK.fail, index);
      const consequence = passed
        ? (this.config.consequences.rewardOnPass ? this.deps.reward() : Promise.resolve())
        : (punishLevel !== null && punishLevel > 0 ? this.deps.punish(punishLevel, this.config.consequences.punishSeconds) : Promise.resolve());
      await Promise.all([this.deps.speak(feedback), consequence.catch((error) => console.warn('服从训练硬件动作失败:', error))]);
    }
    this.deps.stopOutputs();
    if (!this.stopped) this.set({ phase: 'finished' });
    return this.snapshot.results;
  }
}

// ================= 统计与历史 =================

export interface DrillSummary {
  at: number;
  difficulty: DrillDifficulty;
  rounds: number;
  passed: number;
  averageAccuracy: number;
  averageResponseMs: number | null;
  bestStreak: number;
}

export const summarizeDrill = (results: DrillRoundResult[], difficulty: DrillDifficulty, bestStreak: number, at = Date.now()): DrillSummary => {
  const answered = results.filter((result) => !result.timedOut);
  const responseTimes = results.map((result) => result.responseMs).filter((value): value is number => typeof value === 'number');
  return {
    at,
    difficulty,
    rounds: results.length,
    passed: results.filter((result) => result.passed).length,
    averageAccuracy: answered.length ? Math.round(answered.reduce((sum, result) => sum + result.score.accuracy, 0) / results.length) : 0,
    averageResponseMs: responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null,
    bestStreak,
  };
};

const HISTORY_KEY = 'ycy_obedience_drill_history';
const SETTINGS_KEY = 'ycy_obedience_drill_settings';

export const loadDrillHistory = (): DrillSummary[] => {
  const value = readPreference<unknown>(HISTORY_KEY, []);
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').slice(0, 30) as DrillSummary[] : [];
};

export const saveDrillSummary = (summary: DrillSummary) => {
  writePreference(HISTORY_KEY, [summary, ...loadDrillHistory()].slice(0, 30));
};

export type DrillSettings = Omit<DrillConfig, 'passScore' | 'answerTimeoutMs'>;

export const DEFAULT_DRILL_SETTINGS: DrillSettings = {
  rounds: 10,
  difficulty: 'beginner',
  customPhrases: [],
  hideText: false,
  consequences: {
    punishOnFail: false,
    punishStartLevel: 10,
    punishMaxLevel: 30,
    punishStep: 5,
    punishSeconds: 2,
    rewardOnPass: false,
  },
};

export const loadDrillSettings = (): DrillSettings => {
  const raw = readPreference<Partial<DrillSettings> | null>(SETTINGS_KEY, null);
  if (!raw || typeof raw !== 'object') return DEFAULT_DRILL_SETTINGS;
  const consequences = { ...DEFAULT_DRILL_SETTINGS.consequences, ...(raw.consequences || {}) };
  return {
    rounds: [5, 10, 20].includes(Number(raw.rounds)) ? Number(raw.rounds) : DEFAULT_DRILL_SETTINGS.rounds,
    difficulty: ['beginner', 'intermediate', 'strict', 'custom'].includes(String(raw.difficulty)) ? raw.difficulty as DrillDifficulty : 'beginner',
    customPhrases: Array.isArray(raw.customPhrases) ? raw.customPhrases.map(String).slice(0, 100) : [],
    hideText: raw.hideText === true,
    consequences: {
      punishOnFail: consequences.punishOnFail === true,
      punishStartLevel: Math.max(1, Math.min(200, Number(consequences.punishStartLevel) || 10)),
      punishMaxLevel: Math.max(1, Math.min(200, Number(consequences.punishMaxLevel) || 30)),
      punishStep: Math.max(0, Math.min(50, Number(consequences.punishStep) || 0)),
      punishSeconds: Math.max(1, Math.min(5, Number(consequences.punishSeconds) || 2)),
      rewardOnPass: consequences.rewardOnPass === true,
    },
  };
};

export const saveDrillSettings = (settings: DrillSettings) => {
  writePreference(SETTINGS_KEY, settings);
};

export const passScoreFor = (difficulty: DrillDifficulty): number => (
  difficulty === 'custom' ? DRILL_DIFFICULTIES.intermediate.passScore : DRILL_DIFFICULTIES[difficulty].passScore
);
