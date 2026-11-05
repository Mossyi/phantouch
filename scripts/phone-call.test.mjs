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
