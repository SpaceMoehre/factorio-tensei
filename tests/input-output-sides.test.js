import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteOf } from '../js/city.js';
import { search } from '../js/search.js';
import { simulate } from '../js/sim.js';
import { catalog, logistics } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';
import { shareSides } from '../js/layout/sides.js';

const asm2 = (item, rate) => ({ goal: { item, rate }, selection: { recipe: item, building: 'assembling-machine-2' } });
const entries = [asm2('electronic-circuit', 300), asm2('copper-cable', 900)];
const layOut = (logi, site = null) => {
  let best = null;
  const run = search(entries, catalog, logi, { seed: 1, maxCandidates: 12, ...(site ? { site } : {}) });
  for (let step = run.next(); !step.done; step = run.next()) best = step.value.block;
  return best;
};
// Whether p stands on the bounds' edge on side d (N 0, E 4, S 8, W 12).
const onSide = (b, d, p) => (d === 4 ? p.x === b.x + b.w - 1 : d === 12 ? p.x === b.x : d === 0 ? p.y === b.y : p.y === b.y + b.h - 1);
const trainIn = block => block.routes.filter(r => r.kind === 'belt' && r.source === 'side-input' && r.fedBy === undefined);
const trainOut = block => block.routes.filter(r => r.kind === 'belt' && r.sink === 'side-output' && r.joins === undefined);

// Input Sides (ADR 0114): the user chooses the edges the train brings the inputs across, as the
// Output Side the products leave by (ADR 0069): each belt from the train starts on one.
test('Input Sides: the belts from the train come in across the edge the user chose', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 60, h: 60 }, fixtures: [] }, 2);
  for (const [input, d] of /** @type {[string, number][]} */ ([['down', 8], ['up', 0]])) {
    const logi = { ...logistics, input };
    const best = layOut(logi, site);
    assert.ok(best, input);
    assert.deepEqual(best.ins, [d]);
    assert.ok(trainIn(best).length);
    for (const r of trainIn(best)) {
      const [first] = r.pieces;
      assert.ok(onSide(best.bounds, d, first), `${input}: belt ${r.id} starts at ${first.x},${first.y}`);
      // (Heading in, or curving along the edge: never back out across it.)
      assert.notEqual(first.travel, d, `${input}: belt ${r.id} heads out`);
    }
    assertValid(best, catalog, logi);
    assert.deepEqual(simulate(best).starvation, []);
  }
});

// Several sides each (ADR 0114): every belt from or to the train takes whichever of them it
// reaches soonest; all four in and out, in a City Block and standing on its own.
test('Input and Output Sides, several each: each belt to or from the train on one of them', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 60, h: 60 }, fixtures: [] }, 2);
  const all = ['left', 'up', 'right', 'down'];
  /** @type {[any, any][]} */
  const cases = [[{ ...logistics, input: all, output: all }, site], [{ ...logistics, input: ['up', 'down'], output: ['up', 'left'] }, site], [{ ...logistics, input: all, output: all }, null]];
  for (const [logi, where] of cases) {
    const best = layOut(logi, where);
    assert.ok(best, JSON.stringify([logi.input, logi.output, !!where]));
    const ins = best.ins ?? [12], outs = best.outs ?? [best.out ?? 4];
    for (const r of trainIn(best)) {
      const [first] = r.pieces;
      assert.ok(ins.some(d => onSide(best.bounds, d, first) && first.travel !== d), `belt ${r.id} starts at ${first.x},${first.y} heading ${first.travel}`);
    }
    for (const r of trainOut(best)) {
      const last = r.pieces.at(-1);
      assert.ok(outs.some(d => onSide(best.bounds, d, last) && last.travel === d), `belt ${r.id} ends at ${last.x},${last.y} heading ${last.travel}`);
    }
    assertValid(best, catalog, logi);
    assert.deepEqual(simulate(best).starvation, []);
  }
});

// Every side open, the train's belts are shared among them (ADR 0117; ADR 0114 had each take the
// side nearest it, so a belt was never longer than from the west alone, and one side could take
// them all).
test('every side open, the belts from the train come in across more than one side', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 60, h: 60 }, fixtures: [] }, 2);
  const logi = { ...logistics, input: ['left', 'up', 'right', 'down'] };
  const all = layOut(logi, site);
  assert.ok(all);
  const used = [0, 4, 8, 12].filter(d => trainIn(all).some(r => onSide(all.bounds, d, r.pieces[0])));
  assert.ok(used.length >= 2, `sides used: ${used.join(' ')}`);
  assertValid(all, catalog, logi);
  assert.deepEqual(simulate(all).starvation, []);
});

// Input Spacing (ADR 0117): the belts from the train came in where each was nearest its
// entry, side by side at one row of copies and a dozen rows apart from the next; on the finished
// block each takes the middle of its equal stretch of the side, where a way from there is free.
test('Input Spacing: the belts from the train come in evenly along their side', () => {
  const logi = { ...logistics };
  const run = search([{ goal: { item: 'iron-plate', rate: 900 }, selection: { recipe: 'iron-plate', building: 'stone-furnace' } }], catalog, logi, { seed: 1, maxCandidates: 6 });
  let best = null;
  for (let step = run.next(); !step.done; step = run.next()) best = step.value.block;
  assert.ok(best);
  const at = trainIn(best).map(r => r.pieces[0]).filter(p => onSide(best.bounds, 12, p)).map(p => p.y).sort((a, b) => a - b);
  assert.ok(at.length >= 4, `${at.length} belts from the train`);
  const gaps = at.slice(1).map((y, k) => y - at[k]);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 2, `belts from the train at ${at.join(' ')}`);
  assertValid(best, catalog, logi);
  assert.deepEqual(simulate(best).starvation, []);
});

// Several Input Sides share the train's lines (ADR 0117): the largest first onto the side
// taking least, then lines swap sides where the loads stay as even and their ways in are shorter.
test('several Input Sides: each takes about as much, each line to the nearer side where that keeps them even', () => {
  const area = { x: 0, y: 0, w: 50, h: 50 };
  // (Four lines alike near the west edge, two sides: two each, the two highest up to the top.)
  const lines = [10, 20, 30, 40].map((y, k) => ({ ids: [k], kind: /** @type {'belt'} */ ('belt'), rate: 100, x: 2, y }));
  const sides = shareSides(area, [0, 12], lines);
  assert.deepEqual([0, 1, 2, 3].map(id => sides.get(id)), [0, 0, 12, 12]);
  // (One side alone: nothing to share.)
  assert.equal(shareSides(area, [12], lines).size, 0);
  // (Belts and pipes apart: a pipe goes to its nearest side whatever the belts bring.)
  const piped = shareSides(area, [0, 12], [...lines, { ids: [9], kind: 'pipe', rate: 1000, x: 2, y: 45 }]);
  assert.equal(piped.get(9), 12);
  // A block laid out with the west and top edges open: each takes some of the train's belts.
  const logi = { ...logistics, input: ['left', 'up'] };
  const run = search([{ goal: { item: 'iron-plate', rate: 900 }, selection: { recipe: 'iron-plate', building: 'stone-furnace' } }], catalog, logi, { seed: 1, maxCandidates: 6 });
  let best = null;
  for (let step = run.next(); !step.done; step = run.next()) best = step.value.block;
  assert.ok(best);
  for (const d of [0, 12]) assert.ok(trainIn(best).some(r => onSide(best.bounds, d, r.pieces[0])), `no belt from the train across side ${d}`);
  assertValid(best, catalog, logi);
  assert.deepEqual(simulate(best).starvation, []);
});
