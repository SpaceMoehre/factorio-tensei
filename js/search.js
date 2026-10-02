import { context, designStep, designOf, random } from './design.js';
import { prepare, compose, RoutingError, PowerError } from './layout/compose.js';
import { placeBlocks } from './layout/place.js';
import { finishBlock } from './layout/compact.js';
import { validateBlock } from './layout/validity.js';
import { simulate } from './sim.js';

// Anytime layout search, bottom-up (ADR 0005). First every Sub-Block is designed on its own,
// from the leaves of the Production Chain up to the Goals: candidate layouts of its machines and
// belts, each routed once as a Module (huge Sub-Blocks repeat one module). Then Compound Blocks
// are put together from those designs: placed, linked, powered and checked. Each one that beats
// the best so far is yielded — Starvation first (a layout whose machines starve, for want of
// belts, lanes or inserters, is no answer), then bounding-box area, then entity count. Later
// candidates try other designs and placements. Deterministic for a given seed and candidate
// count.
// options: { seed, maxCandidates, deadline (ms timestamp), now, trace (called with each
//            candidate's choices and the error that sank it, for diagnostics) }
export function* search(entries, catalog, logistics, options = {}) {
  const { seed = 1, maxCandidates = Infinity, deadline = Infinity, now = () => Date.now(), trace = () => {} } = options;
  const rng = random(seed);
  const ctx = context(entries, catalog, logistics);
  // Leaves first: every Sub-Block before the ones it feeds.
  const order = [...ctx.flows.order];
  const designs = [];
  for (const i of order) designs[i] = designStep(ctx, i, rng, { now, deadline });

  let best = null;
  let failure = null;
  let tried = 0;
  const prepared = new Map();
  const first = { choice: ctx.plan.map(() => 0), columns: ctx.plan.map(() => null), corridor: 2, gap: 1, weight: 4, lift: {}, order: {}, shift: {} };
  const queue = [first, ...sweep(first, designs)];
  // Each new best is refined first: every Sub-Block slid a few tiles each way.
  let refining = [];
  while (tried < maxCandidates && (tried === 0 || now() < deadline)) {
    const candidate = queue.length ? queue.shift() : refining.length ? refining.shift() : mutate(best?.candidate ?? first, designs, rng);
    tried++;
    const k = `${candidate.choice.join()}|${candidate.columns.join()}`;
    if (!prepared.has(k)) {
      // Each Sub-Block's chosen design, routed now if this is the first time it is tried.
      const chosen = candidate.choice.map((c, i) => designOf(designs[i][Math.min(c, designs[i].length - 1)]));
      let ready = null;
      try {
        if (chosen.every(Boolean)) ready = prepare(ctx, chosen, candidate.columns);
      } catch (e) {
        // Designs whose belts cannot chain into each other.
        if (!(e instanceof RoutingError)) throw e;
        failure = e;
        trace(candidate, e);
      }
      prepared.set(k, ready);
    }
    const ready = prepared.get(k);
    if (!ready) continue;
    let block;
    try {
      const positions = shifted(placeBlocks(ctx, ready, candidate), ready.instances, candidate.shift);
      const layout = { margin: { w: 0, e: 0, n: 1, s: 1 } };
      let composed;
      try {
        composed = compose(ctx, ready, positions, layout);
      } catch (e) {
        // Splitters took the room a link needed: the same layout without them.
        if (!(e instanceof RoutingError) || !ready.routes.some(r => r.splitter)) throw e;
        composed = compose(ctx, ready, positions, { ...layout, plain: true });
      }
      block = finishBlock(composed, catalog, logistics);
    } catch (e) {
      if (!(e instanceof RoutingError || e instanceof PowerError)) throw e;
      failure = e;
      trace(candidate, e);
      continue;
    }
    const problems = validateBlock(block, catalog, logistics);
    if (problems.length) {
      failure = new Error(`invalid layout: ${problems[0]}`);
      trace(candidate, failure);
      continue;
    }
    const starving = simulate(block).starvation.reduce((sum, s) => sum + s.demand - s.available, 0);
    const score = [Math.round(starving * 1000) / 1000, block.bounds.w * block.bounds.h, block.entities.length];
    if (!best || better(score, best.score)) {
      best = { candidate, score };
      refining = slides(candidate, ctx.plan.length);
      yield { block, score, tried };
    }
  }
  return { tried, failure };
}

// First the best design of every Sub-Block with roomier and tighter placements, then each
// Sub-Block's other designs in turn.
function sweep(first, designs) {
  const list = [first];
  for (const corridor of [3, 1]) list.push({ ...first, corridor });
  list.push({ ...first, gap: 2 }, { ...first, weight: 1 }, { ...first, weight: 12 });
  designs.forEach((d, i) => {
    for (let c = 1; c < d.length; c++) list.push({ ...first, choice: first.choice.map((v, j) => (j === i ? c : v)) });
  });
  // A repeated module's copies in about as many columns as make it square, and in two.
  designs.forEach((d, i) => {
    if (!d[0]?.copies) return;
    for (const k of [0, 2]) list.push({ ...first, columns: first.columns.map((v, j) => (j === i ? k : v)) });
  });
  return list.slice(1);
}

// Refinement: a Sub-Block moved bodily after placement, its box free to reach into a
// neighbour's empty corner (compose rejects copies landing on each other), so the block packs
// tighter than rectangles side by side.
function shifted(positions, instances, shift = {}) {
  /** @type {any} */
  const out = positions.map((p, n) => {
    const [dx, dy] = shift[instances[n].step] ?? [0, 0];
    return { x: p.x + dx, y: p.y + dy };
  });
  out.bounds = positions.bounds;
  return out;
}

// A layout's Sub-Blocks each slid 8, 4, 2 or 1 tiles west, east, north or south of where it
// stands, the longest slides first.
function slides(base, n) {
  const out = [];
  for (const k of [8, 4, 2, 1]) {
    for (let i = 0; i < n; i++) {
      const [dx, dy] = base.shift?.[i] ?? [0, 0];
      for (const [sx, sy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) out.push({ ...base, shift: { ...base.shift, [i]: [dx + sx, dy + sy] } });
    }
  }
  return out;
}

function mutate(base, designs, rng) {
  const c = structuredClone(base);
  const n = designs.length;
  const moves = 1 + Math.floor(rng() * 2);
  for (let m = 0; m < moves; m++) {
    const i = Math.floor(rng() * n);
    switch (Math.floor(rng() * 7)) {
      // How many columns a Sub-Block's copies stand in (when it repeats a module).
      case 6: c.columns[i] = choose([null, 0, 2, 3, 4], rng); break;
      case 0: c.choice[i] = Math.floor(rng() * designs[i].length); break;
      case 1: c.corridor = clamp(c.corridor + (rng() < 0.5 ? -1 : 1), 1, 6); break;
      case 2: c.gap = clamp(c.gap + (rng() < 0.5 ? -1 : 1), 1, 4); break;
      case 3: c.weight = choose([1, 2, 4, 8, 16], rng); break;
      case 4: c.lift[i] = (c.lift[i] ?? 0) + Math.round((rng() - 0.5) * 12); break;
      default: c.order[i] = (c.order[i] ?? 0) + (rng() < 0.5 ? -1 : 1);
    }
  }
  return c;
}

function better(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

const choose = (list, rng) => list[Math.floor(rng() * list.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
