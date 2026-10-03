import { stacked } from './compose.js';
import { RoutingError } from './router.js';
import { VEC, E } from './grid.js';
import { SQUARE } from './score.js';

// Where each copy of each module stands in the Compound Block. Belts run west to east through
// every module, so a Sub-Block stands west of the ones it feeds. Sub-Blocks are placed from the
// Goals westward (bottom-up in reverse: consumers first), each as far east as its consumers
// allow, level with the entries of the belts it feeds; where that spot is taken it slides west,
// up or down, whichever grows the block least and keeps its links short, and it keeps clear of
// the rows other Sub-Blocks' Side Inputs arrive on. Corridors between a Sub-Block and its
// consumers hold the links. Returns each copy's top-left corner (its module's area).
// Machines broken out of a Sub-Block (Breakout) are placed last, each in a gap of the rest.
// params: { corridor, gap, stack, order: { [step]: number } (nudges the placing order),
//           lift: { [step]: number } (nudges a Sub-Block up or down), weight (link length cost),
//           spot: { [step]: number } (the broken-out machines' next best spots: 1, 2, …) }
// In a City Block (ctx.site) everything stands inside its Buffer, placed from its east edge (the
// Goals) and then slid west as far as it fits, and no machine, belt or pipe stands on a Fixture
// (a Fixture may stand in a box's empty tiles); where nothing fits it throws a RoutingError.
export function placeBlocks(ctx, prepared, params = {}) {
  const { plan } = ctx;
  const { instances, routes } = prepared;
  const { corridor = 2, gap = 1, stack = 0, weight = 4 } = params;
  const steps = plan.map((_, i) => i);
  const site = ctx.site && siteRules(ctx.site);

  // Each Sub-Block's copies stacked: their offsets inside the block, and the block's size. Copies
  // touch unless their facing edges would join what must stay apart.
  // Beside a stack of copies: a column against it, a lane (two columns) for each belt snaking
  // through them (it turns on both sides), and room for a trunk joining each fluid's pipes (inputs
  // west, outputs east).
  const turns = steps.map(i => routes.filter(r => r.kind === 'belt' && r.slots.some((slot, k) => k > 0
    && slot.inst.step === i && stacked(r.slots[k - 1].inst, slot.inst))).length);
  const trunks = (i, side) => routes.filter(r => r.kind === 'pipe' && r.stubs.filter(st => st.inst.step === i && !st.inst.detached && st.side === side).length > 1).length;
  // Many copies stand in several columns (compose.js decides which), so the Sub-Block comes out
  // about square: the odd columns bottom to top, hanging from the bottom. Copies of later
  // columns get their own belts through gaps left between the copies of earlier ones.
  const solo = i => routes.filter(r => r.kind === 'belt' && r.slots.length === 1 && r.slots[0].inst.step === i).length;
  const blocks = steps.map(i => {
    const mine = instances.filter(inst => inst.step === i && !inst.detached);
    const copies = mine.length > 1;
    const padW = copies ? 2 * turns[i] + 2 + 3 * trunks(i, 'W') : 0, padE = copies ? 2 * turns[i] + 2 + 3 * trunks(i, 'E') : 0;
    const mw = Math.max(...mine.map(inst => inst.module.area.w)) + padW + padE;
    const columns = Math.max(...mine.map(inst => inst.columns ?? 1));
    const cross = columns > 1 ? Math.min(6, Math.ceil(solo(i) / mine.length) * (columns - 1)) : 0;
    // Above copies in columns, rows for each fluid's trunks to cross from column to column.
    const over = columns > 1 ? 2 * (trunks(i, 'W') + trunks(i, 'E')) : 0;
    const at = new Map();
    let h = 0;
    const columnOf = c => mine.filter(inst => (inst.column ?? 0) === c);
    for (let c = 0; c < columns; c++) {
      const order = c % 2 ? [...columnOf(c)].reverse() : columnOf(c);
      let y = 0;
      order.forEach((inst, k) => {
        if (k > 0) y += Math.max(stack, cross, clash(order[k - 1].module, inst.module) ? 1 : 0);
        at.set(inst.index, { x: c * (mw + cross) + padW, y: y + over });
        y += inst.module.area.h;
      });
      h = Math.max(h, y + over);
    }
    for (let c = 1; c < columns; c += 2) {
      const column = columnOf(c);
      const used = Math.max(...column.map(inst => at.get(inst.index).y + inst.module.area.h));
      for (const inst of column) at.get(inst.index).y += h - used;
    }
    // East of a Recipe Loop's producer, room for the splitters sending its feedback off; east of
    // the Sub-Block it feeds back into, room for the feedback to come down to its entries.
    const taps = Math.max(0, ...routes.filter(r => r.taps && r.source === i).map(r => r.taps.length));
    const tapRoom = taps ? 3 + 2 * taps : 0;
    const loopRoom = routes.some(r => r.tapOf !== undefined && r.consumers.includes(i)) ? 2 : 0;
    // Room the search made round it (`pad`: tiles on every side) where a link found none.
    const pad = params.pad?.[i] ?? 0;
    for (const p of at.values()) {
      p.x += pad;
      p.y += pad;
    }
    return { step: i, instances: mine, at, w: columns * mw + (columns - 1) * cross + tapRoom + loopRoom + 2 * pad, h: h + 2 * pad, entries: [] };
  });
  // Links from a producer's exit to a consumer's entry, by where each sits in its block; and the
  // rows each block's Side Inputs arrive on.
  // (Broken-out machines are left out: the belt on either side of one links its neighbours.)
  const links = [];
  for (const route of routes.filter(r => r.kind === 'belt')) {
    const slots = route.slots.filter(slot => !slot.inst.detached);
    slots.forEach((slot, k) => {
      const at = blocks[slot.inst.step].at.get(slot.inst.index).y;
      if (slot === route.slots[0] && route.source === 'side-input') blocks[slot.inst.step].entries.push(at + entryY(slot));
      const next = slots[k + 1];
      if (!next || next.inst.step === slot.inst.step) return;
      links.push({
        from: slot.inst.step, to: next.inst.step, fromY: at + exitY(slot),
        toY: blocks[next.inst.step].at.get(next.inst.index).y + entryY(next),
      });
    });
  }
  for (const route of routes.filter(r => r.kind === 'pipe')) {
    for (const stub of route.stubs.filter(st => !st.inst.detached)) {
      const at = blocks[stub.inst.step].at.get(stub.inst.index).y + stub.y - stub.inst.module.area.y;
      if (route.source === 'side-input' && stub.side === 'W') blocks[stub.inst.step].entries.push(at);
      if (typeof route.source !== 'number' || stub.inst.step !== route.source || stub.side !== 'E') continue;
      for (const to of route.stubs.filter(s => s.inst.step !== route.source && s.side === 'W' && !s.inst.detached)) {
        links.push({ from: route.source, to: to.inst.step, fromY: at, toY: blocks[to.inst.step].at.get(to.inst.index).y + to.y - to.inst.module.area.y });
      }
    }
  }

  // Consumers before producers: a Sub-Block's depth is one more than its furthest consumer's.
  const consumersOf = i => [...new Set(links.filter(l => l.from === i).map(l => l.to))];
  const depth = new Map();
  const depthOf = (i, seen = new Set()) => {
    if (depth.has(i)) return depth.get(i);
    if (seen.has(i)) return 0;
    seen.add(i);
    const d = Math.max(0, ...consumersOf(i).map(j => 1 + depthOf(j, seen)));
    depth.set(i, d);
    return d;
  };
  steps.forEach(i => depthOf(i));
  const order = [...steps].sort((a, b) => depth.get(a) - depth.get(b) || (params.order?.[a] ?? 0) - (params.order?.[b] ?? 0)
    || links.filter(l => l.from === b).length - links.filter(l => l.from === a).length || a - b);

  const placed = new Map();
  const tileSets = new Map();
  const box = i => ({ x: placed.get(i).x, y: placed.get(i).y, w: blocks[i].w, h: blocks[i].h });
  const overlaps = (a, b, g) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
  const bounds = extra => {
    const all = [...[...placed.keys()].map(box), ...(extra ? [extra] : [])];
    if (!all.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x0 = Math.min(...all.map(b => b.x)), y0 = Math.min(...all.map(b => b.y));
    return { x: x0, y: y0, w: Math.max(...all.map(b => b.x + b.w)) - x0, h: Math.max(...all.map(b => b.y + b.h)) - y0 };
  };
  // In a City Block, the search's `layers` candidates stand the Sub-Blocks in columns instead.
  const columns = site && params.layers ? inLayers(blocks, links, depth, routes, site, { corridor, gap, spread: params.layers }, blockTiles) : null;
  if (site && params.layers && !columns) throw new RoutingError('the Sub-Blocks fit no columns in the city block');
  for (const [i, p] of columns ?? []) placed.set(i, p);
  for (const i of columns ? [] : order) {
    const b = blocks[i];
    // A Sub-Block the search moved into empty room (`at`, where its box stands) stands there, when
    // it is clear of the others (and, in a City Block, fits).
    const wanted = params.at?.[i];
    if (wanted) {
      const me = { ...wanted, w: b.w, h: b.h };
      if (![...placed.keys()].some(j => overlaps(me, box(j), gap)) && (!site || site.fits(blockTiles(i), me))) {
        placed.set(i, { x: wanted.x, y: wanted.y });
        continue;
      }
    }
    const mine = links.filter(l => l.from === i && placed.has(l.to));
    const lift = params.lift?.[i] ?? 0;
    // Level with the entries it feeds; west of every consumer, with a corridor between.
    const ty = mine.length ? Math.round(mine.reduce((sum, l) => sum + placed.get(l.to).y + l.toY - l.fromY, 0) / mine.length) + lift : null;
    const east = mine.length ? Math.min(...mine.map(l => placed.get(l.to).x)) - corridor - b.w : null;
    const all = bounds();
    // With nothing to feed here (a Goal), below the Goals already placed (in a City Block,
    // against its east edge).
    const right = site ? site.inner.x + site.inner.w : all.x + all.w;
    const start = ty === null
      ? { x: placed.size || site ? right - b.w : 0, y: placed.size ? all.y + all.h + gap + 1 : site ? site.inner.y : 0 }
      : { x: east, y: ty };
    const candidates = [start];
    for (const j of placed.keys()) {
      const o = box(j);
      candidates.push({ x: Math.min(start.x, o.x - gap - 1 - b.w), y: start.y });
      candidates.push({ x: start.x, y: o.y - gap - 1 - b.h }, { x: start.x, y: o.y + o.h + gap + 1 });
      candidates.push({ x: Math.min(start.x, o.x - gap - 1 - b.w), y: o.y }, { x: Math.min(start.x, o.x - gap - 1 - b.w), y: o.y + o.h - b.h });
    }
    // In a City Block also beside its Fixtures and against its edges.
    if (site) {
      const { inner } = site;
      for (const f of site.fixtures) {
        candidates.push({ x: Math.min(start.x, f.x - 1 - b.w), y: start.y }, { x: start.x, y: f.y - 1 - b.h }, { x: start.x, y: f.y + f.h + 1 });
      }
      candidates.push({ x: start.x, y: inner.y }, { x: start.x, y: inner.y + inner.h - b.h });
    }
    // The spot that grows the block least, keeps its links short and keeps off the rows other
    // Sub-Blocks' Side Inputs arrive on (west of their consumers unless `anywhere`).
    // (What stands placed is taken once, not for each of the many spots a City Block offers: each
    // box with the rows its Side Inputs arrive on, their bounds, where the links' consumers are.)
    const pick = (spots, anywhere = false) => {
      const boxes = [...placed.keys()].map(j => ({ ...box(j), entries: blocks[j].entries.map(e => placed.get(j).y + e) }));
      const targets = mine.map(l => ({ x: placed.get(l.to).x, y: placed.get(l.to).y + l.toY - l.fromY }));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const o of boxes) [x0, y0, x1, y1] = [Math.min(x0, o.x), Math.min(y0, o.y), Math.max(x1, o.x + o.w), Math.max(y1, o.y + o.h)];
      const tiles = site ? blockTiles(i) : null;
      let best = null;
      for (const c of spots) {
        const me = { x: c.x, y: c.y, w: b.w, h: b.h };
        if (boxes.some(o => overlaps(me, o, gap))) continue;
        let back = 0;
        for (const t of targets) back += Math.max(0, c.x + b.w + 1 - t.x);
        if (back && !anywhere) continue;
        if (site && !site.fits(tiles, me)) continue;
        const gw = Math.max(x1, c.x + b.w) - Math.min(x0, c.x), gh = Math.max(y1, c.y + b.h) - Math.min(y0, c.y);
        // Standing on its own, the block grows toward a square (Compactness): the strip it has
        // beyond one counts too.
        const grown = gw * gh + (site ? 0 : SQUARE * Math.abs(gw - gh) * Math.min(gw, gh));
        let length = 0;
        for (const t of targets) length += Math.abs(t.x - (c.x + b.w)) + Math.abs(t.y - c.y);
        // Side Inputs of Sub-Blocks already placed arrive from the west: keep off their rows.
        let blocking = 0;
        for (const o of boxes) if (o.x >= c.x + b.w) for (const y of o.entries) if (y >= c.y - 1 && y <= c.y + b.h) blocking++;
        // A link running back west goes round both boxes.
        const cost = grown + weight * (length + 2 * back + (back ? 8 : 0)) + 40 * blocking;
        if (!best || cost < best.cost) best = { ...c, cost };
      }
      return best;
    };
    // In a City Block, where none of those fits: every spot inside it, west of the consumers
    // first.
    const best = pick(candidates) ?? (site && (pick(site.spots(b)) ?? pick(site.spots(b), true)));
    if (!best) throw new RoutingError(`no room for ${plan[i].item} in the city block`);
    placed.set(i, { x: best.x, y: best.y });
  }
  // In a City Block, the whole block slides west as far as it fits: the Side Inputs, its many
  // belts, come in short; only its outputs run on to the east edge.
  // Where each Sub-Block was placed, as `at` takes it.
  const unslid = new Map([...placed].map(([i, p]) => [i, { ...p }]));
  if (site) {
    const slack = Math.min(...steps.map(i => placed.get(i).x)) - site.inner.x;
    for (let dx = slack; dx > 0; dx--) {
      if (!steps.every(i => site.fits(blockTiles(i), { ...box(i), x: placed.get(i).x - dx }))) continue;
      for (const i of steps) placed.get(i).x -= dx;
      break;
    }
  }

  // Refinement's slides move Sub-Blocks bodily (`shift`); their bounds stay where they were placed.
  const moved = i => {
    const [dx, dy] = params.shift?.[i] ?? [0, 0];
    return { x: placed.get(i).x + dx, y: placed.get(i).y + dy };
  };
  const positions = [];
  for (const b of blocks) {
    const at = moved(b.step);
    for (const inst of b.instances) positions[inst.index] = { x: at.x + b.at.get(inst.index).x, y: at.y + b.at.get(inst.index).y };
  }
  const boxes = blocks.map(b => ({ ...placed.get(b.step), w: b.w, h: b.h }));
  // A slide may take a Sub-Block out of the City Block or onto a Fixture.
  if (site) {
    for (const b of blocks) {
      if (!site.fits(blockTiles(b.step), { ...moved(b.step), w: b.w, h: b.h })) throw new RoutingError(`${plan[b.step].item} does not fit there in the city block`);
    }
  }
  boxes.push(...placeApart(prepared, positions, blocks, moved, links, params, site));
  // Shifted to start at 0,0 (in a City Block, where they stand); `bounds` covers every Sub-Block
  // with the room beside its stack.
  const x0 = site ? 0 : Math.min(...boxes.map(b => b.x)), y0 = site ? 0 : Math.min(...boxes.map(b => b.y));
  /** @type {any} */
  const out = positions.map(p => ({ x: p.x - x0, y: p.y - y0 }));
  const left = Math.min(...boxes.map(b => b.x)) - x0, top = Math.min(...boxes.map(b => b.y)) - y0;
  out.bounds = {
    x: left, y: top, w: Math.max(...boxes.map(b => b.x + b.w)) - x0 - left, h: Math.max(...boxes.map(b => b.y + b.h)) - y0 - top,
  };
  // Each Sub-Block's box where `at` would place it (its slide included), for the search to find
  // empty room by.
  out.boxes = blocks.map(b => {
    const [dx, dy] = params.shift?.[b.step] ?? [0, 0];
    const p = unslid.get(b.step) ?? placed.get(b.step);
    return { step: b.step, x: p.x + dx, y: p.y + dy, w: b.w, h: b.h };
  });
  return out;

  // Tiles of a Sub-Block's stack that no Fixture may stand on, by where they lie in its box.
  function blockTiles(i) {
    if (!tileSets.has(i)) {
      const set = new Set();
      for (const inst of blocks[i].instances) {
        const o = blocks[i].at.get(inst.index);
        for (const [x, y] of coveredBy(inst.module)) set.add(tileKey(x + o.x, y + o.y));
      }
      tileSets.set(i, set);
    }
    return tileSets.get(i);
  }
}

// Layers, in a City Block: the Sub-Blocks in columns, the Goals easternmost and every producer in
// a column west of all it feeds; each column's Sub-Blocks stacked top to bottom a gap apart, each
// as near level with the rows its links meet as the others let it, aligned to the column's east
// side; columns a corridor apart, wider for the links turning in it. Of the ways to put the
// Sub-Blocks in columns — each as far east as its consumers let it, or up to `spread` columns
// further west — the one is taken that fits the City Block (no column taller than its room with a
// row for every belt crossing it: links passing through, Side Inputs to the columns east of it,
// outputs from the columns west of it) and spans the least. The search places greedily
// otherwise; that can leave no room for a Sub-Block placed late where columns would fit them all.
// Returns each Sub-Block's top-left corner, or null when no way fits.
function inLayers(blocks, links, depth, routes, site, { corridor, gap, spread }, tilesOf) {
  const { inner } = site;
  const steps = blocks.map(b => b.step);
  // Consumers first, so each Sub-Block's column follows from its consumers'.
  const order = [...steps].sort((a, b) => depth.get(a) - depth.get(b) || a - b);
  const feeds = new Map(steps.map(i => [i, [...new Set(links.filter(l => l.from === i && l.to !== i).map(l => l.to))]]));
  const outputs = new Map(steps.map(i => [i, routes.filter(r => r.kind === 'belt' && r.sink === 'side-output' && r.slots.at(-1).inst.step === i).length]));
  const col = new Map();
  // The columns in use, east to west, with their Sub-Blocks, widths, heights and crossing belts.
  const shape = cols => {
    const used = [...new Set(cols.values())].sort((a, b) => a - b);
    const k = new Map(used.map((c, n) => [c, n]));
    const members = used.map(c => steps.filter(i => cols.get(i) === c));
    const width = members.map(list => Math.max(...list.map(i => blocks[i].w)));
    const height = members.map(list => list.reduce((sum, i) => sum + blocks[i].h, 0) + gap * (list.length - 1));
    // Belts turning in the corridor west of each column, and crossing each column.
    const turning = used.map(() => 0), crossing = used.map(() => 0);
    for (const l of links) {
      const a = k.get(cols.get(l.to)), b = k.get(cols.get(l.from));
      for (let n = a; n < b; n++) turning[n]++;
      for (let n = a + 1; n < b; n++) crossing[n]++;
    }
    for (const i of steps) {
      for (let n = k.get(cols.get(i)) + 1; n < used.length; n++) crossing[n] += blocks[i].entries.length;
      for (let n = 0; n < k.get(cols.get(i)); n++) crossing[n] += outputs.get(i);
    }
    const lanes = n => corridor + Math.floor(turning[n] / 2);
    const span = width.reduce((sum, w) => sum + w, 0) + width.slice(1).reduce((sum, _, n) => sum + lanes(n), 0);
    return { members, width, height, crossing, lanes, span };
  };
  const fitting = [];
  const assign = n => {
    if (n === order.length) {
      const s = shape(col);
      if (s.span > inner.w || s.height.some((h, k) => h + s.crossing[k] > inner.h)) return;
      const tall = Math.max(...s.height.map((h, k) => h + s.crossing[k]));
      fitting.push({ cost: s.span * tall + 40 * s.crossing.reduce((sum, c) => sum + c, 0), cols: new Map(col) });
      return;
    }
    const i = order[n];
    const lo = Math.max(0, ...feeds.get(i).map(q => (col.has(q) ? col.get(q) + 1 : 0)));
    for (let c = lo; c <= lo + spread; c++) {
      col.set(i, c);
      assign(n + 1);
    }
    col.delete(i);
  };
  assign(0);
  // The ways that fit, least spanning first, until one stands clear of the Fixtures.
  fitting.sort((a, b) => a.cost - b.cost);
  for (const { cols } of fitting.slice(0, site.fixtures.length ? 24 : 1)) {
    const at = stand(cols);
    if (at) return at;
  }
  return null;

  // The columns placed from the east edge west, each a corridor from the last; in a City Block
  // with Fixtures, a column moves on west (as far as the room left lets it) to where its
  // Sub-Blocks stand clear of them.
  function stand(cols) {
    const { members, width, lanes, span } = shape(cols);
    const at = new Map();
    let x = inner.x + inner.w, slack = inner.w - span;
    for (const [n, list] of members.entries()) {
      x -= width[n] + (n > 0 ? lanes(n - 1) : 0);
      let d = 0, done = null;
      for (; d <= slack && !done; d++) done = column(list, x - d, width[n], at);
      if (!done) return null;
      x -= d - 1;
      slack -= d - 1;
      for (const [i, p] of done) at.set(i, p);
    }
    return at;

    // A column's Sub-Blocks with its west side at cx: each level with what it feeds (the Goals
    // at the top), pushed apart and into the room, then up or down to the nearest spot clear of
    // the Fixtures and the others. Null when one finds none.
    function column(list, cx, w, placed) {
      const want = i => {
        const mine = links.filter(l => l.from === i && placed.has(l.to));
        return mine.length ? Math.round(mine.reduce((sum, l) => sum + placed.get(l.to).y + l.toY - l.fromY, 0) / mine.length) : inner.y;
      };
      const items = list.map(i => ({ i, y: want(i), h: blocks[i].h, x: cx + w - blocks[i].w })).sort((a, b) => a.y - b.y || a.i - b.i);
      let bottom = inner.y - gap;
      for (const it of items) bottom = (it.y = Math.max(it.y, bottom + gap)) + it.h;
      let top = inner.y + inner.h + gap;
      for (const it of [...items].reverse()) top = it.y = Math.min(it.y, top - gap - it.h);
      if (items[0].y < inner.y) return null;
      const boxOf = (it, y = it.y) => ({ x: it.x, y, w: blocks[it.i].w, h: it.h });
      for (const it of items) {
        const clear = y => site.fits(tilesOf(it.i), boxOf(it, y)) && items.every(o => o === it || y + it.h + gap <= o.y || o.y + o.h + gap <= y);
        if (clear(it.y)) continue;
        let moved = null;
        for (let d = 1; d < inner.h && moved === null; d++) for (const y of [it.y - d, it.y + d]) if (moved === null && clear(y)) moved = y;
        if (moved === null) return null;
        it.y = moved;
      }
      return new Map(items.map(it => [it.i, { x: it.x, y: it.y }]));
    }
  }
}

// Breakout: each machine broken out of its Sub-Block stands in the spot, clear of every box
// placed so far by `gap` and of the corridors the links between Sub-Blocks take, that grows the
// block least and keeps its own links short (`weight` per tile, a belt running back west
// costing more); `spot` picks the next best spots instead, and slides (`shift` of `a<step>`)
// move them on. Fills in their positions; returns their boxes.
// moved(step): where a Sub-Block's box stands. In a City Block, only spots inside it whose tiles
// no Fixture stands on.
function placeApart(prepared, positions, blocks, moved, links, params, site) {
  const { instances, routes } = prepared;
  const apart = instances.filter(inst => inst.detached);
  if (!apart.length) return [];
  const { gap = 1, weight = 4, corridor = 2 } = params;
  // Each box with what stands in it: a Sub-Block's stack, or a broken-out machine.
  const boxes = blocks.map(b => ({ ...moved(b.step), w: b.w, h: b.h, holds: inst => inst.step === b.step && !inst.detached }));
  const placedApart = [];
  const overlaps = (a, b, g, gy = g) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + gy && b.y < a.y + a.h + gy;
  const extentOf = list => {
    const x0 = Math.min(...list.map(b => b.x)), y0 = Math.min(...list.map(b => b.y));
    return { x: x0, y: y0, w: Math.max(...list.map(b => b.x + b.w)) - x0, h: Math.max(...list.map(b => b.y + b.h)) - y0 };
  };
  // Where links run: between the Sub-Blocks they join, along the rows Side Inputs arrive on from
  // the west edge and outputs leave on to the east edge.
  const all = extentOf(boxes);
  const corridors = links.map(l => {
    const from = boxes[l.from], to = boxes[l.to];
    const y0 = Math.min(from.y + l.fromY, to.y + l.toY), y1 = Math.max(from.y + l.fromY, to.y + l.toY);
    return { x: from.x + from.w, y: y0, w: to.x - from.x - from.w, h: y1 - y0 + 1 };
  }).filter(c => c.w > 0);
  for (const b of blocks) {
    const at = moved(b.step);
    for (const y of b.entries) corridors.push({ x: all.x, y: at.y + y, w: at.x - all.x, h: 1 });
  }
  for (const route of routes.filter(r => r.kind === 'belt' && r.sink === 'side-output')) {
    const last = route.slots.at(-1);
    if (last.inst.detached) continue;
    const p = positions[last.inst.index];
    const exit = last.part.pieces.at(-1);
    const x = p.x + exit.x - last.inst.module.area.x + 1;
    corridors.push({ x, y: p.y + exit.y - last.inst.module.area.y, w: all.x + all.w - x, h: 1 });
  }
  // Where a slot's belt enters (one tile west of the copy) and leaves it (one tile east).
  const end = (slot, at, entry) => {
    const { area } = slot.inst.module;
    const piece = entry ? slot.part.pieces[0] : slot.part.pieces.at(-1);
    return { x: at.x + piece.x - area.x + (entry ? -1 : 1), y: at.y + piece.y - area.y };
  };
  for (const inst of apart) {
    const { w, h } = inst.module.area;
    const where = (other, at) => (other.inst === inst ? at : positions[other.inst.index]);
    const belts = routes.filter(r => r.kind === 'belt' && r.slots.some(s => s.inst === inst));
    const pipes = routes.filter(r => r.kind === 'pipe' && r.stubs.some(st => st.inst === inst));
    // Belts linking it to a box turn in the gap between them: a corridor's width and a column
    // more for each belt.
    const linked = box => belts.reduce((n, route) => n + route.slots.filter((slot, k) => k > 0
      && ((slot.inst === inst && box.holds(route.slots[k - 1].inst)) || (route.slots[k - 1].inst === inst && box.holds(slot.inst)))).length, 0);
    const clearance = boxes.map(box => {
      const n = linked(box);
      return n ? Math.max(gap, corridor + n - 1) : gap;
    });
    // Every link this machine's belts take, with it standing at `at`: to and from its neighbours
    // along each belt, from the west edge or on to the east edge.
    const length = at => {
      const block = extentOf([...boxes, { ...at, w, h }]);
      let sum = 0;
      for (const route of belts) {
        route.slots.forEach((slot, k) => {
          const prev = route.slots[k - 1];
          if (slot.inst === inst) {
            if (k === 0 && route.source === 'side-input') sum += end(slot, at, true).x - block.x;
            if (k === route.slots.length - 1 && route.sink === 'side-output') sum += block.x + block.w - end(slot, at, false).x;
          }
          if (!prev || (slot.inst !== inst && prev.inst !== inst)) return;
          const a = where(prev, at), b = where(slot, at);
          if (!a || !b) return;
          const from = end(prev, a, false), to = end(slot, b, true);
          const dx = to.x - from.x;
          sum += Math.abs(dx) + Math.abs(to.y - from.y) + (dx < 0 ? 2 * -dx + 8 : 0);
        });
      }
      for (const route of pipes) {
        const mine = route.stubs.find(st => st.inst === inst);
        const others = route.stubs.filter(st => st.inst !== inst && positions[st.inst.index]);
        const p = { x: at.x + mine.x - inst.module.area.x, y: at.y + mine.y - inst.module.area.y };
        const near = others.map(st => {
          const q = positions[st.inst.index];
          return Math.abs(q.x + st.x - st.inst.module.area.x - p.x) + Math.abs(q.y + st.y - st.inst.module.area.y - p.y);
        });
        if (near.length) sum += Math.min(...near);
        else if (route.source === 'side-input') sum += p.x - block.x;
      }
      return sum;
    };
    const room = extentOf(boxes);
    const options = [];
    const tiles = site && new Set(coveredBy(inst.module).map(([x, y]) => tileKey(x, y)));
    let y0 = room.y - h - gap - 1, y1 = room.y + room.h + gap + 1, x0 = room.x - w - gap - 1, x1 = room.x + room.w + gap + 1;
    if (site) {
      const { inner } = site;
      [x0, x1, y0, y1] = [Math.max(x0, inner.x), Math.min(x1, inner.x + inner.w - w), Math.max(y0, inner.y), Math.min(y1, inner.y + inner.h - h)];
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const me = { x, y, w, h };
        if (boxes.some((b, n) => overlaps(me, b, clearance[n], gap)) || corridors.some(c => overlaps(me, c, 0))) continue;
        if (site && !site.fits(tiles, me)) continue;
        const grown = extentOf([...boxes, me]);
        options.push({ x, y, cost: grown.w * grown.h + weight * length(me) });
      }
    }
    if (!options.length) throw new RoutingError('no room for a machine broken out of its Sub-Block');
    options.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
    const pick = options[Math.min(options.length - 1, params.spot?.[inst.step] ?? 0)];
    positions[inst.index] = { x: pick.x, y: pick.y };
    boxes.push({ x: pick.x, y: pick.y, w, h, holds: other => other === inst });
    placedApart.push(inst);
  }
  return placedApart.map(inst => {
    const [dx, dy] = params.shift?.[`a${inst.step}`] ?? [0, 0];
    const p = positions[inst.index];
    positions[inst.index] = { x: p.x + dx, y: p.y + dy };
    const box = { ...positions[inst.index], w: inst.module.area.w, h: inst.module.area.h };
    if (site && (dx || dy) && !site.fits(new Set(coveredBy(inst.module).map(([x, y]) => tileKey(x, y))), box)) {
      throw new RoutingError('a machine broken out of its Sub-Block does not fit there in the city block');
    }
    return box;
  });
}

// In a City Block, the share of its spots (every other tile) where each of a design's modules
// fits, the least of them: none of its machines, inserters, belts or pipes on a Fixture. 1
// where no Fixture stands in the City Block's room.
export function roomFor(site, design) {
  const rules = siteRules(site);
  if (!rules.fixtures.length) return 1;
  let least = 1;
  for (const { module } of design.kinds) {
    const tiles = new Set(coveredBy(module).map(([x, y]) => tileKey(x, y)));
    const { w, h } = module.area;
    const spots = rules.spots({ w, h }, 2);
    let n = 0;
    for (const spot of spots) if (rules.fits(tiles, { ...spot, w, h })) n++;
    least = Math.min(least, spots.length ? n / spots.length : 0);
  }
  return least;
}

// A City Block's rules for boxes: whether one lies inside its Buffer with no Fixture on any of
// its tiles (as tileKey of where they lie in the box), and every spot a box fits inside it.
// Made once per City Block.
const rulesOf = new WeakMap();
function siteRules(site) {
  if (!rulesOf.has(site)) rulesOf.set(site, makeRules(site));
  return rulesOf.get(site);
}

function makeRules(site) {
  const { inner } = site;
  // Fixtures in it, or right outside it where a link meets a box at its edge; filed by the cells
  // of a coarse grid they touch, so a box looks only at those near it.
  const fixtures = site.fixtures.filter(f => f.x < inner.x + inner.w + 1 && f.x + f.w > inner.x - 1 && f.y < inner.y + inner.h + 1 && f.y + f.h > inner.y - 1);
  const CELL = 16;
  const cells = new Map();
  fixtures.forEach((f, n) => {
    for (let cx = Math.floor((f.x - 1) / CELL); cx <= Math.floor((f.x + f.w) / CELL); cx++) {
      for (let cy = Math.floor((f.y - 1) / CELL); cy <= Math.floor((f.y + f.h) / CELL); cy++) {
        const k = cx * 65536 + cy;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(n);
      }
    }
  });
  const fits = (tiles, box) => {
    if (box.x < inner.x || box.y < inner.y || box.x + box.w > inner.x + inner.w || box.y + box.h > inner.y + inner.h) return false;
    const seen = new Set();
    for (let cx = Math.floor((box.x - 1) / CELL); cx <= Math.floor((box.x + box.w) / CELL); cx++) {
      for (let cy = Math.floor((box.y - 1) / CELL); cy <= Math.floor((box.y + box.h) / CELL); cy++) {
        for (const n of cells.get(cx * 65536 + cy) ?? []) {
          if (seen.has(n)) continue;
          seen.add(n);
          const f = fixtures[n];
          if (f.x > box.x + box.w || f.x + f.w < box.x || f.y > box.y + box.h || f.y + f.h < box.y) continue;
          for (let x = f.x; x < f.x + f.w; x++) for (let y = f.y; y < f.y + f.h; y++) if (tiles.has(tileKey(x - box.x, y - box.y))) return false;
        }
      }
    }
    return true;
  };
  // Large City Blocks are scanned in steps, so placing stays quick.
  const spots = ({ w, h }, step = Math.max(1, Math.round(Math.sqrt(inner.w * inner.h) / 80))) => {
    const out = [];
    for (let y = inner.y; y <= inner.y + inner.h - h; y += step) for (let x = inner.x; x <= inner.x + inner.w - w; x += step) out.push({ x, y });
    return out;
  };
  return { inner, fixtures, fits, spots };
}

// The tiles of a module that no Fixture may stand on, relative to its area's corner: its
// machines, inserters, belts and pipes, and just outside it where its belts and pipes meet their
// links.
const covered = new WeakMap();
function coveredBy(module) {
  if (!covered.has(module)) {
    const { area } = module;
    const out = [];
    const add = (x, y) => out.push([x - area.x, y - area.y]);
    for (const e of [...module.entities, ...module.parts.flatMap(p => p.pieces), ...module.fluids.flatMap(f => f.pieces)]) {
      for (let dx = 0; dx < (e.w ?? 1); dx++) for (let dy = 0; dy < (e.h ?? 1); dy++) add(e.x + dx, e.y + dy);
    }
    for (const part of module.parts) {
      const first = part.pieces[0], last = part.pieces.at(-1);
      const [ex, ey] = VEC[part.dir ?? E], [dx, dy] = VEC[last.travel];
      add(first.x - ex, first.y - ey);
      add(last.x + dx, last.y + dy);
    }
    for (const f of module.fluids) {
      const edge = f.role === 'input' ? area.x : area.x + area.w - 1;
      for (const p of f.pieces.filter(q => q.x === edge)) add(edge + (f.role === 'input' ? -1 : 1), p.y);
    }
    covered.set(module, out);
  }
  return covered.get(module);
}

// A tile of a box as one number (tiles from one left of or above the box on).
const tileKey = (x, y) => (x + 4) * 1048576 + y + 4;

// Whether a module stacked right on top of another would touch it badly: pipes of two fluids
// meeting across the seam, or a belt pointing across it into something.
function clash(upper, lower) {
  const edge = (module, top) => {
    const y = top ? module.area.y : module.area.y + module.area.h - 1;
    const out = new Map();
    const all = [...module.entities, ...module.parts.flatMap(p => p.pieces), ...module.fluids.flatMap(f => f.pieces.map(q => ({ ...q, fluidRoute: f.routeId })))];
    for (const e of all) if (e.y <= y && y < e.y + e.h) for (let x = e.x; x < e.x + e.w; x++) out.set(x - module.area.x, e);
    return out;
  };
  const below = edge(upper, false), above = edge(lower, true);
  const fluid = e => e.kind === 'pipe' || e.kind === 'pipe-to-ground';
  const belt = e => e.kind === 'belt' || e.kind === 'underground-belt';
  for (const [x, a] of below) {
    const b = above.get(x);
    if (belt(a) && a.direction === 8 && b) return true;
    if (!b) continue;
    if (belt(b) && b.direction === 0) return true;
    if (fluid(a) && fluid(b) && a.fluidRoute !== b.fluidRoute) return true;
  }
  return false;
}

// Where a copy's part enters (west edge) or leaves (east edge), from its module's top.
const entryY = slot => slot.part.pieces[0].y - slot.inst.module.area.y;
const exitY = slot => slot.part.pieces.at(-1).y - slot.inst.module.area.y;
