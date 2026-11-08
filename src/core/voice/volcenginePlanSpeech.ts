/**
 * 火山方舟 Agent Plan 语音接口。
 * 文档：https://ark.volcengine.com/region:cn-beijing/docs/agent-plan-personal-voice-model
 * 合成与识别都在 openspeech 的 /api/v3/plan 下，不走文字 /responses。
 */
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
    request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, enable_ddc: true, show_utterances: true, enable_nonstream: true },
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

export const openPlanAsrSocket = (url: string, headers: Record<string, string>): WebSocket => {
  try {
    return new (WebSocket as unknown as new (target: string, options?: { headers?: Record<string, string> }) => WebSocket)(url, { headers });
  } catch {
    throw new Error('当前环境无法给 WebSocket 附加 Agent Plan 要求的 X-Api-Key。没有改用旧的录音文件接口，也没有改打文字 /responses。');
  }
};

export const transcribePlanAsr = async (input: {
  wav: Uint8Array;
  apiKey: string;
  resourceId?: string;
  signal?: AbortSignal;
  openSocket?: (url: string, headers: Record<string, string>) => PlanAsrSocket;
}): Promise<string> => {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error('请先填写火山方舟 Agent Plan 专属 API Key');
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
    const finish = (error?: Error, text = '') => {
      if (settled) return;
      settled = true;
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
    socket.onerror = () => finish(new Error('火山方舟 Plan 语音识别连接失败'));
    socket.onclose = () => finish(new Error('火山方舟 Plan 语音识别在返回文本前断开'));
    socket.onopen = () => {
      void (async () => {
        socket.send(await buildPlanAsrFullRequest(1));
        socket.send(await buildPlanAsrAudioRequest(2, input.wav, true));
      })().catch((error) => finish(error instanceof Error ? error : new Error('火山方舟 Plan 语音识别组包失败')));
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
        if (text || frame.isLast) finish(undefined, text);
      }).catch((error) => finish(error instanceof Error ? error : new Error('火山方舟 Plan 语音识别结果无法解析')));
    };
  });
  return transcript;
};
