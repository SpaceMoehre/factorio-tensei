// Designs each Sub-Block on its own (bottom-up): candidate layouts of its machines and belts,
// each built as a core and routed as a Module, ranked by Starvation, then Compactness.
import { planSubBlocks } from './plan.js';
import { buildFlows } from './flows.js';
import { buildRoutes, coreLinks } from './routes.js';
import { buildCore, LayoutError, ROTATIONS, routeItems, fluidSides } from './layout/core.js';
import { N, S } from './layout/grid.js';
import { routeModule, RoutingError, PowerError } from './layout/module.js';
import { maxFlow } from './layout/compose.js';

// How many of a Sub-Block's best cores are candidates.
const ROUTE_TRIES = 8;
const RANDOM_VARIANTS = 60;
// A Sub-Block with more machines than this may repeat one module instead; one with more than
// ONLY_COPIES is only ever built from repeated modules (routing it whole takes too long). Up to
// that, a whole module usually packs tighter: it is tried first.
const COPIES_FROM = 8;
const ONLY_COPIES = 120;

export function context(entries, catalog, logistics) {
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

// A Sub-Block's design candidates, most promising first: each { estimate, build } — build()
// routes it and returns { kinds: [{ module, reverse?, count }], trouble, area }. Cores come from
// structured variants (one row, rows as long as the busiest belt allows, pairs of rows facing a
// shared belt, Side and Head-on Belts for single machines) and random ones; huge Sub-Blocks
// repeat a module instead. Only the first candidate that routes is built here (designOf builds
// the others when the search first tries them); while it starves, the next ones are built too,
// until the deadline. Throws LayoutError when nothing fits.
export function designStep(ctx, index, rng, { now = () => Date.now(), deadline = Infinity } = {}) {
  const sb = ctx.plan[index];
  const building = ctx.catalog.buildings[sb.building];
  const links = coreLinks(sb, index, ctx.routes);
  const shape = shapeOf(ctx, sb, index, links);
  /** @type {any[]} */
  const candidates = sb.count > COPIES_FROM ? copyCandidates(ctx, index, shape, rng) : [];
  const errors = new Map();
  if (sb.count <= ONLY_COPIES || !candidates.length) {
    const cores = new Map();
    const attempt = variant => {
      if (!variant) return;
      try {
        const core = buildCore(sb, building, links, variant, ctx.env);
        const signature = JSON.stringify([core.w, core.h, core.entities.map(e => [e.x, e.y, e.name, e.direction]), core.rows.map(r => [r.routeIds, r.part, r.y, r.x]), core.pipeRows.map(r => r.y), core.poleSlots]);
        if (!cores.has(signature)) cores.set(signature, { variant, core });
      } catch (e) {
        if (!(e instanceof LayoutError)) throw e;
        errors.set(e.message, (errors.get(e.message) ?? 0) + 1);
      }
    };
    for (const variant of variants(shape, links, sb, rng)) attempt(variant);
    // Machines whose belts above and below cannot feed them take belts on their sides too.
    const best = Math.min(...[...cores.values()].map(c => trouble(c.core)));
    if (!(best <= 1e-6)) for (const variant of sideVariants(shape, links, sb, rng)) attempt(variant);
    // Stacked rows whose connections face the bands above and below but have no pipe rows rarely
    // route: their pipes must find their own way between the rows. Those come last. (Connections
    // on the machines' sides are reached through the gaps between them.)
    const stuck = ({ variant, core }) => (variant.rowLength < sb.count && !variant.pipes.length
      && core.ports.some(p => p.tiles.some(([, , d]) => d === N || d === S)) ? 1 : 0);
    const ranked = [...cores.values()].sort((a, b) => stuck(a) - stuck(b) || trouble(a.core) - trouble(b.core)
      || areaOf(a.core) - areaOf(b.core));
    // The best of each kind first (row length, pipe rows, merged belts, side belts), so a bigger
    // kind that routes where the smallest cannot still gets a turn.
    const kind = ({ variant }) => `${variant.rowLength}|${variant.pipes.length > 0}|${variant.belts.some(b => b.routeIds.length > 1)}|${(variant.sides?.length ?? 0) + (variant.heads?.length ?? 0) > 0}`;
    const leaders = ranked.filter((v, i) => ranked.findIndex(w => kind(w) === kind(v)) === i);
    for (const { variant, core } of [...leaders, ...ranked.filter(v => !leaders.includes(v))].slice(0, ROUTE_TRIES)) {
      candidates.push({
        estimate: { trouble: trouble(core), area: areaOf(core), stuck: stuck({ variant, core }) }, variant,
        build: () => {
          let failure = null;
          for (const margin of margins(core)) {
            try {
              const module = routeModule(core, moduleOptions(ctx, links, margin));
              return { kinds: [{ module, count: 1 }], variant, trouble: trouble(core) + laneShortfall(ctx, sb, module), area: module.area.w * module.area.h };
            } catch (e) {
              if (!(e instanceof RoutingError || e instanceof PowerError)) throw e;
              failure = e;
            }
          }
          throw failure;
        },
      });
    }
  }
  // Whole modules by their estimate, best first; repeated ones after the best whole one.
  const rank = (a, b) => (a.estimate.stuck ?? 0) - (b.estimate.stuck ?? 0) || a.estimate.trouble - b.estimate.trouble || a.estimate.area - b.estimate.area;
  const whole = candidates.filter(c => !c.copies).sort(rank), repeated = candidates.filter(c => c.copies).sort(rank);
  // Past 40 machines a whole module takes long to route and seldom does: copies first.
  const first = sb.count > 40 ? [...repeated, ...whole] : [...whole.slice(0, 1), ...repeated, ...whole.slice(1)];
  candidates.splice(0, candidates.length, ...first);
  if (!candidates.length) {
    const [reason] = [...errors].sort((a, b) => b[1] - a[1])[0] ?? ['no layout fits'];
    throw new LayoutError(`${sb.recipe}: ${reason}`);
  }
  // The first candidate that routes goes first; the ones before it that do not, go. Routing shows
  // how the lanes fill: while the best so far starves, the next ones are routed too, and the
  // one that starves least goes first.
  let failure = null;
  while (candidates.length && !designOf(candidates[0])) failure = candidates.shift().failed;
  if (!candidates.length) throw new LayoutError(`${sb.recipe}: ${failure?.message ?? 'no layout routes'}`);
  for (let k = 1; k < candidates.length && candidates[0].design.trouble > 1e-6 && now() < deadline; k++) {
    const d = designOf(candidates[k]);
    if (d && d.trouble < candidates[0].design.trouble - 1e-6) candidates.unshift(...candidates.splice(k, 1));
  }
  return candidates.filter(c => !c.failed);
}

// A candidate's design, routed the first time it is asked for; null when it does not route.
export function designOf(candidate) {
  if (!candidate.design && !candidate.failed) {
    try {
      candidate.design = candidate.build();
    } catch (e) {
      if (!(e instanceof LayoutError || e instanceof RoutingError || e instanceof PowerError)) throw e;
      candidate.failed = e;
    }
  }
  return candidate.design ?? null;
}

const trouble = c => c.shortfall + c.overload;

// Huge Sub-Blocks repeat one module (ADR 0005): a pair of rows facing the belt between them, or
// one row, as long as its busiest belt can feed — one chain exhausting its belt, copied rather
// than routed again. Belts the module does not exhaust run through every copy: the copies
// alternate between the module and its reverse (those belts running east to west), so such a
// belt snakes down the stack. The machines left over make a smaller module at the bottom.
function copyCandidates(ctx, index, shape, rng) {
  const sb = ctx.plan[index];
  const out = [];
  const pair = Math.max(1, Math.floor(shape.rowCap / 2));
  // Rows as long as make the whole stack of copies about square, within what the busiest belt
  // can feed: a pair of rows facing it share it.
  const { w, h } = shape.building.size;
  const pitch = Math.min(w, h), depth = Math.max(w, h) + 3;
  const square = Math.max(1, Math.min(shape.rowCap, Math.round(Math.sqrt(sb.count * depth / pitch))));
  const sizes = [[2, Math.max(1, Math.min(pair, square))], [2, square], [2, pair], [1, Math.min(shape.rowCap, square)]];
  for (const [rows, n] of sizes.filter((s, i) => sizes.findIndex(t => t[0] * t[1] === s[0] * s[1] && t[1] === s[1]) === i)) {
    const m = rows * n;
    const count = Math.floor(sb.count / m);
    if (count < 2) continue;
    const rest = sb.count - count * m;
    // Estimated by the machines' footprint with a band per row; a squarer stack ranks first.
    const stack = { w: n * pitch, h: count * rows * depth };
    const aspect = Math.max(stack.w / stack.h, stack.h / stack.w);
    out.push({
      estimate: { trouble: 0, area: sb.count * pitch * depth * (1 + 0.1 * aspect) }, copies: count,
      build: () => {
        const main = repeatable(ctx, index, m, n, rng, count + (rest ? 1 : 0));
        const kinds = [{ ...main, count }];
        if (rest) kinds.push({ ...repeatable(ctx, index, rest, n, rng, count + 1, main.chained), count: 1 });
        const area = kinds.reduce((sum, k) => sum + k.count * k.module.area.w * k.module.area.h, 0);
        return { kinds, trouble: kinds.reduce((sum, k) => sum + k.count * k.trouble, 0), area, copies: count };
      },
    });
  }
  return out;
}

// A module of `m` machines in rows of `n`, routed both ways. `copies` modules share each belt
// that runs through them all: a route is chained when every copy's share fits on one belt
// (`chained` fixes the set, for the leftover module).
function repeatable(ctx, index, m, n, rng, copies, chained = null) {
  const full = ctx.plan[index];
  const sb = scaled(full, m);
  const building = ctx.catalog.buildings[sb.building];
  const links = coreLinks(full, index, ctx.routes);
  const shape = shapeOf(ctx, sb, index, links);
  const found = [];
  for (const rotation of rotationsFor(shape, links)) {
    for (const merge of [false, true]) {
      for (const middle of n < m ? [4, 5, 6] : [4]) {
        for (const pipes of links.fluids.length ? [true, false] : [false]) {
          const variant = stackVariant(shape, { rotation, rowLength: n, flip: true, plain: true, pipes, merge, middle }, rng);
          if (!variant) continue;
          try {
            found.push({ variant, core: buildCore(sb, building, links, variant, ctx.env) });
          } catch (e) {
            if (!(e instanceof LayoutError)) throw e;
          }
        }
      }
    }
  }
  // Stacked rows whose fluids have no pipe rows rarely route; those come after.
  const stuck = ({ variant, core }) => (variant.rowLength < m && !variant.pipes.length
    && core.ports.some(p => p.tiles.some(([, , d]) => d === N || d === S)) ? 1 : 0);
  found.sort((a, b) => trouble(a.core) - trouble(b.core) || stuck(a) - stuck(b) || areaOf(a.core) - areaOf(b.core));
  let failure = null;
  for (const { variant, core } of found.slice(0, 8)) {
    for (const margin of margins(core)) {
      try {
        const module = routeModule(core, moduleOptions(ctx, links, margin));
        let through = chained ?? chainedRoutes(ctx, index, module, copies);
        let keys = new Set(module.parts.filter(p => p.routeIds.every(id => through.has(id))).map(p => p.key));
        // Belts snaking through the copies turn beside the stack, each in a lane of its own; a
        // belt crossing to an outer lane dives under the inner ones (lanes two apart) in one hop.
        // More than fit: every copy gets belts of its own instead.
        if (keys.size > maxSnaking(ctx)) {
          through = new Set();
          keys = new Set();
        }
        const reverse = keys.size ? routeModule(core, { ...moduleOptions(ctx, links, margin), reverse: keys }) : null;
        return { module, reverse, chained: through, variant, trouble: trouble(core) + laneShortfall(ctx, sb, module) };
      } catch (e) {
        if (!(e instanceof RoutingError || e instanceof PowerError)) throw e;
        failure = e;
      }
    }
  }
  throw failure ?? new LayoutError(`${full.recipe}: no module of ${m} routes`);
}

// How many belts may snake through a stack of copies.
export function maxSnaking(ctx) {
  return Math.max(0, Math.floor((Math.min(ctx.env.beltReach, ctx.env.pipeReach) - 2) / 2));
}

// The routes whose belts run through the copies: an Internal Path, a Side Input or an output
// whose whole rate fits one belt (each item its lane, when merged), and an output only the train
// takes where two copies' share does.
function chainedRoutes(ctx, index, module, copies) {
  const sb = ctx.plan[index];
  const lane = ctx.env.laneCapacity;
  const out = new Set();
  for (const part of module.parts) {
    const route = ctx.routes[part.routeIds[0]];
    if (part.kind === 'head') continue;
    // An Internal Path's belts snake through runs of copies, as many runs as it has belts.
    if (typeof route.source === 'number' && route.consumers.length === 1 && route.sink !== 'side-output') {
      part.routeIds.forEach(id => out.add(id));
      continue;
    }
    if (route.source === index) {
      const perMachine = sb.outputs.filter(o => o.type === 'item').reduce((sum, o) => sum + o.rate, 0) / sb.count;
      const drops = Array.from({ length: copies }, () => part.drops).flat();
      // An output only the train takes snakes through runs of copies where two copies' share
      // fits one belt (the copy routed the other way round fills the other lane, where this
      // one's lane is decided); otherwise every copy has a belt of its own.
      const mirrored = part.drops.map(d => ({ left: d.right, right: d.left, either: d.either }));
      const pair = !route.consumers.length && 2 * perMachine * part.machines <= maxFlow([...part.drops, ...mirrored], perMachine, lane) + 1e-6;
      if (pair || perMachine * sb.count <= maxFlow(drops, perMachine, lane) + 1e-6) part.routeIds.forEach(id => out.add(id));
      continue;
    }
    const merged = part.routeIds.length > 1 || route.items.length > 1;
    const fits = part.routeIds.every(id => ctx.routes[id].items.every(i => {
      const need = sb.inputs.find(x => x.name === i.item)?.rate ?? 0;
      return need <= (merged ? lane : 2 * lane) + 1e-6;
    }));
    // Several Sub-Blocks share a Side Input that is not split per consumer: it runs through all.
    if (fits || route.consumers.length > 1) part.routeIds.forEach(id => out.add(id));
  }
  return out;
}

// A Sub-Block cut down to `m` of its machines, every rate in proportion.
function scaled(sb, m) {
  const f = m / sb.count;
  const scale = list => list.map(x => ({ ...x, rate: x.rate * f }));
  return { ...sb, count: m, rate: sb.rate * f, inputs: scale(sb.inputs), outputs: scale(sb.outputs), byproducts: scale(sb.byproducts) };
}

// Output a module's belts cannot take, once routed: its inserters drop onto lanes, each lane
// holding half a belt (a drop along the belt may land on either lane). The parts of an Internal
// Path run on as many belts as the path has, each chaining a run of parts, as the Compound Block
// links them.
function laneShortfall(ctx, sb, module) {
  const perMachine = sb.outputs.filter(o => o.type === 'item').reduce((sum, o) => sum + o.rate, 0) / sb.count;
  const parts = module.parts.filter(p => p.drops.length);
  if (!parts.length) return 0;
  const route = ctx.routes[parts[0].routeIds[0]];
  const internal = typeof route.source === 'number' && route.consumers.length === 1 && route.sink !== 'side-output';
  const groups = internal ? runs(parts, Math.min(parts.length, pathBelts(ctx, route))) : parts.map(p => [p]);
  return groups.reduce((sum, g) => {
    const made = perMachine * g.reduce((n, p) => n + p.machines, 0);
    return sum + Math.max(0, made - maxFlow(g.flatMap(p => p.drops), perMachine, ctx.env.laneCapacity));
  }, 0);
}

// Parts in `count` runs of neighbours with about equal machines each.
function runs(parts, count) {
  const total = parts.reduce((sum, p) => sum + p.machines, 0);
  const out = [];
  let taken = 0;
  for (let j = 0, k = 0; j < count; j++) {
    const group = [];
    while (k < parts.length - (count - 1 - j) && (!group.length || taken + parts[k].machines / 2 <= total * (j + 1) / count)) {
      taken += parts[k].machines;
      group.push(parts[k++]);
    }
    out.push(group);
  }
  return out;
}

export function moduleOptions(ctx, links, margin) {
  const { catalog, logistics } = ctx;
  const belt = catalog.belts[logistics.belt];
  return {
    margin, fluids: links.fluids,
    belt: { belt: belt.name, underground: belt.underground.name, reach: belt.underground.maxDistance },
    pipe: { pipe: logistics.plainPipe ?? 'pipe', underground: logistics.pipe, reach: catalog.pipes[logistics.pipe].maxDistance },
    pole: catalog.poles[logistics.pole], inserters: catalog.inserters,
    electric: e => catalog.buildings[e.name].energy === 'electric',
  };
}

// Margins to route a core in. A plain core (no fluids, no belt turning between rows) tries the
// tightest first: a column each side for the belts' ends. Others first get room for belts
// turning between rows, risers and the pipes leaving it (the Compound Block squeezes out what
// goes unused); then the other, then room all round.
function margins(core) {
  const room = sideRoom(core);
  const fluid = core.ports.length ? 2 : 0;
  const tight = { w: 1, e: 1, n: 0, s: 0 };
  const roomy = { w: room.w + fluid, e: room.e + fluid, n: 1, s: 1 };
  const plain = !fluid && room.w <= 1 && room.e <= 1;
  const list = [...(plain ? [tight, roomy] : [roomy, tight]), { w: room.w + fluid + 2, e: room.e + fluid + 2, n: 2, s: 2 }];
  return list.filter((m, i) => list.findIndex(o => JSON.stringify(o) === JSON.stringify(m)) === i);
}

const areaOf = core => core.w * core.h;

// The plainest variants first (one row, nearest belt rows, belts split between the faces, rows
// as long as the busiest belt allows, pairs of rows facing a shared belt), then random draws.
function* variants(shape, links, sb, rng) {
  const rotations = rotationsFor(shape, links);
  for (const rotation of rotations) {
    yield stackVariant(shape, { rotation, rowLength: sb.count, plain: true }, rng);
    // Rows as long as the busiest belt allows, half that (pairs of rows facing a belt fill both
    // its lanes), as many as fill one output lane, and about square.
    const outLane = Math.max(0, ...shape.belts.map(b => b.outLane));
    for (const { merge, cap } of [{ merge: false, cap: shape.rowCap }, { merge: true, cap: shape.mergeCap }, { merge: false, cap: Math.ceil(shape.rowCap / 2) }, { merge: false, cap: squareRow(shape, sb) }, { merge: false, cap: outLane }]) {
      if (!cap) continue;
      if (cap >= sb.count || (merge && cap === shape.rowCap)) continue;
      for (const middle of [4, 5, 6]) {
        for (const pipes of links.fluids.length ? [false, true] : [false]) {
          for (const shift of pipes ? [0, -1, 1, -2, 2, -3, 3, -4, 4] : [0]) {
            yield stackVariant(shape, { rotation, rowLength: cap, flip: true, plain: true, pipes, merge, middle, shift }, rng);
            yield stackVariant(shape, { rotation, rowLength: cap, flip: true, plain: true, pipes, merge, middle, shift, outputFirst: true }, rng);
          }
        }
      }
    }
  }
  // Fewer random draws for big cores: each takes longer to build.
  for (let n = 0; n < (sb.count > 24 ? RANDOM_VARIANTS / 3 : RANDOM_VARIANTS); n++) {
    const merge = rng() < 0.3;
    const cap = merge ? shape.mergeCap : shape.rowCap;
    const lengths = [sb.count, Math.ceil(sb.count / 2), cap, Math.max(1, cap - 1), Math.ceil(cap / 2), squareRow(shape, sb), 1 + Math.floor(rng() * sb.count)];
    const variant = stackVariant(shape, {
      rotation: choose(rotations, rng), rowLength: choose(lengths, rng), flip: rng() < 0.5, pipes: links.fluids.length > 0 && rng() < 0.5, merge,
    }, rng);
    // Which connection each fluid uses, where its box has several.
    if (variant && rng() < 0.5) variant.ports = links.fluids.map(() => Math.floor(rng() * 8));
    yield variant;
  }
}

// Machines without fluids look the same every half turn: two rotations do.
function rotationsFor(shape, links) {
  if (links.fluids.length) return ROTATIONS;
  const { w, h } = shape.building.size;
  return w === h ? [0] : [0, 4];
}

// The row length that makes a Sub-Block about square (rows stacked in pairs facing their belts),
// within what its busiest belt can feed: 4 rows of 5 rather than one of 20.
function squareRow(shape, sb) {
  const { w, h } = shape.building.size;
  const pitch = Math.min(w, h), depth = Math.max(w, h) + 3;
  return Math.max(1, Math.min(shape.rowCap, sb.count, Math.round(Math.sqrt(sb.count * depth / pitch))));
}

// One machine per row, belts on all four sides: each of a few routes moves from the bands above
// and below to a Side Belt (west or east, one or two tiles out) or a Head-on Belt (an input from
// the west, an output to the east). The busiest routes move first.
function* sideVariants(shape, links, sb, rng) {
  if (sb.count > 8) return;
  const demand = b => b.items.reduce((sum, i) => sum + i.rate, 0);
  const routes = [...shape.belts].sort((a, b) => demand(b) - demand(a));
  // A Head-on Belt serves one machine and starts (an output) or ends (an input) its belt: only
  // where each machine's may be a belt of its own — as many as an Internal Path has, never on a
  // route that runs as one belt through several machines.
  const headOk = b => (b.parts ? sb.count === b.parts : !b.oneBelt || (sb.count === 1 && b.isOutput));
  // Up to three of the four busiest belts move, busiest first: to a Head-on Belt where it may
  // have one (or not), else to the next free Side Belt slot — west, east, then a tile further out.
  const slots = [{ face: 'W', slot: 1 }, { face: 'E', slot: 1 }, { face: 'W', slot: 2 }, { face: 'E', slot: 2 }];
  const busiest = routes.slice(0, 4);
  const subsets = [];
  const grow = (k, set) => {
    if (set.length) subsets.push([...set]);
    if (set.length >= 3) return;
    for (let j = k; j < busiest.length; j++) grow(j + 1, [...set, busiest[j]]);
  };
  grow(0, []);
  subsets.sort((a, b) => a.length - b.length);
  const choices = [];
  const seen = new Set();
  for (const subset of subsets) {
    for (const heads of [true, false]) {
      const moved = [];
      for (const belt of subset) {
        const head = heads && headOk(belt) ? (belt.isOutput ? 'E' : 'W') : null;
        // A machine side takes side belts or a head-on belt, not both.
        if (head && !moved.some(m => (m.option.head ?? m.option.face) === head)) {
          moved.push({ belt, option: { head } });
          continue;
        }
        const slot = slots.find(o => !moved.some(m => (m.option.head && m.option.head === o.face) || (m.option.face === o.face && m.option.slot === o.slot)));
        if (!slot) break;
        moved.push({ belt, option: slot });
      }
      const signature = moved.map(m => `${m.belt.routeIds.join('+')}:${m.option.head ?? m.option.face + m.option.slot}`).join();
      if (moved.length === subset.length && !seen.has(signature)) {
        seen.add(signature);
        choices.push(moved);
      }
    }
  }
  const rows = sb.count;
  for (const moved of choices) {
    const rest = { ...shape, belts: shape.belts.filter(b => !moved.some(m => m.belt === b)) };
    for (const rotation of rotationsFor(shape, links)) {
      const base = rest.belts.length ? stackVariant(rest, { rotation, rowLength: 1, flip: true, plain: true }, rng) : {
        rotation, rowLength: 1, flip: true, middle: rows > 1 ? 4 : 0, belts: [], pipes: [], shift: 0, gap: 0, columns: 'center', poleSlot: null,
      };
      if (!base) continue;
      const parts = new Map();
      const nextPart = ids => {
        const k = ids.join('+');
        const used = [...base.belts.filter(b => b.routeIds.join('+') === k).map(b => b.part), ...(parts.get(k) ?? [])];
        const p = used.length ? Math.max(...used) + 1 : 0;
        parts.set(k, [...(parts.get(k) ?? []), p]);
        return p;
      };
      // A Side Belt runs down as many machines as it can feed (an output: as fill one lane); a
      // Head-on Belt serves one.
      const sides = [], heads = [];
      for (const { belt, option } of moved) {
        const per = option.head ? 1 : Math.max(1, belt.isOutput ? belt.outLane : belt.perBelt);
        // An Internal Path's parts: exactly as many as the path has belts (never more than rows).
        const cuts = belt.parts ? exactCuts(Array(rows).fill(1), belt.parts) : null;
        for (let r = 0, j = 0; r < rows; j++) {
          const last = cuts ? cuts[j] : Math.min(rows, r + per) - 1;
          const serves = [...Array(last - r + 1).keys()].map(k => r + k);
          r = last + 1;
          const line = { routeIds: belt.routeIds, part: nextPart(belt.routeIds), serves };
          if (option.head) heads.push({ ...line, face: option.head, at: Math.floor((sbHeight(shape, rotation) - 1) / 2) });
          else sides.push({ ...line, face: option.face, slot: option.slot });
        }
      }
      yield { ...base, sides, heads };
    }
  }
}

const sbHeight = (shape, rotation) => (rotation === 4 || rotation === 12 ? shape.building.size.w : shape.building.size.h);

// What shapes a Sub-Block's layout: its belt routes, how many machines one belt of each can
// feed, which routes may split into parallel belts (a Side Input only it takes, an output
// nothing else takes, or an Internal Path between it and one other Sub-Block), and its fluids.
export function shapeOf(ctx, sb, index, links) {
  const belts = [...links.inputs, ...(links.output !== null ? [links.output] : [])].map(routeId => {
    const route = ctx.routes[routeId];
    const isOutput = routeId === links.output;
    const items = routeItems(sb, route, isOutput);
    const internal = typeof route.source === 'number' && route.consumers.length === 1 && route.sink !== 'side-output';
    const splittable = internal || (isOutput ? route.consumers.length === 0 : route.source === 'side-input' && route.consumers.length === 1);
    // A single-item Side Input that may split can share parallel belts with another: one lane each.
    const perLane = !isOutput && splittable && route.source === 'side-input' && items.length === 1
      ? Math.floor(ctx.env.laneCapacity / (items[0].rate / sb.count) + 1e-9) : 0;
    // Both ends of an Internal Path cut it into the same number of parallel belts, as many as its
    // producer's lanes need (and each end has machines for), so each belt links a part of the
    // producer to a part of the consumer: a whole module into exactly that many parts (its parts
    // never chain into each other), copies as their belts snake through them.
    const whole = sb.count === ctx.plan[index].count;
    if (internal) {
      const belts = pathBelts(ctx, route);
      return {
        routeIds: [routeId], perBelt: producerPart(sb.count, belts), parts: whole ? belts : null, splittable, perLane, isOutput, items,
        outLane: isOutput ? outputLane(ctx, sb) : 0, oneBelt: false,
      };
    }
    // Output inserters drop a machine's whole output on one lane: a belt takes as many machines
    // as fit a lane on either side of it.
    const perBelt = isOutput
      ? 2 * outputLane(ctx, sb)
      : Math.min(...items.map(i => route.items.find(x => x.item === i.name).capacity / (i.rate / sb.count)));
    return {
      routeIds: [routeId], perBelt: Math.max(1, Math.floor(perBelt + 1e-9)), parts: null, splittable, perLane, isOutput, items,
      outLane: isOutput ? outputLane(ctx, sb) : 0, oneBelt: !splittable,
    };
  });
  const depths = ctx.env.rightAngle ? [1, 2, 3, 4] : [2, 3, 4];
  if (belts.length > 2 * depths.length + 4) {
    throw new LayoutError(`${sb.recipe} needs ${belts.length} belts; ${2 * depths.length + 4} fit around a machine`);
  }
  const rowCap = Math.min(sb.count, ...belts.filter(b => b.splittable).map(b => b.perBelt));
  // With merged pairs, rows as long as the busiest unmerged belt or merged lane allows.
  const mergeCap = Math.min(sb.count, ...pairUp(belts).filter(b => b.splittable).map(b => b.perBelt));
  return { sb, links, belts, depths, rowCap, mergeCap, building: ctx.catalog.buildings[sb.building] };
}

// The most machines a producer's part may have so its `count` machines make at least `belts`
// parts.
function producerPart(count, belts) {
  let per = Math.max(1, Math.ceil(count / belts));
  while (per > 1 && Math.ceil(count / per) < belts) per--;
  return per;
}

// Machines whose output fits one lane (at least one).
function outputLane(ctx, sb) {
  const perMachine = sb.outputs.filter(o => o.type === 'item').reduce((sum, o) => sum + o.rate, 0) / sb.count;
  return Math.max(1, Math.floor(ctx.env.laneCapacity / perMachine + 1e-9));
}

// Parallel belts an Internal Path runs on: its rate over a belt, and at least as many as its
// producer's machines need when each fills one lane of a belt between two rows — but no more
// than either end has machines.
function pathBelts(ctx, route) {
  const producer = ctx.plan[route.source], consumer = ctx.plan[route.consumers[0]];
  const rate = route.items.reduce((sum, i) => sum + i.rate, 0);
  const need = Math.max(1, Math.ceil(rate / (2 * route.items[0].capacity) - 1e-9), Math.ceil(producer.count / (2 * outputLane(ctx, producer)) - 1e-9));
  return Math.min(need, producer.count, consumer.count);
}

// Rows cut into exactly `parts` runs of neighbours, about equal by machines: the last row of
// each, or null when there are fewer rows.
export function exactCuts(counts, parts) {
  if (counts.length < parts) return null;
  const total = counts.reduce((sum, c) => sum + c, 0);
  const out = [];
  let taken = 0;
  for (let j = 0, r = 0; j < parts; j++) {
    taken += counts[r++];
    while (r < counts.length - (parts - 1 - j) && taken + counts[r] / 2 <= total * (j + 1) / parts) taken += counts[r++];
    out.push(r - 1);
  }
  return out;
}

// Belt Merge per part: single-item inputs that may split pair up, those whose lanes feed the
// most machines together; a pair feeds as many machines as the weaker lane allows, as long as
// a row still gets at least one machine's worth.
function pairUp(belts) {
  const single = belts.filter(b => b.perLane >= 1).sort((a, b) => b.perLane - a.perLane);
  const out = belts.filter(b => !single.includes(b));
  for (let i = 0; i + 1 < single.length; i += 2) {
    out.push({
      routeIds: [...single[i].routeIds, ...single[i + 1].routeIds], perBelt: Math.min(single[i].perLane, single[i + 1].perLane), splittable: true, perLane: 0,
      isOutput: false, items: [...single[i].items, ...single[i + 1].items],
    });
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
// With `outputFirst`, the output takes the bands rows share first, so rows either side fill both
// its lanes.
export function stackVariant(shape, { rotation, rowLength, flip = false, plain = false, pipes = false, merge = false, middle: height = null, shift = null, outputFirst = false }, rng) {
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
  const lead = outputFirst ? [...belts.filter(b => b.isOutput), ...belts.filter(b => !b.isOutput)] : belts;
  // An Internal Path's belt in a whole module splits into exactly as many parts as the path has
  // belts.
  if (belts.some(b => b.parts && rows < b.parts)) return null;
  (plain ? lead : shuffle(belts, rng)).forEach((b, n) => {
    const machinesPerPart = b.splittable ? b.perBelt : Infinity;
    const offset = rows < 2 ? 0 : plain ? n % 2 : Math.floor(rng() * 2);
    const cuts = b.parts ? exactCuts(counts, b.parts) : null;
    let part = 0;
    for (let first = 0; first < rows;) {
      // As many whole rows as one belt can feed.
      let last = first, machines = counts[first];
      if (cuts) last = cuts[part];
      else while (last + 1 < rows && machines + counts[last + 1] <= machinesPerPart) machines += counts[++last];
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

// Columns beside a core that routing needs: belts visiting several rows turn between them beside
// it, alternately east and west, one lane for each turn that overlaps another; a fluid with pipe
// rows in several bands has a riser there, which belts cross underground; and a column at the edge.
export function sideRoom(core) {
  const parts = new Map();
  for (const row of core.rows.filter(r => r.axis !== 'v')) {
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

export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const choose = (list, rng) => list[Math.floor(rng() * list.length)];

export function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
