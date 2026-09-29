import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../js/layout/grid.js';
import { placePoles } from '../js/layout/poles.js';

// Vanilla substation: 2×2, supply area 18×18 (radius 9), wire reach 18.
const substation = { name: 'substation', size: { w: 2, h: 2 }, supplyRadius: 9, wireReach: 18 };

// A machine fills the whole routing area, so the pole stands just north or south of it — never
// west or east, where the Side Input and Side Output edges are.
test('a pole with no room inside the block stands just north or south of it', () => {
  const grid = new Grid({ x: 0, y: 0, w: 6, h: 3 });
  const machine = { name: 'machine', kind: 'building', x: 0, y: 0, w: 6, h: 3 };
  grid.place(machine);
  const [pole, ...rest] = placePoles(grid, [machine], substation);
  assert.equal(rest.length, 0);
  assert.ok(pole.y === -2 || pole.y === 3, `pole at ${pole.x},${pole.y}`);
  assert.ok(pole.x >= 0 && pole.x + 2 <= 6, `pole at ${pole.x},${pole.y}`);
});

test('a pole prefers a free spot inside the block to one outside it', () => {
  const grid = new Grid({ x: 0, y: 0, w: 8, h: 3 });
  const machine = { name: 'machine', kind: 'building', x: 0, y: 0, w: 6, h: 3 };
  grid.place(machine);
  const [pole] = placePoles(grid, [machine], substation);
  assert.ok(pole.x >= 6 && pole.y >= 0 && pole.y + 2 <= 3, `pole at ${pole.x},${pole.y}`);
});
