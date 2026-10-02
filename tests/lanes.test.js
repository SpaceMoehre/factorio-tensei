import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context, shapeOf, stackVariant, random, moduleOptions } from '../js/design.js';
import { coreLinks } from '../js/routes.js';
import { buildCore } from '../js/layout/core.js';
import { routeModule, points } from '../js/layout/module.js';
import { maxFlow } from '../js/layout/compose.js';
import { expandChain } from '../js/chain.js';
import { VEC, key } from '../js/layout/grid.js';
import { pyCatalog, logistics } from './fixtures/catalog.js';

const inside = (pt, e) => pt.x >= e.x && pt.x < e.x + e.w && pt.y >= e.y && pt.y < e.y + e.h;

// Py small parts at 3600/min: 9 bolt factories in rows of one, each dropping half its 600 bolts a
// minute on the belt above it and half on the one below (Two-Way Output), 6 belts of 900. Which
// lane an inserter drops on follows its drop point; on a curve that is not predictable, so the
// output belts go straight on where inserters drop, every drop lands on a decided lane, and
// every belt carries its one and a half machines' bolts on its two lanes.
test('output drops land on decided lanes: no curves, both lanes, each Two-Way belt full', () => {
  const items = ['small-parts-01', 'bolts', 'iron-stick', 'copper-cable', 'iron-gear-wheel'];
  const selections = Object.fromEntries(items.map(i => [i, { recipe: i, building: 'automated-factory-mk01' }]));
  const { entries } = expandChain([{ item: 'small-parts-01', rate: 3600 }], pyCatalog, { made: items.slice(1), selections });
  const ctx = context(entries, pyCatalog, logistics);
  const index = ctx.plan.findIndex(sb => sb.recipe === 'bolts');
  const sb = ctx.plan[index];
  const links = coreLinks(sb, index, ctx.routes);
  const shape = shapeOf(ctx, sb, index, links);
  const variant = stackVariant(shape, { rotation: 0, rowLength: 1, flip: true, plain: true, middle: 5, dual: true, outputFirst: true, gap: 1 }, random(1));
  const core = buildCore(sb, pyCatalog.buildings[sb.building], links, variant, ctx.env);
  const module = routeModule(core, moduleOptions(ctx, links, { w: 3, e: 3, n: 1, s: 1 }, sb));
  const perMachine = sb.outputs[0].rate / sb.count;
  const machines = module.entities.filter(e => e.kind === 'building');
  const outputs = module.parts.filter(p => p.routeIds.includes(links.output));
  assert.equal(outputs.length, 6);
  for (const part of outputs) {
    const at = new Map(part.pieces.map((p, i) => [key(p.x, p.y), i]));
    for (const ins of module.entities.filter(e => e.kind === 'inserter')) {
      const { pickup, drop } = points(ins, pyCatalog.inserters);
      const i = at.get(key(Math.floor(drop.x), Math.floor(drop.y)));
      if (i === undefined || !machines.some(m => inside(pickup, m))) continue;
      const piece = part.pieces[i], before = part.pieces[i - 1];
      const curve = piece.kind === 'belt' && before && before.underground !== 'input' && before.travel !== piece.travel;
      assert.ok(!curve, `${part.key}: an output drop at ${piece.x},${piece.y} lands on a curve`);
      // Custom vectors drop a quarter tile off the centre line: on a lane of its own choosing.
      const [dx, dy] = VEC[piece.travel];
      const across = dx * (drop.y - (piece.y + 0.5)) - dy * (drop.x - (piece.x + 0.5));
      if (ins.vectors) assert.ok(Math.abs(Math.abs(across) - 0.25) < 1e-6, `${part.key}: drop ${across} off the centre line`);
    }
    assert.ok(part.drops.every(d => d.either === 0), `${part.key}: ${JSON.stringify(part.drops)}`);
    // A row dropping on two belts gives each half its bolts.
    assert.ok(part.drops.every(d => d.share === 1 || Math.abs(d.share - 0.5) < 1e-9), JSON.stringify(part.drops));
    assert.ok(maxFlow(part.drops, perMachine, ctx.env.laneCapacity) >= part.machines * perMachine - 1e-6, `${part.key}: ${JSON.stringify(part.drops)}`);
  }
});
