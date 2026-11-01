// Belt balancers (ADR 0092): n belts of one item in, m belts out, the minimum m that carries them,
// each out belt carrying the same. A network of splitters on a power of two of lanes P (the bitonic
// merge's pairs), the n in belts on some of its P inputs and the m out belts on some of its P
// outputs, the other outputs left blocked. The network is a list of stages; a stage a list of
// [i, j] lane pairs, each one splitter taking the lanes i and j and giving them back.

const pow2 = n => { let p = 1; while (p < n) p *= 2; return p; };

// Batcher's bitonic merge sorter's pairs: stage by stage, lanes i < j each in one pair.
export function stagesOf(P) {
  const stages = [];
  for (let size = 2; size <= P; size *= 2) {
    // The merge of two halves of `size` lanes: first each lane with its mirror, then halves.
    stages.push(Array.from({ length: P }, (_, i) => i).filter(i => i % size < size / 2).map(i => [i, i - (i % size) + size - 1 - (i % size)]));
    for (let gap = size / 4; gap >= 1; gap /= 2) {
      stages.push(Array.from({ length: P }, (_, i) => i).filter(i => (i & gap) === 0 && (i % size) < size).map(i => [i, i + gap]));
    }
  }
  return stages;
}

// What flows out of the network, one fluid-model step at a time: every lane between two splitters
// holds up to CAP items, each splitter moves up to one item a step from its two input lanes to its
// two output lanes, evenly, what one output cannot take going to the other (backpressure). `ins`:
// lane → what the in belt puts in a step (0 to 1); `live`: the out lanes taking one a step.
// Returns what each out lane took a step, on average over the last steps.
const CAP = 4, STEPS = 700, SETTLED = 250;
export function flowOf(P, stages, ins, live) {
  const depth = stages.length;
  // level[s][lane]: items waiting on the lane before stage s (s = depth: the out lane).
  const level = Array.from({ length: depth + 1 }, () => new Float64Array(P));
  const out = new Float64Array(P);
  for (let step = 0; step < STEPS; step++) {
    const next = level.map(l => Float64Array.from(l));
    // The in belts and the out lanes.
    for (let i = 0; i < P; i++) {
      const put = Math.min(ins[i] ?? 0, CAP - level[0][i]);
      next[0][i] += Math.max(0, put);
      if (live.has(i)) { const took = Math.min(1, level[depth][i]); next[depth][i] -= took; if (step >= SETTLED) out[i] += took; }
    }
    for (let s = 0; s < depth; s++) {
      for (const [a, b] of stages[s]) {
        const have = [Math.min(1, level[s][a]), Math.min(1, level[s][b])];
        const room = [Math.min(1, CAP - level[s + 1][a]), Math.min(1, CAP - level[s + 1][b])];
        const total = Math.min(have[0] + have[1], room[0] + room[1]);
        if (total <= 1e-12) continue;
        let x = Math.min(room[0], total / 2), y = Math.min(room[1], total / 2);
        if (x + y < total) { if (x < room[0]) x = Math.min(room[0], total - y); else y = Math.min(room[1], total - x); }
        const f = (x + y) / (have[0] + have[1]);
        next[s][a] -= have[0] * f; next[s][b] -= have[1] * f;
        next[s + 1][a] += x; next[s + 1][b] += y;
      }
    }
    for (let s = 0; s <= depth; s++) level[s] = next[s];
  }
  return Array.from(out, v => v / (STEPS - SETTLED));
}

// How well a choice of in lanes and out lanes balances: the least of (the worst out lane's share ÷
// the even share) over several loads on the in belts — all full, each one in turn at half, only the
// first out of two at three quarters — with the total never above what the out belts carry. 1 is
// even; below it, the out lanes differ.
export function evenness(P, stages, inLanes, outLanes, load) {
  const live = new Set(outLanes);
  const loads = [
    inLanes.map(() => 1),
    inLanes.map((_, k) => (k % 2 ? 0.5 : 1)),
    inLanes.map((_, k) => (k % 2 ? 0.25 : 0.75)),
  ];
  let worst = 1;
  for (const l of loads) {
    const ins = new Array(P).fill(0);
    inLanes.forEach((lane, k) => { ins[lane] = Math.min(1, l[k] * load); });
    const got = flowOf(P, stages, ins, live);
    const total = inLanes.reduce((s, lane) => s + ins[lane], 0), want = Math.min(total, outLanes.length) / outLanes.length;
    if (want <= 1e-9) continue;
    worst = Math.min(worst, ...outLanes.map(o => got[o] / want));
  }
  return worst;
}

// The balancer for n in belts and m out belts: { P, stages, inLanes, outLanes, evenness }. The lanes
// are searched for the most even: every choice of out lanes (the first m of P in turn, spread over
// the halves, all the combinations when few), the in lanes the first n.
export function designBalancer(n, m, { load = 1 } = {}) {
  const P = pow2(Math.max(n, m, 2));
  const stages = stagesOf(P);
  const inLanes = Array.from({ length: n }, (_, i) => i);
  let best = null;
  for (const outLanes of combinations(P, m)) {
    const e = evenness(P, stages, inLanes, outLanes, load);
    if (!best || e > best.evenness + 1e-9) best = { P, stages, inLanes, outLanes, evenness: e };
    if (e > 0.99) break;
  }
  return best;
}

function* combinations(P, m, start = 0, chosen = []) {
  if (chosen.length === m) { yield chosen; return; }
  for (let i = start; i <= P - (m - chosen.length); i++) yield* combinations(P, m, i + 1, [...chosen, i]);
}

// The out belts a rate needs: its rate over what one belt carries, rounded up (at least one).
export const beltsFor = (rate, perBelt) => Math.max(1, Math.ceil(rate / perBelt - 1e-9));

// ---------------------------------------------------------------------------------------------
// Laying it out (ADR 0092): the balancer east of the block, on the Output Side's east edge. Flows
// west to east; a lane is a row. Between two columns of splitters (and before the first) a channel
// takes each lane from its row to the row of the splitter it enters next: east along its row to a
// track (a vertical run of belt), along that to the new row, and on east. A belt crossing another's
// track goes under it (an underground belt). Tracks of lanes whose rows do not overlap share a
// column; a lane may take a track only to the right of one that has to leave its row first.

const DIRS = { N: 0, E: 4, S: 8, W: 12 };

// One channel's lanes: [{ id, from, to, x0 (its first free column) }] over columns cs … The lanes
// of a cycle (a leaves the row b enters, b the row c enters, c the row a enters) cannot all keep
// their rows to a track: one of them detours through a spare row of `spares` (rows beside the band).
// Returns { width, pieces, tracks } or null where no plan fits: a cycle with no spare left, or a run
// of tracks longer than an underground reaches with no free column to surface in. `style`: how
// tracks are spread, 0 tightest, 1 with two free columns every few, 2 each apart.
export function channelOf(lanes, cs, reach, style = 0, spares = []) {
  const all = lanes.map(l => ({ ...l, rows: [l.from, l.to] }));
  const spare = spares.slice();
  let plan;
  for (;;) {
    plan = planTracks(all, cs, reach, style);
    if (plan.ok) break;
    if (!plan.cycle || !spare.length) return null;
    // A lane of the cycle goes round by the spare row nearest it.
    const lane = all.find(l => plan.cycle.has(String(l.id)) && l.rows.length === 2);
    if (!lane) return null;
    const mid = (lane.from + lane.to) / 2;
    spare.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    lane.rows = [lane.from, spare.shift(), lane.to];
  }
  return plan.result;
}

function planTracks(lanes, cs, reach, style) {
  const range = (a, b) => [Math.min(a, b), Math.max(a, b)];
  const nodes = [];
  for (const l of lanes) for (let i = 1; i < l.rows.length; i++) if (l.rows[i - 1] !== l.rows[i]) nodes.push({ lane: l, i, id: `${l.id}#${i}`, lo: range(l.rows[i - 1], l.rows[i])[0], hi: range(l.rows[i - 1], l.rows[i])[1] });
  const nodesOf = new Map(lanes.map(l => [l.id, nodes.filter(n => n.lane === l)]));
  // Order: a lane's tracks left to right; the lane entering a row after another leaves it to the
  // right of that one's first.
  const before = new Map(nodes.map(n => [n.id, []]));
  for (const l of lanes) {
    const mine = nodesOf.get(l.id);
    for (let k = 1; k < mine.length; k++) before.get(mine[k].id).push(mine[k - 1].id);
    if (!mine.length) continue;
    for (const o of lanes) {
      if (o === l) continue;
      const first = nodesOf.get(o.id)[0];
      if (first && l.rows.at(-1) === o.rows[0]) before.get(mine.at(-1).id).push(first.id);
    }
  }
  // (before.get(x): the tracks x has to lie to the right of.)
  const order = [], state = new Map(), stack = [];
  let cycle = null;
  const visit = id => {
    if (state.get(id) === 2 || cycle) return;
    if (state.get(id) === 1) { cycle = new Set(stack.slice(stack.indexOf(id)).map(x => x.split('#')[0])); return; }
    state.set(id, 1); stack.push(id);
    for (const k of before.get(id)) visit(k);
    stack.pop(); state.set(id, 2); order.push(id);
  };
  for (const n of nodes) visit(n.id);
  if (cycle) return { ok: false, cycle };
  const G = style === 1 ? Math.max(2, reach - 1) : Infinity;
  const columnOf = i => cs + 1 + i + (G === Infinity ? 0 : 2 * Math.floor(i / G));
  const gap = style >= 2 ? style : 1;
  const index = new Map(), byId = new Map(nodes.map(n => [n.id, n]));
  for (const id of order) {
    const n = byId.get(id);
    let i = 0;
    for (const k of before.get(id)) i = Math.max(i, index.get(k) + 1);
    for (;; i++) {
      const col = columnOf(i);
      if (!nodes.some(o => index.has(o.id) && o.lo <= n.hi && n.lo <= o.hi && Math.abs(columnOf(index.get(o.id)) - col) < gap)) break;
    }
    index.set(id, i);
  }
  const colOf = new Map(nodes.map(n => [n.id, columnOf(index.get(n.id))]));
  const width = Math.max(1, nodes.length ? Math.max(...colOf.values()) - cs + 2 : 0);
  const end = cs + width - 1;
  const pieces = [];
  const cross = (self, y, a, b) => nodes.filter(n => n.lane !== self && colOf.get(n.id) >= a && colOf.get(n.id) <= b && y >= n.lo && y <= n.hi).map(n => colOf.get(n.id)).sort((p, q) => p - q);
  for (const l of lanes) {
    const mine = nodesOf.get(l.id);
    // (A lane that keeps its row has one segment, the whole way.)
    for (let r = 0; r < (mine.length ? l.rows.length : 1); r++) {
      const y = l.rows[r];
      const nextNode = mine.find(n => n.i === r + 1);
      const a = r === 0 ? l.x0 : colOf.get(mine.find(n => n.i === r).id) + 1;
      const b = nextNode ? colOf.get(nextNode.id) - 1 : end;
      if (a > b) continue;
      const crossing = cross(l, y, a, b);
      const spans = [];
      for (const x of crossing) {
        const last = spans.at(-1);
        if (last && x === last[1] + 1) last[1] = x; else spans.push([x, x]);
      }
      const tunnels = [];
      for (const [p, q] of spans) {
        const prev = tunnels.at(-1);
        if (prev && p - 1 <= prev[1]) prev[1] = q + 1; else tunnels.push([p - 1, q + 1]);
      }
      for (const [e, q] of tunnels) if (e < a || q > b || q - e > reach) return { ok: false, cycle: null };
      for (let x = a; x <= b; x++) {
        const tun = tunnels.find(([e, q]) => x >= e && x <= q);
        if (!tun) pieces.push({ kind: 'belt', x, y, direction: DIRS.E });
        else if (x === tun[0]) pieces.push({ kind: 'underground-belt', underground: 'input', x, y, direction: DIRS.E });
        else if (x === tun[1]) pieces.push({ kind: 'underground-belt', underground: 'output', x, y, direction: DIRS.E });
      }
    }
    for (const n of mine) {
      const c = colOf.get(n.id), from = l.rows[n.i - 1], to = l.rows[n.i], down = to > from;
      for (let y = n.lo; y <= n.hi; y++) pieces.push({ kind: 'belt', x: c, y, direction: y === to ? DIRS.E : down ? DIRS.S : DIRS.N });
    }
  }
  return { ok: true, result: { width, pieces, tracks: colOf } };
}

// The lanes' rows through the network, relative to the band's top row 0: for each stage, where each
// of its splitters stands (a slot of two rows) and the rows its lanes enter and leave on. Stage 0
// takes the in lanes in order; a later stage's splitters stand in the order of the rows their lanes
// left the stage before on (their mean), the lane that was higher staying on top.
export function arrangement(design, reach = 8) {
  const { P, stages, inLanes } = design;
  const live = new Set(inLanes);
  const rows = Array(P).fill(null);
  const placed = [];
  // A channel's cost: its width in the tightest style that has a plan (a wider style costs more).
  const costOf = lanes => {
    for (const style of [0, 1, 2, 3]) {
      const c = channelOf(lanes, 0, reach, style, Array.from({ length: P }, (_, k) => (k % 2 ? P + 1 + (k >> 1) : -1 - (k >> 1))));
      if (c) return c.width + 1000 * style;
    }
    return Infinity;
  };
  stages.forEach((pairs, s) => {
    const use = pairs.filter(([a, b]) => live.has(a) || live.has(b));
    const prev = rows.slice();
    // Splitters in slots, each with its orientation (which lane is on top).
    const layout = order => {
      const out = prev.slice();
      order.forEach(({ a, b, flip }, slot) => {
        const [top, bottom] = flip ? [b, a] : [a, b];
        out[top] = 2 * slot; out[bottom] = 2 * slot + 1;
      });
      return out;
    };
    const cost = order => {
      if (s === 0) return 0;
      const next = layout(order);
      const lanes = [];
      for (let l = 0; l < P; l++) if (prev[l] !== null && next[l] !== null && (live.has(l))) lanes.push({ id: l, from: prev[l], to: next[l], x0: 0 });
      return costOf(lanes);
    };
    const mean = ([a, b]) => ((prev[a] ?? prev[b]) + (prev[b] ?? prev[a])) / 2;
    let order = use.map(([a, b]) => ({ a, b, flip: s > 0 && (prev[a] ?? Infinity) > (prev[b] ?? Infinity) }));
    order.sort((p, q) => (s === 0 ? Math.min(p.a, p.b) - Math.min(q.a, q.b) : mean([p.a, p.b]) - mean([q.a, q.b])) || p.a - q.a);
    if (s > 0) {
      // The cheapest slots and orientations: all of them for few splitters, else by swaps.
      let best = cost(order);
      if (order.length <= 4) {
        const permute = (rest, chosen) => rest.length ? rest.flatMap((x, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...chosen, x])) : [chosen];
        for (const perm of permute(order, [])) {
          for (let mask = 0; mask < 1 << perm.length; mask++) {
            const cand = perm.map((x, i) => ({ a: x.a, b: x.b, flip: (mask >> i) & 1 ? !x.flip : x.flip }));
            const c = cost(cand);
            if (c < best) [best, order] = [c, cand];
          }
        }
      } else {
        for (let improved = true, rounds = 0; improved && rounds < 6; rounds++) {
          improved = false;
          for (let i = 0; i < order.length; i++) {
            const flipped = order.map((x, k) => (k === i ? { ...x, flip: !x.flip } : x));
            const c = cost(flipped);
            if (c < best) { [best, order, improved] = [c, flipped, true]; }
            for (let j = i + 1; j < order.length; j++) {
              const swapped = order.slice(); [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
              const d = cost(swapped);
              if (d < best) { [best, order, improved] = [d, swapped, true]; }
            }
          }
        }
      }
    }
    const next = layout(order);
    for (let l = 0; l < P; l++) rows[l] = next[l];
    for (const [a, b] of pairs) if (live.has(a) || live.has(b)) { live.add(a); live.add(b); }
    placed.push({ splitters: order.map(({ a, b, flip }, slot) => ({ a, b, top: flip ? b : a, bottom: flip ? a : b, slot, y: 2 * slot })), entering: prev, leaving: rows.slice() });
  });
  return { placed, P };
}

// The balancer's entities, laid from the block's output belts: ends [{ x, y }] (the last tile of
// each belt that goes in, facing east), through [{ x, y }] (other belts leaving across the same edge,
// carried straight on past the balancer's input channel), names { belt, underground, splitter, reach },
// free(x, y) (whether a tile is free to build on), limits { x1 (the last column to use), y0, y1 (the
// rows it may use) }, pipes (rows of pipes leaving: never crossed by a track). Returns
// { entities, x0, x1, y0, y1, outputs: [{ x, y }] } or null where it does not fit.
export function layBalancer(design, ends, through, names, free, limits, pipes = []) {
  const { placed, P } = arrangement(design, names.reach);
  const ins = ends.slice().sort((a, b) => a.y - b.y);
  const x0 = ins[0].x + 1;
  for (const style of [0, 1, 2, 3]) {
    const result = tryStyle(style);
    if (result) return result;
  }
  return null;

  function tryStyle(style) {
    // Lanes of channel s (between stage s - 1 and s): every lane that left stage s - 1 and enters s.
    const laneRows = (s) => {
      const out = [];
      const prev = placed[s - 1].leaving, now = placed[s].leaving;
      for (let l = 0; l < P; l++) {
        if (now[l] === null || now[l] === undefined) continue;
        const from = prev[l];
        if (from === null || from === undefined) continue;
        out.push({ id: l, from, to: now[l] });
      }
      return out;
    };
    const first = placed[0];
    // Rows beside the band a lane may detour by, nearest first.
    const spareRows = top => Array.from({ length: P }, (_, k) => (k % 2 ? top + P + (k >> 1) : top - 1 - (k >> 1))).filter(y => y >= limits.y0 && y <= limits.y1);
    // Splitter columns and channels, relative columns assigned after the input channel's width.
    // Candidate bands, nearest the ends first.
    const lo = limits.y0, hi = limits.y1 - P + 1;
    const mid = (ins[0].y + ins.at(-1).y) / 2 - P / 2;
    const tops = [];
    for (let t = lo; t <= hi; t++) tops.push(t);
    tops.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    for (const top of tops.slice(0, 80)) {
      if (pipes.some(y => y >= Math.min(top, ins[0].y) && y <= Math.max(top + P - 1, ins.at(-1).y))) continue;
      // The input channel: each belt to the row its lane enters stage 0 on; the others straight.
      const lanes = ins.map((e, k) => ({ id: `in${k}`, from: e.y, to: top + first.leaving[design.inLanes[k]], x0 }));
      const span = [Math.min(top, ...ins.map(e => e.y)), Math.max(top + P - 1, ...ins.map(e => e.y))];
      for (const t of through) if (t.y >= span[0] && t.y <= span[1]) lanes.push({ id: `through${t.y}`, from: t.y, to: t.y, x0: t.x + 1 });
      // A through belt may not stand on the band's rows (the splitters and tracks lie there).
      if (through.some(t => t.y >= top && t.y < top + P)) continue;
      const input = channelOf(lanes, x0, names.reach, style, spareRows(top));
      if (!input) continue;
      const entities = [];
      const add = (p, extra = {}) => entities.push({ w: 1, h: 1, travel: p.direction, balancer: true, ...p, ...extra });
      const belt = p => (p.kind === 'underground-belt' ? { ...p, name: names.underground } : { ...p, name: names.belt });
      for (const p of input.pieces) add(belt(p));
      let x = x0 + input.width;
      const outputs = [];
      for (let s = 0; s < placed.length; s++) {
        if (s > 0) {
          const shift = x;
          const moved = channelOf(laneRows(s).map(l => ({ ...l, from: l.from + top, to: l.to + top, x0: shift })), shift, names.reach, style, spareRows(top));
          if (!moved) return null;
          for (const p of moved.pieces) add(belt(p));
          x += moved.width;
        }
        for (const sp of placed[s].splitters) entities.push({ name: names.splitter, kind: 'splitter', x, y: top + sp.y, w: 1, h: 2, direction: DIRS.E, travel: DIRS.E, balancer: true });
        x++;
      }
      // The out belts: one tile on from each live lane's last splitter.
      const last = placed.at(-1);
      for (const l of design.outLanes) {
        const y = last.leaving[l];
        if (y === null || y === undefined) continue;
        add({ name: names.belt, kind: 'belt', x, y: top + y, direction: DIRS.E });
        outputs.push({ x, y: top + y });
      }
      const x1 = x;
      if (x1 > limits.x1) continue;
      const seen = new Set();
      let fits = true;
      for (const e of entities) {
        for (let dy = 0; dy < e.h; dy++) {
          const k = `${e.x},${e.y + dy}`;
          if (seen.has(k) || !free(e.x, e.y + dy)) { fits = false; break; }
          seen.add(k);
        }
        if (!fits) break;
      }
      if (!fits) continue;
      return { entities, x0, x1, y0: top, y1: top + P - 1, outputs, style };
    }
    return null;
  }
}

// The belts as built, followed the way items move: { ok, problems, splitters: [{ inputs: [from…],
// outputs: [to…] }] , sources, sinks }. Used to check a layout really is the network it was made
// from (a tile fed from two sides, an underground without its end, a belt leading nowhere).
// ends: [{ x, y }] the tiles the in belts arrive from (facing east onto the first tile).
export function traceBalancer(entities, ends, reach = 5) {
  const at = new Map();
  const problems = [];
  for (const e of entities) for (let dy = 0; dy < e.h; dy++) at.set(`${e.x},${e.y + dy}`, e);
  const splitters = entities.filter(e => e.kind === 'splitter');
  const id = new Map(splitters.map((s, i) => [s, i]));
  const exitOf = e => {
    for (let d = 1; d <= reach; d++) {
      const q = at.get(`${e.x + d},${e.y}`);
      if (q?.kind === 'underground-belt' && q.underground === 'output' && q.direction === e.direction) return q;
      if (q?.kind === 'underground-belt' && q.underground === 'input' && q.direction === e.direction) break;
    }
    problems.push(`underground at ${e.x},${e.y} has no end`);
    return null;
  };
  const VEC = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] };
  // Where a tile's items go on to: the entity at the tile ahead, entered from `from` (the tile
  // they come from), as { splitter, side } or { out: tile } or null.
  const feeders = new Map();
  const feed = (tile, from) => { const k = `${tile.x},${tile.y}`; if (!feeders.has(k)) feeders.set(k, []); feeders.get(k).push(from); };
  // Follow from a tile an item arrives at, heading `dir` from tile `prev`.
  const follow = (x, y, prev, seen = new Set()) => {
    const e = at.get(`${x},${y}`);
    if (!e) return prev.pseudo ? null : { out: { x: prev.x, y: prev.y } };
    const key = `${x},${y}`;
    if (seen.has(key)) { problems.push(`loop at ${key}`); return null; }
    seen.add(key);
    if (e.kind === 'splitter') {
      if (e.direction !== 4) problems.push(`splitter at ${key} not facing east`);
      if (prev.x !== x - 1) problems.push(`splitter at ${key} entered from the side`);
      return { splitter: id.get(e), side: y - e.y };
    }
    feed(e, prev);
    if (e.kind === 'underground-belt' && e.underground === 'input') {
      const q = exitOf(e);
      if (!q) return null;
      feed(q, { x: q.x - 1, y: q.y, tunnel: true });
      return follow(q.x + 1, q.y, q, seen);
    }
    if (e.kind === 'underground-belt') { problems.push(`underground output at ${key} entered from outside`); return null; }
    const [dx, dy] = VEC[e.direction];
    return follow(x + dx, y + dy, e, seen);
  };
  const links = splitters.map(s => [0, 1].map(k => follow(s.x + 1, s.y + k, { x: s.x, y: s.y + k, pseudo: true })));
  const sources = ends.map(e => follow(e.x + 1, e.y, { ...e, pseudo: true }));
  // A belt tile with two feeders is side-loaded (or a head-on meeting): a curve has one.
  for (const [k, from] of feeders) {
    const e = at.get(k);
    const real = from.filter(f => !f.tunnel);
    if (e.kind === 'belt' && real.length > 1) problems.push(`belt at ${k} fed from ${real.length} tiles`);
  }
  return { ok: problems.length === 0, problems, splitters: splitters.map(s => ({ x: s.x, y: s.y })), links, sources };
}

// The fluid model's flow through a traced network: what each out belt carries when the in belts
// put `ins` (one per end) in. Same steps as flowOf, on the traced splitters.
export function flowOfTrace(trace, ins, steps = 2000) {
  const N = trace.splitters.length;
  const inLevel = Array.from({ length: N }, () => [0, 0]);
  const total = new Map();
  for (let t = 0; t < steps; t++) {
    const next = inLevel.map(l => l.slice());
    trace.sources.forEach((s, i) => {
      if (!s?.splitter && s?.splitter !== 0) return;
      const put = Math.min(ins[i], CAP - inLevel[s.splitter][s.side]);
      if (put > 0) next[s.splitter][s.side] += put;
    });
    for (let i = 0; i < N; i++) {
      const have = inLevel[i].map(v => Math.min(1, v));
      const room = trace.links[i].map(l => (l?.out ? 1 : l ? Math.min(1, CAP - inLevel[l.splitter][l.side]) : 0));
      const sum = have[0] + have[1], cap = room[0] + room[1];
      const tot = Math.min(sum, cap);
      if (tot <= 1e-12) continue;
      let x = Math.min(room[0], tot / 2), y = Math.min(room[1], tot / 2);
      if (x + y < tot) { if (x < room[0]) x = Math.min(room[0], tot - y); else y = Math.min(room[1], tot - x); }
      const f = (x + y) / sum;
      next[i][0] -= have[0] * f; next[i][1] -= have[1] * f;
      [x, y].forEach((v, k) => {
        const l = trace.links[i][k];
        if (l?.splitter !== undefined) next[l.splitter][l.side] += v;
        else if (l?.out && t >= steps / 2) { const key = `${l.out.x},${l.out.y}`; total.set(key, (total.get(key) ?? 0) + v); }
      });
    }
    for (let i = 0; i < N; i++) inLevel[i] = next[i];
  }
  return total;
}

// ---------------------------------------------------------------------------------------------
// In a block (ADR 0092).

const designs = new Map();
const designFor = (n, m, load) => {
  const key = `${n}-${m}-${Math.round(load * 10)}`;
  if (!designs.has(key)) designs.set(key, designBalancer(n, m, { load }));
  return designs.get(key);
};

const namesOf = (catalog, belt) => {
  const spec = catalog.belts[belt];
  return { belt, underground: spec.underground.name, splitter: spec.splitter ?? belt.replace(/transport-belt$/, 'splitter'), reach: spec.underground.maxDistance - 1 };
};

// The columns a balancer for `rate` of an item takes at least: laid out with as many in belts as
// out belts, at the widest. 0 where one belt carries it.
export function balancerWidth(rate, catalog, belt) {
  const perBelt = catalog.belts[belt].itemsPerSecond * 60;
  const m = beltsFor(rate, perBelt);
  if (m < 2) return 0;
  const design = designFor(m, m, 1);
  const ends = Array.from({ length: m }, (_, k) => ({ x: 0, y: 4 * k }));
  const laid = layBalancer(design, ends, [], namesOf(catalog, belt), () => true, { x1: 1e6, y0: -1e3, y1: 1e3 });
  return laid ? laid.x1 - laid.x0 + 1 : 0;
}

// The block with a balancer for `item` built east of it: every belt leaving across the east edge
// with only that item goes into it, and as many belts as its rate needs come out. Returns
// { block, note } — block is the block itself when nothing is built, note says why or what.
export function balanceBlock(block, catalog, item) {
  const belt = block.entities.find(e => e.kind === 'belt')?.name;
  if (!belt) return { block, note: null };
  const leaving = (block.routes ?? []).filter(r => r.sink === 'side-output' && r.joins === undefined);
  const mine = leaving.filter(r => r.kind === 'belt' && r.items.some(i => i.item === item && i.rate > 1e-9));
  if (!mine.length) return { block, note: null };
  const out = block.out ?? 4;
  if (out !== 4) return { block, note: `The belt balancer for ${item} stands east of the block: not built with the Output Side up or down.` };
  if (mine.some(r => r.items.filter(i => i.rate > 1e-9).length > 1)) return { block, note: `The belt balancer for ${item} needs belts with only ${item}: turn on One Item a Belt.` };
  const ends = mine.map(r => r.pieces.at(-1));
  if (ends.some(p => p.travel !== 4)) return { block, note: `The belt balancer for ${item} found a belt not leaving east.` };
  const total = mine.reduce((s, r) => s + r.items.reduce((t, i) => t + (i.item === item ? i.rate : 0), 0), 0);
  const perBelt = catalog.belts[belt].itemsPerSecond * 60;
  const n = ends.length, m = Math.min(n, beltsFor(total, perBelt));
  if (n === 1) return { block, note: null };
  const names = namesOf(catalog, belt);
  const design = designFor(n, m, Math.min(1, total / (n * perBelt)));
  const taken = new Set([...block.entities, ...(block.site?.fixtures ?? [])].flatMap(e => Array.from({ length: e.w * e.h }, (_, i) => `${e.x + (i % e.w)},${e.y + Math.floor(i / e.w)}`)));
  const area = block.site?.area, { bounds } = block;
  const free = (x, y) => !taken.has(`${x},${y}`) && (!area || (x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h));
  const limits = area ? { x1: area.x + area.w - 1, y0: area.y, y1: area.y + area.h - 1 } : { x1: bounds.x + bounds.w + 400, y0: bounds.y - 4 * n, y1: bounds.y + bounds.h + 4 * n };
  const others = leaving.filter(r => !mine.includes(r));
  const through = others.filter(r => r.kind === 'belt' && r.pieces.length && r.pieces.at(-1).travel === 4).map(r => r.pieces.at(-1));
  const pipes = others.filter(r => r.kind === 'pipe' && r.pieces.length).map(r => r.pieces.at(-1).y);
  const laid = layBalancer(design, ends, through, names, free, limits, pipes);
  if (!laid) return { block, note: `No room for a belt balancer for ${item} (${n} belts to ${m}) east of the block: give the Buffer more tiles.` };
  // (The balancer's belts belong to a route of their own, as every belt does: it carries what the
  // out belts do, goes nowhere and is no Side Output.)
  const id = Math.max(-1, ...block.routes.map(r => r.id)) + 1;
  const entities = laid.entities.map(e => (e.kind === 'splitter' ? e : { ...e, route: id }));
  const routes = [...block.routes.map(r => (mine.includes(r) ? { ...r, balanced: true } : r)),
    { id, kind: 'belt', source: 'balancer', sink: null, balancer: true, items: [{ item, rate: total, supply: total, capacity: total, lane: 'out' }], consumers: [], pieces: entities.filter(e => e.kind !== 'splitter') }];
  const balancer = { item, n, m, rate: total, evenness: design.evenness, x0: laid.x0, x1: laid.x1, y0: laid.y0, y1: laid.y1, outputs: laid.outputs };
  return {
    block: { ...block, entities: [...block.entities, ...entities], routes, balancer },
    note: `Belt balancer for ${item}: ${n} belts in, ${m} out (${laid.x1 - laid.x0 + 1} × ${laid.y1 - laid.y0 + 1} tiles, ${Math.round(design.evenness * 100)}% even at this load).`,
  };
}
