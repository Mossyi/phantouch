export type PitchRangeCategory = 'deep_male' | 'male' | 'androgynous' | 'fem_soft' | 'fem_sweet' | 'ultra_high';

export interface PitchData {
  frequency: number; // 当前音高 Hz
  noteName: string;   // 音符名 (如 C4, A4)
  clarity: number;    // 信号清晰度 (0~1)
  category: PitchRangeCategory;
  targetHit: boolean; // 是否达到目标女性频段 (200Hz+)
}

export type PitchListener = (data: PitchData) => void;

/**
 * 役次元 声音女性化音高实时分析与追踪引擎 (Web Audio API + 自相关算法)
 */
export class PitchTracker {
  private static instance: PitchTracker;

  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastAnalysisAt: number = 0;
  private listeners: Set<PitchListener> = new Set();
  private startGeneration = 0;

  private targetMinHz: number = 190;
  private targetMaxHz: number = 260;

  private constructor() {}

  static getInstance(): PitchTracker {
    if (!PitchTracker.instance) {
      PitchTracker.instance = new PitchTracker();
    }
    return PitchTracker.instance;
  }

  subscribe(listener: PitchListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(data: PitchData) {
    this.listeners.forEach((listener) => {
      try { listener(data); } catch (error) { console.warn('音高监听器执行失败:', error); }
    });
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  setTargetRange(min: number, max: number) {
    const safeMin = Number.isFinite(min) ? Math.max(60, Math.min(600, min)) : 190;
    const safeMax = Number.isFinite(max) ? Math.max(60, Math.min(600, max)) : 260;
    this.targetMinHz = Math.min(safeMin, safeMax);
    this.targetMaxHz = Math.max(safeMin, safeMax);
  }

  async start(): Promise<boolean> {
    if (this.isRunning) return true;

    const generation = ++this.startGeneration;
    let pendingStream: MediaStream | null = null;
    let pendingContext: AudioContext | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      pendingStream = stream;
      if (generation !== this.startGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      pendingContext = context;
      if (context.state === 'suspended') {
        await context.resume();
      }
      if (generation !== this.startGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        await context.close().catch(() => undefined);
        return false;
      }
      const source = context.createMediaStreamSource(stream);

      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      this.micStream = stream;
      this.audioCtx = context;
      this.analyser = analyser;
      pendingStream = null;
      pendingContext = null;
      this.isRunning = true;
      this.processAudio();
      return true;
    } catch (err) {
      pendingStream?.getTracks().forEach((track) => track.stop());
      if (pendingContext && pendingContext.state !== 'closed') {
        await pendingContext.close().catch(() => undefined);
      }
      console.error('启动麦克风音高分析失败:', err);
      return false;
    }
  }

  stop() {
    this.startGeneration++;
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    const context = this.audioCtx;
    this.audioCtx = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }
    this.analyser = null;
  }

  private processAudio() {
    if (!this.isRunning || !this.analyser || !this.audioCtx) return;

    const now = performance.now();
    if (now - this.lastAnalysisAt < 80) {
      this.animationFrameId = requestAnimationFrame(() => this.processAudio());
      return;
    }
    this.lastAnalysisAt = now;

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);

    const { pitch, clarity } = this.autoCorrelate(buffer, this.audioCtx.sampleRate);

    if (pitch > 0 && clarity > 0.7) {
      const category = this.categorizePitch(pitch);
      const noteName = this.frequencyToNote(pitch);
      const targetHit = pitch >= this.targetMinHz && pitch <= this.targetMaxHz;

      this.notify({
        frequency: Math.round(pitch),
        noteName,
        clarity,
        category,
        targetHit,
      });
    } else {
      this.notify({ frequency: 0, noteName: '--', clarity: 0, category: 'deep_male', targetHit: false });
    }

    this.animationFrameId = requestAnimationFrame(() => this.processAudio());
  }

  /**
   * 自相关基频提取算法 (Autocorrelation F0 Detection)
   */
  private autoCorrelate(buf: Float32Array, sampleRate: number): { pitch: number; clarity: number } {
    const size = buf.length;
    let rms = 0;

    for (let i = 0; i < size; i++) {
      const val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / size);

    if (rms < 0.015) {
      return { pitch: -1, clarity: 0 }; // 音量过小，判定为静音
    }

    // 裁剪边界
    let r1 = 0;
    let r2 = size - 1;
    const thres = 0.2;
    for (let i = 0; i < size / 2; i++) {
      if (Math.abs(buf[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < size / 2; i++) {
      if (Math.abs(buf[size - i]) < thres) {
        r2 = size - i;
        break;
      }
    }

    const trimmed = buf.slice(r1, r2);
    if (trimmed.length < 3) return { pitch: -1, clarity: 0 };
    const c = new Float32Array(trimmed.length);

    for (let i = 0; i < trimmed.length; i++) {
      for (let j = 0; j < trimmed.length - i; j++) {
        c[i] = c[i] + trimmed[j] * trimmed[j + i];
      }
    }

    let d = 0;
    while (d < c.length - 2 && c[d] > c[d + 1]) d++;
    let maxval = -1;
    let maxpos = -1;
    for (let i = d; i < trimmed.length; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;
    const clarity = c[0] > 0 ? maxval / c[0] : 0;

    // 抛物线插值细化
    if (T0 > 0 && T0 < trimmed.length - 1) {
      const x1 = c[T0 - 1];
      const x2 = c[T0];
      const x3 = c[T0 + 1];
      const a = (x1 + x3 - 2 * x2) / 2;
      const b = (x3 - x1) / 2;
      if (a) T0 = T0 - b / (2 * a);
    }

    const pitch = sampleRate / T0;
    if (pitch >= 60 && pitch <= 600) {
      return { pitch, clarity };
    }
    return { pitch: -1, clarity: 0 };
  }

  private categorizePitch(hz: number): PitchRangeCategory {
    if (hz < 130) return 'deep_male';
    if (hz < 165) return 'male';
    if (hz < 195) return 'androgynous';
    if (hz < 235) return 'fem_soft';
    if (hz < 280) return 'fem_sweet';
    return 'ultra_high';
  }

  private frequencyToNote(hz: number): string {
    const noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteNum = 12 * (Math.log(hz / 440) / Math.log(2));
    const midi = Math.round(noteNum) + 69;
    const noteIndex = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    return `${noteStrings[noteIndex]}${octave}`;
  }
}
