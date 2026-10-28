import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactness, scoreOf, compare, better, RANK, SQUARE, BEND } from '../js/layout/score.js';
import { solve } from '../js/solve.js';
import { catalog, logistics } from './fixtures/catalog.js';

const belt = (x, y, travel) => ({ kind: 'belt', name: 'transport-belt', x, y, w: 1, h: 1, travel });

// A 10 × 4 block: a machine, an inserter and a pole; a belt that turns twice; a pipe with a corner.
const block = () => ({
  bounds: { x: 0, y: 0, w: 10, h: 4 },
  entities: [
    { kind: 'building', x: 0, y: 0, w: 3, h: 3 }, { kind: 'inserter', x: 3, y: 1, w: 1, h: 1 }, { kind: 'pole', x: 9, y: 0, w: 1, h: 1 },
  ],
  routes: [
    { kind: 'belt', pieces: [belt(4, 0, 4), belt(5, 0, 8), belt(5, 1, 4), belt(6, 1, 4)] },
    { kind: 'pipe', pieces: [{ x: 7, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 3 }] },
  ],
});

test('Compactness: the strip beyond a square, the tiles nothing but belts and pipes stand on, and every bend', () => {
  const score = compactness(block());
  assert.equal(score.square, 6 * 4);
  assert.equal(score.empty, 40 - 9 - 1 - 1);
  assert.equal(score.bends, 3);
  assert.equal(score.value, SQUARE * 24 + 29 + BEND * 3);
});

test('a belt running round the block fills nothing: it only adds its bends', () => {
  const wild = block();
  wild.routes[0].pieces.push(belt(6, 2, 8), belt(6, 3, 12), belt(5, 3, 12), belt(4, 3, 0));
  const [plain, round] = [compactness(block()), compactness(wild)];
  assert.equal(round.empty, plain.empty);
  assert.equal(round.bends, plain.bends + 3);
  assert.ok(round.value > plain.value);
});

test('in a City Block its shape is given: no strip beyond a square counts', () => {
  assert.equal(compactness({ ...block(), site: {} }).square, 0);
});

test('the search aims at square blocks: two Sub-Blocks side by side stack about square', () => {
  const asm2 = (item, rate) => ({ goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' } });
  for (const entries of [[asm2('electronic-circuit', 300), asm2('copper-cable', 900)], [asm2('electronic-circuit', 300), asm2('copper-cable', 900), asm2('iron-gear-wheel', 900)]]) {
    const { w, h } = solve(entries, catalog, logistics).bounds;
    assert.ok(Math.max(w, h) / Math.min(w, h) <= 1.25, `${w}×${h}`);
  }
});

test('a score ranks part by part, Starvation first: a layout starving less beats any more compact one', () => {
  const lean = { starving: 0, loopsByTrain: 0, riding: 1, supporting: 0, compactness: 900, entities: 300 };
  const tight = { starving: 0.5, loopsByTrain: 0, riding: 0, supporting: 0, compactness: 100, entities: 100 };
  assert.ok(better(lean, tight));
  assert.ok(!better(tight, lean));
  assert.ok(better(lean, null), 'anything beats none');
  assert.equal(compare(lean, { ...lean }), 0);
  assert.equal(compare({ ...lean, compactness: 800 }, lean), -1);
  // (Compared through riding only: Compactness and entities make no difference.)
  assert.equal(compare({ ...lean, compactness: 800 }, lean, 'riding'), 0);
  assert.equal(compare({ ...lean, riding: 2, compactness: 1 }, lean, 'riding'), 1);
  assert.deepEqual(RANK, ['starving', 'loopsByTrain', 'riding', 'supporting', 'compactness', 'entities']);
});

test('scoreOf a laid-out block: its parts by name, nothing starving, its Compactness and entities as counted', () => {
  const laid = solve([{ goal: { item: 'iron-gear-wheel', rate: 60 }, selection: { recipe: 'iron-gear-wheel', building: 'assembling-machine-2' } }], catalog, logistics, { maxCandidates: 4 });
  const score = scoreOf(laid);
  assert.deepEqual(Object.keys(score), RANK);
  assert.equal(score.starving, 0);
  assert.equal(score.compactness, compactness(laid).value);
  assert.equal(score.entities, laid.entities.length);
});
