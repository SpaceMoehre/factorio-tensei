import { context, designStep, designOf, revive, random, breakoutDesign, detachCopy, leaveOut, grownDesign } from './design.js';
import { LayoutError } from './layout/core.js';
import { prepare, compose, leastStarvation, RoutingError, PowerError } from './layout/compose.js';
import { placeBlocks, roomFor } from './layout/place.js';
import { finishBlock } from './layout/compact.js';
import { validateBlock } from './layout/validity.js';
import { simulate } from './sim.js';
import { compactness } from './layout/score.js';

// Anytime layout search, bottom-up (ADR 0005). First every Sub-Block is designed on its own,
// from the leaves of the Production Chain up to the Goals: candidate layouts of its machines and
// belts, each routed once as a Module (huge Sub-Blocks repeat one module). Then Compound Blocks
// are put together from those designs: placed, linked, powered and checked. Each one that beats
// the best so far is yielded — Starvation first (a layout whose machines starve, for want of
// belts, lanes or inserters, is no answer), then Compactness (score.js: square first, then empty
// tiles, then the bends of its belts and pipes), then entity count — and
// refined: its Sub-Blocks slid, and machines broken out of them into gaps (Breakout, ADR 0006).
// Later candidates try other designs and placements. Deterministic for a given seed and
// candidate count.
// options: { seed, maxCandidates, deadline (ms timestamp), now, trace (called with each
//            candidate's choices and the error that sank it, for diagnostics), site (the City
//            Block to build in, from city.js siteOf; where none of the structured candidates
//            and `patience` more fits, the search gives up), perfect (only a layout without
//            Starvation counts: designs and layouts that starve are passed over unbuilt, and the
//            search gives up `patience` candidates after the structured ones; it ends at once, with
//            `starves` set, when a Sub-Block cannot be designed without), precheck (with perfect:
//            the Side Output's Sub-Blocks are checked first), designed (called once the
//            Sub-Blocks are designed, with each one's item, Count and its best design's area) }
// Yields { block, score, tried, placed (the area its Sub-Blocks' boxes span) }.
export function* search(entries, catalog, logistics, options = {}) {
  const { seed = 1, maxCandidates = Infinity, deadline = Infinity, now = () => Date.now(), trace = () => {}, site = null, perfect = false, patience = 12, designed = null, strategy = 'search' } = options;
  const spread = strategy === 'spread';
  const rng = random(seed);
  const ctx = context(entries, catalog, logistics, site);
  // Leaves first: every Sub-Block before the ones it feeds. Looking for a layout without
  // Starvation, once a Sub-Block's least starving design starves, no layout can do without, and
  // the search ends there.
  const order = [...ctx.flows.order];
  // `precheck`: first the Sub-Blocks that make the Side Output (the busiest, the likeliest to
  // starve), from structured variants only and with a random source of their own (designs as the
  // search's own are left as they were); one that starves ends the search before the rest are
  // designed.
  if (perfect && options.precheck) {
    const checkRng = random(seed + 2);
    for (const i of order.filter(i => ctx.routes.some(r => r.source === i && r.sink === 'side-output')).reverse()) {
      const least = designOf(designStep(ctx, i, checkRng, { now, deadline, draws: 0 })[0])?.trouble ?? 0;
      if (least > 1e-6) return { tried: 0, failure: new Error(`${ctx.plan[i].recipe}: every design starves (${Math.round(least)}/min short)`), starves: true };
    }
  }
  const designs = [];
  for (const i of order) {
    // Designed already, each Sub-Block on its own (`designs`: the candidates of each, built
    // elsewhere and handed over): built again only where the search tries one not built yet.
    designs[i] = options.designs?.[i] ? revive(ctx, i, options.designs[i], rng) : designStep(ctx, i, rng, { now, deadline });
    const least = designOf(designs[i][0])?.trouble ?? 0;
    if (perfect && least > 1e-6) return { tried: 0, failure: new Error(`${ctx.plan[i].recipe}: every design starves (${Math.round(least)}/min short)`), starves: true };
    // In a City Block, a Sub-Block none of whose designs without Starvation fits inside it at all
    // leaves no layout either: its designs in turn (routed if they must be: not one whose core
    // alone is too big, or that starves before it is routed) until one does.
    const fitting = c => !(c.estimate.trouble > 1e-6 || (c.estimate.w !== undefined && !within(site, c.estimate)))
      && (designOf(c)?.trouble ?? Infinity) <= 1e-6 && c.design.kinds.every(k => within(site, k.module.area));
    if (perfect && site && !designs[i].some(fitting)) return { tried: 0, failure: new Error(`${ctx.plan[i].recipe}: no design without starvation fits the city block`) };
  }
  designed?.(ctx.plan.map((sb, i) => ({ item: sb.item, count: sb.count, area: designOf(designs[i][0])?.area ?? null })));

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
  // Making Way: the candidate's designs (prepared under `key`) with the machines Fixtures stand on
  // left out of their copies and built elsewhere, prepared; and the layout placed again, every
  // Sub-Block where it stood. A Sub-Block's machines left out go on the end of its last row where
  // it has room for them (a core's; `end`), else stand apart together, one module and one link
  // (else each on its own). Null where they find no design or room, or the belts do not chain.
  const ways = new Map();
  const grown = new Map();
  const grownFor = (i, c, more) => {
    const k = `${i}:${c}:${more}`;
    if (!grown.has(k)) grown.set(k, grownDesign(ctx, i, designs[i][c], more));
    return grown.get(k);
  };
  const makeWay = (candidate, key, ready, positions) => {
    const holes = ctx.plan.map(() => []);
    for (const inst of ready.instances) if (!inst.detached) holes[inst.step].push(positions.holes.get(inst.index) ?? null);
    const wayKey = `${key}|${holes.map(list => list.map(s => (s ? [...s].sort((a, b) => a - b).join('.') : '')).join(',')).join(';')}`;
    const modes = ['end', 'together', 'apart'];
    for (const mode of modes) {
      const k = `${wayKey}|${mode}`;
      if (!ways.has(k)) {
        let made = null;
        const chosen = candidate.choice.map((c, i) => {
          const count = holes[i].reduce((n, s) => n + (s?.size ?? 0), 0);
          const base = designFor(candidate, i);
          if (!count || !base) return base;
          const end = mode === 'end' && !candidate.breakout?.[i] && grownFor(i, Math.min(c, designs[i].length - 1), count);
          if (end) return leaveOut(end, holes[i], null, 0);
          const piece = (shareOf(i, mode === 'apart' ? 1 : count, false) ?? []).map(designOf).find(Boolean);
          return piece ? leaveOut(base, holes[i], piece, mode === 'apart' ? count : 1) : null;
        });
        try {
          if (chosen.every(Boolean)) made = prepare(ctx, chosen, candidate.columns);
        } catch (e) {
          if (!(e instanceof RoutingError)) throw e;
        }
        ways.set(k, made);
      }
      const made = ways.get(k);
      if (!made) continue;
      try {
        return { ready: made, positions: placeBlocks(ctx, made, { ...candidate, at: positions.at, stay: true, solid: true }) };
      } catch (e) {
        if (!(e instanceof RoutingError) || mode === modes.at(-1)) throw e;
      }
    }
    return null;
  };
  // Breakout trials, each with the Sub-Block and spec it tries: routed only where they look
  // promising once placed.
  const trials = new WeakMap();
  // In a City Block with Fixtures in its room, a Sub-Block whose best design fits few of its
  // spots between them (a grid of substations leaves gaps a module must fit) starts from the
  // design, starving no more, that fits the most.
  const choice = ctx.plan.map(() => 0);
  if (site) {
    designs.forEach((list, i) => {
      const best = designOf(list[0]);
      if (!best || roomFor(site, best) >= 0.25) return;
      const room = list.map(c => {
        const d = designOf(c);
        return d && d.trouble <= best.trouble + 1e-6 ? roomFor(site, d) : -1;
      });
      const most = Math.max(...room);
      if (most > 4 * room[0]) choice[i] = room.indexOf(most);
    });
  }
  const first = { choice, columns: ctx.plan.map(() => null), corridor: 2, gap: 1, weight: 4, lift: {}, order: {}, shift: {} };
  // Looking for a layout without Starvation in a City Block, the candidates in columns go first:
  // they pack tighter, and the first that fits ends the search. Spread (ADR 0013): a wide buffer
  // round every Sub-Block first, so its links find room, then ever tighter.
  const buffer = spread ? Math.min(16, Math.max(4, 2 + ctx.routes.filter(r => r.kind === 'belt').length)) : 0;
  const swept = spread ? loosened(first, buffer) : [first, ...sweep(first, designs, site)];
  const queue = perfect && site ? [...swept.filter(c => c.layers), ...swept.filter(c => !c.layers)] : swept;
  let structured = queue.length;
  // A design that starves cannot make a layout without Starvation: its estimate before routing
  // already shows it (routing only adds), its trouble once routed. Nor can one too big for the
  // City Block (by its routed module, else its core).
  const starves = candidate => candidate.choice.some((c, i) => {
    const d = designs[i][Math.min(c, designs[i].length - 1)];
    const size = d.design ? d.design.kinds.map(k => k.module.area) : d.estimate.w === undefined ? [] : [d.estimate];
    return d.estimate.trouble > 1e-6 || (d.design?.trouble ?? 0) > 1e-6 || (site && !size.every(box => within(site, box)));
  });
  // Each new best is refined first: every Sub-Block slid a few tiles each way, and Breakouts.
  let refining = [];
  while (tried < maxCandidates && (tried === 0 || now() < deadline)) {
    // In a City Block, a search whose structured candidates found no room for a layout (or,
    // looking for one without Starvation, none of those) seldom finds one later.
    if ((perfect || (site && !best)) && tried >= structured + patience) break;
    const candidate = queue.length ? queue.shift() : refining.length ? refining.shift() : mutate(best?.candidate ?? first, designs, rng, site);
    tried++;
    const k = `${candidate.choice.join()}|${candidate.columns.join()}|${JSON.stringify(candidate.breakout ?? {})}`;
    if (!prepared.has(k)) {
      // Each Sub-Block's chosen design, routed now if this is the first time it is tried.
      const chosen = perfect && starves(candidate) ? [null] : candidate.choice.map((c, i) => designFor(candidate, i));
      let ready = null;
      try {
        if (chosen.every(Boolean) && !(perfect && chosen.some(d => d.trouble > 1e-6))) ready = prepare(ctx, chosen, candidate.columns);
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
    if ((best && ready.least > best.score[0]) || (perfect && ready.least > 0)) continue;
    let block, placed, boxes, composed = null;
    // A link that found no room makes room (spacedOut): the same candidate is tried next with
    // its Sub-Blocks spaced out round the link (the user's rule: a belt that cannot be connected
    // spaces the blocks out).
    let roomy = false;
    const makeRoom = steps => {
      const roomier = roomy ? null : spacedOut(candidate, steps);
      roomy = true;
      if (!roomier) return;
      queue.unshift(roomier);
      structured++;
    };
    // Fixtures standing on machines leave them out (Making Way); where that layout fails, the same
    // candidate is tried next with every Fixture kept off its machines (`solid`).
    let way = false;
    const solidly = () => {
      if (!way || candidate.solid) return;
      queue.unshift({ ...candidate, solid: true });
      structured++;
    };
    let work = ready;
    try {
      let positions = placeBlocks(ctx, ready, candidate);
      if (positions.holes?.size) {
        way = true;
        const made = makeWay(candidate, k, ready, positions);
        if (!made) throw new RoutingError('no machine to build apart where a Fixture stands on one');
        ({ ready: work, positions } = made);
      }
      placed = positions.bounds.w * positions.bounds.h;
      boxes = positions.boxes;
      // A Breakout trial packs no looser than the best, or it is not worth routing. Where one
      // machine broken out does, more of that Sub-Block's are tried too.
      const trial = trials.get(candidate);
      if (trial && placed > best.placed) continue;
      if (trial?.spec === '1') refining.push(...register(more(best.candidate, trial.step, ctx.plan[trial.step])));
      // Looking for a layout without Starvation, a candidate's routing ends with the search's time.
      const layout = { margin: { w: 0, e: 0, n: 1, s: 1 }, until: perfect ? () => now() > deadline : null };
      try {
        composed = compose(ctx, work, positions, layout);
      } catch (e) {
        if (e instanceof RoutingError && e.steps) makeRoom(e.steps);
        // Splitters took the room a link needed: the same layout with the Fan-outs routed last,
        // else without splitters (a Recipe Loop's feedback by train) — and the roomier one next.
        if (!(e instanceof RoutingError) || !work.routes.some(r => r.splitter || r.fan || r.taps)) throw e;
        try {
          if (!work.routes.some(r => r.fan)) throw e;
          composed = compose(ctx, work, positions, { ...layout, fansLast: true });
        } catch (again) {
          if (!(again instanceof RoutingError)) throw again;
          composed = compose(ctx, work, positions, { ...layout, plain: true });
        }
      }
      block = finishBlock(composed, catalog, logistics);
    } catch (e) {
      if (!(e instanceof RoutingError || e instanceof PowerError)) throw e;
      // No pole for a machine there: room round the Sub-Blocks about it.
      if (e instanceof PowerError && e.at && composed) makeRoom(near(composed.subBlocks, e.at));
      else if (e instanceof RoutingError && e.steps) makeRoom(e.steps);
      solidly();
      failure = e;
      trace(candidate, e);
      continue;
    }
    const problems = validateBlock(block, catalog, logistics);
    if (problems.length) {
      solidly();
      failure = new Error(`invalid layout: ${problems[0]}`);
      trace(candidate, failure);
      continue;
    }
    const starving = simulate(block).starvation.reduce((sum, s) => sum + s.demand - s.available, 0);
    // A Recipe Loop's feedback by train (no room for its splitter) counts before Compactness.
    const loopsByTrain = block.routes.filter(r => r.loop && r.fedBy === undefined).length;
    const score = [Math.round(starving * 1000) / 1000, loopsByTrain, compactness(block).value, block.entities.length];
    if (perfect && score[0] > 0) {
      solidly();
      failure = new Error(`the layout starves ${score[0]}/min`);
      trace(candidate, failure);
      continue;
    }
    if (!best || better(score, best.score)) {
      best = { candidate, score, placed };
      // A Breakout trial after every two slides (a lone Sub-Block has no gaps to fill). Spread
      // first packs the smaller Sub-Blocks beside the biggest.
      const trying = ctx.plan.length > 1 ? register(breakouts(candidate, ctx.plan, designs)) : [];
      const sliding = slides(candidate, ctx.plan.length);
      refining = [
        ...(spread ? packs(candidate, boxes, buffer) : []),
        ...Array.from({ length: Math.max(trying.length, Math.ceil(sliding.length / 2)) }, (_, j) => [sliding[2 * j], sliding[2 * j + 1], trying[j]]).flat().filter(Boolean),
      ];
      yield { block, score, tried, placed };
    }
  }
  return { tried, failure };

  // Breakout trials as candidates, each remembered with what it tries.
  function register(list) {
    for (const t of list) trials.set(t.candidate, t);
    return list.map(t => t.candidate);
  }
}

// Room for a link that found none: the Sub-Blocks it runs between (`steps`; every one when none
// is known) get ROOM tiles more on every side, then twice as many and twice again; past that
// every corridor and gap widens by ROOM as well, each time. Null once spaced out SPACING times.
const ROOM = 4;
const SPACING = 6;
export function spacedOut(candidate, steps) {
  const level = candidate.spaced ?? 0;
  if (level >= SPACING) return null;
  const pad = { ...candidate.pad };
  for (const i of steps) pad[i] = pad[i] ? 2 * pad[i] : ROOM;
  const wider = level >= SPACING / 2 || !steps.length;
  return { ...candidate, pad, spaced: level + 1, ...(wider ? { corridor: candidate.corridor + ROOM, gap: candidate.gap + ROOM } : {}) };
}

// The Sub-Blocks whose box holds a tile, else the one nearest it.
function near(subBlocks, { x, y }) {
  const inside = subBlocks.filter(b => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h);
  if (inside.length) return inside.map(b => b.index);
  const gap = b => Math.max(0, b.x - x, x - (b.x + b.w)) + Math.max(0, b.y - y, y - (b.y + b.h));
  return [subBlocks.reduce((a, b) => (gap(b) < gap(a) ? b : a)).index];
}

// Spread: the first candidate with `buffer` tiles between its Sub-Blocks (corridors and gaps),
// then half as many, and so on down to the first's own.
function loosened(first, buffer) {
  const out = [];
  for (let b = buffer; b > first.corridor; b = Math.ceil(b / 2)) out.push({ ...first, corridor: b, gap: Math.max(first.gap, b) });
  return [...out, first];
}

// Spread: the Sub-Blocks other than the biggest packed beside it, in rows as wide as it below it
// and above it, in columns as tall as it east and west of it, `buffer` tiles apart — each way one
// move (`at`: where each box stands). Placing every producer west of what it feeds leaves a
// column as tall as the biggest Sub-Block beside it, mostly empty.
function packs(base, boxes, buffer) {
  if (!boxes || boxes.length < 2) return [];
  const big = boxes.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  const rest = boxes.filter(b => b !== big).sort((a, b) => b.h - a.h || b.w - a.w);
  // Shelves: each box's offset along and across them, and how deep they run in all.
  const shelve = (length, along, across) => {
    const spots = [];
    let u = 0, v = 0, deep = 0;
    for (const b of rest) {
      if (u > 0 && u + along(b) > length) {
        v += deep + buffer;
        u = 0;
        deep = 0;
      }
      spots.push([b, u, v]);
      u += along(b) + buffer;
      deep = Math.max(deep, across(b));
    }
    return { spots, depth: v + deep };
  };
  const out = [];
  const rows = shelve(big.w, b => b.w, b => b.h), columns = shelve(big.h, b => b.h, b => b.w);
  const ways = [
    rows.spots.map(([b, u, v]) => [b, big.x + u, big.y + big.h + buffer + v]),
    rows.spots.map(([b, u, v]) => [b, big.x + u, big.y - buffer - rows.depth + v]),
    columns.spots.map(([b, u, v]) => [b, big.x + big.w + buffer + v, big.y + u]),
    columns.spots.map(([b, u, v]) => [b, big.x - buffer - columns.depth + v, big.y + u]),
  ];
  for (const way of ways) {
    const at = { ...base.at }, shift = { ...base.shift };
    for (const [b, x, y] of way) {
      at[b.step] = { x, y };
      delete shift[b.step];
    }
    out.push({ ...base, at, shift });
  }
  return out;
}

// First the best design of every Sub-Block with roomier and tighter placements, then each
// Sub-Block's other designs in turn. In a City Block, each also with its Sub-Blocks in columns
// (Layers), right after it.
function sweep(first, designs, site = null) {
  const list = [first];
  for (const corridor of [3, 1]) list.push({ ...first, corridor });
  list.push({ ...first, gap: 2 }, { ...first, weight: 1 }, { ...first, weight: 12 });
  designs.forEach((d, i) => {
    for (let c = 0; c < d.length; c++) if (c !== first.choice[i]) list.push({ ...first, choice: first.choice.map((v, j) => (j === i ? c : v)) });
  });
  // A repeated module's copies in about as many columns as make it square, and in two.
  designs.forEach((d, i) => {
    if (!d[first.choice[i]]?.copies) return;
    for (const k of [0, 2]) list.push({ ...first, columns: first.columns.map((v, j) => (j === i ? k : v)) });
  });
  // In a City Block of few Sub-Blocks, every pairing of their best designs too, the smallest
  // first: the shapes that fit its room together are seldom each one's best.
  if (site) {
    const options = designs.map(d => Math.min(d.length, PAIRED));
    if (options.reduce((n, k) => n * k, 1) <= PAIRINGS) {
      let all = [[]];
      for (const k of options) all = all.flatMap(choice => Array.from({ length: k }, (_, c) => [...choice, c]));
      const area = choice => choice.reduce((sum, c, i) => sum + (designs[i][c].estimate.area ?? 0), 0);
      const tried = new Set(list.map(c => c.choice.join()));
      for (const choice of all.filter(c => !tried.has(c.join())).sort((a, b) => area(a) - area(b))) list.push({ ...first, choice });
    }
  }
  return (site ? list.flatMap(c => [c, { ...c, layers: LAYER_SPREAD }]) : list).slice(1);
}

// In a City Block, every pairing of the best PAIRED designs of each Sub-Block is tried where
// there are no more than PAIRINGS.
const PAIRED = 8;
const PAIRINGS = 80;

// How many columns further west than its consumers let it a Sub-Block may stand in Layers.
const LAYER_SPREAD = 2;

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

function mutate(base, designs, rng, site = null) {
  const c = structuredClone(base);
  // In a City Block, now and then in columns or not.
  if (site && rng() < 0.25) c.layers = c.layers ? 0 : LAYER_SPREAD;
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

// Whether a box (w × h) fits inside a City Block's Buffer.
const within = (site, { w, h }) => w <= site.inner.w && h <= site.inner.h;

function better(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

const choose = (list, rng) => list[Math.floor(rng() * list.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
