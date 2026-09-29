import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSubBlocks } from '../js/plan.js';
import { buildFlows } from '../js/flows.js';
import { catalog } from './fixtures/catalog.js';

const asm2 = (item, rate) => ({
  goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' },
});

const circuitsFromCable = () => planSubBlocks([asm2('electronic-circuit', 300), asm2('copper-cable', 900)], catalog);

test('Dependency Order places a producer Sub-Block before its consumer, regardless of Goal order', () => {
  const plan = circuitsFromCable();
  const { order } = buildFlows(plan);
  assert.deepEqual(order.map(i => plan[i].item), ['copper-cable', 'electronic-circuit']);
});

test('Internal Path carries what the producer outputs and the consumer needs, at the consumer rate', () => {
  const { internal } = buildFlows(circuitsFromCable());
  assert.deepEqual(internal, [{ from: 1, to: 0, item: 'copper-cable', type: 'item', rate: 900 }]);
});

test('Side Input carries inputs no Sub-Block produces, summed across consumers', () => {
  const plan = planSubBlocks([
    asm2('electronic-circuit', 300), asm2('copper-cable', 900), asm2('iron-gear-wheel', 60),
  ], catalog);
  const { sideInput } = buildFlows(plan);
  assert.deepEqual(sideInput, [
    { item: 'iron-plate', type: 'item', rate: 420 },
    { item: 'copper-plate', type: 'item', rate: 450 },
  ]);
});

test('a recipe consuming its own Goal item takes that input from Side Input', () => {
  const plan = planSubBlocks([{
    goal: { item: 'coke-oven-gas', rate: 1425 }, selection: { recipe: 'reheat-coke-gas', building: 'py-heat-exchanger' },
  }], catalog);
  const { sideInput, sideOutput, internal } = buildFlows(plan);
  assert.deepEqual(internal, []);
  assert.deepEqual(sideInput, [
    { item: 'coke-oven-gas', type: 'fluid', rate: 1500 },
    { item: 'hot-molten-salt', type: 'fluid', rate: 750 },
  ]);
  assert.deepEqual(sideOutput, [
    { item: 'coke-oven-gas', type: 'fluid', rate: 1425 },
    { item: 'molten-salt', type: 'fluid', rate: 750 },
  ]);
});

test('Side Output carries unconsumed Goal output and Byproducts', () => {
  const plan = planSubBlocks([
    asm2('electronic-circuit', 300), asm2('copper-cable', 1000),
    { goal: { item: 'petroleum-gas', rate: 110 }, selection: { recipe: 'advanced-oil-processing', building: 'oil-refinery' } },
  ], catalog);
  const { sideOutput } = buildFlows(plan);
  assert.deepEqual(sideOutput, [
    { item: 'electronic-circuit', type: 'item', rate: 300 },
    { item: 'copper-cable', type: 'item', rate: 100 },
    { item: 'petroleum-gas', type: 'fluid', rate: 110 },
    { item: 'heavy-oil', type: 'fluid', rate: 50 },
    { item: 'light-oil', type: 'fluid', rate: 90 },
  ]);
});
