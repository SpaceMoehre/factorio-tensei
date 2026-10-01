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
//         reverse: Set of part keys }
export function routeModule(core, opts) {
  const { margin } = opts;
  const area = { x: -margin.w, y: -margin.n, w: core.w + margin.w + margin.e, h: core.h + margin.n + margin.s };
  // Each part with the belt rows (and side or head-on belts) it runs along.
  const parts = core.parts.map((p, id) => ({
    ...p, id, key: partKey(p), canEnter: p.canEnter ?? true, canExit: p.canExit ?? true,
    lines: core.rows.filter(r => partKey(r) === partKey(p)),
    // Head-on belts meet their machine one way only.
    dir: opts.reverse?.has(partKey(p)) && p.kind !== 'head' ? W : E,
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
    return routeBelt(grid, {
      id: job.id, start, waypoints: job.canEnter ? waypoints : waypoints.slice(1),
      end: job.canExit ? (job.dir === W ? 'west' : 'east') : 'dead',
    }, opts.belt);
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
    const { entities: kept, log } = opts.squeeze === false ? { entities: objects, log: [] } : squeezeEntities(objects);
    const keptSet = new Set(kept);
    const moved = (x, y) => squeezed(log, x, y);
    const grid = routedGrid && !log.length ? routedGrid : regrid(kept);
    const listOf = k => pieces.get(k).map(q => copies.get(q)).filter(q => keptSet.has(q));
    const entities = core.entities.map(e => copies.get(e));
    const consumers = entities.filter(e => e.kind === 'inserter' || (e.kind === 'building' && opts.electric(e)));
    const poles = placePoles(grid, consumers, opts.pole).map(({ x, y, w, h }) => ({ x, y, w, h }));
    const machines = entities.filter(e => e.kind === 'building');
    const inserters = entities.filter(e => e.kind === 'inserter');
    for (const p of parts) chooseLanes(listOf(p.key), inserters, machines, opts.inserters, p.dir === W ? 'right' : 'left');
    const routedParts = parts.map(p => {
      const list = listOf(p.key);
      const indices = marks.get(p.key).map(q => list.indexOf(copies.get(q)));
      return {
        routeIds: p.routeIds, part: p.part, key: p.key, kind: p.kind ?? 'band', face: p.face ?? null,
        rows: p.rows, machines: p.machines, lanes: p.lanes,
        canEnter: p.canEnter, canExit: p.canExit, dir: p.dir,
        pieces: list, first: Math.min(...indices), last: Math.max(...indices),
        // The first piece a copy may end on without pushing items into another route.
        end: deadEnd(grid, list, Math.max(...indices), p.id),
        drops: laneDrops(list, inserters, machines, opts.inserters),
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
    const box = extentOf(kept);
    const out = { x: box.x, y: box.y, w: box.w, h: box.h };
    return { area: out, w: core.w, h: core.h, entities, parts: routedParts, fluids: routedFluids, poles, core: squeezedCore };
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

// Which lane each output inserter drops onto, per machine: items/min it can put on the belt's
// left and right lanes (relative to the belt's travel), and on a lane the drop does not decide
// (a drop along the belt, or onto a curve).
function laneDrops(pieces, inserters, machines, specs) {
  const at = new Map(pieces.map((p, i) => [key(p.x, p.y), i]));
  const byMachine = new Map();
  for (const ins of inserters) {
    const { pickup, drop } = points(ins, specs);
    const i = at.get(key(Math.floor(drop.x), Math.floor(drop.y)));
    if (i === undefined) continue;
    const m = machines.findIndex(e => pickup.x >= e.x && pickup.x < e.x + e.w && pickup.y >= e.y && pickup.y < e.y + e.h);
    if (m < 0) continue;
    const p = pieces[i];
    const prev = pieces[i - 1];
    const curve = p.kind === 'belt' && prev && prev.underground !== 'input' && prev.travel !== p.travel;
    const [dx, dy] = VEC[p.travel];
    const ox = drop.x - (p.x + 0.5), oy = drop.y - (p.y + 0.5);
    const cross = dx * oy - dy * ox;
    const lane = curve || Math.abs(cross) < 1e-6 ? 'either' : cross > 0 ? 'right' : 'left';
    if (!byMachine.has(m)) byMachine.set(m, { left: 0, right: 0, either: 0 });
    byMachine.get(m)[lane] += ins.rate ?? 0;
  }
  return [...byMachine.values()];
}

// A 90° inserter dropping along its belt (from beside it in the belt's row) would leave the lane
// to chance: its drop point moves a quarter tile to one side, onto the lane that has less so far,
// so the machines of a row fill both lanes of the belt beside them (custom vectors). A tie goes
// to `first`: the copies routed the other way round take the other lane, and a belt snaking
// through them gets both.
function chooseLanes(pieces, inserters, machines, specs, first) {
  const at = new Map(pieces.map((p, i) => [key(p.x, p.y), i]));
  const load = { left: 0, right: 0 };
  const open = [];
  for (const ins of inserters) {
    const { pickup, drop } = points(ins, specs);
    const i = at.get(key(Math.floor(drop.x), Math.floor(drop.y)));
    if (i === undefined || !machines.some(e => pickup.x >= e.x && pickup.x < e.x + e.w && pickup.y >= e.y && pickup.y < e.y + e.h)) continue;
    const p = pieces[i], prev = pieces[i - 1];
    if (p.kind === 'belt' && prev && prev.underground !== 'input' && prev.travel !== p.travel) continue;
    const [dx, dy] = VEC[p.travel];
    const cross = dx * (drop.y - (p.y + 0.5)) - dy * (drop.x - (p.x + 0.5));
    if (Math.abs(cross) > 1e-6) load[cross > 0 ? 'right' : 'left'] += ins.rate ?? 0;
    else if (ins.vectors) open.push({ ins, i, dx, dy });
  }
  for (const { ins, dx, dy } of open.sort((a, b) => a.i - b.i)) {
    const other = first === 'left' ? 'right' : 'left';
    const lane = load[first] <= load[other] ? first : other;
    load[lane] += ins.rate ?? 0;
    // The right lane lies to the right of the belt's travel.
    const side = lane === 'right' ? 0.25 : -0.25;
    ins.vectors = { ...ins.vectors, drop: { x: ins.vectors.drop.x - dy * side, y: ins.vectors.drop.y + dx * side } };
  }
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
