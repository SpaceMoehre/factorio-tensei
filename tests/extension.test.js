import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandChain } from '../js/chain.js';
import { planSubBlocks } from '../js/plan.js';
import { buildFlows } from '../js/flows.js';
import { solve } from '../js/solve.js';
import { simulate } from '../js/sim.js';
import { spares } from '../js/annex.js';
import { extensionOf } from '../js/maximize.js';
import { readFileSync } from 'node:fs';
import { logistics as base } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const pyCatalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const logistics = { ...base, plainPipe: 'pipe' };

// Extensions (ADR 0038): Py sodium hydroxide, its slacked lime and lime made here. 500/min more
// slacked lime made than its sodium hydroxide takes stays on its pipe for an Annex to draw.
const made = ['slacked-lime', 'lime'];
const goals = [{ item: 'sodium-hydroxide', rate: 600 }];

test('an Extension makes its extra, which stays on its pipe as its spare', () => {
  const chain = expandChain(goals, pyCatalog, { made, extra: { 'slacked-lime': 500 } });
  const plain = expandChain(goals, pyCatalog, { made });
  const rate = (c, item) => c.entries.find(e => e.goal.item === item).goal.rate;
  assert.equal(rate(chain, 'slacked-lime'), rate(plain, 'slacked-lime') + 500);
  assert.equal(/** @type {any} */ (chain.entries.find(e => e.goal.item === 'slacked-lime').goal).extra, 500);
  assert.ok(rate(chain, 'lime') > rate(plain, 'lime'));
  const plan = planSubBlocks(chain.entries, pyCatalog, logistics);
  assert.equal(plan.find(s => s.item === 'slacked-lime').extra, 500);
  assert.ok(!buildFlows(plan).sideOutput.some(f => f.item === 'slacked-lime'));
  const block = solve(chain.entries, pyCatalog, logistics, { maxCandidates: 4 });
  assert.deepEqual(simulate(block).starvation, []);
  const route = block.routes.find(r => r.kind === 'pipe' && r.fluid === 'slacked-lime' && typeof r.source === 'number');
  assert.equal(route.sink, null);
  assert.equal(spares(block).get(route.id), 500);
});

test('an Annex’s Sub-Block of a fluid made here is what an Extension makes', () => {
  const sub = (item, rate, type = 'item') => ({ item, rate, outputs: [{ name: item, type, rate }] });
  const annex = { subBlocks: [sub('sodium-hydroxide', 100), sub('slacked-lime', 500, 'fluid'), sub('lime', 50)] };
  assert.deepEqual(extensionOf(annex, goals, made), { 'slacked-lime': 500 });
  assert.deepEqual(extensionOf(annex, goals, ['lime']), {});
});

// A Recycled Byproduct only where a lane of the belt carries all its step makes, or from a
// Goal's step: Py sodium hydroxide's limestone for aramid at 60/min of it (90 items a minute),
// not at 750/min (1125; a yellow lane 450); as the Goal, at any rate (gathered, ADR 0040).
test('a solid is fed back only where one lane carries all its step makes, or from a Goal', () => {
  const aramid = rate => expandChain([{ item: 'aramid', rate }], pyCatalog, { made: [...made, 'sodium-hydroxide'], belt: 'transport-belt' }).recycled.map(r => r.item);
  assert.deepEqual(aramid(48), ['limestone']);
  assert.deepEqual(aramid(600), []);
  assert.deepEqual(expandChain([{ item: 'sodium-hydroxide', rate: 750 }], pyCatalog, { made, belt: 'transport-belt' }).recycled.map(r => r.item), ['limestone']);
});

// A Goal's byproduct fed back from every output belt: Py sodium hydroxide at 2000/min on express
// belts makes 3000 items a minute on 2 belts; one feeds the lime's feedback through a splitter,
// the other's limestone side-loads onto that feedback through a filter splitter of its own (a
// gatherer), and the lime starves of nothing.
test('a byproduct on several output belts is gathered into one feedback', () => {
  const logistics = { ...base, belt: 'express-transport-belt', inserter: 'bulk-inserter', pipe: 'niobium-pipe-to-ground', plainPipe: 'niobium-pipe', handSize: 1 };
  const selections = { water: { recipe: 'offshore-water' }, lime: { recipe: 'lime', building: 'hpf-mk04' }, 'slacked-lime': { recipe: 'slacked-lime', building: 'chemical-plant-mk01' }, 'sodium-hydroxide': { recipe: 'py-sodium-hydroxide', building: 'chemical-plant-mk01' } };
  const chain = expandChain([{ item: 'sodium-hydroxide', rate: 2000 }], pyCatalog, { made: ['water', 'slacked-lime', 'lime'], selections, belt: logistics.belt });
  assert.deepEqual(chain.recycled.map(r => r.item), ['limestone']);
  const block = solve(chain.entries, pyCatalog, logistics, { maxCandidates: 8 });
  assert.deepEqual(simulate(block).starvation, []);
  const gatherer = block.routes.find(r => r.joins !== undefined && r.fedBy !== undefined);
  assert.ok(gatherer, 'no gatherer');
  assert.equal(block.routes[gatherer.joins].fedBy !== undefined, true);
  assert.ok(block.entities.some(e => e.kind === 'splitter' && e.filter === 'limestone' && gatherer.pieces[0] === e));
  assertValid(block, pyCatalog, logistics);
});
