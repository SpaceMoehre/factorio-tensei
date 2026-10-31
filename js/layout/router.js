import { VEC, N, E, S, W, turnLeft, turnRight, opposite, key, span, spansOverlap, TileSet } from './grid.js';

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
// How many states a pipe tree explores looking for a pipe of its network to join.
const JOIN_STATES = 4000;

// What a leg of pieces costs, as the router counts it: a tile each, a turn (from `heading`, then
// each piece's travel) TURN_COST more (or `turn`), a tunnel its length and TUNNEL_COST (an
// underground's input followed by its output).
export function legCost(pieces, heading, turn = TURN_COST) {
  let c = 0;
  pieces.forEach((p, i) => {
    const q = pieces[i + 1];
    if (p.underground === 'input' && q) c += Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + 1 + TUNNEL_COST;
    else if (p.underground !== 'output') c += 1 + (p.travel === heading ? 0 : turn);
    heading = p.travel;
  });
  return c;
}

export class RoutingError extends Error {
  /** @type {number[] | undefined} the Sub-Blocks a link that found no room runs between */
  steps;
  /** @type {boolean | undefined} whether the layout had Fan-outs (the caller may route it again) */
  fans;
  /** @type {boolean | undefined} whether any ran across Sub-Blocks */
  across;
  /** @type {number | undefined} a route a Fan-out from producers found no way for (chain it) */
  chain;
  /** @type {object | undefined} the routing task that failed, though another routed it ahead of its turn */
  task;
  /** @type {number | undefined} the Sub-Block Placement found no room for */
  unplaced;
  /** @type {boolean | undefined} a pair of belts found no room for the splitter evening them, and starves without */
  unbalanced;
  /** @type {boolean | undefined} Layers found no columns the Sub-Blocks fit */
  noColumns;
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
  const pending = new TileSet(grid.area);
  for (const [x, y] of spec.waypoints) pending.add(key(x, y));
  // from: the waypoint a leg leaves, its piece not yet laid (the leg's first move lays it).
  // (x, y: the key's tile, for the moves to compare without making keys.)
  const target = { key: null, last: false, from: null, x: 0, y: 0 };
  const moves = beltMoves(grid, spec, names, pending, target);
  // A leg never crosses a later waypoint of its own route. The piece on a waypoint tile is a
  // belt, a tunnel entrance or a tunnel exit: an inserter can reach any of them.
  let surfaced = false;
  for (const [i, [wx, wy]] of spec.waypoints.entries()) {
    target.key = key(wx, wy);
    target.x = wx;
    target.y = wy;
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
  const free = (u, v) => grid.freeFor(u, v, spec.id) && !among(pending, u, v);
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

// Leaving the area across its east (or west) edge: the goal and the distance to it. 'east' is the
// Output Side (ADR 0069): the north or south edge where the user chose it.
function edgeGoal(grid, side) {
  const { x: ax, y: ay, w, h } = grid.area;
  if (side === 'east' && grid.out === N) return [s => s.y === ay - 1 && s.a === N, (x, y) => y - (ay - 1)];
  if (side === 'east' && grid.out === S) return [s => s.y === ay + h && s.a === S, (x, y) => ay + h - y];
  if (side === 'east') {
    const lastX = ax + w - 1;
    return [s => s.x === lastX + 1 && s.a === E, x => lastX + 1 - x];
  }
  const firstX = grid.area.x;
  return [s => s.x === firstX - 1 && s.a === W, x => x - (firstX - 1)];
}

// A belt in one leg from any of the start states to the goal: a tile reached with a heading
// (where the next piece, already placed, carries on), or off the east or west edge. Joins the
// routed pieces of two modules, or a module and the train.
// spec: { id, starts: [{ x, y, a }], goal: { x, y, a } | 'east' | 'west' | 'join', keepOff (tile keys held
// for its route's other links, where they meet their copies: it does not take them), most (the
// most states it explores: a leg that may be tried elsewhere gives up sooner), joins (with an
// edge goal: `x,y,a` keys of another belt's tiles it may end against instead, heading a into
// its side: side-loading onto it), turn (what a turn costs: TURN_COST by default) }
// Returns the leg's pieces; `joined`, set on them, the join key it ended at.
export function routeLink(grid, spec, names) {
  const pieces = [];
  const keepOff = spec.keepOff ?? new Set();
  const moves = beltMoves(grid, spec, names, keepOff, { key: null, last: false, x: 0, y: 0 });
  const { goal } = spec;
  const joins = spec.joins ?? null;
  const joining = s => !!joins?.has(`${s.x},${s.y},${s.a}`);
  // ('join': only joining another belt, the nearest of them first.)
  const targets = goal === 'join' ? [...joins ?? []].map(k => k.split(',').map(Number)) : [];
  const [atEdge, toEdge] = goal === 'join' ? [() => false, (x, y) => GREED * Math.min(...targets.map(([u, v]) => Math.abs(x - u) + Math.abs(y - v)))]
    : typeof goal === 'string' ? edgeGoal(grid, goal) : [null, null];
  const [isGoal, heuristic] = typeof goal === 'string' ? [s => atEdge(s) || joining(s), toEdge]
    : [s => s.x === goal.x && s.y === goal.y && s.a === goal.a, (x, y) => GREED * (Math.abs(x - goal.x) + Math.abs(y - goal.y))];
  if (spec.starts.some(s => isGoal(s))) return pieces;
  const leg = search(grid, spec.starts, isGoal, heuristic, moves,
    typeof goal === 'string' ? undefined : () => !reachable(grid, spec.id, spec.starts, goal.x, goal.y, names.reach, keepOff), spec.most);
  if (!leg) throw new RoutingError(`belt ${spec.id}: no path from ${spec.starts[0].x},${spec.starts[0].y} to ${typeof goal === 'string' ? `the ${goal} edge` : `${goal.x},${goal.y}`}`);
  commitLeg(grid, spec, names.underground, leg, pieces);
  if (joining(leg.state)) /** @type {any} */ (pieces).joined = `${leg.state.x},${leg.state.y},${leg.state.a}`;
  return pieces;
}

// Routes a fluid as a pipe tree joining every terminal (a machine fluid connection), plus the
// west edge for Side Input and the east edge for Side Output.
// spec: { id, fluid, terminals: [[x, y, outwardDir]], source: boolean, sink: boolean, draws?, joins?,
//         mustJoin? (a Supplied Item's: only a tree joining one of the `joins` routes) }
// draws (an Annex's Side Input drawn from a pipe built before it, ADR 0032): { routes (the built
// pipes' routes its pipes may join), starts (the tiles beside them, heading away), only (never
// from the west edge) }.
// joins (pipes of its network, carrying the same fluid, routed before it): { routes (theirs: its
// pipes may join them), starts (the tiles beside them, heading away) }. Its tree joins them where
// it finds a way within a short search; a sink's, joined, does not go on to the east edge (theirs
// reaches it).
// names: { pipe, underground, reach }
// valve (ADR 0062): a pipe through a valve onto pipes routed before it, { name, mode ('top-up':
// into them, 'overflow': out of them), input, output (the valve's sides facing north, catalog
// valves), pipes (theirs) }: its tree reaches a valve standing beside one of them, from the west
// edge (source), towards the east edge (sink) or a void, or from its machines.
// void (ADR 0062): the building destroying the fluid the tree takes to it instead of the east
// edge (a catalog building: Py's sinkhole, gas vent).
export function routePipe(grid, spec, names) {
  if (!spec.terminals.length) return routeLoose(grid, spec, names);
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
  // (The tree's tiles as coordinates too, x then y, for the distance to it; and those inside the
  // area by tile, for the search's goal: no key made a state.)
  const tiles = [];
  const inTree = new Uint8Array(grid.area.w * grid.area.h);
  const [[x0, y0], ...rest] = spec.terminals;
  const pending = new TileSet(grid.area);
  for (const [x, y] of rest) pending.add(key(x, y));
  const moves = pipeMoves(grid, spec, names, pending);
  // The distance to the tree, brought up to date once per leg as the tree grows (`upTo`: the
  // tiles it holds).
  let field = null, fresh = false, upTo = 0;
  const toTree = {
    isGoal: s => {
      const i = grid.index(s.x, s.y);
      return i >= 0 ? inTree[i] === 1 : tree.has(key(s.x, s.y));
    },
    heuristic: (x, y) => {
      if (!fresh) {
        field = distanceField(grid.area, tiles, field, upTo);
        upTo = tiles.length;
        fresh = true;
      }
      return field(x, y);
    },
  };
  const commit = leg => {
    commitLeg(grid, spec, names.underground, leg, pieces);
    for (const p of leg.pieces) {
      if (p.kind !== 'pipe') continue;
      tree.add(key(p.x, p.y));
      tiles.push(p.x, p.y);
      const i = grid.index(p.x, p.y);
      if (i >= 0) inTree[i] = 1;
    }
    fresh = false;
  };
  commit({ pieces: seedPieces });
  // (A Supplied Item's, from further away.)
  const joined = spec.joins?.starts.length ? search(grid, spec.joins.starts, toTree.isGoal, toTree.heuristic, moves, undefined, spec.mustJoin ? 20 * JOIN_STATES : JOIN_STATES) : null;
  if (spec.mustJoin && !joined) throw new RoutingError(`${spec.fluid}: no way to join its network`);
  if (joined) commit(joined);
  if (spec.source) {
    const starts = spec.draws ? [...spec.draws.starts, ...(spec.draws.only ? [] : edgeStarts(grid, grid.area.x, E))] : edgeStarts(grid, grid.area.x, E);
    const leg = search(grid, starts, toTree.isGoal, toTree.heuristic, moves);
    if (!leg) throw new RoutingError(`${spec.fluid}: no path from ${spec.draws?.only ? 'the pipe it draws from' : 'the west edge'}`);
    commit(leg);
  }
  for (const [x, y, outward] of rest) {
    pending.delete(key(x, y));
    if (tree.has(key(x, y))) continue;
    const leg = search(grid, [{ x, y, a: outward }], toTree.isGoal, toTree.heuristic, moves,
      () => !pipeReaches(grid, spec.id, x, y, inTree, names.reach));
    if (!leg) throw new RoutingError(`${spec.fluid}: cannot connect ${x},${y}`);
    commit(leg);
  }
  if (spec.valve) {
    const spots = valveSpots(grid, spec);
    const leg = legOff(grid, spots.map(sp => ({ x: sp.b.x, y: sp.b.y, a: sp.d, sp })), toTree.isGoal, toTree.heuristic, moves, sp => [sp.piece]);
    if (!leg) throw new RoutingError(`${spec.fluid}: no room for its valve`);
    commit(leg);
  }
  if (spec.sink && !joined) {
    const voids = spec.void ? voidStarts(grid, spec) : null;
    const leg = voids ? legOff(grid, voids, toTree.isGoal, toTree.heuristic, moves, sp => [sp.piece])
      : search(grid, outStarts(grid), toTree.isGoal, toTree.heuristic, moves);
    if (!leg) throw new RoutingError(`${spec.fluid}: no path to ${voids ? `a ${spec.void.name}` : 'the train'}`);
    commit(leg);
  }
  return pieces;
}

// A leg from one of `starts` (each with what stands at it, `sp`: a valve or void beside it) to
// the goal, `extra(sp)` the entities its start brings: none of them where the leg runs (else that
// start is left out, a few times).
function legOff(grid, starts, isGoal, heuristic, moves, extra) {
  let left = starts;
  for (let tries = 0; tries < 6 && left.length; tries++) {
    const leg = search(grid, left, isGoal, heuristic, moves);
    if (!leg) return null;
    const tiles = new Set(leg.pieces.map(p => key(p.x, p.y)));
    const first = leg.pieces[0];
    const from = left.filter(st => st.x === first.x && st.y === first.y);
    const fits = from.find(st => extra(st.sp).every(e => !coversAny(e, tiles)));
    if (fits) return { ...leg, pieces: [...leg.pieces, ...extra(fits.sp)] };
    left = left.filter(st => !from.includes(st));
  }
  return null;
}

const coversAny = (e, tiles) => {
  for (let dx = 0; dx < e.w; dx++) for (let dy = 0; dy < e.h; dy++) if (tiles.has(key(e.x + dx, e.y + dy))) return true;
  return false;
};

// A valve route with no machines of its own (ADR 0062): from the west edge through its valve into
// the pipes it tops up, or from the pipes it lets the spare off of through its valve, to the east
// edge or a void.
function routeLoose(grid, spec, names) {
  if (!spec.valve) throw new RoutingError(`${spec.fluid}: no stub to join`);
  const pieces = [];
  const moves = pipeMoves(grid, spec, names, new TileSet(grid.area));
  const spots = valveSpots(grid, spec);
  if (!spots.length) throw new RoutingError(`${spec.fluid}: no room for its valve`);
  const at = new Map(spots.map(sp => [`${sp.v.x},${sp.v.y},${opposite(sp.d)}`, sp]));
  const field = distanceField(grid.area, spots.flatMap(sp => [sp.v.x, sp.v.y]));
  const isGoal = st => at.has(`${st.x},${st.y},${st.a}`);
  /** @type {any[]} */
  const starts = spec.source ? edgeStarts(grid, grid.area.x, E) : spec.void ? voidStarts(grid, spec) : outStarts(grid);
  // (Neither its valve nor a void on the leg.)
  let left = starts;
  for (let tries = 0; tries < 6; tries++) {
    const leg = search(grid, left, isGoal, field, moves);
    if (!leg) break;
    const tiles = new Set(leg.pieces.map(p => key(p.x, p.y)));
    const sp = at.get(`${leg.state.x},${leg.state.y},${leg.state.a}`);
    const first = leg.pieces[0];
    const from = left.filter(st => st.x === first.x && st.y === first.y);
    const end = spec.void ? from.find(st => !coversAny(st.sp.piece, tiles) && !coversAny(st.sp.piece, new Set([key(sp.v.x, sp.v.y)]))) : from[0];
    if (!end || tiles.has(key(sp.v.x, sp.v.y))) {
      left = left.filter(st => !from.includes(st));
      continue;
    }
    commitLeg(grid, spec, names.underground, { pieces: [...leg.pieces, sp.piece, ...(end.sp ? [end.sp.piece] : [])] }, pieces);
    return pieces;
  }
  throw new RoutingError(`${spec.fluid}: no path ${spec.source ? 'from the west edge to its valve' : `from its valve to ${spec.void ? `a ${spec.void.name}` : 'the east edge'}`}`);
}

// Where a valve may stand (ADR 0062): a free tile beside a pipe of those it meets, the tile beyond
// it on the same line free for one of this route's: the valve facing so that its output (top-up)
// or input (overflow) meets that pipe. Each { v (the valve's tile), b (the pipe's beyond it), d
// (from v to b), piece }.
function valveSpots(grid, spec) {
  const { name, mode, input, output, pipes } = spec.valve;
  const out = [];
  for (const p of pipes) {
    if (p.kind !== 'pipe') continue;
    for (const d of [N, E, S, W]) {
      const [dx, dy] = VEC[d];
      const v = { x: p.x + dx, y: p.y + dy }, b = { x: v.x + dx, y: v.y + dy };
      if (!grid.inBounds(v.x, v.y) || !grid.freeFor(v.x, v.y, spec.id) || grid.pipeBlocked.has(key(v.x, v.y)) || grid.fluidPorts.has(key(v.x, v.y))) continue;
      if (!grid.inBounds(b.x, b.y) || !canPipe(grid, spec, b.x, b.y)) continue;
      const direction = (opposite(d) - (mode === 'top-up' ? output : input) + 16) % 16;
      // (flow: the way the fluid goes through it.)
      out.push({ v, b, d, piece: { name, kind: 'valve', route: spec.id, fluid: spec.fluid, x: v.x, y: v.y, w: 1, h: 1, direction, mode, flow: (output + direction) % 16 } });
    }
  }
  return out;
}

// Where the tree may end at a void (ADR 0062): every spot its building fits, turned each way, the
// tile its connection meets free for a pipe: that tile, heading away from it (`sp.piece`: the void).
function voidStarts(grid, spec) {
  const building = spec.void;
  const [c] = building.fluidBoxes[0].connections;
  const out = [];
  for (const turn of [N, E, S, W]) {
    const across = turn === E || turn === W;
    const w = across ? building.size.h : building.size.w, h = across ? building.size.w : building.size.h;
    let [rx, ry] = [c.x, c.y];
    for (let k = 0; k < turn / 4; k++) [rx, ry] = [-ry, rx];
    const dir = (c.direction + turn) % 16;
    const { x: ax, y: ay, w: aw, h: ah } = grid.area;
    for (let y = ay; y + h <= ay + ah; y++) {
      for (let x = ax; x + w <= ax + aw; x++) {
        let free = true;
        for (let dx = 0; dx < w && free; dx++) for (let dy = 0; dy < h && free; dy++) {
          free = grid.freeFor(x + dx, y + dy, spec.id) && !grid.pipeBlocked.has(key(x + dx, y + dy)) && !grid.fluidPorts.has(key(x + dx, y + dy));
        }
        if (!free) continue;
        const qx = Math.floor(x + w / 2 + rx + VEC[dir][0]), qy = Math.floor(y + h / 2 + ry + VEC[dir][1]);
        if (!grid.inBounds(qx, qy) || !canPipe(grid, spec, qx, qy)) continue;
        out.push({ x: qx, y: qy, a: dir, sp: { piece: { name: building.name, kind: 'void', route: spec.id, fluid: spec.fluid, x, y, w, h, direction: turn } } });
      }
    }
  }
  return out;
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
  const moves = pipeMoves(grid, spec, names, new TileSet(grid.area));
  for (const hop of moves({ x, y, a: outward })) {
    if (hop.lays === LAYS_TUNNEL && canPipe(grid, spec, hop.x, hop.y)) yield [...moves.lay(hop), pipePiece(spec, names, hop.x, hop.y, outward)];
  }
}

function edgeStarts(grid, x, dir) {
  const starts = [];
  for (let y = grid.area.y; y < grid.area.y + grid.area.h; y++) starts.push({ x, y, a: dir });
  return starts;
}

// A pipe to the train searched for from the Output Side inward (ADR 0069).
function outStarts(grid) {
  const { x: ax, y: ay, w, h } = grid.area;
  if (grid.out === E) return edgeStarts(grid, ax + w - 1, W);
  const y = grid.out === N ? ay : ay + h - 1, a = grid.out === N ? S : N;
  return [...Array(w).keys()].map(k => ({ x: ax + k, y, a }));
}

// (tiles: x, y, x, y, …)
function nearest(tiles, x, y) {
  let best = Infinity;
  for (let k = 0; k < tiles.length; k += 2) best = Math.min(best, Math.abs(tiles[k] - x) + Math.abs(tiles[k + 1] - y));
  return best;
}

// Manhattan distance from every tile of the area to the nearest of `tiles` (x, y, x, y, …; two
// raster passes), and the plain scan for points outside the area. With the field `before`, of
// the first `upTo` of them, where those added since all lie in the area: that field grown, the
// tiles nearer them than before flooded outward from them (the rest stay as they were), the
// same distances.
function distanceField(area, tiles, before = null, upTo = 0) {
  const { x: ax, y: ay, w, h } = area;
  let inside = before !== null;
  for (let k = upTo; k < tiles.length && inside; k += 2) inside = tiles[k] >= ax && tiles[k + 1] >= ay && tiles[k] < ax + w && tiles[k + 1] < ay + h;
  if (inside) return grownField(area, tiles, before, upTo);
  const d = new Float64Array(w * h).fill(Infinity);
  // Tiles outside the area still count: seed the border with their distance.
  const outside = [];
  for (let k = 0; k < tiles.length; k += 2) {
    const tx = tiles[k], ty = tiles[k + 1];
    if (tx >= ax && ty >= ay && tx < ax + w && ty < ay + h) d[(ty - ay) * w + (tx - ax)] = 0;
    else outside.push(tx, ty);
  }
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
  return fieldOf(area, tiles, d);
}

// (d: the distances by tile; kept on the field for growing it.)
function fieldOf(area, tiles, d) {
  const { x: ax, y: ay, w, h } = area;
  return Object.assign((x, y) => {
    if (x >= ax && y >= ay && x < ax + w && y < ay + h) return d[(y - ay) * w + (x - ax)];
    return nearest(tiles, x, y);
  }, { d });
}

// A field grown by tiles in the area (those from `upTo`): a flood from them, a step a ring, through
// the tiles it brings nearer (each tile it brings nearer lies on a shortest way from one of them
// through tiles it brings nearer still).
let flood = new Int32Array(0);
function grownField(area, tiles, before, upTo) {
  const { x: ax, y: ay, w, h } = area;
  const { d } = before;
  if (flood.length < w * h) flood = new Int32Array(w * h);
  let tail = 0;
  for (let k = upTo; k < tiles.length; k += 2) {
    const i = (tiles[k + 1] - ay) * w + (tiles[k] - ax);
    if (d[i] > 0) {
      d[i] = 0;
      flood[tail++] = i;
    }
  }
  for (let head = 0; head < tail; head++) {
    const i = flood[head], v = d[i] + 1, x = i % w;
    if (x > 0 && v < d[i - 1]) { d[i - 1] = v; flood[tail++] = i - 1; }
    if (x < w - 1 && v < d[i + 1]) { d[i + 1] = v; flood[tail++] = i + 1; }
    if (i >= w && v < d[i - w]) { d[i - w] = v; flood[tail++] = i - w; }
    if (i + w < w * h && v < d[i + w]) { d[i + w] = v; flood[tail++] = i + w; }
  }
  return fieldOf(area, tiles, d);
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
function search(grid, starts, isGoal, heuristic, moves, hopeless = () => false, most = Infinity) {
  const open = new Heap();
  const best = bestCosts(grid.area);
  for (const s of starts) {
    // (A state is its tile and heading: whatever else a start carries, no search reads.)
    open.push(state(s.x, s.y, s.a, false, 0, LAYS_NONE, 0, 0, null), heuristic(s.x, s.y));
    best.set(s, 0);
  }
  // A leg that has not found its goal after exploring every tile many times over has none (nor
  // after `most`: a leg that may be tried elsewhere).
  const distance = Math.min(...starts.map(s => heuristic(s.x, s.y)));
  let budget = Math.min(EXPANSIONS_PER_TILE * grid.area.w * grid.area.h, EXPANSIONS_MAX + EXPANSIONS_PER_STEP * distance, most);
  let check = 200 + 20 * distance;
  while (open.size && budget-- > 0) {
    if (check-- === 0 && hopeless()) return null;
    const node = open.pop();
    if (node.g > best.get(node)) continue;
    if (node.prev !== null && isGoal(node)) {
      // Recent steps are checked as the leg grows; the whole leg once it arrives.
      const leg = unwind(node, moves.lay);
      if (!crossesItself(leg.pieces)) return leg;
      continue;
    }
    for (const next of moves(node)) {
      if (!grid.inBounds(next.x, next.y) && !isGoal(next)) continue;
      // (No dearer than one found before, then clear of its own path: both only pass a move
      // over, the cheaper asked first.)
      next.g = node.g + next.cost;
      if (best.get(next) <= next.g) continue;
      if (conflictsWithOwnPath(node, next, RECENT_STEPS)) continue;
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
    if (!grid.freeFor(x, y, id) || among(pending, x, y)) return false;
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
    for (const [dx, dy] of SIDES) {
      for (let n = 1; n <= reach && !among(pending, x + dx * n, y + dy * n); n++) if (visit(x + dx * n, y + dy * n)) return true;
    }
  }
  return false;
}

// Whether a pipe could reach the tree from (x, y) at all: a flood over tiles free for it,
// stepping to a neighbour or diving up to its reach under anything. It ignores every finer rule,
// so it only ever says no when no path exists. (inTree: the tree's tiles in the area, by index.)
function pipeReaches(grid, id, x0, y0, inTree, reach) {
  const { x: ax, y: ay, w, h } = grid.area;
  const seen = new Uint8Array(w * h);
  const queue = [x0, y0];
  if (x0 >= ax && y0 >= ay && x0 < ax + w && y0 < ay + h) seen[(y0 - ay) * w + (x0 - ax)] = 1;
  for (let q = 0; q < queue.length; q += 2) {
    const x = queue[q], y = queue[q + 1];
    for (const [dx, dy] of SIDES) {
      for (let n = 1; n <= reach; n++) {
        const nx = x + dx * n, ny = y + dy * n;
        if (nx < ax || ny < ay || nx >= ax + w || ny >= ay + h) break;
        const i = (ny - ay) * w + (nx - ax);
        if (seen[i]) continue;
        if (inTree[i] === 1) return true;
        if (!grid.freeFor(nx, ny, id) || grid.pipeBlocked.hasAt(nx, ny)) continue;
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

// What a search state's move lays: nothing (a start), a piece on the tile it moved from (px, py),
// or a tunnel: its entrance there, its exit on qx, qy, the tile before the state's.
const LAYS_NONE = 0, LAYS_PIECE = 1, LAYS_TUNNEL = 2;
// (No tile's coordinate: qx of a move that lays no tunnel.)
const NOWHERE = -0x40000000;

// A search state: its tile and heading, whether it reached the waypoint, what the move to it cost
// and lays (`lays`, px, py, qx, qy; `tunnel`, the tunnel's span, else null), its cost so far and
// the state before. Its pieces are made only for the leg found (the moves' `lay`): every state
// of one shape, the search's loads monomorphic, no pieces made for states the search drops.
function state(x, y, a, reached, cost, lays, px, py, tunnel, qx = NOWHERE, qy = NOWHERE) {
  return { x, y, a, reached, cost, g: 0, prev: null, lays, px, py, qx, qy, tunnel };
}

// Search states don't record the path that reached them, so a leg must not reuse its own
// tiles or overlap its own tunnels on the same line. (A move lays a piece on the tile it leaves,
// and a tunnel its exit too.)
function conflictsWithOwnPath(node, next, steps) {
  const { px, py, qx, qy, tunnel } = next;
  for (let n = node; n.prev !== null && steps-- > 0; n = n.prev) {
    if ((n.px === px && n.py === py) || (n.px === qx && n.py === qy)) return true;
    if (n.lays === LAYS_TUNNEL && ((n.qx === px && n.qy === py) || (n.qx === qx && n.qy === qy))) return true;
    if (tunnel !== null && n.tunnel !== null && spansOverlap(tunnel, n.tunnel)) return true;
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

// The leg to a state: each move's pieces, made now (`lay`), first to last.
function unwind(node, lay) {
  const steps = [];
  const state = { x: node.x, y: node.y, a: node.a, reached: node.reached };
  for (let n = node; n.prev; n = n.prev) steps.push(n);
  const pieces = [];
  for (let k = steps.length - 1; k >= 0; k--) pieces.push(...lay(steps[k]));
  return { pieces, state };
}

const STRAIGHT = [...Array(16).keys()].map(a => [a]);
const stateKey = s => `${s.x},${s.y},${s.a}${s.reached ? '!' : ''}`;
// (Kept by heading: every step of every search asks.)
const TURNS = [...Array(16).keys()].map(a => [a, turnLeft(a), turnRight(a)]);
const directions = a => TURNS[a];

function step(x, y, d, n = 1) {
  const [dx, dy] = VEC[d];
  return [x + dx * n, y + dy * n];
}

// A heading's step as two lists of numbers by heading (the moves step without making arrays).
const DX = [...Array(16).keys()].map(d => VEC[d]?.[0] ?? 0), DY = [...Array(16).keys()].map(d => VEC[d]?.[1] ?? 0);

// A tunnel surfaces `hop` tiles ahead, anywhere up to the underground's reach (ADR 0003).
// (Kept by reach: every step of every search asks.)
const hops = new Map();
const HOPS = reach => {
  if (!hops.has(reach)) hops.set(reach, [...Array(reach - 1).keys()].map(i => i + 2));
  return hops.get(reach);
};

// (s: the tunnel's span, from the node to where it surfaces, qx, qy.)
function tunnelMove(node, hop, qx, qy, s, reached = false) {
  const nx = node.x + DX[node.a] * (hop + 1), ny = node.y + DY[node.a] * (hop + 1);
  return state(nx, ny, node.a, reached, hop + 1 + TUNNEL_COST, LAYS_TUNNEL, node.x, node.y, s, qx, qy);
}

// target.key: the waypoint the current leg heads for; a tunnel surfacing there reaches it.
// target.from: the waypoint it leaves, which a `straight` belt leaves the way it came.
// (The moves of a state, and `lay`: the pieces a move lays.)
function beltMoves(grid, spec, names, pending, target) {
  const lay = n => {
    if (n.lays === LAYS_PIECE) return [beltPiece(spec, names, n.px, n.py, n.a)];
    // (Written out, not spread from one base.)
    const name = names.underground, route = spec.id, d = n.a;
    return [
      { name, kind: 'underground-belt', route, w: 1, h: 1, direction: d, travel: d, underground: 'input', x: n.px, y: n.py, out: null },
      { name, kind: 'underground-belt', route, w: 1, h: 1, direction: d, travel: d, underground: 'output', x: n.qx, y: n.qy, out: key(...step(n.qx, n.qy, d)) },
    ];
  };
  // (Most links hold no tiles for their route's others: no key made then.)
  const held = (x, y) => among(pending, x, y);
  // (A turn's cost: the spec's, where it weighs turns as the finished block does, else TURN_COST.)
  const turn = spec.turn ?? TURN_COST;
  return Object.assign(node => {
    const options = [];
    if (held(node.x, node.y)) return options;
    // (Whether a belt may stand here at all, whichever way it heads: asked once a node.)
    if (!grid.freeFor(node.x, node.y, spec.id) || fedByOther(grid, spec, node.x, node.y)) return options;
    const straightOn = spec.straight && node.prev === null && key(node.x, node.y) === target.from;
    for (const d of straightOn ? STRAIGHT[node.a] : directions(node.a)) {
      const nx = node.x + DX[d], ny = node.y + DY[d];
      if (!beltOutputAllowed(grid, spec, nx, ny) && !spec.joins?.has(`${nx},${ny},${d}`)) continue;
      options.push(state(nx, ny, d, false, 1 + (d === node.a ? 0 : turn), LAYS_PIECE, node.x, node.y, null));
    }
    const d = node.a;
    // A tunnel may not pass under a later waypoint of its own route, nor surface on one.
    const dx = DX[d], dy = DY[d];
    const ax = node.x + dx, ay = node.y + dy;
    if (held(ax, ay)) return options;
    // Where the tile ahead takes a belt, the belt walks on and dives at the obstacle instead.
    if (grid.freeFor(ax, ay, spec.id) && !fedByOther(grid, spec, ax, ay) && (target.key === null || ax !== target.x || ay !== target.y)) return options;
    // (The tunnels of this type on the line every hop runs along: looked up once.)
    const line = grid.tunnelLine(names.underground, node, { x: ax, y: ay });
    for (const hop of HOPS(names.reach)) {
      const qx = node.x + dx * hop, qy = node.y + dy * hop;
      if (held(qx, qy)) break;
      if (!grid.freeFor(qx, qy, spec.id)) continue;
      const s = span(node, { x: qx, y: qy });
      if (line.some(t => spansOverlap(t, s))) continue;
      if (!beltOutputAllowed(grid, spec, qx + dx, qy + dy) || fedByOther(grid, spec, qx, qy)) continue;
      // A tunnel surfacing on a waypoint must leave the belt a tile to go on to.
      const reached = target.key !== null && qx === target.x && qy === target.y && (target.last || grid.freeFor(qx + dx, qy + dy, spec.id));
      options.push(tunnelMove(node, hop, qx, qy, s, reached));
    }
    return options;
  }, { lay });
}

function pipeMoves(grid, spec, names, pending) {
  const lay = n => {
    if (n.lays === LAYS_PIECE) return [pipePiece(spec, names, n.px, n.py, n.a)];
    // A pipe-to-ground's direction is its above-ground connection side.
    const name = names.underground, route = spec.id, fluid = spec.fluid, d = n.a;
    return [
      { name, kind: 'pipe-to-ground', route, fluid, w: 1, h: 1, travel: d, out: null, underground: 'input', x: n.px, y: n.py, direction: opposite(d) },
      { name, kind: 'pipe-to-ground', route, fluid, w: 1, h: 1, travel: d, out: null, underground: 'output', x: n.qx, y: n.qy, direction: d },
    ];
  };
  return Object.assign(node => {
    const options = [];
    if (canPipe(grid, spec, node.x, node.y)) {
      for (const d of directions(node.a)) {
        options.push(state(node.x + DX[d], node.y + DY[d], d, false, 1 + (d === node.a ? 0 : TURN_COST), LAYS_PIECE, node.x, node.y, null));
      }
    }
    const d = node.a;
    const endOk = (x, y) => grid.freeFor(x, y, spec.id) && !grid.pipeBlocked.hasAt(x, y) && !pending.hasAt(x, y) && !grid.surfaceOnly.hasAt(x, y);
    if (!endOk(node.x, node.y)) return options;
    // Where the tile ahead takes a pipe, the pipe walks on and dives at the obstacle instead.
    const dx = DX[d], dy = DY[d];
    const ax = node.x + dx, ay = node.y + dy;
    if (canPipe(grid, spec, ax, ay) && !pending.hasAt(ax, ay) && !grid.surfaceOnly.hasAt(ax, ay)) return options;
    for (const hop of HOPS(names.reach)) {
      // A pipe tunnel may not pass under a tile that must carry a surface pipe: a join or a port.
      const ux = node.x + dx * (hop - 1), uy = node.y + dy * (hop - 1);
      if (hop > 1 && (grid.surfaceOnly.hasAt(ux, uy) || pending.hasAt(ux, uy))) break;
      const qx = node.x + dx * hop, qy = node.y + dy * hop;
      if (!endOk(qx, qy)) continue;
      const s = span(node, { x: qx, y: qy });
      if (grid.tunnelLine(names.underground, node, { x: qx, y: qy }).some(t => spansOverlap(t, s))) continue;
      options.push(tunnelMove(node, hop, qx, qy, s));
    }
    return options;
  }, { lay });
}

// Whether a tile is among `tiles` (keys): by its coordinates where they are a TileSet, no key
// made; none made either where there are none.
function among(tiles, x, y) {
  return tiles.size > 0 && (tiles instanceof TileSet ? tiles.hasAt(x, y) : tiles.has(key(x, y)));
}

function beltPiece(spec, names, x, y, d) {
  return { name: names.belt, kind: 'belt', route: spec.id, x, y, w: 1, h: 1, direction: d, travel: d, out: key(...step(x, y, d)) };
}

function pipePiece(spec, names, x, y, d) {
  return { name: names.pipe, kind: 'pipe', route: spec.id, fluid: spec.fluid, x, y, w: 1, h: 1, direction: 0, travel: d, out: null };
}

function canBelt(grid, spec, x, y, d) {
  const [ox, oy] = step(x, y, d);
  return grid.freeFor(x, y, spec.id) && (beltOutputAllowed(grid, spec, ox, oy) || !!spec.joins?.has(`${ox},${oy},${d}`)) && !fedByOther(grid, spec, x, y);
}

// A belt must not push items into another route's belt, or into a tile held for another belt.
function beltOutputAllowed(grid, spec, ox, oy) {
  const target = grid.at(ox, oy);
  if (target && target.route !== spec.id && (target.kind === 'belt' || target.kind === 'underground-belt')) return false;
  const held = grid.holder(ox, oy);
  return held === undefined || held === spec.id || grid.fluidPorts.hasAt(ox, oy);
}

const SIDES = Object.values(VEC);
// (The same as two lists of numbers, for fedByOther: no array taken apart a neighbour.)
const SIDE_X = SIDES.map(([dx]) => dx), SIDE_Y = SIDES.map(([, dy]) => dy);

function fedByOther(grid, spec, x, y) {
  let here = null;
  for (let k = 0; k < 4; k++) {
    const n = grid.at(x + SIDE_X[k], y + SIDE_Y[k]);
    if (n?.route !== undefined && n.route !== spec.id && n.out === (here ??= key(x, y))) return true;
  }
  return false;
}

// A pipe connects on all four sides, so no neighbour may belong to another pipe network — even
// one carrying the same fluid (a recipe's input and output of one fluid must stay apart) — but
// one it draws from or joins.
function canPipe(grid, spec, x, y) {
  if (!grid.freeFor(x, y, spec.id) || grid.pipeBlocked.hasAt(x, y)) return false;
  for (const [d, dx, dy] of NEIGHBOURS) {
    const n = grid.at(x + dx, y + dy);
    const other = n && n.route !== spec.id && !spec.draws?.routes.has(n.route) && !spec.joins?.routes.has(n.route);
    if (n?.kind === 'pipe' && other) return false;
    if (n?.kind === 'pipe-to-ground' && other && n.direction === opposite(d)) return false;
    if (grid.fluidPorts.hasAt(x + dx, y + dy) && grid.holder(x + dx, y + dy) !== spec.id) return false;
  }
  return true;
}

// (Each side as heading and step, made once: canPipe asks for every tile of every pipe step.)
const NEIGHBOURS = Object.entries(VEC).map(([d, [dx, dy]]) => [+d, dx, dy]);

export class Heap {
  // (Values and their priorities side by side: no item object made a push.)
  constructor() {
    this.values = [];
    /** @type {number[]} */
    this.priorities = [];
  }
  get size() { return this.values.length; }
  // (Sifted with a hole rather than by swaps: the same comparisons, the same order.)
  push(value, priority) {
    const values = this.values, priorities = this.priorities;
    let i = values.length;
    values.push(value);
    priorities.push(priority);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (priorities[p] <= priority) break;
      values[i] = values[p];
      priorities[i] = priorities[p];
      i = p;
    }
    values[i] = value;
    priorities[i] = priority;
  }
  pop() {
    const values = this.values, priorities = this.priorities;
    const top = values[0];
    const last = values.pop(), lastPriority = priorities.pop();
    const n = values.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, least = lastPriority;
        if (l < n && priorities[l] < least) { m = l; least = priorities[l]; }
        if (r < n && priorities[r] < least) m = r;
        if (m === i) break;
        values[i] = values[m];
        priorities[i] = priorities[m];
        i = m;
      }
      values[i] = last;
      priorities[i] = lastPriority;
    }
    return top;
  }
}
