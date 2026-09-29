import { planSubBlocks } from './plan.js';
import { buildFlows } from './flows.js';
import { buildRoutes, coreLinks } from './routes.js';
import { buildCore, LayoutError, ROTATIONS } from './layout/core.js';
import { buildCompound, RoutingError, PowerError } from './layout/compound.js';
import { shelfPack } from './layout/pack.js';
import { validateBlock } from './layout/validity.js';

const VARIANT_TRIES = 400;
const POOL = 12;

// Anytime layout search (ADR 0004): builds candidate Compound Blocks from per-Sub-Block layout
// variants and packings, keeps those that pass every validity rule, and yields each one that
// beats the best so far on Compactness — inserter shortfall first (a layout whose machines
// starve for want of inserters is no answer), then bounding-box area, then entity count.
// Deterministic for a given seed and candidate count.
// options: { seed, maxCandidates, deadline (ms timestamp), now }
export function* search(entries, catalog, logistics, options = {}) {
  const { seed = 1, maxCandidates = Infinity, deadline = Infinity, now = () => Date.now() } = options;
  const rng = random(seed);
  const ctx = context(entries, catalog, logistics);
  const pools = ctx.plan.map((sb, i) => variantPool(ctx, sb, i, rng));

  let best = null;
  let failure = null;
  let tried = 0;
  const first = initialCandidate(ctx, pools);
  const queue = sweep(first, pools);
  while (tried < maxCandidates && now() < deadline) {
    const candidate = queue.length ? queue.shift() : mutate(best?.candidate ?? first, ctx, pools, rng);
    tried++;
    const layout = pack(candidate, pools, ctx.routes);
    const bound = boundOf(layout);
    if (best && (layout.shortfall > best.score[0] || (layout.shortfall === best.score[0] && bound >= best.score[1]))) continue;
    let block;
    try {
      block = buildCompound(ctx, layout);
    } catch (e) {
      if (!(e instanceof RoutingError || e instanceof PowerError)) throw e;
      failure = e;
      continue;
    }
    const problems = validateBlock(block, catalog, logistics);
    if (problems.length) {
      failure = new Error(`invalid layout: ${problems[0]}`);
      continue;
    }
    const score = [layout.shortfall, block.bounds.w * block.bounds.h, block.entities.length];
    if (!best || better(score, best.score)) {
      best = { candidate, score };
      queue.length = 0;
      yield { block, score, tried };
    }
  }
  return { tried, failure };
}

function context(entries, catalog, logistics) {
  if (!catalog.inserters || !catalog.fuels) throw new Error('catalog is missing inserter data — regenerate it');
  const inserters = { short: catalog.inserters[logistics.inserter], long: catalog.inserters[logistics.longInserter] };
  for (const [role, spec] of Object.entries(inserters)) {
    if (!spec) throw new Error(`choose a ${role === 'long' ? 'long-handed ' : ''}inserter`);
    if (spec.energy !== 'electric') throw new Error(`${spec.name} is not electric; only electric inserters are used`);
    if (spec.pickup.x !== 0) throw new Error(`${spec.name} does not reach straight ahead; only straight inserters are used`);
  }
  const plan = planSubBlocks(entries, catalog, logistics);
  const flows = buildFlows(plan);
  const belt = catalog.belts[logistics.belt];
  const routes = buildRoutes(plan, flows, belt.itemsPerSecond * 60 / 2);
  const env = {
    routes, inserters,
    // 90° inserters need custom vectors: the toggle, and a prototype that allows them.
    rightAngle: logistics.rightAngle !== false && inserters.short.customVectors,
    beltReach: belt.underground.maxDistance,
  };
  return { plan, flows, routes, catalog, logistics, env };
}

// Locally valid layouts for one Sub-Block, most compact first. The first variants tried are the
// plainest (nearest belt depths, belts split between the faces); the rest are random draws over
// every option.
function variantPool(ctx, sb, index, rng) {
  const building = ctx.catalog.buildings[sb.building];
  const links = coreLinks(sb, index, ctx.routes);
  const belts = [...links.inputs, ...(links.output !== null ? [links.output] : [])];
  const depths = ctx.env.rightAngle ? [1, 2, 3, 4] : [2, 3, 4];
  if (belts.length > 2 * depths.length) {
    throw new LayoutError(`${sb.recipe} needs ${belts.length} belts; ${2 * depths.length} fit around a row of machines`);
  }
  const seen = new Map();
  const errors = new Map();
  const attempt = variant => {
    try {
      const core = buildCore(sb, building, links, variant, ctx.env);
      const signature = JSON.stringify([core.w, core.h, core.entities, core.rows.map(r => [r.routeId, r.y]), core.poleSlots]);
      if (!seen.has(signature)) seen.set(signature, { variant, core });
    } catch (e) {
      if (!(e instanceof LayoutError)) throw e;
      errors.set(e.message, (errors.get(e.message) ?? 0) + 1);
    }
  };
  for (const rotation of ROTATIONS) attempt(plainVariant(belts, depths, rotation));
  for (let n = 0; n < VARIANT_TRIES; n++) {
    const variant = randomVariant(belts, depths, sb.count, rng);
    // Which connection each fluid uses, where its box has several.
    if (variant && rng() < 0.5) variant.ports = links.fluids.map(() => Math.floor(rng() * 8));
    if (variant) attempt(variant);
  }
  const pool = [...seen.values()].sort((a, b) => a.core.shortfall - b.core.shortfall || a.core.w * a.core.h - b.core.w * b.core.h);
  if (!pool.length) {
    const [reason] = [...errors].sort((a, b) => b[1] - a[1])[0] ?? ['no layout fits'];
    throw new LayoutError(`${sb.recipe}: ${reason}`);
  }
  return pool.slice(0, POOL);
}

function plainVariant(belts, depths, rotation) {
  const top = Math.ceil(belts.length / 2);
  return {
    rotation, rows: 1, gap: 0, columns: 'center', poleSlot: null,
    belts: belts.map((routeId, i) => (i < top
      ? { routeId, band: 'top', row: depths[i] }
      : { routeId, band: 'bottom', row: depths[i - top] })),
  };
}

// A random draw over every option: one machine row with belts on both faces, or two facing
// rows sharing belts in the band between them (a route may instead run above the first row
// and below the second).
function randomVariant(belts, depths, count, rng) {
  const common = {
    rotation: choose(ROTATIONS, rng),
    gap: rng() < 0.6 ? 0 : 1 + Math.floor(rng() * 2),
    columns: choose(['center', 'left', 'right'], rng),
  };
  if (count > 1 && rng() < 0.35) return twoRows(belts, depths, common, rng);
  const shuffled = shuffle(belts, rng);
  const lo = Math.max(0, belts.length - depths.length), hi = Math.min(belts.length, depths.length);
  const top = lo + Math.floor(rng() * (hi - lo + 1));
  const pick = n => shuffle(rng() < 0.6 ? depths.slice(0, n) : shuffle(depths, rng).slice(0, n), rng);
  const topRows = pick(top), bottomRows = pick(belts.length - top);
  return {
    ...common, rows: 1,
    poleSlot: rng() < 0.5 ? null : { band: choose(['top', 'bottom'], rng), row: 1 + Math.floor(rng() * 2) },
    belts: shuffled.map((routeId, i) => (i < top
      ? { routeId, band: 'top', row: topRows[i] }
      : { routeId, band: 'bottom', row: bottomRows[i - top] })),
  };
}

function twoRows(belts, depths, common, rng) {
  const middle = 1 + Math.floor(rng() * 6);
  const reachable = d => depths.includes(d);
  const shared = shuffle([...Array(middle).keys()].map(j => j + 1).filter(j => reachable(j) && reachable(middle + 1 - j)), rng);
  const outer = { top: shuffle(depths, rng), bottom: shuffle(depths, rng) };
  const placed = [];
  for (const routeId of shuffle(belts, rng)) {
    if (shared.length && (rng() < 0.75 || !outer.top.length || !outer.bottom.length)) placed.push({ routeId, band: 'middle', row: shared.pop() });
    else if (outer.top.length && outer.bottom.length) {
      placed.push({ routeId, band: 'top', row: outer.top.pop() }, { routeId, band: 'bottom', row: outer.bottom.pop() });
    } else return null;
  }
  return {
    ...common, rows: 2, middle, flip: rng() < 0.5,
    poleSlot: rng() < 0.5 ? null : { band: choose(['top', 'middle', 'bottom'], rng), row: 1 + Math.floor(rng() * 2) },
    belts: placed,
  };
}

// Packing choices: Sub-Block order (Dependency Order first), each Sub-Block's gap to the next,
// the gap between shelves, the shelf width and the free margin around everything.
function initialCandidate(ctx, pools) {
  const n = ctx.plan.length;
  return {
    variants: pools.map(() => 0), order: [...ctx.flows.order], gaps: Array(n).fill(2), shelfGap: 2,
    shelf: 0, margin: { w: 2, e: 2, n: 2, s: 2 }, routeOrder: null, share: Array(n).fill(false),
  };
}

// First, each Sub-Block's most compact variants in turn, with roomy and tight packing; then
// wider gaps and margins, in case routing needs the room.
function sweep(first, pools) {
  const longest = Math.max(...pools.map(p => p.length));
  const at = (v, g) => ({ ...first, variants: first.variants.map(() => v), gaps: first.gaps.map(() => g), shelfGap: g, margin: { w: g, e: g, n: g, s: g } });
  const list = [];
  for (let v = 0; v < longest; v++) list.push(at(v, 2), at(v, 1));
  if (first.share.length > 1) list.push({ ...at(0, 2), share: first.share.map(() => true) }, { ...at(0, 1), share: first.share.map(() => true) });
  for (const g of [3, 4, 6]) list.push(at(0, g));
  return list.slice(1);
}

function mutate(base, ctx, pools, rng) {
  const c = structuredClone(base);
  const n = ctx.plan.length;
  const moves = 1 + Math.floor(rng() * 2);
  for (let m = 0; m < moves; m++) {
    const i = Math.floor(rng() * n);
    switch (Math.floor(rng() * 8)) {
      case 0: case 1: c.variants[i] = Math.floor(rng() ** 2 * pools[i].length); break;
      case 2: c.gaps[i] = clamp(c.gaps[i] + (rng() < 0.5 ? -1 : 1), 0, 8); break;
      case 3: c.shelfGap = clamp(c.shelfGap + (rng() < 0.5 ? -1 : 1), 0, 8); break;
      case 4: {
        const side = choose(['w', 'e', 'n', 's'], rng);
        c.margin[side] = clamp(c.margin[side] + (rng() < 0.5 ? -1 : 1), side === 'w' || side === 'e' ? 1 : 0, 8);
        break;
      }
      case 5: {
        // Dependency Order is a preference: swapping neighbours lets a consumer sit beside its producer.
        const j = Math.floor(rng() * Math.max(1, n - 1));
        if (n > 1) [c.order[j], c.order[j + 1]] = [c.order[j + 1], c.order[j]];
        c.shelf = clamp(c.shelf + (rng() < 0.5 ? -1 : 1), -n, n);
        break;
      }
      case 6: {
        // Neighbours share a belt: a consumer set level with its producer's output row.
        c.share[i] = !c.share[i];
        if (c.share[i]) c.gaps[c.order[Math.max(0, c.order.indexOf(i) - 1)]] = Math.floor(rng() * 2);
        break;
      }
      default: {
        const ids = ctx.routes.map(r => r.id);
        c.routeOrder = shuffle(ids, rng);
      }
    }
  }
  return c;
}

function pack(candidate, pools, routes) {
  const cores = candidate.variants.map((v, i) => pools[i][Math.min(v, pools[i].length - 1)].core);
  // Each Sub-Block that shares a belt with its producer: the rows of that belt in both cores.
  const shares = cores.map((core, j) => {
    if (!candidate.share[j]) return null;
    const route = routes.find(r => r.kind === 'belt' && typeof r.source === 'number' && r.consumers.includes(j));
    if (!route) return null;
    const rowOf = (c, id) => c.rows.find(r => r.routeId === id)?.y;
    return { with: route.source, rows: [rowOf(cores[route.source], route.id), rowOf(core, route.id)] };
  });
  const placed = shelfPack(cores, candidate.order, { gaps: candidate.gaps, shelfGap: candidate.shelfGap, shelf: candidate.shelf, shares });
  return {
    cores, placed, margin: candidate.margin, routeOrder: candidate.routeOrder,
    shortfall: cores.reduce((sum, c) => sum + c.shortfall, 0),
  };
}

// No candidate can come out smaller than the box around its machines and inserters.
function boundOf({ cores, placed }) {
  const all = cores.flatMap((c, i) => c.entities.map(e => ({ x: e.x + placed[i].x, y: e.y + placed[i].y, w: e.w, h: e.h })));
  const w = Math.max(...all.map(e => e.x + e.w)) - Math.min(...all.map(e => e.x));
  const h = Math.max(...all.map(e => e.y + e.h)) - Math.min(...all.map(e => e.y));
  return w * h;
}

function better(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const choose = (list, rng) => list[Math.floor(rng() * list.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
