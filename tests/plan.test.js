import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSubBlocks } from '../js/plan.js';
import { catalog } from './fixtures/catalog.js';

test('Count covers the Goal rate: 300 electronic-circuit/min in assembling-machine-2 needs 4 machines', () => {
  const [sb] = planSubBlocks([{
    goal: { item: 'electronic-circuit', rate: 300 },
    selection: { recipe: 'electronic-circuit', building: 'assembling-machine-2' },
  }], catalog);
  assert.equal(sb.count, 4);
});

test('Sub-Block input and output rates are scaled to the Goal rate, not to the rounded-up Count', () => {
  const [sb] = planSubBlocks([{
    goal: { item: 'electronic-circuit', rate: 300 },
    selection: { recipe: 'electronic-circuit', building: 'assembling-machine-2' },
  }], catalog);
  assert.deepEqual(sb.inputs, [
    { name: 'iron-plate', type: 'item', rate: 300 },
    { name: 'copper-cable', type: 'item', rate: 900 },
  ]);
  assert.deepEqual(sb.outputs, [{ name: 'electronic-circuit', type: 'item', rate: 300 }]);
});

test('a Goal needs a positive rate', () => {
  assert.throws(() => planSubBlocks([{
    goal: { item: 'electronic-circuit', rate: 0 },
    selection: { recipe: 'electronic-circuit', building: 'assembling-machine-2' },
  }], catalog), /electronic-circuit: the rate must be above 0/);
});

test('an item can be a Goal only once', () => {
  const circuits = {
    goal: { item: 'electronic-circuit', rate: 60 },
    selection: { recipe: 'electronic-circuit', building: 'assembling-machine-2' },
  };
  assert.throws(() => planSubBlocks([circuits, circuits], catalog), /electronic-circuit is a Goal more than once/);
});

test('multi-output recipe: non-Goal outputs are Byproducts at the same craft rate', () => {
  const [sb] = planSubBlocks([{
    goal: { item: 'petroleum-gas', rate: 110 },
    selection: { recipe: 'advanced-oil-processing', building: 'oil-refinery' },
  }], catalog);
  assert.equal(sb.count, 1);
  assert.deepEqual(sb.byproducts, [
    { name: 'heavy-oil', type: 'fluid', rate: 50 },
    { name: 'light-oil', type: 'fluid', rate: 90 },
  ]);
});
