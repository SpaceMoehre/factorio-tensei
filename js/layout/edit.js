import { compose, RoutingError, PowerError } from './compose.js';
import { finishBlock } from './compact.js';
import { validateBlock } from './validity.js';
import { rankOf } from './score.js';
import { E, S, W, N, VEC, key } from './grid.js';
import { trim } from './module.js';

// The user's moves (ADR 0043): a shown Compound Block laid out again with one of its Sub-Blocks
// (its stack of copies, or a machine a Breakout stood apart) standing elsewhere, every other copy
// where it stands; every link routed again, the poles placed again.

// How far (in tiles, every way) a move goes past where the user put it, to make room for its
// links, before the Sub-Blocks in the way move instead.
const REACH = 6;
// The gaps a Sub-Block in the way is pushed off to, round the one moved.
const GAPS = [1, 2, 3];

// What it takes to lay a block out again: its copies and routes as the search prepared them
// (compose.js prepare), where each copy stood (`positions`, its module's area's top-left), each
// Sub-Block's box with the room beside its stack from its first copy (`rooms`, place.js), how its
// links were routed (compose's layout) and the lines squeezing took out of it (compact.js).
export function editOf(prepared, positions, layout, squeeze = [], rooms = positions.rooms) {
  const { until, ...rest } = layout ?? {};
  return {
    instances: prepared.instances,
    // (Without the pieces compose last placed in each slot: it places them again.)
    routes: prepared.routes.map(r => (r.slots ? { ...r, slots: r.slots.map(({ pieces, ...slot }) => slot) } : r)),
    positions: positions.map(p => ({ x: p.x, y: p.y })),
    rooms: rooms ?? [],
    layout: rest,
    squeeze: squeeze ?? [],
  };
}

// The lines a squeeze took out, as they stood before it: per axis, ascending. (Each logged line
// stands where the lines before it left it.)
function linesOut(log) {
  const out = { x: [], y: [] };
  for (const { axis, u } of log) {
    const list = out[axis];
    let v = u;
    for (const l of list) if (l <= v) v++;
    list.push(v);
    list.sort((a, b) => a - b);
  }
  return out;
}

// Where every copy stands as the block is shown (squeezed), whole: the lines squeezing took out
// between copies stay out, those through one are put back (as its module made it; everything
// past such a line stands one further out). With `whole`, every line is put back: the copies
// stand as they were routed. Returns the positions, and how many lines went back.
// A line through the end of a copy's belt or pipe beyond its machines and inserters stays out:
// the copy stands where its machines stood, that end reaching back into the corridor. Where that
// puts two copies on each other, the lines through either's pieces go back too.
export function standing(edit, { whole = false } = {}) {
  const lines = linesOut(whole ? [] : edit.squeeze);
  const tiles = copyTiles(edit);
  const span = list => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of list) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    return { x0, y0, x1, y1 };
  };
  const at = (box, p) => ({ x0: box.x0 + p.x, y0: box.y0 + p.y, x1: box.x1 + p.x, y1: box.y1 + p.y });
  const pieces = edit.instances.map((_, n) => at(span(tiles[n]), edit.positions[n]));
  const cores = edit.instances.map((inst, n) => at(span(coreTiles(inst)), edit.positions[n]));
  const through = { x: new Set(), y: new Set() };
  const back = box => {
    let more = false;
    for (const axis of ['x', 'y']) {
      for (const l of lines[axis]) {
        if (l < box[`${axis}0`] || l > box[`${axis}1`] || through[axis].has(l)) continue;
        through[axis].add(l);
        more = true;
      }
    }
    return more;
  };
  for (const box of cores) back(box);
  // (A copy moves in by the lines out before its machines.)
  const before = (list, v) => list.filter(l => l < v).length;
  for (;;) {
    const kept = { x: lines.x.filter(l => !through.x.has(l)), y: lines.y.filter(l => !through.y.has(l)) };
    const positions = edit.positions.map((p, n) => ({ x: p.x - before(kept.x, cores[n].x0), y: p.y - before(kept.y, cores[n].y0) }));
    const clash = overlapping(tiles, positions);
    // (With every line through a copy back, none stands on another: the copies keep their order.)
    if (!clash || (!clash.map(n => back(pieces[n])).some(Boolean) && !pieces.map(back).some(Boolean))) {
      return { positions, back: whole ? edit.squeeze.length : through.x.size + through.y.size };
    }
  }
}

// The two copies standing on each other at `positions`, else null.
function overlapping(tiles, positions) {
  const taken = new Map();
  for (let n = 0; n < tiles.length; n++) {
    for (const [x, y] of tiles[n]) {
      const k = key(x + positions[n].x, y + positions[n].y);
      if (taken.has(k) && taken.get(k) !== n) return [taken.get(k), n];
      taken.set(k, n);
    }
  }
  return null;
}

// The tiles pieces stand on, from the position of their copy (its module's area's top-left).
function tilesOf(pieces, area) {
  const out = [];
  for (const e of pieces) {
    for (let dx = 0; dx < (e.w ?? 1); dx++) for (let dy = 0; dy < (e.h ?? 1); dy++) out.push([e.x - area.x + dx, e.y - area.y + dy]);
  }
  return out;
}

// The tiles a copy's machines and inserters stand on.
const coreTiles = inst => tilesOf(inst.module.entities, inst.module.area);

// The tiles each copy's pieces stand on: its machines and inserters, its pipes, and its belts as
// the Compound Block trims them (compose.js).
const tileCache = new WeakMap();
function copyTiles(edit) {
  if (tileCache.has(edit)) return tileCache.get(edit);
  const out = edit.instances.map(inst => [...coreTiles(inst), ...inst.module.fluids.flatMap(f => tilesOf(f.pieces, inst.module.area))]);
  for (const route of edit.routes.filter(r => r.kind === 'belt')) {
    route.slots.forEach((slot, k) => {
      const own = trim(slot.part, {
        head: k === 0 && route.source !== 'side-input' && route.fedFrom === undefined,
        tail: k === route.slots.length - 1 && route.sink !== 'side-output' && !route.fanOut && !route.supplyEnd,
      }, 'belt');
      out[slot.inst.index].push(...tilesOf(own, slot.inst.module.area));
    });
  }
  tileCache.set(edit, out);
  return out;
}

// Lays the block out again with copies moved (`move`: { step, inst (a machine stood apart: that
// copy alone, else the Sub-Block's stack), dx, dy }, in tiles). The links are routed as before
// (the same order and splitters); where they find no way, or the block would starve more (or
// feed a Recipe Loop by train, or let a byproduct ride on) than before, the copies move a little
// further — the least way first, up to REACH tiles, never onto another Sub-Block — and where
// none of those works, the Sub-Blocks in the way move off instead (each way, as little as gives
// the moved one a gap round it; those they would run into with them).
// Yields { type: 'trying', tried } before each layout it tries; returns { block (with its own
// `edit`), at ({ dx, dy }: where the copies went, as `move` counts), pushed ([{ step, inst?, dx,
// dy }]: the Sub-Blocks moved off), back (lines squeezing had taken out that went back), score,
// tried }, or { failure, tried }.
// options: { score (the block's rank, score.js), deadline, now, reach (how far past where it was
//            put a move goes: REACH) }
export function* moveCopies(ctx, edit, move, options = {}) {
  const { catalog, logistics, site = null } = ctx;
  const now = options.now ?? (() => Date.now());
  const deadline = options.deadline ?? Infinity;
  const reach = options.reach ?? REACH;
  const { instances } = edit;
  const prepared = { instances, routes: edit.routes };
  // What moves together: a Sub-Block's stack, or one machine stood apart.
  const units = [];
  for (const inst of instances) {
    if (inst.detached) units.push({ step: inst.step, inst: inst.index, members: [inst.index] });
    else {
      const stack = units.find(u => u.step === inst.step && u.inst === undefined);
      if (stack) stack.members.push(inst.index);
      else units.push({ step: inst.step, members: [inst.index] });
    }
  }
  const mover = units.find(u => (move.inst !== undefined && instances[move.inst]?.detached ? u.inst === move.inst : u.step === move.step && u.inst === undefined));
  if (!mover) return { failure: new Error('nothing to move there'), tried: 0 };
  const rel = copyTiles(edit);
  const fixtures = new Set();
  for (const f of site?.fixtures ?? []) for (let dx = 0; dx < f.w; dx++) for (let dy = 0; dy < f.h; dy++) fixtures.add(key(f.x + dx, f.y + dy));
  const inside = (x, y) => !site || (x >= site.inner.x && y >= site.inner.y && x < site.inner.x + site.inner.w && y < site.inner.y + site.inner.h);
  const tilesAt = (unit, positions) => unit.members.flatMap(n => rel[n].map(([x, y]) => [x + positions[n].x, y + positions[n].y]));
  // A unit's box: a stack's with the room beside it, a machine apart's its module's.
  const boxOf = (unit, positions) => {
    const room = unit.inst === undefined ? edit.rooms[unit.step] : null;
    if (room) return { x: positions[room.inst].x + room.x, y: positions[room.inst].y + room.y, w: room.w, h: room.h };
    const { area } = instances[unit.members[0]].module;
    return { ...positions[unit.members[0]], w: area.w, h: area.h };
  };
  const shifted = (positions, unit, dx, dy) => {
    const out = positions.map(p => ({ ...p }));
    for (const n of unit.members) out[n] = { x: positions[n].x + dx, y: positions[n].y + dy };
    return out;
  };

  let tried = 0;
  // Each layout tried: null where its links find no way (or it is not valid).
  const attempt = positions => {
    tried++;
    const boxes = units.map(u => boxOf(u, positions));
    const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
    const bounds = { x: x0, y: y0, w: Math.max(...boxes.map(b => b.x + b.w)) - x0, h: Math.max(...boxes.map(b => b.y + b.h)) - y0 };
    try {
      const composed = compose(ctx, prepared, Object.assign(positions.map(p => ({ ...p })), { bounds }), { ...edit.layout, until: () => now() > deadline });
      const block = finishBlock(composed, catalog, logistics, { squeeze: false });
      if (validateBlock(block, catalog, logistics).length) return null;
      block.edit = editOf(prepared, positions, edit.layout, [], edit.rooms);
      return { block, score: rankOf(block) };
    } catch (e) {
      if (!(e instanceof RoutingError || e instanceof PowerError)) throw e;
      return null;
    }
  };
  // As good as before: starving no more, no more Recipe Loops fed by train, no more byproducts
  // riding on.
  const before = options.score ?? null;
  const asGood = score => !before || compare(score.slice(0, 3), before.slice(0, 3)) <= 0;

  let frame = standing(edit);
  let fallback = null;
  // Where the copies may stand, for `positions`: on no other copy or Fixture, inside the City
  // Block; `apart`, nowhere next to another's either.
  // (Only the moved copies move while it looks close by: what the others take, once a frame.)
  const takenIn = new Map();
  const free = (positions, apart) => {
    if (!takenIn.has(frame)) {
      const taken = new Set();
      for (const u of units) if (u !== mover) for (const [x, y] of tilesAt(u, frame.positions)) taken.add(key(x, y));
      takenIn.set(frame, taken);
    }
    const taken = takenIn.get(frame);
    return tilesAt(mover, positions).every(([x, y]) => inside(x, y) && !fixtures.has(key(x, y)) && !taken.has(key(x, y))
      && (!apart || Object.values(VEC).every(([dx, dy]) => !taken.has(key(x + dx, y + dy)))));
  };
  // The layouts to try, in turn: where the user put it, then further each way, then the
  // Sub-Blocks in the way pushed off.
  function* candidates() {
    const base = frame.positions;
    const drop = shifted(base, mover, move.dx, move.dy);
    if (free(drop, false)) yield { positions: drop, at: { dx: move.dx, dy: move.dy }, pushed: [] };
    const near = [];
    for (let ox = -reach; ox <= reach; ox++) {
      for (let oy = -reach; oy <= reach; oy++) {
        if ((ox || oy) && ox * ox + oy * oy <= reach * reach) near.push([ox, oy]);
      }
    }
    near.sort((a, b) => a[0] ** 2 + a[1] ** 2 - b[0] ** 2 - b[1] ** 2 || Math.abs(a[0] * a[1]) - Math.abs(b[0] * b[1]));
    for (const [ox, oy] of near) {
      const positions = shifted(base, mover, move.dx + ox, move.dy + oy);
      if (free(positions, true)) yield { positions, at: { dx: move.dx + ox, dy: move.dy + oy }, pushed: [] };
    }
    yield* pushes(drop);
  }
  // The Sub-Blocks in the way of the moved one, standing at `drop`, pushed off one way each, as
  // far as leaves a gap round it (its box with the room beside its stack), and those they would
  // run into with them, as far: the fewest tiles moved first.
  function* pushes(drop) {
    const target = boxOf(mover, drop);
    const options = [];
    for (const gap of GAPS) {
      const room = { x: target.x - gap, y: target.y - gap, w: target.w + 2 * gap, h: target.h + 2 * gap };
      const within = ([x, y]) => x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h;
      const hit = units.filter(u => u !== mover && tilesAt(u, drop).some(within));
      if (!hit.length) continue;
      for (const dir of [E, S, W, N]) {
        const [vx, vy] = VEC[dir];
        // How far a unit goes for its tiles to clear the room (those beside it need not).
        const clear = u => {
          let most = 0;
          for (const [x, y] of tilesAt(u, drop)) {
            if (vx && (y < room.y || y >= room.y + room.h)) continue;
            if (vy && (x < room.x || x >= room.x + room.w)) continue;
            const need = vx > 0 ? room.x + room.w - x : vx < 0 ? x - room.x + 1 : vy > 0 ? room.y + room.h - y : y - room.y + 1;
            most = Math.max(most, need);
          }
          return most;
        };
        const k = Math.max(...hit.map(clear));
        if (!(k > 0)) continue;
        // (One it comes next to that it stood apart from, or runs into, goes with it.)
        const pushed = new Set(hit);
        let positions = drop;
        const around = list => {
          const out = new Set();
          for (const [x, y] of list) for (let ax = -1; ax <= 1; ax++) for (let ay = -1; ay <= 1; ay++) out.add(key(x + ax, y + ay));
          return out;
        };
        for (let grew = true; grew;) {
          grew = false;
          positions = drop;
          for (const u of pushed) positions = shifted(positions, u, k * vx, k * vy);
          const was = around([...pushed].flatMap(u => tilesAt(u, drop)));
          const own = new Set([...pushed].flatMap(u => tilesAt(u, positions)).map(([x, y]) => key(x, y)));
          const after = around([...pushed].flatMap(u => tilesAt(u, positions)));
          for (const u of units) {
            if (u === mover || pushed.has(u)) continue;
            const tiles = tilesAt(u, positions).map(([x, y]) => key(x, y));
            if (tiles.some(t => own.has(t)) || (tiles.some(t => after.has(t)) && !tiles.some(t => was.has(t)))) {
              pushed.add(u);
              grew = true;
            }
          }
        }
        const moved = [...pushed];
        if (moved.some(u => tilesAt(u, positions).some(([x, y]) => !inside(x, y) || fixtures.has(key(x, y))))) continue;
        options.push({
          positions, at: { dx: move.dx, dy: move.dy }, cost: k * moved.length,
          pushed: moved.map(u => ({ step: u.step, ...(u.inst !== undefined ? { inst: u.inst } : {}), dx: k * vx, dy: k * vy })),
        });
      }
    }
    options.sort((a, b) => a.cost - b.cost);
    yield* options;
  }

  const off = at => Math.hypot(at.dx - move.dx, at.dy - move.dy);
  // Whether the block, squeezed, routes as it stands at all: checked once a layout finds no way
  // (a squeeze can leave corridors too narrow to lay its links again).
  let checked = frame.back >= edit.squeeze.length;
  const AGAIN = Symbol('again');
  const run = function* () {
    for (const c of candidates()) {
      if (now() > deadline) return null;
      // (One routed, though it starves more: one that does not only a little further on.)
      if (fallback && (c.pushed.length || off(c.at) > off(fallback.at) + 2)) return null;
      yield { type: 'trying', tried, at: c.at, pushed: c.pushed };
      const out = attempt(c.positions);
      if (!out) {
        if (checked) continue;
        checked = true;
        yield { type: 'trying', tried, at: { dx: 0, dy: 0 }, pushed: [] };
        if (attempt(frame.positions)) continue;
        // (It does not: laid out as it was routed, every line back.)
        frame = standing(edit, { whole: true });
        return AGAIN;
      }
      const found = { ...out, at: c.at, pushed: c.pushed, back: frame.back, tried };
      if (asGood(out.score)) return found;
      if (!fallback || compare(out.score.slice(0, 3), fallback.score.slice(0, 3)) < 0) fallback = found;
    }
    return null;
  };
  let found = yield* run();
  if (found === AGAIN) found = yield* run();
  const kept = (found === AGAIN ? null : found) ?? fallback;
  if (kept) return { ...kept, tried };
  const drop = shifted(frame.positions, mover, move.dx, move.dy);
  const why = now() > deadline ? 'out of time laying it out there'
    : tilesAt(mover, drop).some(([x, y]) => !inside(x, y)) ? 'there it would stand outside the city block'
      : 'its belts and pipes find no way there, nor close by';
  return { failure: new RoutingError(why), tried };
}

function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}
