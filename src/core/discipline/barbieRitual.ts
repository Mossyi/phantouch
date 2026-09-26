import { YoloVisionResult } from '../vision/yoloVisionMessage';

export type BarbieDailyRitualTaskId = 'kowtow' | 'voice' | 'obedience';

export interface BarbieDailyRitualTask {
  id: BarbieDailyRitualTaskId;
  title: string;
  description: string;
  sensor: 'yolo' | 'microphone';
}

export const BARBIE_DAILY_RITUAL_TASKS: BarbieDailyRitualTask[] = [
  {
    id: 'kowtow',
    title: '三次俯身礼',
    description: '连接已配置的 YOLO 服务器，识别三次独立的 kowtow 姿态。',
    sensor: 'yolo',
  },
  {
    id: 'voice',
    title: '连续发声仪式',
    description: '仅在本机分析音量，校准环境噪声后连续清晰发声 3 秒。',
    sensor: 'microphone',
  },
  {
    id: 'obedience',
    title: '三段姿态口令',
    description: '按顺序完成跪姿、举手和四足姿态，由 YOLO 逐项确认。',
    sensor: 'yolo',
  },
];

const TASK_IDS = new Set<BarbieDailyRitualTaskId>(BARBIE_DAILY_RITUAL_TASKS.map((task) => task.id));

export const getBarbieRitualDayKey = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const createBarbieRitualCompletionRecord = (
  taskId: BarbieDailyRitualTaskId,
  date: Date = new Date(),
): string => `daily:${getBarbieRitualDayKey(date)}:${taskId}`;

export const getCompletedBarbieRitualTaskIds = (
  records: unknown,
  date: Date = new Date(),
): BarbieDailyRitualTaskId[] => {
  if (!Array.isArray(records)) return [];
  const prefix = `daily:${getBarbieRitualDayKey(date)}:`;
  const completed = new Set<BarbieDailyRitualTaskId>();
  for (const record of records) {
    if (typeof record !== 'string' || !record.startsWith(prefix)) continue;
    const taskId = record.slice(prefix.length) as BarbieDailyRitualTaskId;
    if (TASK_IDS.has(taskId)) completed.add(taskId);
  }
  return [...completed];
};

export const calculateAudioRms = (samples: Uint8Array): number => {
  if (samples.length === 0) return 0;
  let squareSum = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    squareSum += centered * centered;
  }
  const rms = Math.sqrt(squareSum / samples.length);
  return Number.isFinite(rms) ? Math.max(0, Math.min(1, rms)) : 0;
};

export const matchesBarbieRitualPose = (
  result: YoloVisionResult | null,
  expectedPose: string,
  minimumConfidence: number = 0.7,
): boolean => Boolean(
  result
  && result.pose === expectedPose
  && result.confidence >= Math.max(0, Math.min(1, minimumConfidence)),
);
