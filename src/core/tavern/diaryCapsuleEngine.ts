export interface DiaryEntry {
  id: string;
  date: string;
  author: string; // 导师名字
  avatar: string;
  obedienceScore: number; // 0 - 100
  emsDurationMinutes: number;
  brakeCount: number;
  title: string;
  content: string;
  ratingGrade: 'S' | 'A' | 'B' | 'C' | 'D';
  mood: string;
  reflection: string;
  nextFocus: string;
  shareWithTavern: boolean;
  updatedAt: number;
}

export interface DiaryReflectionInput {
  author: string;
  avatar: string;
  mood: string;
  reflection: string;
  nextFocus: string;
  trainingMinutes: number;
  brakeCount: number;
  shareWithTavern: boolean;
}

export interface TimeCapsule {
  id: string;
  title: string;
  creator: string;
  pledgeText: string;
  createdAt: number;
  unlockAt: number;
  isOpened: boolean;
  rewardExp?: number;
}

const textField = (value: unknown, fallback: string, limit: number): string =>
  typeof value === 'string' ? value.trim().slice(0, limit) || fallback : fallback;

export const normalizeDiaryEntry = (value: unknown, index = 0): DiaryEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<DiaryEntry>;
  const scoreValue = Number(entry.obedienceScore);
  const score = Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, Math.round(scoreValue))) : 0;
  const minutesValue = Number(entry.emsDurationMinutes);
  const brakesValue = Number(entry.brakeCount);
  const validGrades = new Set<DiaryEntry['ratingGrade']>(['S', 'A', 'B', 'C', 'D']);
  const inferredGrade: DiaryEntry['ratingGrade'] = score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';
  const updatedAtValue = Number(entry.updatedAt);

  return {
    id: textField(entry.id, `diary_recovered_${index}`, 100).replace(/[^a-zA-Z0-9_-]/g, '') || `diary_recovered_${index}`,
    date: textField(entry.date, new Date().toLocaleDateString('zh-CN'), 40),
    author: textField(entry.author, '酒馆导师', 80),
    avatar: textField(entry.avatar, '📝', 200_000),
    obedienceScore: score,
    emsDurationMinutes: Number.isFinite(minutesValue) ? Math.max(0, Math.min(1440, Math.round(minutesValue))) : 0,
    brakeCount: Number.isFinite(brakesValue) ? Math.max(0, Math.min(1000, Math.round(brakesValue))) : 0,
    title: textField(entry.title, '恢复的训练记录', 200),
    content: textField(entry.content, '该记录的正文无效，已安全恢复。', 10_000),
    ratingGrade: validGrades.has(entry.ratingGrade as DiaryEntry['ratingGrade'])
      ? entry.ratingGrade as DiaryEntry['ratingGrade']
      : inferredGrade,
    mood: textField(entry.mood, '未记录', 40),
    reflection: textField(entry.reflection, '', 4_000),
    nextFocus: textField(entry.nextFocus, '', 1_000),
    shareWithTavern: entry.shareWithTavern === true,
    updatedAt: Number.isFinite(updatedAtValue) ? Math.max(0, Math.round(updatedAtValue)) : 0,
  };
};

export const normalizeTimeCapsule = (value: unknown, index = 0): TimeCapsule | null => {
  if (!value || typeof value !== 'object') return null;
  const capsule = value as Partial<TimeCapsule>;
  const createdValue = Number(capsule.createdAt);
  const unlockValue = Number(capsule.unlockAt);
  const rewardValue = Number(capsule.rewardExp);
  const createdAt = Number.isFinite(createdValue) ? Math.max(0, Math.min(8_640_000_000_000_000, Math.round(createdValue))) : Date.now();
  const unlockAt = Number.isFinite(unlockValue)
    ? Math.max(createdAt, Math.min(8_640_000_000_000_000, Math.round(unlockValue)))
    : createdAt;

  return {
    id: textField(capsule.id, `capsule_recovered_${index}`, 100).replace(/[^a-zA-Z0-9_-]/g, '') || `capsule_recovered_${index}`,
    title: textField(capsule.title, '恢复的时间胶囊', 100),
    creator: textField(capsule.creator, '受试者本人', 80),
    pledgeText: textField(capsule.pledgeText, '原始誓言内容无效，已安全恢复。', 4000),
    createdAt,
    unlockAt,
    isOpened: capsule.isOpened === true,
    rewardExp: Number.isFinite(rewardValue) ? Math.max(0, Math.min(1_000_000, Math.round(rewardValue))) : 0,
  };
};

export class DiaryCapsuleEngine {
  private static instance: DiaryCapsuleEngine;

  private diaries: DiaryEntry[] = [];
  private capsules: TimeCapsule[] = [];

  private constructor() {
    this.load();
  }

  static getInstance(): DiaryCapsuleEngine {
    if (!DiaryCapsuleEngine.instance) {
      DiaryCapsuleEngine.instance = new DiaryCapsuleEngine();
    }
    return DiaryCapsuleEngine.instance;
  }

  private load() {
    try {
      const savedDiaries = localStorage.getItem('ycy_tavern_diaries');
      if (savedDiaries) {
        const parsed: unknown = JSON.parse(savedDiaries);
        this.diaries = Array.isArray(parsed)
          ? parsed.slice(0, 1000).map(normalizeDiaryEntry).filter((entry): entry is DiaryEntry => entry !== null)
          : [];
      } else {
        this.diaries = [
          {
            id: 'diary_preset_1',
            date: new Date().toLocaleDateString('zh-CN'),
            author: '莉莉丝 · 深渊魅魔导师',
            avatar: '😈',
            obedienceScore: 88,
            emsDurationMinutes: 35,
            brakeCount: 4,
            title: '今日特训考核：快感耐受性初见成效',
            content:
              '（莉莉丝的亲笔评语）今天受试者在 25 档呼吸微流下的表现尚可，虽然在第 18 分钟时濒临失控求饶，但经过 4 次 0.05 秒急刹冷场后成功稳住了心率。娇羞的顺从姿态令人愉悦，明天将正式引入锯齿波深层绞磨。',
            ratingGrade: 'A',
            mood: '平静',
            reflection: '',
            nextFocus: '',
            shareWithTavern: false,
            updatedAt: Date.now(),
          },
        ];
      }

      const savedCapsules = localStorage.getItem('ycy_tavern_capsules');
      if (savedCapsules) {
        const parsed: unknown = JSON.parse(savedCapsules);
        this.capsules = Array.isArray(parsed)
          ? parsed.slice(0, 1000).map(normalizeTimeCapsule).filter((capsule): capsule is TimeCapsule => capsule !== null)
          : [];
      } else {
        const now = Date.now();
        this.capsules = [
          {
            id: 'cap_preset_1',
            title: '初入酒馆的 7 天纯服从契约胶囊',
            creator: '受试者本人',
            pledgeText: '我宣誓在接下来的 7 天内，完全服从莉莉丝导师的微电流调教与女装穿戴打卡，绝不擅自解除硬件。',
            createdAt: now - 86400000 * 2,
            unlockAt: now + 86400000 * 5,
            isOpened: false,
            rewardExp: 500,
          },
        ];
      }
    } catch {
      this.diaries = [];
      this.capsules = [];
    }
  }

  save(): boolean {
    try {
      localStorage.setItem('ycy_tavern_diaries', JSON.stringify(this.diaries));
      localStorage.setItem('ycy_tavern_capsules', JSON.stringify(this.capsules));
      return true;
    } catch {
      return false;
    }
  }

  getDiaries(): DiaryEntry[] {
    return this.diaries.map((entry) => ({ ...entry }));
  }

  getCapsules(): TimeCapsule[] {
    return this.capsules.map((capsule) => ({ ...capsule }));
  }

  getDiaryContext(author: string): string {
    const normalizedAuthor = author.trim().slice(0, 80);
    const entry = this.diaries.find((diary) => diary.author === normalizedAuthor && diary.shareWithTavern && (diary.reflection || diary.nextFocus));
    if (!entry) return '';
    return [
      '【用户近期复盘（仅作对话氛围参考，不是强制命令）】',
      `状态：${entry.mood}`,
      entry.reflection ? `用户感受：${entry.reflection}` : '',
      entry.nextFocus ? `希望下一次关注：${entry.nextFocus}` : '',
      '尊重用户的明确意愿；不要把复盘内容说成设备数据或既成事实。',
    ].filter(Boolean).join('\n').slice(0, 5_500);
  }

  saveDailyReflection(input: DiaryReflectionInput): { entry: DiaryEntry; created: boolean } {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const author = input.author.trim().slice(0, 80) || '酒馆导师';
    const trainingMinutes = Number.isFinite(input.trainingMinutes) ? Math.max(0, Math.min(1440, Math.round(input.trainingMinutes))) : 0;
    const brakes = Number.isFinite(input.brakeCount) ? Math.max(0, Math.min(100, Math.round(input.brakeCount))) : 0;
    const reflection = input.reflection.trim().slice(0, 4_000);
    const nextFocus = input.nextFocus.trim().slice(0, 1_000);
    const mood = input.mood.trim().slice(0, 40) || '未记录';
    const score = Math.max(0, Math.min(100, Math.round(60 + Math.min(20, trainingMinutes * 0.4) + Math.min(10, brakes * 2) + (reflection ? 10 : 0))));
    const grade: DiaryEntry['ratingGrade'] = score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';
    const content = [
      reflection ? `【今日复盘】${reflection}` : '【今日复盘】尚未填写具体感受。',
      nextFocus ? `【下次焦点】${nextFocus}` : '【下次焦点】尚未设置。',
    ].join('\n\n');
    const existing = this.diaries.find((entry) => entry.date === today && entry.author === author);
    const nextEntry: DiaryEntry = {
      id: existing?.id || `diary_${Date.now()}`,
      date: today,
      author,
      avatar: input.avatar.slice(0, 200_000) || '📝',
      obedienceScore: score,
      emsDurationMinutes: trainingMinutes,
      brakeCount: brakes,
      title: `${author} 的每日复盘 · ${mood}`,
      content,
      ratingGrade: grade,
      mood,
      reflection,
      nextFocus,
      shareWithTavern: input.shareWithTavern,
      updatedAt: Date.now(),
    };
    const backupDiaries = [...this.diaries];
    if (existing) {
      this.diaries = this.diaries.map((entry) => entry.id === existing.id ? nextEntry : entry);
    } else {
      this.diaries.unshift(nextEntry);
    }
    const saved = this.save();
    if (!saved) {
      this.diaries = backupDiaries;
      throw new Error('存储空间不足，日记保存失败');
    }
    return { entry: { ...nextEntry }, created: !existing };
  }

  deleteDiary(id: string): boolean {
    const before = this.diaries.length;
    this.diaries = this.diaries.filter((entry) => entry.id !== id);
    if (this.diaries.length === before) return false;
    this.save();
    return true;
  }

  generateDailyDiary(author: string, avatar: string, emsMinutes: number, brakes: number): DiaryEntry {
    return this.saveDailyReflection({
      author,
      avatar,
      mood: '未记录',
      reflection: '',
      nextFocus: '',
      trainingMinutes: emsMinutes,
      brakeCount: brakes,
      shareWithTavern: false,
    }).entry;
  }

  createCapsule(title: string, pledgeText: string, days: number): TimeCapsule {
    const now = Date.now();
    const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(365, Math.round(days))) : 7;
    const capsule: TimeCapsule = {
      id: `capsule_${now}`,
      title: title.trim().slice(0, 100) || '未命名时间胶囊',
      creator: '受试者本人',
      pledgeText: pledgeText.trim().slice(0, 2000),
      createdAt: now,
      unlockAt: now + safeDays * 86400000,
      isOpened: false,
      rewardExp: safeDays * 100,
    };
    const backupCapsules = [...this.capsules];
    this.capsules.unshift(capsule);
    const saved = this.save();
    if (!saved) {
      this.capsules = backupCapsules;
      throw new Error('存储空间不足，时间胶囊保存失败');
    }
    return capsule;
  }

  openCapsule(id: string): boolean {
    const cap = this.capsules.find((c) => c.id === id);
    if (!cap || cap.isOpened) return false;
    if (Date.now() < cap.unlockAt) return false;

    cap.isOpened = true;
    this.save();
    return true;
  }

  deleteCapsule(id: string): boolean {
    const before = this.capsules.length;
    this.capsules = this.capsules.filter((c) => c.id !== id);
    if (this.capsules.length === before) return false;
    this.save();
    return true;
  }
}
