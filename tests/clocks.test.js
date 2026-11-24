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
    ['1 swing in 1 s', 1, ['iron-plate', 'copper-plate']],
    ['1 swing in 2 s', 2, ['iron-plate', 'copper-plate']],
    ['1 swing in 3 s', 2, ['iron-plate', 'widget']],
  ]);
});

// A swing moves a hand: with 2 a swing, 1 iron and 2 copper in 3 s (1 a second) take a swing in 2 s.
test('a clock counts swings: what an inserter moves over its hand size', () => {
  const both = inserter('input', ['iron-plate', 'copper-plate'], 1);
  const out = inserter('output', ['widget'], 1);
  const { of, ratios } = clocksOf(block([both, out]), widgets, 2);
  assert.equal(of.get(both), '1/2');
  assert.equal(of.get(out), '1/6');
  assert.deepEqual(ratios.map(r => [clockLabel(r.key), r.perMinute]), [['1 swing in 2 s', 60], ['1 swing in 6 s', 20]]);
  assert.equal(clockLabel('3/2'), '3 swings in 2 s');
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

// Py's evaporator makes 6 iron oxide and 10 ree concentrate in 8 s, each on a belt of its own
// (ADR 0066), a hand of 2: its iron oxide inserter swings 3 times in 8 s, its ree concentrate one
// 5 times — not each sharing its machine's products with the other's (3 in 16 s, 5 in 16 s).
test('a machine\'s output inserters share only the products they move', async () => {
  const { readFileSync } = await import('node:fs');
  const py = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  // (The solid separators taking the ree concentrate: the iron oxide goes apart, on a belt of its own.)
  const block = solve([
    { goal: { item: 'reo', rate: 60 }, selection: { recipe: 'reo', building: 'solid-separator' } },
    { goal: { item: 'ree-concentrate', rate: 120 }, selection: { recipe: 'ree-concentrate1', building: 'evaporator' } },
  ], py,
    { ...logistics, belt: 'transport-belt', inserter: 'fast-inserter', longInserter: 'long-handed-inserter', pipe: 'niobium-pipe-to-ground', plainPipe: 'niobium-pipe', pole: 'medium-electric-pole', rightAngle: true, handSize: 2 });
  const { of } = clocksOf(block, py, 2);
  const step = block.subBlocks.findIndex(sb => sb.item === 'ree-concentrate');
  const outs = block.entities.filter(e => e.kind === 'inserter' && e.role === 'output' && e.subBlock === step);
  assert.ok(outs.some(e => e.moves.join() === 'iron-oxide'), 'the iron oxide on a belt of its own');
  const machines = block.entities.filter(e => e.kind === 'building' && e.subBlock === step).length;
  const perSecond = item => outs.filter(e => e.moves.includes(item)).reduce((sum, e) => { const [s, t] = of.get(e).split('/').map(Number); return sum + 2 * s / t; }, 0);
  assert.ok(Math.abs(perSecond('iron-oxide') - machines * 6 / 8) < 1e-9, `${perSecond('iron-oxide')} iron oxide/s`);
  assert.ok(Math.abs(perSecond('ree-concentrate') - machines * 10 / 8) < 1e-9, `${perSecond('ree-concentrate')} ree concentrate/s`);
});
