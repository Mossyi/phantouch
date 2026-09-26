import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { IDBFactory } from 'fake-indexeddb';

async function bundled(path, plugins = []) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`);
}
function setup() {
  globalThis.indexedDB = new IDBFactory();
  const values = new Map();
  globalThis.localStorage = { get length() { return values.size; }, key(i) { return [...values.keys()][i] ?? null; }, getItem(k) { return values.get(k) ?? null; }, setItem(k, v) { values.set(k, String(v)); }, removeItem(k) { values.delete(k); } };
  return values;
}
const script = { id: 'ai-test', title: 'Test', whisperLines: ['one'], durationMinutes: 5, hardwarePreset: { strength: 100, motorRate: 100 } };

test('saved ASMR scripts persist, bound imported text and never import hardware outputs', async () => {
  const values = setup(); const lib = await bundled('src/core/asmr/savedScripts.ts');
  lib.saveAsmrScript(script);
  assert.equal(lib.loadSavedScripts()[0].title, 'Test');
  assert.equal(lib.loadSavedScripts()[0].hardwarePreset.strength, 0);
  lib.saveAsmrScript({ ...script, title: 'Edited', category: 'Focus' });
  assert.equal(lib.loadSavedScripts().length, 1);
  assert.equal(lib.loadSavedScripts()[0].category, 'Focus');
  assert.equal(lib.normalizeSavedScripts([script, script]).length, 1);
  const before = values.get(lib.ASMR_SCRIPTS_KEY);
  localStorage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => lib.saveAsmrScript({ ...script, title: 'Lost' }), /保存失败/);
  assert.equal(values.get(lib.ASMR_SCRIPTS_KEY), before);
});

test('audio recycle bin keeps blobs, batch updates preserve metadata and restore works', async () => {
  setup(); const lib = await bundled('src/core/asmr/localAudioLibrary.ts');
  const a = await lib.addLocalAsmrTrack(new File(['audio-a'], 'a.mp3', { type: 'audio/mpeg' }));
  const b = await lib.addLocalAsmrTrack(new File(['audio-b'], 'b.mp3', { type: 'audio/mpeg' }));
  await lib.updateLocalAsmrTracks([a.id, b.id], { favorite: true, deletedAt: 100 });
  assert.equal((await lib.listLocalAsmrTracks()).length, 0);
  assert.equal((await lib.listLocalAsmrTracks(true)).length, 2);
  assert.equal(await (await lib.getLocalAsmrBlob(a.id)).text(), 'audio-a');
  await lib.updateLocalAsmrTracks([a.id], { deletedAt: 0, categoryId: 'missing' });
  const restored = (await lib.listLocalAsmrTracks())[0];
  assert.equal(restored.favorite, true); assert.equal(restored.categoryId, 'uncategorized');
  await lib.deleteLocalAsmrTrack(b.id);
  await assert.rejects(lib.getLocalAsmrBlob(b.id), /丢失/);
});

test('file package roundtrip includes audio and scripts while redacting profile credentials', async () => {
  setup(); const lib = await bundled('src/core/asmr/localAudioLibrary.ts'), backup = await bundled('src/core/ui/dataBackup.ts');
  const category = await lib.addLocalAsmrCategory('Music');
  const track = await lib.addLocalAsmrTrack(new File(['my sound'], 'song.mp3', { type: 'audio/mpeg' }), category.id);
  localStorage.setItem('ycy_asmr_scripts', JSON.stringify([script]));
  localStorage.setItem('ycy_model_profiles', JSON.stringify([{ id: 'p1', apiKey: 'never-export-this' }]));
  const file = await backup.createBackupPackage('all', true);
  const parsed = await backup.readBackupPackage(file);
  assert.equal(parsed.tracks.length, 1);
  assert.equal(parsed.tracks[0].metadata.categoryId, category.id);
  assert.equal(await parsed.tracks[0].blob.text(), 'my sound');
  assert.equal(parsed.data.includes('never-export-this'), false);
  await lib.deleteLocalAsmrTrack(track.id); localStorage.removeItem('ycy_asmr_scripts');
  await backup.restoreBackupPackage(parsed, 'overwrite');
  assert.equal(await (await lib.getLocalAsmrBlob(track.id)).text(), 'my sound');
  assert.equal(JSON.parse(localStorage.getItem('ycy_asmr_scripts'))[0].title, 'Test');
  await assert.rejects(backup.readBackupPackage(file.slice(0, file.size - 1)), /长度/);
  await assert.rejects(backup.readBackupPackage(new Blob(['not a backup file'])), /受支持/);
});

test('package merge retains local items and overwrite rolls back both stores on storage failure', async () => {
  const values = setup(); const lib = await bundled('src/core/asmr/localAudioLibrary.ts'), backup = await bundled('src/core/ui/dataBackup.ts');
  const track = await lib.addLocalAsmrTrack(new File(['original'], 'song.mp3', { type: 'audio/mpeg' }));
  localStorage.setItem('ycy_asmr_scripts', JSON.stringify([script]));
  const parsed = await backup.readBackupPackage(await backup.createBackupPackage('asmr', true));
  localStorage.setItem('ycy_asmr_scripts', JSON.stringify([{ ...script, title: 'Local edit' }]));
  await lib.renameLocalAsmrTrack(track, 'Local name');
  await backup.restoreBackupPackage(parsed, 'merge');
  assert.equal(JSON.parse(localStorage.getItem('ycy_asmr_scripts'))[0].title, 'Local edit');
  assert.equal((await lib.listLocalAsmrTracks())[0].title, 'Local name');
  const write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === 'ycy_asmr_scripts' && JSON.parse(v)[0].title === 'Test') throw new Error('quota'); write(k, v); };
  await assert.rejects(backup.restoreBackupPackage(parsed, 'overwrite'), /失败/);
  assert.equal((await lib.listLocalAsmrTracks())[0].title, 'Local name');
  assert.equal(JSON.parse(values.get('ycy_asmr_scripts'))[0].title, 'Local edit');
});

test('extended file backup accepts data above old 5 MB cap and filters by module', async () => {
  setup(); const backup = await bundled('src/core/ui/dataBackup.ts');
  localStorage.setItem('ycy_wardrobe_state', JSON.stringify({ notes: 'x'.repeat(5_100_000) }));
  localStorage.setItem('ycy_asmr_scripts', JSON.stringify([script]));
  const parsed = await backup.readBackupPackage(await backup.createBackupPackage('wardrobe', false));
  assert.ok(parsed.data.length > 5_000_000);
  assert.equal(Object.keys(JSON.parse(parsed.data).snapshot).length, 1);
  assert.equal(parsed.tracks.length, 0);
});

test('model profiles require credential opt-in and capability cache is bound to exact configuration', async () => {
  setup(); const profiles = await bundled('src/core/ai/modelProfiles.ts');
  const input = { id: 'p1', name: 'Daily', baseUrl: 'https://example.com/v1', model: 'm1', apiKey: 'secret-one', rememberApiKey: false, updatedAt: 0 };
  profiles.saveModelProfile(input); assert.equal(profiles.loadModelProfiles()[0].apiKey, '');
  profiles.saveModelProfile({ ...input, rememberApiKey: true }); assert.equal(profiles.loadModelProfiles()[0].apiKey, 'secret-one');
  const key = await profiles.modelFingerprint(input), otherKey = await profiles.modelFingerprint({ ...input, apiKey: 'secret-two' });
  assert.notEqual(key, otherKey);
  profiles.saveCapabilityReport(key, [{ capability: 'text', status: 'passed', message: 'OK', checkedAt: Date.now(), elapsedMs: 10 }]);
  assert.equal(profiles.loadCapabilityReport(key).length, 1); assert.equal(profiles.loadCapabilityReport(otherKey).length, 0);
  assert.throws(() => profiles.saveModelProfile({ ...input, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' }), /Plan/);
  assert.equal(profiles.deleteModelProfile('p1').length, 0);
});

test('merge cannot replace a conversation that exists only in IndexedDB', async () => {
  setup(); const backup = await bundled('src/core/ui/dataBackup.ts'), repo = await bundled('src/core/tavern/tavernChatRepository.ts');
  await repo.saveTavernSessionRecord('alice', [{ content: 'new local conversation' }]);
  const bundle = { data: JSON.stringify({ snapshot: { ycy_tavern_chat_alice: { __ycyStorageFormat: 'json', value: [{ content: 'old backup' }] } } }), categories: [], tracks: [], timestamp: Date.now(), module: 'tavern' };
  await backup.restoreBackupPackage(bundle, 'merge');
  assert.equal(localStorage.getItem('ycy_tavern_chat_alice'), null);
  assert.equal((await repo.exportTavernRepository()).sessions[0].messages[0].content, 'new local conversation');
});

test('native backup export writes binary chunks without base64 boundary corruption', async () => {
  globalThis.nativeChunks = []; globalThis.nativeShared = false;
  const plugin = { name: 'native-file-mocks', setup(builder) {
    builder.onResolve({ filter: /^@capacitor\// }, args => ({ path: args.path, namespace: 'native-mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'native-mock' }, () => ({ contents: `export const Capacitor = { isNativePlatform: () => true }; export const Directory = { Cache: 'CACHE' }; export const Encoding = { UTF8: 'utf8' }; export const Filesystem = { writeFile: async () => ({}), appendFile: async ({ data }) => { globalThis.nativeChunks.push(data); }, getUri: async () => ({ uri: 'cache:test' }), deleteFile: async () => {} }; export const Share = { share: async () => { globalThis.nativeShared = true; } };`, loader: 'js' }));
  } };
  const { exportBinaryFile } = await bundled('src/core/ui/exportFile.ts', [plugin]);
  const bytes = Buffer.alloc(3 * 1024 * 1024 + 17, 173);
  await exportBinaryFile('test.ycybackup', new Blob([bytes]));
  assert.equal(globalThis.nativeChunks.length, 2);
  assert.deepEqual(Buffer.concat(globalThis.nativeChunks.map(chunk => Buffer.from(chunk, 'base64'))), bytes);
  assert.equal(globalThis.nativeShared, true);
});
