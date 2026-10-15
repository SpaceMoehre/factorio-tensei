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

// Py's jaw crushers make processed iron ore with stone on one belt: the stone filtered off to the
// washers taking it right after the crushers (it would stop the belt into the furnaces where it
// ends, ADR 0054), the ore on through the furnaces.
test('a Byproduct Use of a solid: a filter splitter sends it off to the Use, the rest on to its consumers', () => {
  const { entries } = expandChain([{ item: 'iron-plate', rate: 120 }], shipped, {
    made: ['processed-iron-ore'], selections: { 'iron-plate': { recipe: 'low-grade-smelting-iron', building: 'electric-furnace' } },
    uses: [{ from: 'processed-iron-ore', item: 'stone', recipe: 'saline-water' }],
  });
  const { block, score } = best(entries);
  assert.equal(score[0], 0, 'starves');
  assert.equal(score[2], 0, 'the stone rides on');
  const ore = block.routes.filter(r => r.kind === 'belt' && r.source === 1);
  assert.ok(ore.length && ore.every(r => r.sink === null), 'the stone leaves by train');
  assert.deepEqual([...new Set(ore.flatMap(r => r.consumers))], [0]);
  const stone = block.routes.filter(r => r.loop?.tapped && r.consumers.includes(2));
  assert.ok(stone.length && stone.every(r => ore.some(o => o.id === r.fedBy) && r.items[0].item === 'stone'), 'the stone tapped off the crushers\' belt');
  assert.ok(block.entities.some(e => e.kind === 'splitter' && e.filter === 'stone'));
  assertValid(block, shipped, logistics);
});

// Py's p2s5 from sulfur makes pyrite besides, which a General Use makes p2s5 of: the pyrite
// filtered off to it right after the furnaces, the p2s5 on to the perylene (ADR 0054). Riding on,
// its surplus stopped the belt into the perylene where it ends.
test('a General Use of a byproduct: the byproduct filtered off to it, its belt carrying none on', () => {
  const { entries } = expandChain([{ item: 'perylene', rate: 60 }], shipped, {
    made: ['p2s5'], selections: { p2s5: { recipe: 'p2s5-2', building: '' } }, uses: [{ item: 'pyrite', recipe: 'p2s5' }],
  });
  const { block, score } = best(entries);
  assert.deepEqual(score.slice(0, 3), [0, 0, 0]);
  const furnaces = block.subBlocks.findIndex(sb => sb.recipe === 'p2s5-2'), use = block.subBlocks.findIndex(sb => sb.use);
  const out = block.routes.find(r => r.kind === 'belt' && r.source === furnaces);
  assert.ok(!out.consumers.includes(use) && out.sink === null);
  const pyrite = block.routes.find(r => r.fedBy === out.id && r.loop?.tapped);
  assert.deepEqual([pyrite.items[0].item, pyrite.consumers], ['pyrite', [use]]);
  assert.ok(block.entities.some(e => e.kind === 'splitter' && e.filter === 'pyrite'));
  assertValid(block, shipped, logistics);
});
