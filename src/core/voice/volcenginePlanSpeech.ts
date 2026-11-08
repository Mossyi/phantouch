/**
 * 火山方舟 Agent Plan 语音接口。
 * 文档：https://ark.volcengine.com/region:cn-beijing/docs/agent-plan-personal-voice-model
 * 识别协议：https://docs.volcengine.com/docs/doubao-voice/large-model-streaming-automatic-speech-recognition-api-1?lang=zh
 * 合成与识别都在 openspeech 的 /api/v3/plan 下，不走文字 /responses。
 * 官方目前只接受 16000 Hz、16 bit、单声道 PCM WAV。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
export const VOLCENGINE_PLAN_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional';
export const VOLCENGINE_PLAN_TTS_RESOURCE = 'seed-tts-2.0';
export const VOLCENGINE_PLAN_ASR_URL = 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream';
export const VOLCENGINE_PLAN_ASR_RESOURCE = 'volc.seedasr.sauc.duration';
export const LEGACY_VOLCENGINE_STT_RESOURCE = 'volc.bigasr.auc_turbo';

const FULL_REQUEST = 0b0001;
const AUDIO_ONLY = 0b0010;
const SERVER_RESPONSE = 0b1001;
const SERVER_ERROR = 0b1111;
const POS_SEQUENCE = 0b0001;
const NEG_WITH_SEQUENCE = 0b0011;
const JSON_SERIAL = 0b0001;
const GZIP = 0b0001;

export const resolveVolcenginePlanSttResource = (value: unknown): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text === LEGACY_VOLCENGINE_STT_RESOURCE) return VOLCENGINE_PLAN_ASR_RESOURCE;
  return text.slice(0, 200);
};

const concat = (parts: Uint8Array[]) => {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const u32 = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
};

const i32 = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, false);
  return bytes;
};

const asBlob = (data: Uint8Array) => {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy]);
};

export const gzipBytes = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = asBlob(data).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export const gunzipBytes = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = asBlob(data).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const header = (messageType: number, flags: number) => Uint8Array.of(
  (0b0001 << 4) | 0b0001,
  (messageType << 4) | flags,
  (JSON_SERIAL << 4) | GZIP,
  0,
);

export const buildPlanAsrFullRequest = async (seq: number): Promise<Uint8Array> => {
  const payload = await gzipBytes(new TextEncoder().encode(JSON.stringify({
    user: { uid: 'ycy_voice_input' },
    audio: { format: 'wav', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
    request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, enable_ddc: true, show_utterances: true, enable_nonstream: false },
  })));
  return concat([header(FULL_REQUEST, POS_SEQUENCE), i32(seq), u32(payload.length), payload]);
};

export const buildPlanAsrAudioRequest = async (seq: number, segment: Uint8Array, isLast: boolean): Promise<Uint8Array> => {
  const payload = await gzipBytes(segment);
  const flags = isLast ? NEG_WITH_SEQUENCE : POS_SEQUENCE;
  return concat([header(AUDIO_ONLY, flags), i32(isLast ? -seq : seq), u32(payload.length), payload]);
};

export interface PlanAsrFrame {
  messageType: number;
  isLast: boolean;
  code: number;
  payload: unknown;
}

export const parsePlanAsrFrame = async (frame: Uint8Array): Promise<PlanAsrFrame> => {
  if (frame.length < 4) throw new Error('火山方舟 Plan 语音识别返回了不完整的数据帧');
  const headerSize = (frame[0] & 0x0f) * 4;
  const messageType = frame[1] >> 4;
  const flags = frame[1] & 0x0f;
  const compression = frame[2] & 0x0f;
  let payload: Uint8Array<ArrayBufferLike> = frame.slice(headerSize);
  const isLast = (flags & 0x02) !== 0;
  if (flags & 0x01) payload = payload.slice(4);
  if (flags & 0x04) payload = payload.slice(4);
  let code = 0;
  if (messageType === SERVER_RESPONSE) payload = payload.slice(4);
  else if (messageType === SERVER_ERROR) {
    code = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getInt32(0, false);
    payload = payload.slice(8);
  }
  if (compression === GZIP && payload.length) payload = await gunzipBytes(payload);
  let parsed: unknown = null;
  if (payload.length) {
    try { parsed = JSON.parse(new TextDecoder().decode(payload)); } catch { parsed = null; }
  }
  return { messageType, isLast, code, payload: parsed };
};

export const extractPlanAsrText = (payload: unknown): string => {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const result = record.result && typeof record.result === 'object' ? record.result as Record<string, unknown> : record;
  const text = result.text ?? record.text;
  return typeof text === 'string' ? text.trim() : '';
};

export interface PlanAsrSocket {
  send(data: Uint8Array): void;
  close(): void;
  binaryType?: BinaryType;
  onopen: (() => void) | null;
  onmessage: ((event: { data: ArrayBuffer | Uint8Array }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
}

interface PlanAsrNativeBridge {
  open(options: { url: string; headers: Record<string, string>; connectTimeoutMs?: number }): Promise<{ socketId: string }>;
  send(options: { socketId: string; data: string }): Promise<void>;
  close(options: { socketId: string }): Promise<void>;
  addListener(event: 'open' | 'message' | 'error' | 'close', handler: (payload: { socketId?: string; data?: string; message?: string }) => void): Promise<{ remove(): Promise<void> | void }>;
}

const NativePlanAsr = registerPlugin<PlanAsrNativeBridge>('NativePlanAsr');
let nativeBridgeOverride: PlanAsrNativeBridge | null = null;

/** 测试注入原生桥。传 null 恢复真实插件。 */
export const usePlanAsrNativeBridgeForTests = (bridge: PlanAsrNativeBridge | null) => {
  nativeBridgeOverride = bridge;
};

const bytesToBase64 = (data: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < data.length; offset += 0x8000) {
    binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
};

const redactSecret = (message: string, headers: Record<string, string>) => {
  let text = message || '火山方舟 Plan 语音识别连接失败';
  const secret = headers['X-Api-Key'] || '';
  if (secret.length >= 4) text = text.split(secret).join('');
  return text.replace(/x-api-key\s*[:=]\s*\S+/ig, '').trim().slice(0, 180) || '火山方舟 Plan 语音识别连接失败';
};

const createBridgeSocket = (bridge: PlanAsrNativeBridge, url: string, headers: Record<string, string>): PlanAsrSocket => {
  let socketId = '';
  let closed = false;
  const pending: Uint8Array[] = [];
  const handles: Array<{ remove(): Promise<void> | void }> = [];
  const socket: PlanAsrSocket = {
    binaryType: 'arraybuffer',
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data) {
      if (closed) return;
      if (!socketId) {
        pending.push(data);
        return;
      }
      void bridge.send({ socketId, data: bytesToBase64(data) }).catch((error) => {
        if (closed) return;
        const message = error instanceof Error ? error.message : '';
        socket.onerror?.(new Error(redactSecret(message, headers)));
      });
    },
    close() {
      if (closed) return;
      closed = true;
      const id = socketId;
      socketId = '';
      handles.splice(0).forEach((handle) => { void handle.remove(); });
      if (id) void bridge.close({ socketId: id }).catch(() => undefined);
      socket.onclose?.();
    },
  };
  const belongs = (payload: { socketId?: string }) => !socketId || payload.socketId === socketId;
  queueMicrotask(() => {
    void (async () => {
      handles.push(await bridge.addListener('open', (payload) => {
        if (closed || !belongs(payload)) return;
        const queued = pending.splice(0);
        socket.onopen?.();
        queued.forEach((data) => socket.send(data));
      }));
      handles.push(await bridge.addListener('message', (payload) => {
        if (closed || !belongs(payload) || !payload.data) return;
        socket.onmessage?.({ data: base64ToBytes(payload.data) });
      }));
      handles.push(await bridge.addListener('error', (payload) => {
        if (closed || !belongs(payload)) return;
        socket.onerror?.(new Error(redactSecret(payload.message || '', headers)));
      }));
      handles.push(await bridge.addListener('close', (payload) => {
        if (closed || (socketId && payload.socketId && payload.socketId !== socketId)) return;
        socket.close();
      }));
      if (closed) {
        handles.splice(0).forEach((handle) => { void handle.remove(); });
        return;
      }
      const opened = await bridge.open({ url, headers, connectTimeoutMs: 12000 });
      if (closed) {
        void bridge.close({ socketId: opened.socketId }).catch(() => undefined);
        handles.splice(0).forEach((handle) => { void handle.remove(); });
        return;
      }
      socketId = opened.socketId;
      pending.splice(0).forEach((data) => socket.send(data));
    })().catch((error) => {
      if (closed) return;
      socket.onerror?.(error instanceof Error ? new Error(redactSecret(error.message, headers)) : new Error('火山方舟 Plan 语音识别连接失败'));
      socket.close();
    });
  });
  return socket;
};

export const openPlanAsrSocket = (url: string, headers: Record<string, string>): PlanAsrSocket => {
  if (nativeBridgeOverride || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')) {
    return createBridgeSocket(nativeBridgeOverride || NativePlanAsr, url, headers);
  }
  try {
    return new (WebSocket as unknown as new (target: string, options?: { headers?: Record<string, string> }) => PlanAsrSocket)(url, { headers });
  } catch {
    throw new Error('当前环境无法给 WebSocket 附加 Agent Plan 要求的 X-Api-Key。没有改用旧的录音文件接口，也没有改打文字 /responses。');
  }
};

const readAscii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));

const parseWav = (wav: Uint8Array) => {
  if (wav.length < 44 || readAscii(wav, 0, 4) !== 'RIFF' || readAscii(wav, 8, 4) !== 'WAVE') return null;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let data: Uint8Array | null = null;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = readAscii(wav, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === 'fmt ' && size >= 16) {
      audioFormat = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      bitsPerSample = view.getUint16(start + 14, true);
    } else if (id === 'data') {
      data = wav.slice(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!data || !channels || !sampleRate || !bitsPerSample) return null;
  return { audioFormat, channels, sampleRate, bitsPerSample, data };
};

const encodePcm16Wav = (samples: Int16Array, sampleRate: number) => {
  const out = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(out.buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) out[offset + index] = value.charCodeAt(index);
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) view.setInt16(44 + index * 2, samples[index], true);
  return out;
};

/** 官方识别只接受 16 kHz / 16 bit / 单声道 PCM WAV。其它采样率在发送前线性重采样。 */
export const ensurePlanAsrWav = (wav: Uint8Array): Uint8Array => {
  const parsed = parseWav(wav);
  if (!parsed) throw new Error('录音不是可用的 WAV，无法送去识别');
  if (parsed.audioFormat !== 1 || parsed.bitsPerSample !== 16) throw new Error('录音不是 16 bit PCM，无法送去识别');
  if (parsed.sampleRate === 16000 && parsed.channels === 1) return wav;
  const frameCount = Math.floor(parsed.data.length / 2 / parsed.channels);
  const view = new DataView(parsed.data.buffer, parsed.data.byteOffset, parsed.data.byteLength);
  const mono = new Int16Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < parsed.channels; channel += 1) sum += view.getInt16((frame * parsed.channels + channel) * 2, true);
    mono[frame] = Math.max(-32768, Math.min(32767, Math.round(sum / parsed.channels)));
  }
  const outCount = Math.max(1, Math.round(mono.length * 16000 / parsed.sampleRate));
  const resampled = new Int16Array(outCount);
  for (let index = 0; index < outCount; index += 1) {
    const position = index * parsed.sampleRate / 16000;
    const left = Math.floor(position);
    const right = Math.min(mono.length - 1, left + 1);
    const fraction = position - left;
    resampled[index] = Math.round(mono[left] * (1 - fraction) + mono[right] * fraction);
  }
  return encodePcm16Wav(resampled, 16000);
};

export const splitPlanAsrAudio = (wav: Uint8Array, segmentMs = 200): Uint8Array[] => {
  const parsed = parseWav(wav);
  const bytesPerSecond = parsed ? parsed.channels * (parsed.bitsPerSample / 8) * parsed.sampleRate : 32000;
  const segmentSize = Math.max(1, Math.floor(bytesPerSecond * segmentMs / 1000));
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < wav.length; offset += segmentSize) parts.push(wav.slice(offset, Math.min(wav.length, offset + segmentSize)));
  return parts.length ? parts : [wav];
};

const waitForSegment = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (!ms) {
    resolve();
    return;
  }
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'));
    return;
  }
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  const onAbort = () => {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  };
  signal?.addEventListener('abort', onAbort, { once: true });
});

export const transcribePlanAsr = async (input: {
  wav: Uint8Array;
  apiKey: string;
  resourceId?: string;
  signal?: AbortSignal;
  openSocket?: (url: string, headers: Record<string, string>) => PlanAsrSocket;
  segmentDelayMs?: number;
}): Promise<string> => {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error('请先填写火山方舟 Agent Plan 专属 API Key');
  const wav = ensurePlanAsrWav(input.wav);
  const segments = splitPlanAsrAudio(wav, 200);
  const headers = {
    'X-Api-Key': apiKey,
    'X-Api-Resource-Id': resolveVolcenginePlanSttResource(input.resourceId),
    'X-Api-Request-Id': crypto.randomUUID(),
    'X-Api-Connect-Id': crypto.randomUUID(),
    'X-Api-Sequence': '-1',
  };
  const socket = (input.openSocket ?? openPlanAsrSocket)(VOLCENGINE_PLAN_ASR_URL, headers);
  const transcript = await new Promise<string>((resolve, reject) => {
    let settled = false;
    let audioStarted = false;
    let latest = '';
    const timeout = setTimeout(() => finish(new Error('火山方舟 Plan 语音识别超时')), 25000);
    const finish = (error?: Error, text = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', abort);
      socket.close();
      if (error) reject(error);
      else resolve(text);
    };
    const abort = () => finish(new DOMException('Aborted', 'AbortError'));
    if (input.signal?.aborted) {
      abort();
      return;
    }
    input.signal?.addEventListener('abort', abort);
    socket.binaryType = 'arraybuffer';
    socket.onerror = (error) => finish(new Error(error instanceof Error && error.message ? error.message : '火山方舟 Plan 语音识别连接失败'));
    socket.onclose = () => finish(new Error('火山方舟 Plan 语音识别在返回文本前断开'));
    const sendAudio = async () => {
      const delay = input.segmentDelayMs ?? 200;
      for (let index = 0; index < segments.length; index += 1) {
        if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const isLast = index === segments.length - 1;
        socket.send(await buildPlanAsrAudioRequest(index + 2, segments[index], isLast));
        if (!isLast) await waitForSegment(delay, input.signal);
      }
    };
    socket.onopen = () => {
      void buildPlanAsrFullRequest(1).then((frame) => socket.send(frame)).catch((error) => {
        finish(error instanceof Error ? error : new Error('火山方舟 Plan 语音识别组包失败'));
      });
    };
    socket.onmessage = (event: { data: ArrayBuffer | Uint8Array }) => {
      const bytes = event.data instanceof Uint8Array ? event.data : new Uint8Array(event.data);
      void parsePlanAsrFrame(bytes).then((frame) => {
        if (frame.code) {
          const message = frame.payload && typeof frame.payload === 'object' && 'message' in frame.payload
            ? String((frame.payload as { message?: unknown }).message || '')
            : '';
          finish(new Error(message || `火山方舟 Plan 语音识别失败 (${frame.code})`));
          return;
        }
        const text = extractPlanAsrText(frame.payload);
        if (text) latest = text;
        if (!audioStarted) {
          audioStarted = true;
          void sendAudio().catch((error) => finish(error instanceof Error ? error : new Error('火山方舟 Plan 语音识别组包失败')));
        }
        if (frame.isLast) finish(undefined, latest);
      }).catch((error) => finish(error instanceof Error ? error : new Error('火山方舟 Plan 语音识别结果无法解析')));
    };
  });
  return transcript;
};
