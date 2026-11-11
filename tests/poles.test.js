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

// Bridging poles (connect): the search for the fewest poles joining two networks asks each free
// spot in reach by the thousand, by the squares of its distance, the spots reached already first
// (ADR 0097). It finds the poles it found before, pole for pole: round a wall between two rows of
// machines, and toward a City Block's substation far off.
test('bridging poles: the same poles, round a wall and toward a pole far off', () => {
  const medium = { name: 'medium-electric-pole', size: { w: 1, h: 1 }, supplyRadius: 3.5, wireReach: 9 };
  const grid = new Grid({ x: 0, y: 0, w: 40, h: 30 });
  const machines = [];
  for (let k = 0; k < 4; k++) machines.push({ name: 'm', kind: 'building', x: 1 + 4 * k, y: 1, w: 3, h: 3 }, { name: 'm', kind: 'building', x: 22 + 4 * k, y: 24, w: 3, h: 3 });
  for (const m of machines) grid.place(m);
  for (let y = 0; y < 30; y++) if (y < 20 || y > 22) grid.place({ name: 'wall', kind: 'wall', x: 19, y, w: 1, h: 1 });
  assert.deepEqual(placePoles(grid, machines, medium, { inside: true }).map(p => [p.x, p.y]), [[6, 0], [27, 21], [31, 21], [18, 6], [12, 0], [23, 13]]);
  const open = new Grid({ x: 0, y: 0, w: 60, h: 20 });
  const two = [{ name: 'm', kind: 'building', x: 2, y: 8, w: 3, h: 3 }, { name: 'm', kind: 'building', x: 10, y: 8, w: 3, h: 3 }];
  for (const m of two) open.place(m);
  const far = { x: 56, y: 2, w: 2, h: 2, spec: substation };
  assert.deepEqual(placePoles(open, two, medium, { fixed: [far], inside: true }).map(p => [p.x, p.y]), [[7, 5], [52, 5], [43, 5], [34, 5], [25, 5], [16, 5]]);
});
