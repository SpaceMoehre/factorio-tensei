import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../js/solve.js';
import { catalog, logistics } from './fixtures/catalog.js';
import {
  assertNoOverlaps, assertRouteChain, assertFeedsEveryMachine, assertDrainsEveryMachine, assertEndsAtEastEdge,
  assertPowerNetwork, assertPipeNetwork, assertNoFluidMixing, assertSeparateNetworks,
} from './support/invariants.js';

const asm2 = (item, rate) => ({
  goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' },
});

test('a Sub-Block places Count buildings set to its recipe, with no overlapping entities', () => {
  const block = solve([asm2('iron-gear-wheel', 180)], catalog, logistics);
  const machines = block.entities.filter(e => e.name === 'assembling-machine-2');
  assert.equal(machines.length, 2);
  assert.ok(machines.every(m => m.recipe === 'iron-gear-wheel'));
  assertNoOverlaps(block.entities);
});

test('Side Input route enters at the west edge and an inserter feeds every machine from it', () => {
  const block = solve([asm2('iron-gear-wheel', 180)], catalog, logistics);
  const route = block.routes.find(r => r.source === 'side-input');
  assert.deepEqual(route.items.map(i => i.item), ['iron-plate']);
  assertRouteChain(route, catalog, logistics);
  assert.equal(route.pieces[0].x, block.bounds.x);
  assertFeedsEveryMachine(block, route, block.entities.filter(e => e.kind === 'building'));
  assertNoOverlaps(block.entities);
});

const machinesOf = (block, recipe) => block.entities.filter(e => e.kind === 'building' && e.recipe === recipe);

test('Internal Path carries the producer output into every consumer machine', () => {
  const block = solve([asm2('electronic-circuit', 300), asm2('copper-cable', 900)], catalog, logistics);
  const route = block.routes.find(r => r.items.some(i => i.item === 'copper-cable'));
  assert.equal(route.sink, null);
  assertDrainsEveryMachine(block, route, machinesOf(block, 'copper-cable'));
  assertFeedsEveryMachine(block, route, machinesOf(block, 'electronic-circuit'));
  for (const r of block.routes) assertRouteChain(r, catalog, logistics);
  assertNoOverlaps(block.entities);
});

// The wide gear Sub-Block lands on the shelf below the circuits, so the iron belt runs from the
// circuit row down to the gear row and the circuit output has to cross it to leave eastward.
test('a route crossing another goes under it through a Tunnel spanning exactly the underground max reach', () => {
  const block = solve([
    asm2('electronic-circuit', 300), asm2('copper-cable', 900), asm2('iron-gear-wheel', 900),
  ], catalog, logistics);
  const tunnels = block.entities.filter(e => e.kind === 'underground-belt');
  assert.ok(tunnels.length >= 2, 'expected at least one tunnel');
  for (const r of block.routes) assertRouteChain(r, catalog, logistics);
  const iron = block.routes.find(r => r.items.some(i => i.item === 'iron-plate'));
  assertFeedsEveryMachine(block, iron, [...machinesOf(block, 'electronic-circuit'), ...machinesOf(block, 'iron-gear-wheel')]);
  assertNoOverlaps(block.entities);
});

const sideInputItems = block => block.routes.filter(r => r.source === 'side-input').map(r => r.items.map(i => i.item));

test('Belt Merge: two Side Input items for the same consumers share one belt when each fits a lane', () => {
  const block = solve([asm2('electronic-circuit', 60)], catalog, logistics);
  assert.deepEqual(sideInputItems(block), [['iron-plate', 'copper-cable']]);
  const [route] = block.routes.filter(r => r.source === 'side-input');
  assertFeedsEveryMachine(block, route, machinesOf(block, 'electronic-circuit'));
});

test('Belt Merge: items stay on separate belts when one would overflow its lane', () => {
  const block = solve([asm2('electronic-circuit', 200)], catalog, logistics);
  assert.deepEqual(sideInputItems(block).sort(), [['copper-cable'], ['iron-plate']]);
});

test('Minimal Pole Placement powers every machine and inserter with one network and no redundant pole', () => {
  const block = solve([
    asm2('electronic-circuit', 300), asm2('copper-cable', 900), asm2('iron-gear-wheel', 90),
  ], catalog, logistics);
  assertPowerNetwork(block, catalog, logistics);
  assertNoOverlaps(block.entities);
});

// Routed in the default order, the first fluid walls off chloroethanol's connections.
test('when one route walls off another, routing retries in a different order', () => {
  const block = solve([{
    goal: { item: 'nitrogen-mustard', rate: 1500 }, selection: { recipe: 'nitrogen-mustard', building: 'wet-scrubber-mk01' },
  }], catalog, logistics);
  const machines = machinesOf(block, 'nitrogen-mustard');
  assert.equal(machines.length, 3);
  for (const r of block.routes) assertPipeNetwork(block, r, catalog, logistics, machines);
  assertNoFluidMixing(block, catalog, logistics);
  assertNoOverlaps(block.entities);
});

test('poles join into one network around machines taller than the wire reach', () => {
  const block = solve([{
    goal: { item: 'biomass', rate: 150 }, selection: { recipe: 'biomass', building: 'compost-plant-mk01' },
  }], catalog, logistics);
  assert.equal(machinesOf(block, 'biomass').length, 3);
  assertPowerNetwork(block, catalog, logistics);
  assertNoOverlaps(block.entities);
});

test('fluids: each fluid is one pipe network reaching every machine, with no mixing', () => {
  const block = solve([{
    goal: { item: 'petroleum-gas', rate: 1320 },
    selection: { recipe: 'advanced-oil-processing', building: 'oil-refinery' },
  }], catalog, logistics);
  const machines = machinesOf(block, 'advanced-oil-processing');
  assert.equal(machines.length, 2);
  const fluids = block.routes.filter(r => r.kind === 'pipe');
  assert.deepEqual(fluids.map(r => r.fluid).sort(), ['crude-oil', 'heavy-oil', 'light-oil', 'petroleum-gas', 'water']);
  for (const r of fluids) assertPipeNetwork(block, r, catalog, logistics, machines);
  assertNoFluidMixing(block, catalog, logistics);
  assertPowerNetwork(block, catalog, logistics);
  assertNoOverlaps(block.entities);
});

test('an enclosed fluid connection dives out under the inserters and belts through a pipe-to-ground', () => {
  const block = solve([asm2('concrete', 600)], catalog, logistics);
  const water = block.routes.find(r => r.fluid === 'water');
  assert.ok(water.pieces.some(p => p.kind === 'pipe-to-ground'), 'expected a pipe-to-ground');
  assertPipeNetwork(block, water, catalog, logistics, machinesOf(block, 'concrete'));
  assertNoFluidMixing(block, catalog, logistics);
  assertNoOverlaps(block.entities);
});

test('a machine whose fluid connections face east and west is rotated to reach them', () => {
  const block = solve([{
    goal: { item: 'pitch', rate: 3000 }, selection: { recipe: 'pitch-distilation', building: 'side-distilator' },
  }], catalog, logistics);
  const machines = machinesOf(block, 'pitch-distilation');
  assert.equal(machines.length, 2);
  for (const r of block.routes) assertPipeNetwork(block, r, catalog, logistics, machines);
  assertNoFluidMixing(block, catalog, logistics);
  assertPowerNetwork(block, catalog, logistics);
  assertNoOverlaps(block.entities);
});

test('fluid connections on the sides of a machine are reached through gaps between machines', () => {
  const block = solve([{
    goal: { item: 'aromatics', rate: 4800 }, selection: { recipe: 'tar-distilation', building: 'distilator' },
  }], catalog, logistics);
  const machines = machinesOf(block, 'tar-distilation');
  assert.equal(machines.length, 2);
  for (const r of block.routes.filter(r => r.kind === 'pipe')) assertPipeNetwork(block, r, catalog, logistics, machines);
  const clay = block.routes.find(r => r.kind === 'belt');
  assertRouteChain(clay, catalog, logistics);
  assertDrainsEveryMachine(block, clay, machines);
  assertNoFluidMixing(block, catalog, logistics);
  assertPowerNetwork(block, catalog, logistics);
  assertNoOverlaps(block.entities);
});

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('Packing puts independent Sub-Blocks side by side on a shelf, never overlapping', () => {
  const block = solve([
    asm2('iron-gear-wheel', 90), asm2('copper-cable', 180),
    { goal: { item: 'petroleum-gas', rate: 110 }, selection: { recipe: 'advanced-oil-processing', building: 'oil-refinery' } },
  ], catalog, logistics);
  const sbs = block.subBlocks;
  assert.equal(sbs.length, 3);
  sbs.forEach((a, i) => sbs.slice(i + 1).forEach(b => assert.ok(!overlaps(a, b), `${a.item} overlaps ${b.item}`)));
  const shareShelf = sbs.some((a, i) => sbs.slice(i + 1).some(b => a.y < b.y + b.h && b.y < a.y + a.h));
  assert.ok(shareShelf, 'every Sub-Block is on its own shelf');
});

test('Packing keeps Dependency Order: a producer comes before its consumer in reading order', () => {
  const block = solve([asm2('electronic-circuit', 300), asm2('copper-cable', 900)], catalog, logistics);
  const cable = block.subBlocks.find(s => s.item === 'copper-cable');
  const circuit = block.subBlocks.find(s => s.item === 'electronic-circuit');
  assert.ok(cable.y < circuit.y || (cable.y === circuit.y && cable.x < circuit.x));
});

test('a fluid both consumed and produced keeps its Side Input and Side Output networks apart', () => {
  const block = solve([{
    goal: { item: 'molten-salt', rate: 1500 }, selection: { recipe: 'reheat-coke-gas', building: 'py-heat-exchanger' },
  }], catalog, logistics);
  const gas = block.routes.filter(r => r.fluid === 'coke-oven-gas');
  assert.deepEqual(gas.map(r => [r.source, r.sink]), [['side-input', null], [0, 'side-output']]);
  for (const r of block.routes) assertPipeNetwork(block, r, catalog, logistics, machinesOf(block, 'reheat-coke-gas'));
  assertSeparateNetworks(block, catalog, logistics);
});

test('Side Output route collects the Goal item from every machine and leaves at the east edge', () => {
  const block = solve([asm2('iron-gear-wheel', 180)], catalog, logistics);
  const route = block.routes.find(r => r.sink === 'side-output');
  assert.deepEqual(route.items.map(i => i.item), ['iron-gear-wheel']);
  assertRouteChain(route, catalog, logistics);
  assertDrainsEveryMachine(block, route, block.entities.filter(e => e.kind === 'building'));
  assertEndsAtEastEdge(block, route);
  assertNoOverlaps(block.entities);
});
