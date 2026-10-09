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

// Recycled Byproducts: g takes an i and an iron plate and makes x besides (`spare` x a craft);
// i takes an x and a copper plate. x comes from g, not by train (Py's sodium hydroxide gives the
// limestone its lime takes).
const loop = spare => ({
  ...catalog,
  recipes: {
    ...catalog.recipes,
    g: { name: 'g', category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'i', amount: 1 }, { type: 'item', name: 'iron-plate', amount: 1 }], products: [{ type: 'item', name: 'g', amount: 1 }, { type: 'item', name: 'x', amount: spare }] },
    i: { name: 'i', category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'x', amount: 1 }, { type: 'item', name: 'copper-plate', amount: 1 }], products: [{ type: 'item', name: 'i', amount: 1 }] },
    x: { name: 'x', category: 'crafting', time: 1, ingredients: [{ type: 'item', name: 'stone', amount: 1 }], products: [{ type: 'item', name: 'x', amount: 1 }] },
  },
});
const selections = { g: { recipe: 'g', building: 'assembling-machine-2' }, i: { recipe: 'i', building: 'assembling-machine-2' } };

test('a byproduct a step takes comes from the step making it, not by train', () => {
  const recipes = loop(1);
  const chain = expandChain([{ item: 'g', rate: 30 }], recipes, { made: ['i'], selections });
  assert.deepEqual(chain.trainInputs.map(t => t.item).sort(), ['copper-plate', 'iron-plate']);
  assert.deepEqual(chain.recycled, [{ item: 'x', from: 'g', into: ['i'], rate: 30, spare: 0 }]);
  assert.deepEqual(chain.byproducts, []);
  const plan = planSubBlocks(chain.entries, recipes, logistics);
  const flows = buildFlows(plan);
  assert.deepEqual(flows.feedback.map(e => [plan[e.from].item, plan[e.to].item, e.item, e.rate]), [['g', 'i', 'x', 30]]);
  assert.deepEqual(flows.sideOutput.map(f => [f.item, f.rate]), [['g', 30]]);
});

test('less byproduct than the step takes: it comes by train', () => {
  const chain = expandChain([{ item: 'g', rate: 30 }], loop(0.5), { made: ['i'], selections });
  assert.deepEqual(chain.recycled, []);
  assert.ok(chain.trainInputs.some(t => t.item === 'x'));
});

// The producer's belt carries g and x: a splitter sends x (filter) to i, and, x being more than i
// takes, a second splitter gives i priority and sends the rest back onto the belt to the train.
test('a recycled byproduct on a mixed belt: filtered off, the spare side-loaded back on', async () => {
  const recipes = loop(2);
  const chain = expandChain([{ item: 'g', rate: 30 }], recipes, { made: ['i'], selections });
  assert.deepEqual(chain.recycled.map(r => [r.item, r.rate, r.spare]), [['x', 30, 30]]);
  assert.deepEqual(chain.byproducts.map(b => [b.from, b.item, b.rate]), [['g', 'x', 30]]);
  const block = solve(chain.entries, recipes, logistics, { maxCandidates: 20 });
  assertValid(block, recipes, logistics);
  assert.deepEqual(simulate(block).starvation, []);
  const feedback = block.routes.find(r => r.loop);
  const output = block.routes[feedback.fedBy];
  const [first] = feedback.pieces;
  assert.equal(first.filter, 'x');
  const second = feedback.pieces.find(p => p.kind === 'splitter' && p !== first);
  assert.ok(second && !second.filter && second.priority === first.priority, 'a second splitter');
  // Its spare turns onto the output belt from the side.
  const spill = block.entities.find(e => e.kind === 'belt' && e.route === output.id && !output.pieces.includes(e));
  assert.ok(spill && output.pieces.some(p => `${p.x},${p.y}` === spill.out), 'the spare side-loads onto the output belt');
  const { json } = await encodeBlueprint(block, recipes);
  const splitters = JSON.parse(json).blueprint.entities.filter(e => e.name === 'splitter');
  assert.deepEqual(splitters.map(e => [e.filter?.name, e.output_priority]).sort(), [[undefined, first.priority], ['x', first.priority]]);
});
