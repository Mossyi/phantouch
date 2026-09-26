import { VoiceConfig, TTSEngineType } from '../../types';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { fetchTextWithTimeout } from '../httpClient';
import {
  buildSiliconflowTtsRequest,
  DEFAULT_SILICONFLOW_TTS_MODEL,
  DEFAULT_SILICONFLOW_TTS_VOICE,
  normalizeSiliconflowTtsModel,
  normalizeSiliconflowTtsVoice,
  splitTextForTts,
} from './siliconflowTts';
import { decodeBase64Audio } from './audioBinary';

// Agent Plan uses its own TTS route. It returns chunked JSON frames rather than SSE-only data.
const VOLCENGINE_TTS_PLAN_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional';
const VOLCENGINE_TTS_RESOURCE_ID = 'seed-tts-2.0';
const VOLCENGINE_TTS_FEMALE_VOICE = 'zh_female_vv_uranus_bigtts';

interface NativeTtsPlugin {
  speak(options: { text: string; lang: string; rate: number; pitch: number }): Promise<void>;
  stop(): Promise<void>;
  getStatus(options: { lang: string }): Promise<{
    ready: boolean;
    languageAvailable: boolean;
    engineName: string;
    voiceName: string;
    chineseVoiceCount: number;
    message: string;
  }>;
  openSettings(): Promise<void>;
}

const NativeTts = registerPlugin<NativeTtsPlugin>('NativeTts');

const isAndroidNativeApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export type SpeakingStateListener = (isSpeaking: boolean, currentText: string | null) => void;

/**
 * 役次元 AI 伴侣高保真 TTS 语音合成中枢 (终极稳健多级容灾架构)
 * 支持：
 * 1. 硅基流动大模型语音 (CosyVoice2 / Fish-Speech) - 极高拟真度、呼吸感与情感起伏
 * 2. 高保真在线免费自然语音流 (无需 Key 与本地语音包，全机型 100% 发声)
 * 3. 微软 Edge Neural 神经网络超清语音
 * 4. 浏览器原生 Web Speech API (离线防 GC 兜底)
 */
export class TTSManager {
  private static instance: TTSManager;
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private isSpeakingNow: boolean = false;
  private currentSpokenText: string | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private listeners: Set<SpeakingStateListener> = new Set();
  private isUnlocked: boolean = false;
  private playbackGeneration = 0;
  private currentPlaybackCancel: (() => void) | null = null;
  private defaults: {
    enabled: boolean;
    rate: number;
    pitch: number;
    gain: number;
    engineType: TTSEngineType;
    siliconflowApiKey?: string;
    siliconflowModel?: string;
    siliconflowVoice?: string;
    volcengineApiKey?: string;
    volcengineResourceId?: string;
    volcengineVoice?: string;
  } = {
    enabled: true,
    rate: 1,
    pitch: 1,
    gain: 0,
    engineType: 'browser_native',
  };

  private constructor() {
    if (typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        this.synth = window.speechSynthesis;
        this.loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
          this.synth.onvoiceschanged = () => this.loadVoices();
        }
      }

      // 绑定首次触摸解锁音频策略
      const unlock = () => {
        this.unlockAudioContext();
        if (typeof window?.removeEventListener === 'function') {
          window.removeEventListener('touchstart', unlock);
          window.removeEventListener('click', unlock);
        }
      };
      if (typeof window?.addEventListener === 'function') {
        window.addEventListener('touchstart', unlock, { passive: true });
        window.addEventListener('click', unlock, { passive: true });
      }
    }
  }

  static getInstance(): TTSManager {
    if (!TTSManager.instance) {
      TTSManager.instance = new TTSManager();
    }
    return TTSManager.instance;
  }

  configureDefaults(config: Partial<typeof this.defaults>) {
    this.defaults = {
      ...this.defaults,
      ...config,
      siliconflowApiKey: typeof config.siliconflowApiKey === 'string'
        ? config.siliconflowApiKey.trim().slice(0, 1000)
        : this.defaults.siliconflowApiKey,
      siliconflowModel: config.siliconflowModel !== undefined
        ? normalizeSiliconflowTtsModel(config.siliconflowModel)
        : this.defaults.siliconflowModel,
      siliconflowVoice: config.siliconflowVoice !== undefined
        ? normalizeSiliconflowTtsVoice(config.siliconflowVoice)
        : this.defaults.siliconflowVoice,
      volcengineApiKey: typeof config.volcengineApiKey === 'string'
        ? config.volcengineApiKey.trim().slice(0, 1000)
        : this.defaults.volcengineApiKey,
    };
  }

  /**
   * 解锁手机移动端浏览器 AudioContext 自动播放策略
   */
  unlockAudioContext() {
    if (this.isUnlocked || typeof window === 'undefined') return;
    this.isUnlocked = true;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        src.onended = () => void ctx.close().catch(() => undefined);
        setTimeout(() => void ctx.close().catch(() => undefined), 1000);
      }
    } catch {}
    try {
      // Some Android WebViews unlock AudioContext but keep HTMLMediaElement muted until
      // a media element itself has played inside the user's first touch gesture.
      const primer = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      primer.muted = true;
      primer.setAttribute('playsinline', '');
      void primer.play().then(() => {
        primer.pause();
        primer.removeAttribute('src');
        primer.load();
      }).catch(() => undefined);
    } catch {}
  }

  private loadVoices() {
    if (!this.synth) return;
    try {
      this.voices = this.synth.getVoices();
    } catch {}
  }

  getVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && this.synth) {
      try {
        this.voices = this.synth.getVoices();
      } catch {}
    }
    return this.voices;
  }

  getChineseVoices(): SpeechSynthesisVoice[] {
    const all = this.getVoices();
    return all.filter((v) => {
      const lang = (v.lang || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      return lang.includes('zh') || lang.includes('cmn') || lang.includes('chinese') || name.includes('chinese') || name.includes('中文');
    });
  }

  subscribe(listener: SpeakingStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try { listener(this.isSpeakingNow, this.currentSpokenText); } catch (error) { console.warn('TTS 状态监听器执行失败:', error); }
    });
  }

  /**
   * 文本净化：过滤舞台括号指令与过量符号，保证读白自然流畅
   */
  private cleanTextForSpeech(rawText: string, preserveNarration = false): string {
    if (!rawText) return '';
    let text = rawText;
    if (preserveNarration) {
      // 酒馆回复需要从开头完整朗读，只移除包围符号，不丢掉动作叙述。
      text = text.replace(/[（）()【】[\]]/g, ' ');
    } else {
      // 普通语音反馈继续忽略括号内的舞台动作。
      text = text.replace(/（[^）]*）/g, ' ');
      text = text.replace(/\([^)]*\)/g, ' ');
      text = text.replace(/【[^】]*】/g, ' ');
      text = text.replace(/\[[^\]]*\]/g, ' ');
    }
    text = text.replace(/[*_~`#＊～]/g, '');
    text = text.replace(/https?:\/\/\S+/g, '');
    text = text.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
    text = text.replace(/\s+/g, ' ').trim();

    // 如果全部为动作被过滤光了，则退回保留文字去掉符号
    if (!text && rawText.trim()) {
      return rawText.replace(/[*_~`#＊～()（）【】[\]]/g, '').trim();
    }
    return text;
  }

  /**
   * 核心播放入口 (智能多级降级，保证 100% 发声)
   */
  async speak(
    text: string,
    config?: VoiceConfig,
    globalRate?: number,
    globalPitch?: number,
    engineType?: TTSEngineType,
    apiKey?: string
  ): Promise<void> {
    if (!this.defaults.enabled) return;
    this.stopCurrentPlayback(false);
    const generation = this.playbackGeneration;
    if (isAndroidNativeApp()) {
      // Capacitor calls are asynchronous. Waiting here prevents an older stop request from
      // arriving after the new utterance and immediately silencing it on Android.
      await NativeTts.stop().catch(() => undefined);
      if (generation !== this.playbackGeneration) return;
    }
    const resolvedRate = globalRate ?? this.defaults.rate;
    const resolvedPitch = globalPitch ?? this.defaults.pitch;
    const resolvedGain = Math.max(-10, Math.min(10, config?.gain ?? this.defaults.gain));
    const resolvedEngine = engineType ?? this.defaults.engineType;
    const engineDefaultKey = resolvedEngine === 'siliconflow'
      ? this.defaults.siliconflowApiKey
      : resolvedEngine === 'volcengine_tts'
        ? this.defaults.volcengineApiKey
        : '';
    const resolvedApiKey = typeof (apiKey ?? engineDefaultKey) === 'string'
      ? (apiKey ?? engineDefaultKey)?.trim().slice(0, 1000)
      : '';

    const cleaned = this.cleanTextForSpeech(text, config?.preserveNarration === true);
    if (!cleaned) return;
    const chunks = splitTextForTts(cleaned);
    let remainingChunks = chunks;
    let androidNativeAttempted = false;
    const playChunks = async (playChunk: (chunk: string) => Promise<boolean>) => {
      for (let index = 0; index < remainingChunks.length; index += 1) {
        if (generation !== this.playbackGeneration) return { completed: false, canceled: true, nextIndex: index };
        const success = await playChunk(remainingChunks[index]);
        if (!success) return { completed: false, canceled: false, nextIndex: index };
      }
      return { completed: true, canceled: false, nextIndex: remainingChunks.length };
    };

    this.isSpeakingNow = true;
    this.currentSpokenText = cleaned;
    this.notify();

    try {
      // 1. 如果选择了硅基流动且配置了 API Key，优先尝试大模型高保真语音
      if (resolvedEngine === 'siliconflow' && resolvedApiKey) {
        const result = await playChunks((chunk) => this.speakViaSiliconFlow(chunk, config, resolvedApiKey, resolvedRate, resolvedGain));
        if (result.canceled || result.completed) return;
        remainingChunks = remainingChunks.slice(result.nextIndex);
      }
      if (generation !== this.playbackGeneration) return;

      // 2. 火山豆包语音合成 2.0 使用独立语音入口，但可复用已配置的方舟 Key。
      if (resolvedEngine === 'volcengine_tts' && resolvedApiKey) {
        const result = await playChunks((chunk) => this.speakViaVolcengine(chunk, config, resolvedApiKey, resolvedRate, resolvedPitch, resolvedGain));
        if (result.canceled || result.completed) return;
        remainingChunks = remainingChunks.slice(result.nextIndex);
      }
      if (generation !== this.playbackGeneration) return;

      // 3. 如果选择了 Edge Neural，尝试神经网络语音
      if (resolvedEngine === 'edge_neural') {
        androidNativeAttempted = isAndroidNativeApp();
        const result = await playChunks((chunk) => this.speakViaEdgeNeural(chunk, config, resolvedRate, resolvedPitch));
        if (result.canceled || result.completed) return;
        remainingChunks = remainingChunks.slice(result.nextIndex);
      }
      if (generation !== this.playbackGeneration) return;

      // Android WebView 往往没有可用的 Web Speech，所有在线引擎失败后都先走原生插件。
      if (isAndroidNativeApp() && !androidNativeAttempted) {
        androidNativeAttempted = true;
        const result = await playChunks((chunk) => this.speakViaAndroidNative(chunk, config, resolvedRate, resolvedPitch));
        if (result.canceled || result.completed) return;
        remainingChunks = remainingChunks.slice(result.nextIndex);
      }
      if (generation !== this.playbackGeneration) return;

      // 浏览器原生模式保持本地，不再把私密对话发送到第三方免费 TTS。
      await playChunks(async (chunk) => {
        await this.speakViaWebSpeech(chunk, config, resolvedRate, resolvedPitch);
        return true;
      });
    } catch (e) {
      console.warn('TTS 合成异常，回退至本地语音:', e);
      try {
        if (isAndroidNativeApp() && !androidNativeAttempted) {
          const result = await playChunks((chunk) => this.speakViaAndroidNative(chunk, config, resolvedRate, resolvedPitch));
          if (result.canceled || result.completed) return;
          remainingChunks = remainingChunks.slice(result.nextIndex);
        }
        await playChunks(async (chunk) => {
          await this.speakViaWebSpeech(chunk, config, resolvedRate, resolvedPitch);
          return true;
        });
      } catch {}
    } finally {
      if (generation === this.playbackGeneration) {
        this.isSpeakingNow = false;
        this.currentSpokenText = null;
        this.notify();
      }
    }
  }

  /**
   * 方式 1：硅基流动大模型高保真语音 (CosyVoice2 / Fish-Speech)
   */
  private async speakViaSiliconFlow(
    text: string,
    config?: VoiceConfig,
    apiKey?: string,
    rate: number = 1.0,
    gain: number = 0,
  ): Promise<boolean> {
    if (!apiKey) return false;

    const controller = new AbortController();
    let canceled = false;
    const cancelRequest = () => {
      canceled = true;
      controller.abort();
    };
    this.currentPlaybackCancel = cancelRequest;
    const timeout = setTimeout(() => {
      canceled = true;
      controller.abort();
    }, 30_000);
    try {
      const model = normalizeSiliconflowTtsModel(this.defaults.siliconflowModel || DEFAULT_SILICONFLOW_TTS_MODEL);
      const selectedVoice = config?.siliconflowVoice
        || this.defaults.siliconflowVoice
        || (config?.gender === 'male' ? 'alex' : DEFAULT_SILICONFLOW_TTS_VOICE);
      const requestBody = buildSiliconflowTtsRequest(
        model,
        selectedVoice,
        text,
        config?.absoluteTuning ? config.rate : (config?.rate || 1.0) * rate,
        gain,
      );

      if (isAndroidNativeApp()) {
        const nativeResponse = await CapacitorHttp.post({
          url: 'https://api.siliconflow.cn/v1/audio/speech',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          data: requestBody,
          responseType: 'arraybuffer',
          connectTimeout: 30_000,
          readTimeout: 30_000,
        });
        if (canceled || nativeResponse.status < 200 || nativeResponse.status >= 300) {
          console.warn(`硅基流动 TTS 原生请求失败，HTTP ${nativeResponse.status}`);
          return false;
        }
        const audioBytes = decodeBase64Audio(nativeResponse.data);
        if (!audioBytes) {
          console.warn('硅基流动 TTS 原生响应不是有效的 Base64 音频');
          return false;
        }
        const audioCopy = new Uint8Array(audioBytes.byteLength);
        audioCopy.set(audioBytes);
        const audioUrl = URL.createObjectURL(new Blob([audioCopy.buffer], { type: 'audio/mpeg' }));
        await this.playAudioBlobUrl(audioUrl);
        return true;
      }

      const res = await fetch('https://api.siliconflow.cn/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!res.ok || canceled) return false;
      const declaredLength = Number(res.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > 20_000_000) return false;

      const blob = await res.blob();
      if (canceled || blob.size > 20_000_000) return false;
      const audioUrl = URL.createObjectURL(blob);
      await this.playAudioBlobUrl(audioUrl);
      return true;
    } catch (error) {
      console.warn('硅基流动 TTS 合成或播放失败:', error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      clearTimeout(timeout);
      if (this.currentPlaybackCancel === cancelRequest) this.currentPlaybackCancel = null;
    }
  }

  private async speakViaVolcengine(
    text: string,
    config: VoiceConfig | undefined,
    apiKey: string,
    rate: number,
    pitch: number,
    gain: number,
  ): Promise<boolean> {
    const controller = new AbortController();
    let canceled = false;
    const cancelRequest = () => {
      canceled = true;
      controller.abort();
    };
    this.currentPlaybackCancel = cancelRequest;
    const voice = config?.volcengineVoice
      || this.defaults.volcengineVoice
      || (config?.gender === 'male' ? 'zh_male_m191_uranus_bigtts' : VOLCENGINE_TTS_FEMALE_VOICE);
    const resourceId = this.defaults.volcengineResourceId || VOLCENGINE_TTS_RESOURCE_ID;
    try {
      const { response, text: responseText } = await fetchTextWithTimeout(VOLCENGINE_TTS_PLAN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'X-Api-Resource-Id': resourceId,
          'X-Api-Request-Id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          user: { uid: 'ycy_tts' },
          req_params: {
            text,
            speaker: voice,
            sample_rate: 24_000,
            audio_params: {
              format: 'mp3',
              bit_rate: 64_000,
              speech_rate: Math.round(Math.max(-50, Math.min(100, ((config?.absoluteTuning ? config.rate : (config?.rate || 1) * rate) - 1) * 100))),
              loudness_rate: Math.round(Math.max(-50, Math.min(100, gain * 10))),
            },
            additions: JSON.stringify({
              post_process: { pitch: Math.round(Math.max(-12, Math.min(12, ((config?.absoluteTuning ? config.pitch : (config?.pitch || 1) * pitch) - 1) * 12))) },
              disable_markdown_filter: true,
            }),
          },
        }),
        signal: controller.signal,
      }, {
        timeoutMs: 90_000,
        maxBytes: 20_000_000,
        timeoutMessage: '火山豆包 TTS 超过 90 秒未返回',
      });
      if (!response.ok || canceled) return false;
      const audioBytes = this.decodeVolcengineTtsAudio(responseText);
      if (canceled || !audioBytes || audioBytes.byteLength === 0 || audioBytes.byteLength > 20_000_000) return false;
      const audioCopy = new Uint8Array(audioBytes.byteLength);
      audioCopy.set(audioBytes);
      const audioUrl = URL.createObjectURL(new Blob([audioCopy.buffer], { type: 'audio/mpeg' }));
      await this.playAudioBlobUrl(audioUrl);
      return true;
    } catch {
      return false;
    } finally {
      if (this.currentPlaybackCancel === cancelRequest) this.currentPlaybackCancel = null;
    }
  }

  private decodeVolcengineTtsAudio(payload: string): Uint8Array | null {
    if (typeof atob !== 'function') return null;
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    for (const item of this.extractVolcengineJsonFrames(payload)) {
      try {
        const code = Number(item?.code ?? 0);
        if (code !== 0 && code !== 20_000_000) return null;
        if (typeof item?.data !== 'string' || !item.data) continue;
        const binary = atob(item.data);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        totalBytes += bytes.byteLength;
        if (totalBytes > 20_000_000) return null;
        chunks.push(bytes);
      } catch {
        // Keep scanning: SSE control frames do not contain audio payloads.
      }
    }
    if (chunks.length === 0) return null;
    const joined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return joined;
  }

  private extractVolcengineJsonFrames(payload: string): Array<Record<string, unknown>> {
    const frames: Array<Record<string, unknown>> = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < payload.length; index += 1) {
      const character = payload[index];
      if (start < 0) {
        if (character === '{') {
          start = index;
          depth = 1;
        }
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(payload.slice(start, index + 1));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              frames.push(parsed as Record<string, unknown>);
            }
          } catch {
            // Ignore non-JSON transport fragments and continue looking for the next frame.
          }
          start = -1;
        }
      }
    }
    return frames;
  }

  /**
   * 方式 3：Edge Neural 神经语音
   */
  private async speakViaEdgeNeural(
    text: string,
    config?: VoiceConfig,
    rate: number = 1.0,
    pitch: number = 1.0
  ): Promise<boolean> {
    const resolvedRate = Math.max(0.5, Math.min(2, (config?.rate || 1.0) * rate));
    const resolvedPitch = Math.max(0.5, Math.min(2, (config?.pitch || 1.0) * pitch));
    if (isAndroidNativeApp()) {
      try {
        await NativeTts.speak({ text, lang: 'zh-CN', rate: resolvedRate, pitch: resolvedPitch });
        return true;
      } catch (error) {
        console.warn('Android 原生语音不可用，尝试 Web Speech 回退:', error);
      }
    }

    const zhVoices = this.getChineseVoices();
    const targetName = config?.neuralVoice || (config?.gender === 'male' ? 'Yunxi' : 'Xiaoxiao');

    const onlineVoice = zhVoices.find(
      (v) => (v.name.includes(targetName) || v.name.includes('Natural') || v.name.includes('Online'))
    );

    if (onlineVoice && this.synth) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = onlineVoice;
      utterance.pitch = Math.min(1.5, resolvedPitch);
      utterance.rate = Math.max(0.6, Math.min(1.5, resolvedRate));
      utterance.lang = 'zh-CN';

      const succeeded = await new Promise<boolean>((resolve) => {
        let finished = false;
        const finish = (success = false) => {
          if (finished) return;
          finished = true;
          utterance.onend = null;
          utterance.onerror = null;
          if (this.currentPlaybackCancel === finish) this.currentPlaybackCancel = null;
          resolve(success);
        };
        this.currentPlaybackCancel = finish;
        utterance.onend = () => finish(true);
        utterance.onerror = () => finish(false);
        try { this.synth!.speak(utterance); } catch { finish(false); }
      });
      return succeeded;
    }

    return false;
  }

  private async speakViaAndroidNative(
    text: string,
    config?: VoiceConfig,
    rate: number = 1,
    pitch: number = 1,
  ): Promise<boolean> {
    if (!isAndroidNativeApp()) return false;
    try {
      const resolvedRate = Math.max(0.5, Math.min(2, config?.absoluteTuning ? config.rate : (config?.rate || 1) * rate));
      const resolvedPitch = Math.max(0.5, Math.min(2, config?.absoluteTuning ? config.pitch : (config?.pitch || 1) * pitch));
      await NativeTts.speak({ text, lang: 'zh-CN', rate: resolvedRate, pitch: resolvedPitch });
      return true;
    } catch (error) {
      console.warn('Android 原生语音回退失败:', error);
      return false;
    }
  }

  /**
   * 方式 4：浏览器本地 Web Speech
   */
  private speakViaWebSpeech(
    text: string,
    config?: VoiceConfig,
    globalRate: number = 1.0,
    globalPitch: number = 1.0
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!this.synth) {
        resolve();
        return;
      }

      try {
        this.synth.cancel();
      } catch {}

      const utterance = new SpeechSynthesisUtterance(text);
      (window as any).__currentUtterance = utterance;

      const voice = this.pickBestVoice(config);
      if (voice) {
        utterance.voice = voice;
      }

      const basePitch = config?.pitch ?? 1.0;
      const baseRate = config?.rate ?? 1.0;
      utterance.pitch = Math.max(0.5, Math.min(1.5, basePitch * globalPitch));
      utterance.rate = Math.max(0.6, Math.min(1.5, baseRate * globalRate));
      utterance.lang = 'zh-CN';

      let isFinished = false;
      let safetyTimer: ReturnType<typeof setTimeout> | null = null;
      const done = () => {
        if (!isFinished) {
          isFinished = true;
          if (safetyTimer) clearTimeout(safetyTimer);
          if (this.currentPlaybackCancel === done) this.currentPlaybackCancel = null;
          (window as any).__currentUtterance = null;
          resolve();
        }
      };
      this.currentPlaybackCancel = done;

      utterance.onend = done;
      utterance.onerror = done;

      // 超时安全兜底
      safetyTimer = setTimeout(done, Math.max(3000, text.length * 350));

      try {
        this.synth.speak(utterance);
      } catch {
        done();
      }
    });
  }

  private pickBestVoice(config?: VoiceConfig): SpeechSynthesisVoice | null {
    const zhVoices = this.getChineseVoices();
    if (zhVoices.length === 0) return null;

    if (config?.voiceName) {
      const matched = zhVoices.find((v) => v.name.includes(config.voiceName!));
      if (matched) return matched;
    }

    const gender = config?.gender || 'female';
    if (gender === 'male') {
      const maleVoice = zhVoices.find((v) => v.name.includes('Yunxi') || v.name.includes('Kangkang') || v.name.includes('Danny') || v.name.includes('男'));
      if (maleVoice) return maleVoice;
    } else {
      const femaleVoice = zhVoices.find((v) => v.name.includes('Xiaoxiao') || v.name.includes('Xiaoyi') || v.name.includes('Xiaohan') || v.name.includes('女'));
      if (femaleVoice) return femaleVoice;
    }

    return zhVoices[0];
  }

  private playAudioStreamUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      this.currentAudioElement = audio;
      audio.src = url;
      let finished = false;
      let safetyTimer: ReturnType<typeof setTimeout> | null = null;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        audio.onended = null;
        audio.onerror = null;
        if (this.currentAudioElement === audio) this.currentAudioElement = null;
        if (this.currentPlaybackCancel === finish) this.currentPlaybackCancel = null;
        error ? reject(error) : resolve();
      };
      this.currentPlaybackCancel = finish;

      audio.onended = () => finish();

      audio.onerror = () => finish(new Error('Audio stream error'));

      safetyTimer = setTimeout(() => finish(), 15000);

      audio.play().then(() => {
        // playing successfully
      }).catch((err) => {
        finish(err);
      });
    });
  }

  private playAudioBlobUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      this.currentAudioElement = audio;
      let finished = false;
      const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        audio.onended = null;
        audio.onerror = null;
        URL.revokeObjectURL(url);
        if (this.currentAudioElement === audio) this.currentAudioElement = null;
        if (this.currentPlaybackCancel === finish) this.currentPlaybackCancel = null;
        if (error) {
          reject(error instanceof Error ? error : new Error('音频播放失败'));
        } else {
          resolve();
        }
      };
      this.currentPlaybackCancel = finish;

      // Media event handlers receive an Event argument. Passing finish directly made a
      // normal `ended` event look like an error and incorrectly triggered local TTS fallback.
      audio.onended = () => finish();

      audio.onerror = () => finish(new Error('音频数据无法在当前设备播放'));

      audio.preload = 'auto';
      audio.setAttribute('playsinline', '');
      audio.src = url;
      audio.load();
      audio.play().catch((error) => finish(error));
    });
  }

  stop() {
    this.stopCurrentPlayback(true);
  }

  private stopCurrentPlayback(stopNative: boolean) {
    this.playbackGeneration++;
    const cancel = this.currentPlaybackCancel;
    this.currentPlaybackCancel = null;
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
        this.currentAudioElement = null;
      } catch {}
    }
    cancel?.();
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch {}
    }
    if (stopNative && isAndroidNativeApp()) {
      void NativeTts.stop().catch(() => undefined);
    }
    this.isSpeakingNow = false;
    this.currentSpokenText = null;
    this.notify();
  }

  async getAndroidTtsStatus() {
    if (!isAndroidNativeApp()) return null;
    return NativeTts.getStatus({ lang: 'zh-CN' });
  }

  async openAndroidTtsSettings(): Promise<boolean> {
    if (!isAndroidNativeApp()) return false;
    await NativeTts.openSettings();
    return true;
  }

  isSpeaking(): boolean {
    return this.isSpeakingNow;
  }
}
