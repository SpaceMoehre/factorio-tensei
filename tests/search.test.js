import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../js/solve.js';
import { simulate } from '../js/sim.js';
import { catalog, pyCatalog, logistics } from './fixtures/catalog.js';
import { assertValid, assertNoCustomVectors, assertFeedsEveryMachine } from './support/invariants.js';

const asm2 = (item, rate) => ({ goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' } });
const machinesOf = (block, recipe) => block.entities.filter(e => e.kind === 'building' && e.recipe === recipe);
const beltRoutes = (block, sb) => block.routes.filter(r => r.kind === 'belt' && (r.source === sb || r.consumers.includes(sb)));

// Py electronic-circuit: 7 solid ingredients. At 180/min (4 chipshooters) every ingredient fits a
// lane, so Belt Merge pairs them onto 4 belts; with the output that is 5 belts, beyond v1's 4.
test('a recipe needing 5 belts solves: Py electronic-circuit with 7 solid ingredients', () => {
  const entries = [{ goal: { item: 'electronic-circuit', rate: 180 }, selection: { recipe: 'electronic-circuit', building: 'chipshooter-mk01' } }];
  const block = solve(entries, pyCatalog, logistics);
  assert.equal(machinesOf(block, 'electronic-circuit').length, 4);
  assert.ok(beltRoutes(block, 0).length >= 5, `${beltRoutes(block, 0).length} belts`);
  assertValid(block, pyCatalog, logistics);
});

// 2100/min at 600/min per wet scrubber: 4 machines, three input fluids side by side.
test('Py nitrogen-mustard at 4 machines routes', () => {
  const block = solve([{
    goal: { item: 'nitrogen-mustard', rate: 2100 }, selection: { recipe: 'nitrogen-mustard', building: 'wet-scrubber-mk01' },
  }], catalog, logistics);
  assert.equal(machinesOf(block, 'nitrogen-mustard').length, 4);
  assertValid(block, catalog, logistics);
});

test('with 90° inserters switched off, no inserter uses custom vectors', () => {
  const off = { ...logistics, rightAngle: false };
  const block = solve([asm2('electronic-circuit', 300), asm2('copper-cable', 900)], catalog, off);
  assertNoCustomVectors(block);
  assertValid(block, catalog, off);
});

// Straight swings only: a fast inserter moves 2.4 items/s, a long-handed one 1.2 (one swing there
// and back per item: 0.04 and 0.02 revolutions per tick). 180 gears/min on two machines at
// 1.5 crafts/s each need 3 iron/s per machine — more than any one inserter moves.
test('inserter count scales with throughput', () => {
  const off = { ...logistics, rightAngle: false };
  const block = solve([asm2('iron-gear-wheel', 180)], catalog, off);
  const iron = block.routes.find(r => r.items.some(i => i.item === 'iron-plate'));
  const ironTiles = new Set(iron.pieces.map(p => `${p.x},${p.y}`));
  const moves = { 'fast-inserter': 2.4, 'long-handed-inserter': 1.2 };
  // Straight inserters pick up `reach` tiles toward their direction and drop as far the other way.
  const tiles = i => {
    const reach = i.name === 'fast-inserter' ? 1 : 2;
    const [dx, dy] = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] }[i.direction];
    return { pickup: `${i.x + dx * reach},${i.y + dy * reach}`, drop: { x: i.x - dx * reach, y: i.y - dy * reach } };
  };
  const inside = ({ x, y }, m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h;
  for (const m of machinesOf(block, 'iron-gear-wheel')) {
    const feeding = block.entities.filter(e => e.kind === 'inserter' && ironTiles.has(tiles(e).pickup) && inside(tiles(e).drop, m));
    assert.ok(feeding.length >= 2, `${feeding.length} inserters feed iron into the machine at ${m.x},${m.y}`);
    assert.ok(feeding.reduce((sum, i) => sum + moves[i.name], 0) >= 3, 'the iron inserters move at least 3/s');
  }
  assert.deepEqual(simulate(block).starvation.filter(s => s.cause === 'inserters'), []);
  assertValid(block, catalog, off);
});

// 37.5 iron plates/min keep 2 stone furnaces busy; each burns 90kW / 4MJ = 0.0225 coal/s.
test('a burner machine gets a Fuel input at its power draw: 2 stone furnaces, 2.7 coal/min', () => {
  const block = solve([{ goal: { item: 'iron-plate', rate: 37.5 }, selection: { recipe: 'iron-plate', building: 'stone-furnace' } }], catalog, logistics);
  const coal = block.routes.find(r => r.items.some(i => i.item === 'coal'));
  assert.equal(coal.source, 'side-input');
  assert.ok(Math.abs(coal.items.find(i => i.item === 'coal').rate - 2.7) < 1e-9);
  assertFeedsEveryMachine(block, coal, machinesOf(block, 'iron-plate'), catalog);
  assertValid(block, catalog, logistics);
});

// Areas v1's template reached on the same scenarios (bounds including its routing margin).
const V1_AREA = {
  gears: 210, circuits: 621, three: 1444, oil: 1085, concrete: 990, distil: 540, mustard: 1344, compost: 943,
};
const SCENARIOS = {
  gears: [asm2('iron-gear-wheel', 180)],
  circuits: [asm2('electronic-circuit', 300), asm2('copper-cable', 900)],
  three: [asm2('electronic-circuit', 300), asm2('copper-cable', 900), asm2('iron-gear-wheel', 900)],
  oil: [{ goal: { item: 'petroleum-gas', rate: 1320 }, selection: { recipe: 'advanced-oil-processing', building: 'oil-refinery' } }],
  concrete: [asm2('concrete', 600)],
  distil: [{ goal: { item: 'aromatics', rate: 4800 }, selection: { recipe: 'tar-distilation', building: 'distilator' } }],
  mustard: [{ goal: { item: 'nitrogen-mustard', rate: 1500 }, selection: { recipe: 'nitrogen-mustard', building: 'wet-scrubber-mk01' } }],
  compost: [{ goal: { item: 'biomass', rate: 150 }, selection: { recipe: 'biomass', building: 'compost-plant-mk01' } }],
};

for (const [name, entries] of Object.entries(SCENARIOS)) {
  test(`Compactness: the search is never worse than v1's template (${name})`, () => {
    const block = solve(entries, catalog, logistics);
    assert.ok(block.bounds.w * block.bounds.h <= V1_AREA[name], `${block.bounds.w}×${block.bounds.h} > v1's ${V1_AREA[name]}`);
    assertValid(block, catalog, logistics);
  });
}

test('the search is deterministic under a seed', () => {
  const run = () => solve(SCENARIOS.circuits, catalog, logistics, { seed: 7 });
  assert.deepEqual(run(), run());
});
