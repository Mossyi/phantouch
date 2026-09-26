import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
async function bundle(source) {
  const result = await build({ stdin: { contents: source, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
}
test('diagnostic request events are bounded, contain no raw errors and can be disabled', async () => {
  const diagnostics = await bundle("export * from './src/core/ui/diagnosticEvents.ts';");
  for (let i = 0; i < 70; i++) diagnostics.recordDiagnosticEvent('text', 'http-error', 403);
  assert.equal(diagnostics.getDiagnosticEvents().length, 50);
  const copy = diagnostics.getDiagnosticEvents(); copy[0].outcome = 'modified';
  assert.equal(diagnostics.getDiagnosticEvents()[0].outcome, 'http-error');
  assert.equal(diagnostics.classifyRequestFailure(new Error('Failed to fetch https://private.example/?token=secret')), 'network');
  assert.equal(JSON.stringify(diagnostics.getDiagnosticEvents()).includes('secret'), false);
  diagnostics.setDiagnosticsEnabled(false); diagnostics.recordDiagnosticEvent('stream', 'timeout');
  assert.equal(diagnostics.getDiagnosticEvents().length, 0);
});
test('shared HTTP diagnostics distinguish server rejection, cancellation and timeout without logging bodies', async () => {
  const client = await bundle("export * from './src/core/httpClient.ts'; export * from './src/core/ui/diagnosticEvents.ts';");
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('private-server-body', { status: 401 });
    await client.fetchTextWithTimeout('https://secret.example/v1?token=private', { headers: { Authorization: 'private-key' }, body: 'private-prompt' });
    assert.equal(client.getDiagnosticEvents()[0].status, 401);
    assert.equal(JSON.stringify(client.getDiagnosticEvents()).includes('private'), false);
    globalThis.fetch = async (_url, init) => new Promise((resolve, reject) => { if (init.signal.aborted) reject(new DOMException('hidden', 'AbortError')); else init.signal.addEventListener('abort', () => reject(new DOMException('hidden', 'AbortError')), { once: true }); });
    await assert.rejects(client.fetchTextWithTimeout('https://example.com', {}, { timeoutMs: 5 }));
    assert.equal(client.getDiagnosticEvents()[0].outcome, 'timeout');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(client.fetchTextStreamWithTimeout('https://example.com', { signal: controller.signal }, () => {}));
    assert.equal(client.getDiagnosticEvents()[0].outcome, 'cancelled');
  } finally { globalThis.fetch = original; }
});
test('environment report reads permission states without requesting devices or exporting private configuration', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), originalWindow = globalThis.window, originalStorage = globalThis.localStorage;
  let mediaCalls = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, mediaDevices: { getUserMedia: () => { mediaCalls++; throw new Error('must not run'); } }, permissions: { query: async ({ name }) => { if (name === 'camera') throw new Error('unsupported'); return { state: 'prompt' }; } } } });
  globalThis.window = { isSecureContext: true };
  globalThis.localStorage = { length: 2 };
  try {
    const { collectAppDiagnostics } = await bundle("export * from './src/core/ui/appDiagnostics.ts';");
    const report = await collectAppDiagnostics({ deviceState: { connectionMode: 'simulator', connectionStatus: 'connected', deviceName: 'private-device-name' }, llmConfig: { baseUrl: 'https://private-endpoint.example/v1', model: 'private-model', apiKey: 'private-key' } });
    assert.equal(mediaCalls, 0); assert.equal(report.permissions.microphone, 'prompt'); assert.equal(report.permissions.camera, 'unavailable');
    assert.equal(report.connection.apiKeyPresent, true); assert.equal(report.connection.apiAddressValid, true);
    assert.equal(JSON.stringify(report).includes('private-'), false);
    assert.equal(report.capabilities.mediaCaptureApi, true);
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
    globalThis.window = originalWindow; globalThis.localStorage = originalStorage;
  }
});
