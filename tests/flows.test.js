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
    asm2('electronic-circuit', 300), asm2('copper-cable', 900), asm2('electronic-circuit', 60),
  ], catalog);
  const { sideInput } = buildFlows(plan);
  assert.deepEqual(sideInput, [
    { item: 'iron-plate', type: 'item', rate: 360 },
    { item: 'copper-plate', type: 'item', rate: 450 },
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
