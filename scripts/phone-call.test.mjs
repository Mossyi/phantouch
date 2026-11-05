import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * 酒馆语音通话：流式分句、语音活动检测、通话会话（逐句朗读 / 插话打断 / 回声过滤）。
 */

const loadBundledModule = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const strip = (text) => text.replace(/\s/g, '');

test('流式分句：逐字输入时按句切出，首句在逗号处提前开口，不重复也不遗漏', async () => {
  const { SpeechSegmenter } = await loadBundledModule('../src/core/voice/speechSegmenter.ts');
  const reply = '嗯……你终于舍得打给我了，我还以为你把我忘了呢。今天过得怎么样？是不是又熬夜了！说实话哦';
  const segmenter = new SpeechSegmenter();
  const emitted = [];
  let firstAt = -1;
  for (let index = 1; index <= reply.length; index += 1) {
    const out = segmenter.push(reply.slice(0, index));
    if (out.length && firstAt < 0) firstAt = index;
    emitted.push(...out);
  }
  emitted.push(...segmenter.flush());
  assert.equal(strip(emitted.join('')), strip(reply), '拼回去必须与原文一致');
  assert.ok(emitted[0].endsWith('，'), `首句应在逗号处提前切出，实际：${emitted[0]}`);
  assert.ok(firstAt < reply.indexOf('。'), '第一句在第一个句号之前就该开始朗读');
  assert.ok(emitted.includes('今天过得怎么样？'));
  assert.equal(emitted.at(-1), '说实话哦', '没有句末标点的结尾在 flush 时读出');
});

test('流式分句：未闭合的状态注释 / 硬件标记不会被读出来', async () => {
  const { SpeechSegmenter } = await loadBundledModule('../src/core/voice/speechSegmenter.ts');
  const segmenter = new SpeechSegmenter();
  const out = [
    ...segmenter.push('好呀，我等你哦。<!--STA'),
    ...segmenter.push('好呀，我等你哦。<!--STATUS:{"favor":"+2"'),
    ...segmenter.flush(),
  ];
  assert.ok(out.every((piece) => !piece.includes('<') && !piece.includes('STATUS')), out.join('|'));
  assert.equal(strip(out.join('')), '好呀，我等你哦。');
});

test('流式分句：过短的碎句并入下一句，过长的句子在逗号处切开', async () => {
  const { SpeechSegmenter } = await loadBundledModule('../src/core/voice/speechSegmenter.ts');
  const short = new SpeechSegmenter();
  const merged = [...short.push('嗯。好。我知道啦，那就这样吧。'), ...short.flush()];
  assert.ok(!merged.includes('嗯。'), `「嗯。」不应单独成句：${merged.join('|')}`);
  const long = new SpeechSegmenter({ maxChars: 20 });
  const pieces = [...long.push('第一句先说完。' + '这是一段很长很长的话没有句号只有逗号，'.repeat(3) + '最后结束。'), ...long.flush()];
  assert.ok(pieces.every((piece) => piece.length <= 40), pieces.join('|'));
});

test('语音活动检测：持续开口才算说话，停顿后判定说完；角色说话时需要更大声更久才算插话', async () => {
  const { VoiceActivityDetector } = await loadBundledModule('../src/core/voice/voiceActivity.ts');
  const vad = new VoiceActivityDetector();
  let t = 0;
  const run = (level, ms, peer = false) => {
    const events = [];
    for (let elapsed = 0; elapsed < ms; elapsed += 40) {
      t += 40;
      const event = vad.feed(level, t, peer);
      if (event) events.push(event);
    }
    return events;
  };
  assert.deepEqual(run(0.003, 2000), [], '安静时无事件');
  assert.deepEqual(run(0.2, 80), [], '80ms 的碰麦声不算开口');
  assert.deepEqual(run(0.003, 200), []);
  assert.deepEqual(run(0.08, 600), ['speech_start']);
  assert.deepEqual(run(0.003, 400), [], '短停顿不算说完');
  assert.deepEqual(run(0.08, 300), []);
  assert.deepEqual(run(0.003, 900), ['speech_end']);

  // 角色说话：扬声器回声电平略高于普通阈值但低于插话阈值，不能误判
  const echoLevel = vad.getThreshold(false) * 1.5;
  assert.ok(echoLevel < vad.getThreshold(true));
  assert.deepEqual(run(echoLevel, 1500, true), [], '回声不触发插话');
  assert.deepEqual(run(0.15, 250, true), [], '插话需要持续更久');
  assert.deepEqual(run(0.003, 200, true), []);
  assert.deepEqual(run(0.15, 500, true), ['speech_start'], '真正开口插话');
});

/** 可控的 Web Speech 识别器替身 */
class FakeRecognition {
  static instance = null;
  constructor() { FakeRecognition.instance = this; }
  start() { this.started = true; }
  abort() { this.started = false; }
  emit(text, isFinal) {
    const result = Object.assign([{ transcript: text }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

const setupSession = async ({ chunks = ['你终于打来啦，', '我等你好久了。', '今天想聊点什么？'] } = {}) => {
  globalThis.window = globalThis;
  globalThis.webkitSpeechRecognition = FakeRecognition;
  const { VoiceCallSession } = await loadBundledModule('../src/core/voice/voiceCallSession.ts');
  const log = { sent: [], spoken: [], interrupts: 0, stops: 0 };
  let abortCurrent = null;
  const deps = {
    sttOptions: { engine: 'browser' },
    sendTurn: async (text, hooks) => {
      log.sent.push(text);
      let aborted = false;
      abortCurrent = () => { aborted = true; };
      let visible = '';
      for (const chunk of chunks) {
        await sleep(15);
        if (aborted) return null;
        visible += chunk;
        hooks.onVisibleText(visible);
      }
      return visible;
    },
    interruptTurn: () => { log.interrupts += 1; abortCurrent?.(); },
    prepareSpeech: (text) => {
      let canceled = false;
      return {
        text,
        cancel: () => { canceled = true; },
        play: async () => { if (!canceled) { log.spoken.push(text); await sleep(60); } },
      };
    },
    stopSpeech: () => { log.stops += 1; },
  };
  const session = new VoiceCallSession(deps);
  const phases = [];
  session.subscribe((snapshot) => { if (phases.at(-1) !== snapshot.phase) phases.push(snapshot.phase); });
  return { session, log, phases, recognition: () => FakeRecognition.instance };
};

const cleanupGlobals = () => {
  delete globalThis.webkitSpeechRecognition;
  delete globalThis.window;
};

test('通话会话：接通后角色先开口，回复逐句朗读，播完回到聆听；你说完一句自动发出', async () => {
  const { session, log, phases, recognition } = await setupSession();
  try {
    await session.connect('（📞 电话接通）');
    await sleep(5);
    assert.deepEqual(log.sent, ['（📞 电话接通）']);
    await sleep(400);
    // 首个短句（不足 10 字）并入下一句，避免只为几个字单独请求一次合成
    assert.deepEqual(log.spoken, ['你终于打来啦，我等你好久了。', '今天想聊点什么？']);
    assert.equal(session.getSnapshot().phase, 'listening');
    assert.ok(phases.includes('thinking') && phases.includes('speaking'));

    recognition().emit('今天有点累', false);
    assert.equal(session.getSnapshot().phase, 'user_speaking');
    recognition().emit('今天有点累', true);
    await sleep(700);
    assert.deepEqual(log.sent, ['（📞 电话接通）', '今天有点累']);
  } finally {
    session.hangUp();
    cleanupGlobals();
  }
});

test('通话会话：角色说话时开口即打断——停止朗读、中止生成，剩下的句子不再播放', async () => {
  const { session, log, recognition } = await setupSession({
    chunks: ['第一句先说完。', '第二句也说完。', '第三句不该被读到。', '第四句也不该。'],
  });
  try {
    await session.connect('（📞 电话接通）');
    await sleep(70);
    assert.equal(session.getSnapshot().phase, 'speaking');
    recognition().emit('等一下我想说', false);
    assert.ok(log.interrupts >= 1, '中止了生成');
    assert.ok(log.stops >= 1, '停止了朗读');
    assert.equal(session.getSnapshot().phase, 'user_speaking');
    await sleep(400);
    assert.ok(!log.spoken.includes('第三句不该被读到。'), log.spoken.join('|'));
  } finally {
    session.hangUp();
    cleanupGlobals();
  }
});

test('通话会话：识别到的只是角色自己正在说的话（回声）时不算插话', async () => {
  const { session, log, recognition } = await setupSession({
    chunks: ['今天的月亮特别圆呢。', '你那边能看到吗？'],
  });
  try {
    await session.connect('（📞 电话接通）');
    await sleep(40);
    const caption = session.getSnapshot().aiCaption;
    assert.ok(caption, '正在朗读');
    recognition().emit(caption.slice(0, 6), false);
    assert.equal(log.interrupts, 0, '回声不应打断');
    session.setBargeInEnabled(false);
    recognition().emit('等一下我想说', false);
    assert.equal(log.interrupts, 0, '关闭插话后角色说话期间不收音');
  } finally {
    session.hangUp();
    cleanupGlobals();
  }
});

test('通话会话：浏览器不支持语音识别时给出可操作的提示', async () => {
  globalThis.window = globalThis;
  const { VoiceCallSession } = await loadBundledModule('../src/core/voice/voiceCallSession.ts');
  const session = new VoiceCallSession({
    sttOptions: { engine: 'browser' },
    sendTurn: async () => null,
    interruptTurn: () => {},
    prepareSpeech: (text) => ({ text, play: async () => {}, cancel: () => {} }),
    stopSpeech: () => {},
  });
  try {
    await session.connect();
    const snapshot = session.getSnapshot();
    assert.equal(snapshot.phase, 'error');
    assert.match(snapshot.error, /硅基流动或豆包/);
  } finally {
    cleanupGlobals();
  }
});

// ================= 识别模型可选 + 降低通话延迟 =================

test('OpenAI 兼容识别：请求 /audio/transcriptions，带模型与中文；本地服务可免 Key，云端缺 Key 直接提示', async () => {
  const { STTManager, describeMissingSttCredentials, describeSttEngine, buildSttOptions } = await loadBundledModule('../src/core/voice/sttManager.ts');
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ text: ' 你好呀 ' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const stt = STTManager.getInstance();
    const wav = new Blob([new Uint8Array(44)], { type: 'audio/wav' });
    const text = await stt.transcribeAudio(wav, {
      engine: 'openai', openaiBaseUrl: 'https://api.groq.com/openai/v1/', openaiApiKey: 'gsk-test', openaiModel: 'whisper-large-v3-turbo',
    }, new AbortController().signal);
    assert.equal(text, '你好呀');
    assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer gsk-test');
    assert.equal(calls[0].init.body.get('model'), 'whisper-large-v3-turbo');
    assert.equal(calls[0].init.body.get('language'), 'zh');

    await stt.transcribeAudio(wav, { engine: 'openai', openaiBaseUrl: 'http://192.168.1.10:8000/v1', openaiModel: 'Systran/faster-whisper-small' }, new AbortController().signal);
    assert.equal(calls[1].init.headers.Authorization, undefined, '局域网服务不带 Key');

    assert.match(describeMissingSttCredentials({ engine: 'openai', openaiBaseUrl: 'https://api.openai.com/v1', openaiModel: 'whisper-1' }), /API Key/);
    assert.equal(describeSttEngine({ engine: 'openai', openaiBaseUrl: 'https://api.groq.com/openai/v1', openaiModel: 'whisper-large-v3-turbo' }), 'groq.com · whisper-large-v3-turbo');
    assert.equal(describeSttEngine({ engine: 'siliconflow', siliconflowModel: 'TeleAI/TeleSpeechASR' }), '硅基流动 · TeleSpeechASR');
    assert.deepEqual(
      Object.entries(buildSttOptions({ sttEngine: 'openai', openaiSttBaseUrl: 'u', openaiSttApiKey: 'k', openaiSttModel: 'm' })).filter(([, v]) => v !== undefined),
      [['engine', 'openai'], ['openaiBaseUrl', 'u'], ['openaiApiKey', 'k'], ['openaiModel', 'm']],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/** 云端识别模式的会话：直接喂合成音频帧（2048 采样 ≈ 42.7ms），时间戳也由测试控制 */
const setupCloudSession = async (turnTiming = 'standard') => {
  const { VoiceCallSession } = await loadBundledModule('../src/core/voice/voiceCallSession.ts');
  const transcriptions = [];
  const sent = [];
  const session = new VoiceCallSession({
    sttOptions: { engine: 'openai' },
    turnTiming,
    transcribe: (wav, _options, signal) => {
      const call = { bytes: wav.size, aborted: false };
      transcriptions.push(call);
      signal.addEventListener('abort', () => { call.aborted = true; });
      return new Promise((resolve) => setTimeout(() => resolve(`第${transcriptions.length}次识别`), 30));
    },
    sendTurn: async (text, hooks) => { sent.push(text); hooks.onVisibleText('嗯，我听到了你说的话。'); return '嗯，我听到了你说的话。'; },
    interruptTurn: () => {},
    prepareSpeech: (text) => ({ text, cancel: () => {}, play: async () => { await sleep(5); } }),
    stopSpeech: () => {},
  });
  session.active = true;
  session.setPhase('listening');
  const FRAME_MS = (2048 / 48_000) * 1000;
  let now = 1_000_000;
  const loud = new Float32Array(2048).map((_, i) => (i % 2 ? 0.12 : -0.12));
  const quiet = new Float32Array(2048).fill(0.001);
  const feed = (kind, ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
      now += FRAME_MS;
      session.processFrame(kind === 'loud' ? loud : quiet, now);
    }
  };
  return { session, transcriptions, sent, feed };
};

test('提前识别：停顿一开始就送识别；接着又开口则作废；确认说完时直接用已在路上的结果', async () => {
  const { session, transcriptions, sent, feed } = await setupCloudSession('standard');
  try {
    feed('quiet', 500);
    feed('loud', 600);
    assert.equal(session.getSnapshot().phase, 'user_speaking');
    feed('quiet', 420); // 超过 350ms：提前识别
    assert.equal(transcriptions.length, 1);
    feed('loud', 400); // 又开口：第一次提前识别作废
    assert.equal(transcriptions[0].aborted, true);
    feed('quiet', 420); // 第二次停顿：再次提前识别
    assert.equal(transcriptions.length, 2);
    const bytesAtSpeculation = transcriptions[1].bytes;
    feed('quiet', 500); // 达到 800ms：确认说完
    assert.equal(transcriptions.length, 2, '确认说完时复用提前识别，不再重复请求');
    assert.equal(transcriptions[1].aborted, false);
    assert.ok(bytesAtSpeculation > transcriptions[0].bytes, '第二次提前识别包含了两段话的完整录音');
    await sleep(80);
    assert.deepEqual(sent, ['第2次识别']);
    const latency = session.getSnapshot().latency;
    assert.ok(latency && latency.recognizeMs !== null && latency.firstTextMs !== null && latency.firstAudioMs !== null, JSON.stringify(latency));
  } finally {
    session.hangUp();
  }
});

test('断句快慢：「快」在约 0.55 秒停顿后就提交，「耐心」在 0.8 秒停顿时仍在等', async () => {
  const fast = await setupCloudSession('fast');
  const patient = await setupCloudSession('patient');
  try {
    for (const { feed } of [fast, patient]) {
      feed('quiet', 300);
      feed('loud', 500);
      feed('quiet', 820);
    }
    assert.equal(fast.session.getSnapshot().phase === 'user_speaking', false, '快：已判定说完');
    assert.equal(patient.session.getSnapshot().phase, 'user_speaking', '耐心：还在等');
    patient.feed('quiet', 500);
    assert.notEqual(patient.session.getSnapshot().phase, 'user_speaking');
  } finally {
    fast.session.hangUp();
    patient.session.hangUp();
  }
});

test('识别接口地址：只接受 HTTPS 或局域网 HTTP；非法地址保留上一次的有效值', async () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
  delete globalThis.__YCY_DEVICE_MANAGER__;
  const { DeviceManager } = await loadBundledModule('../src/core/deviceManager.ts');
  const manager = DeviceManager.getInstance();
  try {
    const base = manager.getSafetyConfig();
    manager.updateSafetyConfig({ ...base, sttEngine: 'openai', openaiSttBaseUrl: 'https://api.groq.com/openai/v1/' });
    assert.equal(manager.getSafetyConfig().sttEngine, 'openai');
    assert.equal(manager.getSafetyConfig().openaiSttBaseUrl, 'https://api.groq.com/openai/v1');
    manager.updateSafetyConfig({ ...manager.getSafetyConfig(), openaiSttBaseUrl: 'http://evil.example.com/v1' });
    assert.equal(manager.getSafetyConfig().openaiSttBaseUrl, 'https://api.groq.com/openai/v1', '公网 HTTP 会明文传输录音与 Key，拒绝');
    manager.updateSafetyConfig({ ...manager.getSafetyConfig(), openaiSttBaseUrl: 'http://192.168.1.10:8000/v1' });
    assert.equal(manager.getSafetyConfig().openaiSttBaseUrl, 'http://192.168.1.10:8000/v1');
    manager.updateSafetyConfig({ ...manager.getSafetyConfig(), voiceCallTurnTiming: 'bogus' });
    assert.equal(manager.getSafetyConfig().voiceCallTurnTiming, 'standard');
  } finally {
    manager.simulator?.destroy?.();
    delete globalThis.__YCY_DEVICE_MANAGER__;
    delete globalThis.localStorage;
  }
});
