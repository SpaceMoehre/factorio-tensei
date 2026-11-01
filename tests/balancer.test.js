import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designBalancer, layBalancer, traceBalancer, flowOfTrace, beltsFor, withBalancers, ensureBalancer, balancerRecipe, BALANCER } from '../js/balancer.js';
import { balancerCore } from '../js/layout/balancecore.js';
import { planSubBlocks } from '../js/plan.js';
import { buildFlows } from '../js/flows.js';
import { catalog } from './fixtures/catalog.js';

const names = { belt: 'transport-belt', underground: 'underground-belt', splitter: 'splitter', reach: 8 };
const open = () => true;
const room = { y0: 0, y1: 100 };

test('beltsFor: the belts a rate fills, at least one', () => {
  assert.equal(beltsFor(4000, 900), 5);
  assert.equal(beltsFor(900, 900), 1);
  assert.equal(beltsFor(901, 900), 2);
  assert.equal(beltsFor(0, 900), 1);
});

test('a power of two balancer gives every out belt the same, whatever the in belts carry', () => {
  for (const n of [2, 4, 8]) assert.ok(designBalancer(n, n).evenness > 0.99, `${n}-${n}`);
});

test('a laid out balancer is the network it was made from: no belt side-loaded, every out belt carries its share', () => {
  for (const [n, m] of [[2, 2], [4, 4], [4, 3], [3, 2], [8, 5]]) {
    const design = designBalancer(n, m, { load: 0.9 });
    const ends = Array.from({ length: n }, (_, k) => ({ x: 10, y: 20 + 3 * k }));
    const laid = layBalancer(design, ends, names, open, room);
    assert.ok(laid, `${n}-${m} fits`);
    const trace = traceBalancer(laid.entities, ends, names.reach);
    assert.deepEqual(trace.problems, [], `${n}-${m}`);
    const out = flowOfTrace(trace, ends.map(() => 1));
    assert.equal(out.size, m, `${n}-${m} out belts`);
    assert.ok([...out.values()].every(v => v / 1000 > 0.9 * Math.min(1, n / m)), `${n}-${m} each out belt full-ish`);
  }
});

test('belts that are part filled are merged down by splitters first: 12 belts of 360/min into 5', () => {
  const n = 12, m = 5;
  const design = designBalancer(n, m, { rates: Array(n).fill(0.4) });
  assert.equal(design.P, 8, 'a network of 8 lanes, not 16');
  assert.equal(design.merges.length, 4);
  const ends = Array.from({ length: n }, (_, k) => ({ x: 10, y: 20 + 3 * k }));
  const laid = layBalancer(design, ends, names, open, { y0: 0, y1: 150 });
  assert.ok(laid, 'fits');
  const trace = traceBalancer(laid.entities, ends, names.reach);
  assert.deepEqual(trace.problems, []);
  const got = [...flowOfTrace(trace, ends.map(() => 0.4)).values()].map(v => v / 1000);
  assert.equal(got.length, m);
  assert.ok(Math.min(...got) > 0.8 * Math.max(...got), `out belts ${got.map(v => v.toFixed(2))}`);
  assert.ok(got.reduce((a, b) => a + b, 0) > 0.98 * n * 0.4, 'nothing held back');
});

test('belts too full to merge keep their own lanes', () => {
  assert.equal(designBalancer(4, 3, { rates: [0.7, 0.7, 0.7, 0.7] }).merges.length, 0);
});

test('no room: nothing built', () => {
  const design = designBalancer(4, 3, { load: 0.9 });
  const ends = [20, 23, 26, 29].map(y => ({ x: 10, y }));
  assert.equal(layBalancer(design, ends, names, () => false, room), null);
});

// A chain of one step making `item`, 600/min a machine.
const stepOf = (item, rate) => ({ goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' } });
const logistics = { belt: 'transport-belt', balance: ['iron-gear-wheel'], inserter: 'fast-inserter', longInserter: 'long-handed-inserter', pipe: 'pipe-to-ground', pole: 'medium-electric-pole' };

test('withBalancers: a Goal asking for one gets a Sub-Block taking its item from the step and leaving by train', () => {
  const entries = [stepOf('iron-gear-wheel', 4000)];
  const out = withBalancers(entries, catalog, logistics);
  assert.equal(out.length, 2);
  const plan = planSubBlocks(out, catalog, logistics);
  assert.equal(plan[1].balancer, true);
  assert.equal(plan[1].building, BALANCER);
  assert.equal(plan[1].count, 5, 'a count of its out belts: 4000 over belts of 900');
  assert.equal(plan[1].recipe, balancerRecipe('iron-gear-wheel'));
  const flows = buildFlows(plan, 900);
  assert.deepEqual(flows.internal.map(e => [e.from, e.to, e.item]), [[0, 1, 'iron-gear-wheel']]);
  assert.deepEqual(flows.sideOutput.map(o => [o.item, Math.round(o.rate)]), [['iron-gear-wheel', 4000]]);
  assert.equal(withBalancers([stepOf('iron-gear-wheel', 800)], catalog, logistics).length, 1, 'one belt carries it: none');
  assert.equal(withBalancers(entries, catalog, { ...logistics, balance: [] }).length, 1, 'not asked: none');
});

test('balancerCore: a core of no machines, its belts in against the west side and out from the east', () => {
  const entries = withBalancers([stepOf('iron-gear-wheel', 2700)], catalog, logistics);
  const sb = planSubBlocks(entries, catalog, logistics)[1];
  const found = balancerCore(sb, { inputs: [3], output: 8 }, names, 3, 900);
  assert.ok(found);
  const { core } = found;
  assert.equal(core.parts.filter(p => p.routeIds[0] === 3).length, 3);
  assert.equal(core.parts.filter(p => p.routeIds[0] === 8).length, 3);
  assert.ok(core.parts.filter(p => p.routeIds[0] === 3).every(p => p.kind === 'head' && p.face === 'W' && p.canEnter && !p.canExit));
  assert.ok(core.entities.every(e => e.x >= 0 && e.x + e.w <= core.w && e.y >= 0 && e.y + e.h <= core.h));
  assert.ok(core.rows.every(r => !core.entities.some(e => e.x === r.reserve[0][0] && e.y === r.y)), 'the belts at the edges are the Links');
});

test('a balancer Sub-Block laid out in a block: valid, no starvation, its splitters among the others', async () => {
  const { search } = await import('../js/search.js');
  const { simulate } = await import('../js/sim.js');
  const { validateBlock } = await import('../js/layout/validity.js');
  const { logistics: base } = await import('./fixtures/catalog.js');
  const settings = { ...base, ...logistics, plainPipe: base.plainPipe };
  const entries = withBalancers([stepOf('iron-gear-wheel', 2700)], catalog, settings);
  let block = null;
  const run = search(entries, catalog, settings, { seed: 1, maxCandidates: 30 });
  for (let step = run.next(); !step.done; step = run.next()) block = step.value.block;
  assert.ok(block, 'a layout');
  const bal = block.subBlocks.findIndex(sb => sb.balancer);
  assert.ok(bal >= 0);
  assert.deepEqual(validateBlock(block, catalog, settings), []);
  assert.deepEqual(simulate(block).starvation, []);
  assert.ok(block.entities.some(e => e.kind === 'splitter' && e.subBlock === bal));
});
