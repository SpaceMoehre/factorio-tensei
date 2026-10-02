import { stacked } from './compose.js';

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
export function placeBlocks(ctx, prepared, params = {}) {
  const { plan } = ctx;
  const { instances, routes } = prepared;
  const { corridor = 2, gap = 1, stack = 0, weight = 4 } = params;
  const steps = plan.map((_, i) => i);

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
    return { step: i, instances: mine, at, w: columns * mw + (columns - 1) * cross, h, entries: [] };
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
  const box = i => ({ x: placed.get(i).x, y: placed.get(i).y, w: blocks[i].w, h: blocks[i].h });
  const overlaps = (a, b, g) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
  const bounds = extra => {
    const all = [...[...placed.keys()].map(box), ...(extra ? [extra] : [])];
    if (!all.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x0 = Math.min(...all.map(b => b.x)), y0 = Math.min(...all.map(b => b.y));
    return { x: x0, y: y0, w: Math.max(...all.map(b => b.x + b.w)) - x0, h: Math.max(...all.map(b => b.y + b.h)) - y0 };
  };
  for (const i of order) {
    const b = blocks[i];
    const mine = links.filter(l => l.from === i && placed.has(l.to));
    const lift = params.lift?.[i] ?? 0;
    // Level with the entries it feeds; west of every consumer, with a corridor between.
    const ty = mine.length ? Math.round(mine.reduce((sum, l) => sum + placed.get(l.to).y + l.toY - l.fromY, 0) / mine.length) + lift : null;
    const east = mine.length ? Math.min(...mine.map(l => placed.get(l.to).x)) - corridor - b.w : null;
    const all = bounds();
    // With nothing to feed here (a Goal), below the Goals already placed.
    const start = ty === null ? { x: placed.size ? all.x + all.w - b.w : 0, y: placed.size ? all.y + all.h + gap + 1 : 0 } : { x: east, y: ty };
    const candidates = [start];
    for (const j of placed.keys()) {
      const o = box(j);
      candidates.push({ x: Math.min(start.x, o.x - gap - 1 - b.w), y: start.y });
      candidates.push({ x: start.x, y: o.y - gap - 1 - b.h }, { x: start.x, y: o.y + o.h + gap + 1 });
      candidates.push({ x: Math.min(start.x, o.x - gap - 1 - b.w), y: o.y }, { x: Math.min(start.x, o.x - gap - 1 - b.w), y: o.y + o.h - b.h });
    }
    let best = null;
    for (const c of candidates) {
      const me = { ...c, w: b.w, h: b.h };
      if ([...placed.keys()].some(j => overlaps(me, box(j), gap))) continue;
      if (mine.some(l => c.x + b.w + 1 > placed.get(l.to).x)) continue;
      const grown = bounds(me);
      const length = mine.reduce((sum, l) => sum + Math.abs(placed.get(l.to).x - (c.x + b.w)) + Math.abs(placed.get(l.to).y + l.toY - c.y - l.fromY), 0);
      // Side Inputs of Sub-Blocks already placed arrive from the west: keep off their rows.
      const blocking = [...placed.keys()].filter(j => box(j).x >= c.x + b.w)
        .reduce((n, j) => n + blocks[j].entries.filter(e => {
          const y = placed.get(j).y + e;
          return y >= c.y - 1 && y <= c.y + b.h;
        }).length, 0);
      const cost = grown.w * grown.h + weight * length + 40 * blocking;
      if (!best || cost < best.cost) best = { ...c, cost };
    }
    placed.set(i, { x: best.x, y: best.y });
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
  boxes.push(...placeApart(prepared, positions, blocks, moved, links, params));
  // Shifted to start at 0,0; `bounds` covers every Sub-Block with the room beside its stack.
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
  /** @type {any} */
  const out = positions.map(p => ({ x: p.x - x0, y: p.y - y0 }));
  out.bounds = {
    x: 0, y: 0, w: Math.max(...boxes.map(b => b.x + b.w)) - x0, h: Math.max(...boxes.map(b => b.y + b.h)) - y0,
  };
  return out;
}

// Breakout: each machine broken out of its Sub-Block stands in the spot, clear of every box
// placed so far by `gap` and of the corridors the links between Sub-Blocks take, that grows the
// block least and keeps its own links short (`weight` per tile, a belt running back west
// costing more); `spot` picks the next best spots instead, and slides (`shift` of `a<step>`)
// move them on. Fills in their positions; returns their boxes.
// moved(step): where a Sub-Block's box stands.
function placeApart(prepared, positions, blocks, moved, links, params) {
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
    for (let y = room.y - h - gap - 1; y <= room.y + room.h + gap + 1; y++) {
      for (let x = room.x - w - gap - 1; x <= room.x + room.w + gap + 1; x++) {
        const me = { x, y, w, h };
        if (boxes.some((b, n) => overlaps(me, b, clearance[n], gap)) || corridors.some(c => overlaps(me, c, 0))) continue;
        const grown = extentOf([...boxes, me]);
        options.push({ x, y, cost: grown.w * grown.h + weight * length(me) });
      }
    }
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
    return { ...positions[inst.index], w: inst.module.area.w, h: inst.module.area.h };
  });
}

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
