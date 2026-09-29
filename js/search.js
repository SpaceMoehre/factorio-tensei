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
  const queue = sweep(first, pools, ctx.routes);
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
    laneCapacity: belt.itemsPerSecond * 30,
    // Items per swing: 1, more with inserter capacity research.
    handSize: Math.max(1, Math.floor(logistics.handSize ?? 1)),
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
      const signature = JSON.stringify([core.w, core.h, core.entities, core.rows.map(r => [r.routeIds, r.part, r.y]), core.pipeRows.map(r => r.y), core.poleSlots]);
      if (!seen.has(signature)) seen.set(signature, { variant, core });
    } catch (e) {
      if (!(e instanceof LayoutError)) throw e;
      errors.set(e.message, (errors.get(e.message) ?? 0) + 1);
    }
  };
  for (const rotation of ROTATIONS) {
    attempt(stackVariant(shape, { rotation, rowLength: sb.count, plain: true }, rng));
    // Rows as long as the busiest belt allows, and half that: each part of a split belt is then
    // a pair of rows facing it, which fill both its lanes.
    for (const { merge, cap } of [{ merge: false, cap: shape.rowCap }, { merge: true, cap: shape.mergeCap }, { merge: false, cap: Math.ceil(shape.rowCap / 2) }]) {
      if (cap >= sb.count || (merge && cap === shape.rowCap)) continue;
      for (const middle of [4, 5, 6]) {
        for (const pipes of links.fluids.length ? [false, true] : [false]) {
          for (const shift of pipes ? [0, -1, 1, -2, 2, -3, 3, -4, 4] : [0]) {
            attempt(stackVariant(shape, { rotation, rowLength: cap, flip: true, plain: true, pipes, merge, middle, shift }, rng));
          }
        }
      }
    }
  }
  for (let n = 0; n < VARIANT_TRIES; n++) {
    const merge = rng() < 0.3;
    const cap = merge ? shape.mergeCap : shape.rowCap;
    const lengths = [sb.count, Math.ceil(sb.count / 2), cap, Math.max(1, cap - 1), Math.ceil(cap / 2), 1 + Math.floor(rng() * sb.count)];
    const variant = stackVariant(shape, {
      rotation: choose(ROTATIONS, rng), rowLength: choose(lengths, rng), flip: rng() < 0.5, pipes: links.fluids.length > 0 && rng() < 0.5, merge,
    }, rng);
    // Which connection each fluid uses, where its box has several.
    if (variant && rng() < 0.5) variant.ports = links.fluids.map(() => Math.floor(rng() * 8));
    attempt(variant);
  }
  const trouble = c => c.shortfall + c.overload;
  // Stacked rows whose fluids have no pipe rows rarely route: their pipes must find their own
  // way between the rows. Among equals, those come after.
  const stuck = ({ variant }) => (links.fluids.length > 0 && variant.rowLength < sb.count && !variant.pipes.length ? 1 : 0);
  const ranked = [...seen.values()].sort((a, b) => trouble(a.core) - trouble(b.core) || stuck(a) - stuck(b)
    || a.core.w * a.core.h - b.core.w * b.core.h);
  if (!ranked.length) {
    const [reason] = [...errors].sort((a, b) => b[1] - a[1])[0] ?? ['no layout fits'];
    throw new LayoutError(`${sb.recipe}: ${reason}`);
  }
  // The best of each kind of layout (row length, with or without pipe rows) first, so a bigger
  // kind that routes where the smallest cannot still gets tried; then the next most compact.
  const kind = ({ variant }) => `${variant.rowLength}|${variant.pipes.length > 0}|${variant.belts.some(b => b.routeIds.length > 1)}`;
  const leaders = ranked.filter((v, i) => ranked.findIndex(w => kind(w) === kind(v)) === i);
  return [...leaders, ...ranked.filter(v => !leaders.includes(v))].slice(0, Math.max(POOL, leaders.length));
}

// What shapes a Sub-Block's layout: its belt routes, how many machines one belt of each can
// feed, which routes may split into parallel belts (a Side Input only it takes, an output
// nothing else takes, or an Internal Path between it and one other Sub-Block), and its fluids.
function shapeOf(ctx, sb, index, links) {
  const belts = [...links.inputs, ...(links.output !== null ? [links.output] : [])].map(routeId => {
    const route = ctx.routes[routeId];
    const isOutput = routeId === links.output;
    const items = routeItems(sb, route, isOutput);
    // An Internal Path is filled by its producer's output inserters: one lane, or both where rows
    // on either side drop onto the belt, as the rows of a split part do in pairs.
    const internal = typeof route.source === 'number' && route.consumers.length === 1 && route.sink !== 'side-output';
    const lanes = isOutput || internal ? 2 : 1;
    const perBelt = isOutput
      ? lanes * route.items[0].capacity / (items.reduce((sum, i) => sum + i.rate, 0) / sb.count)
      : Math.min(...items.map(i => lanes * route.items.find(x => x.item === i.name).capacity / (i.rate / sb.count)));
    const splittable = internal || (isOutput ? route.consumers.length === 0 : route.source === 'side-input' && route.consumers.length === 1);
    // A single-item Side Input that may split can share parallel belts with another: one lane each.
    const perLane = !isOutput && splittable && route.source === 'side-input' && items.length === 1
      ? Math.floor(ctx.env.laneCapacity / (items[0].rate / sb.count) + 1e-9) : 0;
    // Both ends of an Internal Path cut it into the same number of parallel belts, as many as its
    // rate needs, so each belt links about the same share of producers and consumers.
    if (internal) {
      const belts = Math.ceil(route.items.reduce((sum, i) => sum + i.rate, 0) / (2 * route.items[0].capacity) - 1e-9);
      return { routeIds: [routeId], perBelt: Math.ceil(sb.count / belts), splittable, perLane };
    }
    return { routeIds: [routeId], perBelt: Math.max(1, Math.floor(perBelt + 1e-9)), splittable, perLane };
  });
  const depths = ctx.env.rightAngle ? [1, 2, 3, 4] : [2, 3, 4];
  if (belts.length > 2 * depths.length) {
    throw new LayoutError(`${sb.recipe} needs ${belts.length} belts; ${2 * depths.length} fit around a row of machines`);
  }
  const rowCap = Math.min(sb.count, ...belts.filter(b => b.splittable).map(b => b.perBelt));
  // With merged pairs, rows as long as the busiest unmerged belt or merged lane allows.
  const mergeCap = Math.min(sb.count, ...pairUp(belts).filter(b => b.splittable).map(b => b.perBelt));
  return { sb, links, belts, depths, rowCap, mergeCap, building: ctx.catalog.buildings[sb.building] };
}

// Belt Merge per part: single-item inputs that may split pair up, those whose lanes feed the
// most machines together; a pair feeds as many machines as the weaker lane allows, as long as
// a row still gets at least one machine's worth.
function pairUp(belts) {
  const single = belts.filter(b => b.perLane >= 1).sort((a, b) => b.perLane - a.perLane);
  const out = belts.filter(b => !single.includes(b));
  for (let i = 0; i + 1 < single.length; i += 2) {
    out.push({ routeIds: [...single[i].routeIds, ...single[i + 1].routeIds], perBelt: Math.min(single[i].perLane, single[i + 1].perLane), splittable: true, perLane: 0 });
  }
  if (single.length % 2) out.push(single.at(-1));
  return out;
}

// A stack of machine rows. Each route shares bands between pairs of rows — pairs start at row 0
// or row 1, alternating between routes so both bands around a row carry shared belts — and gets
// as few belts as its capacity allows: one belt visiting several shared bands in turn or, for a
// route that may split, one belt per group of rows it can feed. Belt rows go nearest the
// machines first (plain) or at random, a single row's belt into the emptier of its two bands.
// With `pipes`, each fluid first gets a pipe row beside its connections in every band they face.
function stackVariant(shape, { rotation, rowLength, flip = false, plain = false, pipes = false, merge = false, middle: height = null, shift = null }, rng) {
  const { sb, depths } = shape;
  const belts = merge ? pairUp(shape.belts) : shape.belts;
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
      // A part of a belt split into several pairs its own rows, so its belt gets both lanes.
      const split = first > 0 || last < rows - 1;
      for (const serves of groupsOf(first, last, split && last > first ? first : offset)) wanted.push({ routeIds: b.routeIds, part, serves });
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
        const fromPorts = outer ? [5, 7, 6, 8] : side === 'bottom' ? [...Array(h).keys()].map(j => j + 1) : [...Array(h).keys()].map(j => h - j);
        // Pipes of two fluids side by side would join, so pipe rows keep a row between them.
        const row = fromPorts.filter(j => !taken.has(`${band},${j}`) && !pipeRows.some(p => p.band === band && Math.abs(p.row - j) === 1))
          .sort((a, b) => shareable([band, a]) - shareable([band, b]))[0];
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
  // Every second row may sit to the side, within the gap after each machine.
  const sideways = shift ?? (rows > 1 && !plain && rng() < 0.3 ? choose([-4, -3, -2, -1, 1, 2, 3, 4], rng) : 0);
  const gap = Math.max(Math.abs(sideways), plain || rng() < 0.6 ? 0 : 1 + Math.floor(rng() * 2));
  return {
    rotation, rowLength, flip, middle, belts: placed, pipes: pipeRows, shift: sideways, gap,
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

// First, each Sub-Block's most compact variants in turn, with roomy and tight packing, then
// with wide margins; then wider gaps and margins for the most compact.
function sweep(first, pools, routes) {
  const longest = Math.max(...pools.map(p => p.length));
  const at = (v, g) => ({ ...first, variants: first.variants.map(() => v), gaps: first.gaps.map(() => g), shelfGap: g, margin: { w: g, e: g, n: g, s: g } });
  // Stacked rows need room beside them to route around; try each variant with it early.
  const roomy = v => {
    const room = pools.map(p => sideRoom(p[Math.min(v, p.length - 1)].core));
    const w = Math.max(...room.map(r => r.w)), e = Math.max(...room.map(r => r.e));
    return w > 2 || e > 2 ? [{ ...at(v, 2), margin: { w: Math.max(w, 2), e: Math.max(e, 2), n: 2, s: 2 } }] : [];
  };
  // A chain of Sub-Blocks stacked one per shelf in Dependency Order: every row reaches the west
  // edge for its Side Inputs and the east edge for its Side Output, and Internal Paths drop down
  // the sides, one lane per parallel belt beside each core's own turns.
  const stacked = v => {
    if (pools.length < 2) return [];
    const cores = pools.map(p => p[Math.min(v, p.length - 1)].core);
    const room = cores.map(sideRoom);
    const partsOf = (i, id) => cores[i].parts.filter(p => p.routeIds.includes(id)).length;
    const internal = routes.filter(r => r.kind === 'belt' && typeof r.source === 'number' && r.consumers.length)
      .reduce((sum, r) => sum + Math.max(1, Math.min(partsOf(r.source, r.id), ...r.consumers.map(c => partsOf(c, r.id)))), 0);
    const side = which => Math.max(2, ...room.map(r => r[which])) + Math.ceil(internal / 2);
    return [{ ...at(v, 2), stack: true, margin: { w: side('w'), e: side('e'), n: 2, s: 2 } }];
  };
  // Something to show early: each Sub-Block's variant with the fewest belts, which routes most
  // easily, packed with room.
  const fewest = pools.map(p => p.reduce((best, v, i) => (v.core.parts.length < p[best].core.parts.length ? i : best), 0));
  const simplest = { ...at(0, 2), variants: fewest, margin: { w: 4, e: 4, n: 2, s: 2 } };
  const list = [first, simplest];
  for (let v = 0; v < longest; v++) list.push(...stacked(v), at(v, 2), ...roomy(v), at(v, 1));
  // Room for pipes and belts to reach every band from outside the machines.
  for (let v = 0; v < longest; v++) list.push(at(v, 4));
  if (first.share.length > 1) list.push({ ...at(0, 2), share: first.share.map(() => true) }, { ...at(0, 1), share: first.share.map(() => true) });
  for (const g of [3, 4, 6]) list.push(at(0, g));
  return list.slice(1);
}

// Columns beside a core that routing needs: belts visiting several rows turn between them beside
// it, alternately east and west (compound.js visits a belt's rows in turn), one lane for each
// turn that overlaps another; a fluid with pipe rows in several bands has a riser there, which
// belts cross underground; and a column at the edge.
function sideRoom(core) {
  const parts = new Map();
  for (const row of core.rows) {
    const k = `${row.routeIds.join('+')}|${row.part}`;
    parts.set(k, [...(parts.get(k) ?? []), row.y]);
  }
  const turns = [[], []];
  for (const ys of parts.values()) {
    for (let i = 1; i < ys.length; i++) turns[i % 2].push([Math.min(ys[i - 1], ys[i]), Math.max(ys[i - 1], ys[i])]);
  }
  const lanes = turns.map(list => Math.max(0, ...list.map(([y]) => list.filter(([lo, hi]) => lo <= y && y < hi).length)));
  const fluids = [...new Set(core.pipeRows.map(p => p.routeId))].filter(id => core.pipeRows.filter(p => p.routeId === id).length > 1);
  const risers = [Math.floor(fluids.length / 2), Math.ceil(fluids.length / 2)];
  return { e: 1 + lanes[1] + 2 * risers[0], w: 1 + lanes[0] + 2 * risers[1] };
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
    const rowOf = (c, id) => c.rows.find(r => r.routeIds.includes(id))?.y;
    return { with: route.source, rows: [rowOf(cores[route.source], route.id), rowOf(core, route.id)] };
  });
  const placed = shelfPack(cores, candidate.order, { gaps: candidate.gaps, shelfGap: candidate.shelfGap, shelf: candidate.shelf, shares, stack: candidate.stack });
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
