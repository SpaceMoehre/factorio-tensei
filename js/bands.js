// Bands (ADR 0025): in a City Block whose Fixtures stand in rows across it (a grid of roboports
// and poles), the Production Chain in parts, each a row or two of machines in a gap between the
// Fixtures' rows. The City Block is taken whole or cut at one of its Fixture columns (whichever
// packs), each range into Slots: the runs of rows no Fixture stands in across it. Each Sub-Block
// with machines enough to fill a row of one is split into parts, a part to a Slot: the Sub-Blocks
// whose rows are tallest first (only the tallest gaps take them), the Goals last, filling what is
// left. A part that takes an item from a Sub-Block in parts takes it from the nearest part with
// room for it. Small Sub-Blocks stand where Placement finds room. The parts are designed, placed
// in their Slots, linked and checked like any layout.

import { planSubBlocks } from './plan.js';
import { context, designStep, designOf, random } from './design.js';
import { prepare, compose, RoutingError, PowerError } from './layout/compose.js';
import { placeBlocks } from './layout/place.js';
import { finishBlock } from './layout/compact.js';
import { validateBlock } from './layout/validity.js';
import { LayoutError } from './layout/core.js';
import { simulate } from './sim.js';

// Room kept beside the parts: at the west edge for the belts coming in, at the east edge for
// those going out, and west of a Fixture column the City Block is cut at, for the links crossing
// between ranges.
const WEST = 4, EAST = 3, CORRIDOR = 16;
// Room kept east of a Fixture column the City Block is cut at: where links come into the parts.
const OFFSET = 2;
// A part's rows: a machine's depth and the belts and inserters of the band beside it.
const BAND = 6;
// How many machines a producer's parts hold, for those its consumers need (a consumer part takes
// all it needs from one part: whole parts do not divide evenly), tried in turn.
const SPARES = [1.15, 1.05, 1];
// How far a part's design may reach past its Slot's width, into the room kept beside it (not at
// the east edge, where its belts leave).
const SPILL = 4;
// Random variants tried for a part of several rows.
const DRAWS = 60;

// The rows Fixtures stand in between columns x0 and x1 (and `side` columns either side: where a
// part's belts meet their links).
function blockedRows(site, x0, x1, side = 1) {
  const rows = new Set();
  for (const f of site.fixtures) {
    if (f.x + f.w - 1 < x0 - side || f.x > x1 + side) continue;
    for (let y = f.y; y < f.y + f.h; y++) rows.add(y);
  }
  return rows;
}

// The runs of rows no Fixture stands in between columns x0 and x1: { y, h }.
export function gapsOf(site, x0, x1) {
  const { inner } = site;
  const blocked = blockedRows(site, x0, x1);
  const out = [];
  let start = null;
  for (let y = inner.y; y <= inner.y + inner.h; y++) {
    const free = y < inner.y + inner.h && !blocked.has(y);
    if (free && start === null) start = y;
    if (!free && start !== null) {
      out.push({ y: start, h: y - start });
      start = null;
    }
  }
  return out;
}

// The ways to cut a City Block into Slots: its inner width whole, or cut at one Fixture column
// (a run of columns Fixtures stand in) at least `least` columns from either edge; those holding
// most rows of machines `pitch` wide in rows `rowH` tall first. Each Slot: { x, w, y, h, range }.
export function slotsOf(site, pitch, rowH, least = 3 * pitch) {
  const { inner } = site;
  const columns = [];
  for (let x = inner.x; x < inner.x + inner.w; x++) {
    const n = blockedRows(site, x, x, 0).size;
    if (!n) continue;
    const last = columns.at(-1);
    if (last && last.x1 === x - 1) Object.assign(last, { x1: x, rows: Math.max(last.rows, n) });
    else columns.push({ x0: x, x1: x, rows: n });
  }
  const slotsFor = ranges => ranges.flatMap((r, k) => {
    // (The links crossing between ranges run west of the Fixture column cut at.)
    const x = r.x0 + (k === 0 ? WEST : OFFSET), end = r.x1 - (k === ranges.length - 1 ? EAST : CORRIDOR);
    if (end - x < pitch) return [];
    return gapsOf(site, x, end).map(g => ({ x, w: end - x + 1, ...g, range: k, spill: k === ranges.length - 1 ? 0 : SPILL }));
  });
  const worth = slots => slots.reduce((sum, s) => sum + Math.floor(s.h / rowH) * Math.floor((s.w - 2) / pitch), 0);
  const ways = [slotsFor([{ x0: inner.x, x1: inner.x + inner.w - 1 }])];
  for (const c of columns) {
    if (c.x0 - inner.x < least || inner.x + inner.w - c.x1 < least) continue;
    ways.push(slotsFor([{ x0: inner.x, x1: c.x0 - 1 }, { x0: c.x1 + 1, x1: inner.x + inner.w - 1 }]));
  }
  return ways.filter(w => w.length).sort((a, b) => worth(b) - worth(a));
}

// Machines `building` stands in a Slot: rows of as many as its width takes, as many rows as its
// height does (two at most: three do not fit the gaps a third row would need), or none.
function capacity(slot, building) {
  const pitch = Math.min(building.size.w, building.size.h), depth = Math.max(building.size.w, building.size.h);
  let rows = 0;
  while (rows < 2 && slot.h >= (rows + 1) * (depth + BAND) - rows) rows++;
  // (A row takes a column either side of its machines, several rows one more.)
  const perRow = Math.floor((slot.w + slot.spill - Math.min(rows, 2) - 1) / pitch);
  return { perRow, rows, machines: perRow * rows };
}

// A layout in Bands for the chain's entries, or null (no Fixtures, or no Sub-Block worth parts):
// { block } once one is linked, checked and starves nothing; { failure } where it does not. With
// `pack`, only whether its parts fit the gaps: { packed: true } or { failure }.
// options: { seed, pack }
export function bands(entries, catalog, logistics, site, { seed = 1, pack = false } = {}) {
  let last = null;
  // Producers' Parts with less to spare where more would leave the Goal too little room.
  for (const spare of SPARES) {
    const out = banded(entries, catalog, logistics, site, { seed, pack, spare });
    if (out?.block || out?.packed || !out) return out;
    last = out;
  }
  return last;
}

function banded(entries, catalog, logistics, site, { seed, pack, spare }) {
  if (!site?.fixtures.length) return null;
  const plan = planSubBlocks(entries, catalog, logistics);
  const goal = plan.findIndex(sb => sb.item === entries[0].goal.item);
  const lead = catalog.buildings[plan[goal].building];
  // (The failure told is the one that got furthest: a layout that did not route over parts that
  // fit no gaps.)
  let failure = null, furthest = -1;
  for (const slots of slotsOf(site, Math.min(lead.size.w, lead.size.h), Math.max(lead.size.w, lead.size.h) + BAND)) {
    const out = inBands(slots, entries, plan, catalog, logistics, site, seed, goal, pack, spare);
    if (out?.block || out?.packed) return out;
    if (out?.failure && (out.built ?? 0) > furthest) [failure, furthest] = [out.failure, out.built ?? 0];
  }
  return failure ? { failure } : null;
}

// The chain in parts in these Slots: { block }, { failure } or null (no Sub-Block worth parts).
function inBands(slots, entries, plan, catalog, logistics, site, seed, goal, pack, spare) {
  const building = i => catalog.buildings[plan[i].building];
  const area = i => plan[i].count * building(i).size.w * building(i).size.h;
  // The Sub-Blocks in parts: those whose machines fill a row of a Slot; the rest stand where
  // Placement finds room.
  const split = plan.map((sb, i) => sb.count > 2 && slots.some(s => capacity(s, building(i)).perRow >= Math.min(sb.count, 3)));
  if (!split[goal]) return null;
  // Most constrained first: the tallest rows, the Goals last.
  const order = plan.map((_, i) => i).filter(i => split[i] && i !== goal)
    .sort((a, b) => Math.max(building(b).size.w, building(b).size.h) - Math.max(building(a).size.w, building(a).size.h) || area(b) - area(a));
  order.push(goal);
  const free = new Set(slots.map((_, k) => k));
  const parts = [];
  for (const i of order) {
    // (A producer's parts with a little to spare: each consumer part takes from one.)
    let left = i === goal ? plan[i].count : Math.ceil(plan[i].count * spare);
    // The Slots that take the most of it (and waste least), until it is placed.
    while (left > 0) {
      let best = null;
      for (const k of free) {
        const c = capacity(slots[k], building(i));
        if (!c.machines) continue;
        const take = Math.min(left, c.machines);
        const waste = slots[k].w * slots[k].h - take * building(i).size.w * building(i).size.h;
        if (!best || take > best.take || (take === best.take && waste < best.waste)) best = { k, take, waste, c };
      }
      if (!best) return { failure: new RoutingError(`${plan[i].item}: its parts fit no gaps between the Fixtures`) };
      free.delete(best.k);
      // A producer's part fills its gap: the machines spare cost no room, and its consumers'
      // parts then find one with room for them.
      const machines = i === goal ? best.take : best.c.machines;
      parts.push({ step: i, slot: slots[best.k], machines, perRow: Math.min(best.c.perRow, machines) });
      left -= machines;
    }
  }
  // Each Sub-Block's parts in the order they stand, range by range, top to bottom: a belt chaining
  // several runs on to the next gap down.
  parts.sort((a, b) => a.step - b.step || a.slot.range - b.slot.range || a.slot.y - b.slot.y);
  // Each part of a consumer takes a split producer's item from the nearest part with room for
  // it (what a producer part's machines make, in consumer machines).
  const center = p => ({ x: p.slot.x + p.slot.w / 2, y: p.slot.y + p.slot.h / 2 });
  const fed = new Map(parts.map(p => [p, 0]));
  const from = new Map(parts.map(p => [p, {}]));
  for (const consumer of [...parts].sort((a, b) => b.machines - a.machines)) {
    const sb = plan[consumer.step];
    for (const input of sb.inputs.filter(x => x.type === 'item')) {
      const producer = plan.findIndex(p => p.item === input.name);
      if (producer < 0 || !split[producer] || sb.byTrain?.includes(input.name)) continue;
      const need = input.rate * consumer.machines / sb.count;
      const made = plan[producer].rate / plan[producer].count;
      const options = parts.filter(p => p.step === producer && (fed.get(p) + need) <= p.machines * made * (plan[producer].headroom ?? 1) + 1e-6);
      if (!options.length) return { failure: new RoutingError(`${input.name}: no part makes enough for ${sb.item}'s`) };
      const a = center(consumer);
      const distance = p => Math.abs(a.x - center(p).x) + Math.abs(a.y - center(p).y);
      const nearest = options.reduce((best, p) => (distance(p) < distance(best) ? p : best));
      fed.set(nearest, fed.get(nearest) + need);
      from.get(consumer)[input.name] = nearest;
    }
  }
  // The entries: the parts first (a producer part making what its consumers take, with as many
  // machines as its Slot was given), then the Sub-Blocks not in parts.
  const byStep = new Map(entries.map(e => [e.goal.item, e]));
  const index = new Map(parts.map((p, n) => [p, n]));
  const rest = plan.map((_, i) => i).filter(i => !split[i]);
  const out = parts.map((p, n) => {
    const base = byStep.get(plan[p.step].item);
    const share = p.step === goal ? p.machines / plan[p.step].count : fed.get(p) / plan[p.step].rate;
    return {
      ...base,
      goal: {
        ...base.goal, rate: base.goal.rate * share, part: true,
        ...(p.step === goal ? {} : { machines: p.machines }),
        from: Object.fromEntries(Object.entries(from.get(p)).map(([item, q]) => [item, index.get(q)])),
      },
    };
  });
  for (const i of rest) out.push(byStep.get(plan[i].item));
  // A part no consumer takes from is no part.
  if (parts.some(p => p.step !== goal && !(fed.get(p) > 0))) return { failure: new RoutingError('a part makes for no one') };
  if (pack) return { packed: true };
  let ctx;
  try {
    ctx = context(out, catalog, logistics, site);
  } catch (e) {
    return { failure: e };
  }
  // Each part's design: its rows as long as its Slot was given, else a row shorter; and fitting it.
  const rng = random(seed);
  const designs = [];
  for (let n = 0; n < ctx.plan.length; n++) {
    let list;
    try {
      // (Parts of several rows also from random variants: one a column narrower may fit.)
      const rows = parts[n] ? Math.ceil(parts[n].machines / parts[n].perRow) : 1;
      list = designStep(ctx, n, rng, { draws: rows > 1 ? DRAWS : 0, lengths: parts[n] ? [parts[n].perRow, parts[n].perRow - 1].filter(k => k > 0) : [] });
    } catch (e) {
      if (!(e instanceof LayoutError)) throw e;
      return { failure: e };
    }
    const p = parts[n];
    let design = null;
    if (!p) design = list.map(designOf).find(Boolean);
    else {
      for (const length of [p.perRow, p.perRow - 1]) {
        // (The narrowest that fits: room either side of it for the links.)
        const width = d => Math.max(...d.kinds.map(k => k.module.area.w));
        design = list.filter(c => c.spec?.variant && !c.spec.copies && c.spec.variant.rowLength === length).map(designOf)
          .filter(d => d && d.trouble <= 1e-6 && d.kinds.every(k => k.module.area.w <= p.slot.w + p.slot.spill && k.module.area.h <= p.slot.h))
          .sort((a, b) => width(a) - width(b))[0] ?? null;
        if (design) break;
      }
    }
    if (!design) return { failure: new RoutingError(`${ctx.plan[n].item}: no design fits its gap between the Fixtures`), built: 1 };
    designs.push(design);
  }
  try {
    const ready = prepare(ctx, designs);
    // Each part in the middle of its gap (room above and below it for links along the gap),
    // against its east end: its belts leave into the corridor east of it, or to the east edge.
    const at = Object.fromEntries(parts.map((p, n) => {
      const w = Math.max(...designs[n].kinds.map(k => k.module.area.w));
      const h = designs[n].kinds.reduce((sum, k) => sum + k.count * k.module.area.h, 0);
      return [n, { x: p.slot.x + Math.max(0, p.slot.w - w), y: p.slot.y + Math.max(0, Math.floor((p.slot.h - h) / 2)) }];
    }));
    const positions = placeBlocks(ctx, ready, { corridor: 2, gap: 1, weight: 4, at, stay: true });
    const composed = compose(ctx, ready, positions, { margin: { w: 0, e: 0, n: 1, s: 1 } });
    const block = finishBlock(composed, catalog, logistics);
    const problems = validateBlock(block, catalog, logistics);
    if (problems.length) return { failure: new Error(`invalid layout: ${problems[0]}`), built: 3 };
    const starving = simulate(block).starvation.reduce((sum, s) => sum + s.demand - s.available, 0);
    if (starving > 1e-6) return { failure: new Error(`the layout starves ${Math.round(starving * 1000) / 1000}/min`), built: 3 };
    return { block };
  } catch (e) {
    if (!(e instanceof RoutingError || e instanceof PowerError || e instanceof LayoutError)) throw e;
    return { failure: e, built: 2 };
  }
}
