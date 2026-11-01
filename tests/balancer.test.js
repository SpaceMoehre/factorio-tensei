import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designBalancer, layBalancer, traceBalancer, flowOfTrace, beltsFor, balanceBlock, balancerWidth } from '../js/balancer.js';
import { encodeBlueprint } from '../js/blueprint.js';
import { catalog } from './fixtures/catalog.js';

const names = { belt: 'transport-belt', underground: 'underground-belt', splitter: 'splitter', reach: 8 };
const open = () => true;
const room = { x1: 1000, y0: 0, y1: 100 };

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
    const laid = layBalancer(design, ends, [], names, open, room);
    assert.ok(laid, `${n}-${m} fits`);
    const trace = traceBalancer(laid.entities, ends, names.reach);
    assert.deepEqual(trace.problems, [], `${n}-${m}`);
    const out = flowOfTrace(trace, ends.map(() => 1));
    assert.equal(out.size, m, `${n}-${m} out belts`);
    // (Full belts in: n in the fluid model's belts of 1, the out belts at most 1 each.)
    assert.ok([...out.values()].every(v => v / 1000 > 0.9 * Math.min(1, n / m)), `${n}-${m} each out belt full-ish`);
  }
});

test('a belt of another item leaving past the balancer is carried through under its tracks', () => {
  const design = designBalancer(4, 3, { load: 0.9 });
  const ends = [20, 30, 40, 50].map(y => ({ x: 10, y }));
  const through = [{ x: 10, y: 35 }];
  const laid = layBalancer(design, ends, through, names, open, room);
  assert.ok(laid);
  assert.ok(laid.entities.some(e => e.y === 35), 'the belt goes on');
  assert.deepEqual(traceBalancer(laid.entities, [...ends, { x: 10, y: 35 }], names.reach).problems.filter(p => !/loop|leads/.test(p)), []);
});

test('no room east of the block: nothing built', () => {
  const design = designBalancer(4, 3, { load: 0.9 });
  const ends = [20, 23, 26, 29].map(y => ({ x: 10, y }));
  assert.equal(layBalancer(design, ends, [], names, open, { x1: 14, y0: 0, y1: 100 }), null);
  assert.equal(layBalancer(design, ends, [], names, () => false, room), null);
});

// A block with `ys.length` belts of an item leaving across its east edge, each 600/min.
const blockOf = (ys, { item = 'iron-plate', extra = [] } = {}) => {
  const piece = (x, y) => ({ name: 'transport-belt', kind: 'belt', x, y, w: 1, h: 1, direction: 4, travel: 4 });
  const routes = ys.map((y, id) => ({ id, kind: 'belt', source: 0, sink: 'side-output', items: [{ item, rate: 600 }], pieces: [piece(8, y), piece(9, y)] }));
  return { entities: routes.flatMap(r => r.pieces), routes: [...routes, ...extra], bounds: { x: 0, y: 0, w: 10, h: 60 }, subBlocks: [], site: null };
};

test('balanceBlock: four belts of 600/min go into a 4-3 balancer', () => {
  const block = blockOf([10, 20, 30, 40]);
  const { block: out, note } = balanceBlock(block, catalog, 'iron-plate');
  assert.match(note, /4 belts in, 3 out/);
  assert.equal(out.balancer.m, 3);
  assert.ok(out.routes.filter(r => r.balanced).length === 4);
  assert.equal(block.balancer, undefined, 'the block itself is left as it was');
  const mine = out.entities.filter(e => e.balancer);
  assert.deepEqual(traceBalancer(mine, out.routes.map(r => r.pieces.at(-1)), 8).problems, []);
});

test('balanceBlock: one belt, a mixed belt, or another item builds nothing', () => {
  assert.equal(balanceBlock(blockOf([10]), catalog, 'iron-plate').block.balancer, undefined);
  assert.equal(balanceBlock(blockOf([10, 20]), catalog, 'copper-plate').block.balancer, undefined);
  const mixed = blockOf([10, 20]);
  mixed.routes[0].items.push({ item: 'stone', rate: 10 });
  const { block, note } = balanceBlock(mixed, catalog, 'iron-plate');
  assert.equal(block.balancer, undefined);
  assert.match(note, /One Item a Belt|One item a belt/i);
});

test('balancerWidth: none for a belt, some for more; the blueprint holds the balancer and its markers', async () => {
  assert.equal(balancerWidth(500, catalog, 'transport-belt'), 0);
  assert.ok(balancerWidth(2000, catalog, 'transport-belt') > 4);
  const { block } = balanceBlock(blockOf([10, 20, 30, 40]), catalog, 'iron-plate');
  const { json } = await encodeBlueprint(block, catalog);
  const names2 = new Set(JSON.parse(json).blueprint.entities.map(e => e.name));
  assert.ok(names2.has('splitter'));
  assert.ok(names2.has('display-panel'));
});

test('the Side Input lists what comes by train, not what the block gathers of its own (grade-3-ti, ti-rejects)', async () => {
  const { fromTrain } = await import('../js/routes.js');
  const input = { source: 'side-input', items: [{ item: 'ore-titanium' }], consumers: [1] };
  assert.ok(fromTrain(input));
  assert.ok(fromTrain({ ...input, fedBy: 3 }), 'a branch of a train belt');
  assert.ok(!fromTrain({ ...input, loop: { from: 7 }, fedBy: 33 }), 'a loop');
  assert.ok(!fromTrain({ source: 'side-input', items: [{ item: 'grade-3-ti' }], consumers: [], fedBy: 36, joins: 33 }), 'gathered off a belt');
  assert.ok(!fromTrain({ source: 4, items: [] }));
});
