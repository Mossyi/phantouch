import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const load = async (relativePath) => {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({ entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const rpg = await load('../src/core/tavern/tavernRpg.ts');
const lore = await load('../src/core/tavern/hardwareLorebook.ts');
const names = { char: '莉莉丝', user: '小猫' };
let state = rpg.createRpgState('contract', names, { trainerStyle: 'strict' });
state = {
  ...state,
  locations: state.locations.map((loc) => loc.name === '客厅' || loc.services.includes('rest') ? { ...loc, name: '我拒绝' } : loc),
};
const living = state.locations.find((loc) => loc.kind === 'home' && loc.name === '我拒绝');
state = {
  ...state,
  currentId: living.id,
  guidance: {
    ...state.guidance,
    assignment: { ...state.guidance.assignment, placeId: living.id, placeName: '我拒绝', placeKind: 'home' },
  },
};
const checkIn = rpg.applyGuidanceAction(state, { type: 'arrive' });
const home = state.locations.find((loc) => loc.services.includes('rest'));
const rested = rpg.restUntilMorning({ ...state, currentId: home.id }, () => 0);
const decline = rpg.applyGuidanceAction(rpg.createRpgState('contract', names), { type: 'decline' });
const pause = rpg.applyGuidanceAction(rpg.createRpgState('contract', names), { type: 'pause' });
const hits = (text) => lore.matchHardwareLorebookEntries(lore.DEFAULT_HARDWARE_LOREBOOK, text, 'user').map((entry) => entry.id);
for (const message of [checkIn.message, rested.message, decline.message, pause.message]) {
  assert.deepEqual(hits(message), [], message);
  assert.doesNotMatch(message, /我拒绝/);
}
assert.equal(checkIn.state.guidance.assignment.steps[0].status, 'done');
process.exit(0);
