import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteOf } from '../js/city.js';
import { search } from '../js/search.js';
import { simulate } from '../js/sim.js';
import { catalog, logistics } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

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
  for (const [logi, where] of [[{ ...logistics, input: all, output: all }, site], [{ ...logistics, input: ['up', 'down'], output: ['up', 'left'] }, site], [{ ...logistics, input: all, output: all }, null]]) {
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

// Every side open, a belt from the train is no longer than with the west alone: it may still
// come from there.
test('every side open, no belt from the train runs longer than from the west alone', () => {
  const site = siteOf({ area: { x: 0, y: 0, w: 60, h: 60 }, fixtures: [] }, 2);
  const length = block => trainIn(block).reduce((sum, r) => sum + r.pieces.length, 0);
  const west = layOut(logistics, site), all = layOut({ ...logistics, input: ['left', 'up', 'right', 'down'] }, site);
  assert.ok(west && all);
  assert.ok(length(all) <= length(west), `${length(all)} > ${length(west)}`);
});
