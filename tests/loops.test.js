import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandChain } from '../js/chain.js';
import { planSubBlocks } from '../js/plan.js';
import { buildFlows } from '../js/flows.js';
import { solve } from '../js/solve.js';
import { simulate } from '../js/sim.js';
import { encodeBlueprint } from '../js/blueprint.js';
import { catalog, logistics } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

// A Recipe Loop in assembling machines: a takes one b and an iron plate, b takes one a for every
// two b. For 30 a a minute the block makes 60 and feeds 30 back into b.
const loop = {
  ...catalog,
  recipes: {
    ...catalog.recipes,
    a: { name: 'a', category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'b', amount: 1 }, { type: 'item', name: 'iron-plate', amount: 1 }], products: [{ type: 'item', name: 'a', amount: 1 }] },
    b: { name: 'b', category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'a', amount: 1 }], products: [{ type: 'item', name: 'b', amount: 2 }] },
  },
};
const selections = { a: { recipe: 'a', building: 'assembling-machine-2' }, b: { recipe: 'b', building: 'assembling-machine-2' } };

test("a Recipe Loop is fed in the block: the loop's last link is feedback, and the Side Output carries the Goal", () => {
  const { entries } = expandChain([{ item: 'a', rate: 30 }], loop, { made: ['b'], selections });
  const plan = planSubBlocks(entries, loop, logistics);
  const flows = buildFlows(plan);
  const name = i => plan[i].item;
  assert.deepEqual(flows.feedback.map(e => [name(e.from), name(e.to), e.item, e.rate]), [['a', 'b', 'a', 30]]);
  assert.deepEqual(flows.internal.map(e => [name(e.from), name(e.to), e.item]), [['b', 'a', 'b']]);
  assert.deepEqual(flows.sideInput.map(f => f.item), ['iron-plate']);
  assert.deepEqual(flows.sideOutput.map(f => [f.item, f.rate]), [['a', 30]]);
  // b before a: the feedback is no part of the Dependency Order.
  assert.deepEqual(flows.order.map(name), ['b', 'a']);
});

// The layout: a's output belt passes a splitter that sends b its 30 a a minute first (output
// priority on the feedback's side); the rest goes on to the train.
test("a Recipe Loop's feedback leaves its producer's output through a splitter that gives it priority", async () => {
  const { entries } = expandChain([{ item: 'a', rate: 30 }], loop, { made: ['b'], selections });
  const block = solve(entries, loop, logistics, { maxCandidates: 20 });
  assertValid(block, loop, logistics);
  assert.deepEqual(simulate(block).starvation, []);
  const feedback = block.routes.find(r => r.loop);
  assert.ok(feedback, 'a feedback belt');
  const output = block.routes[feedback.fedBy];
  assert.ok(output, 'fed from a splitter on an output belt');
  assert.deepEqual(output.taps, [feedback.id]);
  assert.equal(output.sink, 'side-output');
  const [splitter] = feedback.pieces;
  assert.equal(splitter.kind, 'splitter');
  assert.ok(output.pieces.includes(splitter));
  assert.ok(['left', 'right'].includes(splitter.priority));
  // Nothing of a comes by train.
  assert.ok(!block.routes.some(r => r.source === 'side-input' && r.fedBy === undefined && r.items.some(i => i.item === 'a')));
  const { json } = await encodeBlueprint(block, loop);
  const splitters = JSON.parse(json).blueprint.entities.filter(e => e.name === 'splitter');
  assert.deepEqual(splitters.map(e => e.output_priority), [splitter.priority]);
});
