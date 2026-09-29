import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandChain } from '../js/chain.js';
import { catalog, pyCatalog } from './fixtures/catalog.js';

const byItem = entries => Object.fromEntries(entries.map(e => [e.goal.item, e.goal.rate]));

// Py small-parts-01: 2 per 0.2s craft from 1 gear, 3 cable and 3 bolts. 120/min is 60 crafts/min:
// 60 gears, 180 cable, 180 bolts. Bolts come 2 per craft from 2 iron sticks: 90 crafts, 180
// sticks; sticks come 2 per craft from 1 iron plate: 90 plates. Gears take 2 plates each: 120.
// Cable comes 2 per craft from 1 copper plate: 90 plates.
test('the chain makes every ingredient down to the Train Inputs, at the rate its consumers need', () => {
  const { entries, trainInputs } = expandChain([{ item: 'small-parts-01', rate: 120 }], pyCatalog, { inputs: ['iron-plate', 'copper-plate'] });
  assert.deepEqual(byItem(entries), {
    'small-parts-01': 120, 'iron-gear-wheel': 60, 'copper-cable': 180, bolts: 180, 'iron-stick': 180,
  });
  assert.deepEqual(trainInputs, [
    { item: 'iron-plate', rate: 210, reason: 'chosen' },
    { item: 'copper-plate', rate: 90, reason: 'chosen' },
  ]);
});

test('a step can run a chosen recipe in a chosen building', () => {
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 120 }], pyCatalog, {
    inputs: ['iron-plate', 'copper-plate'], selections: { bolts: { recipe: 'bolts', building: 'automated-factory-mk01' } },
  });
  assert.deepEqual(entries.find(e => e.goal.item === 'bolts').selection, { recipe: 'bolts', building: 'automated-factory-mk01' });
});

test('an item that is also a Goal is made for the Goal and for its consumers', () => {
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 120 }, { item: 'iron-gear-wheel', rate: 30 }], pyCatalog, { inputs: ['iron-plate', 'copper-plate'] });
  assert.equal(byItem(entries)['iron-gear-wheel'], 90);
});

// 60 cable/min is 30 crafts, each taking 1 copper plate.
test('an item no recipe makes arrives by train', () => {
  const { entries, trainInputs } = expandChain([{ item: 'copper-cable', rate: 60 }], catalog, { inputs: [] });
  assert.deepEqual(entries.map(e => e.goal.item), ['copper-cable']);
  assert.deepEqual(trainInputs, [{ item: 'copper-plate', rate: 30, reason: 'no recipe' }]);
});

// reheat-coke-gas consumes coke-oven-gas and makes it again: the input is not a step of its own.
test('a recipe consuming its own product takes it by train', () => {
  const { entries, trainInputs } = expandChain([{ item: 'coke-oven-gas', rate: 1425 }], catalog, {
    inputs: [], selections: { 'coke-oven-gas': { recipe: 'reheat-coke-gas', building: 'py-heat-exchanger' } },
  });
  assert.deepEqual(entries.map(e => e.goal.item), ['coke-oven-gas']);
  assert.deepEqual(trainInputs.map(t => [t.item, t.reason]), [['coke-oven-gas', 'cycle'], ['hot-molten-salt', 'no recipe']]);
});

// Two recipes making each other: the second takes the first's product by train, rather than
// feeding it back into a step that has already been sized.
test('in a loop of two recipes, the inner one takes the outer product by train', () => {
  const loop = {
    ...catalog,
    recipes: {
      a: { name: 'a', category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'b', amount: 1 }], products: [{ type: 'item', name: 'a', amount: 1 }] },
      b: { name: 'b', category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'a', amount: 2 }], products: [{ type: 'item', name: 'b', amount: 1 }] },
    },
  };
  const { entries, trainInputs } = expandChain([{ item: 'a', rate: 10 }], loop, { inputs: [] });
  assert.deepEqual(byItem(entries), { a: 10, b: 10 });
  assert.deepEqual(trainInputs, [{ item: 'a', rate: 20, reason: 'cycle' }]);
});
