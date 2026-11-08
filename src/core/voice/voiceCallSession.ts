import type { PreparedSpeech } from './ttsManager';
import { encodeWav, STTManager, type STTOptions } from './sttManager';
import { SpeechSegmenter } from './speechSegmenter';
import { computeRms, VoiceActivityDetector } from './voiceActivity';
import { normalizeForComparison } from '../tavern/tavernTextSanitizer';
import type { VoiceCallTurnTiming } from '../../types';

/**
 * 酒馆「打电话」的通话会话：全双工语音对话。
 *
 * 一轮对话：麦克风持续收音 → 语音活动检测判定「说完了」→ 识别成文字 → 交给酒馆生成（流式）
 * → 可见文本每出现一句完整的话就合成并播放（下一句同时预取）→ 播完回到聆听。
 * 角色说话或思考时你一开口就打断：停止朗读、中止生成，直接进入你的下一轮。
 *
 * 识别有两条路：
 * - 云端（硅基流动 / 豆包）：本地做断句，录到的整句音频送识别。回声消除由 getUserMedia 负责。
 * - 浏览器 Web Speech：连续识别，最终结果即一句话；不额外占用麦克风（部分安卓会冲突）。
 */

export type CallPhase =
  | 'idle'
  | 'ringing_out'
  | 'ringing_in'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'ended'
  | 'error';

export interface CallTurnHooks {
  /** 流式可见文本（到目前为止的完整内容） */
  onVisibleText(text: string): void;
}

export interface VoiceCallDeps {
  /** 发送一轮发言，resolve 最终回复；被中止或失败时 resolve null */
  sendTurn(text: string, hooks: CallTurnHooks): Promise<string | null>;
  /** 中止正在进行的生成 */
  interruptTurn(): void;
  /** 等上一轮彻底收尾（酒馆的生成锁释放）后再发下一轮 */
  waitUntilReady?(): Promise<void>;
  prepareSpeech(text: string): PreparedSpeech;
  stopSpeech(): void;
  sttOptions: STTOptions;
  transcribe?(wav: Blob, options: STTOptions, signal: AbortSignal): Promise<string>;
  /** 断句快慢：停顿多久算说完 */
  turnTiming?: VoiceCallTurnTiming;
}

/** 一轮对话的延迟，均从「你真正说完」那一刻算起（毫秒） */
export interface CallTurnLatency {
  recognizeMs: number | null;
  firstTextMs: number | null;
  firstAudioMs: number | null;
}

/**
 * 断句时机。speculativeMs：停顿到这个时长就先把已录到的话送去识别（不等完全说完）；
 * 若接着又开口则作废重来，确认说完时多数情况下识别结果已经回来了。
 */
export const CALL_TURN_TIMINGS: Record<VoiceCallTurnTiming, { endSilenceMs: number; speculativeMs: number }> = {
  fast: { endSilenceMs: 550, speculativeMs: 300 },
  standard: { endSilenceMs: 800, speculativeMs: 350 },
  patient: { endSilenceMs: 1200, speculativeMs: 500 },
};

export interface VoiceCallSnapshot {
  phase: CallPhase;
  muted: boolean;
  bargeInEnabled: boolean;
  micLevel: number;
  userCaption: string;
  aiCaption: string;
  error: string | null;
  connectedAt: number | null;
  sttMode: 'cloud' | 'browser';
  /** 最近一轮的延迟（接通开场那一轮没有） */
  latency: CallTurnLatency | null;
}

type Listener = (snapshot: VoiceCallSnapshot) => void;

/** 预取窗口：正在播的这一句之后最多再提前合成两句，避免长回复一次性打满 TTS 接口 */
const PREFETCH_AHEAD = 2;
/** 录音前置缓冲：语音活动检测确认开口需要一点时间，保留这段避免吞掉第一个字 */
const PRE_ROLL_MS = 450;
/** 单句录音上限 */
const MAX_UTTERANCE_MS = 30_000;

class SpeechQueue {
  private pending: string[] = [];
  private prepared: PreparedSpeech[] = [];
  private active: PreparedSpeech | null = null;
  private closed = false;
  private canceled = false;
  private wake: (() => void) | null = null;
  readonly done: Promise<void>;

  constructor(
    private readonly prepare: (text: string) => PreparedSpeech,
    private readonly onPlay: (text: string) => void,
  ) {
    this.done = this.run();
  }

  enqueue(text: string) {
    if (this.canceled || this.closed || !text.trim()) return;
    this.pending.push(text);
    this.fill();
    this.wake?.();
  }

  close() {
    this.closed = true;
    this.wake?.();
  }

  cancel() {
    this.canceled = true;
    this.active?.cancel();
    this.active = null;
    this.prepared.forEach((item) => item.cancel());
    this.prepared = [];
    this.pending = [];
    this.wake?.();
  }

  private fill() {
    while (this.prepared.length < PREFETCH_AHEAD + 1 && this.pending.length > 0) {
      this.prepared.push(this.prepare(this.pending.shift()!));
    }
  }

  private async run() {
    while (!this.canceled) {
      const next = this.prepared.shift();
      if (!next) {
        if (this.closed || this.canceled) return;
        await new Promise<void>((resolve) => { this.wake = resolve; });
        this.wake = null;
        continue;
      }
      if (this.canceled) {
        next.cancel();
        return;
      }
      this.fill();
      if (!next.text) continue;
      this.active = next;
      this.onPlay(next.text);
      try {
        await next.play();
      } catch (error) {
        if (!this.canceled) console.warn('通话朗读失败:', error);
      } finally {
        if (this.active === next) this.active = null;
      }
    }
  }
}

export class VoiceCallSession {
  private snapshot: VoiceCallSnapshot = {
    phase: 'idle',
    muted: false,
    bargeInEnabled: true,
    micLevel: 0,
    userCaption: '',
    aiCaption: '',
    error: null,
    connectedAt: null,
    sttMode: 'cloud',
    latency: null,
  };
  private listeners = new Set<Listener>();
  private active = false;
  private turnId = 0;
  private queue: SpeechQueue | null = null;
  private turnPromise: Promise<void> | null = null;
  private transcribeController: AbortController | null = null;

  // 云端识别：麦克风与语音活动检测
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private vad = new VoiceActivityDetector();
  private preRoll: Float32Array[] = [];
  private utterance: Float32Array[] = [];
  private utteranceStartedAt = 0;
  private sampleRate = 48_000;
  private preRollFrames = 10;
  private readonly timing: { endSilenceMs: number; speculativeMs: number };
  private speculative: { controller: AbortController; result: Promise<string> } | null = null;

  // 浏览器识别
  private recognition: any = null;
  private finalBuffer = '';
  private finalTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: VoiceCallDeps) {
    this.snapshot.sttMode = deps.sttOptions.engine === 'browser' || !deps.sttOptions.engine ? 'browser' : 'cloud';
    this.timing = CALL_TURN_TIMINGS[deps.turnTiming || 'standard'] || CALL_TURN_TIMINGS.standard;
    this.vad.setEndSilenceMs(this.timing.endSilenceMs);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): VoiceCallSnapshot {
    return this.snapshot;
  }

  private set(patch: Partial<VoiceCallSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => {
      try { listener(this.snapshot); } catch (error) { console.warn('通话状态监听器异常:', error); }
    });
  }

  setPhase(phase: CallPhase) {
    this.set({ phase });
  }

  /**
   * 接通：打开麦克风并开始收音。opening 为接通后角色先说的那一轮（例如「电话接通」）。
   */
  async connect(opening?: string): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.set({ phase: 'connecting', error: null, userCaption: '', aiCaption: '' });
    try {
      if (this.snapshot.sttMode === 'cloud') await this.startMicrophone();
      else this.startBrowserRecognition();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }
    if (!this.active) return;
    this.set({ phase: 'listening', connectedAt: Date.now() });
    this.requestWakeLock();
    if (opening) this.startTurn(opening, false);
  }

  hangUp() {
    if (!this.active && this.snapshot.phase === 'ended') return;
    this.active = false;
    this.interrupt(false);
    this.stopMicrophone();
    this.stopBrowserRecognition();
    this.releaseWakeLock();
    this.set({ phase: 'ended', micLevel: 0 });
  }

  setMuted(muted: boolean) {
    this.set({ muted });
    if (muted) {
      this.vad.reset();
      this.cancelSpeculative();
      this.utterance = [];
      if (this.snapshot.phase === 'user_speaking') this.set({ phase: 'listening' });
    }
  }

  setBargeInEnabled(enabled: boolean) {
    this.set({ bargeInEnabled: enabled });
  }

  /** 打断角色：停止朗读并中止生成，回到聆听 */
  interrupt(toListening = true) {
    this.turnId += 1;
    this.queue?.cancel();
    this.queue = null;
    this.transcribeController?.abort();
    this.transcribeController = null;
    this.cancelSpeculative();
    // 手动打断或挂断时清掉还没说完的录音，避免扬声器尾音被当成下一句。
    // 开口打断会在调用后立刻写入当前这一帧，不能在这里把 VAD 正在确认的话清掉。
    if (toListening) {
      this.vad.reset();
      this.utterance = [];
      this.preRoll = [];
    }
    this.deps.stopSpeech();
    this.deps.interruptTurn();
    if (toListening && this.active) this.set({ phase: 'listening' });
  }

  private isPeerBusy(): boolean {
    return this.snapshot.phase === 'speaking' || this.snapshot.phase === 'thinking';
  }

  // ================= 一轮对话 =================

  /**
   * @param speechEndAt 你说完的时刻；传入时统计本轮延迟
   * @param recognizedAt 识别结果返回的时刻
   */
  private startTurn(text: string, showAsUser = true, speechEndAt?: number, recognizedAt?: number) {
    const turn = ++this.turnId;
    if (showAsUser) this.set({ userCaption: text });
    this.set({
      phase: 'thinking',
      aiCaption: '',
      error: null,
      latency: speechEndAt
        ? { recognizeMs: recognizedAt ? Math.max(0, recognizedAt - speechEndAt) : null, firstTextMs: null, firstAudioMs: null }
        : null,
    });
    const markLatency = (field: 'firstTextMs' | 'firstAudioMs') => {
      const latency = this.snapshot.latency;
      if (!speechEndAt || turn !== this.turnId || !latency || latency[field] !== null) return;
      this.set({ latency: { ...latency, [field]: Math.max(0, Date.now() - speechEndAt) } });
    };
    const previous = this.turnPromise;
    this.turnPromise = (async () => {
      await previous?.catch(() => undefined);
      await this.deps.waitUntilReady?.().catch(() => undefined);
      if (turn !== this.turnId || !this.active) return;

      const segmenter = new SpeechSegmenter();
      this.queue?.cancel();
      const queue = new SpeechQueue(
        (sentence) => this.deps.prepareSpeech(sentence),
        (spoken) => {
          if (turn !== this.turnId) return;
          markLatency('firstAudioMs');
          this.set({ phase: 'speaking', aiCaption: spoken });
        },
      );
      this.queue = queue;
      if (turn !== this.turnId || !this.active) {
        queue.cancel();
        if (this.queue === queue) this.queue = null;
        return;
      }
      let streamed = false;
      const reply = await this.deps.sendTurn(text, {
        onVisibleText: (visible) => {
          if (turn !== this.turnId) return;
          if (!streamed) markLatency('firstTextMs');
          streamed = true;
          segmenter.push(visible).forEach((sentence) => queue.enqueue(sentence));
        },
      }).catch((error) => {
        console.warn('通话生成失败:', error);
        if (turn === this.turnId) this.set({ error: error instanceof Error ? error.message : '生成失败' });
        return null;
      });
      if (turn !== this.turnId) return;
      // 流式阶段已经按可见文本切过句，剩余部分也按同一份文本收尾；没有流式输出时整段朗读最终回复
      const rest = streamed ? segmenter.flush() : segmenter.flush(reply || '');
      rest.forEach((sentence) => queue.enqueue(sentence));
      if (!streamed && !reply && !this.snapshot.error) {
        this.set({ aiCaption: '（对方没有回应，请再说一次）' });
      }
      queue.close();
      await queue.done;
      if (turn === this.turnId && this.active) {
        this.queue = null;
        this.set({ phase: 'listening' });
      }
    })();
  }

  private transcribeChunks(chunks: Float32Array[], signal: AbortSignal): Promise<string> {
    const wav = encodeWav(chunks, this.sampleRate);
    const transcribe = this.deps.transcribe
      ?? ((audio: Blob, options: STTOptions, abortSignal: AbortSignal) => STTManager.getInstance().transcribeAudio(audio, options, abortSignal));
    return transcribe(wav, this.deps.sttOptions, signal).then((text) => String(text || '').trim());
  }

  /** 停顿刚开始就先送识别；结果留着，确认说完时直接用 */
  private startSpeculative() {
    const controller = new AbortController();
    const result = this.transcribeChunks([...this.utterance], controller.signal);
    result.catch(() => undefined);
    this.speculative = { controller, result };
  }

  private cancelSpeculative() {
    this.speculative?.controller.abort();
    this.speculative = null;
  }

  private async submitUtterance(chunks: Float32Array[], speechEndAt: number) {
    const turn = ++this.turnId;
    this.set({ phase: 'transcribing' });
    const speculative = this.speculative;
    this.speculative = null;
    const controller = speculative?.controller ?? new AbortController();
    this.transcribeController = controller;
    try {
      let text: string;
      try {
        text = speculative ? await speculative.result : await this.transcribeChunks(chunks, controller.signal);
      } catch (error) {
        // 提前识别失败（非主动取消）时用完整录音再试一次
        if (!speculative || controller.signal.aborted) throw error;
        text = await this.transcribeChunks(chunks, controller.signal);
      }
      if (turn !== this.turnId || !this.active || controller.signal.aborted) return;
      if (!text) {
        this.set({ phase: 'listening' });
        return;
      }
      this.startTurn(text, true, speechEndAt, Date.now());
    } catch (error) {
      if (turn !== this.turnId || controller.signal.aborted) return;
      this.set({ phase: 'listening', error: error instanceof Error ? error.message : '语音识别失败' });
    } finally {
      if (this.transcribeController === controller) this.transcribeController = null;
    }
  }

  // ================= 云端识别：麦克风 + 语音活动检测 =================

  private async startMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前环境无法使用麦克风');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    if (!this.active) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const context: AudioContext = new AudioContextCtor();
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const sink = context.createGain();
    sink.gain.value = 0;
    this.stream = stream;
    this.context = context;
    this.source = source;
    this.processor = processor;
    this.sink = sink;
    this.sampleRate = context.sampleRate;
    this.preRollFrames = Math.ceil(PRE_ROLL_MS / ((2048 / context.sampleRate) * 1000));
    processor.onaudioprocess = (event) => {
      this.processFrame(new Float32Array(event.inputBuffer.getChannelData(0)), Date.now());
    };
    source.connect(processor);
    processor.connect(sink);
    sink.connect(context.destination);
  }

  /**
   * 处理一帧麦克风数据：语音活动检测、录音缓冲、提前识别与插话。
   * 单独成方法便于测试直接喂入合成音频帧。
   */
  processFrame(frame: Float32Array, now: number) {
    if (!this.active) return;
    const rms = computeRms(frame);
    this.set({ micLevel: this.snapshot.muted ? 0 : Math.min(1, rms * 12) });
    if (this.snapshot.muted) return;
    const keepPreRoll = () => {
      this.preRoll.push(frame);
      if (this.preRoll.length > this.preRollFrames) this.preRoll.shift();
    };
    if (this.snapshot.phase === 'transcribing' || this.snapshot.phase === 'connecting') {
      keepPreRoll();
      return;
    }

    const peerBusy = this.isPeerBusy();
    // 不允许插话时，角色说话期间完全不收音（免提无回声消除时最稳妥）
    if (peerBusy && !this.snapshot.bargeInEnabled) {
      this.vad.reset();
      this.preRoll = [];
      return;
    }
    const event = this.vad.feed(rms, now, peerBusy);

    if (this.vad.isSpeaking() || event === 'speech_end') this.utterance.push(frame);
    else keepPreRoll();

    if (event === 'speech_start') {
      if (peerBusy) this.interrupt(false);
      this.utterance = [...this.preRoll, frame];
      this.preRoll = [];
      this.utteranceStartedAt = now;
      this.set({ phase: 'user_speaking', userCaption: '' });
      return;
    }

    if (event === 'speech_end' || (this.vad.isSpeaking() && now - this.utteranceStartedAt > MAX_UTTERANCE_MS)) {
      const speechEndAt = this.vad.getLastVoiceAt() || now;
      const chunks = this.utterance;
      this.utterance = [];
      this.vad.reset();
      if (event !== 'speech_end') this.cancelSpeculative(); // 超长被截断：提前识别的内容不完整
      void this.submitUtterance(chunks, speechEndAt);
      return;
    }

    if (this.vad.isSpeaking()) {
      const silence = this.vad.getSilenceMs(now);
      if (silence === 0) {
        // 又开口了：之前提前送出的识别作废
        if (this.speculative) this.cancelSpeculative();
      } else if (silence >= this.timing.speculativeMs && !this.speculative) {
        this.startSpeculative();
      }
    }
  }

  private stopMicrophone() {
    if (this.processor) this.processor.onaudioprocess = null;
    try { this.source?.disconnect(); } catch {}
    try { this.processor?.disconnect(); } catch {}
    try { this.sink?.disconnect(); } catch {}
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close().catch(() => undefined);
    this.stream = null;
    this.context = null;
    this.source = null;
    this.processor = null;
    this.sink = null;
    this.preRoll = [];
    this.utterance = [];
    this.cancelSpeculative();
    this.vad.reset();
  }

  // ================= 浏览器连续识别 =================

  private startBrowserRecognition() {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      throw new Error('当前环境不支持浏览器语音识别（安卓 App 内通常不可用），请到【系统设置 → 语音】把语音识别切换为硅基流动或豆包');
    }
    const recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.deps.sttOptions.language || 'zh-CN';
    recognition.onresult = (event: any) => {
      if (!this.active || this.snapshot.muted) return;
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = String(event.results[index][0]?.transcript || '');
        if (event.results[index].isFinal) this.finalBuffer += text;
        else interim += text;
      }
      const heard = `${this.finalBuffer}${interim}`.trim();
      if (!heard) return;
      if (this.isPeerBusy()) {
        // 浏览器识别没有回声消除保障：听到的内容若只是角色正在说的话，视为回声
        if (!this.snapshot.bargeInEnabled || this.isEcho(heard) || normalizeForComparison(heard).length < 3) {
          this.finalBuffer = '';
          return;
        }
        this.interrupt(false);
      }
      this.set({ phase: 'user_speaking', userCaption: heard });
      if (this.finalTimer) clearTimeout(this.finalTimer);
      if (this.finalBuffer.trim()) {
        // 停顿片刻再提交，把一口气说的几段最终结果合成一句
        const lastResultAt = Date.now();
        this.finalTimer = setTimeout(() => {
          const text = this.finalBuffer.trim();
          this.finalBuffer = '';
          this.finalTimer = null;
          if (text && this.active) this.startTurn(text, true, lastResultAt, Date.now());
        }, 600);
      }
    };
    recognition.onerror = (event: any) => {
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        this.fail('麦克风或语音识别权限被拒绝');
      }
    };
    recognition.onend = () => {
      // Chrome 在长时间静音后会自动结束识别，通话中需要持续收音
      if (this.active && this.recognition === recognition) {
        try { recognition.start(); } catch {}
      }
    };
    this.recognition = recognition;
    recognition.start();
  }

  private stopBrowserRecognition() {
    if (this.finalTimer) clearTimeout(this.finalTimer);
    this.finalTimer = null;
    this.finalBuffer = '';
    const recognition = this.recognition;
    this.recognition = null;
    try { recognition?.abort(); } catch {}
  }

  private isEcho(heard: string): boolean {
    const spoken = normalizeForComparison(this.snapshot.aiCaption);
    const normalized = normalizeForComparison(heard);
    return Boolean(spoken && normalized && spoken.includes(normalized));
  }

  // ================= 杂项 =================

  private fail(message: string) {
    this.active = false;
    this.stopMicrophone();
    this.stopBrowserRecognition();
    this.releaseWakeLock();
    this.set({ phase: 'error', error: message, micLevel: 0 });
  }

  private wakeLock: any = null;

  private requestWakeLock() {
    try {
      void (navigator as any).wakeLock?.request?.('screen')
        .then((lock: any) => { this.wakeLock = lock; })
        .catch(() => undefined);
    } catch {}
  }

  private releaseWakeLock() {
    try { void this.wakeLock?.release?.(); } catch {}
    this.wakeLock = null;
  }
}
