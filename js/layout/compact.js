import { Grid, N, E, S, W, VEC, key, opposite, span } from './grid.js';
import { routeLink, RoutingError, legCost } from './router.js';
import { placePoles, PowerError } from './poles.js';
import { inserterTiles } from './validity.js';
import { wirePairs } from './wires.js';

// Squeezes a routed Compound Block: every column (and row) that holds nothing but belts and
// pipes running straight across it, and empty tiles, comes out, and everything beyond moves in
// by one. Belts and pipes just get shorter; tunnels too. A column stays when removing it would
// join what must stay apart (a belt pointing into the gap, two pipes, an inserter's reach), or
// when it holds anything else. Straight pipe runs then go underground, and poles are placed on
// the result. Returns a new block.
// A block in a City Block is not squeezed: its Fixtures stay where they are, and so does the rest.
// Nor is one the user moved a Sub-Block of (`squeeze: false`): the rest stays where it stood.
// The squeezed block keeps the lines it took out (`squeeze`, as squeezeEntities logs them).
// Giving Way: a block whose Sub-Block `step` gave up machines to Fixtures (none built elsewhere)
// runs at the rate of the machines it has. Every Sub-Block's rates and every route's items scale
// down by as much (a Production Chain's rates are proportional to its Goals'), the rest running
// below full speed, and that Sub-Block counts the machines it has. Else the block as it is.
export function given(block, step) {
  const sb = step === undefined ? null : block.subBlocks[step];
  const left = sb ? block.entities.filter(e => e.kind === 'building' && e.subBlock === step).length : 0;
  if (!sb || !left || left >= sb.count) return block;
  const f = left / sb.count;
  const scale = list => list?.map(x => ({ ...x, rate: x.rate * f }));
  return {
    ...block,
    subBlocks: block.subBlocks.map((s, i) => ({ ...s, rate: s.rate * f, inputs: scale(s.inputs), outputs: scale(s.outputs), byproducts: scale(s.byproducts), ...(i === step ? { count: left } : {}) })),
    routes: block.routes.map(r => ({
      ...r, items: r.items.map(x => ({ ...x, rate: x.rate * f, supply: x.supply * f, ...(x.joined ? { joined: x.joined * f } : {}) })),
    })),
  };
}

export function finishBlock(block, catalog, logistics, { squeeze = true } = {}) {
  // Pipes buried, byproduct belts merged, belts straightened and poles placed; where a merged or
  // straightened belt took the room a pole needed, powered as buried (ADR 0051, ADR 0052).
  const finish = b => {
    const buried = buryPipes(b, catalog, logistics);
    try {
      return power(straightenBelts(mergeByproducts(clone(buried), catalog, logistics), catalog, logistics), catalog, logistics);
    } catch (e) {
      if (!(e instanceof PowerError)) throw e;
      return power(buried, catalog, logistics);
    }
  };
  if (block.site || !squeeze) return finish(clone(block));
  const squeezed = compact(block);
  try {
    return finish(squeezed);
  } catch (e) {
    if (!(e instanceof PowerError)) throw e;
    // Squeezing took the room a pole needed: power the block as routed.
    return finish(clone(block));
  }
}

// Three plain pipes or more in a straight line go underground (ADR 0021): a run of pipes that
// each join only the pipe (or machine connection) before and after them on one line, no branch
// and no machine beside them, becomes a pipe-to-ground at each end, facing out, and nothing in
// between; as many tunnels as the pipe-to-ground's reach needs. A run that a tunnel of another
// network crosses along its line stays above ground. Pipes in a square of four thin out first.
// Changes the block in place.
export function buryPipes(block, catalog, logistics) {
  const reach = catalog.pipes?.[logistics.pipe]?.maxDistance ?? 0;
  const fluid = new Map(block.entities.filter(e => e.kind === 'pipe' || e.kind === 'pipe-to-ground').map(e => [key(e.x, e.y), e]));
  if (reach < 2 || !fluid.size) return block;
  // The sides of each tile a machine's fluid connection meets it from (used or not: a pipe there
  // connects either way).
  const ports = new Map();
  const rotate = ({ x, y }, turns) => (turns === 0 ? [x, y] : rotate({ x: -y, y: x }, turns - 1));
  for (const m of block.entities.filter(e => e.kind === 'building')) {
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    for (const box of catalog.buildings[m.name]?.fluidBoxes ?? []) {
      for (const c of box.connections) {
        const [rx, ry] = rotate(c, (m.direction ?? 0) / 4);
        const dir = (c.direction + (m.direction ?? 0)) % 16;
        const tile = key(Math.floor(cx + rx + VEC[dir][0]), Math.floor(cy + ry + VEC[dir][1]));
        if (!ports.has(tile)) ports.set(tile, new Set());
        ports.get(tile).add(opposite(dir));
      }
    }
  }
  // (In an Annex's City Block, the pipes the layout before it built carrying the same fluid too:
  // a pipe drawing from one joins it.)
  const built = new Map((block.site?.fixtures ?? []).filter(f => f.kind === 'pipe' || f.kind === 'pipe-to-ground').map(f => [key(f.x, f.y), f]));
  // The sides a plain pipe connects on: a pipe, a pipe-to-ground facing it, a machine connection.
  const joins = p => [N, E, S, W].filter(d => {
    const at = key(p.x + VEC[d][0], p.y + VEC[d][1]);
    const n = fluid.get(at) ?? (built.get(at)?.fluid === p.fluid ? built.get(at) : undefined);
    return n?.kind === 'pipe' || n?.direction === opposite(d) || ports.get(key(p.x, p.y))?.has(d);
  });
  const straight = (p, axis) => p?.kind === 'pipe' && joins(p).join() === axis.join();
  // A pipe-to-ground pairs with the nearest one facing it within reach (validity.js).
  const partner = t => {
    const [dx, dy] = VEC[opposite(t.direction)];
    for (let i = 1; i <= reach; i++) {
      const b = fluid.get(key(t.x + dx * i, t.y + dy * i));
      if (b?.kind === 'pipe-to-ground' && b.direction === opposite(t.direction)) return b;
    }
    return null;
  };
  // Pipes in a square of four do nothing a line of them would not: two legs of one pipe tree
  // routed side by side, or a leg doubling back beside another, join into a band two pipes wide,
  // which no run below can take underground. Each pipe in such a square goes, where every pipe
  // and pipe-to-ground beside it still joins the others without it (not through a machine), and
  // it meets no machine's connection, no pipe built before (an Annex's draw) and is no end of its
  // route: the band thins to a line (ADR 0050).
  const ends = new Set(block.routes.filter(r => r.kind === 'pipe' && r.pieces.length).flatMap(r => [r.pieces[0], r.pieces.at(-1)]));
  const neighbours = t => {
    const out = [];
    if (t.kind === 'pipe-to-ground') {
      const n = fluid.get(key(t.x + VEC[t.direction][0], t.y + VEC[t.direction][1]));
      if (n && n.fluid === t.fluid && (n.kind === 'pipe' || n.direction === opposite(t.direction))) out.push(n);
      const b = partner(t);
      if (b) out.push(b);
      return out;
    }
    for (const d of [N, E, S, W]) {
      const n = fluid.get(key(t.x + VEC[d][0], t.y + VEC[d][1]));
      if (n && n.fluid === t.fluid && (n.kind === 'pipe' || n.direction === opposite(d))) out.push(n);
    }
    return out;
  };
  const isPipe = (x, y, f) => fluid.get(key(x, y))?.kind === 'pipe' && fluid.get(key(x, y)).fluid === f;
  const inSquare = p => [[-1, -1], [0, -1], [-1, 0], [0, 0]].some(([ox, oy]) => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => isPipe(p.x + ox + dx, p.y + oy + dy, p.fluid)));
  const meetsBuilt = p => [N, E, S, W].some(d => built.get(key(p.x + VEC[d][0], p.y + VEC[d][1]))?.fluid === p.fluid);
  // Whether the pipes and pipe-to-grounds beside p still join without it.
  const spare = p => {
    const around = neighbours(p);
    if (around.length < 2) return false;
    const seen = new Set([p, around[0]]);
    const queue = [around[0]];
    const wanted = new Set(around.slice(1));
    while (queue.length && wanted.size) {
      for (const n of neighbours(queue.pop())) {
        if (seen.has(n)) continue;
        seen.add(n);
        wanted.delete(n);
        queue.push(n);
      }
    }
    return !wanted.size;
  };
  const pruned = new Set();
  for (let again = true; again;) {
    again = false;
    const order = [...fluid.values()].filter(p => p.kind === 'pipe').sort((a, b) => a.y - b.y || a.x - b.x);
    for (const p of order) {
      if (!inSquare(p) || ports.get(key(p.x, p.y))?.size || ends.has(p) || meetsBuilt(p) || !spare(p)) continue;
      fluid.delete(key(p.x, p.y));
      pruned.add(p);
      again = true;
    }
  }
  // The tunnels along each line, as spans of the coordinate along it.
  const lineOf = (p, d) => (d === E || d === W ? `y${p.y}` : `x${p.x}`);
  const along = (p, d) => (d === E || d === W ? p.x : p.y);
  const tunnels = new Map();
  const addTunnel = (a, b, d) => {
    const line = lineOf(a, d);
    if (!tunnels.has(line)) tunnels.set(line, []);
    tunnels.get(line).push([Math.min(along(a, d), along(b, d)), Math.max(along(a, d), along(b, d))]);
  };
  for (const t of fluid.values()) {
    const b = t.kind === 'pipe-to-ground' ? partner(t) : null;
    if (b) addTunnel(t, b, t.direction);
  }
  // (In an Annex's City Block, the pipes' tunnels the layout before it built too.)
  for (const t of block.site?.tunnels ?? []) if (t.pipe) addTunnel(t.a, t.b, t.travel);
  const removed = new Set();
  for (const [axis, d] of [[[E, W], E], [[N, S], S]]) {
    const [dx, dy] = VEC[d];
    for (const p of [...fluid.values()]) {
      // Each run from its first pipe, along d.
      if (!straight(p, axis) || straight(fluid.get(key(p.x - dx, p.y - dy)), axis)) continue;
      const run = [p];
      for (let n = fluid.get(key(p.x + dx, p.y + dy)); straight(n, axis); n = fluid.get(key(n.x + dx, n.y + dy))) run.push(n);
      // As few tunnels as the reach allows, of even lengths.
      const count = Math.ceil(run.length / (reach + 1));
      for (let k = 0, start = 0; k < count; k++) {
        const size = Math.floor(run.length / count) + (k < run.length % count ? 1 : 0);
        const a = run[start], b = run[start + size - 1];
        start += size;
        if (size < 3) continue;
        const [lo, hi] = [along(a, d), along(b, d)];
        if ((tunnels.get(lineOf(a, d)) ?? []).some(([s, t]) => s < hi && lo < t)) continue;
        Object.assign(a, { name: logistics.pipe, kind: 'pipe-to-ground', direction: opposite(d), underground: 'input', travel: d });
        Object.assign(b, { name: logistics.pipe, kind: 'pipe-to-ground', direction: d, underground: 'output', travel: d });
        for (const q of run.slice(run.indexOf(a) + 1, run.indexOf(b))) {
          removed.add(q);
          fluid.delete(key(q.x, q.y));
        }
        addTunnel(a, b, d);
      }
    }
  }
  for (const q of pruned) removed.add(q);
  if (!removed.size) return block;
  block.entities = block.entities.filter(e => !removed.has(e));
  for (const r of block.routes) if (r.kind === 'pipe') r.pieces = r.pieces.filter(p => !removed.has(p));
  return block;
}

// The finished block on a grid for routing belts again: every entity and Fixture placed, the belts'
// tunnels (`partner`: an underground's input to its output), the tiles an inserter or machine
// reaches; null where the belt has no underground.
function beltGrid(block, catalog, logistics) {
  const spec = catalog.belts?.[logistics.belt];
  if (!spec?.underground || !block.routes.some(r => r.kind === 'belt')) return null;
  const names = { belt: spec.name, underground: spec.underground.name, reach: spec.underground.maxDistance };
  const fixtures = block.site?.fixtures ?? [];
  const grid = new Grid(block.site ? block.site.inner : extent(block.entities));
  for (const e of [...fixtures, ...block.entities]) grid.place(e);
  const partner = new Map();
  for (const r of block.routes) {
    r.pieces.forEach((p, i) => {
      const q = r.pieces[i + 1];
      if (p.kind === 'underground-belt' && p.underground === 'input' && q?.underground === 'output') {
        partner.set(p, q);
        grid.addTunnel(names.underground, p, q);
      }
    });
  }
  for (const t of block.site?.tunnels ?? []) if (!t.pipe) grid.addTunnel(t.name, t.a, t.b);
  // Tiles an inserter picks from or drops on, or a machine drops on: no belt comes or goes there.
  const reached = new Set();
  for (const e of block.entities) {
    if (e.kind === 'inserter') {
      const { pickup, drop } = inserterTiles(e, catalog);
      reached.add(pickup).add(drop);
    } else if (e.kind === 'building' && e.drop) reached.add(key(Math.floor(e.x + e.drop.x), Math.floor(e.y + e.drop.y)));
  }
  const unplace = p => {
    grid.occupied.delete(key(p.x, p.y));
    const i = grid.index(p.x, p.y);
    if (i >= 0) grid.cells[i] = undefined;
  };
  const dropTunnel = (p, q) => {
    const s = span(p, q);
    const line = grid.tunnelLines.get(`${names.underground}|${s.axis}|${s.line}`) ?? [];
    const t = line.find(u => u.lo === s.lo && u.hi === s.hi);
    if (!t) return;
    line.splice(line.indexOf(t), 1);
    grid.tunnels.splice(grid.tunnels.indexOf(t), 1);
  };
  return { names, grid, partner, reached, unplace, dropTunnel };
}

// Byproduct belts merged (ADR 0052). Each run of producers sorting a byproduct out sends it on its
// own belt to the east edge (ADR 0030); side-loading joins another only where one lane has room
// for all of it, which a byproduct on both lanes seldom finds (Py's ball mills' biomass, 358 a
// minute a belt, 179 a lane). Once the block is routed, a byproduct's belt is routed again from
// its splitter to beside another's, heading the same way, and the two go through a splitter
// there, on only on that one's side: each lane keeps its share, so two of them go on as one while
// each lane carries half a belt at most. Kept where its way is shorter than to the east edge;
// the longest ways are freed first. Changes the block in place.
export function mergeByproducts(block, catalog, logistics) {
  const filtered = r => r.pieces.findIndex(p => p.kind === 'splitter' && p.filter);
  const lines = block.routes.filter(r => r.kind === 'belt' && r.sink === 'side-output' && r.joins === undefined && filtered(r) >= 0
    && !block.routes.some(o => o.joins === r.id));
  if (lines.length < 2) return block;
  const belted = beltGrid(block, catalog, logistics);
  if (!belted) return block;
  const { names, grid, partner, reached, unplace, dropTunnel } = belted;
  const spec = catalog.belts[logistics.belt];
  const laneCapacity = spec.itemsPerSecond * 30;
  const splitterName = spec.splitter ?? spec.name.replace(/transport-belt$/, 'splitter');
  const itemOf = r => r.pieces[filtered(r)].filter;
  const rateOf = r => r.items.find(i => i.item === itemOf(r))?.rate ?? 0;
  const lanes = new Map(lines.map(r => [r, rateOf(r) / 2]));
  const awayOf = r => r.pieces.slice(filtered(r) + 1);
  const feeders = new Set(block.entities.filter(e => e.out).map(e => e.out));
  const free = (x, y) => grid.inBounds(x, y) && !grid.at(x, y) && grid.holder(x, y) === undefined && !feeders.has(key(x, y)) && !reached.has(key(x, y));
  const into = new Set(), gone = new Set();
  const removed = new Set(), added = [];
  for (const b of [...lines].sort((p, q) => awayOf(q).length - awayOf(p).length)) {
    if (into.has(b)) continue;
    const away = awayOf(b), splitter = b.pieces[filtered(b)];
    if (!away.length || away.some(p => p.kind !== 'belt' && p.kind !== 'underground-belt')) continue;
    for (const p of away) unplace(p);
    const tunnels = away.filter(p => partner.has(p)).map(p => [p, partner.get(p)]);
    for (const [p, q] of tunnels) dropTunnel(p, q);
    // (Beside a straight belt of another's way, the one before it straight too, nothing ahead.)
    const joins = new Set(), offered = new Map();
    for (const a of lines) {
      if (a === b || gone.has(a) || itemOf(a) !== itemOf(b) || lanes.get(a) + rateOf(b) / 2 > laneCapacity + 1e-6) continue;
      const way = awayOf(a);
      way.forEach((p, k) => {
        if (k === 0 || p.kind !== 'belt' || way[k - 1].kind !== 'belt' || way[k - 1].travel !== p.travel || way[k + 1]?.kind === 'splitter') return;
        const [fx, fy] = VEC[p.travel];
        for (const side of [(p.travel + 4) % 16, (p.travel + 12) % 16]) {
          const [sx, sy] = VEC[side];
          const t = { x: p.x + sx, y: p.y + sy };
          if (!free(t.x, t.y) || !free(t.x + fx, t.y + fy)) continue;
          const k2 = `${t.x},${t.y},${p.travel}`;
          joins.add(k2);
          offered.set(k2, { a, piece: p, beside: t });
        }
      });
    }
    const before = grid.snapshot();
    let leg = null;
    if (joins.size) {
      try {
        leg = routeLink(grid, { id: b.id, starts: [{ x: away[0].x, y: away[0].y, a: splitter.travel }], goal: 'join', joins, keepOff: reached, most: 4000 }, names);
      } catch (err) {
        if (!(err instanceof RoutingError)) throw err;
      }
    }
    const joined = /** @type {any} */ (leg)?.joined;
    const chosen = joined && offered.get(joined);
    if (!chosen || legCost(leg, splitter.travel) >= legCost(away, splitter.travel)) {
      grid.restore(before);
      for (const p of away) grid.place(p);
      for (const [p, q] of tunnels) grid.addTunnel(names.underground, p, q);
      continue;
    }
    const { a, piece, beside } = chosen;
    const [fx] = VEC[piece.travel];
    Object.assign(piece, {
      name: splitterName, kind: 'splitter', x: Math.min(piece.x, beside.x), y: Math.min(piece.y, beside.y), w: fx ? 1 : 2, h: fx ? 2 : 1,
      direction: piece.travel, travel: piece.travel,
    });
    delete piece.out;
    grid.place(piece);
    // (Ahead of its side, nothing for the splitter to feed.)
    grid.reserve(beside.x + VEC[piece.travel][0], beside.y + VEC[piece.travel][1], b.id);
    leg.forEach((p, i) => { if (p.underground === 'input') partner.set(p, leg[i + 1]); });
    b.pieces = [...b.pieces.slice(0, filtered(b) + 1), ...leg, piece];
    b.joins = a.id;
    for (const p of away) removed.add(p);
    added.push(...leg);
    lanes.set(a, lanes.get(a) + rateOf(b) / 2);
    into.add(a);
    gone.add(b);
  }
  if (!removed.size) return block;
  block.entities = [...block.entities.filter(e => !removed.has(e)), ...added];
  return block;
}

// Belts routed round what is no longer there take the short way (ADR 0051). Links were routed
// round plain pipes that then went underground, so a belt could turn three times and dive under
// a pipe that is gone: after a splitter, a lane looping round into a tunnel where one turn the
// other way would have done. Each belt's stretches between anchors (its ends, splitters, tiles
// an inserter or machine reaches, where another belt feeds it) are routed again on the finished
// block, from the same tile and heading to the same tile and heading, and kept where they cost
// less (tiles, turns, tunnels as the router counts them). Belts and tunnels keep both lanes as
// they are, and nothing new is fed or reached. Changes the block in place.
export function straightenBelts(block, catalog, logistics) {
  const belted = beltGrid(block, catalog, logistics);
  if (!belted) return block;
  const { names, grid, partner, reached, unplace, dropTunnel } = belted;
  const feeders = new Map();
  for (const e of block.entities) if (e.out) feeders.set(e.out, [...(feeders.get(e.out) ?? []), e]);
  const tiles = p => Array.from({ length: p.w * p.h }, (_, k) => key(p.x + (k % p.w), p.y + Math.floor(k / p.w)));
  const at = p => key(p.x, p.y);
  // Whether q carries on from p.
  const chained = (p, q) => (p.kind === 'splitter' ? tiles(p).some(t => { const [x, y] = t.split(',').map(Number); return key(x + VEC[p.travel][0], y + VEC[p.travel][1]) === at(q); })
    : p.underground === 'input' ? partner.get(p) === q
      : (q.kind === 'splitter' ? tiles(q).includes(p.out) : p.out === at(q)));
  const anchor = (p, before) => p.kind === 'splitter' || reached.has(at(p))
    || (feeders.get(at(p)) ?? []).some(f => f !== before);
  const removed = new Set(), added = [];
  for (const route of block.routes.filter(r => r.kind === 'belt')) {
    const pieces = route.pieces;
    // Stretch s..e: both ends stay, those between may go.
    const straighten = (s, e) => {
      while (e > s && pieces[e].kind === 'underground-belt') e--;
      while (s < e && pieces[s].underground === 'input') s++;
      if (e - s < 2) return 0;
      const old = pieces.slice(s + 1, e), first = old[0], last = old.at(-1);
      if (old.some(p => p.kind !== 'belt' && p.kind !== 'underground-belt') || last.underground === 'input') return 0;
      const start = { x: first.x, y: first.y, a: pieces[s].travel };
      const [gx, gy] = (last.out ?? '').split(',').map(Number);
      if (!Number.isFinite(gx)) return 0;
      const goal = { x: gx, y: gy, a: last.travel };
      const was = legCost(old, start.a);
      // (Nothing shorter is possible: leave it.)
      if (was - (Math.abs(gx - start.x) + Math.abs(gy - start.y) + (start.a === goal.a ? 0 : 0.2)) < 1) return 0;
      const tunnels = old.filter(p => partner.has(p)).map(p => [p, partner.get(p)]);
      for (const [p, q] of tunnels) dropTunnel(p, q);
      const before = grid.snapshot();
      for (const p of old) unplace(p);
      let leg = null;
      try {
        leg = routeLink(grid, { id: route.id, starts: [start], goal, keepOff: reached, most: 4000 }, names);
      } catch (err) {
        if (!(err instanceof RoutingError)) throw err;
      }
      if (leg && leg.length && legCost(leg, start.a) < was - 0.5) {
        leg.forEach((p, i) => { if (p.underground === 'input') partner.set(p, leg[i + 1]); });
        pieces.splice(s + 1, old.length, ...leg);
        for (const p of old) removed.add(p);
        added.push(...leg);
        return leg.length - old.length;
      }
      grid.restore(before);
      for (const [p, q] of tunnels) grid.addTunnel(names.underground, p, q);
      return 0;
    };
    let s = 0;
    for (let k = 1; k < pieces.length; k++) {
      if (!chained(pieces[k - 1], pieces[k])) {
        k += straighten(s, k - 1);
        s = k;
      } else if (anchor(pieces[k], pieces[k - 1])) {
        k += straighten(s, k);
        s = k;
      }
    }
    straighten(s, pieces.length - 1);
  }
  if (!removed.size) return block;
  block.entities = [...block.entities.filter(e => !removed.has(e)), ...added];
  return block;
}

export function compact(block) {
  const out = clone(block);
  const { entities, log } = squeezeEntities(out.entities);
  const kept = new Set(entities);
  out.entities = entities;
  out.squeeze = log;
  for (const r of out.routes) r.pieces = r.pieces.filter(p => kept.has(p));
  // Each Sub-Block's box, and those of machines broken out of it, shrink with the lines.
  for (const box of out.subBlocks.flatMap(sb => [sb, ...(sb.apart ?? [])])) {
    for (const { axis, u } of log) {
      const c = axis === 'x' ? 'x' : 'y', d = axis === 'x' ? 'w' : 'h';
      if (box[c] > u) box[c]--;
      else if (box[c] + box[d] > u) box[d]--;
    }
  }
  return out;
}

// Takes the removable lines out of a list of entities (moving the others in place) until none is
// left. Returns the entities kept and the lines taken out, in order, as { axis, u }: a point
// beyond line u along its axis moved in by one.
export function squeezeEntities(entities) {
  let list = entities;
  const log = [];
  for (let pass = 0; pass < 200; pass++) {
    let any = false;
    for (const axis of ['x', 'y']) {
      const lines = removableLines(list, axis);
      if (!lines.length) continue;
      list = removeLines(list, axis, lines);
      for (const u of lines) log.push({ axis, u });
      any = true;
    }
    if (!any) break;
  }
  return { entities: list, log };
}

// Where a point lands once the logged lines are out (null when it lay on one).
export function squeezed(log, x, y) {
  for (const { axis, u } of log) {
    const v = axis === 'x' ? x : y;
    if (v === u) return null;
    if (v > u) { if (axis === 'x') x--; else y--; }
  }
  return [x, y];
}

// The removable lines along one axis that are not next to each other, highest first.
function removableLines(entities, axis) {
  if (!entities.length) return [];
  const box = extent(entities);
  // Which entity stands on each tile, by tile index inside the extent (0: none).
  const cells = new Int32Array(box.w * box.h);
  entities.forEach((e, i) => {
    for (let dy = 0; dy < e.h; dy++) {
      const row = (e.y + dy - box.y) * box.w + e.x - box.x;
      cells.fill(i + 1, row, row + e.w);
    }
  });
  const tile = (x, y) => (x < box.x || y < box.y || x >= box.x + box.w || y >= box.y + box.h ? undefined
    : entities[cells[(y - box.y) * box.w + x - box.x] - 1]);
  const reach = inserterReach(entities).map(r => r[axis]);
  const [lo, hi] = axis === 'x' ? [box.x, box.x + box.w - 1] : [box.y, box.y + box.h - 1];
  const across = axis === 'x' ? [box.y, box.y + box.h - 1] : [box.x, box.x + box.w - 1];
  const at = (u, v) => (axis === 'x' ? tile(u, v) : tile(v, u));
  const lines = [];
  for (let u = hi - 1; u > lo; u--) {
    if (lines.length && lines.at(-1) === u + 1) continue;
    if (reach.some(([a, b]) => a <= u && u <= b)) continue;
    if (removable(u, at, axis, across[0], across[1])) lines.push(u);
  }
  return lines;
}

// Whether line u (a column for axis x, a row for y) can come out.
function removable(u, at, axis, v0, v1) {
  const along = axis === 'x' ? [E, W] : [N, S];
  const pointsAt = (e, uu, v) => e?.out === (axis === 'x' ? key(uu, v) : key(v, uu));
  for (let v = v0; v <= v1; v++) {
    const c = at(u, v), before = at(u - 1, v), after = at(u + 1, v);
    if (c) {
      if (c.kind === 'belt') {
        if (!along.includes(c.direction)) return false;
        // A machine's connection must not end up against a pipe.
        const fluidish = n => n?.kind === 'pipe' || n?.kind === 'pipe-to-ground';
        if ((fluidish(before) && after?.kind === 'building') || (fluidish(after) && before?.kind === 'building')) return false;
        continue;
      }
      if (c.kind === 'pipe') {
        // A straight run of one network: nothing joins it across the line.
        const side1 = at(u, v - 1), side2 = at(u, v + 1);
        if ([side1, side2].some(s => s?.kind === 'pipe' || s?.kind === 'pipe-to-ground')) return false;
        if (![before, after].every(n => (n?.kind === 'pipe' || n?.kind === 'pipe-to-ground') && n.route === c.route)) return false;
        continue;
      }
      return false;
    }
    // An empty tile: what lies either side of it meets.
    if (pointsAt(before, u, v) || pointsAt(after, u, v)) return false;
    const fluid = n => n?.kind === 'pipe' || n?.kind === 'pipe-to-ground';
    if (fluid(before) && fluid(after) && before.route !== after.route) return false;
    if ((fluid(before) || fluid(after)) && (before?.kind === 'building' || after?.kind === 'building')) return false;
  }
  return true;
}

// The span each inserter covers along each axis (its tile to where it picks up and drops), and
// each machine with an Output Drop (it and its drop tile): a line inside a span, or at either end
// of it, cannot come out — a drop tile stays beside its machine, and nothing moves onto it.
function inserterReach(entities) {
  const drops = entities.filter(e => e.kind === 'building' && e.drop).map(e => {
    const x = Math.floor(e.x + e.drop.x), y = Math.floor(e.y + e.drop.y);
    return { x: [Math.min(e.x, x), Math.max(e.x + e.w - 1, x)], y: [Math.min(e.y, y), Math.max(e.y + e.h - 1, y)] };
  });
  return [...drops, ...entities.filter(e => e.kind === 'inserter').flatMap(e => {
    const v = e.vectors ?? null;
    // Straight inserters reach along their direction: 1 tile (2 for long-handed) each way.
    const r = e.name.startsWith('long') ? 2 : 1;
    const xs = [e.x], ys = [e.y];
    if (v) {
      xs.push(Math.floor(e.x + 0.5 + v.pickup.x), Math.floor(e.x + 0.5 + v.drop.x));
      ys.push(Math.floor(e.y + 0.5 + v.pickup.y), Math.floor(e.y + 0.5 + v.drop.y));
    } else if (e.direction === E || e.direction === W) {
      xs.push(e.x - r, e.x + r);
    } else {
      ys.push(e.y - r, e.y + r);
    }
    return [{ x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] }];
  })];
}

// The entities off the lines (highest first, none next to another), everything past each moved
// in by one, pointers to tiles past them too: as if taken out one at a time, highest first.
function removeLines(entities, axis, lines) {
  const ascending = [...lines].reverse();
  // How many of the lines lie below v (binary search); -1 when v lies on one.
  const below = v => {
    let lo = 0, hi = ascending.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ascending[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return ascending[lo] === v ? -1 : lo;
  };
  const kept = [];
  for (const e of entities) {
    const shift = below(axis === 'x' ? e.x : e.y);
    if (shift < 0) continue;
    if (axis === 'x') e.x -= shift;
    else e.y -= shift;
    if (typeof e.out === 'string') {
      const [ox, oy] = e.out.split(',').map(Number);
      const v = axis === 'x' ? ox : oy, n = below(v);
      // A pointer onto a line taken out ends up on the tile that comes in to it.
      const moved = v - (n < 0 ? ascending.filter(u => u < v).length : n);
      e.out = axis === 'x' ? key(moved, oy) : key(ox, moved);
    }
    kept.push(e);
  }
  return kept;
}

// Minimal Pole Placement over the block's own extent, then wires and bounds. In a City Block,
// over the area inside its Buffer, round its Fixtures, joining its poles' network.
export function power(block, catalog, logistics) {
  const entities = block.entities.filter(e => e.kind !== 'pole');
  const fixtures = block.site?.fixtures ?? [];
  const grid = new Grid(block.site ? block.site.inner : extent(entities));
  for (const e of [...fixtures, ...entities]) grid.place(e);
  const consumers = entities.filter(e => e.kind === 'inserter' || (e.kind === 'building' && catalog.buildings[e.name].energy === 'electric'));
  const fixed = fixtures.filter(f => catalog.poles[f.name]).map(f => ({ ...f, spec: catalog.poles[f.name] }));
  const all = [...entities, ...placePoles(grid, consumers, catalog.poles[logistics.pole], { fixed, inside: !!block.site })];
  return { ...block, entities: all, bounds: extent(all), wires: wirePairs(all, catalog, fixtures) };
}

function clone(block) {
  const copies = new Map(block.entities.map(e => [e, { ...e }]));
  return {
    ...block,
    entities: block.entities.map(e => copies.get(e)),
    routes: block.routes.map(r => ({ ...r, pieces: r.pieces.map(p => copies.get(p) ?? { ...p }) })),
    subBlocks: block.subBlocks.map(sb => ({ ...sb, ...(sb.apart ? { apart: sb.apart.map(b => ({ ...b })) } : {}) })),
  };
}

function extent(entities) {
  let x = Infinity, y = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of entities) {
    x = Math.min(x, e.x); y = Math.min(y, e.y);
    x1 = Math.max(x1, e.x + e.w); y1 = Math.max(y1, e.y + e.h);
  }
  return { x, y, w: x1 - x, h: y1 - y };
}
