/**
 * 役次元 潜意识 ASMR 环境白噪音与脑波合成器 (Web Audio API 程序化合成)
 */
export class AmbientAudioEngine {
  private static instance: AmbientAudioEngine;

  private ctx: AudioContext | null = null;
  private currentType: string | null = null;
  private noiseNode: AudioNode | null = null;
  private gainNode: GainNode | null = null;

  private constructor() {}

  static getInstance(): AmbientAudioEngine {
    if (!AmbientAudioEngine.instance) {
      AmbientAudioEngine.instance = new AmbientAudioEngine();
    }
    return AmbientAudioEngine.instance;
  }

  play(type: 'rain' | 'fireplace' | 'sea_binaural' | 'zen_wind', volume: number = 0.4) {
    this.stop();

    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch((error) => console.warn('环境音频恢复失败:', error));
      }
      this.gainNode = this.ctx.createGain();
      const safeVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.4;
      this.gainNode.gain.setValueAtTime(safeVolume, this.ctx.currentTime);
      this.gainNode.connect(this.ctx.destination);

      if (type === 'rain' || type === 'zen_wind') {
        this.createPinkNoise(type === 'rain' ? 800 : 300);
      } else if (type === 'fireplace') {
        this.createPinkNoise(450);
      } else if (type === 'sea_binaural') {
        this.createBinauralBeats(432, 438); // 6Hz Theta 深度冥想脑波
      }

      this.currentType = type;
    } catch (e) {
      console.warn('环境音效初始化失败:', e);
      this.stop();
    }
  }

  private createPinkNoise(cutoffHz: number) {
    if (!this.ctx || !this.gainNode) return;

    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // 低通滤波器营造温润环境
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(this.gainNode);
    whiteNoise.start(0);
    this.noiseNode = whiteNoise;
  }

  private createBinauralBeats(freqLeft: number, freqRight: number) {
    if (!this.ctx || !this.gainNode) return;

    const oscLeft = this.ctx.createOscillator();
    const oscRight = this.ctx.createOscillator();
    const merger = this.ctx.createChannelMerger(2);

    oscLeft.frequency.setValueAtTime(freqLeft, this.ctx.currentTime);
    oscRight.frequency.setValueAtTime(freqRight, this.ctx.currentTime);

    oscLeft.connect(merger, 0, 0);
    oscRight.connect(merger, 0, 1);

    merger.connect(this.gainNode);
    oscLeft.start();
    oscRight.start();
  }

  stop() {
    if (this.noiseNode) {
      try {
        (this.noiseNode as any).stop();
      } catch {}
      this.noiseNode = null;
    }
    const context = this.ctx;
    this.ctx = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }
    this.gainNode = null;
    this.currentType = null;
  }
}
