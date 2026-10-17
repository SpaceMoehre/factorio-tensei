import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { search } from '../js/search.js';
import { expandChain } from '../js/chain.js';
import { logistics as base } from './fixtures/catalog.js';
import { assertValid } from './support/invariants.js';

const shipped = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const logistics = { ...base, plainPipe: 'pipe' };

function best(entries) {
  let found = null;
  const run = search(entries, shipped, logistics, { seed: 1, maxCandidates: 4 });
  for (let step = run.next(); !step.done; step = run.next()) found = step.value;
  assert.ok(found, 'no layout');
  return found;
}

// Py titanium: the screeners making grade 3 and the ti-enriched dust both make ti rejects, which
// a secondary crusher recrushes into gravel and some grade 3 titanium.
const made = ['grade-4-ti', 'grade-3-ti', 'grade-1-ti', 'ti-enriched-dust', 'powdered-ti', 'mibc', 'sand'];
const recrush = { item: 'ti-rejects', recipe: 'ti-rejects-recrush' };
const entriesOf = chain => /** @type {any[]} */ (chain.entries);
const rate = (chain, key) => entriesOf(chain).find(e => (e.use?.key ?? e.goal.item) === key).goal.rate;

test('a General Use is one step taking its byproduct from every step making it, but one a Use names', () => {
  const chain = expandChain([{ item: 'ti-enriched-dust', rate: 360 }], shipped, { made, uses: [recrush] });
  const uses = entriesOf(chain).filter(e => e.use);
  assert.deepEqual(uses.map(e => [e.use.key, [...e.use.sources].sort(), e.use.from]), [['* > ti-rejects', ['grade-3-ti', 'ti-enriched-dust'], 'grade-3-ti']]);
  // (All of both: a recrusher makes a gravel a reject.)
  assert.ok(Math.abs(uses[0].goal.rate - (rate(chain, 'grade-3-ti') / 2 + 180)) < 1e-6);
  assert.ok(!chain.byproducts.some(b => b.item === 'ti-rejects'));
  // (The dust's rejects join the grade 3 screeners' on their way to it.)
  const step = item => entriesOf(chain).findIndex(e => e.goal.item === item && !e.use);
  assert.deepEqual(entriesOf(chain)[step('ti-enriched-dust')].goal.joins, { 'ti-rejects': step('grade-3-ti') });
  assert.deepEqual(uses[0].goal.from, { 'ti-rejects': step('grade-3-ti') });
  const named = expandChain([{ item: 'ti-enriched-dust', rate: 360 }], shipped, { made, uses: [recrush, { from: 'grade-3-ti', item: 'ti-rejects', recipe: 'ti-rejects-recrush' }] });
  assert.deepEqual(entriesOf(named).filter(e => e.use).map(e => [e.use.key, e.use.sources ?? null]), [['grade-3-ti > ti-rejects', null], ['* > ti-rejects', ['ti-enriched-dust']]]);
});

test('what a Use makes of an item a step makes joins it: the step makes so much less', () => {
  const plain = expandChain([{ item: 'ti-enriched-dust', rate: 360 }], shipped, { made });
  const chain = expandChain([{ item: 'ti-enriched-dust', rate: 360 }], shipped, { made, uses: [recrush] });
  // (The grade 4 ball mills take as much grade 3 as before, the recrusher making some of it.)
  const supplied = chain.supplies.filter(s => s.item === 'grade-3-ti').reduce((sum, s) => sum + s.rate, 0);
  assert.ok(supplied > 100);
  assert.ok(Math.abs(rate(chain, 'grade-3-ti') + supplied - rate(plain, 'grade-3-ti')) < 1e-6);
  assert.deepEqual(entriesOf(chain).find(e => e.use?.key === '* > ti-rejects').goal.joins, { 'grade-3-ti': entriesOf(chain).findIndex(e => e.goal.item === 'grade-3-ti' && !e.use) });
  assert.ok(!chain.byproducts.some(b => b.item === 'grade-3-ti'));
});

// (Py's sand from gravel, by train before.)
test('what a Use makes of an item otherwise by train comes from it (a Recycled Byproduct)', () => {
  const goals = [{ item: 'sand', rate: 180 }, { item: 'ti-enriched-dust', rate: 360 }];
  const selections = { sand: { recipe: 'gravel-to-sand', building: '' } };
  assert.ok(expandChain(goals, shipped, { made, selections, belt: 'transport-belt' }).trainInputs.some(i => i.item === 'gravel'));
  const chain = expandChain(goals, shipped, { made, selections, uses: [recrush], belt: 'transport-belt' });
  assert.ok(!chain.trainInputs.some(i => i.item === 'gravel'));
  assert.deepEqual(chain.recycled.map(r => [r.item, r.into]), [['gravel', ['sand']]]);
  assert.ok(entriesOf(chain).find(e => e.goal.item === 'sand').goal.from.gravel >= 0);
});

// Laid out: the recrushers' belt sends its grade 3 off through a filter splitter onto a belt of
// its own, side-loading onto the grade 3 screeners' belt before the ball mills; the void pans'
// MIBC pipe joins the MIBC mixers'.
test('Supplied Items laid out: a belt joining the step’s belt before its consumer, a pipe its network', () => {
  const chain = expandChain([{ item: 'powdered-ti', rate: 60 }], shipped, { made, uses: [recrush, { from: 'powdered-ti', item: 'ti-pulp-03', recipe: 'titanium-pulp-stage-3-void' }] });
  assert.deepEqual(chain.supplies.map(s => s.item).sort(), ['grade-3-ti', 'mibc']);
  const { block, score } = best(chain.entries);
  assert.equal(score[0], 0, 'starves');
  assertValid(block, shipped, logistics);
  const step = item => block.subBlocks.findIndex(sb => sb.item === item && !sb.use);
  const target = block.routes.find(r => r.kind === 'belt' && r.source === step('grade-3-ti') && r.items.some(i => i.joined));
  const joining = block.routes.filter(r => r.joins === target?.id);
  assert.ok(target && joining.length, 'a belt joins the grade 3 belt');
  assert.ok(joining.every(r => r.fedBy !== undefined && block.routes[r.fedBy].source === block.subBlocks.findIndex(sb => sb.use && sb.item === 'gravel')));
  const pipes = block.routes.filter(r => r.kind === 'pipe' && r.fluid === 'mibc');
  assert.equal(new Set(pipes.map(r => r.network)).size, 1);
  assert.ok(pipes.some(r => block.subBlocks[r.source]?.use));
});

// A Use making nothing but its item: its own belt joins the step's (Py's grade 4 from the
// recrushers' grade 3).
test('a Use’s belt of nothing but a Supplied Item joins the step’s belt itself', () => {
  const chain = expandChain([{ item: 'powdered-ti', rate: 40 }], shipped, { made, uses: [
    { from: 'grade-3-ti', ...recrush }, { from: 'grade-3-ti > ti-rejects', item: 'grade-3-ti', recipe: 'grade-4-ti' },
  ] });
  assert.deepEqual(chain.supplies.map(s => s.item), ['grade-4-ti']);
  const { block, score } = best(chain.entries);
  assert.equal(score[0], 0, 'starves');
  assertValid(block, shipped, logistics);
  const use = block.subBlocks.findIndex(sb => sb.use && sb.item === 'grade-4-ti');
  const own = block.routes.find(r => r.kind === 'belt' && r.source === use);
  assert.equal(block.routes[own.joins].source, block.subBlocks.findIndex(sb => sb.item === 'grade-4-ti' && !sb.use));
});

// A General Use's byproduct from two steps: the ti-enriched dust's rejects leave its belt through a
// filter splitter, side-loading onto the grade 3 screeners' belt ahead of the recrusher.
test('a General Use laid out: the other steps’ byproduct joins the belt into it', () => {
  const chain = expandChain([{ item: 'ti-enriched-dust', rate: 60 }], shipped, { made, uses: [recrush] });
  const { block, score } = best(chain.entries);
  assert.equal(score[0], 0, 'starves');
  assertValid(block, shipped, logistics);
  const step = item => block.subBlocks.findIndex(sb => sb.item === item && !sb.use);
  const use = block.subBlocks.findIndex(sb => sb.use);
  const target = block.routes.find(r => r.kind === 'belt' && r.source === step('grade-3-ti') && r.consumers.includes(use) && r.items.some(i => i.item === 'ti-rejects' && i.joined));
  assert.ok(target, 'the rejects join the grade 3 belt into the recrusher');
  assert.ok(block.routes.some(r => r.joins === target.id && r.items[0].item === 'ti-rejects' && block.routes[r.fedBy].source === step('ti-enriched-dust')));
});

// Py molten titanium from ti-enriched dust, rejects recrushed everywhere: the dust's belt into
// the foundries carries its rejects too, up to the filter splitter sending them off to the grade 3
// screeners' (ADR 0055). Planned for the dust alone, each belt brought a third less dust.
const molten = { made: ['molten-titanium', 'ti-enriched-dust', 'powdered-ti', 'grade-4-ti', 'grade-3-ti', 'grade-1-ti', 'grade-2-ti'], selections: { 'molten-titanium': { recipe: 'molten-titanium-01', building: '' }, 'grade-1-ti': { recipe: 'grade-2-ti-crush', building: '' } } };
test('a belt with a Supplied Item on it brings its consumers all they take', () => {
  const chain = expandChain([{ item: 'molten-titanium', rate: 60 }], shipped, { ...molten, uses: [recrush] });
  const { block, score } = best(chain.entries);
  assert.equal(score[0], 0, 'starves');
  assertValid(block, shipped, logistics);
  const dust = block.routes.find(r => r.kind === 'belt' && r.source === block.subBlocks.findIndex(sb => sb.item === 'ti-enriched-dust'));
  assert.ok(block.routes.some(r => r.fedBy === dust.id && r.joins !== undefined && r.items[0].item === 'ti-rejects'), 'the rejects sent off');
});

// The recrushers' belt carries two Supplied Items and nothing else: the grade 3 goes off through a
// filter splitter to the grade 3 screeners' belt, the rest of it (gravel) side-loads onto the
// stone crushers' belt into the sand (ADR 0055). Before, only the grade 3 went: the sand starved.
test('a belt of two Supplied Items: one sent off, the rest joins the other belt', () => {
  const uses = [recrush, { item: 'stone', recipe: 'stone-to-gravel' }, { item: 'gravel', recipe: 'gravel-to-sand' }];
  const chain = expandChain([{ item: 'molten-titanium', rate: 60 }], shipped, { ...molten, uses });
  const { block, score } = best(chain.entries);
  assert.equal(score[0], 0, 'starves');
  assertValid(block, shipped, logistics);
  const gravel = block.routes.find(r => r.kind === 'belt' && block.subBlocks[r.source]?.recipe === 'ti-rejects-recrush');
  assert.deepEqual([gravel.sink, block.subBlocks[block.routes[gravel.joins].source].recipe], [null, 'stone-to-gravel']);
  assert.ok(block.routes.some(r => r.fedBy === gravel.id && r.items[0].item === 'grade-3-ti' && r.joins !== undefined), 'the grade 3 sent off');
});
