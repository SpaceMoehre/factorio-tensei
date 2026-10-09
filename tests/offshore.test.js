import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { search } from '../js/search.js';
import { expandChain } from '../js/chain.js';
import { encodeBlueprint } from '../js/blueprint.js';
import { logistics as base } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const logistics = { ...base, plainPipe: 'pipe' };

// Water made here: an offshore pump (1200 a second), the pump in the middle of its 3 x 3's south
// row, six tiles of shallow water before it.
test('water made here: an offshore pump on six tiles of shallow water', async () => {
  const { entries } = expandChain([{ item: 'iron-pulp-01', rate: 600 }], shipped, { made: ['water'] });
  const water = entries.find(e => e.goal.item === 'water');
  assert.deepEqual([water.selection.recipe, water.selection.building], ['offshore-water', 'offshore-pump']);
  let found = null;
  const run = search(entries, shipped, logistics, { seed: 1, maxCandidates: 4 });
  for (let step = run.next(); !step.done; step = run.next()) found = step.value;
  assert.equal(found.score[0], 0, 'starves');
  assertValid(found.block, shipped, logistics);
  const machine = found.block.entities.find(e => e.name === 'offshore-pump');
  const { blueprint } = JSON.parse((await encodeBlueprint(found.block, shipped)).json);
  const pump = blueprint.entities.find(e => e.name === 'offshore-pump');
  assert.equal(pump.recipe, undefined);
  assert.equal(blueprint.tiles.length, 6);
  assert.ok(blueprint.tiles.every(t => t.name === 'water-shallow'));
  // The tile the pump stands on is not water; all six lie inside its 3 x 3.
  const at = `${Math.floor(pump.position.x)},${Math.floor(pump.position.y)}`;
  assert.ok(!blueprint.tiles.some(t => `${t.position.x},${t.position.y}` === at));
  for (const t of blueprint.tiles) {
    assert.ok(t.position.x >= machine.x && t.position.x < machine.x + 3 && t.position.y >= machine.y && t.position.y < machine.y + 3);
  }
});
