import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupOf } from '../js/setup.js';
import { catalog } from './fixtures/catalog.js';

test('a setup saved with no logistics takes the page\'s defaults; the budget apart from them', () => {
  const setup = setupOf({ goals: [{ item: 'electronic-circuit', rate: 60 }], logistics: { budget: 30 } }, catalog);
  assert.equal(setup.logistics.belt, 'transport-belt');
  assert.equal(setup.logistics.inserter, 'fast-inserter');
  assert.equal(setup.logistics.longInserter, 'long-handed-inserter');
  assert.equal(setup.logistics.pole, 'medium-electric-pole');
  assert.equal(setup.logistics.plainPipe, 'pipe');
  assert.equal(setup.budget, 30);
  assert.ok(!('budget' in setup.logistics));
});

test('a setting the catalog no longer offers falls back to its default; one it offers stays', () => {
  const setup = setupOf({ goals: [], logistics: { belt: 'turbo-transport-belt', rightAngle: false } }, catalog);
  assert.equal(setup.logistics.belt, 'transport-belt');
  assert.equal(setup.logistics.rightAngle, false);
});

test('Goals without an item or a rate are left out; the Chain Choices default to none', () => {
  const setup = setupOf({ goals: [{ item: 'electronic-circuit', rate: 60 }, { item: '', rate: 10 }, { item: 'copper-cable', rate: 0 }], logistics: {} }, catalog);
  assert.deepEqual(setup.goals, [{ item: 'electronic-circuit', rate: 60 }]);
  assert.deepEqual(setup.choices, { made: [], selections: {}, uses: [], exports: [], voids: [] });
});

test('a Goal saved with its own recipe gives it to the Recipe Selections', () => {
  const setup = setupOf({ goals: [{ item: 'electronic-circuit', rate: 60, recipe: 'electronic-circuit', building: 'assembling-machine-2' }], logistics: {} }, catalog);
  assert.deepEqual(setup.goals, [{ item: 'electronic-circuit', rate: 60 }]);
  assert.deepEqual(setup.choices.selections, { 'electronic-circuit': { recipe: 'electronic-circuit', building: 'assembling-machine-2' } });
});

test('the City Block: as saved over its defaults; a blueprint at the top level (a tune-layout setup) turns it on', () => {
  assert.deepEqual(setupOf({ goals: [], logistics: {} }, catalog).city, { on: false, blueprint: '', w: 100, h: 100, buffer: 2, maximize: false });
  const city = setupOf({ goals: [], logistics: {}, city: { buffer: 3 }, blueprint: '0eNo' }, catalog).city;
  assert.deepEqual(city, { on: true, blueprint: '0eNo', w: 100, h: 100, buffer: 3, maximize: false });
});

test('the saved state is left as it was', () => {
  const saved = { goals: [{ item: 'electronic-circuit', rate: 60, recipe: 'electronic-circuit', building: 'assembling-machine-2' }], logistics: { belt: 'gone' } };
  const before = structuredClone(saved);
  setupOf(saved, catalog);
  assert.deepEqual(saved, before);
});
