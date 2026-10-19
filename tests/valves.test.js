import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandChain } from '../js/chain.js';
import { planner, attempt } from '../js/maximize.js';
import { siteOf } from '../js/city.js';
import { simulate } from '../js/sim.js';
import { catalog as vanilla, logistics as base } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const logistics = { ...base, belt: 'transport-belt', pipe: 'niobium-pipe-to-ground', plainPipe: 'niobium-pipe', pole: 'medium-electric-pole', inserter: 'fast-inserter', longInserter: 'long-handed-inserter', fuel: 'coal', liquidFuel: 'methane', handSize: 1 };

// Py coalbed gas: its extractors give back as water all the pressured water its vacuum pumps make
// of water takes (ADR 0062).
const goals = [{ item: 'coalbed-gas', rate: 7800 }];
const options = {
  made: ['pressured-water', 'water'],
  selections: { water: { recipe: 'offshore-water', building: '' }, 'coalbed-gas': { recipe: 'minor-extract-gas-from-coalbed-3', building: '' } },
};

test('the catalog: the valves one can build, and for each fluid the building destroying it', () => {
  assert.deepEqual(Object.values(shipped.valves).map(v => v.mode).sort(), ['overflow', 'top-up']);
  assert.equal(shipped.voids.water, 'py-sinkhole');
  assert.equal(shipped.voids.steam, 'py-gas-vent');
});

test('a fluid a step makes besides its item goes back to the steps taking it; the step making it tops up the rest', () => {
  const chain = expandChain(goals, shipped, options);
  const of = item => chain.entries.find(e => e.goal.item === item).goal;
  // (All of it given back: the offshore pumps make what keeps the loop going, a hundredth.)
  assert.ok(Math.abs(of('water').rate - 1300) < 1e-6, `${of('water').rate}`);
  assert.deepEqual(of('coalbed-gas').overflow, ['water']);
  assert.equal(of('coalbed-gas').topUp.water.from, chain.entries.findIndex(e => e.goal.item === 'water'));
  assert.equal(of('pressured-water').from.water, chain.entries.findIndex(e => e.goal.item === 'coalbed-gas'));
  assert.ok(chain.supplies.some(s => s.valve && s.from === 'coalbed-gas' && s.item === 'water'));
  // Without valves one can build (base 2.0's are hidden), as before: the offshore pumps make it all.
  const plain = expandChain(goals, { ...shipped, valves: {} }, options);
  assert.ok(Math.abs(plain.entries.find(e => e.goal.item === 'water').goal.rate - 130000) < 1e-6);
});

test('a fluid fed back: an overflow valve lets its spare off, a top-up valve the rest in; destroyed, at a sinkhole', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 80, h: 40 }, fixtures: [] }, 4);
  for (const voids of [[], ['water']]) {
    const out = attempt(planner(goals, shipped, logistics, { ...options, voids, site }), 6, { site, budgetMs: 60000, unsorted: true });
    assert.ok(out.block, `no layout: ${out.failure?.message}`);
    const { block } = out;
    assertValid(block, shipped, logistics);
    assert.deepEqual(simulate(block).starvation, []);
    const water = block.routes.filter(r => r.fluid === 'water');
    const fed = water.find(r => typeof r.source === 'number' && block.subBlocks[r.source].item === 'coalbed-gas');
    const off = water.find(r => r.valve?.mode === 'overflow');
    const up = water.find(r => r.valve?.mode === 'top-up');
    assert.deepEqual(fed.consumers.map(i => block.subBlocks[i].item), ['pressured-water']);
    assert.equal(off.valve.on, fed.id);
    assert.equal(up.valve.on, fed.id);
    assert.equal(block.subBlocks[up.source].item, 'water');
    assert.equal(block.entities.filter(e => e.kind === 'building' && e.name === 'offshore-pump').length, 1);
    assert.equal(off.sink, voids.length ? 'void' : 'side-output');
    assert.equal(block.entities.filter(e => e.kind === 'void' && e.name === 'py-sinkhole').length, voids.length);
  }
});

test('an item the user wants leaving by train too: a splitter giving its consumers priority sends the rest to the east edge', () => {
  const catalog = { ...vanilla, poles: { ...vanilla.poles, substation: { name: 'substation', size: { w: 2, h: 2 }, supplyRadius: 9, wireReach: 18 } } };
  const site = siteOf({ area: { x: 0, y: 0, w: 40, h: 30 }, fixtures: [] }, 1);
  const selections = { 'electronic-circuit': { recipe: 'electronic-circuit', building: 'assembling-machine-2' }, 'copper-cable': { recipe: 'copper-cable', building: 'assembling-machine-2' } };
  const plan = planner([{ item: 'electronic-circuit', rate: 60 }], catalog, base, { made: ['copper-cable'], exports: ['copper-cable'], selections, site });
  const out = attempt(plan, 4, { site, budgetMs: 60000, maxCandidates: 12, unsorted: true });
  assert.ok(out.block, `no layout: ${out.failure?.message}`);
  const { block } = out;
  assertValid(block, catalog, base);
  assert.deepEqual(simulate(block).starvation, []);
  const away = block.routes.filter(r => r.source === 'export');
  assert.ok(away.length > 0);
  for (const r of away) {
    const [splitter] = r.pieces;
    assert.equal(splitter.kind, 'splitter');
    assert.ok(['left', 'right'].includes(splitter.priority));
    assert.ok(block.routes[r.fedBy].exported === 'copper-cable');
    assert.equal(r.sink, 'side-output');
  }
});
