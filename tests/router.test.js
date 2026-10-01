import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid, N, E, S, W } from '../js/layout/grid.js';
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

// Inserters stand at x=1..2; the tile an inserter reaches is x=3, right after them, so the belt
// has to surface there: the tunnel exit is the waypoint.
test('a tunnel may surface on a waypoint: inserters reach tunnel exits', () => {
  const grid = new Grid({ x: 0, y: 0, w: 6, h: 1 });
  wall(grid, 1, 0); wall(grid, 2, 0);
  const pieces = routeBelt(grid, { id: 0, start: { tiles: [[0, 0]], dir: E }, waypoints: [[3, 0], [5, 0]], end: 'dead' }, belts);
  const exit = pieces.find(p => p.underground === 'output');
  assert.deepEqual([exit.x, exit.y], [3, 0]);
  assert.ok(pieces.some(p => p.x === 5), 'the belt reaches the last waypoint');
});

// Walls at x=2..3, and x=5 is where another pipe joins from below: it must carry a plain pipe.
// The cheapest way from the connection at x=6 dives under x=5 as well as the walls; the pipe
// surfaces on x=5 instead and dives from x=4.
test('a pipe does not dive under a tile that must take a plain pipe', () => {
  const grid = new Grid({ x: 0, y: 0, w: 7, h: 1 });
  wall(grid, 2, 0); wall(grid, 3, 0);
  grid.reserveFluidPort(0, 0, 0);
  grid.reserveFluidPort(6, 0, 0);
  grid.surfaceOnly.add('5,0');
  const pieces = routePipe(grid, { id: 0, fluid: 'water', terminals: [[0, 0, E], [6, 0, W]], source: false, sink: false }, pipes);
  assert.ok(pieces.some(p => p.kind === 'pipe' && p.x === 5), 'a plain pipe on the joining tile');
  const ends = pieces.filter(p => p.kind === 'pipe-to-ground').map(p => p.x);
  for (let i = 0; i < ends.length; i += 2) assert.ok(Math.min(ends[i], ends[i + 1]) > 5 || Math.max(ends[i], ends[i + 1]) < 5, `pipe-to-ground ${ends}`);
});

// The belt starts south at (2,0) and must pass (2,2), then reach (0,2). A tunnel under the wall
// at (2,1) would surface on (2,2) facing the wall at (2,3): a dead end, though the cheapest way
// to (2,2). The belt goes round by column 4 instead and passes (2,2) on its way on.
test('a tunnel surfacing on a waypoint must leave the belt somewhere to go', () => {
  const grid = new Grid({ x: 0, y: 0, w: 5, h: 4 });
  wall(grid, 1, 0); wall(grid, 2, 1); wall(grid, 3, 1); wall(grid, 2, 3);
  const pieces = routeBelt(grid, { id: 0, start: { tiles: [[2, 0]], dir: S }, waypoints: [[2, 2], [0, 2]], end: 'dead' }, belts);
  assert.ok(pieces.some(p => p.x === 2 && p.y === 2 && p.underground !== 'output'), 'the belt passes (2,2)');
  assert.ok(pieces.some(p => p.x === 0 && p.y === 2), 'the belt reaches the last waypoint');
});

// A connection at (2,4) facing north, inserters either side of it and another route's belt row
// in front (y=3): the pipe dives out under the belt through a pipe-to-ground and surfaces beyond.
test('an enclosed fluid connection dives out under the inserters and belts through a pipe-to-ground', () => {
  const grid = new Grid({ x: 0, y: 0, w: 5, h: 5 });
  wall(grid, 1, 4); wall(grid, 3, 4);
  for (let x = 0; x < 5; x++) grid.reserve(x, 3, 9);
  grid.reserveFluidPort(2, 4, 0);
  const pieces = routePipe(grid, { id: 0, fluid: 'water', terminals: [[2, 4, N]], source: true, sink: false }, pipes);
  const [entrance, exit] = pieces.filter(p => p.kind === 'pipe-to-ground');
  assert.deepEqual([entrance.x, entrance.y], [2, 4]);
  assert.ok(exit.x === 2 && exit.y < 3, `surfaces at ${exit.x},${exit.y}`);
  assert.ok(pieces.some(p => p.x === 0), 'the pipe reaches the west edge');
});
