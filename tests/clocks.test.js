import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clocksOf, clockLabel, fraction } from '../js/clocks.js';
import { planSubBlocks } from '../js/plan.js';
import { solve } from '../js/solve.js';
import { catalog, logistics } from './fixtures/catalog.js';

// A widget takes 1 iron and 2 copper and 3 s in a machine of speed 1.
const widgets = {
  recipes: {
    widget: {
      name: 'widget', time: 3,
      ingredients: [{ type: 'item', name: 'iron-plate', amount: 1 }, { type: 'item', name: 'copper-plate', amount: 2 }],
      products: [{ type: 'item', name: 'widget', amount: 1 }],
    },
  },
  buildings: { assembler: { name: 'assembler', size: { w: 3, h: 3 }, craftingSpeed: 1 } },
};
const inserter = (role, moves, sharing) => ({ name: 'fast-inserter', kind: 'inserter', x: 0, y: 0, w: 1, h: 1, subBlock: 0, role, moves, sharing });
const block = entities => ({
  subBlocks: [{
    item: 'widget', rate: 40, recipe: 'widget', building: 'assembler', modules: [], count: 2,
    inputs: [{ name: 'iron-plate', type: 'item', rate: 40 }, { name: 'copper-plate', type: 'item', rate: 80 }],
    outputs: [{ name: 'widget', type: 'item', rate: 40 }],
  }],
  entities,
});

test('an inserter\'s clock: what it moves at full speed, items on its belt added up, in lowest terms, shared', () => {
  const iron = inserter('input', ['iron-plate'], 1);
  const both = inserter('input', ['iron-plate', 'copper-plate'], 1);
  const halves = [inserter('input', ['iron-plate', 'copper-plate'], 2), inserter('input', ['iron-plate', 'copper-plate'], 2)];
  const out = inserter('output', ['widget'], 1);
  const { of, ratios } = clocksOf(block([iron, both, ...halves, out]), widgets);
  assert.equal(of.get(iron), '1/3');
  // 1 iron and 2 copper in 3 s: 3 in 3 s, so 1 in 1 s; two inserters on that belt, 1 in 2 s each.
  assert.equal(of.get(both), '1/1');
  assert.deepEqual(halves.map(i => of.get(i)), ['1/2', '1/2']);
  assert.equal(of.get(out), '1/3');
  assert.deepEqual(ratios.map(r => [clockLabel(r.key), r.inserters, r.names]), [
    ['1 in 1 s', 1, ['iron-plate', 'copper-plate']],
    ['1 in 2 s', 2, ['iron-plate', 'copper-plate']],
    ['1 in 3 s', 2, ['iron-plate', 'widget']],
  ]);
});

test('fractions in lowest terms survive float error', () => {
  assert.deepEqual(fraction(0.1 + 0.2), [3, 10]);
  assert.deepEqual(fraction(1.1 * 0.75 / 3.2), [33, 128]);
  assert.deepEqual(fraction(2.5), [5, 2]);
  assert.deepEqual(fraction(1 / 3), [1, 3]);
});

// A stone furnace makes 1 iron plate from 1 ore in 3.2 s and burns 90 kW of 4 MJ coal: ore and
// coal on one belt, 5/16 + 9/400 a second.
test('a burner machine\'s inserter moves its fuel too', () => {
  const [sb] = planSubBlocks([{ goal: { item: 'iron-plate', rate: 37.5 }, selection: { recipe: 'iron-plate', building: 'stone-furnace' } }], catalog, logistics);
  const feed = { ...inserter('input', ['iron-ore', 'coal'], 1) };
  const { of } = clocksOf({ subBlocks: [sb], entities: [feed] }, catalog);
  assert.equal(of.get(feed), '67/200');
});

// 180 gears/min: two assembling machines 2, each 1.5 crafts/s at full speed, taking 3 iron/s and
// making 1.5 gears/s, whatever the share each machine's inserters move of it.
test('a block\'s inserters share their machines\' full-speed flows', () => {
  const block = solve([{ goal: { item: 'iron-gear-wheel', rate: 180 }, selection: { recipe: 'iron-gear-wheel', building: 'assembling-machine-2' } }], catalog, { ...logistics, rightAngle: false });
  const { of } = clocksOf(block, catalog);
  const inserters = block.entities.filter(e => e.kind === 'inserter');
  assert.equal(of.size, inserters.length);
  const rate = e => { const [items, seconds] = of.get(e).split('/').map(Number); return items / seconds; };
  const total = role => inserters.filter(e => e.role === role).reduce((sum, e) => sum + rate(e), 0);
  assert.ok(Math.abs(total('input') - 2 * 3) < 1e-9, `${total('input')} iron/s`);
  assert.ok(Math.abs(total('output') - 2 * 1.5) < 1e-9, `${total('output')} gears/s`);
  // Each machine's iron inserters share its 3/s evenly.
  for (const e of inserters.filter(e => e.role === 'input')) assert.ok(Math.abs(rate(e) * e.sharing - 3) < 1e-9);
});
