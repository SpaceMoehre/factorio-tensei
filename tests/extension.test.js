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
