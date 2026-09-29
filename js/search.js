import { planSubBlocks } from './plan.js';
import { buildFlows } from './flows.js';
import { buildRoutes, coreLinks } from './routes.js';
import { buildCore, LayoutError, ROTATIONS, routeItems, fluidSides } from './layout/core.js';
import { buildCompound, RoutingError, PowerError } from './layout/compound.js';
import { shelfPack } from './layout/pack.js';
import { validateBlock } from './layout/validity.js';
import { simulate } from './sim.js';

const VARIANT_TRIES = 400;
const POOL = 12;

// Anytime layout search (ADR 0004): builds candidate Compound Blocks from per-Sub-Block layout
// variants and packings, keeps those that pass every validity rule, and yields each one that
// beats the best so far on Compactness — Starvation first (a layout whose machines starve, for
// want of belts or inserters, is no answer), then bounding-box area, then entity count.
// Deterministic for a given seed and candidate count.
// options: { seed, maxCandidates, deadline (ms timestamp), now, trace (called with each
//            candidate's layout and the error that sank it, for diagnostics) }
export function* search(entries, catalog, logistics, options = {}) {
  const { seed = 1, maxCandidates = Infinity, deadline = Infinity, now = () => Date.now(), trace = () => {} } = options;
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
    // Inserter shortfall and overloaded belts are Starvation the candidate cannot escape.
    const bound = boundOf(layout);
    if (best && best.score[0] === 0 && (layout.trouble > 0 || bound >= best.score[1])) continue;
    let block;
    try {
      block = buildCompound(ctx, layout);
    } catch (e) {
      if (!(e instanceof RoutingError || e instanceof PowerError)) throw e;
      failure = e;
      trace(layout, e);
      continue;
    }
    const problems = validateBlock(block, catalog, logistics);
    if (problems.length) {
      failure = new Error(`invalid layout: ${problems[0]}`);
      trace(layout, failure);
      continue;
    }
    const starving = simulate(block).starvation.reduce((sum, s) => sum + s.demand - s.available, 0);
    const score = [Math.round(starving * 1000) / 1000, block.bounds.w * block.bounds.h, block.entities.length];
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
    pipeReach: catalog.pipes[logistics.pipe].maxDistance,
  };
  return { plan, flows, routes, catalog, logistics, env };
}

// Locally valid layouts for one Sub-Block, fewest Starvation to come first, then most compact.
// The first variants tried are the plainest (one row, nearest belt rows, belts split between the
// faces, or rows as long as the busiest belt allows); the rest are random draws over every option.
function variantPool(ctx, sb, index, rng) {
  const building = ctx.catalog.buildings[sb.building];
  const links = coreLinks(sb, index, ctx.routes);
  const shape = shapeOf(ctx, sb, index, links);
  const seen = new Map();
  const errors = new Map();
  const attempt = variant => {
    if (!variant) return;
    try {
      const core = buildCore(sb, building, links, variant, ctx.env);
      const signature = JSON.stringify([core.w, core.h, core.entities, core.rows.map(r => [r.routeId, r.part, r.y]), core.pipeRows.map(r => r.y), core.poleSlots]);
      if (!seen.has(signature)) seen.set(signature, { variant, core });
    } catch (e) {
      if (!(e instanceof LayoutError)) throw e;
      errors.set(e.message, (errors.get(e.message) ?? 0) + 1);
    }
  };
  for (const rotation of ROTATIONS) {
    attempt(stackVariant(shape, { rotation, rowLength: sb.count, plain: true }, rng));
    if (shape.rowCap < sb.count) {
      for (const middle of [4, 5, 6]) {
        for (const pipes of [false, true]) attempt(stackVariant(shape, { rotation, rowLength: shape.rowCap, flip: true, plain: true, pipes, middle }, rng));
      }
    }
  }
  for (let n = 0; n < VARIANT_TRIES; n++) {
    const lengths = [sb.count, Math.ceil(sb.count / 2), shape.rowCap, Math.max(1, shape.rowCap - 1), 1 + Math.floor(rng() * sb.count)];
    const variant = stackVariant(shape, {
      rotation: choose(ROTATIONS, rng), rowLength: choose(lengths, rng), flip: rng() < 0.5, pipes: rng() < 0.5,
    }, rng);
    // Which connection each fluid uses, where its box has several.
    if (variant && rng() < 0.5) variant.ports = links.fluids.map(() => Math.floor(rng() * 8));
    attempt(variant);
  }
  const trouble = c => c.shortfall + c.overload;
  const ranked = [...seen.values()].sort((a, b) => trouble(a.core) - trouble(b.core) || a.core.w * a.core.h - b.core.w * b.core.h);
  if (!ranked.length) {
    const [reason] = [...errors].sort((a, b) => b[1] - a[1])[0] ?? ['no layout fits'];
    throw new LayoutError(`${sb.recipe}: ${reason}`);
  }
  // The best of each kind of layout (row length, with or without pipe rows) first, so a bigger
  // kind that routes where the smallest cannot still gets tried; then the next most compact.
  const kind = ({ variant }) => `${variant.rowLength}|${variant.pipes.length > 0}`;
  const leaders = ranked.filter((v, i) => ranked.findIndex(w => kind(w) === kind(v)) === i);
  return [...leaders, ...ranked.filter(v => !leaders.includes(v))].slice(0, Math.max(POOL, leaders.length));
}

// What shapes a Sub-Block's layout: its belt routes, how many machines one belt of each can
// feed, which routes may split into parallel belts (a Side Input only it takes, or an output
// nothing else takes), and its fluids.
function shapeOf(ctx, sb, index, links) {
  const belts = [...links.inputs, ...(links.output !== null ? [links.output] : [])].map(routeId => {
    const route = ctx.routes[routeId];
    const isOutput = routeId === links.output;
    const items = routeItems(sb, route, isOutput);
    const perBelt = isOutput
      ? route.items[0].capacity / (items.reduce((sum, i) => sum + i.rate, 0) / sb.count)
      : Math.min(...items.map(i => route.items.find(x => x.item === i.name).capacity / (i.rate / sb.count)));
    const splittable = isOutput ? route.consumers.length === 0 : route.source === 'side-input' && route.consumers.length === 1;
    return { routeId, perBelt: Math.max(1, Math.floor(perBelt + 1e-9)), splittable };
  });
  const depths = ctx.env.rightAngle ? [1, 2, 3, 4] : [2, 3, 4];
  if (belts.length > 2 * depths.length) {
    throw new LayoutError(`${sb.recipe} needs ${belts.length} belts; ${2 * depths.length} fit around a row of machines`);
  }
  const rowCap = Math.min(sb.count, ...belts.filter(b => b.splittable).map(b => b.perBelt));
  return { sb, links, belts, depths, rowCap, building: ctx.catalog.buildings[sb.building] };
}

// A stack of machine rows. Each route shares bands between pairs of rows — pairs start at row 0
// or row 1, alternating between routes so both bands around a row carry shared belts — and gets
// as few belts as its capacity allows: one belt visiting several shared bands in turn or, for a
// route that may split, one belt per group of rows it can feed. Belt rows go nearest the
// machines first (plain) or at random, a single row's belt into the emptier of its two bands.
// With `pipes`, each fluid first gets a pipe row beside its connections in every band they face.
function stackVariant(shape, { rotation, rowLength, flip = false, plain = false, pipes = false, middle: height = null }, rng) {
  const { sb, belts, depths } = shape;
  const rows = Math.ceil(sb.count / rowLength);
  const counts = [...Array(rows).keys()].map(r => Math.min(rowLength, sb.count - r * rowLength));
  // A middle band of 4 rows (5 without 90° inserters) has the most rows both machine rows reach.
  const middle = rows === 1 ? 0 : height ?? (plain ? (depths[0] === 1 ? 4 : 5) : 2 + Math.floor(rng() * 5));
  const ok = d => depths.includes(d);
  const bandHeight = band => (band === 0 || band === rows ? 4 : middle);
  const used = new Map();
  const taken = new Set();
  // Where a belt serving `serves` may run: [band, row] options, nearest first.
  const options = serves => {
    const out = [];
    if (serves.length === 2) {
      const band = serves[1];
      for (let j = 1; j <= middle; j++) if (ok(j) && ok(middle + 1 - j)) out.push([band, j]);
      return out;
    }
    const [r] = serves;
    const top = r === 0 ? depths.map(d => [0, d]) : [...Array(middle).keys()].map(j => [r, j + 1]).filter(([, j]) => ok(middle + 1 - j));
    const bottom = r === rows - 1 ? depths.map(d => [rows, d]) : [...Array(middle).keys()].map(j => [r + 1, j + 1]).filter(([, j]) => ok(j));
    const depth = ([band, j]) => (band === r && band !== 0 ? middle + 1 - j : j);
    const load = ([band]) => (used.get(band) ?? 0) / bandHeight(band);
    // A belt only one row needs takes a band row only one row reaches, leaving the rows both
    // reach to shared belts.
    return [...top, ...bottom].sort((a, b) => shareable(a) - shareable(b) || load(a) - load(b) || depth(a) - depth(b));
  };
  const shareable = ([band, j]) => (band > 0 && band < rows && ok(j) && ok(middle + 1 - j) ? 1 : 0);
  // Rows grouped for one belt: pairs sharing a band, the odd row alone.
  const groupsOf = (from, to, offset) => {
    const groups = [];
    for (let r = from; r <= to;) {
      const pair = r + 1 <= to && (r - offset) % 2 === 0;
      groups.push(pair ? [r, r + 1] : [r]);
      r += pair ? 2 : 1;
    }
    return groups;
  };
  const wanted = [];
  (plain ? belts : shuffle(belts, rng)).forEach((b, n) => {
    const machinesPerPart = b.splittable ? b.perBelt : Infinity;
    const offset = rows < 2 ? 0 : plain ? n % 2 : Math.floor(rng() * 2);
    let part = 0;
    for (let first = 0; first < rows;) {
      // As many whole rows as one belt can feed.
      let last = first, machines = counts[first];
      while (last + 1 < rows && machines + counts[last + 1] <= machinesPerPart) machines += counts[++last];
      for (const serves of groupsOf(first, last, offset)) wanted.push({ routeId: b.routeId, part, serves });
      part++;
      first = last + 1;
    }
  });
  // Pipe rows first, beside the connections: fluids have nowhere else to go.
  const pipeRows = [];
  if (pipes) {
    for (let r = 0; r < rows; r++) {
      const sides = fluidSides(sb, shape.building, shape.links.fluids, flip && r % 2 ? (rotation + 8) % 16 : rotation);
      for (const [routeId, side] of sides) {
        if (side !== 'top' && side !== 'bottom') continue;
        const band = side === 'top' ? r : r + 1;
        if (pipeRows.some(p => p.routeId === routeId && p.band === band)) continue;
        // Outside the stack a pipe row goes beyond the rows inserters reach; between rows, nearest
        // the connections on a band row no shared belt could use.
        const outer = band === 0 || band === rows;
        const h = bandHeight(band);
        const fromPorts = outer ? [5, 6, 7, 8] : side === 'bottom' ? [...Array(h).keys()].map(j => j + 1) : [...Array(h).keys()].map(j => h - j);
        const row = fromPorts.filter(j => !taken.has(`${band},${j}`)).sort((a, b) => shareable([band, a]) - shareable([band, b]))[0];
        if (row === undefined) continue;
        taken.add(`${band},${row}`);
        used.set(band, (used.get(band) ?? 0) + 1);
        pipeRows.push({ routeId, band, row });
      }
    }
  }
  // Shared belts first: they have the fewest rows to choose from.
  const placed = [];
  const order = (plain ? wanted : shuffle(wanted, rng)).sort((a, b) => b.serves.length - a.serves.length);
  for (const w of order) {
    const free = options(w.serves).filter(([band, j]) => !taken.has(`${band},${j}`));
    if (!free.length) return null;
    const [band, row] = plain || rng() < 0.7 ? free[0] : choose(free, rng);
    taken.add(`${band},${row}`);
    used.set(band, (used.get(band) ?? 0) + 1);
    placed.push({ ...w, band, row });
  }
  return {
    rotation, rowLength, flip, middle, belts: placed, pipes: pipeRows,
    gap: plain || rng() < 0.6 ? 0 : 1 + Math.floor(rng() * 2),
    columns: plain ? 'center' : choose(['center', 'left', 'right'], rng),
    poleSlot: plain || rng() < 0.5 ? null : { band: Math.floor(rng() * (rows + 1)), row: 1 + Math.floor(rng() * 2) },
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
    trouble: cores.reduce((sum, c) => sum + c.shortfall + c.overload, 0),
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
