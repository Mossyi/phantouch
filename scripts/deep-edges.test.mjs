import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const load = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const installMemory = () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
};

const clearRuntime = () => {
  globalThis.__YCY_DEVICE_MANAGER__?.simulator?.destroy?.();
  delete globalThis.__YCY_DEVICE_MANAGER__;
  delete globalThis.localStorage;
};

const setNavigator = (value) => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, enumerable: true, writable: true, value });
};

test('拒绝麦克风或没有麦克风时，通话停在错误态并显示中文原因', async () => {
  globalThis.window = globalThis;
  const originalNavigator = globalThis.navigator;
  const { VoiceCallSession } = await load('../src/core/voice/voiceCallSession.ts');
  const deps = {
    sttOptions: { engine: 'volcengine' },
    sendTurn: async () => '不应该发出',
    interruptTurn: () => undefined,
    prepareSpeech: (text) => ({ text, cancel() {}, play: async () => undefined }),
    stopSpeech: () => undefined,
  };
  try {
    setNavigator({
      mediaDevices: {
        getUserMedia: async () => {
          throw new DOMException('Permission denied', 'NotAllowedError');
        },
      },
    });
    const denied = new VoiceCallSession(deps);
    await denied.connect('（电话接通）');
    assert.equal(denied.getSnapshot().phase, 'error');
    assert.equal(denied.getSnapshot().error, '麦克风或语音识别权限被拒绝');
    assert.equal(denied.getSnapshot().aiCaption, '');

    setNavigator({
      mediaDevices: {
        getUserMedia: async () => {
          throw new DOMException('Requested device not found', 'NotFoundError');
        },
      },
    });
    const missingDevice = new VoiceCallSession(deps);
    await missingDevice.connect();
    assert.equal(missingDevice.getSnapshot().error, '没有找到可用的麦克风');

    setNavigator({});
    const unavailable = new VoiceCallSession(deps);
    await unavailable.connect();
    assert.equal(unavailable.getSnapshot().phase, 'error');
    assert.equal(unavailable.getSnapshot().error, '当前环境无法使用麦克风');
  } finally {
    if (originalNavigator === undefined) delete globalThis.navigator;
    else setNavigator(originalNavigator);
    delete globalThis.window;
  }
});

test('流式回复中途断开时保留已收到的文字，一个字都没收到则报错', async () => {
  const originalFetch = globalThis.fetch;
  installMemory();
  try {
    const { LLMClient } = await load('../src/core/ai/llmClient.ts');
    const history = [{ id: 'user-1', role: 'user', content: 'hello', timestamp: 1 }];
    const client = () => new LLMClient({
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'test-key',
      model: 'test-model',
      temperature: 0.7,
      selectedPersonaId: 'male_dom',
    }, { hardwareToolsEnabled: false });

    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'));
        controller.close();
      },
    }), { headers: { 'content-type': 'text/event-stream' } });
    const partials = [];
    const result = await client().sendMessage(history, [], undefined, undefined, (text) => partials.push(text));
    assert.equal(result.reply, '你好');
    assert.deepEqual(partials, ['你好']);

    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.close(); },
    }), { headers: { 'content-type': 'text/event-stream' } });
    await assert.rejects(
      client().sendMessage(history, [], undefined, undefined, () => undefined),
      /大模型未返回有效文本内容/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearRuntime();
  }
});

test('东京刚过午夜时，证书编号用当地日期，不用 UTC 的前一天', () => {
  const probe = `
    import { createSignedCertificateRecord } from './src/core/discipline/certificate.ts';
    const instant = new Date('2026-11-10T15:30:00.000Z');
    const record = createSignedCertificateRecord({
      participantName: '学员', mentorId: 'mentor', mentorName: '导师',
      themeId: 'story', termId: 'lasting', reviewId: '30d', clauseIds: [],
      signatureDataUrl: 'data:image/png;base64,AAAA',
    }, instant, () => 0);
    if (record.id !== 'YCY-20261111-000000') {
      console.error(record.id);
      process.exit(1);
    }
  `;
  const tokyo = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', probe], {
    cwd: repoRoot,
    env: { ...process.env, TZ: 'Asia/Tokyo' },
    encoding: 'utf8',
  });
  assert.equal(tokyo.status, 0, tokyo.stderr || tokyo.stdout);
  const utc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', probe.replace('20261111', '20261110')], {
    cwd: repoRoot,
    env: { ...process.env, TZ: 'UTC' },
    encoding: 'utf8',
  });
  assert.equal(utc.status, 0, utc.stderr || utc.stdout);
});

test('连点发送会在等待渲染前占住 isLoadingRef', () => {
  const source = readFileSync(new URL('../src/components/tavern/TavernChatTab.tsx', import.meta.url), 'utf8');
  const send = source.slice(source.indexOf('const handleSend = async'), source.indexOf('handleSendRef.current = handleSend'));
  assert.match(send, /if \(isLoadingRef\.current\) return/);
  const lockAt = send.indexOf('isLoadingRef.current = true');
  const groupAwait = send.indexOf('await handleGroupSend');
  assert.ok(lockAt > 0 && lockAt < groupAwait, '群聊发送必须先占住锁再 await');
  assert.match(send, /finally \{[\s\S]*isLoadingRef\.current = false/);
});
