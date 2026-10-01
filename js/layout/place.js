// Where each copy of each module stands in the Compound Block. Belts run west to east through
// every module, so a Sub-Block stands west of the ones it feeds. Sub-Blocks are placed from the
// Goals westward (bottom-up in reverse: consumers first), each as far east as its consumers
// allow, level with the entries of the belts it feeds; where that spot is taken it slides west,
// up or down, whichever grows the block least and keeps its links short, and it keeps clear of
// the rows other Sub-Blocks' Side Inputs arrive on. Corridors between a Sub-Block and its
// consumers hold the links. Returns each copy's top-left corner (its module's area).
// params: { corridor, gap, stack, order: { [step]: number } (nudges the placing order),
//           lift: { [step]: number } (nudges a Sub-Block up or down), weight (link length cost) }
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
    && slot.inst.step === i && r.slots[k - 1].inst.step === i)).length);
  const trunks = (i, side) => routes.filter(r => r.kind === 'pipe' && r.stubs.filter(st => st.inst.step === i && st.side === side).length > 1).length;
  // Many copies stand in several columns (compose.js decides which), so the Sub-Block comes out
  // about square: the odd columns bottom to top, hanging from the bottom. Copies of later
  // columns get their own belts through gaps left between the copies of earlier ones.
  const solo = i => routes.filter(r => r.kind === 'belt' && r.slots.length === 1 && r.slots[0].inst.step === i).length;
  const blocks = steps.map(i => {
    const mine = instances.filter(inst => inst.step === i);
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
  const links = [];
  for (const route of routes.filter(r => r.kind === 'belt')) {
    route.slots.forEach((slot, k) => {
      const at = blocks[slot.inst.step].at.get(slot.inst.index).y;
      if (k === 0 && route.source === 'side-input') blocks[slot.inst.step].entries.push(at + entryY(slot));
      const next = route.slots[k + 1];
      if (!next || next.inst.step === slot.inst.step) return;
      links.push({
        from: slot.inst.step, to: next.inst.step, fromY: at + exitY(slot),
        toY: blocks[next.inst.step].at.get(next.inst.index).y + entryY(next),
      });
    });
  }
  for (const route of routes.filter(r => r.kind === 'pipe')) {
    for (const stub of route.stubs) {
      const at = blocks[stub.inst.step].at.get(stub.inst.index).y + stub.y - stub.inst.module.area.y;
      if (route.source === 'side-input' && stub.side === 'W') blocks[stub.inst.step].entries.push(at);
      if (typeof route.source !== 'number' || stub.inst.step !== route.source || stub.side !== 'E') continue;
      for (const to of route.stubs.filter(s => s.inst.step !== route.source && s.side === 'W')) {
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

  const positions = [];
  for (const b of blocks) {
    const at = placed.get(b.step);
    for (const inst of b.instances) positions[inst.index] = { x: at.x + b.at.get(inst.index).x, y: at.y + b.at.get(inst.index).y };
  }
  // Shifted to start at 0,0; `bounds` covers every Sub-Block with the room beside its stack.
  const boxes = blocks.map(b => ({ ...placed.get(b.step), w: b.w, h: b.h }));
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
  /** @type {any} */
  const out = positions.map(p => ({ x: p.x - x0, y: p.y - y0 }));
  out.bounds = {
    x: 0, y: 0, w: Math.max(...boxes.map(b => b.x + b.w)) - x0, h: Math.max(...boxes.map(b => b.y + b.h)) - y0,
  };
  return out;
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
