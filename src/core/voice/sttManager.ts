export type STTResultCallback = (transcript: string, isFinal: boolean) => void;
export type STTStateCallback = (isListening: boolean, error?: string, isProcessing?: boolean) => void;

export interface STTOptions {
  engine?: 'browser' | 'siliconflow' | 'volcengine';
  language?: string;
  siliconflowApiKey?: string;
  siliconflowModel?: string;
  volcengineApiKey?: string;
  volcengineAppId?: string;
  volcengineAccessKey?: string;
  volcengineResourceId?: string;
}

const SILICONFLOW_STT_ENDPOINT = 'https://api.siliconflow.cn/v1/audio/transcriptions';
const VOLCENGINE_STT_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash';

const encodeWav = (chunks: Float32Array[], sampleRate: number): Blob => {
  const sampleCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  let offset = 44;
  chunks.forEach((chunk) => chunk.forEach((sample) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }));
  return new Blob([buffer], { type: 'audio/wav' });
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const block = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += block) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + block));
  }
  return btoa(binary);
};

const extractTranscript = (payload: any): string => {
  const direct = [payload?.text, payload?.result?.text, payload?.data?.text]
    .find((value) => typeof value === 'string' && value.trim());
  if (direct) return direct.trim();
  const utterances = payload?.result?.utterances || payload?.utterances || payload?.data?.utterances;
  if (!Array.isArray(utterances)) return '';
  return utterances.map((item) => item?.text || item?.utterance || '').filter(Boolean).join('').trim();
};

export class STTManager {
  private static instance: STTManager;
  private recognition: any = null;
  private isListeningNow = false;
  private onResultCb: STTResultCallback | null = null;
  private onStateCb: STTStateCallback | null = null;
  private recognitionGeneration = 0;
  private operationGeneration = 0;
  private requestController: AbortController | null = null;
  private cloudStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private audioChunks: Float32Array[] = [];
  private cloudOptions: STTOptions | null = null;
  private cloudStartedAt = 0;
  private lastVoiceAt = 0;
  private heardVoice = false;
  private cloudTimer: number | null = null;
  private cloudFinalizingGeneration: number | null = null;

  private constructor() {
    this.initRecognition();
  }

  static getInstance(): STTManager {
    if (!STTManager.instance) STTManager.instance = new STTManager();
    return STTManager.instance;
  }

  private initRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    try {
      const recognition = new SpeechRec();
      const generation = ++this.recognitionGeneration;
      this.recognition = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';
      recognition.onstart = () => {
        if (generation !== this.recognitionGeneration || this.recognition !== recognition) return;
        this.isListeningNow = true;
        this.onStateCb?.(true);
      };
      recognition.onresult = (event: any) => {
        if (generation !== this.recognitionGeneration || this.recognition !== recognition) return;
        let interim = '';
        let finalTranscript = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const text = event.results[index][0].transcript;
          if (event.results[index].isFinal) finalTranscript += text;
          else interim += text;
        }
        if (finalTranscript) this.onResultCb?.(finalTranscript, true);
        else if (interim) this.onResultCb?.(interim, false);
      };
      recognition.onerror = (event: any) => {
        if (generation !== this.recognitionGeneration || this.recognition !== recognition) return;
        this.isListeningNow = false;
        this.onStateCb?.(false, event.error);
      };
      recognition.onend = () => {
        if (generation !== this.recognitionGeneration || this.recognition !== recognition) return;
        this.isListeningNow = false;
        this.onStateCb?.(false);
      };
    } catch (error) {
      console.warn('初始化 SpeechRecognition 失败:', error);
    }
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  }

  async startListening(onResult: STTResultCallback, onState?: STTStateCallback, options: STTOptions = {}) {
    this.stopListening();
    const operationGeneration = ++this.operationGeneration;
    this.onResultCb = onResult;
    this.onStateCb = onState || null;
    const engine = options.engine || 'browser';
    if (engine === 'browser') {
      await this.startBrowserListening(options.language || 'zh-CN', operationGeneration);
      return;
    }
    await this.startCloudListening({ ...options, engine }, operationGeneration);
  }

  private async startBrowserListening(language: string, operationGeneration: number) {
    const requestGeneration = ++this.recognitionGeneration;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      if (requestGeneration !== this.recognitionGeneration || operationGeneration !== this.operationGeneration) return;
    } catch (error: any) {
      if (operationGeneration === this.operationGeneration) {
        this.onStateCb?.(false, error?.message || '麦克风权限被拒绝');
      }
      return;
    }
    this.initRecognition();
    if (!this.recognition) {
      this.onStateCb?.(false, '当前环境不支持浏览器语音识别，请在设置中选择云端识别。');
      return;
    }
    this.recognition.lang = language;
    try {
      this.recognition.start();
    } catch (error: any) {
      if (error?.name !== 'InvalidStateError') this.onStateCb?.(false, error?.message || '语音识别启动失败');
    }
  }

  private async startCloudListening(options: STTOptions, operationGeneration: number) {
    if (options.engine === 'siliconflow' && !options.siliconflowApiKey?.trim()) {
      this.onStateCb?.(false, '请先在系统设置中填写硅基流动语音识别 Key');
      return;
    }
    if (options.engine === 'volcengine' && !options.volcengineApiKey?.trim()
      && !(options.volcengineAppId?.trim() && options.volcengineAccessKey?.trim())) {
      this.onStateCb?.(false, '请先在系统设置中填写豆包语音识别凭据');
      return;
    }
    let localStream: MediaStream | null = null;
    let localContext: AudioContext | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      localStream = stream;
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const context: AudioContext = new AudioContextCtor();
      localContext = context;
      await context.resume();
      if (operationGeneration !== this.operationGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        await context.close().catch(() => undefined);
        return;
      }
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      this.cloudStream = stream;
      this.audioContext = context;
      this.audioSource = source;
      this.audioProcessor = processor;
      this.silentGain = silentGain;
      this.audioChunks = [];
      this.cloudOptions = options;
      this.cloudStartedAt = Date.now();
      this.lastVoiceAt = this.cloudStartedAt;
      this.heardVoice = false;
      this.cloudFinalizingGeneration = null;
      processor.onaudioprocess = (event) => {
        if (operationGeneration !== this.operationGeneration) return;
        const copy = new Float32Array(event.inputBuffer.getChannelData(0));
        this.audioChunks.push(copy);
        let energy = 0;
        for (let index = 0; index < copy.length; index += 1) energy += copy[index] * copy[index];
        if (Math.sqrt(energy / copy.length) > 0.018) {
          this.heardVoice = true;
          this.lastVoiceAt = Date.now();
        }
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);
      this.isListeningNow = true;
      this.onStateCb?.(true);
      this.cloudTimer = window.setInterval(() => {
        if (operationGeneration !== this.operationGeneration) return;
        const now = Date.now();
        if (now - this.cloudStartedAt >= 30_000 || (this.heardVoice && now - this.lastVoiceAt >= 1_100)) {
          void this.finalizeCloudListening(true, operationGeneration);
        }
      }, 200);
    } catch (error: any) {
      if (localStream) {
        try { localStream.getTracks().forEach((track) => track.stop()); } catch {}
      }
      if (localContext) {
        void localContext.close().catch(() => undefined);
      }
      this.cleanupCloudAudio();
      if (operationGeneration === this.operationGeneration) {
        this.onStateCb?.(false, error?.message || '麦克风权限被拒绝');
      }
    }
  }

  private cleanupCloudAudio() {
    if (this.cloudTimer !== null) window.clearInterval(this.cloudTimer);
    this.cloudTimer = null;
    if (this.audioProcessor) this.audioProcessor.onaudioprocess = null;
    try { this.audioSource?.disconnect(); } catch {}
    try { this.audioProcessor?.disconnect(); } catch {}
    try { this.silentGain?.disconnect(); } catch {}
    this.cloudStream?.getTracks().forEach((track) => track.stop());
    void this.audioContext?.close().catch(() => undefined);
    this.cloudStream = null;
    this.audioContext = null;
    this.audioSource = null;
    this.audioProcessor = null;
    this.silentGain = null;
  }

  private async finalizeCloudListening(submit: boolean, operationGeneration = this.operationGeneration) {
    if (this.cloudFinalizingGeneration === operationGeneration || !this.audioContext) return;
    this.cloudFinalizingGeneration = operationGeneration;
    const chunks = this.audioChunks;
    const sampleRate = this.audioContext.sampleRate;
    const options = this.cloudOptions;
    const resultCallback = this.onResultCb;
    const stateCallback = this.onStateCb;
    this.cleanupCloudAudio();
    this.isListeningNow = false;
    if (!submit || !options || !this.heardVoice || chunks.length === 0) {
      if (operationGeneration === this.operationGeneration) stateCallback?.(false);
      if (this.cloudFinalizingGeneration === operationGeneration) this.cloudFinalizingGeneration = null;
      return;
    }
    stateCallback?.(false, undefined, true);
    const controller = new AbortController();
    this.requestController = controller;
    try {
      const wav = encodeWav(chunks, sampleRate);
      const transcript = options.engine === 'volcengine'
        ? await this.transcribeVolcengine(wav, options, controller.signal)
        : await this.transcribeSiliconflow(wav, options, controller.signal);
      if (operationGeneration !== this.operationGeneration || controller.signal.aborted) return;
      if (!transcript) throw new Error('没有识别到清晰语音');
      resultCallback?.(transcript, true);
      stateCallback?.(false);
    } catch (error: any) {
      if (operationGeneration === this.operationGeneration && !controller.signal.aborted) {
        stateCallback?.(false, error?.message || '语音识别失败');
      }
    } finally {
      if (this.requestController === controller) this.requestController = null;
      if (this.cloudFinalizingGeneration === operationGeneration) this.cloudFinalizingGeneration = null;
    }
  }

  private async transcribeSiliconflow(wav: Blob, options: STTOptions, signal: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append('file', wav, 'voice-input.wav');
    form.append('model', options.siliconflowModel || 'FunAudioLLM/SenseVoiceSmall');
    const response = await fetch(SILICONFLOW_STT_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.siliconflowApiKey?.trim()}` },
      body: form,
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || payload?.error?.message || `硅基流动识别失败 (${response.status})`);
    return extractTranscript(payload);
  }

  private async transcribeVolcengine(wav: Blob, options: STTOptions, signal: AbortSignal): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Resource-Id': options.volcengineResourceId || 'volc.bigasr.auc_turbo',
      'X-Api-Request-Id': crypto.randomUUID(),
      'X-Api-Sequence': '-1',
    };
    if (options.volcengineApiKey?.trim()) headers['X-Api-Key'] = options.volcengineApiKey.trim();
    else {
      headers['X-Api-App-Key'] = options.volcengineAppId?.trim() || '';
      headers['X-Api-Access-Key'] = options.volcengineAccessKey?.trim() || '';
    }
    const response = await fetch(VOLCENGINE_STT_ENDPOINT, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        user: { uid: 'ycy_voice_input' },
        audio: { data: await blobToBase64(wav), format: 'wav' },
        request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, enable_ddc: true, show_utterances: true },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const statusCode = response.headers.get('x-api-status-code');
    if (!response.ok || (statusCode && statusCode !== '20000000')) {
      throw new Error(response.headers.get('x-api-message') || payload?.message || `火山语音识别失败 (${statusCode || response.status})`);
    }
    return extractTranscript(payload);
  }

  finishListening() {
    if (this.audioContext) {
      void this.finalizeCloudListening(true, this.operationGeneration);
      return;
    }
    try { this.recognition?.stop(); } catch {}
  }

  stopListening() {
    this.operationGeneration += 1;
    this.recognitionGeneration += 1;
    this.requestController?.abort();
    this.requestController = null;
    try { this.recognition?.abort(); } catch {}
    if (this.audioContext) this.cleanupCloudAudio();
    this.cloudFinalizingGeneration = null;
    this.audioChunks = [];
    this.cloudOptions = null;
    this.isListeningNow = false;
    this.onResultCb = null;
    this.onStateCb?.(false);
    this.onStateCb = null;
  }

  isListening(): boolean {
    return this.isListeningNow;
  }
}
