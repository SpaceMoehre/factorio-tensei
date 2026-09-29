import { VEC, E, W, turnLeft, turnRight, opposite, key, span, spansOverlap } from './grid.js';

const TURN_COST = 0.2;
const TUNNEL_COST = 2;

export class RoutingError extends Error {}

// Routes a belt through its waypoints (a chain), committing each leg to the grid as it goes.
// spec: { id, kind: 'belt', start: { tiles, dir }, waypoints, end: 'dead' | 'east' }
// names: { belt, underground, reach }
export function routeBelt(grid, spec, names) {
  const pieces = [];
  const commit = leg => commitLeg(grid, spec, names.underground, leg, pieces);
  let starts = spec.start.tiles.map(([x, y]) => ({ x, y, a: spec.start.dir }));
  const pending = new Set(spec.waypoints.map(([x, y]) => key(x, y)));
  const moves = beltMoves(grid, spec, names, pending);
  // A leg never crosses a later waypoint of its own route. The piece on a waypoint tile is a
  // belt or a tunnel entrance: an inserter can reach either.
  for (const [wx, wy] of spec.waypoints) {
    pending.delete(key(wx, wy));
    const isGoal = s => s.x === wx && s.y === wy;
    const leg = search(grid, starts, isGoal, (x, y) => Math.abs(x - wx) + Math.abs(y - wy), moves);
    if (!leg) throw new RoutingError(`belt ${spec.id}: no path to waypoint ${wx},${wy}`);
    commit(leg);
    starts = [leg.state];
  }
  if (spec.end === 'east') {
    const lastX = grid.area.x + grid.area.w - 1;
    const leg = search(grid, starts, s => s.x === lastX + 1 && s.a === E, x => lastX + 1 - x, moves);
    if (!leg) throw new RoutingError(`belt ${spec.id}: no path to the east edge`);
    commit(leg);
  } else {
    const [s] = starts;
    if (!canBelt(grid, spec, s.x, s.y, s.a)) throw new RoutingError(`belt ${spec.id}: cannot end at ${s.x},${s.y}`);
    commit({ pieces: [beltPiece(spec, names, s.x, s.y, s.a)] });
  }
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
  const commit = leg => {
    commitLeg(grid, spec, names.underground, leg, pieces);
    for (const p of leg.pieces) if (p.kind === 'pipe') tree.add(key(p.x, p.y));
  };
  const [[x0, y0], ...rest] = spec.terminals;
  const pending = new Set(rest.map(([x, y]) => key(x, y)));
  const moves = pipeMoves(grid, spec, names, pending);
  const toTree = { isGoal: s => tree.has(key(s.x, s.y)), heuristic: (x, y) => nearest(tree, x, y) };
  commit({ pieces: seedPieces });
  if (spec.source) {
    const leg = search(grid, edgeStarts(grid, grid.area.x, E), toTree.isGoal, toTree.heuristic, moves);
    if (!leg) throw new RoutingError(`${spec.fluid}: no path from the west edge`);
    commit(leg);
  }
  for (const [x, y, outward] of rest) {
    pending.delete(key(x, y));
    if (tree.has(key(x, y))) continue;
    const leg = search(grid, [{ x, y, a: outward }], toTree.isGoal, toTree.heuristic, moves);
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

function commitLeg(grid, spec, undergroundName, leg, pieces) {
  const tiles = new Set(leg.pieces.map(p => key(p.x, p.y)));
  if (tiles.size !== leg.pieces.length) throw new RoutingError(`route ${spec.id}: path crosses itself`);
  leg.pieces.forEach((p, i) => {
    pieces.push(p);
    grid.place(p);
    if (p.underground === 'input') grid.addTunnel(undergroundName, p, leg.pieces[i + 1]);
  });
}

function search(grid, starts, isGoal, heuristic, moves) {
  const open = new Heap();
  const best = new Map();
  for (const s of starts) {
    open.push({ ...s, g: 0, prev: null, pieces: [] }, heuristic(s.x, s.y));
    best.set(stateKey(s), 0);
  }
  while (open.size) {
    const node = open.pop();
    if (node.g > best.get(stateKey(node))) continue;
    if (isGoal(node) && node.prev) return unwind(node);
    for (const next of moves(node)) {
      if (!grid.inBounds(next.x, next.y) && !isGoal(next)) continue;
      if (conflictsWithOwnPath(node, next.pieces)) continue;
      next.g = node.g + next.cost;
      next.prev = node;
      const k = stateKey(next);
      if (best.has(k) && best.get(k) <= next.g) continue;
      best.set(k, next.g);
      open.push(next, next.g + heuristic(next.x, next.y));
    }
  }
  return null;
}

// Search states don't record the path that reached them, so a leg must not reuse its own
// tiles or overlap its own tunnels on the same line.
function conflictsWithOwnPath(node, pieces) {
  const tiles = new Set(pieces.map(p => key(p.x, p.y)));
  const tunnel = tunnelSpan(pieces);
  for (let n = node; n.prev; n = n.prev) {
    if (n.pieces.some(p => tiles.has(key(p.x, p.y)))) return true;
    const earlier = tunnelSpan(n.pieces);
    if (tunnel && earlier && spansOverlap(tunnel, earlier)) return true;
  }
  return false;
}

function tunnelSpan(pieces) {
  return pieces.length === 2 && pieces[0].underground ? span(pieces[0], pieces[1]) : null;
}

function unwind(node) {
  const pieces = [];
  const state = { x: node.x, y: node.y, a: node.a };
  for (let n = node; n.prev; n = n.prev) pieces.unshift(...n.pieces);
  return { pieces, state };
}

const stateKey = s => `${s.x},${s.y},${s.a}`;
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

function beltMoves(grid, spec, names, pending) {
  return node => {
    const options = [];
    if (pending.has(key(node.x, node.y))) return options;
    for (const d of directions(node.a)) {
      if (!canBelt(grid, spec, node.x, node.y, d)) continue;
      const [nx, ny] = step(node.x, node.y, d);
      options.push({ x: nx, y: ny, a: d, cost: 1 + (d === node.a ? 0 : TURN_COST), pieces: [beltPiece(spec, names, node.x, node.y, d)] });
    }
    const d = node.a;
    if (!grid.freeFor(node.x, node.y, spec.id) || fedByOther(grid, spec, node.x, node.y)) return options;
    for (const hop of HOPS(names.reach)) {
      const [qx, qy] = step(node.x, node.y, d, hop);
      if (pending.has(key(qx, qy)) || [...Array(hop).keys()].some(i => i > 0 && pending.has(key(...step(node.x, node.y, d, i))))) break;
      if (!grid.freeFor(qx, qy, spec.id) || !grid.tunnelFits(names.underground, node, { x: qx, y: qy })) continue;
      if (!beltOutputAllowed(grid, spec, ...step(qx, qy, d)) || fedByOther(grid, spec, qx, qy)) continue;
      const base = { name: names.underground, kind: 'underground-belt', route: spec.id, w: 1, h: 1, direction: d, travel: d };
      options.push(tunnelMove(node, hop, [
        { ...base, underground: 'input', x: node.x, y: node.y, out: null },
        { ...base, underground: 'output', x: qx, y: qy, out: key(...step(qx, qy, d)) },
      ]));
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
    const endOk = (x, y) => grid.freeFor(x, y, spec.id) && !grid.pipeBlocked.has(key(x, y)) && !pending.has(key(x, y));
    if (!endOk(node.x, node.y)) return options;
    for (const hop of HOPS(names.reach)) {
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
  const held = grid.reserved.get(k);
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
    if (grid.fluidPorts.has(k) && grid.reserved.get(k) !== spec.id) return false;
  }
  return true;
}

class Heap {
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
