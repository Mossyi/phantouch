/**
 * 通话提示音（Web Audio 实时合成，不依赖音频文件）。
 * - 回铃音：国内电话的 450Hz「嘟——」，响 1 秒停 4 秒
 * - 来电铃声：两个音高交替的短促铃声
 * - 挂断音：三声短促的忙音
 */

type ToneStop = () => void;

const createContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return null;
  try {
    const context: AudioContext = new AudioContextCtor();
    void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
};

const beep = (context: AudioContext, frequency: number, start: number, duration: number, volume = 0.18) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
};

const loop = (pattern: (context: AudioContext, start: number) => void, periodSec: number): ToneStop => {
  const context = createContext();
  if (!context) return () => undefined;
  let stopped = false;
  let next = context.currentTime + 0.05;
  const schedule = () => {
    if (stopped) return;
    while (next < context.currentTime + periodSec * 1.5) {
      pattern(context, next);
      next += periodSec;
    }
  };
  schedule();
  const timer = setInterval(schedule, 500);
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    void context.close().catch(() => undefined);
  };
};

export const playRingback = (): ToneStop => loop((context, start) => beep(context, 450, start, 1, 0.12), 5);

export const playRingtone = (): ToneStop => loop((context, start) => {
  for (let index = 0; index < 4; index += 1) {
    beep(context, index % 2 === 0 ? 880 : 660, start + index * 0.18, 0.16, 0.16);
  }
  for (let index = 0; index < 4; index += 1) {
    beep(context, index % 2 === 0 ? 880 : 660, start + 1 + index * 0.18, 0.16, 0.16);
  }
}, 3);

export const playHangupTone = (): void => {
  const context = createContext();
  if (!context) return;
  const start = context.currentTime + 0.02;
  for (let index = 0; index < 3; index += 1) beep(context, 450, start + index * 0.5, 0.3, 0.12);
  setTimeout(() => void context.close().catch(() => undefined), 2000);
};
