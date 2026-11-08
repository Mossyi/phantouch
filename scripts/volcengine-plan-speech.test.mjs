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
  const result = await speech.transcribePlanAsr({
    wav: new Uint8Array([1, 2, 3, 4]),
    apiKey: 'plan-key',
    resourceId: 'volc.bigasr.auc_turbo',
    openSocket: (url, headers) => {
      opened = { url, headers };
      const socket = {
        binaryType: 'blob',
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send(data) { frames.push(data); },
        close() { socket.onclose?.(); },
      };
      queueMicrotask(() => {
        socket.onopen?.();
        void (async () => {
          while (frames.length < 2) await new Promise((resolve) => setTimeout(resolve, 0));
          const payload = await speech.gzipBytes(new TextEncoder().encode(JSON.stringify({ result: { text: '点名开始' } })));
          const frame = new Uint8Array(8 + payload.length);
          frame[0] = 0x11;
          frame[1] = (0b1001 << 4) | 0b0010;
          frame[2] = 0x11;
          new DataView(frame.buffer).setUint32(4, payload.length, false);
          frame.set(payload, 8);
          socket.onmessage?.({ data: frame.buffer });
        })();
      });
      return socket;
    },
  });
  assert.equal(opened.url, 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream');
  assert.equal(opened.headers['X-Api-Key'], 'plan-key');
  assert.equal(opened.headers['X-Api-Resource-Id'], 'volc.seedasr.sauc.duration');
  assert.equal(opened.url.includes('/responses'), false);
  assert.equal(frames.length, 2);
  assert.equal(result, '点名开始');
  assert.equal(speech.VOLCENGINE_PLAN_TTS_ENDPOINT, 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional');
  assert.equal(speech.VOLCENGINE_PLAN_TTS_ENDPOINT.includes('/responses'), false);
});
