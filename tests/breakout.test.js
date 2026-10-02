import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context, designStep, designOf, random, breakoutDesign, detachCopy } from '../js/design.js';
import { prepare, compose, leastStarvation } from '../js/layout/compose.js';
import { placeBlocks } from '../js/layout/place.js';
import { finishBlock } from '../js/layout/compact.js';
import { simulate } from '../js/sim.js';
import { catalog, logistics } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const asm2 = (item, rate) => ({ goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' } });
const starving = block => simulate(block).starvation.reduce((sum, s) => sum + s.demand - s.available, 0);

// 300 circuits/min on 4 assemblers, fed by 5 cable assemblers.
const setup = () => {
  const ctx = context([asm2('electronic-circuit', 300), asm2('copper-cable', 900)], catalog, logistics);
  const rng = random(1);
  const designs = ctx.plan.map((sb, i) => designOf(designStep(ctx, i, rng)[0]));
  const circuits = ctx.plan.findIndex(sb => sb.recipe === 'electronic-circuit');
  const sb = ctx.plan[circuits];
  // One circuit assembler broken out: the other three as one module, it as a module of its own.
  const broken = breakoutDesign(designStep(ctx, circuits, rng, { machines: sb.count - 1 }), designStep(ctx, circuits, rng, { machines: 1 }), 1);
  const ready = prepare(ctx, designs.map((d, i) => (i === circuits ? broken : d)));
  return { ctx, ready, circuits };
};

test('a machine broken out of its Sub-Block stands apart, linked by belts, and nothing starves', () => {
  const { ctx, ready, circuits } = setup();
  const block = finishBlock(compose(ctx, ready, placeBlocks(ctx, ready, {}), { margin: { w: 0, e: 0, n: 1, s: 1 } }), catalog, logistics);
  assertValid(block, catalog, logistics);
  assert.equal(starving(block), 0);
  const sb = block.subBlocks[circuits];
  assert.equal(block.entities.filter(e => e.kind === 'building' && e.subBlock === circuits).length, 4);
  // It stands in a box of its own, clear of the stack's.
  assert.equal(sb.apart.length, 1);
  const [box] = sb.apart;
  assert.ok(box.x >= sb.x + sb.w || box.x + box.w <= sb.x || box.y >= sb.y + sb.h || box.y + box.h <= sb.y, JSON.stringify({ sb, box }));
});

test('belts run on from the stack to a broken-out machine, never back', () => {
  const { ready, circuits } = setup();
  const apart = ready.instances.filter(inst => inst.detached);
  assert.equal(apart.length, 1);
  assert.equal(apart[0].step, circuits);
  for (const route of ready.routes.filter(r => r.kind === 'belt')) {
    route.slots.forEach((slot, k) => {
      const next = route.slots[k + 1];
      if (next && slot.inst.detached && next.inst.step === circuits) assert.ok(next.inst.detached, `route ${route.id} runs back into the stack`);
    });
  }
  // Every belt the circuits take or give reaches the broken-out machine.
  const touches = ready.routes.filter(r => r.kind === 'belt' && r.slots.some(s => s.inst === apart[0]));
  assert.equal(new Set(touches.map(r => r.base)).size, new Set(ready.routes.filter(r => r.kind === 'belt' && r.slots.some(s => s.inst.step === circuits)).map(r => r.base)).size);
});

test('what a prepared layout starves at least is what its routed layout starves', () => {
  const { ctx, ready } = setup();
  const block = finishBlock(compose(ctx, ready, placeBlocks(ctx, ready, {}), { margin: { w: 0, e: 0, n: 1, s: 1 } }), catalog, logistics);
  assert.ok(leastStarvation(ctx, ready) <= starving(block) + 1e-9);
});

// 2000 cable/min on 12 assemblers, as three copies of a module of four: one copy stands apart.
test('a copy of a repeated module broken out of its stack stands apart, and nothing starves', () => {
  const ctx = context([asm2('copper-cable', 2000)], catalog, logistics);
  const design = designStep(ctx, 0, random(1)).filter(c => c.copies).map(designOf).find(d => d?.kinds.length === 1);
  assert.ok(design, 'a design of copies alone');
  const broken = detachCopy(design);
  assert.deepEqual(broken.kinds.map(k => [k.count, k.detached ?? false]), [[design.kinds[0].count - 1, false], [1, true]]);
  const ready = prepare(ctx, [broken]);
  const block = finishBlock(compose(ctx, ready, placeBlocks(ctx, ready, {}), { margin: { w: 0, e: 0, n: 1, s: 1 } }), catalog, logistics);
  assertValid(block, catalog, logistics);
  assert.equal(starving(block), 0);
  assert.equal(block.subBlocks[0].apart.length, 1);
});
