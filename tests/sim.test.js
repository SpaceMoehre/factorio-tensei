import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../js/sim.js';

const needs = (item, rate) => ({ inputs: [{ name: item, type: 'item', rate }] });

test('a lane feeding two Sub-Blocks starves the downstream one, not the first in belt order', () => {
  const block = {
    subBlocks: [needs('iron-plate', 300), needs('iron-plate', 300)],
    routes: [{ id: 0, consumers: [0, 1], items: [{ item: 'iron-plate', supply: 450, capacity: 450 }] }],
  };
  assert.deepEqual(simulate(block), {
    ok: false,
    starvation: [{ route: 0, subBlock: 1, item: 'iron-plate', demand: 300, available: 150 }],
  });
});

test('no Starvation when every consumer gets its demand in belt order', () => {
  const block = {
    subBlocks: [needs('iron-plate', 300), needs('iron-plate', 150)],
    routes: [{ id: 0, consumers: [0, 1], items: [{ item: 'iron-plate', supply: 450, capacity: 450 }] }],
  };
  assert.deepEqual(simulate(block), { ok: true, starvation: [] });
});

test('the Side Output is the last consumer on its route: what the lane cannot carry is reported', () => {
  const block = {
    subBlocks: [],
    routes: [{ id: 0, sink: 'side-output', consumers: [], items: [{ item: 'copper-cable', rate: 1000, supply: 1000, capacity: 450, lane: 'far' }] }],
  };
  assert.deepEqual(simulate(block).starvation, [{ route: 0, subBlock: null, item: 'copper-cable', demand: 1000, available: 450 }]);
});

test('items sharing a lane split its capacity in proportion to their supply', () => {
  const block = {
    subBlocks: [needs('a', 200)],
    routes: [{
      id: 0, sink: 'side-output', consumers: [0],
      items: [
        { item: 'a', rate: 300, supply: 300, capacity: 450, lane: 'far' },
        { item: 'b', rate: 300, supply: 300, capacity: 450, lane: 'far' },
      ],
    }],
  };
  assert.deepEqual(simulate(block).starvation, [
    { route: 0, subBlock: null, item: 'a', demand: 100, available: 25 },
    { route: 0, subBlock: null, item: 'b', demand: 300, available: 225 },
  ]);
});

const asm2 = (item, rate) => ({ goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' } });

// 300 circuits take 300 iron/min and 900 gears 1800: 2100/min is more than a yellow belt
// (900/min), so each Sub-Block gets its iron on belts of its own and neither starves.
test('solved block: an import beyond one belt comes on its own belts to each consumer', async () => {
  const { solve } = await import('../js/solve.js');
  const { catalog, logistics } = await import('./fixtures/catalog.js');
  const block = solve([asm2('electronic-circuit', 300), asm2('copper-cable', 900), asm2('iron-gear-wheel', 900)], catalog, logistics);
  const iron = block.routes.filter(r => r.items.some(i => i.item === 'iron-plate'));
  assert.ok(iron.every(r => r.consumers.length === 1), 'each iron belt goes to one Sub-Block');
  const rate = sb => iron.filter(r => r.consumers[0] === block.subBlocks.findIndex(s => s.item === sb)).reduce((sum, r) => sum + r.items[0].rate, 0);
  assert.deepEqual([rate('electronic-circuit'), rate('iron-gear-wheel')], [300, 1800]);
  assert.deepEqual(simulate(block).starvation.filter(s => s.item === 'iron-plate'), []);
});

// Output inserters fill the far lane: one lane (450/min) from one side of a belt, both lanes
// where rows on both sides drop onto it. A machine fills one lane, so a lane takes two cable
// machines (180/min each): 720 cable/min for the circuits, from 4 machines, runs on both lanes
// (or on parallel belts) and arrives whole.
test('solved block: an Internal Path beyond one lane fills both lanes or runs on parallel belts', async () => {
  const { solve } = await import('../js/solve.js');
  const { catalog, logistics } = await import('./fixtures/catalog.js');
  const block = solve([asm2('electronic-circuit', 240), asm2('copper-cable', 720)], catalog, logistics);
  const cable = block.routes.filter(r => r.items.some(i => i.item === 'copper-cable'));
  assert.ok(cable.every(r => r.items[0].rate <= r.items[0].capacity + 1e-9), 'every cable belt within its capacity');
  assert.deepEqual(simulate(block).starvation.filter(s => s.item === 'copper-cable'), []);
});

// 1000 cable/min is more than one far lane (450/min): the output leaves on parallel belts, each
// within its capacity (450/min a lane, twice that where rows on both sides fill it).
test('solved block: a Goal output beyond one lane leaves on parallel belts, each within its capacity', async () => {
  const { solve } = await import('../js/solve.js');
  const { catalog, logistics } = await import('./fixtures/catalog.js');
  const block = solve([asm2('copper-cable', 1000)], catalog, logistics);
  const parts = block.routes.filter(r => r.sink === 'side-output');
  assert.ok(parts.length >= 2, `${parts.length} output belts`);
  assert.ok(parts.every(r => r.items[0].rate <= r.items[0].capacity + 1e-9));
  assert.ok(Math.abs(parts.reduce((sum, r) => sum + r.items[0].rate, 0) - 1000) < 1e-6);
  assert.deepEqual(simulate(block).starvation, []);
});

// Sand and gravel share the far lane (300 + 300 > 450), so the output needs both lanes or
// several belts, each carrying both items.
test('solved block: a Byproduct shares the far lane with the Goal item, on as many belts or lanes as that takes', async () => {
  const { solve } = await import('../js/solve.js');
  const { catalog, logistics } = await import('./fixtures/catalog.js');
  const block = solve([{ goal: { item: 'sand', rate: 300 }, selection: { recipe: 'ore-sifting', building: 'assembling-machine-2' } }], catalog, logistics);
  const parts = block.routes.filter(r => r.sink === 'side-output');
  assert.ok(parts.every(r => r.items.map(i => i.item).join() === 'sand,gravel'));
  assert.ok(parts.every(r => r.items.reduce((sum, i) => sum + i.rate, 0) <= r.items[0].capacity + 1e-9));
  assert.deepEqual(simulate(block).starvation, []);
});

test('a producer that makes less than its consumer needs starves it, even on a roomy belt', () => {
  const block = {
    subBlocks: [needs('copper-cable', 300)],
    routes: [{ id: 3, consumers: [0], items: [{ item: 'copper-cable', supply: 200, capacity: 900 }] }],
  };
  assert.deepEqual(simulate(block).starvation, [{ route: 3, subBlock: 0, item: 'copper-cable', demand: 300, available: 200 }]);
});

test('an inserter that cannot keep up starves its machine: 2 machines, one fast inserter each (144/min), need 360/min', () => {
  const block = {
    subBlocks: [{
      count: 2, inputs: [{ name: 'iron-plate', type: 'item', rate: 360 }],
      inserters: [{ route: 0, items: ['iron-plate'], perMachine: [144, 144] }],
    }],
    routes: [{ id: 0, consumers: [0], items: [{ item: 'iron-plate', supply: 900, capacity: 900 }] }],
  };
  assert.deepEqual(simulate(block).starvation, [
    { route: 0, subBlock: 0, item: 'iron-plate', demand: 360, available: 288, cause: 'inserters' },
  ]);
});

test('merged items share their inserters: two lanes into one machine through one inserter', () => {
  const block = {
    subBlocks: [{
      count: 1, inputs: [{ name: 'a', type: 'item', rate: 100 }, { name: 'b', type: 'item', rate: 100 }],
      inserters: [{ route: 0, items: ['a', 'b'], perMachine: [144] }],
    }],
    routes: [{ id: 0, consumers: [0], items: [{ item: 'a', supply: 450, capacity: 450 }, { item: 'b', supply: 450, capacity: 450 }] }],
  };
  assert.deepEqual(simulate(block).starvation, [
    { route: 0, subBlock: 0, item: 'a + b', demand: 200, available: 144, cause: 'inserters' },
  ]);
});

// Copies of a module take a and b merged; the leftover module's machine takes them apart. Each set
// of inserters answers for its own machines: 3 machines need 300 of a + b, 1 machine 50 of a.
test('inserters answer for the machines they serve: merged in the copies, apart in the leftover', () => {
  const block = {
    subBlocks: [{
      count: 4, inputs: [{ name: 'a', type: 'item', rate: 200 }, { name: 'b', type: 'item', rate: 200 }],
      inserters: [
        { route: 0, items: ['a', 'b'], perMachine: [144, 144, 144] },
        { route: 1, items: ['a'], perMachine: [144] }, { route: 2, items: ['b'], perMachine: [30] },
      ],
    }],
    routes: [],
  };
  assert.deepEqual(simulate(block).starvation, [
    { route: 2, subBlock: 0, item: 'b', demand: 50, available: 30, cause: 'inserters' },
  ]);
});

test('output inserters that cannot empty the machines are reported too', () => {
  const block = {
    subBlocks: [{
      count: 1, inputs: [], outputs: [{ name: 'gear', type: 'item', rate: 200 }],
      inserters: [{ route: 0, role: 'output', items: ['gear'], perMachine: [72] }],
    }],
    routes: [],
  };
  assert.deepEqual(simulate(block).starvation, [
    { route: 0, subBlock: 0, item: 'gear', demand: 200, available: 72, cause: 'inserters' },
  ]);
});
