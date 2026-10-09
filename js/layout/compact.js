import { Grid, N, E, S, W, VEC, key, opposite } from './grid.js';
import { placePoles, PowerError } from './poles.js';
import { wirePairs } from './wires.js';

// Squeezes a routed Compound Block: every column (and row) that holds nothing but belts and
// pipes running straight across it, and empty tiles, comes out, and everything beyond moves in
// by one. Belts and pipes just get shorter; tunnels too. A column stays when removing it would
// join what must stay apart (a belt pointing into the gap, two pipes, an inserter's reach), or
// when it holds anything else. Straight pipe runs then go underground, and poles are placed on
// the result. Returns a new block.
// A block in a City Block is not squeezed: its Fixtures stay where they are, and so does the rest.
export function finishBlock(block, catalog, logistics) {
  const bury = b => buryPipes(b, catalog, logistics);
  if (block.site) return power(bury(clone(block)), catalog, logistics);
  const squeezed = compact(block);
  try {
    return power(bury(squeezed), catalog, logistics);
  } catch (e) {
    if (!(e instanceof PowerError)) throw e;
    // Squeezing took the room a pole needed: power the block as routed.
    return power(bury(clone(block)), catalog, logistics);
  }
}

// Three plain pipes or more in a straight line go underground (ADR 0021): a run of pipes that
// each join only the pipe (or machine connection) before and after them on one line, no branch
// and no machine beside them, becomes a pipe-to-ground at each end, facing out, and nothing in
// between; as many tunnels as the pipe-to-ground's reach needs. A run that a tunnel of another
// network crosses along its line stays above ground. Changes the block in place.
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
  if (!removed.size) return block;
  block.entities = block.entities.filter(e => !removed.has(e));
  for (const r of block.routes) if (r.kind === 'pipe') r.pieces = r.pieces.filter(p => !removed.has(p));
  return block;
}

export function compact(block) {
  const out = clone(block);
  const { entities, log } = squeezeEntities(out.entities);
  const kept = new Set(entities);
  out.entities = entities;
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
