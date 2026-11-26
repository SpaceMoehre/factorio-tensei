import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simplex, processByproducts } from '../js/byproducts.js';
import { expandChain } from '../js/chain.js';

const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));

test('simplex: the most of c·x with A x ≤ b', () => {
  assert.deepEqual(simplex([3, 2], [[1, 1], [1, 0]], [4, 3]), [3, 1]);
  // Py's plutonium shuffles 1, 2, 3 on what 200 separations a minute make: pu-238 by shuffle 2.
  const x = simplex([0, 1, 0], [[1, 1, -1], [-1, 1, 0], [1, 0, -1], [-1, -1, 2]], [1590, 750, 450, 1500]);
  assert.equal(Math.round(x[1]), 2715);
});

// Byproducts Processed into the Goal (ADR 0126): Py's pu-238 at 60/min. Separation makes 0.3 a
// craft and pu-239 to pu-242 besides; shuffled, they make the rest. Each shuffle a Use of the
// isotope only it pins, its share of what is made; the isotopes others take come off that Use's
// belt (pooled): nothing by train, the separation 60 → 0.83/min.
test('byproducts processed into the Goal: the Uses that make the most of it, the chain balancing', () => {
  const goals = [{ item: 'pu-238', rate: 60 }];
  const choices = {
    made: ['plutonium-oxide', 'plutonium-peroxide'], selections: { 'pu-238': { recipe: 'plutonium-seperation', building: '' } },
    uses: [{ item: 'pu-242', recipe: 'plutonium-shuffle-3' }, { item: 'coal', recipe: 'redhot-coke' }],
    sciencePacks: ['automation-science-pack', 'py-science-pack-1', 'logistic-science-pack', 'military-science-pack', 'py-science-pack-2'],
  };
  const done = processByproducts(goals, shipped, choices, {});
  assert.ok(done, 'nothing processed');
  assert.deepEqual(done.added.map(u => u.recipe).sort(), ['plutonium-shuffle-1', 'plutonium-shuffle-2', 'plutonium-shuffle-3', 'plutonium-shuffle-4']);
  assert.ok(done.uses.some(u => u.item === 'coal'), 'a Use of another step\'s byproduct is kept');
  assert.equal(done.before, 60);
  assert.ok(done.after < 1, `the separation makes ${done.after}/min`);
  const chain = expandChain(goals, shipped, { ...choices, uses: done.uses });
  assert.deepEqual(chain.trainInputs.filter(t => t.item.startsWith('pu-')), [], 'an isotope by train');
  const entries = /** @type {any[]} */ (chain.entries);
  const shared = entries.filter(e => e.use?.share);
  assert.ok(shared.length >= 2 && shared.every(e => e.use.share > 0 && e.use.share < 1));
  // (What a Use takes a share of comes on its belt to the others taking it: one belt an isotope.)
  for (const item of ['pu-239', 'pu-241', 'pu-242']) {
    const from = new Set(chain.entries.filter(e => e.goal.from?.[item] !== undefined).map(e => e.goal.from[item]));
    assert.equal(from.size, 1, `${item} from ${[...from]}`);
  }
});

// A Use taking a share: the rest of its item leaves by train.
test('a Byproduct Use\'s share: it takes that much, the rest leaving by train', () => {
  const goals = [{ item: 'pu-238', rate: 60 }];
  const options = { made: ['plutonium-oxide'], selections: { 'pu-238': { recipe: 'plutonium-seperation', building: '' } } };
  const all = expandChain(goals, shipped, { ...options, uses: [{ item: 'pu-240', recipe: 'plutonium-shuffle-2' }] });
  const half = expandChain(goals, shipped, { ...options, uses: [{ item: 'pu-240', recipe: 'plutonium-shuffle-2', share: 0.5 }] });
  const rate = (chain, key) => /** @type {any[]} */ (chain.entries).find(e => (e.use?.key ?? e.goal.item) === key).goal.rate;
  const left = chain => chain.byproducts.filter(b => b.item === 'pu-240').reduce((sum, b) => sum + b.rate, 0);
  assert.equal(left(all), 0);
  assert.ok(Math.abs(left(half) - rate(half, '* > pu-240')) < 1e-6, 'half of the pu-240 leaves by train');
  assert.ok(rate(half, 'pu-238') > rate(all, 'pu-238'), 'the separation makes more');
});

// A General Use of a fluid by a recipe a step or another Use runs already is that one's (ADR
// 0130): Py's purex antimony void takes the plutonium oxidation's sb phosphate 2 and the antimony
// phosphate's purex concentrate both, one step; antimony phosphate the phosphoric acid made of its
// phosphorous acid, fed back. Two steps of each fed back more than they took: no rates balanced.
test('a General Use of a fluid by a recipe a step runs is that step\'s, fed back to it', () => {
  const goals = [{ item: 'pu-238', rate: 60 }];
  const choices = {
    made: ['plutonium-oxide', 'plutonium-peroxide', 'sb-hpo-pu'],
    selections: { 'pu-238': { recipe: 'plutonium-seperation', building: '' }, 'plutonium-peroxide': { recipe: 'plutonium-oxidation', building: '' } },
    uses: [{ item: 'sb-phosphate-2', recipe: 'purex-antimony-void' }, { item: 'purex-concentrate-1', recipe: 'purex-antimony-void' },
      { item: 'phosphorous-acid', recipe: 'phosphoric-acid' }, { item: 'phosphoric-acid', recipe: 'antimony-phosphate' }],
    sciencePacks: ['automation-science-pack', 'py-science-pack-1', 'logistic-science-pack', 'military-science-pack', 'py-science-pack-2'],
  };
  const chain = expandChain(goals, shipped, choices);
  const entries = /** @type {any[]} */ (chain.entries);
  assert.equal(entries.filter(e => e.selection.recipe === 'purex-antimony-void').length, 1);
  assert.equal(entries.filter(e => e.selection.recipe === 'antimony-phosphate').length, 1);
  const recycled = item => chain.recycled.find(r => r.item === item);
  assert.equal(recycled('purex-concentrate-1')?.from, 'sb-hpo-pu');
  assert.deepEqual(recycled('phosphoric-acid')?.into, ['sb-hpo-pu']);
  assert.ok(!chain.trainInputs.some(t => t.item === 'sb-phosphate-2'), 'sb phosphate 2 by train');
});
