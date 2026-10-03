import { Grid, E, W, VEC, key } from './grid.js';
import { routeBelt, routePipe, RoutingError } from './router.js';
import { placePoles, PowerError } from './poles.js';
import { squeezeEntities, squeezed } from './compact.js';

export { RoutingError, PowerError };

const REROUTES = 3;

// Routes one Module — a core of machines with their inserters and belt rows — on its own, in
// its local coordinates, so the Compound Block can place copies of it without routing them again.
// Every belt part runs from the module's west edge through its waypoints to its east edge, so a
// copy can be fed from upstream and pass on downstream; a copy that needs neither drops the
// pieces before its first waypoint or after its last (trim). A part nothing can feed from behind
// (a Head-on output) starts at its first waypoint; one that ends against its machine (a Head-on
// input) ends there. Every fluid reaches the west edge (an input) or the east edge (an output).
// Poles are placed to prove the module can be powered; the compound places them again.
// Parts listed in `reverse` run the other way, east to west: copies stacked alternately one way
// and the other let a belt snake down through all of them, turning beside each.
// opts: { margin: { w, e, n, s }, fluids: [{ routeId, fluid, role }], belt: { belt, underground,
//         reach }, pipe: { pipe, underground, reach }, pole, inserters: { [name]: spec },
//         electric: entity => boolean, order: [part or fluid key] (routing order),
//         reverse: Set of part keys, west: Set of route ids whose parts run east to west
//         (reverse turns them back), made: items/min each machine makes (output lanes are
//         chosen by it), full: what each makes at full speed (its lanes are chosen to carry
//         that), lane: items/min a lane carries, offsets: every output inserter whose
//         prototype allows custom vectors picks its lane by its drop point (Inserter_Config) }
export function routeModule(core, opts) {
  const { margin } = opts;
  const area = { x: -margin.w, y: -margin.n, w: core.w + margin.w + margin.e, h: core.h + margin.n + margin.s };
  // Each part with the belt rows (and side or head-on belts) it runs along.
  const parts = core.parts.map((p, id) => ({
    ...p, id, key: partKey(p), canEnter: p.canEnter ?? true, canExit: p.canExit ?? true,
    lines: core.rows.filter(r => partKey(r) === partKey(p)),
    // Head-on belts meet their machine one way only. A Recipe Loop's feedback (opts.west) comes
    // back from the east.
    dir: Boolean(opts.reverse?.has(partKey(p))) !== p.routeIds.every(id => opts.west?.has(id)) && p.kind !== 'head' ? W : E,
  }));
  const fromX = p => (p.dir === W ? area.x + area.w - 1 : p.canEnter ? area.x : null);
  const fluidIds = [...new Set([...core.ports.map(p => p.routeId), ...core.pipeRows.map(p => p.routeId)])];
  const pipeId = routeId => parts.length + fluidIds.indexOf(routeId);
  const fluids = fluidIds.map(routeId => {
    const f = opts.fluids.find(x => x.routeId === routeId);
    return { id: pipeId(routeId), routeId, fluid: f.fluid, role: f.role, key: `fluid:${routeId}` };
  });

  const placeCore = () => {
    const grid = new Grid(area);
    for (const e of core.entities) grid.place(e);
    const partOf = row => parts.find(p => p.key === partKey(row)).id;
    for (const row of core.rows) for (const [x, y] of row.reserve) grid.reserve(x, y, partOf(row));
    for (const row of core.pipeRows) for (const [x, y] of row.reserve) grid.reserve(x, y, pipeId(row.routeId));
    for (const port of core.ports) for (const [x, y] of port.tiles) grid.reserveFluidPort(x, y, pipeId(port.routeId));
    for (const [x, y] of core.pipeBlocked) grid.pipeBlocked.add(key(x, y));
    for (const [x, y] of core.surfacePorts) grid.surfaceOnly.add(key(x, y));
    for (const { routeId, tile: [x, y] } of core.taps ?? []) grid.reserve(x, y, pipeId(routeId));
    for (const [x, y] of core.poleSlots) grid.reserve(x, y, -1);
    // A fluid with pipe rows in several bands joins them in a riser column beside the core: the
    // first such fluid on the west, the next on the east, then further out.
    const risers = fluidIds.filter(id => core.pipeRows.filter(p => p.routeId === id).length > 1);
    risers.forEach((id, k) => {
      const out = 1 + 2 * Math.floor(k / 2);
      const x = k % 2 ? core.w - 1 + out : -out;
      const ys = core.pipeRows.filter(p => p.routeId === id).map(p => p.y);
      for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
        if (!grid.occupied.has(key(x, y)) && !grid.reserved.has(key(x, y))) grid.reserve(x, y, pipeId(id));
      }
    });
    return grid;
  };

  const routeOne = (grid, job) => {
    if (job.kind === 'pipe') {
      const port = core.ports.find(p => p.routeId === job.routeId);
      return routePipe(grid, {
        id: job.id, fluid: job.fluid, terminals: port ? port.tiles : [], source: job.role === 'input', sink: job.role === 'output',
      }, opts.pipe);
    }
    const waypoints = orderWaypoints(job.lines, fromX(job));
    const edge = job.dir === W ? area.x + area.w - 1 : area.x;
    const start = job.canEnter
      ? { tiles: [...Array(area.h).keys()].map(k => [edge, area.y + k]), dir: job.dir }
      : { tiles: [waypoints[0]], dir: E };
    const route = level => routeBelt(grid, {
      id: job.id, start, waypoints: job.canEnter ? waypoints : waypoints.slice(1),
      end: job.canExit ? (job.dir === W ? 'west' : 'east') : 'dead', straight: level,
    }, opts.belt);
    // An output's belt goes straight on where its inserters drop, so each drop's lane is
    // decided (on a curve it is not): along its rows if it can, else any way it can go on; where
    // neither routes, it may turn there.
    if (!job.output) return route(0);
    for (const level of [2, 1]) {
      const saved = grid.snapshot();
      try {
        return route(level);
      } catch (e) {
        if (!(e instanceof RoutingError)) throw e;
        grid.restore(saved);
      }
    }
    return route(0);
  };

  // Pipes first: no fluid may touch another. On a failure everything is ripped up and routed
  // again with the failing job first, a few times.
  const jobs = [...fluids.map(f => ({ ...f, kind: 'pipe' })), ...parts.map(p => ({ ...p, kind: 'belt' }))];
  let order = opts.order ? [...jobs].sort((a, b) => rank(opts.order, a.key) - rank(opts.order, b.key)) : jobs;
  const tried = new Set();
  for (;;) {
    tried.add(order.map(j => j.key).join());
    const grid = placeCore();
    const pieces = new Map();
    let failed = null;
    for (const job of order) {
      try {
        pieces.set(job.key, routeOne(grid, job));
        // A fluid's stub keeps the edge tiles beside it, so another fluid's stub lands at least
        // two tiles away and the pipes joining copies outside can pass each other.
        if (job.kind === 'pipe') {
          const edge = job.role === 'input' ? area.x : area.x + area.w - 1;
          for (const p of pieces.get(job.key).filter(q => q.x === edge)) {
            for (const y of [p.y - 1, p.y + 1]) {
              if (grid.inBounds(edge, y) && !grid.occupied.has(key(edge, y)) && !grid.reserved.has(key(edge, y))) grid.reserve(edge, y, job.id);
            }
          }
        }
      } catch (e) {
        if (!(e instanceof RoutingError)) throw e;
        failed = { job, error: e };
        break;
      }
    }
    if (!failed) return finish(grid, pieces);
    order = [failed.job, ...order.filter(j => j !== failed.job)];
    if (tried.has(order.map(j => j.key).join()) || tried.size > REROUTES) throw failed.error;
  }

  // Once routed, the module is squeezed like the Compound Block (compact.js): rows and columns
  // holding only straight belts or pipes and empty tiles come out, so a copy takes no more room
  // than it needs. Then poles prove it can be powered, and each part learns where a copy may
  // drop its head or tail and which lanes its machines fill.
  function finish(routedGrid, pieces) {
    try {
      return finishWith(routedGrid, pieces, opts.squeeze !== false);
    } catch (e) {
      // Squeezing took the room a pole needed: power the module as routed.
      if (!(e instanceof PowerError) || opts.squeeze === false) throw e;
      return finishWith(routedGrid, pieces, false);
    }
  }

  function finishWith(routedGrid, pieces, squeeze) {
    // Each part's waypoints, by the pieces on them: they stay put while lines come out.
    const marks = new Map(parts.map(p => {
      const at = new Map(pieces.get(p.key).map(q => [key(q.x, q.y), q]));
      return [p.key, orderWaypoints(p.lines, fromX(p)).map(([x, y]) => at.get(key(x, y)))];
    }));
    // Copies: other routings of this core share its entities.
    const copies = new Map();
    const dup = e => {
      const c = { ...e };
      copies.set(e, c);
      return c;
    };
    const objects = [...core.entities.map(dup), ...[...pieces.values()].flat().map(dup)];
    const { entities: kept, log } = squeeze ? squeezeEntities(objects) : { entities: objects, log: [] };
    const keptSet = new Set(kept);
    const moved = (x, y) => squeezed(log, x, y);
    const grid = routedGrid && !log.length ? routedGrid : regrid(kept);
    const listOf = k => pieces.get(k).map(q => copies.get(q)).filter(q => keptSet.has(q));
    const entities = core.entities.map(e => copies.get(e));
    const consumers = entities.filter(e => e.kind === 'inserter' || (e.kind === 'building' && opts.electric(e)));
    const poles = powered(grid, kept, consumers);
    const machines = entities.filter(e => e.kind === 'building');
    const inserters = entities.filter(e => e.kind === 'inserter');
    // How each machine's output splits between the belts it drops on, then the lanes.
    const split = outputSplit(parts.map(p => listOf(p.key)), inserters, machines, opts.inserters, opts.made ?? Infinity);
    parts.forEach((p, k) => chooseLanes(listOf(p.key), inserters, machines, opts.inserters, p.dir === W ? 'right' : 'left', {
      made: opts.full ?? opts.made ?? Infinity, lane: opts.lane ?? Infinity, share: m => split(m, k), offsets: opts.offsets ?? false,
    }));
    const routedParts = parts.map((p, k) => {
      const list = listOf(p.key);
      const indices = marks.get(p.key).map(q => list.indexOf(copies.get(q)));
      return {
        routeIds: p.routeIds, part: p.part, key: p.key, kind: p.kind ?? 'band', face: p.face ?? null,
        rows: p.rows, machines: p.machines, lanes: p.lanes,
        canEnter: p.canEnter, canExit: p.canExit, dir: p.dir,
        pieces: list, first: Math.min(...indices), last: Math.max(...indices),
        // The first piece a copy may end on without pushing items into another route.
        end: deadEnd(grid, list, Math.max(...indices), p.id),
        drops: laneDrops(list, inserters, machines, opts.inserters, m => split(m, k)),
      };
    });
    const routedFluids = fluids.map(f => ({ routeId: f.routeId, fluid: f.fluid, role: f.role, pieces: listOf(f.key) }));
    // The core's tiles that the Compound Block reserves, where they are now.
    const tiles = list => list.map(([x, y, ...rest]) => {
      const at = moved(x, y);
      return at && [...at, ...rest];
    }).filter(Boolean);
    const squeezedCore = {
      ...core,
      ports: core.ports.map(p => ({ ...p, tiles: tiles(p.tiles) })),
      pipeBlocked: tiles(core.pipeBlocked), surfacePorts: tiles(core.surfacePorts), poleSlots: tiles(core.poleSlots),
      taps: (core.taps ?? []).map(t => ({ ...t, tile: moved(...t.tile) })).filter(t => t.tile),
    };
    // Poles placed in a margin the routing left empty belong to the module too.
    const box = extentOf([...kept, ...poles]);
    const out = { x: box.x, y: box.y, w: box.w, h: box.h };
    return { area: out, w: core.w, h: core.h, entities, parts: routedParts, fluids: routedFluids, poles, core: squeezedCore };
  }

  // Poles proving the module can be powered. A pole too big for any gap of a dense module, out of
  // reach from the strips north and south of it, may stand beside it west or east instead, where
  // the Compound Block leaves room between Sub-Blocks (its own pole placement has the last word):
  // such a pole is not the module's.
  function powered(grid, objects, consumers) {
    const own = list => list.map(({ x, y, w, h }) => ({ x, y, w, h }));
    try {
      return own(placePoles(grid, consumers, opts.pole));
    } catch (e) {
      if (!(e instanceof PowerError)) throw e;
      const { x, y, w, h } = grid.area, side = opts.pole.size.w;
      const wide = new Grid({ x: x - side, y, w: w + 2 * side, h });
      for (const o of objects) wide.place(o);
      return own(placePoles(wide, consumers, opts.pole)).filter(p => p.x >= x && p.x + p.w <= x + w);
    }
  }

  // A grid holding the squeezed module, for poles and for where a belt may end.
  function regrid(objects) {
    const box = extentOf(objects);
    const grid = new Grid(box);
    for (const e of objects) grid.place(e);
    return grid;
  }
}

function extentOf(entities) {
  let x = Infinity, y = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of entities) {
    x = Math.min(x, e.x); y = Math.min(y, e.y);
    x1 = Math.max(x1, e.x + e.w); y1 = Math.max(y1, e.y + e.h);
  }
  return { x, y, w: x1 - x, h: y1 - y };
}

const partKey = p => `${p.routeIds.join('+')}|${p.part}`;
const rank = (order, k) => {
  const i = order.indexOf(k);
  return i < 0 ? order.length : i;
};

// A part's waypoints in the order its belt visits them: its rows top to bottom (side belts by
// column), each walked from the end nearer to where the belt is.
function orderWaypoints(rows, fromX) {
  const sorted = [...rows].sort((a, b) => Number(a.axis === 'v') - Number(b.axis === 'v') || (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  const out = [];
  let x = fromX ?? (sorted[0]?.waypoints[0]?.[0] ?? 0), y = null;
  for (const row of sorted) {
    if (!row.waypoints.length) continue;
    const vertical = row.axis === 'v';
    const along = p => (vertical ? p[1] : p[0]);
    const list = [...row.waypoints].sort((a, b) => along(a) - along(b));
    const here = vertical ? (y ?? list[0][1]) : x;
    // A head-on belt is walked one way only: toward its machine (an input) or away (an output).
    const forward = row.kind === 'head' || Math.abs(along(list[0]) - here) <= Math.abs(along(list.at(-1)) - here);
    const ordered = forward ? list : list.reverse();
    out.push(...ordered);
    [x, y] = ordered.at(-1);
  }
  return out;
}

// Where a copy's belt may stop when nothing takes it further: the last waypoint's piece, or the
// first piece after it that neither dives underground nor points into another route's belt.
function deadEnd(grid, pieces, last, id) {
  for (let i = last; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.underground === 'input') continue;
    const [dx, dy] = VEC[p.travel];
    const ahead = grid.at(p.x + dx, p.y + dy);
    if (ahead && ahead.route !== id && (ahead.kind === 'belt' || ahead.kind === 'underground-belt')) continue;
    return i;
  }
  return pieces.length - 1;
}

// Which lane each output inserter drops onto, per machine (its index among the module's machines):
// items/min it can put on the belt's left and right lanes (relative to the belt's travel), and on
// a lane the drop does not decide (a drop onto a curve); and the machine's share of its output
// that goes onto this belt (a Two-Way Output's row drops on two belts).
function laneDrops(pieces, inserters, machines, specs, share) {
  const at = new Map(pieces.map((p, i) => [key(p.x, p.y), i]));
  const byMachine = new Map();
  for (const ins of inserters) {
    const { pickup, drop } = points(ins, specs);
    const i = at.get(key(Math.floor(drop.x), Math.floor(drop.y)));
    if (i === undefined) continue;
    const m = machines.findIndex(e => inside(pickup, e));
    if (m < 0) continue;
    if (!byMachine.has(m)) byMachine.set(m, { machine: m, left: 0, right: 0, either: 0, share: share(m) });
    byMachine.get(m)[laneOf(pieces, i, drop).lane] += ins.rate ?? 0;
  }
  return [...byMachine.values()];
}

// Output drops whose inserters take custom vectors (Inserter_Config, `offsets`) choose their lane:
// the drop point sits on the drop offset grid of its tile (3×3), a quarter tile off a straight
// piece's centre line, or toward a curve's inner or outer corner (laneOf). Each goes onto the lane
// that lets the belt carry the most of what the machines make for it (each its share of `made`,
// a lane holding `lane`); where both do as well, onto the lane the inserters fill less so far —
// a single-item belt gets its drops left and right in turn — a tie going to `first`: the copies
// routed the other way round take the other lane, and a belt snaking through them gets both.
// Then any drop moving to the other lane that lets the belt carry more does.
function chooseLanes(pieces, inserters, machines, specs, first, { made, lane, share, offsets }) {
  const at = new Map(pieces.map((p, i) => [key(p.x, p.y), i]));
  const here = new Map();
  const open = [];
  for (const ins of inserters) {
    const { pickup, drop } = points(ins, specs);
    const i = at.get(key(Math.floor(drop.x), Math.floor(drop.y)));
    const m = machines.findIndex(e => inside(pickup, e));
    if (i === undefined || m < 0) continue;
    if (!here.has(m)) here.set(m, { left: 0, right: 0, either: 0, share: share(m) });
    if (ins.vectors || (offsets && specs[ins.name]?.customVectors)) open.push({ ins, m, i, pickup, side: null });
    else here.get(m)[laneOf(pieces, i, drop).lane] += ins.rate ?? 0;
  }
  const other = first === 'left' ? 'right' : 'left';
  const filled = side => [...here.values()].reduce((sum, h) => sum + h[side], 0);
  const flow = () => maxFlow([...here.values()], made, lane);
  open.sort((a, b) => a.i - b.i);
  for (const o of open) {
    const h = here.get(o.m), rate = o.ins.rate ?? 0;
    const flowWith = side => {
      h[side] += rate;
      const f = flow();
      h[side] -= rate;
      return f;
    };
    const [a, b] = [flowWith(first), flowWith(other)];
    o.side = Math.abs(a - b) > 1e-9 ? (a > b ? first : other) : filled(first) <= filled(other) ? first : other;
    h[o.side] += rate;
  }
  for (let improved = true, rounds = 0; improved && rounds < open.length; rounds++) {
    improved = false;
    for (const o of open) {
      const h = here.get(o.m), rate = o.ins.rate ?? 0, to = o.side === 'left' ? 'right' : 'left';
      const before = flow();
      h[o.side] -= rate;
      h[to] += rate;
      if (flow() > before + 1e-9) {
        o.side = to;
        improved = true;
      } else {
        h[to] -= rate;
        h[o.side] += rate;
      }
    }
  }
  for (const { ins, i, pickup, side } of open) {
    const to = lanePoint(pieces, i, side);
    const cx = ins.x + 0.5, cy = ins.y + 0.5;
    ins.vectors = { pickup: ins.vectors?.pickup ?? { x: pickup.x - cx, y: pickup.y - cy }, drop: { x: to.x - cx, y: to.y - cy } };
  }
}

// Where on piece i a drop lands on `side` (relative to the belt's travel): a quarter tile off a
// straight piece's centre line, or a quarter tile toward a curve's inner corner (its inner lane)
// or outer corner — cells of Inserter_Config's 3×3 drop offset grid.
export function lanePoint(pieces, i, side) {
  const p = pieces[i];
  const cx = p.x + 0.5, cy = p.y + 0.5;
  const from = curveFrom(pieces, i);
  if (from === null) {
    const [dx, dy] = VEC[p.travel];
    const s = side === 'right' ? 0.25 : -0.25;
    return { x: cx - dy * s, y: cy + dx * s };
  }
  const [ax, ay] = VEC[from], [bx, by] = VEC[p.travel];
  // A right turn's inner lane is its right lane.
  const inner = (side === 'right') === (ax * by - ay * bx > 0);
  const s = inner ? 0.25 : -0.25;
  return { x: cx + s * (bx - ax), y: cy + s * (by - ay) };
}

// The way items enter piece i where it is a curve (fed from the side by the piece before it),
// else null.
function curveFrom(pieces, i) {
  const p = pieces[i], prev = pieces[i - 1];
  return p.kind === 'belt' && prev && prev.underground !== 'input' && prev.travel !== p.travel ? prev.travel : null;
}

// How each machine's output splits between the belts (parts' pieces) its inserters drop on:
// evenly, as far as its inserters onto each belt move that much, the rest onto the others (a
// machine's inserters wait at a full belt while the others take its output, so the split follows
// the room). Without `made`, by its inserters' rates. Returns share(machine, part index).
function outputSplit(lists, inserters, machines, specs, made) {
  const at = new Map();
  lists.forEach((pieces, k) => { for (const p of pieces) at.set(key(p.x, p.y), k); });
  const caps = machines.map(() => lists.map(() => 0));
  for (const ins of inserters) {
    const { pickup, drop } = points(ins, specs);
    const m = machines.findIndex(e => inside(pickup, e));
    const k = at.get(key(Math.floor(drop.x), Math.floor(drop.y)));
    if (m >= 0 && k !== undefined) caps[m][k] += ins.rate ?? 0;
  }
  const shares = caps.map(row => {
    const total = row.reduce((sum, c) => sum + c, 0);
    if (!total || made === Infinity) return row.map(c => (total ? c / total : 0));
    // The belts its inserters move least onto first, each its even part of what is left.
    const out = row.map(() => 0);
    const order = row.map((c, k) => k).filter(k => row[k] > 0).sort((a, b) => row[a] - row[b]);
    let left = made;
    order.forEach((k, n) => {
      const give = Math.min(row[k], left / (order.length - n));
      out[k] = give / made;
      left -= give;
    });
    return out;
  });
  return (m, k) => shares[m][k];
}

const inside = (pt, e) => pt.x >= e.x && pt.x < e.x + e.w && pt.y >= e.y && pt.y < e.y + e.h;

// The lane a drop lands on (Factorio: the side of the belt's centre line the drop point lies on,
// the right lane right on it; an underground belt's hood snaps to its belt). On a curve, a drop
// toward the inner corner lands on the inner lane and one toward the outer corner on the outer
// lane — on the same side of the centre line coming in and going out, and of the arc between —
// elsewhere on it the lane is not predictable: either. centre: the drop lies on the centre line
// of a straight piece.
export function laneOf(pieces, i, drop) {
  const p = pieces[i];
  const cx = p.x + 0.5, cy = p.y + 0.5;
  const sideOf = d => {
    const [dx, dy] = VEC[d];
    return dx * (drop.y - cy) - dy * (drop.x - cx);
  };
  const from = curveFrom(pieces, i);
  if (from === null) {
    const cross = sideOf(p.travel);
    return { lane: cross < -1e-6 ? 'left' : 'right', centre: Math.abs(cross) <= 1e-6 };
  }
  const [ax, ay] = VEC[from], [bx, by] = VEC[p.travel];
  const right = ax * by - ay * bx > 0;
  // The arc between: a quarter circle round the inner corner, half a tile out.
  const nearInner = Math.hypot(drop.x - (cx + (bx - ax) / 2), drop.y - (cy + (by - ay) / 2)) < 0.5 - 1e-6;
  const arc = nearInner === right ? 'right' : 'left';
  const agree = [sideOf(from), sideOf(p.travel)].every(c => (arc === 'right' ? c > 1e-6 : c < -1e-6));
  return { lane: agree ? arc : 'either', centre: false };
}

// Items/min a run of producer machines can put on one belt: each machine makes `made` and drops
// it on the lanes its inserters reach (its share of it, where it drops onto two belts), each lane
// carrying `lane` at most (max flow through the lanes; a drop whose lane is not decided counts on
// the worse lane).
export function maxFlow(drops, made, lane) {
  const flow = side => {
    const l = m => m.left + (side === 'left' ? m.either : 0), r = m => m.right + (side === 'right' ? m.either : 0);
    const sum = f => drops.reduce((s, m) => s + Math.min(made * (m.share ?? 1), f(m)), 0);
    return Math.min(sum(m => l(m) + r(m)), lane + sum(r), lane + sum(l), 2 * lane);
  };
  return Math.min(flow('left'), flow('right'));
}

// Where an inserter picks up and drops, as points: custom vectors when it has them, otherwise
// its prototype's vectors turned to face its direction (the side it picks up from).
export function points(ins, specs) {
  const cx = ins.x + 0.5, cy = ins.y + 0.5;
  if (ins.vectors) {
    return { pickup: { x: cx + ins.vectors.pickup.x, y: cy + ins.vectors.pickup.y }, drop: { x: cx + ins.vectors.drop.x, y: cy + ins.vectors.drop.y } };
  }
  const spec = specs[ins.name];
  const turn = v => {
    let { x, y } = v;
    for (let r = 0; r < ins.direction; r += 4) [x, y] = [-y, x];
    return { x, y };
  };
  const p = turn(spec.pickup), d = turn(spec.insert);
  return { pickup: { x: cx + p.x, y: cy + p.y }, drop: { x: cx + d.x, y: cy + d.y } };
}

// A copy's pieces of one part: from its first waypoint when nothing feeds it from upstream, to
// its dead end when nothing takes it downstream. A tunnel cut in half becomes a plain belt.
export function trim(part, { head, tail }, beltName) {
  const from = head ? part.first : 0;
  const to = tail ? part.end : part.pieces.length - 1;
  const pieces = part.pieces.slice(from, to + 1).map(p => ({ ...p }));
  const plain = p => {
    const [dx, dy] = VEC[p.travel];
    return { name: beltName, kind: 'belt', route: p.route, x: p.x, y: p.y, w: 1, h: 1, direction: p.travel, travel: p.travel, out: key(p.x + dx, p.y + dy) };
  };
  if (head && pieces[0]?.underground === 'output') pieces[0] = plain(pieces[0]);
  if (tail && pieces.at(-1)?.underground === 'input') pieces[pieces.length - 1] = plain(pieces.at(-1));
  return pieces;
}
