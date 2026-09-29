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

test('a producer that makes less than its consumer needs starves it, even on a roomy belt', () => {
  const block = {
    subBlocks: [needs('copper-cable', 300)],
    routes: [{ id: 3, consumers: [0], items: [{ item: 'copper-cable', supply: 200, capacity: 900 }] }],
  };
  assert.deepEqual(simulate(block).starvation, [{ route: 3, subBlock: 0, item: 'copper-cable', demand: 300, available: 200 }]);
});
