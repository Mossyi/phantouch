import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { indexedDB } from 'fake-indexeddb';

async function bundled(path, plugins = []) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'node', plugins, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
}
function storage() {
  const values = new Map();
  globalThis.localStorage = { get length() { return values.size; }, key(i) { return [...values.keys()][i] ?? null; }, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, String(value)); }, removeItem(key) { values.delete(key); } };
  return values;
}

test('drafts are isolated by character and malformed saved values are ignored', async () => {
  storage(); const { loadDraft, draftKey, writePreference } = await bundled('src/core/ui/localPreferences.ts');
  writePreference(draftKey('alice'), '未发送内容'); writePreference(draftKey('bob'), '另一段');
  assert.equal(loadDraft('alice'), '未发送内容'); assert.equal(loadDraft('bob'), '另一段');
  writePreference(draftKey('alice'), ''); assert.equal(loadDraft('bob'), '另一段');
  localStorage.setItem(draftKey('alice'), '{}'); assert.equal(loadDraft('alice'), '');
});

test('chat database can recover after a failed first open', async () => {
  const repo = await bundled('src/core/tavern/tavernChatRepository.ts');
  globalThis.indexedDB = undefined;
  assert.equal(await repo.saveTavernSessionRecord('recovery', []), false);
  globalThis.indexedDB = indexedDB;
  assert.equal(await repo.saveTavernSessionRecord('recovery', [{ content: 'saved' }]), true);
});

test('voice recovery preserves long history and bounds custom practice text', async () => {
  const { normalizeBarbieSuiteState } = await bundled('src/core/discipline/barbieSuiteState.ts');
  const records = Array.from({ length: 45 }, (_, i) => ({ id: `voice-${i}`, exercise: 'reading', completedAt: 100, durationSec: 20 }));
  const state = normalizeBarbieSuiteState({ voiceHistory: records, voiceTraining: { practiceText: 'a'.repeat(2500) } });
  assert.equal(state.voiceHistory.length, 45); assert.equal(state.voiceTraining.practiceText.length, 2000);
});

test('backup includes drafts and voice settings, rejects exports it cannot restore', async () => {
  storage(); const { SignInCodeEngine } = await bundled('src/core/tavern/signInCodeEngine.ts');
  localStorage.setItem('ycy_tavern_draft_alice', JSON.stringify('draft'));
  localStorage.setItem('ycy_tts_voice_profiles', JSON.stringify([{ id: 'voice', apiKey: 'secret' }]));
  const payload = JSON.parse(SignInCodeEngine.generateSignInCode().jsonStr);
  assert.equal(payload.snapshot.ycy_tavern_draft_alice.value, 'draft');
  assert.equal(payload.snapshot.ycy_tts_voice_profiles.value[0].apiKey, '');
  localStorage.setItem('ycy_tavern_cards', JSON.stringify([{ text: 'x'.repeat(2000001) }]));
  assert.throws(() => SignInCodeEngine.generateSignInCode(), /2 MB/);
});

test('capability tests use isolated messages and support both endpoint protocols', async () => {
  const { probeModelCapability, parseCapabilityStream } = await bundled('src/core/ai/modelCapabilities.ts');
  assert.throws(() => parseCapabilityStream('data: {"type":"response.output_text.delta","delta":"OK"}\n\ndata: {"type":"response.failed"}\n\n'), /流式响应/);
  assert.throws(() => parseCapabilityStream('data: {"error":{"message":"failed"}}\n\n'), /流式响应/);
  const originalFetch = globalThis.fetch;
  try {
    for (const responses of [false, true]) {
      let calls = 0;
      globalThis.fetch = async (url, init) => {
        calls++;
        assert.equal(String(url).endsWith(responses ? '/responses' : '/chat/completions'), true);
        const body = JSON.parse(init.body); const messages = body.input || body.messages;
        assert.ok(messages.every(message => !message.content.includes('private-chat')));
        if (body.stream) return new Response(responses ? 'data: {"type":"response.output_text.delta","delta":"春天"}\n\n' : 'data: {"choices":[{"delta":{"content":"春天"}}]}\n\n', { headers: { 'content-type': 'text/event-stream' } });
        if (body.tools) {
          assert.equal(body.tools.length, 1);
          const call = { name: 'diagnostic_echo', arguments: '{"token":"ycy-probe"}' };
          return Response.json(responses ? { output: [{ type: 'function_call', ...call }] } : { choices: [{ message: { tool_calls: [{ function: call }] } }] });
        }
        const content = messages.length > 1 ? messages[0].content.match(/TEST-[a-z0-9]+/)[0] : 'OK';
        return Response.json(responses ? { output: [{ content: [{ type: 'output_text', text: content }] }] } : { choices: [{ message: { content } }] });
      };
      const config = { baseUrl: responses ? 'https://ark.cn-beijing.volces.com/api/plan/v3' : 'https://example.com/v1', apiKey: 'mock', model: 'mock' };
      for (const capability of ['text', 'stream', 'conversation', 'tools']) assert.equal((await probeModelCapability(config, capability)).status, 'passed');
      assert.equal(calls, 5);
      globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'no tool' } }] });
      assert.equal((await probeModelCapability(config, 'tools')).status, 'unverified');
      const controller = new AbortController(); controller.abort();
      assert.equal((await probeModelCapability(config, 'text', controller.signal)).status, 'cancelled');
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('local player ignores obsolete reads after switching, stopping and unmounting', async () => {
  storage(); const refs = []; const effects = []; const pending = new Map(); const active = [];
  globalThis.__playerTest = {
    useRef(value) { const ref = { current: value }; refs.push(ref); return ref; },
    useState(value) { return [typeof value === 'function' ? value() : value, () => {}]; },
    useEffect(effect) { effects.push(effect); },
    useImperativeHandle(ref, factory) { ref.current = factory(); },
    forwardRef(fn) { return fn; }, createElement() { return null; },
    getBlob(id) { return new Promise(resolve => pending.set(id, resolve)); }
  };
  const plugin = { name: 'isolated-player', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, () => ({ path: 'react', namespace: 'mock' }));
    builder.onResolve({ filter: /localAudioLibrary$/ }, () => ({ path: 'audio', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'react'
      ? 'const r=globalThis.__playerTest; export default r; export const {useRef,useState,useEffect,useImperativeHandle,forwardRef}=r; export const jsx=r.createElement,jsxs=r.createElement;'
      : 'export const getLocalAsmrBlob=(id)=>globalThis.__playerTest.getBlob(id);' }));
  } };
  try {
    const { LocalAudioPlayer } = await bundled('src/components/femboy/LocalAudioPlayer.tsx', [plugin]);
    const handle = { current: null };
    LocalAudioPlayer({ tracks: [], onActiveChange: track => active.push(track?.id || null), onStatus() {}, onBeforePlay() {} }, handle);
    refs[1].current = { src: '', currentTime: 0, duration: 100, paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() { this.src = ''; }, load() {} };
    const cleanups = effects.map(effect => effect());
    const a = handle.current.play({ id: 'A' }); const b = handle.current.play({ id: 'B' });
    pending.get('B')(new Blob(['B'])); await b; pending.get('A')(new Blob(['A'])); await a;
    assert.equal(active.at(-1), 'B');
    const c = handle.current.play({ id: 'C' }); handle.current.stop(); pending.get('C')(new Blob(['C'])); await c;
    assert.equal(active.at(-1), null);
    const d = handle.current.play({ id: 'D' }); cleanups.forEach(fn => fn?.()); pending.get('D')(new Blob(['D'])); await d;
    assert.notEqual(active.at(-1), 'D');
  } finally { delete globalThis.__playerTest; }
});
