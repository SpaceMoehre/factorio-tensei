import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignFluidBoxes } from '../js/fluidboxes.js';
import { solve } from '../js/solve.js';
import { recipeOptions } from '../js/chain.js';
import { pyCatalog, logistics } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const boxes = (catalog, recipe, building) => assignFluidBoxes(catalog.recipes[recipe], catalog.buildings[building]);

// Without a fluidbox_index a recipe's fluids share every box of their side, in recipe order, the
// first ones a box more: Py's research center has three input boxes, py-science-pack-2 two fluids.
test('fluids without a fluidbox_index share every box of their side, the first ones taking more', () => {
  assert.deepEqual(boxes(shipped, 'py-science-pack-2', 'research-center-mk01'), { inputs: { 'arqad-honey': [0, 1], flavonoids: [2] }, outputs: {} });
  // A distilator's boxes alternate in and out: tar takes all four inputs, three products share five outputs.
  assert.deepEqual(boxes(shipped, 'tar-distilation', 'distilator'), {
    inputs: { tar: [0, 2, 4, 6] }, outputs: { 'flue-gas': [1, 3], 'carbon-dioxide': [5, 7], aromatics: [8] },
  });
});

test('a fluid with a fluidbox_index takes that box alone, counted from 1 among its side\'s', () => {
  // flask: molten glass into the glassworks' second input box, not its first.
  assert.deepEqual(boxes(shipped, 'flask', 'glassworks-mk01'), { inputs: { 'molten-glass': [1] }, outputs: {} });
  // small-lamp-casting: three fluids into the casting unit's first three input boxes; the fourth stays unused.
  assert.deepEqual(boxes(shipped, 'small-lamp-casting', 'casting-unit-mk01'), {
    inputs: { 'molten-iron': [0], 'molten-glass': [1], 'molten-copper': [2] }, outputs: {},
  });
  // Base basic-oil-processing (Py hides it): crude oil into the refinery's second input, petroleum gas out of its third output.
  const basic = {
    ingredients: [{ type: 'fluid', name: 'crude-oil', amount: 100, fluidboxIndex: 2 }],
    products: [{ type: 'fluid', name: 'petroleum-gas', amount: 45, fluidboxIndex: 3 }],
  };
  assert.deepEqual(assignFluidBoxes(basic, pyCatalog.buildings['oil-refinery']), { inputs: { 'crude-oil': [1] }, outputs: { 'petroleum-gas': [4] } });
});

test('a building whose boxes cannot take the recipe\'s fluids cannot run it', () => {
  const building = { fluidBoxes: [{ production: 'input', filter: 'water', connections: [] }, { production: 'output', connections: [] }] };
  const recipe = (...fluids) => ({ ingredients: fluids, products: [] });
  const water = { type: 'fluid', name: 'water', amount: 1 };
  assert.deepEqual(assignFluidBoxes(recipe(water), building), { inputs: { water: [0] }, outputs: {} });
  // More fluids than boxes, an index past them, a box filtered for another fluid.
  assert.equal(assignFluidBoxes(recipe(water, { type: 'fluid', name: 'steam', amount: 1 }), building), null);
  assert.equal(assignFluidBoxes(recipe({ ...water, fluidboxIndex: 2 }), building), null);
  assert.equal(assignFluidBoxes(recipe({ ...water, name: 'steam' }), building), null);
});

// Every recipe the shipped catalog offers a building for gets a box with a connection for each fluid.
test('the shipped catalog: every fluid of a recipe reaches its building through a connection', () => {
  for (const [recipe, buildings] of recipeOptions(shipped).buildingsFor) {
    for (const name of buildings) {
      const building = shipped.buildings[name];
      const { inputs, outputs } = assignFluidBoxes(shipped.recipes[recipe], building);
      for (const [fluid, list] of Object.entries({ ...inputs, ...outputs })) {
        assert.ok(list.some(b => building.fluidBoxes[b].connections.length), `${fluid} of ${recipe} has no connection on ${name}`);
      }
    }
  }
});

// The tile a connection's pipe stands on, for a machine turned `direction` (a quarter turn
// clockwise maps (x, y) to (-y, x)), mirrored first where it is (east to west).
const VEC = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] };
function connectionTile(m, connection) {
  const c = m.mirror ? { ...connection, x: -connection.x, direction: (16 - connection.direction) % 16 } : connection;
  let [x, y] = [c.x, c.y];
  for (let r = 0; r < m.direction; r += 4) [x, y] = [-y, x];
  const [dx, dy] = VEC[(c.direction + m.direction) % 16];
  return `${Math.floor(m.x + m.w / 2 + x + dx)},${Math.floor(m.y + m.h / 2 + y + dy)}`;
}

// What the user saw in game: the research center takes arqad honey at its middle and left input
// (facing north) and flavonoids at its right one. Each machine's pipes meet those connections.
test('Py science pack 2: arqad honey reaches the research centres at their honey inputs, flavonoids at the third', () => {
  const block = solve([{ goal: { item: 'py-science-pack-2', rate: 12 }, selection: { recipe: 'py-science-pack-2', building: 'research-center-mk01' } }], pyCatalog, logistics);
  const [honey, left, flavonoids] = pyCatalog.buildings['research-center-mk01'].fluidBoxes.map(b => b.connections[0]);
  const pipeAt = new Map(block.entities.filter(e => e.kind === 'pipe' || e.kind === 'pipe-to-ground').map(e => [`${e.x},${e.y}`, e.fluid]));
  const machines = block.entities.filter(e => e.kind === 'building');
  assert.equal(machines.length, 2);
  for (const m of machines) {
    assert.ok([honey, left].some(c => pipeAt.get(connectionTile(m, c)) === 'arqad-honey'), `no arqad honey at ${m.x},${m.y}`);
    assert.equal(pipeAt.get(connectionTile(m, flavonoids)), 'flavonoids');
    for (const c of [honey, left]) assert.notEqual(pipeAt.get(connectionTile(m, c)), 'flavonoids');
  }
  assertValid(block, pyCatalog, logistics);
});
