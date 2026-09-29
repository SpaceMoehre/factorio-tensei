import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shelfPack } from '../js/layout/pack.js';

// A producer 4 high whose output belt runs in its row 3, and a consumer 6 high taking that belt
// in its row 1: set side by side with the belt shared, the consumer sits 2 rows lower.
test('neighbours sharing a belt line up its rows', () => {
  const sizes = [{ w: 5, h: 4 }, { w: 5, h: 6 }];
  const placed = shelfPack(sizes, [0, 1], { gaps: [0, 0], shelfGap: 1, shelf: 4, shares: [null, { with: 0, rows: [3, 1] }] });
  assert.deepEqual(placed, [{ x: 0, y: 0 }, { x: 5, y: 2 }]);
});

test('when the consumer\'s row lies lower, the producer moves down instead', () => {
  const sizes = [{ w: 5, h: 4 }, { w: 5, h: 6 }];
  const placed = shelfPack(sizes, [0, 1], { gaps: [1, 0], shelfGap: 1, shelf: 4, shares: [null, { with: 0, rows: [0, 4] }] });
  assert.deepEqual(placed, [{ x: 0, y: 4 }, { x: 6, y: 0 }]);
});
