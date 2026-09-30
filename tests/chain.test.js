import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandChain } from '../js/chain.js';
import { catalog, pyCatalog } from './fixtures/catalog.js';

const byItem = entries => Object.fromEntries(entries.map(e => [e.goal.item, e.goal.rate]));

// Py small-parts-01: 2 per 0.2s craft from 1 gear, 3 cable and 3 bolts. 120/min is 60 crafts/min:
// 60 gears, 180 cable, 180 bolts.
test("the Goal's recipe sets what comes by train", () => {
  const { entries, trainInputs } = expandChain([{ item: 'small-parts-01', rate: 120 }], pyCatalog);
  assert.deepEqual(byItem(entries), { 'small-parts-01': 120 });
  assert.deepEqual(trainInputs, [
    { item: 'iron-gear-wheel', rate: 60, reason: 'import' },
    { item: 'copper-cable', rate: 180, reason: 'import' },
    { item: 'bolts', rate: 180, reason: 'import' },
  ]);
});

// Bolts come 2 per craft from 2 iron sticks: 180 bolts are 90 crafts, taking 180 sticks.
test('an import chosen to be made becomes a step, and its own ingredients come by train', () => {
  const { entries, trainInputs } = expandChain([{ item: 'small-parts-01', rate: 120 }], pyCatalog, { made: ['bolts'] });
  assert.deepEqual(byItem(entries), { 'small-parts-01': 120, bolts: 180 });
  assert.deepEqual(trainInputs, [
    { item: 'iron-gear-wheel', rate: 60, reason: 'import' },
    { item: 'copper-cable', rate: 180, reason: 'import' },
    { item: 'iron-stick', rate: 180, reason: 'import' },
  ]);
});

// Continuing down: sticks come 2 per craft from 1 iron plate: 90 plates. Gears take 2 plates
// each: 120. Cable comes 2 per craft from 1 copper plate: 90 plates (the fixture has no recipe
// for copper plates, so the build-here choice is not offered for it).
test('making every intermediate brings only the plates by train, at the rate their consumers need', () => {
  const made = ['iron-gear-wheel', 'copper-cable', 'bolts', 'iron-stick'];
  const { entries, trainInputs } = expandChain([{ item: 'small-parts-01', rate: 120 }], pyCatalog, { made });
  assert.deepEqual(byItem(entries), {
    'small-parts-01': 120, 'iron-gear-wheel': 60, 'copper-cable': 180, bolts: 180, 'iron-stick': 180,
  });
  assert.deepEqual(trainInputs, [
    { item: 'iron-plate', rate: 210, reason: 'import' },
    { item: 'copper-plate', rate: 90, reason: 'no recipe' },
  ]);
});

test('a step can run a chosen recipe in a chosen building', () => {
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 120 }], pyCatalog, {
    made: ['bolts'], selections: { bolts: { recipe: 'bolts', building: 'automated-factory-mk01' } },
  });
  assert.deepEqual(entries.find(e => e.goal.item === 'bolts').selection, { recipe: 'bolts', building: 'automated-factory-mk01' });
});

// 120 small parts take 60 gears; the Goal adds 30.
test('an item that is also a Goal is made for the Goal and for its consumers', () => {
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 120 }, { item: 'iron-gear-wheel', rate: 30 }], pyCatalog);
  assert.equal(byItem(entries)['iron-gear-wheel'], 90);
});

// 60 cable/min is 30 crafts, each taking 1 copper plate, which nothing makes even when asked.
test('an item no recipe makes arrives by train', () => {
  const { entries, trainInputs } = expandChain([{ item: 'copper-cable', rate: 60 }], catalog, { made: ['copper-plate'] });
  assert.deepEqual(entries.map(e => e.goal.item), ['copper-cable']);
  assert.deepEqual(trainInputs, [{ item: 'copper-plate', rate: 30, reason: 'no recipe' }]);
});

// reheat-coke-gas consumes coke-oven-gas and makes it again: the input is not a step of its own.
test('a recipe consuming its own product takes it by train', () => {
  const { entries, trainInputs } = expandChain([{ item: 'coke-oven-gas', rate: 1425 }], catalog, {
    selections: { 'coke-oven-gas': { recipe: 'reheat-coke-gas', building: 'py-heat-exchanger' } },
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
  const { entries, trainInputs } = expandChain([{ item: 'a', rate: 10 }], loop, { made: ['b'] });
  assert.deepEqual(byItem(entries), { a: 10, b: 10 });
  assert.deepEqual(trainInputs, [{ item: 'a', rate: 20, reason: 'cycle' }]);
});

test('each step carries its modules: the default for its building, or the ones chosen for it that fit', () => {
  const goal = [{ item: 'moss', rate: 48 }];
  const selectionOf = selections => expandChain(goal, pyCatalog, { selections }).entries[0].selection;
  assert.deepEqual(selectionOf({}), { recipe: 'Moss-1', building: 'moss-farm-mk01', modules: [{ name: 'moss', count: 16 }] });
  const mk02 = [{ name: 'moss-mk02', count: 10 }, { name: 'moss', count: 6 }];
  assert.deepEqual(selectionOf({ moss: { recipe: 'Moss-1', building: 'moss-farm-mk01', modules: mk02 } }).modules, mk02);
  // A module this building cannot take is dropped.
  assert.deepEqual(selectionOf({ moss: { recipe: 'Moss-1', building: 'moss-farm-mk01', modules: [{ name: 'speed-module', count: 2 }, { name: 'moss', count: 4 }] } }).modules,
    [{ name: 'moss', count: 4 }]);
});
