import { VEC, N, E, S, W, turnLeft, turnRight, opposite, key, span, spansOverlap } from './grid.js';

const TURN_COST = 0.2;
const TUNNEL_COST = 2;
// How far back a growing leg checks itself for crossings; the whole leg is checked on arrival.
const RECENT_STEPS = 8;
const EXPANSIONS_PER_TILE = 12;
// Links weigh the distance left a little above the cost so far (weighted A*): a leg goes
// straight for its goal instead of trying every equally short detour first.
const GREED = 1.5;
// However large the area, a leg gives up after this many expansions plus a few hundred for each
// tile it has to cover: a path that exists is found long before.
const EXPANSIONS_MAX = 20000;
const EXPANSIONS_PER_STEP = 100;

export class RoutingError extends Error {
  /** @type {number[] | undefined} the Sub-Blocks a link that found no room runs between */
  steps;
}

// Routes a belt through its waypoints (a chain), committing each leg to the grid as it goes.
// With `straight`, the belt goes straight on through every waypoint (or dives or surfaces
// there): no waypoint piece is a curve, where an inserter's lane is not predictable. Straight 2
// also passes each waypoint heading the way its row runs on (toward the next waypoint in the
// row), straight 1 any way it can go on.
// spec: { id, kind: 'belt', start: { tiles, dir }, waypoints, end: 'dead' | 'east', straight: 0 | 1 | 2 }
// names: { belt, underground, reach }
export function routeBelt(grid, spec, names) {
  const pieces = [];
  const commit = leg => commitLeg(grid, spec, names.underground, leg, pieces);
  let starts = spec.start.tiles.map(([x, y]) => ({ x, y, a: spec.start.dir }));
  const pending = new Set(spec.waypoints.map(([x, y]) => key(x, y)));
  // from: the waypoint a leg leaves, its piece not yet laid (the leg's first move lays it).
  const target = { key: null, last: false, from: null };
  const moves = beltMoves(grid, spec, names, pending, target);
  // A leg never crosses a later waypoint of its own route. The piece on a waypoint tile is a
  // belt, a tunnel entrance or a tunnel exit: an inserter can reach any of them.
  let surfaced = false;
  for (const [i, [wx, wy]] of spec.waypoints.entries()) {
    target.key = key(wx, wy);
    target.last = i === spec.waypoints.length - 1 && spec.end === 'dead';
    pending.delete(target.key);
    // A straight belt arrives heading the way its row runs on (toward the next waypoint in the
    // row, or on past the last), where it can go on: a free tile ahead, or one to surface on.
    const want = spec.straight === 2 ? rowHeading(spec.waypoints, i) : null;
    const goesOn = s => {
      if (!spec.straight || target.last) return true;
      if (want !== null && s.a !== want) return false;
      if (s.reached || grid.freeFor(...step(s.x, s.y, s.a), spec.id)) return true;
      return HOPS(names.reach).some(hop => {
        const [x, y] = step(s.x, s.y, s.a, hop);
        return grid.freeFor(x, y, spec.id) && grid.tunnelFits(names.underground, s, { x, y });
      });
    };
    const isGoal = s => (s.reached || (s.x === wx && s.y === wy)) && goesOn(s);
    // A straight belt that can neither arrive nor go on any way it may: no leg to search for.
    if (spec.straight && !target.last && !(starts.length === 1 && starts[0].x === wx && starts[0].y === wy)
      && ![N, E, S, W].some(d => (want === null || d === want) && passes(grid, spec, names, pending, wx, wy, d))) {
      throw new RoutingError(`belt ${spec.id}: no straight way through waypoint ${wx},${wy}`);
    }
    // A tunnel that surfaced on the previous waypoint may already stand before this one.
    if (starts.length === 1 && starts[0].x === wx && starts[0].y === wy) {
      surfaced = false;
      target.from = target.key;
      continue;
    }
    const leg = search(grid, starts, isGoal, (x, y) => Math.abs(x - wx) + Math.abs(y - wy), moves,
      () => !reachable(grid, spec.id, starts, wx, wy, names.reach, pending));
    if (!leg) throw new RoutingError(`belt ${spec.id}: no path to waypoint ${wx},${wy}`);
    commit(leg);
    starts = [leg.state];
    surfaced = leg.state.reached;
    target.from = surfaced ? null : target.key;
  }
  if (spec.end === 'east' || spec.end === 'west') {
    const leg = search(grid, starts, ...edgeGoal(grid, spec.end), moves);
    if (!leg) throw new RoutingError(`belt ${spec.id}: no path to the ${spec.end} edge`);
    commit(leg);
  } else if (!surfaced) {
    const [s] = starts;
    if (!canBelt(grid, spec, s.x, s.y, s.a)) throw new RoutingError(`belt ${spec.id}: cannot end at ${s.x},${s.y}`);
    commit({ pieces: [beltPiece(spec, names, s.x, s.y, s.a)] });
  }
  return pieces;
}

// Whether a belt could pass waypoint x, y heading d: in from behind (a belt, or a tunnel
// surfacing on it) and on ahead (a belt, or a tunnel diving there).
function passes(grid, spec, names, pending, x, y, d) {
  const free = (u, v) => grid.freeFor(u, v, spec.id) && !pending.has(key(u, v));
  const tunnel = sign => HOPS(names.reach).some(hop => {
    const [u, v] = step(x, y, d, sign * hop);
    return free(u, v) && grid.tunnelFits(names.underground, { x, y }, { x: u, y: v });
  });
  const [bx, by] = step(x, y, d, -1), [ax, ay] = step(x, y, d);
  return (free(bx, by) || tunnel(-1)) && (grid.freeFor(ax, ay, spec.id) || tunnel(1));
}

// The heading a belt passes waypoint i with: toward the next waypoint when it lies in the same
// row (or column), on the way from the one before when that does; null when it is alone there.
function rowHeading(waypoints, i) {
  const [x, y] = waypoints[i];
  const toward = ([nx, ny]) => (ny === y ? (nx > x ? E : W) : nx === x ? (ny > y ? S : N) : null);
  const next = waypoints[i + 1], prev = waypoints[i - 1];
  const ahead = next && toward(next);
  if (ahead !== null && ahead !== undefined) return ahead;
  const behind = prev && toward(prev);
  return behind === null || behind === undefined ? null : opposite(behind);
}

// Leaving the area across its east (or west) edge: the goal and the distance to it.
function edgeGoal(grid, side) {
  if (side === 'east') {
    const lastX = grid.area.x + grid.area.w - 1;
    return [s => s.x === lastX + 1 && s.a === E, x => lastX + 1 - x];
  }
  const firstX = grid.area.x;
  return [s => s.x === firstX - 1 && s.a === W, x => x - (firstX - 1)];
}

// A belt in one leg from any of the start states to the goal: a tile reached with a heading
// (where the next piece, already placed, carries on), or off the east or west edge. Joins the
// routed pieces of two modules, or a module and the train.
// spec: { id, starts: [{ x, y, a }], goal: { x, y, a } | 'east' | 'west' }
export function routeLink(grid, spec, names) {
  const pieces = [];
  const moves = beltMoves(grid, spec, names, new Set(), { key: null, last: false });
  const { goal } = spec;
  const [isGoal, heuristic] = typeof goal === 'string' ? edgeGoal(grid, goal)
    : [s => s.x === goal.x && s.y === goal.y && s.a === goal.a, (x, y) => GREED * (Math.abs(x - goal.x) + Math.abs(y - goal.y))];
  if (spec.starts.some(s => isGoal(s))) return pieces;
  const leg = search(grid, spec.starts, isGoal, heuristic, moves,
    typeof goal === 'string' ? undefined : () => !reachable(grid, spec.id, spec.starts, goal.x, goal.y, names.reach, new Set()));
  if (!leg) throw new RoutingError(`belt ${spec.id}: no path from ${spec.starts[0].x},${spec.starts[0].y} to ${typeof goal === 'string' ? `the ${goal} edge` : `${goal.x},${goal.y}`}`);
  commitLeg(grid, spec, names.underground, leg, pieces);
  return pieces;
}

// Routes a fluid as a pipe tree joining every terminal (a machine fluid connection), plus the
// west edge for Side Input and the east edge for Side Output.
// spec: { id, fluid, terminals: [[x, y, outwardDir]], source: boolean, sink: boolean }
// names: { pipe, underground, reach }
export function routePipe(grid, spec, names) {
  const [[x0, y0, out0]] = spec.terminals;
  let failure = new RoutingError(`${spec.fluid}: connection at ${x0},${y0} is blocked`);
  for (const seed of seeds(grid, spec, names, x0, y0, out0)) {
    const saved = grid.snapshot();
    try {
      return growTree(grid, spec, names, seed);
    } catch (e) {
      if (!(e instanceof RoutingError)) throw e;
      failure = e;
      grid.restore(saved);
    }
  }
  throw failure;
}

function growTree(grid, spec, names, seedPieces) {
  const pieces = [];
  const tree = new Set();
  const [[x0, y0], ...rest] = spec.terminals;
  const pending = new Set(rest.map(([x, y]) => key(x, y)));
  const moves = pipeMoves(grid, spec, names, pending);
  // The distance to the tree, recomputed once per leg as the tree grows.
  let field = null;
  const toTree = {
    isGoal: s => tree.has(key(s.x, s.y)),
    heuristic: (x, y) => {
      field ??= distanceField(grid.area, tree);
      return field(x, y);
    },
  };
  const commit = leg => {
    commitLeg(grid, spec, names.underground, leg, pieces);
    for (const p of leg.pieces) if (p.kind === 'pipe') tree.add(key(p.x, p.y));
    field = null;
  };
  commit({ pieces: seedPieces });
  if (spec.source) {
    const leg = search(grid, edgeStarts(grid, grid.area.x, E), toTree.isGoal, toTree.heuristic, moves);
    if (!leg) throw new RoutingError(`${spec.fluid}: no path from the west edge`);
    commit(leg);
  }
  for (const [x, y, outward] of rest) {
    pending.delete(key(x, y));
    if (tree.has(key(x, y))) continue;
    const leg = search(grid, [{ x, y, a: outward }], toTree.isGoal, toTree.heuristic, moves,
      () => !pipeReaches(grid, spec.id, x, y, tree, names.reach));
    if (!leg) throw new RoutingError(`${spec.fluid}: cannot connect ${x},${y}`);
    commit(leg);
  }
  if (spec.sink) {
    const leg = search(grid, edgeStarts(grid, grid.area.x + grid.area.w - 1, W), toTree.isGoal, toTree.heuristic, moves);
    if (!leg) throw new RoutingError(`${spec.fluid}: no path to the east edge`);
    commit(leg);
  }
  return pieces;
}

// Ways to start the tree at its first machine connection: a pipe there if the pipe could
// continue somewhere, or a pipe-to-ground diving straight out under whatever encloses it, for
// each hop length that surfaces on a free tile.
function* seeds(grid, spec, names, x, y, outward) {
  const open = directions(outward).some(d => {
    const [nx, ny] = step(x, y, d);
    return grid.freeFor(nx, ny, spec.id) && !grid.pipeBlocked.has(key(nx, ny));
  });
  if (open && canPipe(grid, spec, x, y)) yield [pipePiece(spec, names, x, y, outward)];
  for (const hop of pipeMoves(grid, spec, names, new Set())({ x, y, a: outward })) {
    if (hop.pieces.length === 2 && canPipe(grid, spec, hop.x, hop.y)) yield [...hop.pieces, pipePiece(spec, names, hop.x, hop.y, outward)];
  }
}

function edgeStarts(grid, x, dir) {
  const starts = [];
  for (let y = grid.area.y; y < grid.area.y + grid.area.h; y++) starts.push({ x, y, a: dir });
  return starts;
}

function nearest(tiles, x, y) {
  let best = Infinity;
  for (const t of tiles) {
    const [tx, ty] = t.split(',').map(Number);
    best = Math.min(best, Math.abs(tx - x) + Math.abs(ty - y));
  }
  return best;
}

// Manhattan distance from every tile of the area to the nearest of `tiles` (two raster passes),
// and the plain scan for points outside the area.
function distanceField(area, tiles) {
  const { x: ax, y: ay, w, h } = area;
  const d = new Float64Array(w * h).fill(Infinity);
  for (const t of tiles) {
    const [tx, ty] = t.split(',').map(Number);
    if (tx >= ax && ty >= ay && tx < ax + w && ty < ay + h) d[(ty - ay) * w + (tx - ax)] = 0;
  }
  // Tiles outside the area still count: seed the border with their distance.
  const outside = [...tiles].filter(t => {
    const [tx, ty] = t.split(',').map(Number);
    return !(tx >= ax && ty >= ay && tx < ax + w && ty < ay + h);
  });
  if (outside.length) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) d[y * w + x] = Math.min(d[y * w + x], nearest(outside, ax + x, ay + y));
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0) d[i] = Math.min(d[i], d[i - w] + 1);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < h - 1) d[i] = Math.min(d[i], d[i + w] + 1);
    }
  }
  return (x, y) => {
    if (x >= ax && y >= ay && x < ax + w && y < ay + h) return d[(y - ay) * w + (x - ax)];
    return nearest(tiles, x, y);
  };
}

function commitLeg(grid, spec, undergroundName, leg, pieces) {
  const tiles = new Set(leg.pieces.map(p => key(p.x, p.y)));
  if (tiles.size !== leg.pieces.length) throw new RoutingError(`route ${spec.id}: path crosses itself`);
  leg.pieces.forEach((p, i) => {
    pieces.push(p);
    grid.place(p);
    if (p.underground === 'input') grid.addTunnel(undergroundName, p, leg.pieces[i + 1]);
  });
}

// hopeless(): a cheap check that the goal cannot be reached at all, asked once a leg has taken
// longer than a direct path would, so a waypoint walled in fails fast instead of spending the
// whole budget.
function search(grid, starts, isGoal, heuristic, moves, hopeless = () => false) {
  const open = new Heap();
  const best = bestCosts(grid.area);
  for (const s of starts) {
    open.push({ ...s, reached: false, g: 0, prev: null, pieces: [] }, heuristic(s.x, s.y));
    best.set(s, 0);
  }
  // A leg that has not found its goal after exploring every tile many times over has none.
  const distance = Math.min(...starts.map(s => heuristic(s.x, s.y)));
  let budget = Math.min(EXPANSIONS_PER_TILE * grid.area.w * grid.area.h, EXPANSIONS_MAX + EXPANSIONS_PER_STEP * distance);
  let check = 200 + 20 * distance;
  while (open.size && budget-- > 0) {
    if (check-- === 0 && hopeless()) return null;
    const node = open.pop();
    if (node.g > best.get(node)) continue;
    if (isGoal(node) && node.prev) {
      // Recent steps are checked as the leg grows; the whole leg once it arrives.
      const leg = unwind(node);
      if (!crossesItself(leg.pieces)) return leg;
      continue;
    }
    for (const next of moves(node)) {
      if (!grid.inBounds(next.x, next.y) && !isGoal(next)) continue;
      if (conflictsWithOwnPath(node, next.pieces, RECENT_STEPS)) continue;
      next.g = node.g + next.cost;
      if (best.get(next) <= next.g) continue;
      next.prev = node;
      best.set(next, next.g);
      open.push(next, next.g + heuristic(next.x, next.y));
    }
  }
  return null;
}

// Whether a belt could reach (wx, wy) from the starts at all: a flood over tiles free for it,
// stepping to a neighbour or tunnelling up to its reach over anything but its own later
// waypoints. It ignores headings and every finer rule, so it only ever says no when no path
// exists. Tiles nearer the goal are flooded first, so a goal it can reach ends it early.
function reachable(grid, id, starts, wx, wy, reach, pending) {
  const { x: ax, y: ay, w, h } = grid.area;
  const seen = new Uint8Array(w * h);
  // A bucket per Manhattan distance to the goal.
  const buckets = [];
  let lowest = Infinity;
  const push = (x, y) => {
    const d = Math.abs(x - wx) + Math.abs(y - wy);
    (buckets[d] ??= []).push(x, y);
    if (d < lowest) lowest = d;
  };
  const visit = (x, y) => {
    if (x < ax || y < ay || x >= ax + w || y >= ay + h) return false;
    const i = (y - ay) * w + (x - ax);
    if (seen[i]) return false;
    seen[i] = 1;
    if (x === wx && y === wy) return true;
    if (!grid.freeFor(x, y, id) || pending.has(key(x, y))) return false;
    push(x, y);
    return false;
  };
  // A leg starts where its next piece goes, whatever holds that tile.
  for (const s of starts) {
    if (s.x === wx && s.y === wy) return true;
    if (s.x >= ax && s.y >= ay && s.x < ax + w && s.y < ay + h) seen[(s.y - ay) * w + (s.x - ax)] = 1;
    push(s.x, s.y);
  }
  while (lowest < buckets.length) {
    const bucket = buckets[lowest];
    if (!bucket?.length) { lowest++; continue; }
    const y = bucket.pop(), x = bucket.pop();
    for (const [dx, dy] of Object.values(VEC)) {
      for (let n = 1; n <= reach && !pending.has(key(x + dx * n, y + dy * n)); n++) if (visit(x + dx * n, y + dy * n)) return true;
    }
  }
  return false;
}

// Whether a pipe could reach the tree from (x, y) at all: a flood over tiles free for it,
// stepping to a neighbour or diving up to its reach under anything. It ignores every finer rule,
// so it only ever says no when no path exists.
function pipeReaches(grid, id, x0, y0, tree, reach) {
  const { x: ax, y: ay, w, h } = grid.area;
  const seen = new Uint8Array(w * h);
  const queue = [x0, y0];
  if (x0 >= ax && y0 >= ay && x0 < ax + w && y0 < ay + h) seen[(y0 - ay) * w + (x0 - ax)] = 1;
  for (let q = 0; q < queue.length; q += 2) {
    const x = queue[q], y = queue[q + 1];
    for (const [dx, dy] of Object.values(VEC)) {
      for (let n = 1; n <= reach; n++) {
        const nx = x + dx * n, ny = y + dy * n;
        if (nx < ax || ny < ay || nx >= ax + w || ny >= ay + h) break;
        const i = (ny - ay) * w + (nx - ax);
        if (seen[i]) continue;
        if (tree.has(key(nx, ny))) return true;
        if (!grid.freeFor(nx, ny, id) || grid.pipeBlocked.has(key(nx, ny))) continue;
        seen[i] = 1;
        queue.push(nx, ny);
      }
    }
  }
  return false;
}

// The cheapest cost found so far to each search state (tile, heading, whether the current
// waypoint was reached), in a typed array reused from search to search: a generation stamp marks
// the entries this search wrote. States off the grid (edge goals) go in a map.
let costs = new Float64Array(0), stamps = new Uint32Array(0), generation = 0;
function bestCosts(area) {
  const size = area.w * area.h * 8;
  if (costs.length < size) {
    costs = new Float64Array(size);
    stamps = new Uint32Array(size);
    generation = 0;
  }
  if (++generation === 0xffffffff) { stamps.fill(0); generation = 1; }
  const outside = new Map();
  const index = s => {
    const x = s.x - area.x, y = s.y - area.y;
    if (x < 0 || y < 0 || x >= area.w || y >= area.h) return -1;
    return ((y * area.w + x) * 4 + (s.a >> 2)) * 2 + (s.reached ? 1 : 0);
  };
  return {
    get(s) {
      const i = index(s);
      if (i < 0) return outside.get(stateKey(s)) ?? Infinity;
      return stamps[i] === generation ? costs[i] : Infinity;
    },
    set(s, g) {
      const i = index(s);
      if (i < 0) { outside.set(stateKey(s), g); return; }
      stamps[i] = generation;
      costs[i] = g;
    },
  };
}

// Search states don't record the path that reached them, so a leg must not reuse its own
// tiles or overlap its own tunnels on the same line.
function conflictsWithOwnPath(node, pieces, steps = Infinity) {
  const tunnel = tunnelSpan(pieces);
  for (let n = node; n.prev && steps-- > 0; n = n.prev) {
    for (const p of n.pieces) for (const q of pieces) if (p.x === q.x && p.y === q.y) return true;
    if (tunnel) {
      if (n.tunnel === undefined) n.tunnel = tunnelSpan(n.pieces);
      if (n.tunnel && spansOverlap(tunnel, n.tunnel)) return true;
    }
  }
  return false;
}

// A whole leg: no tile used twice, no two of its tunnels overlapping on one line.
function crossesItself(pieces) {
  if (new Set(pieces.map(p => key(p.x, p.y))).size !== pieces.length) return true;
  const spans = [];
  pieces.forEach((p, i) => { if (p.underground === 'input') spans.push(span(p, pieces[i + 1])); });
  return spans.some((s, i) => spans.slice(i + 1).some(t => spansOverlap(s, t)));
}

function tunnelSpan(pieces) {
  return pieces.length === 2 && pieces[0].underground ? span(pieces[0], pieces[1]) : null;
}

function unwind(node) {
  const steps = [];
  const state = { x: node.x, y: node.y, a: node.a, reached: node.reached };
  for (let n = node; n.prev; n = n.prev) steps.push(n.pieces);
  return { pieces: steps.reverse().flat(), state };
}

const stateKey = s => `${s.x},${s.y},${s.a}${s.reached ? '!' : ''}`;
const directions = a => [a, turnLeft(a), turnRight(a)];

function step(x, y, d, n = 1) {
  const [dx, dy] = VEC[d];
  return [x + dx * n, y + dy * n];
}

// A tunnel surfaces `hop` tiles ahead, anywhere up to the underground's reach (ADR 0003).
const HOPS = reach => [...Array(reach - 1).keys()].map(i => i + 2);

function tunnelMove(node, hop, pieces) {
  const [nx, ny] = step(node.x, node.y, node.a, hop + 1);
  return { x: nx, y: ny, a: node.a, cost: hop + 1 + TUNNEL_COST, pieces };
}

// target.key: the waypoint the current leg heads for; a tunnel surfacing there reaches it.
// target.from: the waypoint it leaves, which a `straight` belt leaves the way it came.
function beltMoves(grid, spec, names, pending, target) {
  return node => {
    const options = [];
    if (pending.has(key(node.x, node.y))) return options;
    const straightOn = spec.straight && node.prev === null && key(node.x, node.y) === target.from;
    for (const d of straightOn ? [node.a] : directions(node.a)) {
      if (!canBelt(grid, spec, node.x, node.y, d)) continue;
      const [nx, ny] = step(node.x, node.y, d);
      options.push({ x: nx, y: ny, a: d, cost: 1 + (d === node.a ? 0 : TURN_COST), pieces: [beltPiece(spec, names, node.x, node.y, d)] });
    }
    const d = node.a;
    if (!grid.freeFor(node.x, node.y, spec.id) || fedByOther(grid, spec, node.x, node.y)) return options;
    // A tunnel may not pass under a later waypoint of its own route, nor surface on one.
    const [ax, ay] = step(node.x, node.y, d, 1);
    if (pending.has(key(ax, ay))) return options;
    // Where the tile ahead takes a belt, the belt walks on and dives at the obstacle instead.
    if (grid.freeFor(ax, ay, spec.id) && !fedByOther(grid, spec, ax, ay) && key(ax, ay) !== target.key) return options;
    for (const hop of HOPS(names.reach)) {
      const [qx, qy] = step(node.x, node.y, d, hop);
      if (pending.has(key(qx, qy))) break;
      if (!grid.freeFor(qx, qy, spec.id) || !grid.tunnelFits(names.underground, node, { x: qx, y: qy })) continue;
      if (!beltOutputAllowed(grid, spec, ...step(qx, qy, d)) || fedByOther(grid, spec, qx, qy)) continue;
      const base = { name: names.underground, kind: 'underground-belt', route: spec.id, w: 1, h: 1, direction: d, travel: d };
      const move = tunnelMove(node, hop, [
        { ...base, underground: 'input', x: node.x, y: node.y, out: null },
        { ...base, underground: 'output', x: qx, y: qy, out: key(...step(qx, qy, d)) },
      ]);
      // A tunnel surfacing on a waypoint must leave the belt a tile to go on to.
      move.reached = key(qx, qy) === target.key && (target.last || grid.freeFor(...step(qx, qy, d), spec.id));
      options.push(move);
    }
    return options;
  };
}

function pipeMoves(grid, spec, names, pending) {
  return node => {
    const options = [];
    if (canPipe(grid, spec, node.x, node.y)) {
      for (const d of directions(node.a)) {
        const [nx, ny] = step(node.x, node.y, d);
        options.push({ x: nx, y: ny, a: d, cost: 1 + (d === node.a ? 0 : TURN_COST), pieces: [pipePiece(spec, names, node.x, node.y, d)] });
      }
    }
    const d = node.a;
    const endOk = (x, y) => grid.freeFor(x, y, spec.id) && !grid.pipeBlocked.has(key(x, y)) && !pending.has(key(x, y))
      && !grid.surfaceOnly.has(key(x, y));
    if (!endOk(node.x, node.y)) return options;
    // Where the tile ahead takes a pipe, the pipe walks on and dives at the obstacle instead.
    const [ax, ay] = step(node.x, node.y, d, 1);
    if (canPipe(grid, spec, ax, ay) && !pending.has(key(ax, ay)) && !grid.surfaceOnly.has(key(ax, ay))) return options;
    for (const hop of HOPS(names.reach)) {
      // A pipe tunnel may not pass under a tile that must carry a surface pipe: a join or a port.
      const under = key(...step(node.x, node.y, d, hop - 1));
      if (hop > 1 && (grid.surfaceOnly.has(under) || pending.has(under))) break;
      const [qx, qy] = step(node.x, node.y, d, hop);
      if (!endOk(qx, qy) || !grid.tunnelFits(names.underground, node, { x: qx, y: qy })) continue;
      // A pipe-to-ground's direction is its above-ground connection side.
      const base = { name: names.underground, kind: 'pipe-to-ground', route: spec.id, fluid: spec.fluid, w: 1, h: 1, travel: d, out: null };
      options.push(tunnelMove(node, hop, [
        { ...base, underground: 'input', x: node.x, y: node.y, direction: opposite(d) },
        { ...base, underground: 'output', x: qx, y: qy, direction: d },
      ]));
    }
    return options;
  };
}

function beltPiece(spec, names, x, y, d) {
  return { name: names.belt, kind: 'belt', route: spec.id, x, y, w: 1, h: 1, direction: d, travel: d, out: key(...step(x, y, d)) };
}

function pipePiece(spec, names, x, y, d) {
  return { name: names.pipe, kind: 'pipe', route: spec.id, fluid: spec.fluid, x, y, w: 1, h: 1, direction: 0, travel: d, out: null };
}

function canBelt(grid, spec, x, y, d) {
  return grid.freeFor(x, y, spec.id) && beltOutputAllowed(grid, spec, ...step(x, y, d)) && !fedByOther(grid, spec, x, y);
}

// A belt must not push items into another route's belt, or into a tile held for another belt.
function beltOutputAllowed(grid, spec, ox, oy) {
  const target = grid.at(ox, oy);
  if (target && target.route !== spec.id && (target.kind === 'belt' || target.kind === 'underground-belt')) return false;
  const k = key(ox, oy);
  const held = grid.holder(ox, oy);
  return held === undefined || held === spec.id || grid.fluidPorts.has(k);
}

function fedByOther(grid, spec, x, y) {
  const here = key(x, y);
  return Object.values(VEC).some(([nx, ny]) => {
    const n = grid.at(x + nx, y + ny);
    return n?.route !== undefined && n.route !== spec.id && n.out === here;
  });
}

// A pipe connects on all four sides, so no neighbour may belong to another pipe network — even
// one carrying the same fluid (a recipe's input and output of one fluid must stay apart).
function canPipe(grid, spec, x, y) {
  if (!grid.freeFor(x, y, spec.id) || grid.pipeBlocked.has(key(x, y))) return false;
  for (const [d, [dx, dy]] of Object.entries(VEC)) {
    const n = grid.at(x + dx, y + dy);
    if (n?.kind === 'pipe' && n.route !== spec.id) return false;
    if (n?.kind === 'pipe-to-ground' && n.route !== spec.id && n.direction === opposite(+d)) return false;
    const k = key(x + dx, y + dy);
    if (grid.fluidPorts.has(k) && grid.holder(x + dx, y + dy) !== spec.id) return false;
  }
  return true;
}

export class Heap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(value, priority) {
    const items = this.items;
    items.push({ value, priority });
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (items[p].priority <= items[i].priority) break;
      [items[p], items[i]] = [items[i], items[p]];
      i = p;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < items.length && items[l].priority < items[m].priority) m = l;
        if (r < items.length && items[r].priority < items[m].priority) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top.value;
  }
}
