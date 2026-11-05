/**
 * 基于能量的语音活动检测（VAD），用于通话里判断「用户开始说话 / 说完了」。
 *
 * - 噪声底噪自适应：安静时缓慢跟踪环境噪声，阈值 = max(最低阈值, 底噪 × 倍率)
 * - 开始说话需要持续 minSpeechMs 以上，咳嗽、碰麦这类瞬时声音不算
 * - 说完判定：语音后连续静音 endSilenceMs
 * - 角色正在说话时阈值抬高、确认时间拉长：免提时扬声器的回声即使没被回声消除干净，也不会被当成插话
 */

export type VoiceActivityEvent = 'speech_start' | 'speech_end' | null;

export interface VoiceActivityOptions {
  minThreshold?: number;
  noiseMultiplier?: number;
  minSpeechMs?: number;
  endSilenceMs?: number;
  /** 角色说话时的阈值倍率与确认时长（插话检测） */
  bargeInMultiplier?: number;
  bargeInMinSpeechMs?: number;
}

export class VoiceActivityDetector {
  private noiseFloor = 0.004;
  private speaking = false;
  private aboveSince: number | null = null;
  private lastVoiceAt = 0;
  private readonly minThreshold: number;
  private readonly noiseMultiplier: number;
  private readonly minSpeechMs: number;
  private endSilenceMs: number;
  private readonly bargeInMultiplier: number;
  private readonly bargeInMinSpeechMs: number;

  constructor(options: VoiceActivityOptions = {}) {
    this.minThreshold = options.minThreshold ?? 0.012;
    this.noiseMultiplier = options.noiseMultiplier ?? 3;
    this.minSpeechMs = options.minSpeechMs ?? 180;
    this.endSilenceMs = options.endSilenceMs ?? 750;
    this.bargeInMultiplier = options.bargeInMultiplier ?? 2.2;
    this.bargeInMinSpeechMs = options.bargeInMinSpeechMs ?? 380;
  }

  /** 调整「停顿多久算说完」（通话设置里的断句快慢） */
  setEndSilenceMs(ms: number) {
    this.endSilenceMs = Math.max(300, Math.min(2000, ms));
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  /** 说话中当前这段停顿已持续多久（未在说话时为 0） */
  getSilenceMs(now: number): number {
    return this.speaking ? Math.max(0, now - this.lastVoiceAt) : 0;
  }

  /** 最近一次检测到人声的时间（用于从「你真正说完」开始计算延迟） */
  getLastVoiceAt(): number {
    return this.lastVoiceAt;
  }

  getThreshold(peerSpeaking = false): number {
    const base = Math.max(this.minThreshold, this.noiseFloor * this.noiseMultiplier);
    return peerSpeaking ? base * this.bargeInMultiplier : base;
  }

  /**
   * @param rms 本帧均方根电平（0~1）
   * @param now 时间戳（毫秒）
   * @param peerSpeaking 角色是否正在说话
   */
  feed(rms: number, now: number, peerSpeaking = false): VoiceActivityEvent {
    const level = Number.isFinite(rms) ? Math.max(0, rms) : 0;
    const threshold = this.getThreshold(peerSpeaking);
    const loud = level >= threshold;

    if (!this.speaking) {
      if (loud) {
        if (this.aboveSince === null) this.aboveSince = now;
        const needed = peerSpeaking ? this.bargeInMinSpeechMs : this.minSpeechMs;
        if (now - this.aboveSince >= needed) {
          this.speaking = true;
          this.lastVoiceAt = now;
          this.aboveSince = null;
          return 'speech_start';
        }
      } else {
        this.aboveSince = null;
        // 只在没人说话时学习底噪；角色说话时的回声不能被学成「环境噪声」
        if (!peerSpeaking) this.noiseFloor = this.noiseFloor * 0.95 + Math.min(level, 0.05) * 0.05;
      }
      return null;
    }

    if (loud) {
      this.lastVoiceAt = now;
      return null;
    }
    if (now - this.lastVoiceAt >= this.endSilenceMs) {
      this.speaking = false;
      this.aboveSince = null;
      return 'speech_end';
    }
    return null;
  }

  reset() {
    this.speaking = false;
    this.aboveSince = null;
    this.lastVoiceAt = 0;
  }
}

/** 计算一帧 PCM 的均方根电平 */
export const computeRms = (samples: Float32Array): number => {
  if (!samples.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  return Math.sqrt(sum / samples.length);
};
