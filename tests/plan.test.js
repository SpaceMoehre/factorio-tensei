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

// 300/min needs 3.33 machines of 90/min each: 4 of them could make 360/min.
test('the rounded-up Count leaves headroom: 4 machines can run 1.2 times as fast as 300/min needs', () => {
  const [sb] = planSubBlocks([{
    goal: { item: 'electronic-circuit', rate: 300 },
    selection: { recipe: 'electronic-circuit', building: 'assembling-machine-2' },
  }], catalog);
  assert.ok(Math.abs(sb.headroom - 1.2) < 1e-9);
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

// Stone furnace: 90kW at effectivity 1 on 4MJ coal burns 90e3 / 4e6 = 0.0225 coal/s, 1.35/min.
// Iron plates take 3.2s, so 37.5/min keeps exactly 2 furnaces busy: 2.7 coal/min.
test('Fuel: a burner machine takes its Fuel as one more input, at the rate its power draw needs', () => {
  const [sb] = planSubBlocks([{
    goal: { item: 'iron-plate', rate: 37.5 }, selection: { recipe: 'iron-plate', building: 'stone-furnace' },
  }], catalog, { fuel: 'coal' });
  assert.equal(sb.count, 2);
  assert.deepEqual(sb.inputs.map(i => [i.name, i.type]), [['iron-ore', 'item'], ['coal', 'item']]);
  assert.equal(sb.inputs[0].rate, 37.5);
  assert.ok(Math.abs(sb.inputs[1].rate - 2.7) < 1e-9, `coal at ${sb.inputs[1].rate}/min`);
});

test('Fuel must suit the burner: a furnace cannot burn a nuclear fuel cell', () => {
  assert.throws(() => planSubBlocks([{
    goal: { item: 'iron-plate', rate: 37.5 }, selection: { recipe: 'iron-plate', building: 'stone-furnace' },
  }], catalog, { fuel: 'nuclear-fuel-cell' }), /stone-furnace burns chemical fuel, not nuclear-fuel-cell/);
});

test('electric machines take no Fuel', () => {
  const [sb] = planSubBlocks([{
    goal: { item: 'iron-gear-wheel', rate: 90 }, selection: { recipe: 'iron-gear-wheel', building: 'assembling-machine-2' },
  }], catalog, { fuel: 'coal' });
  assert.deepEqual(sb.inputs.map(i => i.name), ['iron-plate']);
});
