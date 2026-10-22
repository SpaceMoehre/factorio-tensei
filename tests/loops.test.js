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

// Py hot air (warmer air from RHEs): the stone bricks the hot-air RHE gives back all go round the
// loop to the RHEs warming them. Their coke oven gas goes round a loop of temperatures (ADR 0067):
// the heat exchangers make it at 500°, which the warmer bricks take (500° at least), giving it back
// at 250°, which the warm bricks take (250° at least), giving it back at 100°, which the heat
// exchangers take (100° at most), the train topping it up. Before, all of it was one fluid: the
// heat exchangers made it for both kinds of bricks, theirs by train, the bricks' to the train.
test('Py hot air: coke oven gas round its loop of temperatures, every stone brick fed back', async () => {
  const { readFileSync } = await import('node:fs');
  const { context } = await import('../js/design.js');
  const { search } = await import('../js/search.js');
  const { rankOf } = await import('../js/layout/score.js');
  const { pipeNetworks } = await import('../js/layout/compose.js');
  const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const py = { ...logistics, pipe: 'niobium-pipe-to-ground', plainPipe: 'niobium-pipe', liquidFuel: 'methane', handSize: 1 };
  const made = ['pressured-air', 'warmer-stone-brick', 'warm-stone-brick', 'coke-oven-gas'];
  const chain = expandChain([{ item: 'hot-air', rate: 6000 }], shipped, { made, selections: { 'hot-air': { recipe: 'warmer-air-2' } }, logistics: py });
  const step = recipe => chain.entries.findIndex(e => e.selection.recipe === recipe);
  const [warmer, warm, reheat] = ['warmer-stone-brick-1', 'warm-stone-brick-1', 'reheat-coke-gas'].map(step);
  assert.equal(chain.entries[warm].goal.from['coke-oven-gas'], warmer);
  assert.equal(chain.entries[reheat].goal.from['coke-oven-gas'], warm);
  assert.equal(chain.entries[warmer].goal.from?.['coke-oven-gas'], undefined, 'the warmer bricks take the heat exchangers\' gas');
  assert.ok(Math.abs(chain.entries[reheat].goal.rate - 8080) < 1, `${chain.entries[reheat].goal.rate}`);
  // (What comes by train comes at what its takers take: the gas topping up 100° at most, the hot
  // molten salt 950° at least.)
  assert.deepEqual(Object.fromEntries(chain.trainInputs.map(t => [t.item, t.temperature])), { 'coke-oven-gas': { max: 100 }, 'hot-molten-salt': { min: 950 } });
  const ctx = context(chain.entries, shipped, py);
  const heats = ctx.routes.filter(r => r.kind === 'pipe' && r.fluid === 'coke-oven-gas' && typeof r.source === 'number').map(r => [ctx.plan[r.source].recipe, r.temperature]);
  assert.deepEqual(Object.fromEntries(heats), { 'warmer-stone-brick-1': 250, 'warm-stone-brick-1': 100, 'reheat-coke-gas': 500 });
  let found = null;
  const run = search(chain.entries, shipped, py, { seed: 1, maxCandidates: 6 });
  for (let next = run.next(); !next.done; next = run.next()) found = next.value;
  assert.ok(found, 'no layout');
  assert.deepEqual(rankOf(found.block).slice(0, 2), [0, 0]);
  const networks = pipeNetworks(found.block.routes);
  const gas = found.block.routes.filter(r => r.kind === 'pipe' && r.fluid === 'coke-oven-gas' && r.temperature !== undefined && r.sink !== 'side-output');
  for (const a of gas) for (const b of gas) if (a.temperature !== b.temperature) assert.ok(networks.get(a.id) === undefined || networks.get(a.id) !== networks.get(b.id));
  assertValid(found.block, shipped, py);
});

// Py hot air with its hot molten salt made too: the heat exchangers give back as molten salt all
// the hot molten salt they take, and the biomass powerplants heat all of it again. A closed loop:
// the train only fills it through a top-up valve, no overflow letting any off to the train. The
// powerplants burn biomass only: not the Fuel (coal), but the biomass fuel of most energy, or the
// one chosen for biomass (logistics.fuels).
test('Py hot air: molten salt round a closed loop, the train only filling it; the powerplants burning biomass', async () => {
  const { readFileSync } = await import('node:fs');
  const { search } = await import('../js/search.js');
  const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const py = { ...logistics, pipe: 'niobium-pipe-to-ground', plainPipe: 'niobium-pipe', fuel: 'coal', liquidFuel: 'methane', handSize: 1 };
  const made = ['pressured-air', 'warmer-stone-brick', 'warm-stone-brick', 'coke-oven-gas', 'hot-molten-salt'];
  const options = { made, selections: { 'hot-air': { recipe: 'warmer-air-2' } } };
  const chain = expandChain([{ item: 'hot-air', rate: 6000 }], shipped, { ...options, logistics: py });
  const reheat = chain.entries.find(e => e.selection.recipe === 'reheat-coke-gas').goal;
  assert.equal(reheat.overflow, undefined);
  assert.deepEqual(reheat.closed, ['molten-salt']);
  const salt = chain.trainInputs.find(t => t.item === 'molten-salt');
  assert.ok(salt.fill && salt.rate < 0.011 * reheat.rate, JSON.stringify(salt));
  assert.ok(chain.trainInputs.some(t => t.item === 'charcoal-briquette') && !chain.trainInputs.some(t => t.item === 'coal'));
  const wood = expandChain([{ item: 'hot-air', rate: 6000 }], shipped, { ...options, logistics: { ...py, fuels: { biomass: 'wood' } } });
  assert.ok(wood.trainInputs.some(t => t.item === 'wood'));
  let found = null;
  const run = search(chain.entries, shipped, py, { seed: 1, maxCandidates: 6 });
  for (let next = run.next(); !next.done && !found; next = run.next()) found = next.value;
  assert.ok(found, 'no layout');
  const pipes = found.block.routes.filter(r => r.kind === 'pipe' && r.fluid === 'molten-salt');
  assert.ok(pipes.every(r => r.sink !== 'side-output' && r.valve?.mode !== 'overflow'), JSON.stringify(pipes.map(r => [r.source, r.sink, r.valve])));
  assert.ok(pipes.some(r => r.source === 'side-input' && r.valve?.mode === 'top-up' && r.fill));
  assertValid(found.block, shipped, py);
});
