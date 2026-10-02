import { context, designStep, designOf, random, breakoutDesign, detachCopy } from './design.js';
import { LayoutError } from './layout/core.js';
import { prepare, compose, leastStarvation, RoutingError, PowerError } from './layout/compose.js';
import { placeBlocks } from './layout/place.js';
import { finishBlock } from './layout/compact.js';
import { validateBlock } from './layout/validity.js';
import { simulate } from './sim.js';

// Anytime layout search, bottom-up (ADR 0005). First every Sub-Block is designed on its own,
// from the leaves of the Production Chain up to the Goals: candidate layouts of its machines and
// belts, each routed once as a Module (huge Sub-Blocks repeat one module). Then Compound Blocks
// are put together from those designs: placed, linked, powered and checked. Each one that beats
// the best so far is yielded — Starvation first (a layout whose machines starve, for want of
// belts, lanes or inserters, is no answer), then bounding-box area, then entity count — and
// refined: its Sub-Blocks slid, and machines broken out of them into gaps (Breakout, ADR 0006).
// Later candidates try other designs and placements. Deterministic for a given seed and
// candidate count.
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

  // Breakout designs, built the first time the search tries them (with a random source of their
  // own, so the rest of the search draws as it would without them): a Sub-Block's designs for
  // a share of its machines, put together as the machines left and the ones broken out. Only
  // the structured variants: random draws take long and seldom pack a share tighter.
  const breakRng = random(seed + 1);
  const shares = new Map();
  const shareOf = (i, machines, rest) => {
    const k = `${i}:${machines}:${rest}`;
    if (!shares.has(k)) {
      let list = null;
      try {
        list = designStep(ctx, i, breakRng, { now, deadline, machines, rest, draws: 0 });
      } catch (e) {
        if (!(e instanceof LayoutError)) throw e;
      }
      shares.set(k, list);
    }
    return shares.get(k);
  };
  const broken = new Map();
  // A candidate's design for Sub-Block i: its choice, with machines broken out of it where the
  // candidate says so ('copy': a repeated module's leftover or a copy; 'n': n machines each apart;
  // 'ng': n machines together).
  const designFor = (candidate, i) => {
    const c = Math.min(candidate.choice[i], designs[i].length - 1);
    const base = designOf(designs[i][c]);
    const spec = candidate.breakout?.[i];
    if (!spec || !base) return base;
    const k = `${i}:${c}:${spec}`;
    if (!broken.has(k)) {
      const n = parseInt(spec, 10), group = spec.endsWith('g');
      broken.set(k, spec === 'copy' ? detachCopy(base)
        : breakoutDesign(shareOf(i, ctx.plan[i].count - n, true), shareOf(i, group ? n : 1, false), group ? 1 : n));
    }
    return broken.get(k);
  };

  let best = null;
  let failure = null;
  let tried = 0;
  const prepared = new Map();
  // Breakout trials, each with the Sub-Block and spec it tries: routed only where they look
  // promising once placed.
  const trials = new WeakMap();
  const first = { choice: ctx.plan.map(() => 0), columns: ctx.plan.map(() => null), corridor: 2, gap: 1, weight: 4, lift: {}, order: {}, shift: {} };
  const queue = [first, ...sweep(first, designs)];
  // Each new best is refined first: every Sub-Block slid a few tiles each way, and Breakouts.
  let refining = [];
  while (tried < maxCandidates && (tried === 0 || now() < deadline)) {
    const candidate = queue.length ? queue.shift() : refining.length ? refining.shift() : mutate(best?.candidate ?? first, designs, rng);
    tried++;
    const k = `${candidate.choice.join()}|${candidate.columns.join()}|${JSON.stringify(candidate.breakout ?? {})}`;
    if (!prepared.has(k)) {
      // Each Sub-Block's chosen design, routed now if this is the first time it is tried.
      const chosen = candidate.choice.map((c, i) => designFor(candidate, i));
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
    // A layout whose belts and inserters starve more than the best's cannot beat it, however it
    // is placed.
    ready.least ??= Math.round(leastStarvation(ctx, ready) * 1000) / 1000;
    if (best && ready.least > best.score[0]) continue;
    let block, placed;
    try {
      const positions = placeBlocks(ctx, ready, candidate);
      placed = positions.bounds.w * positions.bounds.h;
      // A Breakout trial packs no looser than the best, or it is not worth routing. Where one
      // machine broken out does, more of that Sub-Block's are tried too.
      const trial = trials.get(candidate);
      if (trial && placed > best.placed) continue;
      if (trial?.spec === '1') refining.push(...register(more(best.candidate, trial.step, ctx.plan[trial.step])));
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
      best = { candidate, score, placed };
      // A Breakout trial after every two slides (a lone Sub-Block has no gaps to fill).
      const trying = ctx.plan.length > 1 ? register(breakouts(candidate, ctx.plan, designs)) : [];
      const sliding = slides(candidate, ctx.plan.length);
      refining = Array.from({ length: Math.max(trying.length, Math.ceil(sliding.length / 2)) }, (_, j) => [sliding[2 * j], sliding[2 * j + 1], trying[j]]).flat().filter(Boolean);
      yield { block, score, tried };
    }
  }
  return { tried, failure };

  // Breakout trials as candidates, each remembered with what it tries.
  function register(list) {
    for (const t of list) trials.set(t.candidate, t);
    return list.map(t => t.candidate);
  }
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

// Breakout trials on a layout, as { candidate, step, spec }: one machine of each Sub-Block broken
// out of it in turn (of a repeated module, its leftover module or a copy), so what is left packs
// smaller and it stands in a gap; and where machines already stand apart, their next best spots.
function breakouts(base, plan, designs) {
  const out = [];
  plan.forEach((sb, step) => {
    if (base.breakout?.[step]) return;
    const copies = designs[step][Math.min(base.choice[step], designs[step].length - 1)]?.design?.copies;
    if (copies || sb.count > 1) out.push(breakout(base, step, copies ? 'copy' : '1'));
  });
  for (const step of Object.keys(base.breakout ?? {})) {
    for (const r of [1, 2]) out.push({ candidate: { ...base, spot: { ...base.spot, [step]: (base.spot?.[step] ?? 0) + r } }, step: Number(step), spec: 'spot' });
  }
  return out;
}

// More of a Sub-Block's machines broken out: two or three together, or each apart.
function more(base, step, sb) {
  return ['2g', '3g', '2', '3'].filter(spec => sb.count > parseInt(spec, 10)).map(spec => breakout(base, step, spec));
}

const breakout = (base, step, spec) => ({ candidate: { ...base, breakout: { ...base.breakout, [step]: spec } }, step, spec });

// Refinement: a layout's Sub-Blocks (and the machines broken out of them, `a<step>`) each slid
// 8, 4, 2 or 1 tiles west, east, north or south of where it stands, the longest slides first,
// its box free to reach into a neighbour's empty corner (compose rejects copies landing on each
// other), so the block packs tighter than rectangles side by side.
function slides(base, n) {
  const out = [];
  const keys = [...Array(n).keys(), ...Object.keys(base.breakout ?? {}).map(i => `a${i}`)];
  for (const k of [8, 4, 2, 1]) {
    for (const i of keys) {
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
