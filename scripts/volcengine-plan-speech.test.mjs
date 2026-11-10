import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const load = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

test('Plan 旧模型别名只在方舟地址上迁移，自定义地址和自定义模型保持不动', async () => {
  const { normalizeLlmConfig } = await load('../src/core/llmConfig.ts');
  const base = { apiKey: 'kept-key', temperature: 0.4, selectedPersonaId: 'male_dom' };
  const planLite = normalizeLlmConfig({
    ...base,
    baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    model: 'doubao-seed-2.0-lite',
  });
  assert.equal(planLite.model, 'doubao-seed-2.1-lite');
  assert.equal(planLite.apiKey, 'kept-key');
  const custom = normalizeLlmConfig({
    ...base,
    baseUrl: 'https://example.com/v1',
    model: 'doubao-seed-2.0-lite',
  });
  assert.equal(custom.baseUrl, 'https://example.com/v1');
  assert.equal(custom.model, 'doubao-seed-2.0-lite');
  assert.equal(custom.apiKey, 'kept-key');
  const privateModel = normalizeLlmConfig({
    ...base,
    baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    model: 'my-private-model',
  });
  assert.equal(privateModel.model, 'my-private-model');
  assert.equal(privateModel.apiKey, 'kept-key');
});

const wavFromSamples = (sampleRate, samples) => {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => data.writeInt16LE(sample, index * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([header, data]));
};

const serverFrame = async (speech, payload, isLast) => {
  const body = await speech.gzipBytes(new TextEncoder().encode(JSON.stringify(payload)));
  const frame = new Uint8Array((isLast ? 8 : 12) + body.length);
  frame[0] = 0x11;
  frame[1] = (0b1001 << 4) | (isLast ? 0b0010 : 0b0001);
  frame[2] = 0x11;
  const view = new DataView(frame.buffer);
  if (!isLast) view.setInt32(4, 1, false);
  view.setUint32(isLast ? 4 : 8, body.length, false);
  frame.set(body, isLast ? 8 : 12);
  return frame;
};

test('Plan 语音识别走官方 WebSocket，合成不打到文字 /responses', async () => {
  const speech = await load('../src/core/voice/volcenginePlanSpeech.ts');
  const stt = await load('../src/core/voice/sttManager.ts');
  assert.equal(speech.resolveVolcenginePlanSttResource(''), speech.VOLCENGINE_PLAN_ASR_RESOURCE);
  assert.equal(speech.resolveVolcenginePlanSttResource('volc.bigasr.auc_turbo'), speech.VOLCENGINE_PLAN_ASR_RESOURCE);
  assert.equal(speech.resolveVolcenginePlanSttResource('custom-resource'), 'custom-resource');
  const options = stt.buildSttOptions(
    { sttEngine: 'volcengine', volcengineSttApiKey: '', volcengineSttAppId: 'old-app', volcengineSttAccessKey: 'old-token' },
    [{ baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3', apiKey: 'plan-key' }],
  );
  assert.equal(options.volcengineApiKey, 'plan-key');
  assert.equal(options.volcengineAppId, 'old-app');
  const explicit = stt.buildSttOptions(
    { sttEngine: 'volcengine', volcengineSttApiKey: 'speech-key' },
    [{ baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3', apiKey: 'plan-key' }],
  );
  assert.equal(explicit.volcengineApiKey, 'speech-key');

  const frames = [];
  let opened;
  let closed = 0;
  const ack = await serverFrame(speech, {}, false);
  const done = await serverFrame(speech, { result: { text: '点名开始' } }, true);
  const result = await speech.transcribePlanAsr({
    wav: wavFromSamples(16000, [1000, -1000, 500, -500]),
    apiKey: 'plan-key',
    resourceId: 'volc.bigasr.auc_turbo',
    segmentDelayMs: 0,
    openSocket: (url, headers) => {
      opened = { url, headers };
      const socket = {
        binaryType: 'blob',
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send(data) {
          frames.push(data);
          if (frames.length === 1) queueMicrotask(() => socket.onmessage?.({ data: ack.buffer }));
          if (frames.length === 2) queueMicrotask(() => socket.onmessage?.({ data: done.buffer }));
        },
        close() { closed += 1; socket.onclose?.(); },
      };
      queueMicrotask(() => socket.onopen?.());
      return socket;
    },
  });
  assert.equal(opened.url, 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream');
  assert.equal(opened.headers['X-Api-Key'], 'plan-key');
  assert.equal(opened.headers['X-Api-Resource-Id'], 'volc.seedasr.sauc.duration');
  assert.equal(opened.url.includes('plan-key'), false);
  assert.equal(opened.url.includes('/responses'), false);
  assert.equal(frames.length, 2);
  const requestPayload = await speech.gunzipBytes(frames[0].slice(12));
  const request = JSON.parse(new TextDecoder().decode(requestPayload));
  assert.equal(request.audio.rate, 16000);
  assert.equal(request.audio.format, 'wav');
  assert.equal(request.request.enable_nonstream, false);
  assert.equal(result, '点名开始');
  assert.equal(closed > 0, true);
  assert.equal(speech.VOLCENGINE_PLAN_TTS_ENDPOINT, 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional');
  assert.equal(speech.VOLCENGINE_PLAN_TTS_ENDPOINT.includes('/responses'), false);
});

test('48 kHz 录音会转成官方 16 kHz，取消会关掉连接且错误不含 Key', async () => {
  const speech = await load('../src/core/voice/volcenginePlanSpeech.ts');
  const source = wavFromSamples(48000, Array.from({ length: 48 }, (_, index) => (index < 24 ? 8000 : -8000)));
  const converted = speech.ensurePlanAsrWav(source);
  assert.equal(new DataView(converted.buffer, converted.byteOffset).getUint32(24, true), 16000);
  assert.equal(converted.length, 44 + 16 * 2);
  const already = wavFromSamples(16000, [1, 2, 3]);
  assert.equal(speech.ensurePlanAsrWav(already), already);

  const controller = new AbortController();
  let closed = 0;
  await assert.rejects(
    speech.transcribePlanAsr({
      wav: already,
      apiKey: 'secret-plan-key',
      segmentDelayMs: 0,
      signal: controller.signal,
      openSocket: () => {
        const socket = {
          onopen: null,
          onmessage: null,
          onerror: null,
          onclose: null,
          send() {},
          close() { closed += 1; },
        };
        queueMicrotask(() => {
          socket.onopen?.();
          controller.abort();
        });
        return socket;
      },
    }),
    (error) => error?.name === 'AbortError' && !String(error).includes('secret-plan-key'),
  );
  assert.equal(closed > 0, true);

  speech.usePlanAsrNativeBridgeForTests({
    async open() { return { socketId: 's1' }; },
    async send() { throw new Error('连接失败 secret-plan-key'); },
    async close() {},
    async addListener(event, handler) {
      if (event === 'open') queueMicrotask(() => handler({ socketId: 's1' }));
      return { remove() {} };
    },
  });
  try {
    await assert.rejects(
      speech.transcribePlanAsr({
        wav: already,
        apiKey: 'secret-plan-key',
        segmentDelayMs: 0,
      }),
      (error) => error instanceof Error && !error.message.includes('secret-plan-key'),
    );
  } finally {
    speech.usePlanAsrNativeBridgeForTests(null);
  }
});
