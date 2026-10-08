import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solve } from '../js/solve.js';
import { encodeBlueprint } from '../js/blueprint.js';
import { buildCore, oriented } from '../js/layout/core.js';
import { logistics as base } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';
import { search } from '../js/search.js';
import { expandChain } from '../js/chain.js';

const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const logistics = { ...base, plainPipe: 'pipe', liquidFuel: 'natural-gas' };
const machinesOf = block => block.entities.filter(e => e.kind === 'building');

// Py's glassworks burn natural gas through connections on their west and east sides that let it
// through both ways: in a row against each other they join without a pipe, the row fed at its
// east end.
test('Liquid Fuel: glassworks in a row stand against each other, joined through their fuel boxes', () => {
  const block = solve([{ goal: { item: 'flask', rate: 300 }, selection: { recipe: 'flask', building: 'glassworks-mk01' } }], shipped, logistics);
  const machines = machinesOf(block);
  assert.equal(machines.length, 8);
  const gas = block.routes.find(r => r.kind === 'pipe' && r.fluid === 'natural-gas');
  assert.equal(gas.source, 'side-input');
  // Rows of machines 7 apart (no column between them), the gas reaching each row once.
  const rows = new Map();
  for (const m of machines) rows.set(m.y, [...(rows.get(m.y) ?? []), m]);
  assert.ok([...rows.values()].some(row => row.length > 1));
  for (const row of rows.values()) {
    const xs = row.map(m => m.x).sort((a, b) => a - b);
    assert.ok(xs.every((x, k) => k === 0 || x - xs[k - 1] === 7), `a row at ${xs}`);
    const ends = row.filter(m => gas.pieces.some(p => p.y === m.y + 3 && (p.x === m.x - 1 || p.x === m.x + 7)));
    assert.equal(ends.length, 1);
  }
  assertValid(block, shipped, logistics);
});

// Mirrored, a machine's fluid connections lie east to west of where they were (Factorio 2.0):
// the glassworks' molten glass input at x = -1 instead of +1, facing north; its blueprint says so.
test('a mirrored machine: its connections flipped east to west, the blueprint entity mirrored', async () => {
  const building = shipped.buildings['glassworks-mk01'];
  const flipped = oriented(building, true);
  assert.deepEqual(flipped.fluidBoxes[1].connections, [{ x: 1, y: -3, direction: 0 }]);
  assert.deepEqual(flipped.fluidBoxes[4].connections.map(c => c.direction), [12, 4]);
  const sb = { item: 'flask', recipe: 'flask', building: 'glassworks-mk01', count: 1, inputs: [], outputs: [] };
  const links = { inputs: [], output: null, fluids: [{ routeId: 0, fluid: 'molten-glass', role: 'input', boxes: [1] }] };
  const env = { routes: [], inserters: {}, rightAngle: true, beltReach: 5, pipeReach: 10, laneCapacity: 450, handSize: 1 };
  const variant = { rotation: 0, rowLength: 1, middle: 0, belts: [], pipes: [], gap: 0 };
  const port = mirror => buildCore(sb, building, links, { ...variant, mirror }, env).ports[0].tiles[0];
  assert.deepEqual([port(false), port(true)], [[2, 0, 0], [4, 0, 0]]);
  const block = { entities: [{ name: 'glassworks-mk01', kind: 'building', recipe: 'flask', x: 0, y: 0, w: 7, h: 7, direction: 4, mirror: true }], subBlocks: [], routes: [], bounds: { x: 0, y: 0, w: 7, h: 7 } };
  const { json } = await encodeBlueprint(block, shipped);
  assert.equal(JSON.parse(json).blueprint.entities[0].mirror, true);
});

// Py's quartz crushers make stone with the crushed quartz; the glassworks take only the quartz.
// A filter splitter right after the crushers sends the stone on its own belt to the east edge, so
// it never fills the glassworks' belt.
test('a byproduct is sorted out after its producers: stone off the crushed quartz by a filter splitter', () => {
  const block = solve([
    { goal: { item: 'molten-glass', rate: 1800 }, selection: { recipe: 'glass-2', building: 'glassworks-mk01' } },
    { goal: { item: 'crushed-quartz', rate: 120 }, selection: { recipe: 'crushing-quartz', building: 'jaw-crusher' } },
  ], shipped, logistics);
  const quartz = block.routes.filter(r => r.kind === 'belt' && r.items.some(i => i.item === 'crushed-quartz'));
  const sorter = quartz.find(r => r.filter === 'stone');
  assert.ok(sorter, 'no belt sorts out the stone');
  const fed = quartz.find(r => r.fedBy === sorter.id);
  assert.deepEqual(fed.items.map(i => i.item), ['crushed-quartz']);
  assert.ok(fed.consumers.length);
  const splitter = sorter.pieces.find(p => p.kind === 'splitter');
  assert.deepEqual([splitter.filter, splitter.priority !== undefined], ['stone', true]);
  assert.equal(sorter.pieces.at(-1).x, block.bounds.x + block.bounds.w - 1);
  assertValid(block, shipped, logistics);
});

// Py's ball mills make 1800/min of molybdenite dust with 180 of gravel, more than one belt
// carries, for agitators that take only the dust (the jaw crushers 900 of crushed molybdenite with
// 360 of stone): an Internal Path all the same, each of its parallel belts sorting the byproduct
// out after its producers (else running on through its consumers to the east edge). Before, the
// route ran as one belt and every design starved.
test('a byproduct on more than one belt: each of the Internal Path\'s belts sorts it out, nothing starves', () => {
  const entries = expandChain([{ item: 'molybdenite-pulp', rate: 9000 }], shipped, { made: ['molybdenite-dust', 'crushed-molybdenite'], selections: {} }).entries;
  let best = null;
  const run = search(entries, shipped, { ...logistics, pipe: 'niobium-pipe-to-ground', plainPipe: 'niobium-pipe', handSize: 1 }, { seed: 1, maxCandidates: 4 });
  for (let step = run.next(); !step.done; step = run.next()) best = step.value;
  assert.ok(best, 'no layout');
  assert.equal(best.score[0], 0);
  for (const item of ['molybdenite-dust', 'crushed-molybdenite']) {
    assert.ok(best.block.routes.filter(r => r.kind === 'belt' && r.items.some(i => i.item === item) && !r.fedFrom).length >= 2, `${item} on one belt`);
  }
  assert.ok(best.block.routes.some(r => r.filter === 'stone'));
  assertValid(best.block, shipped, { ...logistics, pipe: 'niobium-pipe-to-ground', plainPipe: 'niobium-pipe', handSize: 1 });
});
