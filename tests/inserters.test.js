import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inserterRate } from '../js/inserters.js';
import { catalog } from './fixtures/catalog.js';

// The wiki's measured chest-to-chest rates (no capacity bonus): fast 2.31/s, long-handed 1.15/s.
// The estimate ignores pickup and drop time, so it may run a few percent high.
test('straight swings are within 5% of the measured chest-to-chest rates', () => {
  const near = (actual, measured) => assert.ok(actual >= measured && actual <= measured * 1.05, `${actual} vs ${measured}`);
  near(inserterRate(catalog.inserters['fast-inserter'], 180) / 60, 2.31);
  near(inserterRate(catalog.inserters['long-handed-inserter'], 180) / 60, 1.15);
});

// A fast inserter turns 0.04 revolutions per tick: a quarter turn takes 6.25 ticks, there and
// back 12.5 ticks, so 60 / 12.5 = 4.8 items/s.
test('a 90° swing is a quarter turn each way', () => {
  assert.equal(inserterRate(catalog.inserters['fast-inserter'], 90), 4.8 * 60);
});

// With inserter capacity research a hand carries several items per swing: a fast inserter with
// hand size 3 moves 3 × 4.8 = 14.4 items/s at 90°.
test('the hand size multiplies what a swing moves', () => {
  assert.ok(Math.abs(inserterRate(catalog.inserters['fast-inserter'], 90, 3) - 864) < 1e-9);
});
