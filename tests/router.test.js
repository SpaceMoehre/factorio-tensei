import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid, E, S, W } from '../js/layout/grid.js';
import { routeBelt, routePipe } from '../js/layout/router.js';

const belts = { belt: 'transport-belt', underground: 'underground-belt', reach: 5 };
const pipes = { pipe: 'pipe', underground: 'pipe-to-ground', reach: 10 };
const wall = (grid, x, y) => grid.place({ name: 'wall', kind: 'wall', x, y, w: 1, h: 1 });

// One row, a wall at x=2 and the belt's last waypoint at x=4: a full-reach hop from x=1 would
// surface at x=6, past the waypoint, with no room to come back.
test('a belt tunnel may be shorter than the underground reach (ADR 0003)', () => {
  const grid = new Grid({ x: 0, y: 0, w: 7, h: 1 });
  wall(grid, 2, 0);
  const pieces = routeBelt(grid, { id: 0, start: { tiles: [[0, 0]], dir: E }, waypoints: [[4, 0]], end: 'dead' }, belts);
  const [entrance, exit] = pieces.filter(p => p.underground);
  assert.deepEqual([entrance.underground, exit.underground], ['input', 'output']);
  assert.ok(entrance.x < 2 && exit.x > 2 && exit.x <= 4, `tunnel ${entrance.x}→${exit.x}`);
  assert.deepEqual(pieces.at(-1), { ...pieces.at(-1), x: 4, kind: 'belt' });
});

// Two machine connections at x=0 and x=5 (machines stand west and east of them) with a two-tile
// wall between: the pipe must dive under the wall and surface before the second connection.
test('a pipe-to-ground hop may be shorter than its reach', () => {
  const grid = new Grid({ x: 0, y: 0, w: 6, h: 1 });
  wall(grid, 2, 0); wall(grid, 3, 0);
  grid.reserveFluidPort(0, 0, 0);
  grid.reserveFluidPort(5, 0, 0);
  const pieces = routePipe(grid, { id: 0, fluid: 'water', terminals: [[0, 0, E], [5, 0, W]], source: false, sink: false }, pipes);
  const ends = pieces.filter(p => p.kind === 'pipe-to-ground').map(p => p.x).sort();
  assert.equal(ends.length, 2);
  assert.ok(ends[0] < 2 && ends[1] > 3 && ends[1] - ends[0] < 10, `pipe-to-ground ${ends}`);
});

// A north-south belt already runs down column 3; an east-west belt across the row must dive
// under it rather than feed into it.
test('a belt crossing another route goes under it through a tunnel', () => {
  const grid = new Grid({ x: 0, y: 0, w: 8, h: 3 });
  routeBelt(grid, { id: 0, start: { tiles: [[3, 0]], dir: S }, waypoints: [[3, 2]], end: 'dead' }, belts);
  const pieces = routeBelt(grid, { id: 1, start: { tiles: [[0, 1]], dir: E }, waypoints: [[6, 1]], end: 'dead' }, belts);
  const [entrance, exit] = pieces.filter(p => p.underground);
  assert.ok(entrance.x < 3 && exit.x > 3 && entrance.y === 1 && exit.y === 1, `tunnel ${entrance.x}→${exit.x}`);
  assert.ok(pieces.every(p => p.y === 1), 'the crossing belt stays on its row');
});
