import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { search } from '../js/search.js';
import { expandChain, useKey } from '../js/chain.js';
import { logistics as base } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const logistics = { ...base, plainPipe: 'pipe' };

function best(entries) {
  let found = null;
  const run = search(entries, shipped, logistics, { seed: 1, maxCandidates: 4 });
  for (let step = run.next(); !step.done; step = run.next()) found = step.value;
  assert.ok(found, 'no layout');
  return found;
}

// Py's hydroclassifiers make iron pulp with as much iron slime: the slime's pipe goes to the
// Byproduct Use's hydroclassifier (unslimed iron), its unslimed iron on to the next Use's basic
// oxygen furnace (molten iron), what they make besides leaving by train.
test('Byproduct Uses: iron slime piped to its Use, that Use\'s unslimed iron belted to the next', () => {
  const from = useKey('iron-pulp-01', 'iron-slime');
  const { entries } = expandChain([{ item: 'iron-pulp-01', rate: 600 }], shipped, { uses: [
    { from: 'iron-pulp-01', item: 'iron-slime', recipe: 'unslimed-iron' },
    { from, item: 'unslimed-iron', recipe: 'molten-iron-06' },
  ] });
  const { block, score } = best(entries);
  assert.equal(score[0], 0, 'starves');
  const route = item => block.routes.find(r => (r.fluid ?? r.items[0].item) === item);
  assert.deepEqual([route('iron-slime').source, route('iron-slime').sink, route('iron-slime').consumers], [0, null, [1]]);
  assert.deepEqual([route('unslimed-iron').sink, route('unslimed-iron').consumers], [null, [2]]);
  for (const item of ['iron-pulp-01', 'tailings', 'molten-iron']) assert.equal(route(item).sink, 'side-output', item);
  assertValid(block, shipped, logistics);
});

// Py's jaw crushers make processed iron ore with stone on one belt: through the furnaces taking
// the ore and the washers taking the stone.
test('a Byproduct Use of a solid: its producers\' belt runs through its consumers and the Use', () => {
  const { entries } = expandChain([{ item: 'iron-plate', rate: 120 }], shipped, {
    made: ['processed-iron-ore'], selections: { 'iron-plate': { recipe: 'low-grade-smelting-iron', building: 'electric-furnace' } },
    uses: [{ from: 'processed-iron-ore', item: 'stone', recipe: 'saline-water' }],
  });
  const { block, score } = best(entries);
  assert.equal(score[0], 0, 'starves');
  const ore = block.routes.filter(r => r.kind === 'belt' && r.source === 1);
  assert.ok(ore.length && ore.every(r => r.sink === null), 'the stone leaves by train');
  assert.deepEqual([...new Set(ore.flatMap(r => r.consumers))].sort(), [0, 2]);
  assertValid(block, shipped, logistics);
});
