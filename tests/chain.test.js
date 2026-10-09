import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandChain, useKey } from '../js/chain.js';
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

// Two recipes making each other, b taking two a for each b, a one b for each a: the loop takes
// more a than it makes, so b takes a by train.
test('in a loop of two recipes that takes more than it makes, the inner one takes the outer product by train', () => {
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

// A Recipe Loop: a takes one b, b takes one a for every two b. Each a made takes half an a back,
// so the block makes 20 a a minute for the Goal's 10 and feeds the other 10 back into b.
test('a recipe loop is made in the block: its steps make enough for the Goal and the loop', () => {
  const loop = {
    ...catalog,
    recipes: {
      a: { name: 'a', category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'b', amount: 1 }], products: [{ type: 'item', name: 'a', amount: 1 }] },
      b: { name: 'b', category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'a', amount: 1 }], products: [{ type: 'item', name: 'b', amount: 2 }] },
    },
  };
  const { entries, trainInputs, loops } = expandChain([{ item: 'a', rate: 10 }], loop, { made: ['b'] });
  assert.deepEqual(byItem(entries), { a: 20, b: 20 });
  assert.deepEqual(trainInputs, []);
  assert.deepEqual(loops, [{ item: 'a', into: 'b', rate: 10 }]);
  // A recipe taking its own product (four make five): five times the Goal, four fifths back.
  const self = { ...catalog, recipes: { c: { name: 'c', category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'c', amount: 4 }, { type: 'item', name: 'iron-plate', amount: 1 }], products: [{ type: 'item', name: 'c', amount: 5 }] } } };
  const own = expandChain([{ item: 'c', rate: 10 }], self);
  assert.deepEqual(byItem(own.entries), { c: 50 });
  assert.deepEqual(own.loops, [{ item: 'c', into: 'c', rate: 40 }]);
  assert.deepEqual(own.trainInputs, [{ item: 'iron-plate', rate: 10, reason: 'no recipe' }]);
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

// Py's hydroclassifiers make 50 iron pulp and 50 iron slime a craft: 600 pulp/min is 12 crafts,
// 600 slime. Its Byproduct Use takes all of it, 100 a craft (6 crafts: 6 unslimed iron, 600
// tailings, 1200 water); a Use of that unslimed iron makes 40 molten iron from each (240, with 18
// borax and 360 oxygen).
test('a Byproduct Use takes all of its step\'s byproduct, its products leaving by train or used again', () => {
  const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const from = useKey('iron-pulp-01', 'iron-slime');
  const uses = [
    { from, item: 'unslimed-iron', recipe: 'molten-iron-06' },
    { from: 'iron-pulp-01', item: 'iron-slime', recipe: 'unslimed-iron' },
  ];
  const { entries, trainInputs, byproducts } = expandChain([{ item: 'iron-pulp-01', rate: 600 }], shipped, { uses });
  assert.deepEqual(entries.map((/** @type {any} */ e) => [e.goal.item, e.goal.rate, e.selection.recipe, e.use?.key]), [
    ['iron-pulp-01', 600, 'classify-iron-ore-dust', undefined],
    ['unslimed-iron', 6, 'unslimed-iron', from],
    ['molten-iron', 240, 'molten-iron-06', useKey(from, 'unslimed-iron')],
  ]);
  assert.deepEqual(entries.map((/** @type {any} */ e) => e.goal.from), [undefined, { 'iron-slime': 0 }, { 'unslimed-iron': 1 }]);
  assert.deepEqual(Object.fromEntries(trainInputs.map(t => [t.item, t.rate])), { 'iron-ore-dust': 36, water: 4800, borax: 18, oxygen: 360 });
  // What leaves by train, each offered the recipes taking it.
  assert.deepEqual(byproducts.map(b => [b.from, b.item, b.rate]), [[from, 'tailings', 600], [useKey(from, 'unslimed-iron'), 'molten-iron', 240]]);
  assert.ok(byproducts[0].recipes.includes('iron-slime'));
  // A Use whose step no longer makes its item is left out, and so are its own.
  const without = expandChain([{ item: 'iron-pulp-01', rate: 600 }], shipped, { uses: uses.slice(0, 1) });
  assert.equal(without.entries.length, 1);
  assert.deepEqual(without.byproducts.map(b => [b.item, b.rate]), [['iron-slime', 600]]);
});
