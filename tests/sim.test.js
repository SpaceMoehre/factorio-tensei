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

test('solved block: one yellow belt of iron (900/min) starves the gear Sub-Block after the circuits take theirs', async () => {
  const { solve } = await import('../js/solve.js');
  const { catalog, logistics } = await import('./fixtures/catalog.js');
  const block = solve([asm2('electronic-circuit', 300), asm2('copper-cable', 900), asm2('iron-gear-wheel', 900)], catalog, logistics);
  const gear = block.subBlocks.findIndex(s => s.item === 'iron-gear-wheel');
  const iron = simulate(block).starvation.filter(s => s.item === 'iron-plate');
  assert.deepEqual(iron.map(s => [s.subBlock, s.demand, s.available]), [[gear, 1800, 600]]);
});

test('solved block: output inserters fill only the far lane, so an output belt carries half a belt', async () => {
  const { solve } = await import('../js/solve.js');
  const { catalog, logistics } = await import('./fixtures/catalog.js');
  const block = solve([asm2('electronic-circuit', 300), asm2('copper-cable', 900)], catalog, logistics);
  const cable = simulate(block).starvation.find(s => s.item === 'copper-cable');
  assert.deepEqual([cable.demand, cable.available], [900, 450]);
});

test('solved block: a Goal output beyond one lane backs up before the Side Output', async () => {
  const { solve } = await import('../js/solve.js');
  const { catalog, logistics } = await import('./fixtures/catalog.js');
  const block = solve([asm2('copper-cable', 1000)], catalog, logistics);
  assert.deepEqual(simulate(block).starvation.map(s => [s.subBlock, s.item, s.demand, s.available]), [[null, 'copper-cable', 1000, 450]]);
});

test('solved block: a Byproduct shares the far lane with the Goal item', async () => {
  const { solve } = await import('../js/solve.js');
  const { catalog, logistics } = await import('./fixtures/catalog.js');
  const block = solve([{ goal: { item: 'sand', rate: 300 }, selection: { recipe: 'ore-sifting', building: 'assembling-machine-2' } }], catalog, logistics);
  assert.deepEqual(simulate(block).starvation.map(s => [s.subBlock, s.item, s.demand, s.available]), [
    [null, 'sand', 300, 225],
    [null, 'gravel', 300, 225],
  ]);
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
