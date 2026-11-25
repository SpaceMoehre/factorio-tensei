import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expandChain } from '../js/chain.js';
import { processByproducts } from '../js/byproducts.js';
import { planSubBlocks } from '../js/plan.js';
import { buildFlows } from '../js/flows.js';
import { buildRoutes } from '../js/routes.js';
import { search } from '../js/search.js';
import { logistics as base } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const logistics = { ...base, plainPipe: 'pipe' };
const ISOTOPES = ['pu-239', 'pu-240', 'pu-241', 'pu-242'];

// Py's pu-238, its byproducts processed (ADR 0126): each isotope made by up to three Sub-Blocks
// and taken by up to two, the shuffles in a ring.
const choices = {
  made: ['plutonium-oxide', 'plutonium-peroxide'], selections: { 'pu-238': { recipe: 'plutonium-seperation', building: '' } }, uses: [],
  sciencePacks: ['automation-science-pack', 'py-science-pack-1', 'logistic-science-pack', 'military-science-pack', 'py-science-pack-2'],
};
function processedChain(rate) {
  const goals = [{ item: 'pu-238', rate }];
  const { uses } = /** @type {any} */ (processByproducts(goals, shipped, choices, logistics));
  return expandChain(goals, shipped, { ...choices, uses, logistics });
}
const processed = rate => planSubBlocks(processedChain(rate).entries, shipped, logistics);

// Byproducts joined in a loop (ADR 0127): no join can come before its takers in a ring, so each
// maker's isotope is tapped off its own belt into each taker, its share, as few belts as makers
// and takers less one; none is an Internal Path, so the Dependency Order has no ring.
test('byproducts joined in a loop: each maker\'s tapped off into each taker, its share', () => {
  const plan = processed(3.59);
  const flows = buildFlows(plan, 900);
  for (const item of ISOTOPES) {
    assert.ok(!flows.joined.some(j => j.item === item), `${item} joined`);
    assert.ok(!flows.internal.some(e => e.item === item), `${item} on an Internal Path`);
    const taps = flows.feedback.filter(e => e.item === item);
    assert.ok(taps.every(e => e.tapped));
    const makers = new Set(taps.map(e => e.from));
    const takers = new Set(taps.map(e => e.to));
    assert.ok(taps.length <= makers.size + takers.size - 1, `${item}: ${taps.length} belts`);
    for (const t of takers) {
      const brought = taps.filter(e => e.to === t).reduce((sum, e) => sum + e.rate, 0);
      const takes = plan[t].inputs.find(x => x.name === item).rate;
      assert.ok(Math.abs(brought - takes) < 1e-6 * Math.max(1, takes), `${item} into ${t}: ${brought} of ${takes}`);
    }
  }
  // (A belt every product of which is tapped off still runs on to the train: a belt to tap.)
  const routes = buildRoutes(plan, flows, 450);
  for (const r of routes.filter(r => r.kind === 'belt' && typeof r.source === 'number')) {
    assert.ok(r.sink !== null || r.consumers.length, `Sub-Block ${r.source}'s belt goes nowhere`);
  }
});

// (One Item a Belt, ADR 0066: each product on a belt of its own, the taps still belts of their
// own, none an Internal Path; a product all tapped off still runs on to the train.)
test('byproducts joined in a loop, each product on a belt of its own: taps all the same', () => {
  const plan = processed(3.59);
  const apart = () => true;
  const flows = buildFlows(plan, 900, apart);
  for (const item of ISOTOPES) assert.ok(!flows.internal.some(e => e.item === item), `${item} on an Internal Path`);
  for (const r of buildRoutes(plan, flows, 450, apart).filter(r => r.kind === 'belt' && typeof r.source === 'number')) {
    assert.ok(r.sink !== null || r.consumers.length, `Sub-Block ${r.source}'s belt of ${r.product} goes nowhere`);
  }
});

test('byproducts joined in a loop lay out: nothing starving, none by train', () => {
  const chain = processedChain(3.59);
  let found = null;
  const run = search(chain.entries, shipped, logistics, { seed: 1, maxCandidates: 12 });
  for (let step = run.next(); !step.done; step = run.next()) {
    if (!found || step.value.score.starving < found.score.starving || (step.value.score.starving === found.score.starving && step.value.score.loopsByTrain < found.score.loopsByTrain)) found = step.value;
  }
  assert.ok(found, 'no layout');
  assert.equal(found.score.starving, 0, 'starves');
  assert.equal(found.score.loopsByTrain, 0, 'an isotope by train');
  assertValid(found.block, shipped, logistics);
});
