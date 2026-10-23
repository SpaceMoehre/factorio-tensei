import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { planSubBlocks } from '../js/plan.js';
import { catalog } from './fixtures/catalog.js';

const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));

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
    // (A fluid at the temperature it comes out at: its default, 15°, ADR 0067.)
    { name: 'heavy-oil', type: 'fluid', rate: 50, temperature: 15 },
    { name: 'light-oil', type: 'fluid', rate: 90, temperature: 15 },
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

// A fuel's Burnt Result (Py's coal leaves ash): one for each item burnt, a byproduct of the step.
test('Fuel: a burner machine makes its fuel\'s Burnt Result as a byproduct, one for each item burnt', () => {
  const ashy = { ...catalog, fuels: { ...catalog.fuels, coal: { ...catalog.fuels.coal, burntResult: 'ash' } } };
  const [sb] = planSubBlocks([{
    goal: { item: 'iron-plate', rate: 37.5 }, selection: { recipe: 'iron-plate', building: 'stone-furnace' },
  }], ashy, { fuel: 'coal' });
  const ash = sb.outputs.find(o => o.name === 'ash');
  assert.ok(ash && Math.abs(ash.rate - 2.7) < 1e-9, `ash at ${ash?.rate}/min`);
  assert.deepEqual(sb.byproducts.map(o => o.name), ['ash']);
});

// (A burner that cannot burn the Fuel burns its own category's: the one chosen, else that of most
// energy, ADR 0070; none of its category, an error.)
test('Fuel must suit the burner: a furnace given nuclear fuel cells burns chemical fuel instead', () => {
  const plan = logistics => planSubBlocks([{
    goal: { item: 'iron-plate', rate: 37.5 }, selection: { recipe: 'iron-plate', building: 'stone-furnace' },
  }], catalog, logistics)[0].inputs.map(i => i.name);
  assert.deepEqual(plan({ fuel: 'nuclear-fuel-cell' }), ['iron-ore', 'coal']);
  assert.deepEqual(plan({ fuel: 'nuclear-fuel-cell', fuels: { chemical: 'coal' } }), ['iron-ore', 'coal']);
  const bare = { ...catalog, fuels: { 'nuclear-fuel-cell': catalog.fuels['nuclear-fuel-cell'] } };
  assert.throws(() => planSubBlocks([{
    goal: { item: 'iron-plate', rate: 37.5 }, selection: { recipe: 'iron-plate', building: 'stone-furnace' },
  }], bare, { fuel: 'nuclear-fuel-cell' }), /stone-furnace burns chemical fuel, not nuclear-fuel-cell/);
});

// Py's glassworks: 10MW at effectivity 1 on natural gas of 90kJ burns 10e6 / 90e3 = 111.1 units/s
// while busy. Flasks take 3s for 2: 40/min keeps exactly one busy, 6666.7 gas/min.
test('Liquid Fuel: a machine burning a fluid takes it as a fluid input into its fuel box', () => {
  const [sb] = planSubBlocks([{
    goal: { item: 'flask', rate: 40 }, selection: { recipe: 'flask', building: 'glassworks-mk01' },
  }], shipped, { fuel: 'coal', liquidFuel: 'natural-gas' });
  const gas = sb.inputs.find(i => i.name === 'natural-gas');
  assert.equal(sb.count, 1);
  assert.equal(gas.type, 'fluid');
  assert.ok(Math.abs(gas.rate - 1e7 / 9e4 * 60) < 1e-6, `natural gas at ${gas.rate}/min`);
  assert.deepEqual(sb.boxes.inputs['natural-gas'], [shipped.buildings['glassworks-mk01'].fluidBoxes.findIndex(b => b.production === 'fuel')]);
  assert.ok(!sb.inputs.some(i => i.name === 'coal'));
  assert.throws(() => planSubBlocks([{ goal: { item: 'flask', rate: 40 }, selection: { recipe: 'flask', building: 'glassworks-mk01' } }], shipped, {}), /glassworks-mk01 burns a fluid; choose a Liquid Fuel/);
});

test('electric machines take no Fuel', () => {
  const [sb] = planSubBlocks([{
    goal: { item: 'iron-gear-wheel', rate: 90 }, selection: { recipe: 'iron-gear-wheel', building: 'assembling-machine-2' },
  }], catalog, { fuel: 'coal' });
  assert.deepEqual(sb.inputs.map(i => i.name), ['iron-plate']);
});

// Py small parts 2 at 2 machines: 1200 iron sticks a minute into bolts and 360 into the small
// parts, 1560 on one belt of 900; a part of the iron sticks for each, a belt each.
test('Parted by Consumer: a producer of more than a belt for several Sub-Blocks makes a part for each', async () => {
  const pyCatalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const { expandChain } = await import('../js/chain.js');
  const { buildFlows } = await import('../js/flows.js');
  const { partByConsumer } = await import('../js/plan.js');
  const settings = { belt: 'transport-belt' };
  const selections = Object.fromEntries(['small-parts-02', 'bolts', 'iron-stick', 'belt'].map(item => [item, { recipe: item, building: 'automated-factory-mk01' }]));
  const entriesAt = rate => expandChain([{ item: 'small-parts-02', rate }], pyCatalog, { made: ['bolts', 'iron-stick', 'belt'], selections }).entries;
  const parted = partByConsumer(entriesAt(360), pyCatalog, settings);
  const sticks = parted.map((e, i) => [e, i]).filter(([e]) => e.goal.item === 'iron-stick');
  assert.equal(sticks.length, 2);
  assert.ok(sticks.every(([e]) => e.goal.part));
  const plan = planSubBlocks(parted, pyCatalog, settings);
  const flows = buildFlows(plan, 900);
  const into = item => flows.internal.filter(e => e.item === 'iron-stick' && plan[e.to].item === item);
  assert.deepEqual(into('bolts').map(e => Math.round(e.rate)), [1200]);
  assert.deepEqual(into('small-parts-02').map(e => Math.round(e.rate)), [360]);
  assert.notEqual(into('bolts')[0].from, into('small-parts-02')[0].from);
  // Each part makes what its consumer takes; nothing leaves by train.
  for (const e of [...into('bolts'), ...into('small-parts-02')]) assert.ok(Math.abs(plan[e.from].rate - e.rate) < 1e-6);
  assert.ok(!flows.sideOutput.some(o => o.item === 'iron-stick'));
  // At 1 machine, 780 a minute: one belt carries it, nothing parted; parted entries are kept.
  const one = entriesAt(180);
  assert.equal(partByConsumer(one, pyCatalog, settings), one);
  assert.equal(partByConsumer(parted, pyCatalog, settings), parted);
});
