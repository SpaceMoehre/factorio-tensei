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
// The corridor's columns left where a Slot west of it lends the rest to the Goal's part in it.
const NARROW = 7;
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
// Rows between a part and a Sub-Block standing in the rows its Slot has to spare.
const GAP = 2;
// Ways to choose the producer parts each consumer part takes from, tried in turn; and how many
// choices the search for them looks at.
const TRIES = 3, VISITS = 200000;
// Columns between the two parts a Slot holds where a Goal's part is split in two.
const HALVES = 2;

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
// most rows of machines `pitch` wide in rows `rowH` tall first. Each Slot: { x, w, y, h, range,
// spill, lend (the corridor's columns east of it it may lend a part: see NARROW) }.
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
    const last = k === ranges.length - 1;
    return gapsOf(site, x, end).map(g => ({ x, w: end - x + 1, ...g, range: k, spill: last ? 0 : SPILL, lend: last ? 0 : CORRIDOR - NARROW }));
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
// height does (two at most: three do not fit the gaps a third row would need; one where no
// design of two fits, `most`), or none.
function capacity(slot, building, most = 2) {
  const pitch = Math.min(building.size.w, building.size.h), depth = Math.max(building.size.w, building.size.h);
  let rows = 0;
  while (rows < most && slot.h >= (rows + 1) * (depth + BAND) - rows) rows++;
  // (A row takes a column either side of its machines, several rows one more.)
  const perRow = Math.floor((slot.w + slot.spill - Math.min(rows, 2) - 1) / pitch);
  return { perRow, rows, machines: perRow * rows };
}

// A layout in Bands for the chain's entries, or null (no Fixtures, or no Sub-Block worth parts):
// { block } once one is linked, checked and starves nothing; { failure } where it does not. With
// `pack`, only whether its parts fit the gaps: { packed: true } or { failure }.
// options: { seed, pack, until (true once out of time: no more layouts are tried, and the one
// being linked gives up) }
/** @param {any} entries @param {any} catalog @param {any} logistics @param {any} site @param {{ seed?: number, pack?: boolean, until?: () => boolean }} [options] */
export function bands(entries, catalog, logistics, site, { seed = 1, pack = false, until = () => false } = {}) {
  // (The failure told is the one that got furthest.)
  let last = null;
  // Producers' Parts with less to spare where more would leave the Goal too little room; small
  // machines first kept out of the Parts (in the rows a part's Slot has to spare, else a narrow
  // column beside the Parts), the gaps they would take left to the Goal, else in Parts of their
  // own. (Tries that pack as one before them are not tried again.)
  const seen = new Set();
  for (const small of [false, true]) {
    for (const spare of SPARES) {
      if (until()) return last ?? { failure: new RoutingError('out of time') };
      const out = banded(entries, catalog, logistics, site, { seed, pack, spare, small, seen, until });
      if (out?.block || out?.packed || !out) return out;
      if (out.failure && (out.built ?? 0) >= (last?.built ?? 0)) last = out;
    }
  }
  return last;
}

function banded(entries, catalog, logistics, site, { seed, pack, spare, small, seen, until }) {
  // (Not with Byproduct Uses: a Sub-Block's parts give their byproducts to none. So Recycled
  // Byproducts come by train.)
  if (!site?.fixtures.length || entries.some(e => e.use)) return null;
  entries = entries.map(e => (e.goal.from ? { ...e, goal: Object.fromEntries(Object.entries(e.goal).filter(([k]) => k !== 'from')) } : e));
  const plan = planSubBlocks(entries, catalog, logistics);
  const goal = plan.findIndex(sb => sb.item === entries[0].goal.item);
  const lead = catalog.buildings[plan[goal].building];
  // (The failure told is the one that got furthest: a layout that did not route over parts that
  // fit no gaps.)
  let failure = null, furthest = -1, repeat = false;
  for (const slots of slotsOf(site, Math.min(lead.size.w, lead.size.h), Math.max(lead.size.w, lead.size.h) + BAND)) {
    // (Where the Goal's parts do not fit, Slots lending it the corridor: one more each try.)
    for (let lend = 0; lend <= slots.filter(s => s.lend).length; lend++) {
      if (until()) break;
      const out = inBands(slots, entries, plan, catalog, logistics, site, seed, goal, pack, spare, small, seen, lend, until);
      if (out?.block || out?.packed) return out;
      repeat ||= !!out?.repeat;
      if (out?.failure && (out.built ?? 0) > furthest) [failure, furthest] = [out.failure, out.built ?? 0];
      if (!out?.short) break;
    }
  }
  return failure ? { failure, built: furthest } : repeat ? {} : null;
}

// The chain in parts in these Slots: { block }, { failure } (with `short` where the Goal's parts
// fit none of them), { repeat } (its parts as a try before them packed) or null (no Sub-Block worth
// parts).
function inBands(slots, entries, plan, catalog, logistics, site, seed, goal, pack, spare, small, seen, lend = 0, until = () => false) {
  const building = i => catalog.buildings[plan[i].building];
  const area = i => plan[i].count * building(i).size.w * building(i).size.h;
  const depth = i => Math.max(building(i).size.w, building(i).size.h);
  // (Parts of two rows only where a design of two fits the Slot.)
  const capacityOf = (slot, i) => {
    const c = capacity(slot, building(i));
    return c.rows < 2 || twoRowsFit(entries, plan, catalog, logistics, site, seed, i, slot, c.perRow) ? c : capacity(slot, building(i), 1);
  };
  // The Sub-Blocks in parts: those whose machines fill a row of a Slot (unless `small` is false:
  // then not those whose machines are under half as deep as the Goal's); the rest stand where
  // Placement finds room.
  const fills = i => plan[i].count > 2 && slots.some(s => capacity(s, building(i)).perRow >= Math.min(plan[i].count, 3));
  const split = plan.map((_, i) => fills(i) && (small || i === goal || 2 * depth(i) >= depth(goal)));
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
    // The Goal's, in the `lend` lowest Slots west of a corridor left, also in its columns but
    // NARROW (a row of paddocks one longer): the lowest, the fewest links run down it past them.
    const lent = new Set(i === goal ? [...free].filter(k => slots[k].lend).sort((a, b) => slots[b].y - slots[a].y).slice(0, lend) : []);
    const slotOf = k => (lent.has(k) ? { ...slots[k], w: slots[k].w + slots[k].lend } : slots[k]);
    // The Slots that take the most of it (and waste least), until it is placed. (A Slot that takes
    // two rows by its height where no design of two fits takes two Parts of one row, one above the
    // other, where each half takes a row: halves.)
    const halves = (slot, c) => {
      const top = Math.floor(slot.h / 2);
      return c.rows === 1 && capacity(slot, building(i)).rows === 2 && top >= depth(i) + BAND + 1
        ? [{ ...slot, h: top }, { ...slot, y: slot.y + top, h: slot.h - top }] : null;
    };
    while (left > 0) {
      let best = null;
      for (const k of free) {
        const c = capacityOf(slotOf(k), i);
        if (!c.machines) continue;
        const stack = halves(slotOf(k), c);
        const room = stack ? 2 * c.perRow : c.machines;
        const take = Math.min(left, room);
        const waste = slotOf(k).w * slotOf(k).h - take * building(i).size.w * building(i).size.h;
        if (!best || take > best.take || (take === best.take && waste < best.waste)) best = { k, take, waste, c, stack };
      }
      if (!best) return { failure: new RoutingError(`${plan[i].item}: its parts fit no gaps between the Fixtures`), short: i === goal };
      free.delete(best.k);
      // A producer's part fills its gap: the machines spare cost no room, and its consumers'
      // parts then find one with room for them.
      for (const slot of best.stack ?? [slotOf(best.k)]) {
        if (left <= 0) break;
        const machines = i === goal ? Math.min(left, best.stack ? best.c.perRow : best.take) : best.c.machines;
        parts.push({ step: i, slot, machines, perRow: Math.min(best.c.perRow, machines) });
        left -= machines;
      }
    }
  }
  // Each Sub-Block's parts in the order they stand, range by range, top to bottom (west to east
  // in one Slot): a belt chaining several runs on to the next gap down.
  parts.sort((a, b) => a.step - b.step || a.slot.range - b.slot.range || a.slot.y - b.slot.y || a.slot.x - b.slot.x);
  // Each part of a consumer takes each item a producer makes in parts from one of its parts, with
  // room for all it takes (what the part's machines make); of the ways to choose, those whose
  // links are shortest first, tried in turn where one does not route.
  let choices = assignments(parts, plan, split, goal);
  // Where they do not (whole parts divide unevenly), a Goal's part of one row split in two side by
  // side in its Slot, each taking from a producer part of its own: the first as wide as its
  // machines and a column either side, the second in the rest (76 paddocks in Parts of 16, four of
  // 8 and four of 7 divide among three incubator Parts of 27.6 paddocks' worth once a 7 is a 4 and
  // a 3: 16 + 8 + 3, 8 + 8 + 7 + 4 and 8 + 7 + 7).
  const pitch = Math.min(building(goal).size.w, building(goal).size.h);
  for (const p of parts.filter(p => p.step === goal && p.machines > 1 && p.machines === p.perRow)) {
    for (let a = Math.ceil(p.machines / 2); a < p.machines && !choices.length; a++) {
      const w = a * pitch + 2, second = { ...p.slot, x: p.slot.x + w + HALVES, w: p.slot.w - w - HALVES };
      if (capacity(second, building(goal)).perRow < p.machines - a) continue;
      const halves = [{ ...p, slot: { ...p.slot, w, spill: 0 }, machines: a, perRow: a }, { ...p, slot: second, machines: p.machines - a, perRow: p.machines - a }];
      const tried = parts.flatMap(q => (q === p ? halves : [q]));
      choices = assignments(tried, plan, split, goal);
      if (choices.length) parts.splice(0, parts.length, ...tried);
    }
    if (choices.length) break;
  }
  if (!choices.length) return { failure: new RoutingError('the parts made do not divide among the parts taking them') };
  if (pack) return { packed: true };
  // (Packed as a try before it, with less to spare: the same layout.)
  const key = JSON.stringify([small, parts.map(p => [p.step, p.slot.x, p.slot.y, p.slot.w, p.machines])]);
  if (seen.has(key)) return { repeat: true };
  seen.add(key);
  let failure = null, furthest = -1;
  for (const { fed, from } of choices) {
    if (until()) break;
    const out = laid(fed, from);
    if (out.block) return out;
    if ((out.built ?? 0) > furthest) [failure, furthest] = [out.failure, out.built ?? 0];
    // (A Sub-Block standing where Placement finds room found none: other producer parts for the
    // same parts make none.)
    if (/^no room for .* in the city block/.test(out.failure?.message ?? '')) break;
  }
  return { failure, built: furthest };

  function laid(fed, from) {
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
    let ctx;
    try {
      ctx = context(out, catalog, logistics, site);
    } catch (e) {
      return { failure: e };
    }
    // Each part's design: its rows as long as its Slot was given, else a row shorter; and fitting it.
    const rng = random(seed);
    const designs = [];
    const wide = d => Math.max(...d.kinds.map(k => k.module.area.w));
    const tall = d => d.kinds.reduce((sum, k) => sum + k.count * k.module.area.h, 0);
    // (Sub-Blocks kept out of the Parts standing in the rows a part's Slot has to spare: which part.)
    const beside = new Map();
    for (let n = 0; n < ctx.plan.length; n++) {
      let list;
      try {
        // (Parts of several rows also from random variants: one a column narrower may fit.)
        const rows = parts[n] ? Math.ceil(parts[n].machines / parts[n].perRow) : 1;
        // (A Sub-Block kept out of the Parts also in columns one or two machines wide.)
        const lengths = parts[n] ? [parts[n].perRow, parts[n].perRow - 1].filter(k => k > 0) : small ? [] : [1, 2];
        list = designStep(ctx, n, rng, { draws: rows > 1 ? DRAWS : 0, lengths });
      } catch (e) {
        if (!(e instanceof LayoutError)) throw e;
        return { failure: e };
      }
      const p = parts[n];
      let design = null;
      if (!p && !small && fills(rest[n - parts.length])) {
        // (A Sub-Block kept out of the Parts: in the rows a part's Slot has to spare, below the
        // part, in its flattest design that fits them; else its narrowest, a column beside them.)
        const fitting = list.map(designOf).filter(Boolean);
        const spare = k => parts[k].slot.h - tall(designs[k]) - GAP;
        for (const k of parts.map((_, k) => k).filter(k => ![...beside.values()].includes(k)).sort((a, b) => spare(b) - spare(a))) {
          design = fitting.filter(d => tall(d) <= spare(k) && wide(d) <= parts[k].slot.w).sort((a, b) => tall(a) - tall(b) || wide(a) - wide(b))[0] ?? null;
          if (design) {
            beside.set(n, k);
            break;
          }
        }
      }
      if (!p && !design) design = small ? list.map(designOf).find(Boolean) : list.map(designOf).filter(Boolean).sort((a, b) => wide(a) - wide(b))[0];
      else if (p) {
        for (const length of [p.perRow, p.perRow - 1]) {
          // (The narrowest that fits, room either side of it for the links: by their cores' widths,
          // each routed in turn until one fits.)
          const fits = d => d && d.trouble <= 1e-6 && d.kinds.every(k => k.module.area.w <= p.slot.w + p.slot.spill && k.module.area.h <= p.slot.h);
          const chosen = list.filter(c => c.spec?.variant && !c.spec.copies && c.spec.variant.rowLength === length)
            .sort((a, b) => a.estimate.w - b.estimate.w).find(c => fits(designOf(c)));
          design = chosen ? designOf(chosen) : null;
          if (design) break;
        }
      }
      if (!design) return { failure: new RoutingError(`${ctx.plan[n].item}: no design fits its gap between the Fixtures`), built: 1 };
      designs.push(design);
    }
    // The layouts tried in turn, the fewest belts from the west edge first: the Side Inputs' lines
    // laid first, each producers' line that then finds no way chained instead, one by one (one
    // belt through its producers and consumers), else all of them; then the Side Inputs' lines
    // past three parts at most; then laid after the producers' (theirs Fan-outs again); then each
    // part's Side Input from the west edge on its own.
    const linked = fallback => {
      const ready = prepare(ctx, designs);
      // Each part in the middle of its gap (room above and below it for links along the gap),
      // against its east end: its belts leave into the corridor east of it, or to the east edge.
      const at = Object.fromEntries(parts.map((p, n) => {
        const w = wide(designs[n]), h = tall(designs[n]);
        return [n, { x: p.slot.x + Math.max(0, p.slot.w - w), y: p.slot.y + Math.max(0, Math.floor((p.slot.h - h) / 2)) }];
      }));
      // (A Sub-Block in the rows a part's Slot has to spare: below it, the two in the middle.)
      for (const [n, k] of beside) {
        const { slot } = parts[k], h = tall(designs[k]) + GAP + tall(designs[n]);
        at[k].y = slot.y + Math.max(0, Math.floor((slot.h - h) / 2));
        at[n] = { x: slot.x + Math.max(0, slot.w - wide(designs[n])), y: at[k].y + tall(designs[k]) + GAP };
      }
      // (A small Sub-Block taking no Slot whose item only Parts take, its line past them all: at the
      // top of the corridor west of the Fixture column cut at, the line running down it. Chained,
      // where Placement finds room.)
      const corridor = parts.map(p => p.slot).find(slot => slot.lend);
      if (corridor) {
        const top = Math.min(...slots.map(slot => slot.y));
        let y = top;
        for (let n = parts.length; n < ctx.plan.length; n++) {
          if (at[n] || beside.has(n)) continue;
          const takers = ctx.plan.map((sb, c) => c).filter(c => ctx.plan[c].inputs.some(x => x.name === ctx.plan[n].item));
          if (!takers.length || !takers.every(c => ctx.plan[c].part)) continue;
          const out = ctx.routes.find(r => r.kind === 'belt' && r.source === n);
          if (ctx.chained === 'all' || (out && ctx.chained.has(out.id))) continue;
          at[n] = { x: corridor.x + corridor.w + 1, y };
          y += tall(designs[n]) + GAP;
        }
      }
      const positions = placeBlocks(ctx, ready, { corridor: 2, gap: 1, weight: 4, at, stay: true });
      const composed = compose(ctx, ready, positions, { margin: { w: 0, e: 0, n: 1, s: 1 }, until, ...fallback });
      const block = finishBlock(composed, catalog, logistics);
      const problems = validateBlock(block, catalog, logistics);
      if (problems.length) return { failure: new Error(`invalid layout: ${problems[0]}`), built: 3 };
      const starving = simulate(block).starvation.reduce((sum, s) => sum + s.demand - s.available, 0);
      if (starving > 1e-6) return { failure: new Error(`the layout starves ${Math.round(starving * 1000) / 1000}/min`), built: 3 };
      return { block };
    };
    try {
      let last = null;
      for (const fallback of [{}, { chains: true }, { short: true }, { fansLast: true }, { alone: true }]) {
        // (Each where it changes anything: where there are producers' lines to chain, Side Inputs'
        // lines to lay later, or across parts to shorten or leave.)
        if (fallback.chains ? !ctx.fannedOut : fallback.fansLast ? !last?.fans : (fallback.short || fallback.alone) && !last?.across) continue;
        ctx.chained = fallback.chains ? 'all' : new Set();
        for (;;) {
          try {
            return linked(fallback);
          } catch (e) {
            if (!(e instanceof RoutingError)) throw e;
            last = e;
            if (fallback.fansLast || fallback.chains || e.chain === undefined || ctx.chained.has(e.chain)) break;
            ctx.chained.add(e.chain);
          }
        }
      }
      throw last;
    } catch (e) {
      if (!(e instanceof RoutingError || e instanceof PowerError || e instanceof LayoutError)) throw e;
      return { failure: e, built: 2 };
    }
  }
}

// Whether Sub-Block i's machines stand two rows to a Part in a Slot (a row of perRow each): some
// design of two rows as long (or one shorter) routes without starving and fits the Slot, among
// those a Part of them gets (its belts as a Part's; random variants too). The designs' sizes are
// cached by what decides them: the recipe and machine, what it takes and makes, its Count and the
// row; each Slot is checked against them. (A Part's belts visiting both bands outside its rows
// run round them: with many, the design outgrows the Slot, Py vrauks-2 paddocks two rows of eight
// 112 wide.)
const twoRows = new Map();
function twoRowsFit(entries, plan, catalog, logistics, site, seed, i, slot, perRow) {
  const sb = plan[i];
  const machines = Math.min(sb.count, 2 * perRow);
  const key = JSON.stringify([sb.recipe, sb.building, sb.modules, sb.inputs.map(x => x.name), sb.outputs.map(x => x.name), sb.count, perRow, logistics]);
  if (!twoRows.has(key)) {
    // The Sub-Block as a Part of that many machines, the rest whole.
    const probe = entries.map(e => (e.goal.item !== sb.item ? e : { ...e, goal: { ...e.goal, rate: e.goal.rate * machines / sb.count, part: true, machines } }));
    const sizes = [];
    try {
      const ctx = context(probe, catalog, logistics, site);
      const lengths = [perRow, perRow - 1].filter(k => k > 0);
      for (const c of designStep(ctx, i, random(seed), { draws: DRAWS, lengths, only: true })) {
        if (!c.spec?.variant || c.spec.copies || !lengths.includes(c.spec.variant.rowLength)) continue;
        const d = designOf(c);
        if (d && d.trouble <= 1e-6) sizes.push(d.kinds.map(k => k.module.area));
      }
    } catch (e) {
      if (!(e instanceof LayoutError || e instanceof RoutingError)) throw e;
    }
    twoRows.set(key, sizes);
  }
  return twoRows.get(key).some(areas => areas.every(a => a.w <= slot.w + slot.spill && a.h <= slot.h));
}

// The ways each consumer part may take each item made in parts from one producer part with room
// for all its parts take, at most TRIES, those whose links are shortest first (from Slot to Slot,
// centre to centre): [{ fed (a producer part's load), from (a consumer part's producer part by
// item) }]. Every producer part feeds some consumer part. (Each the nearest with room leaves too
// little room in any one part where whole parts divide unevenly: 75 vrauks paddocks in parts of
// 16, 8, 8, 8, 8, 7, 7, 7 and 6 fit three incubator parts of 27.6 paddocks' worth only as
// 16 + 8, 8 + 8 + 8 and 7 + 7 + 7 + 6.)
function assignments(parts, plan, split, goal) {
  const center = p => ({ x: p.slot.x + p.slot.w / 2, y: p.slot.y + p.slot.h / 2 });
  const distance = (a, b) => Math.abs(center(a).x - center(b).x) + Math.abs(center(a).y - center(b).y);
  const takes = parts.flatMap(consumer => {
    const sb = plan[consumer.step];
    return sb.inputs.filter(x => x.type === 'item').flatMap(input => {
      const producer = plan.findIndex(p => p.item === input.name);
      if (producer < 0 || !split[producer] || sb.byTrain?.includes(input.name)) return [];
      const options = parts.filter(p => p.step === producer).sort((a, b) => distance(consumer, a) - distance(consumer, b));
      return [{ consumer, item: input.name, need: input.rate * consumer.machines / sb.count, options }];
    });
  }).sort((a, b) => b.need - a.need);
  const room = new Map(parts.map(p => [p, p.machines * plan[p.step].rate / plan[p.step].count * (plan[p.step].headroom ?? 1)]));
  const fed = new Map(parts.map(p => [p, 0]));
  // (The shortest the links left could be: a bound for the search.)
  const least = takes.map(t => (t.options.length ? distance(t.consumer, t.options[0]) : Infinity));
  const bound = least.map((_, k) => least.slice(k).reduce((sum, d) => sum + d, 0));
  bound.push(0);
  const found = [], chosen = [];
  let visits = 0;
  const search = (k, cost) => {
    if (++visits > VISITS || (found.length === TRIES && cost + bound[k] >= found.at(-1).cost)) return;
    if (k === takes.length) {
      // (A part no consumer takes from is no part.)
      if (parts.some(p => p.step !== goal && !(fed.get(p) > 0))) return;
      found.push({ cost, choice: [...chosen], loads: new Map(fed) });
      found.sort((a, b) => a.cost - b.cost).splice(TRIES);
      return;
    }
    const t = takes[k];
    for (const p of t.options) {
      if (fed.get(p) + t.need > room.get(p) + 1e-6) continue;
      fed.set(p, fed.get(p) + t.need);
      chosen.push(p);
      search(k + 1, cost + distance(t.consumer, p));
      chosen.pop();
      fed.set(p, fed.get(p) - t.need);
    }
  };
  search(0, 0);
  return found.map(({ choice, loads }) => {
    const from = new Map(parts.map(p => [p, {}]));
    takes.forEach((t, k) => (from.get(t.consumer)[t.item] = choice[k]));
    return { fed: loads, from };
  });
}
