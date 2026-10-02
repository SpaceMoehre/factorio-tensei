import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context, shapeOf, stackVariant, random } from '../js/design.js';
import { coreLinks } from '../js/routes.js';
import { buildCore } from '../js/layout/core.js';
import { expandChain } from '../js/chain.js';
import { pyCatalog, logistics } from './fixtures/catalog.js';

// Py small parts at 3600/min: 9 bolt factories make 5400 bolts a minute for 6 belts. Whole
// machines cannot share 6 belts evenly; with a Two-Way Output each machine drops its bolts on the
// belts above and below it, so every belt takes one and a half machines.
test('Two-Way Output: each row drops its output on either side, 9 machines fill 6 belts', () => {
  const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 3600 }], pyCatalog, { made: items.slice(1), selections });
  const ctx = context(entries, pyCatalog, logistics);
  const index = ctx.plan.findIndex(sb => sb.recipe === 'bolts');
  const sb = ctx.plan[index];
  const links = coreLinks(sb, index, ctx.routes);
  const shape = shapeOf(ctx, sb, index, links);
  const variant = stackVariant(shape, { rotation: 0, rowLength: 1, flip: true, plain: true, middle: 4, dual: true, gap: 1 }, random(1));
  assert.ok(variant);
  const core = buildCore(sb, pyCatalog.buildings[sb.building], links, variant, ctx.env);
  const outputs = core.parts.filter(p => p.routeIds.includes(links.output));
  assert.equal(outputs.length, 6);
  for (const p of outputs) assert.equal(p.machines, 1.5);
  // Each belt is planned to bring its small parts factory its 900 bolts a minute: half rows of
  // 300, the middle machine of three giving each of its belts what that belt lacks.
  for (let part = 0; part < 6; part++) {
    const load = variant.belts.filter(b => b.part === part && b.load).reduce((sum, b) => sum + Object.values(b.load).reduce((t, v) => t + v, 0), 0);
    assert.equal(Math.round(load), 900);
  }
  assert.equal(core.pathDrops.parts.length, 6);
  // Each machine's output inserters move its whole output, over both belts.
  const out = core.supply.find(s => s.role === 'output');
  const perMachine = sb.outputs[0].rate / sb.count;
  assert.equal(out.perMachine.length, sb.count);
  for (const moved of out.perMachine) assert.ok(moved >= perMachine - 1e-6, `${moved} < ${perMachine}`);
});

// Machines run faster than the plan needs (the Count is rounded up) only as far as their inputs
// keep up: iron sticks from the train's iron plates, on belts with room to spare, can; bolts fed
// by the iron sticks' Internal Path cannot.
test('headroom: only Sub-Blocks whose inputs keep up run faster than the plan', () => {
  const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 900 }], pyCatalog, { made: items.slice(1), selections });
  const ctx = context(entries, pyCatalog, logistics);
  const of = recipe => ctx.plan.find(sb => sb.recipe === recipe);
  // 1350 bolts/min from 3 factories of 600: 1.33 as fast, but held to what the iron sticks bring.
  assert.equal(of('bolts').headroom, 1);
  // 1350 iron sticks/min from 6 factories of 240: 1.067 as fast, on iron plates from the train.
  assert.ok(Math.abs(of('iron-stick').headroom - 1440 / 1350) < 1e-9);
});
