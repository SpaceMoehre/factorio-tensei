import { Grid, N, E, S, W, VEC, key, turnLeft, turnRight } from './grid.js';
import { routeLink, routePipe, RoutingError } from './router.js';
import { PowerError } from './poles.js';
import { trim, maxFlow } from './module.js';
import { pathFlow } from './flow.js';
import { simulate } from '../sim.js';

export { RoutingError, PowerError, maxFlow };

const REROUTES = 1;
const SPLITTER_TRIES = 3;
// A Fan-out's splitter stands up to this many tiles before the entry it feeds; so many spots are
// tried.
const FAN_REACH = 8;
const FAN_TRIES = 4;
// A Fan-out from producers: its legs between splitters and entries give up after so many states
// and so many more a tile of the way (another spot is tried instead).
const FAN_EFFORT = 3000, FAN_EFFORT_PER_STEP = 60;
// Across Sub-Blocks, a splitter may also stand up to this many rows above or below the entry.
const FAN_ROWS = 4;
// A Fan-out's run holds at most this many belts (across Sub-Blocks, in a `short` layout, so many).
const FAN_RUN = 16, FAN_SHORT = 3;

// The copies of every Sub-Block's modules and the global routes between them, before any of
// them is placed. designs: per Sub-Block { kinds: [{ module, count }] }; columns: per Sub-Block,
// how many columns its copies stand in (by default one; 0 for about square).
export function prepare(ctx, designs, columns = []) {
  const laneCapacity = ctx.catalog.belts[ctx.logistics.belt].itemsPerSecond * 30;
  // In a City Block, a stack of copies taller than its room stands in as many columns as it needs
  // (unless the candidate says how many).
  const fit = ctx.site ? designs.map((d, i) => {
    if (columns[i] !== null && columns[i] !== undefined) return columns[i];
    const height = d.kinds.filter(k => !k.detached).reduce((sum, k) => sum + k.count * k.module.area.h, 0);
    return height > ctx.site.inner.h ? Math.ceil(height / (ctx.site.inner.h - 2)) : null;
  }) : columns;
  const instances = makeInstances(ctx.plan, designs, fit);
  return { instances, routes: groupRoutes(ctx, instances, laneCapacity) };
}

// What a prepared layout starves at least, before it is placed (Starvation): its belts carry
// what their Path Flow delivers, through every splitter it asks for or none (compose places
// what it can), and its inserters move what they move. Routing only adds to it.
export function leastStarvation(ctx, prepared) {
  const subBlocks = ctx.plan.map((sb, i) => ({ ...sb, inserters: supplyOf(prepared.instances.filter(inst => inst.step === i)) }));
  const starving = routes => simulate({ routes, subBlocks }).starvation.reduce((sum, s) => sum + s.demand - s.available, 0);
  const plain = starving(prepared.routes);
  if (!prepared.routes.some(r => r.splitter)) return plain;
  return Math.min(plain, starving(prepared.routes.map(r => (r.splitter ? { ...r, items: r.splitter.items } : r))));
}

// The Compound Block from routed modules (bottom-up): each Sub-Block's design is one or more
// kinds of Module, each repeated `count` times. Copies of every module stand in the block as
// they were routed; only the links between them are routed here: the train to each module's
// belts, one module's output on to the next module or its consumers, and on to the train.
// Belts of one route chain through as many copies as one belt can carry; pipes join every copy's
// stub of a fluid into one network. Poles are placed later, over the whole block (compact.js).
// prepared: from prepare(); positions: each copy's top-left corner (its module's area)
// layout: { margin, routeOrder, plain (no splitters: paired belts go straight on, a Fan-out's
//          belts each from the west edge), fansLast (Fan-outs routed after the other Side
//          Inputs), alone (no Fan-out across Sub-Blocks: each one's belts of a Side Input from
//          the west edge), short (Fan-outs across Sub-Blocks in runs of FAN_SHORT at most),
//          until (true once the search is out of time) }
// In a City Block (ctx.site) links are routed inside its Buffer and round its Fixtures (or under
// them): the train's belts enter on its inner west edge and leave on its inner east edge.
// Throws RoutingError or PowerError when the layout cannot be built.
export function compose(ctx, prepared, positions, layout) {
  const { plan, catalog, logistics } = ctx;
  const { instances, routes } = prepared;
  const placed = positions.map((p, n) => {
    const { area } = instances[n].module;
    return { x: p.x - area.x, y: p.y - area.y, box: { x: p.x, y: p.y, w: area.w, h: area.h } };
  });
  // In a City Block the area inside its Buffer, its Fixtures standing in it. Elsewhere, copies
  // whose pipes stop at the block's west (east) edge are joined there: room for a trunk per fluid
  // to join, three columns each so trunks of two fluids can pass each other.
  const { site = null } = ctx;
  const area = site ? { ...site.inner } : extentOf([...placed, ...(positions.bounds ? [positions.bounds] : [])], layout.margin);
  // Standing on its own, a row along the top for each Recipe Loop's feedback to run back west
  // on, from its producer to the Sub-Block it feeds.
  const feeds = routes.filter(r => r.tapOf !== undefined && !layout.plain);
  if (!site) {
    area.y -= feeds.length;
    area.h += feeds.length;
  }
  for (const side of site ? [] : ['W', 'E']) {
    const edge = side === 'W' ? area.x : area.x + area.w - 1;
    const trunks = routes.filter(r => r.kind === 'pipe' && r.stubs.length > 1 && r.stubs.some(st => st.side === side
      && placed[st.inst.index].x + st.x === edge)).length;
    if (!trunks) continue;
    if (side === 'W') area.x -= 3 * trunks;
    area.w += 3 * trunks;
  }

  // In a City Block, the column just west of the westmost copy: a Side Input is routed through
  // the block from there (a search from the City Block's west edge would flood all the room in
  // front of it), then from the west edge on to where it starts.
  const approach = site ? Math.max(area.x, Math.min(...placed.map(p => p.box.x)) - 1) : area.x;

  // Fan-outs, each run's belts in line order (by route id): a Sub-Block's copies' (groupRoutes),
  // and (unless `alone`) a Side Input's belts into several Sub-Blocks, cut into runs by where
  // their entries stand (fanAcross). None in a plain layout.
  const fans = new Map();
  const across = layout.plain || layout.alone ? [] : fanAcross(routes, placed, area, layout.short ? FAN_SHORT : FAN_RUN);
  if (!layout.plain) for (const r of routes) if (r.fan) fans.set(r.id, r.fan.family);
  for (const run of across) for (const r of run) fans.set(r.id, run.map(m => m.id));

  const beltSpec = catalog.belts[logistics.belt];
  const belts = { belt: beltSpec.name, underground: beltSpec.underground.name, reach: beltSpec.underground.maxDistance };
  const pipes = { pipe: logistics.plainPipe ?? 'pipe', underground: logistics.pipe, reach: catalog.pipes[logistics.pipe].maxDistance };

  // Every copy's machines, inserters and routed pieces, under the global route ids.
  const placeAll = () => {
    const grid = new Grid(area);
    for (const f of site?.fixtures ?? []) grid.place(f);
    // Copies may stand in each other's empty corners (a refined placement), never on each other.
    const put = e => {
      for (let dx = 0; dx < e.w; dx++) for (let dy = 0; dy < e.h; dy++) {
        if (grid.occupied.has(key(e.x + dx, e.y + dy))) throw new RoutingError(`copies overlap at ${e.x + dx},${e.y + dy}`);
      }
      grid.place(e);
    };
    const entities = [];
    const pieces = routes.map(() => []);
    instances.forEach((inst, n) => {
      const { x: ox, y: oy } = placed[n];
      const move = e => ({ ...e, x: e.x + ox, y: e.y + oy });
      for (const e of inst.module.entities) {
        const abs = { ...move(e), subBlock: inst.step };
        if (e.kind === 'building') abs.row = e.row + inst.rowOffset;
        entities.push(abs);
        put(abs);
      }
      const { core } = inst.module;
      for (const port of core.ports) {
        const id = pipeRouteOf(routes, port.routeId);
        for (const [x, y] of port.tiles) grid.reserveFluidPort(x + ox, y + oy, id);
      }
      for (const [x, y] of core.pipeBlocked) grid.pipeBlocked.add(key(x + ox, y + oy));
      for (const [x, y] of core.surfacePorts) grid.surfaceOnly.add(key(x + ox, y + oy));
      for (const p of inst.module.poles) grid.reserve(p.x + ox, p.y + oy, -1);
      for (const [x, y] of core.poleSlots) if (!grid.occupied.has(key(x + ox, y + oy))) grid.reserve(x + ox, y + oy, -1);
      // Drop tiles no belt takes stay clear: a link there would get the machine's products.
      for (const [x, y] of core.dropTiles ?? []) if (!grid.occupied.has(key(x + ox, y + oy))) grid.reserve(x + ox, y + oy, -1);
      for (const f of inst.module.fluids) {
        const id = pipeRouteOf(routes, f.routeId);
        const abs = f.pieces.map(p => ({ ...move(p), route: id }));
        for (const p of abs) put(p);
        addTunnels(grid, abs, pipes.underground);
        pieces[id].push(...abs);
      }
    });
    // Each slot's pieces, trimmed where its belt starts or ends in this copy.
    for (const route of routes.filter(r => r.kind === 'belt')) {
      route.slots.forEach((slot, k) => {
        const { x: ox, y: oy } = placed[slot.inst.index];
        // (A belt fed from a splitter is entered like a Side Input's; the producers' belt holding a
        // Fan-out's line leaves them.)
        const own = trim(slot.part, {
          head: k === 0 && route.source !== 'side-input' && route.fedFrom === undefined,
          tail: k === route.slots.length - 1 && route.sink !== 'side-output' && !route.fanOut,
        }, belts.belt)
          .map(p => ({ ...p, x: p.x + ox, y: p.y + oy, route: route.id, out: p.out === null ? null : shift(p.out, ox, oy) }));
        slot.pieces = own;
        for (const p of own) put(p);
        addTunnels(grid, own, belts.underground);
      });
    }
    // Beside a stack of copies, each belt snaking through them has a lane of its own on either
    // side, where it turns between copies: two columns out from the stack (the column against it
    // holds the tiles links enter and leave by), lanes two apart so a belt crossing to an outer
    // lane dives under the inner ones and surfaces between them; other belts and the fluids'
    // pipes dive across them to the trunks further out.
    for (const step of new Set(instances.map(inst => inst.step))) {
      const mine = instances.filter(inst => inst.step === step && !inst.detached);
      const snaking = routes.filter(r => r.kind === 'belt' && r.slots.some((slot, k) => k > 0
        && slot.inst.step === step && stacked(r.slots[k - 1].inst, slot.inst)));
      if (mine.length < 2 || !snaking.length || 2 * snaking.length + 2 > Math.min(belts.reach, pipes.reach)) continue;
      for (const column of new Set(mine.map(inst => inst.column ?? 0))) {
        const boxes = mine.filter(inst => (inst.column ?? 0) === column).map(inst => placed[inst.index].box);
        const x0 = Math.min(...boxes.map(b => b.x)), x1 = Math.max(...boxes.map(b => b.x + b.w - 1));
        const y0 = Math.min(...boxes.map(b => b.y)) - 1, y1 = Math.max(...boxes.map(b => b.y + b.h));
        snaking.forEach((route, j) => {
          for (let y = y0; y <= y1; y++) {
            for (const x of [x0 - 2 - 2 * j, x1 + 2 + 2 * j]) {
              if (grid.inBounds(x, y) && !grid.occupied.has(key(x, y)) && !grid.reserved.has(key(x, y))) grid.reserve(x, y, route.id);
            }
          }
        });
      }
    }
    if (!site) feeds.forEach((r, k) => { for (let x = area.x; x < area.x + area.w; x++) hold(grid, x, area.y + k, r.id); });
    // The tile where each copy's pipes leave it belongs to their network: a belt routed first
    // (after a link failed) must not take it.
    for (const route of routes.filter(r => r.kind === 'pipe')) {
      for (const { inst, x, y, side } of route.stubs) hold(grid, x + placed[inst.index].x + (side === 'W' ? -1 : 1), y + placed[inst.index].y, route.id);
    }
    // The tile before each copy's entry and after its exit belongs to the link that meets it
    // there: no other link may pass in front of it.
    for (const route of routes.filter(r => r.kind === 'belt')) {
      route.slots.forEach((slot, k) => {
        const first = slot.pieces[0], last = slot.pieces.at(-1);
        const [ex, ey] = VEC[slot.part.dir ?? E];
        if (k > 0 || route.source === 'side-input' || route.fedFrom !== undefined) hold(grid, first.x - ex, first.y - ey, route.id);
        if (k < route.slots.length - 1 || route.sink === 'side-output' || route.fanOut) {
          const [dx, dy] = VEC[last.travel];
          hold(grid, last.x + dx, last.y + dy, route.id);
        }
      });
    }
    return { grid, entities, pieces };
  };

  // Every belt link on its own, as a task: from the train (or the previous copy's exit) to a
  // copy's entry, or from the last copy on to the train. slot: which slot it leads into (the
  // number of slots for the link off to the east).
  const linkTasks = () => {
    const tasks = [];
    for (const route of routes.filter(r => r.kind === 'belt')) {
      route.slots.forEach((slot, k) => {
        if (k === 0 && route.source !== 'side-input') return;
        // A pair of belts through a splitter is routed as one task, by the first of the pair;
        // a Fan-out's belts by its first.
        if (route.splitter && k === route.splitter.at && !layout.plain) {
          if (route.id < route.splitter.with) tasks.push({ route, slot: k, split: true });
          return;
        }
        const family = k === 0 ? fans.get(route.id) : undefined;
        if (family) {
          if (route.id === family[0]) tasks.push({ route, slot: k, fan: family });
          return;
        }
        // A Recipe Loop's feedback starts at its splitter on the producer's output: routed with
        // that link (taps).
        if (route.tapOf !== undefined && k === 0 && !layout.plain) return;
        tasks.push({ route, slot: k, ...(route.taps && k === route.tapAt && !layout.plain ? { taps: true } : {}) });
      });
      if (route.sink === 'side-output' && !route.fanOut) tasks.push({ route, slot: route.slots.length, ...(route.taps && route.tapAt === route.slots.length && !layout.plain ? { taps: true } : {}) });
      // A Fan-out from the producers: their line, after their belt, and every consumer's belt.
      if (route.fanOut) tasks.push({ route, slot: route.slots.length, fanOut: route.fanOut });
    }
    return tasks;
  };
  const endsOf = ({ route, slot: k }) => {
    if (k === route.slots.length) {
      const last = route.slots.at(-1).pieces.at(-1);
      const [dx, dy] = VEC[last.travel];
      if (last.x === area.x + area.w - 1 && last.travel === E) return null;
      return { starts: [{ x: last.x + dx, y: last.y + dy, a: last.travel }], goal: 'east' };
    }
    const slot = route.slots[k];
    const entry = slot.pieces[0];
    const into = { x: entry.x, y: entry.y, a: slot.part.dir ?? E };
    if (k === 0) return entry.x > area.x || into.a !== E ? { starts: westEdge(area), goal: into } : null;
    const prev = route.slots[k - 1].pieces.at(-1);
    const [dx, dy] = VEC[prev.travel];
    return { starts: [{ x: prev.x + dx, y: prev.y + dy, a: prev.travel }], goal: into };
  };
  // The order links are routed in: the turns between copies of a stack first, innermost (the
  // shortest) first, so each finds the column it needs beside the stack; then links between
  // Sub-Blocks, then those on to the train, and the train's own links last (they may start on any
  // row).
  const taskRank = task => {
    const { route, slot: k } = task;
    // A Recipe Loop's feedback runs back across the block (along its row on top), after every
    // other link.
    if (task.taps) return [5, 0];
    // A Fan-out from producers lays its line before the links between Sub-Blocks: the longest first.
    if (task.fanOut) return [0.5, -task.fanOut.length];
    if (k > 0 && k < route.slots.length && stacked(route.slots[k].inst, route.slots[k - 1].inst)) {
      const ends = endsOf(task);
      const goal = /** @type {{ y: number }} */ (ends?.goal);
      return [0, ends ? Math.abs(goal.y - ends.starts[0].y) : 0];
    }
    // Links between Sub-Blocks: the longest first, so a link crossing other Sub-Blocks finds a
    // way past them before shorter ones fill the gaps.
    if (k > 0 && k < route.slots.length) {
      const ends = endsOf(task);
      const goal = /** @type {{ x: number }} */ (ends?.goal);
      return [1, ends ? -Math.abs(goal.x - ends.starts[0].x) : 0];
    }
    if (k === route.slots.length) return [2, 0];
    // Fan-outs before the other Side Inputs, those across Sub-Blocks first of all where producers
    // fan out too, before their lines (each run that falls apart is a belt more from the west
    // edge; with `fansLast`,
    // after the other Side Inputs: a run's splitters and line find their way round them, else its
    // belts go on their own): runs no belt joins first (each splitter of theirs saves a belt), the
    // shortest first.
    if (task.fan) {
      const first = task.fan.some(id => routes[id].perConsumer) && routes.some(r => r.fanOut) ? 0.4 : 3;
      return [layout.fansLast ? 4 : first, (planFan(task.fan.map(id => routes[id])).joins.length ? 1000 : 0) + task.fan.length - 2000];
    }
    return [3, 0];
  };
  // A belt route's pieces in the order items travel: each link, then the slot it leads into.
  const assemble = (route, links) => {
    const out = [];
    route.slots.forEach((slot, k) => {
      for (const p of links.get(k) ?? []) out.push(p);
      for (const p of slot.pieces) out.push(p);
    });
    for (const p of links.get(route.slots.length) ?? []) out.push(p);
    return out;
  };

  // A fluid's links: every copy's stub (where its pipes reach its west or east edge) joined, and
  // the train's edges.
  const routeFluid = (grid, route) => {
    const terminals = route.stubs.map(({ inst, x, y, side }) => {
      const { x: ox, y: oy } = placed[inst.index];
      return side === 'W' ? [x + ox - 1, y + oy, W] : [x + ox + 1, y + oy, E];
    }).filter(([x, y]) => grid.inBounds(x, y));
    const reachesWest = route.stubs.some(s => s.side === 'W' && placed[s.inst.index].x + s.x === area.x);
    const reachesEast = route.stubs.some(s => s.side === 'E' && placed[s.inst.index].x + s.x === area.x + area.w - 1);
    const source = route.source === 'side-input' && !reachesWest;
    const sink = route.sink === 'side-output' && !reachesEast;
    if (terminals.length < 2 && !source && !sink) return [];
    if (!terminals.length) throw new RoutingError(`${route.fluid}: no stub to join`);
    return routePipe(grid, { id: route.id, fluid: route.fluid, terminals, source, sink }, pipes);
  };

  // Pipes first (no fluid may touch another), then the belt links in their order. When one
  // fails, everything is ripped up and routed again with the failing one first, a few times.
  const keyOf = t => (t.pipe !== undefined ? `p${t.pipe}` : `${t.route.id}:${t.slot}`);
  let order = null;
  const tried = new Set();
  let balanced = new Set();
  // The Fan-outs' belts routed through their splitters: per belt, what the line carries on to it
  // (items) and the belt it is fed from (fedBy, the trunk), or for a belt from the west edge,
  // what it brings (brings).
  let fanned = new Map();
  // A Recipe Loop's feedback belts routed from their splitters.
  let tapped = new Set();
  const splitterName = beltSpec.splitter ?? beltSpec.name.replace(/transport-belt$/, 'splitter');
  for (;;) {
    const { grid, entities, pieces } = placeAll();
    // Slot pieces exist once placed: rank the links now (the first time).
    if (!order) {
      const fluids = routes.filter(r => r.kind === 'pipe').map(r => ({ pipe: r.id }));
      const belts_ = linkTasks().map(t => ({ ...t, rank: taskRank(t) }))
        .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.route.id - b.route.id || a.slot - b.slot);
      order = [...fluids, ...belts_];
      if (layout.routeOrder) order.sort((a, b) => layout.routeOrder.indexOf(a.route?.id ?? a.pipe) - layout.routeOrder.indexOf(b.route?.id ?? b.pipe));
    }
    tried.add(order.map(keyOf).join());
    const links = new Map();
    balanced = new Set();
    fanned = new Map();
    tapped = new Set();
    let failed = null;
    for (const task of order) {
      // A search out of time gives up on the layout rather than route on.
      if (layout.until && layout.until()) throw new RoutingError('out of time routing the links');
      try {
        if (task.pipe !== undefined) {
          pieces[task.pipe].push(...routeFluid(grid, routes[task.pipe]));
          continue;
        }
        if (task.split) {
          const legs = routeSplit(grid, task.route, routes[task.route.splitter.with]);
          for (const [id, leg] of legs) {
            if (!links.has(id)) links.set(id, new Map());
            links.get(id).set(routes[id].splitter.at, leg);
          }
          continue;
        }
        if (task.fan) {
          for (const [id, leg] of fan(grid, task.fan.map(id => routes[id]))) {
            if (!links.has(id)) links.set(id, new Map());
            links.get(id).set(0, leg);
          }
          continue;
        }
        if (task.fanOut) {
          // (In a City Block its line keeps off the west edge's column, where the Side Inputs come in.)
          const kept = [];
          for (let y = area.y; site && y < area.y + area.h; y++) {
            if (grid.at(area.x, y) || grid.holder(area.x, y) !== undefined) continue;
            grid.reserve(area.x, y, -1);
            kept.push(y);
          }
          try {
            for (const [id, leg] of fanFrom(grid, task)) {
              if (!links.has(id)) links.set(id, new Map());
              links.get(id).set(id === task.route.id ? task.slot : 0, leg);
            }
          } finally {
            for (const y of kept) if (grid.holder(area.x, y) === -1) grid.unreserve(area.x, y);
          }
          continue;
        }
        if (task.taps) {
          // Without room for the splitters, the link on its own and each feedback by train.
          const feeds = task.route.taps.map(id => routes[id]);
          const legs = routeTaps(grid, task, feeds) ?? [[task.route.id, task.slot, link(grid, task)], ...feeds.map(r => [r.id, 0, link(grid, { route: r, slot: 0 })])];
          for (const [id, k, leg] of legs) {
            if (!links.has(id)) links.set(id, new Map());
            links.get(id).set(k, leg);
          }
          continue;
        }
        if (!links.has(task.route.id)) links.set(task.route.id, new Map());
        links.get(task.route.id).set(task.slot, link(grid, task));
      } catch (e) {
        if (!(e instanceof RoutingError)) throw e;
        failed = { task, error: e };
        break;
      }
    }
    if (!failed) {
      for (const route of routes.filter(r => r.kind === 'belt')) pieces[route.id] = assemble(route, links.get(route.id) ?? new Map());
      return finish(grid, entities, pieces);
    }
    order = [failed.task, ...order.filter(t => t !== failed.task)];
    // The Sub-Blocks the link runs between go with the error: the search makes room round them.
    // (With Fan-outs, the caller may route it again: them last, else those across Sub-Blocks
    // without, else none. A Fan-out from producers that finds no way has no other: routing it
    // again is no use, the caller may chain the route instead, `chain` its base.)
    if (tried.has(order.map(keyOf).join()) || tried.size > REROUTES || failed.task.fanOut) {
      const chain = failed.task.fanOut ? { chain: failed.task.route.base } : {};
      throw Object.assign(failed.error, { steps: stepsOf(failed.task), fans: fans.size > 0, across: across.length > 0, ...chain });
    }
  }

  // The Sub-Blocks a task's link runs between: the copies it leaves and enters (a Side Input:
  // the one it feeds; one to the east edge: the one it leaves; a fluid: every one it joins;
  // splitters: every belt's through them).
  function stepsOf(task) {
    if (task.pipe !== undefined) return [...new Set(routes[task.pipe].stubs.map(st => st.inst.step))];
    const ends = (route, k) => [route.slots[k - 1], route.slots[k]].filter(Boolean).map(slot => slot.inst.step);
    const { route, slot: k } = task;
    const out = [...ends(route, k)];
    if (task.split) out.push(...ends(routes[route.splitter.with], routes[route.splitter.with].splitter.at));
    for (const id of [...(task.fan ?? []), ...(task.fanOut ?? [])]) out.push(...ends(routes[id], 0));
    for (const id of task.taps ? route.taps : []) out.push(...ends(routes[id], 0));
    return [...new Set(out)];
  }

  // A belt link on its own (a task): from the train (in a City Block through the approach
  // column) or from the copy before.
  function link(grid, task) {
    const ends = endsOf(task);
    if (!ends) return [];
    const keepOff = meetsOf(task);
    return task.slot === 0 && approach > area.x ? approached(grid, task.route.id, ends.goal, keepOff)
      : routeLink(grid, { id: task.route.id, starts: ends.starts, goal: ends.goal, keepOff }, belts);
  }

  // The tiles where the other links of a task's route meet their copies (before an entry, after
  // an exit): held for its route, they are no way for this link.
  function meetsOf({ route, slot: k }) {
    const out = new Set();
    route.slots.forEach((slot, j) => {
      const first = slot.pieces[0], last = slot.pieces.at(-1);
      const [ex, ey] = VEC[slot.part.dir ?? E], [dx, dy] = VEC[last.travel];
      if (j !== k && (j > 0 || route.source === 'side-input' || route.fedFrom !== undefined)) out.add(key(first.x - ex, first.y - ey));
      if (j !== k - 1 && (j < route.slots.length - 1 || route.sink === 'side-output' || route.fanOut)) out.add(key(last.x + dx, last.y + dy));
    });
    return out;
  }

  // A Recipe Loop's feedback: the producer's output belt's link after its producers (task) runs
  // through a splitter for each feedback belt (feeds), standing a few tiles on from the
  // producers and giving its feedback side priority, so the loop takes what it needs before the
  // rest goes on (to the train or the belt's consumers). A few spots are tried for each, those
  // before it tried again where one leaves the rest no way on. Returns [routeId, slot, pieces]
  // for the link and each feedback belt's first link; null when no spots let every leg through
  // (the grid as it was).
  function routeTaps(grid, task, feeds) {
    const { route } = task;
    const ends = endsOf(task);
    if (!ends) return null;
    const held = [];
    const reserve = (x, y, id) => {
      held.push([x, y, grid.holder(x, y)]);
      grid.reserve(x, y, id);
    };
    const undo = (to, count) => {
      grid.restore(to);
      while (held.length > count) {
        const [x, y, before] = held.pop();
        if (before === undefined) grid.unreserve(x, y);
        else grid.reserve(x, y, before);
      }
    };
    const ids = new Set([route.id, ...feeds.map(r => r.id)]);
    // A tile free for belt `id`, no other belt's piece pointing into it.
    const open = (x, y, id) => grid.inBounds(x, y) && !grid.at(x, y) && [undefined, id].includes(grid.holder(x, y))
      && Object.values(VEC).every(([dx, dy]) => {
        const n = grid.at(x + dx, y + dy);
        return n?.out !== key(x, y) || ids.has(n.route);
      });
    const room = (x, y) => open(x, y, route.id);
    const entryOf = r => ({ x: r.slots[0].pieces[0].x, y: r.slots[0].pieces[0].y, a: r.slots[0].part.dir ?? E });
    const line = [];
    const off = new Map();
    let budget = FAN_TRIES * (feeds.length + 1);
    const tap = (j, from) => {
      if (j === feeds.length) {
        line.push(...routeLink(grid, { id: route.id, starts: [from], goal: ends.goal }, belts));
        return true;
      }
      const feed = feeds[j], entry = entryOf(feed);
      // Splitters facing east, a few tiles on, the line coming in on either side; the feedback
      // leaves on the side toward its entry first.
      const spots = [];
      for (let x = from.x + 1; x <= from.x + FAN_REACH; x++) {
        for (const y of [from.y - 1, from.y, from.y - 2, from.y + 1]) {
          if (!room(x, y) || !room(x, y + 1)) continue;
          for (const top of entry.y <= from.y ? [true, false] : [false, true]) {
            const branch = { x: x + 1, y: top ? y : y + 1 }, on = { x: x + 1, y: top ? y + 1 : y };
            if (!open(branch.x, branch.y, feed.id) || !open(on.x, on.y, route.id)) continue;
            for (const lane of [0, 1]) if (open(x - 1, y + lane, route.id)) spots.push({ x, y, top, lane, branch, on });
          }
        }
      }
      for (const spot of spots) {
        if (budget-- <= 0) break;
        const before = grid.snapshot(), count = held.length, length = line.length;
        try {
          reserve(spot.x - 1, spot.y + spot.lane, route.id);
          reserve(spot.branch.x, spot.branch.y, feed.id);
          reserve(spot.on.x, spot.on.y, route.id);
          // Output priority: the feedback's side (left of a splitter facing east is north).
          const splitter = { name: splitterName, kind: 'splitter', x: spot.x, y: spot.y, w: 1, h: 2, direction: E, travel: E, priority: spot.top ? 'left' : 'right' };
          grid.place(splitter);
          const leg = routeLink(grid, { id: feed.id, starts: [{ ...spot.branch, a: E }], goal: entry }, belts);
          line.push(...routeLink(grid, { id: route.id, starts: [from], goal: { x: spot.x, y: spot.y + spot.lane, a: E } }, belts), splitter);
          off.set(feed.id, [splitter, ...leg]);
          if (tap(j + 1, { ...spot.on, a: E })) return true;
        } catch (e) {
          if (!(e instanceof RoutingError)) throw e;
        }
        undo(before, count);
        line.length = length;
        off.delete(feed.id);
      }
      return false;
    };
    const saved = grid.snapshot();
    let done = false;
    try {
      done = tap(0, ends.starts[0]);
    } catch (e) {
      if (!(e instanceof RoutingError)) throw e;
    }
    if (!done) {
      undo(saved, 0);
      return null;
    }
    for (const r of feeds) tapped.add(r.id);
    return [[route.id, task.slot, line], ...feeds.map(r => [r.id, 0, off.get(r.id)])];
  }

  // A Fan-out's run: through its splitters; else, where belts join it, as runs without (each
  // fitting one belt); else as two runs, each half of it, and so on down to belts on their own
  // from the west edge.
  function fan(grid, members) {
    if (members.length < 2) return members.map(r => [r.id, link(grid, { route: r, slot: 0 })]);
    const legs = routeFan(grid, members);
    if (legs) return legs;
    const runs = planFan(members).joins.length ? cutRuns(members, false) : [];
    if (runs.length > 1) return runs.flatMap(run => fan(grid, run));
    const half = Math.ceil(members.length / 2);
    return [...fan(grid, members.slice(0, half)), ...fan(grid, members.slice(half))];
  }

  // A run of a Fan-out (fanOut, fanAcross), its belts in line order (or the other way round):
  // one belt from the west edge runs past their entries, a splitter before each sending a belt
  // off into it, and ends in the last (the trunk: it holds the line). Where planFan has a belt
  // join, the entry's belt itself comes from the west edge into that splitter's other side. Each
  // splitter stands as near its entry as there is room, its other output toward the next entry,
  // else (across Sub-Blocks) anywhere a few tiles from it; a few spots are tried for each, those
  // before it tried again where one leaves the rest no way on. Returns [routeId, pieces] for
  // every belt; null when no spots let every leg through (the grid as it was).
  // source (a Fan-out from producers): { start (where the line leaves their belt), trunk (their
  // belt: it holds the line, every consumer's belt fed from it, the last's from the splitter
  // before it; or the last consumer's, fed from `fedBy`, what the line brings `brought`; `pool`
  // the spots it may still try, shared with the other ways tried for it) }; the run in the order
  // given.
  function routeFan(grid, members, source = null) {
    const entryOf = r => {
      const slot = r.slots[0];
      return { x: slot.pieces[0].x, y: slot.pieces[0].y, a: slot.part.dir ?? E };
    };
    if (members.some(r => entryOf(r).a !== E)) return null;
    const anywhere = source !== null || members.some(r => r.perConsumer);
    // Across Sub-Blocks, also any splitter up to FAN_REACH columns west of an entry and FAN_ROWS
    // rows above or below it, facing any way, the belt sent off from either side (a Part's entry
    // against the west edge, others' belts beside it, is reached only on a curve or under them):
    // those with the shortest belts to the entry, from the line and on to the next entry first.
    // (A copies' run, mostly failing where it would need them, would try them all in vain.)
    const spotKey = spot => `${spot.splitter.x},${spot.splitter.y},${spot.splitter.direction},${spot.off?.x},${spot.off?.y}`;
    const around = (entry, from, next) => {
      const far = (p, q) => (p && q ? Math.abs(p.x - q.x) + Math.abs(p.y - q.y) : 0);
      const out = [];
      for (let y = entry.y - FAN_ROWS; y <= entry.y + FAN_ROWS; y++) {
        for (let x = Math.max(area.x, entry.x - FAN_REACH); x < entry.x; x++) {
          for (const d of [N, E, S, W]) {
            const [dx, dy] = VEC[d];
            const sides = dy ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
            const outs = sides.map(([u, v]) => ({ x: u + dx, y: v + dy, a: d }));
            for (const k of [0, 1]) {
              // (Straight into the entry: no belt sent off.)
              const into = outs[k].x === entry.x && outs[k].y === entry.y;
              if (into && d !== entry.a) continue;
              const off = into ? null : outs[k], on = outs[1 - k];
              const lanes = sides.map(([u, v]) => ({ at: [u - dx, v - dy], goal: { x: u, y: v, a: d } }));
              const [ix, iy] = lanes[0].at;
              const cost = far(off, entry) + (from ? far(from, { x: ix, y: iy }) : ix - area.x) + far(on, next);
              out.push({ spot: { splitter: { x, y, w: dy ? 2 : 1, h: dy ? 1 : 2, direction: d }, lanes, off, on }, cost });
            }
          }
        }
      }
      return out.sort((a, b) => a.cost - b.cost).map(e => e.spot);
    };
    const held = [];
    const reserve = (x, y, id) => {
      held.push([x, y, grid.holder(x, y)]);
      grid.reserve(x, y, id);
    };
    const undo = (to, count) => {
      grid.restore(to);
      while (held.length > count) {
        const [x, y, before] = held.pop();
        if (before === undefined) grid.unreserve(x, y);
        else grid.reserve(x, y, before);
      }
    };
    const family = new Set([...members, ...(source ? [source.trunk] : [])].map(r => r.id));
    // A tile free for belt `id`, no other belt's piece pointing into it (a splitter tile: free for
    // the belt it sends off).
    const open = (x, y, id) => grid.inBounds(x, y) && !grid.at(x, y) && [undefined, id].includes(grid.holder(x, y))
      && Object.values(VEC).every(([dx, dy]) => {
        const n = grid.at(x + dx, y + dy);
        return n?.out !== key(x, y) || family.has(n.route);
      });
    const room = open;
    // From the west edge (in a City Block through the approach column) into a splitter.
    const fromWest = (id, goal) => (goal.x > approach + 1 && approach > area.x ? approached(grid, id, goal)
      : routeLink(grid, { id, starts: westEdge(area), goal }, belts));
    for (const order of source ? [members] : [members, [...members].reverse()]) {
      // (From producers, what their belt brings, no belt joining.)
      const { joins, supply, brings } = planFan(order, source && (source.brought ?? new Map(source.trunk.items.map(i => [i.item, i.supply]))));
      if (joins.includes(order.length - 1) || (source && joins.length)) continue;
      const entries = order.map(entryOf);
      const trunk = source ? source.trunk : order.at(-1), last = order.at(-1);
      const pieces = new Map([...members, trunk].map(r => [r.id, []]));
      let budget = FAN_TRIES * order.length;
      // The splitter before order[i]'s entry, the line coming on from `from` (the last
      // splitter's other output; at first the west edge, or where the line leaves the
      // producers), then those after it.
      const tap = (i, from) => {
        if (i === order.length - 1) {
          pieces.get(last.id).push(...routeLink(grid, { id: last.id, starts: [from], goal: entries[i] }, belts));
          return true;
        }
        const member = order[i], entry = entries[i], next = entries[i + 1];
        const join = joins.includes(i);
        // The belt going on from the splitter: the line, or (before the last entry) the last's.
        const on = i === order.length - 2 ? last : trunk;
        // The belt sent off leaves on the entry's row, the line goes on toward the next entry
        // (way: 1 below it, -1 above). A splitter facing that way stands across the line just
        // before the entry's row (the line runs on straight; its east side's belt turns east
        // into the entry), or one facing east before the entry (its upper side's belt on into
        // the entry going down, its lower side's going up; the line turns on from the other).
        // Right before the entry the latter feeds it straight; that leaves the line going on
        // inside the copy, so it comes last.
        const ways = next.y > entry.y ? [1] : next.y < entry.y ? [-1] : [1, -1];
        const spots = [];
        const reach = Math.max(area.x + 1, entry.x - FAN_REACH);
        for (const way of ways) {
          const along = way > 0 ? S : N, row = entry.y - way;
          for (let x = entry.x - 2; x >= reach; x--) {
            spots.push({
              splitter: { x, y: row, w: 2, h: 1, direction: along },
              lanes: [0, 1].map(k => ({ at: [x + k, row - way], goal: { x: x + k, y: row, a: along } })),
              off: { x: x + 1, y: entry.y, a: along }, on: { x, y: entry.y, a: along },
            });
          }
          const y = way > 0 ? entry.y : entry.y - 1;
          for (let x = entry.x - 2; x >= reach; x--) {
            spots.push({
              splitter: { x, y, w: 1, h: 2, direction: E },
              lanes: [0, 1].map(k => ({ at: [x - 1, y + k], goal: { x, y: y + k, a: E } })),
              off: { x: x + 1, y: entry.y, a: E }, on: { x: x + 1, y: entry.y + way, a: E },
            });
          }
          spots.push({
            splitter: { x: entry.x - 1, y, w: 1, h: 2, direction: E },
            lanes: [0, 1].map(k => ({ at: [entry.x - 2, y + k], goal: { x: entry.x - 1, y: y + k, a: E } })),
            off: null, on: { x: entry.x, y: entry.y + way, a: E },
          });
        }
        if (anywhere) {
          const seen = new Set(spots.map(spotKey));
          spots.push(...around(entry, from, next).filter(spot => !seen.has(spotKey(spot))));
        }
        const tiles = ({ x, y, w, h }) => Array.from({ length: w * h }, (_, k) => [x + (k % w), y + Math.floor(k / w)]);
        const usable = spots.filter(spot => tiles(spot.splitter).every(([x, y]) => room(x, y, member.id))
          && (!spot.off || open(spot.off.x, spot.off.y, member.id)) && open(spot.on.x, spot.on.y, on.id))
          .flatMap(spot => [0, 1].filter(lane => open(...spot.lanes[lane].at, trunk.id) && (!join || open(...spot.lanes[1 - lane].at, member.id)))
            .map(lane => ({ ...spot, lane })));
        for (const spot of usable) {
          if (budget-- <= 0 || (source?.pool && source.pool.left-- <= 0)) break;
          const before = grid.snapshot(), count = held.length, length = pieces.get(trunk.id).length;
          try {
            const line = spot.lanes[spot.lane], other = spot.lanes[1 - spot.lane];
            reserve(...line.at, trunk.id);
            if (join) reserve(...other.at, member.id);
            if (spot.off) reserve(spot.off.x, spot.off.y, member.id);
            reserve(spot.on.x, spot.on.y, on.id);
            const splitter = { name: splitterName, kind: 'splitter', ...spot.splitter, travel: spot.splitter.direction };
            grid.place(splitter);
            // (From producers, where a line that finds no way takes long: each leg gives up sooner.)
            const effort = (p, q) => (source ? FAN_EFFORT + FAN_EFFORT_PER_STEP * (Math.abs(p.x - q.x) + Math.abs(p.y - q.y)) : undefined);
            const off = spot.off ? routeLink(grid, { id: member.id, starts: [spot.off], goal: entry, most: effort(spot.off, entry) }, belts) : [];
            // (The line goes on from the splitter: a way on ahead, to either side or under.)
            const ahead = (d, n = 1) => open(spot.on.x + VEC[d][0] * n, spot.on.y + VEC[d][1] * n, on.id);
            const d = spot.on.a;
            if (![d, turnLeft(d), turnRight(d)].some(t => ahead(t)) && ![...Array(belts.reach - 1).keys()].some(h => ahead(d, h + 2))) {
              throw new RoutingError(`belt ${trunk.id}: no way on from its splitter at ${spot.splitter.x},${spot.splitter.y}`);
            }
            const into = from ? routeLink(grid, { id: trunk.id, starts: [from], goal: line.goal, most: effort(from, line.goal) }, belts) : fromWest(trunk.id, line.goal);
            const joined = join ? fromWest(member.id, other.goal) : [];
            pieces.get(trunk.id).push(...into, splitter);
            pieces.set(member.id, [...joined, splitter, ...off]);
            if (on !== trunk) pieces.set(on.id, [splitter]);
            if (tap(i + 1, spot.on)) return true;
          } catch (e) {
            if (!(e instanceof RoutingError)) throw e;
          }
          undo(before, count);
          pieces.get(trunk.id).length = length;
          pieces.set(member.id, []);
          if (on !== trunk) pieces.set(on.id, []);
        }
        return false;
      };
      const saved = grid.snapshot();
      let done = false;
      try {
        done = tap(0, source?.start ?? null);
      } catch (e) {
        if (!(e instanceof RoutingError)) throw e;
      }
      if (!done) {
        undo(saved, 0);
        continue;
      }
      // The belts from the west edge: the trunk's, then each joining one's (none from producers).
      const from = source ? [] : [trunk, ...joins.map(k => order[k])];
      order.forEach((r, k) => fanned.set(r.id, {
        items: supply[k],
        ...(from.includes(r) ? { brings: brings[from.indexOf(r)] } : { fedBy: r === trunk && source?.fedBy !== undefined ? source.fedBy : trunk.id }),
      }));
      return [...pieces];
    }
    return null;
  }

  // A Fan-out from producers (task.fanOut): their line from where their belt leaves them, past
  // every consumer's entry in an order they stand in from there (lineOrders, each in turn).
  // Throws where none finds a way.
  function fanFrom(grid, task) {
    const { route: trunk } = task;
    const end = trunk.slots.at(-1).pieces.at(-1);
    const [dx, dy] = VEC[end.travel];
    const start = { x: end.x + dx, y: end.y + dy, a: end.travel };
    const members = task.fanOut.map(id => routes[id]);
    // (Every way tried for it shares one budget of spots: a line that finds no way takes long.)
    const pool = { left: 3 * FAN_TRIES * members.length };
    if (!trunk.filter) {
      for (const order of lineOrders(members, start)) {
        const legs = routeFan(grid, order, { start, trunk, pool });
        if (legs) return legs;
      }
    }
    // Else a splitter a few tiles on (facing east, the line coming in on either side): with a
    // byproduct, it sends that (filter) out of one side on to the east edge and the rest out of
    // the other past every consumer (the last's belt holding the line); without, each side starts
    // a line past some of them (the producers' belt holds the first, the last consumer's of the
    // other the second; each line brings what the other's do not take).
    const owner = order => (id, leg) => [id, id === order.at(-1).id ? [splitterOf.get(order), ...leg] : leg];
    const splitterOf = new Map();
    const demand = list => new Map(trunk.items.map(i => [i.item, list.reduce((sum, r) => sum + (r.items.find(x => x.item === i.item)?.rate ?? 0), 0)]));
    const brought = list => new Map(trunk.items.filter(i => i.item !== trunk.filter).map(i => [i.item, i.supply - (demand(list).get(i.item) ?? 0)]));
    const free = (x, y) => grid.inBounds(x, y) && !grid.at(x, y) && [undefined, trunk.id].includes(grid.holder(x, y));
    // The two groups each side's line takes, without a byproduct: the column beside the start cut
    // where it stands, the part ahead one line, the rest the other; else each line nearest-first.
    const at = r => r.slots[0].pieces[0];
    const halves = () => {
      const near = members.filter(r => Math.abs(at(r).x - start.x) <= 2 * FAN_REACH);
      const out = [];
      for (const below of [true, false]) {
        const ahead = near.filter(r => (below ? at(r).y >= start.y : at(r).y < start.y));
        if (ahead.length && ahead.length < members.length) out.push([ahead, members.filter(r => !ahead.includes(r))]);
      }
      const west = members.filter(r => at(r).x < start.x);
      if (west.length && west.length < members.length) out.push([west, members.filter(r => !west.includes(r))]);
      return out;
    };
    let budget = FAN_TRIES;
    for (let x = start.x + 1; x <= start.x + FAN_REACH && budget > 0 && pool.left > 0; x++) {
      for (const y of [start.y - 1, start.y, start.y - 2, start.y + 1]) {
        if (!free(x, y) || !free(x, y + 1)) continue;
        for (const top of [true, false]) {
          const out = { x: x + 1, y: top ? y : y + 1, a: E }, on = { x: x + 1, y: top ? y + 1 : y, a: E };
          for (const lane of [0, 1]) {
            if (budget-- <= 0 || !free(out.x, out.y) || !free(on.x, on.y) || !free(x - 1, y + lane)) continue;
            const saved = grid.snapshot({ holds: true });
            const splitter = { name: splitterName, kind: 'splitter', x, y, w: 1, h: 2, direction: E, travel: E, ...(trunk.filter ? { priority: top ? 'left' : 'right', filter: trunk.filter } : {}) };
            try {
              grid.place(splitter);
              const into = routeLink(grid, { id: trunk.id, starts: [start], goal: { x, y: y + lane, a: E } }, belts);
              if (trunk.filter) {
                const away = routeLink(grid, { id: trunk.id, starts: [out], goal: 'east' }, belts);
                for (const order of lineOrders(members, on)) {
                  splitterOf.set(order, splitter);
                  const legs = routeFan(grid, order, { start: on, trunk: order.at(-1), fedBy: trunk.id, brought: brought([]), pool });
                  if (legs) return [[trunk.id, [...into, splitter, ...away]], ...legs.map(([id, leg]) => owner(order)(id, leg))];
                }
              } else {
                // (A few ways each: every way of every split takes long to fail.)
                for (const [a, b] of halves().slice(0, 2)) {
                  for (const first of lineOrders(a, out).slice(0, 2)) {
                    const before = grid.snapshot({ holds: true });
                    const legsA = routeFan(grid, first, { start: out, trunk, brought: brought(b), pool });
                    if (!legsA) continue;
                    for (const second of lineOrders(b, on).slice(0, 2)) {
                      splitterOf.set(second, splitter);
                      const legsB = routeFan(grid, second, { start: on, trunk: second.at(-1), fedBy: trunk.id, brought: brought(a), pool });
                      if (!legsB) continue;
                      return [
                        ...legsA.map(([id, leg]) => [id, id === trunk.id ? [...into, splitter, ...leg] : leg]),
                        ...legsB.map(([id, leg]) => owner(second)(id, leg)),
                      ];
                    }
                    grid.restore(before);
                  }
                }
              }
            } catch (e) {
              if (!(e instanceof RoutingError)) throw e;
            }
            grid.restore(saved);
          }
        }
      }
    }
    throw new RoutingError(trunk.filter ? `belt ${trunk.id}: no splitter after its producers sends ${trunk.filter} away and the rest past every entry`
      : `belt ${trunk.id}: no line from its producers past every ${trunk.items[0].item} entry`);
  }

  // A Side Input in two legs: through the block from the approach column, on a row whose way
  // from the west edge is free, then from the west edge to where that leg starts (entering it
  // heading east). Without such a row, or where the legs do not meet, in one leg from the west
  // edge.
  function approached(grid, id, goal, keepOff) {
    const rows = westEdge(area).filter(s => {
      for (let x = area.x; x <= approach; x++) if (!grid.freeFor(x, s.y, id)) return false;
      return true;
    });
    if (rows.length) {
      const saved = grid.snapshot();
      try {
        const inside = routeLink(grid, { id, starts: rows.map(s => ({ ...s, x: approach })), goal, keepOff }, belts);
        const [first] = inside;
        const outside = routeLink(grid, { id, starts: westEdge(area), goal: first ? { x: first.x, y: first.y, a: E } : goal, keepOff }, belts);
        return [...outside, ...inside];
      } catch (e) {
        if (!(e instanceof RoutingError)) throw e;
        grid.restore(saved);
      }
    }
    return routeLink(grid, { id, starts: westEdge(area), goal, keepOff }, belts);
  }

  // Two belts of one Internal Path through a splitter, each in its own lane of it: 2 to 2 (each
  // in and out the same lane), 2 to 1 (one belt ends in it) or 1 to 2 (one starts from it). The
  // splitter stands where the belts reach it with the least belt, between where they leave their
  // producers and reach their consumers. Without room for one, each goes straight on (a 2 to 2
  // pair unbalanced, a merged belt ending, a forked one fed by nothing). Returns [routeId,
  // pieces] for both.
  function routeSplit(grid, a, b) {
    // Where each belt comes from (the exit before the splitter) and goes to (the entry after it).
    const sides = r => {
      const at = r.splitter.at;
      const from = at > 0 ? (() => {
        const prev = r.slots[at - 1].pieces.at(-1);
        const [dx, dy] = VEC[prev.travel];
        return { x: prev.x + dx, y: prev.y + dy, a: prev.travel };
      })() : null;
      const to = at < r.slots.length ? { x: r.slots[at].pieces[0].x, y: r.slots[at].pieces[0].y, a: r.slots[at].part.dir ?? E } : null;
      return { from, to };
    };
    const [sa, sb] = [sides(a), sides(b)];
    const plain = () => [a, b].map((r, n) => {
      const { from, to } = n ? sb : sa;
      return [r.id, from && to ? routeLink(grid, { id: r.id, starts: [from], goal: to }, belts) : []];
    });
    const pts = [sa.from, sa.to, sb.from, sb.to].filter(Boolean);
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const dist = (p, x, y) => (p ? Math.abs(p.x - x) + Math.abs(p.y - y) : 0);
    const open = (x, y) => grid.inBounds(x, y) && !grid.at(x, y) && grid.holder(x, y) === undefined;
    const openFor = (x, y, id) => grid.inBounds(x, y) && grid.freeFor(x, y, id);
    // A belt starting from the splitter needs no room before it, one ending in it none after.
    const lo = Math.min(...xs) + (sa.from || sb.from ? 1 : 0), hi = Math.max(...xs) - (sa.to || sb.to ? 1 : 0);
    const options = [];
    for (let x = lo; x <= hi; x++) {
      for (let y = Math.min(...ys) - 3; y <= Math.max(...ys) + 2; y++) {
        if (!open(x, y) || !open(x, y + 1)) continue;
        for (const [top, bottom, st, sbo] of [[a, b, sa, sb], [b, a, sb, sa]]) {
          const need = [[x - 1, y, top, st.from], [x - 1, y + 1, bottom, sbo.from], [x + 1, y, top, st.to], [x + 1, y + 1, bottom, sbo.to]];
          if (need.some(([nx, ny, r, p]) => p && !openFor(nx, ny, r.id))) continue;
          const cost = dist(st.from, x - 1, y) + dist(sbo.from, x - 1, y + 1) + dist(st.to, x + 1, y) + dist(sbo.to, x + 1, y + 1);
          options.push({ x, y, top, bottom, need, cost });
        }
      }
    }
    options.sort((p, q) => p.cost - q.cost);
    for (const o of options.slice(0, SPLITTER_TRIES)) {
      const saved = grid.snapshot();
      const held = o.need.filter(([, , , p]) => p);
      const before = held.map(([x, y]) => grid.holder(x, y));
      for (const [x, y, r] of held) grid.reserve(x, y, r.id);
      const splitter = { name: splitterName, kind: 'splitter', x: o.x, y: o.y, w: 1, h: 2, direction: E, travel: E };
      grid.place(splitter);
      try {
        const legs = new Map([[o.top.id, []], [o.bottom.id, []]]);
        for (const [nx, ny, r, p] of o.need) {
          if (!p) continue;
          const into = nx < o.x;
          const leg = into
            ? routeLink(grid, { id: r.id, starts: [p], goal: { x: o.x, y: ny, a: E } }, belts)
            : routeLink(grid, { id: r.id, starts: [{ x: nx, y: ny, a: E }], goal: p }, belts);
          legs.set(r.id, into ? [...leg, splitter, ...legs.get(r.id)] : [...legs.get(r.id), ...leg]);
        }
        // A belt with no leg out of the splitter still lists it last; one with no leg in, first.
        for (const r of [o.top, o.bottom]) if (!legs.get(r.id).includes(splitter)) legs.set(r.id, [splitter, ...legs.get(r.id)]);
        balanced.add(a.id).add(b.id);
        return [[a.id, legs.get(a.id)], [b.id, legs.get(b.id)]];
      } catch (e) {
        if (!(e instanceof RoutingError)) throw e;
        grid.restore(saved);
        held.forEach(([x, y], i) => {
          if (before[i] === undefined) grid.unreserve(x, y);
          else grid.reserve(x, y, before[i]);
        });
      }
    }
    return plain();
  }

  function finish(grid, entities, pieces) {
    const result = routes.map(r => {
      const { slots, stubs, splitter, fan, taps, tapAt, tapOf, ...rest } = r;
      // A Recipe Loop's feedback fed from its splitter, else by train (all a belt brings).
      const fed = taps?.filter(id => tapped.has(id)) ?? [];
      const loop = tapOf === undefined ? {} : tapped.has(r.id) ? { fedBy: tapOf } : { items: r.items.map(i => ({ ...i, supply: i.capacity })) };
      return {
        ...rest,
        ...(balanced.has(r.id) ? { items: splitter.items, balancedWith: splitter.with } : {}),
        ...(fanned.get(r.id) ?? {}),
        ...loop,
        ...(fed.length ? { taps: fed } : {}),
        pieces: pieces[r.id],
      };
    });
    const seen = new Set();
    for (const r of result) for (const p of r.pieces) if (!seen.has(p)) { seen.add(p); entities.push(p); }
    const subBlocks = plan.map((sb, i) => {
      const mine = instances.filter(inst => inst.step === i);
      const box = extentOf(mine.filter(inst => !inst.detached).map(inst => placed[inst.index]), { w: 0, e: 0, n: 0, s: 0 });
      // Machines broken out of it (Breakout) stand apart, each in a box of its own.
      const apart = mine.filter(inst => inst.detached).map(inst => ({ ...placed[inst.index].box }));
      return {
        ...sb, index: i, x: box.x, y: box.y, w: box.w, h: box.h, copies: mine.length, inserters: supplyOf(mine),
        ...(apart.length ? { apart } : {}),
      };
    });
    // Poles come once the block is squeezed (compact.js).
    return { subBlocks, entities, routes: result, bounds: extent(entities), ...(site ? { site } : {}) };
  }
}

// Every copy of every module kind, with its first machine row among its Sub-Block's rows.
// Every copy of every kind of module, in the order belts run through them. Four copies or more
// stand in columns, about square: the first column top to bottom, the next bottom to top, and
// so on (inst.column, inst.pos). Copies alternate between a kind's module and its reverse (where
// it has one), so a belt running through them all snakes down a column, turning beside it; at
// the foot (or head) of a column it crosses to the next, so the copies either side of that
// crossing both run west to east.
function makeInstances(plan, designs, wanted) {
  const instances = [];
  plan.forEach((sb, i) => {
    const all = designs[i].kinds.flatMap(kind => Array.from({ length: kind.count }, () => kind));
    const kinds = all.filter(kind => !kind.detached);
    const n = kinds.length;
    const w = Math.max(...kinds.map(k => k.module.area.w)) + 6;
    const h = kinds.reduce((sum, k) => sum + k.module.area.h, 0) / n;
    const square = n >= 4 ? Math.max(1, Math.min(n, Math.round(Math.sqrt(n * h / w)))) : 1;
    const columns = Math.max(1, Math.min(n, wanted[i] === 0 ? square : wanted[i] ?? 1));
    const perColumn = Math.ceil(n / columns);
    let rowOffset = 0, reversed = false;
    kinds.forEach((kind, j) => {
      const column = Math.floor(j / perColumn), pos = j % perColumn;
      if (j > 0 && pos > 0) reversed = !reversed;
      const module = kind.reverse && reversed ? kind.reverse : kind.module;
      const rows = Math.max(...module.entities.filter(e => e.kind === 'building').map(e => e.row)) + 1;
      instances.push({ index: instances.length, step: i, module, rowOffset, column, pos, columns });
      rowOffset += rows;
    });
    // Machines broken out of the Sub-Block (Breakout): each module stands apart, where placement
    // finds room, its belts linked to the stack's like a neighbour's.
    for (const kind of all.filter(k => k.detached)) {
      const rows = Math.max(...kind.module.entities.filter(e => e.kind === 'building').map(e => e.row)) + 1;
      instances.push({ index: instances.length, step: i, module: kind.module, rowOffset, column: 0, pos: 0, columns, detached: true });
      rowOffset += rows;
    }
  });
  return instances;
}

// Whether two copies stand in one stack (a belt between them turns beside it): copies of one
// Sub-Block, neither broken out of it.
export const stacked = (a, b) => a.step === b.step && !a.detached && !b.detached;

// Global routes. Each base belt route becomes one belt or several, each visiting a run of
// copies' parts (slots) in order: producers first, then consumers. A belt takes on slots while
// it can carry them all: a Side Input as long as its demand fits the belt (a lane per item when
// merged), an output as long as its inserters can put everything on the belt's lanes. Pipes stay
// one network per base route.
function groupRoutes(ctx, instances, laneCapacity) {
  const { plan } = ctx;
  const routes = [];
  // A Sub-Block's slots of a route, snake by snake: each of its module's parts through every
  // copy in turn (the copies' belts chain part to same part).
  const snakesOf = (step, baseId) => {
    const snakes = new Map();
    for (const inst of instances.filter(i => i.step === step)) {
      for (const part of inst.module.parts.filter(p => p.routeIds.includes(baseId))) {
        if (!snakes.has(part.key)) snakes.set(part.key, []);
        snakes.get(part.key).push({ inst, part });
      }
    }
    return [...snakes.values()];
  };
  const slotsOf = (step, baseId) => snakesOf(step, baseId).flat();
  const shareOf = slot => slot.part.machines / plan[slot.inst.step].count;
  const flowOf = (step, name, role) => (role === 'input' ? plan[step].inputs : plan[step].outputs).find(f => f.name === name)?.rate ?? 0;
  // One copy's belt goes on into the next: beside the stack (it leaves one copy on the side the
  // next one takes it in) or on east into a consumer.
  const exitSide = s => (s.part.dir === W ? W : E), entrySide = s => (s.part.dir === W ? E : W);
  // A copy's parts never chain into each other. Machines broken out of a Sub-Block chain like a
  // neighbour's, downstream of its stack: a belt runs on from the stack to them, never back.
  const backward = (a, b) => a.inst.step === b.inst.step && a.inst.detached && !b.inst.detached;
  const chainable = (a, b) => a.inst !== b.inst && !backward(a, b) && a.part.canExit && b.part.canEnter
    && (stacked(a.inst, b.inst) ? exitSide(a) === entrySide(b) : exitSide(a) === E && entrySide(b) === W);

  for (const base of ctx.routes) {
    if (base.kind === 'pipe') {
      const steps = [...(typeof base.source === 'number' ? [base.source] : []), ...base.consumers];
      const stubs = instances.filter(inst => steps.includes(inst.step)).flatMap(inst => inst.module.fluids
        .filter(f => f.routeId === base.id)
        .map(f => ({ inst, ...stubOf(inst.module, f) })));
      routes.push({ ...base, id: routes.length, base: base.id, stubs });
      continue;
    }
    const isOutput = typeof base.source === 'number';
    if (!isOutput) {
      // A merged part carries two Side Inputs; it is grouped with the first.
      const slots = base.consumers.flatMap(step => slotsOf(step, base.id)).filter(s => s.part.routeIds[0] === base.id);
      if (!slots.length) continue;
      const bases = [...new Set(slots.flatMap(s => s.part.routeIds))];
      const items = bases.flatMap(id => ctx.routes[id].items);
      const perLane = items.length > 1 || slots.some(s => s.part.routeIds.length > 1);
      // A Recipe Loop's feedback belt takes no more than the fullest of its producer's output
      // belts brings (each is fed from one).
      const fed = base.loop ? routes.filter(r => r.kind === 'belt' && r.source === base.loop.from && !r.splitter)
        .map(r => r.items.find(i => i.item === base.items[0].item)?.rate ?? 0) : [];
      const capacity = Math.min(perLane ? laneCapacity : 2 * laneCapacity, ...(fed.length ? [Math.max(...fed)] : []));
      const demand = slot => Object.fromEntries(items.map(i => [i.item, flowOf(slot.inst.step, i.item, 'input') * shareOf(slot)]));
      const groups = [];
      for (const slot of slots) {
        const group = groups.at(-1);
        const load = group && items.every(i => group.reduce((sum, s) => sum + demand(s)[i.item], 0) + demand(slot)[i.item] <= capacity + 1e-6);
        const sameBelt = group && group[0].part.routeIds.join() === slot.part.routeIds.join();
        // Several consumers share one belt whatever it carries (Side Input splits them otherwise).
        if (group && (base.consumers.length > 1 || (load && sameBelt)) && chainable(group.at(-1), slot)) group.push(slot);
        else groups.push([slot]);
      }
      const first = routes.length;
      for (const group of groups) {
        const used = [...new Set(group.flatMap(s => s.part.routeIds))];
        const its = used.flatMap(id => ctx.routes[id].items).map(i => ({
          ...i, rate: group.reduce((sum, s) => sum + (demand(s)[i.item] ?? 0), 0),
          ...(used.length > 1 || ctx.routes[used[0]].items.length > 1 ? { capacity: laneCapacity, supply: laneCapacity } : {}),
        }));
        routes.push(beltRoute(routes.length, base, used, its, group, plan));
      }
      if (base.loop) tapLoop(routes, routes.slice(first), base);
      else if (base.consumers.length === 1) fanOut(routes.slice(first));
      continue;
    }
    // An output: its producer's parts, then (for an Internal Path) its consumers' parts. The belt
    // leaves the producer eastward: from the last copy back to the first, which runs east, when
    // the copies stand in one column; through the columns west to east when they stand in several;
    // then on through the machines broken out of it.
    const producers = snakesOf(base.source, base.id).flatMap(snake => {
      const stack = snake.filter(s => !s.inst.detached), apart = snake.filter(s => s.inst.detached);
      return [...(stack[0]?.inst.columns > 1 ? stack : [...stack].reverse()), ...apart];
    });
    const consumers = base.consumers.flatMap(step => slotsOf(step, base.id));
    const products = plan[base.source].outputs.filter(o => o.type === 'item');
    const total = products.reduce((sum, o) => sum + o.rate, 0);
    const production = slot => total * shareOf(slot);
    const perMachine = total / plan[base.source].count;
    const wants = run => run.reduce((sum, s) => sum + base.items.reduce((t, i) => t + flowOf(s.inst.step, i.item, 'input') * shareOf(s), 0), 0);
    // Every producer machine of every copy, at its full rate (Path Flow).
    const full = perMachine * (plan[base.source].headroom ?? 1);
    const machineKey = (s, d) => `${s.inst.index}:${d.machine}`;
    const machines = new Map(producers.flatMap(s => s.part.drops.map(d => [machineKey(s, d), full])));
    // What a belt must deliver: what its consumers take; a belt on to the train all it carries
    // (null); a belt merging into another, nothing of its own.
    const wantOf = g => (g.into !== undefined ? 0 : g.consumers.length && base.sink !== 'side-output' ? wants(g.consumers) : null);
    // What each belt of an option delivers: its producers' machines through its lanes, joined by
    // its splitters (with `joins`) or each going straight on.
    const deliver = (option, joins) => pathFlow({
      lane: laneCapacity, total, machines,
      belts: option.map(g => ({
        want: wantOf(g) ?? Infinity,
        drops: g.producers.flatMap(s => s.part.drops.map(d => ({ ...d, machine: machineKey(s, d) }))),
      })),
      splitters: joins ? splittersOf(option) : [],
    });
    const needOf = option => option.reduce((sum, g) => sum + (wantOf(g) ?? 0), 0);
    // The one item of a route none of its consumers takes (its other items all theirs), or null.
    const byproductOf = route => {
      const taken = new Set(route.consumers.flatMap(c => plan[c].inputs.map(x => x.name)));
      const left = route.items.filter(i => !taken.has(i.item));
      return left.length === 1 && left.length < route.items.length ? left[0].item : null;
    };
    // A Fan-out from the producers: into Parts of several Sub-Blocks, the producers chaining as one
    // run that leaves east, every consumer entered from the west, the run bringing all they take.
    const fansOut = route => ctx.chained !== 'all' && !ctx.chained?.has(route.id) && route.consumers.length > 1 && route.consumers.every(c => plan[c].part)
      && producers.length && producers.every((slot, k) => k === 0 || chainable(producers[k - 1], slot))
      && producers.at(-1).part.canExit && exitSide(producers.at(-1)) === E
      && consumers.every(slot => slot.part.canEnter && entrySide(slot) === W)
      && deliver([{ producers, consumers }], false).total >= needOf([{ producers, consumers }]) - 1e-6;
    let groups;
    if (!consumers.length) {
      // To the train: as few belts as the lanes allow, each a run of producers ending at one
      // that leaves east (a run's shortfall weighs far more than its size).
      const made = prefix(producers, production);
      const carried = laneFlow(producers, perMachine, laneCapacity);
      const short = (i, j) => Math.max(0, made(i, j) - carried(i, j));
      const runs = splits(producers, producers.length, chainable, () => true, s => s.part.canExit && exitSide(s) === E,
        (k, i, j) => 1e6 * short(i, j) + made(i, j) ** 2);
      let best = null;
      for (let count = 1; count <= producers.length; count++) {
        const option = runs(count);
        if (!option) continue;
        let at = 0;
        const total = option.reduce((sum, run) => sum + short(at, (at += run.length)), 0);
        if (!best || total < best.short - 1e-6) best = { option, short: total };
        if (total < 1e-6) break;
      }
      // Copies that cannot chain at all: a belt each.
      groups = (best?.option ?? producers.map(s => [s])).map(g => ({ producers: g, consumers: [] }));
    } else if (base.consumers.length && base.sink !== 'side-output' && fansOut(base)) {
      // Into Parts of several Sub-Blocks (Bands): one line from the producers, chained as one run
      // that leaves east, past every consumer's entry, a splitter before each sending a belt off
      // into it (a Fan-out from the producers; the last takes the line's end), where the run brings
      // them all they take. The producers' belt holds the line (fanOut: its consumers' belts, in no
      // order: compose orders them by where they stand); each consumer's belt starts at a splitter
      // on it (fedFrom).
      const option = [{ producers, consumers }];
      const flow = deliver(option, false);
      const scaled = (expected, delivered) => base.items.map(i => ({
        ...i, rate: i.rate * expected / total, supply: i.supply * expected / total, capacity: delivered, lane: 'out',
      }));
      const trunk = beltRoute(routes.length, base, [base.id], scaled(total, flow.total), producers, plan);
      routes.push(trunk);
      ctx.fannedOut = true;
      trunk.fanOut = consumers.map(slot => {
        const member = beltRoute(routes.length, base, [base.id], scaled(wants([slot]), wants([slot])), [slot], plan);
        member.servesRows[base.source] = [];
        member.fedFrom = trunk.id;
        routes.push(member);
        return member.id;
      });
      continue;
    } else if (base.consumers.length && base.sink !== 'side-output') {
      // An Internal Path to its consumers (one Sub-Block, or several, their copies in turn):
      // parallel belts, each taking a run of producers to a run of consumers; as many as its rate
      // needs and both ends allow. A run of producers ends at
      // one that leaves east, a run of consumers starts at one entered from the west, and a belt
      // ending against a machine (a Head-on input) ends its run. The consumers' runs are about
      // equal by machines, the producers' runs make about what each takes. The fewest belts whose
      // Path Flow brings every consumer what it needs win — straight on, else with belts paired
      // through splitters, else with one belt more (2 to 1) or fewer (1 to 2) at the producers'
      // end; failing that, the ones that bring the most.
      const most = Math.min(producers.length, consumers.length);
      const machinesIn = prefix(consumers, s => s.part.machines);
      const consumerRuns = splits(consumers, consumers.length, chainable, s => s.part.canEnter && entrySide(s) === W, () => true, (k, i, j) => machinesIn(i, j) ** 2);
      const endsEast = s => s.part.canExit && exitSide(s) === E;
      const making = prefix(producers, production);
      // Producers in count + 1 runs, the extra run merging into consumer run j's belt.
      const merges = (cs, targets) => {
        const out = [];
        for (let j = 0; j < cs.length; j++) {
          const t = [...targets.slice(0, j), targets[j] / 2, targets[j] / 2, ...targets.slice(j + 1)];
          const ps = splits(producers, cs.length + 1, chainable, () => true, endsEast, (k, a, b) => (making(a, b) - t[k]) ** 2)(cs.length + 1);
          if (!ps) continue;
          const option = cs.map((c, k) => ({ producers: ps[k < j ? k : k === j ? j : k + 1], consumers: c }));
          const extra = { producers: ps[j + 1], consumers: [], into: j };
          option.push(extra);
          option[j].merge = option.length - 1;
          out.push(option);
        }
        return out;
      };
      // Producers in count - 1 runs, run j forking into consumer runs j and j + 1.
      const forks = (cs, targets) => {
        const out = [];
        if (cs.length < 2) return out;
        for (let j = 0; j + 1 < cs.length; j++) {
          const t = [...targets.slice(0, j), targets[j] + targets[j + 1], ...targets.slice(j + 2)];
          const ps = splits(producers, cs.length - 1, chainable, () => true, endsEast, (k, a, b) => (making(a, b) - t[k]) ** 2)(cs.length - 1);
          if (!ps) continue;
          const option = cs.map((c, k) => ({ producers: k <= j ? ps[k] : k === j + 1 ? [] : ps[k - 1], consumers: c }));
          option[j].forked = j + 1;
          option[j + 1].fork = j;
          out.push(option);
        }
        return out;
      };
      /** @type {{ option: any[], short: number } | null} */
      let best = null;
      const consider = (option, short) => {
        if (!best || short < best.short - 1e-6) best = { option, short };
        return short < 1e-6;
      };
      for (let count = 1; count <= Math.min(most + 1, consumers.length); count++) {
        const cs = consumerRuns(count);
        if (!cs) continue;
        const targets = cs.map(wants);
        const ps = count > most ? null : splits(producers, count, chainable, () => true, endsEast, (k, i, j) => (making(i, j) - targets[k]) ** 2)(count);
        if (ps) {
          const option = ps.map((run, j) => ({ producers: run, consumers: cs[j] }));
          const short = needOf(option) - deliver(option, false).total;
          // Belts that bring too little pair up with belts that bring too much: a splitter between
          // them gives each what its consumers take (plain if it fails to route).
          if (consider(option, short < 1e-6 ? short : pairUp(option, wantOf, deliver))) break;
        }
        if (forks(cs, targets).concat(merges(cs, targets)).some(option => consider(option, needOf(option) - deliver(option, true).total))) break;
      }
      groups = best?.option;
      if (!groups) throw new RoutingError(`${base.items[0].item}: no belts chain ${plan[base.source].recipe}'s machines to ${plan[base.consumers[0]].recipe}'s`);
    } else if (base.consumers.length && fansOut(base) && byproductOf(base)) {
      // The same where an item of it none of them takes leaves on the train (a byproduct: Py's
      // empty barrels): a splitter right after the producers sends it on to the east edge (the
      // producers' belt, `filter`), the rest to the line (the last consumer's belt, fed from it).
      const trunk = beltRoute(routes.length, base, [base.id], base.items.map(i => ({ ...i, lane: 'out' })), producers, plan);
      trunk.filter = byproductOf(base);
      routes.push(trunk);
      ctx.fannedOut = true;
      trunk.fanOut = consumers.map(slot => {
        const items = base.items.filter(i => i.item !== trunk.filter).map(i => {
          const rate = flowOf(slot.inst.step, i.item, 'input') * shareOf(slot);
          return { ...i, rate, supply: rate, capacity: rate, lane: 'out' };
        });
        const member = beltRoute(routes.length, { ...base, sink: null }, [base.id], items, [slot], plan);
        member.servesRows[base.source] = [];
        member.fedFrom = trunk.id;
        routes.push(member);
        return member.id;
      });
      continue;
    } else {
      // One belt through every producer and consumer.
      const all = [...producers, ...consumers];
      if (all.some((s, k) => k > 0 && !chainable(all[k - 1], s))) throw new RoutingError(`${base.items[0].item}: one belt cannot chain every machine that makes or takes it`);
      groups = [{ producers, consumers }];
    }
    // Each belt's items: what it must bring (its consumers' take, or its producers' share of what
    // goes on to the train) and what its Path Flow delivers, straight on and through its splitter.
    const itemsOf = (expected, delivered) => base.items.map(i => ({
      ...i, rate: i.rate * expected / total, supply: i.supply * expected / total, capacity: delivered, lane: 'out',
    }));
    const expectations = flow => {
      const open = groups.filter(g => wantOf(g) === null);
      const made = g => g.producers.reduce((sum, s) => sum + production(s), 0);
      const madeOpen = open.reduce((sum, g) => sum + made(g), 0);
      const lost = Math.max(0, total - flow.total);
      return groups.map((g, j) => wantOf(g) ?? flow.delivered[j] + (madeOpen > 0 ? lost * made(g) / madeOpen : 0));
    };
    const straight = deliver(groups, false);
    const joined = splittersOf(groups).length ? deliver(groups, true) : straight;
    const [expectStraight, expectJoined] = [expectations(straight), expectations(joined)];
    const first = routes.length;
    groups.forEach((g, j) => {
      const slots = [...g.producers, ...g.consumers];
      routes.push(beltRoute(routes.length, base, [base.id], itemsOf(expectStraight[j], straight.delivered[j]), slots, plan));
    });
    // Belts through a splitter: what each carries on from it (2 to 2: each its consumers' take of
    // both; 2 to 1: the merged belt ends in it; 1 to 2: the forked belt starts from it).
    groups.forEach((/** @type {any} */ g, j) => {
      const a = routes[first + j];
      const items = k => itemsOf(expectJoined[k], joined.delivered[k]);
      const join = (other, at, extra = {}) => {
        const b = routes[first + other];
        a.splitter = { with: b.id, at: g.producers.length, items: items(j) };
        b.splitter = { with: a.id, at, items: items(other), ...extra };
      };
      if (g.merge !== undefined) join(g.merge, groups[g.merge].producers.length, { merged: true });
      if (g.forked !== undefined) {
        join(g.forked, 0);
        routes[first + g.forked].servesRows[base.source] = [];
      }
      if (g.pair !== undefined && g.pair > j) join(g.pair, groups[g.pair].producers.length);
    });
  }
  return routes;
}

// A Recipe Loop's feedback belts, each fed from one of its producer's output belts (no splitter
// pair on it), the one with the most still to give: a splitter on that belt's link after its
// producers sends the feedback off first (route.taps on the output belt, at slot tapAt;
// route.tapOf on the feedback, its items with what the output belt has for it).
function tapLoop(routes, feeds, base) {
  const { item } = base.items[0];
  const outs = routes.filter(r => r.kind === 'belt' && r.source === base.loop.from && !r.splitter && r.items.some(i => i.item === item))
    .map(r => ({ r, left: r.items.find(i => i.item === item).rate }));
  for (const feed of feeds) {
    const out = outs.sort((a, b) => b.left - a.left)[0];
    if (!out) return;
    const at = out.r.slots.findIndex(slot => slot.inst.step !== out.r.source);
    out.r.taps = [...(out.r.taps ?? []), feed.id];
    out.r.tapAt = at < 0 ? out.r.slots.length : at;
    feed.tapOf = out.r.id;
    feed.items = feed.items.map(i => ({ ...i, supply: Math.max(0, Math.min(i.capacity, out.left)) }));
    out.left -= feed.items[0].rate;
  }
}

// Fan-out: a Side Input's belts into the copies of a Sub-Block (each copy's own, or a run of
// them) come from the west edge on as few belts as carry them all. In the order the copies of a
// column stand (down an even column, up an odd one) they are cut into runs (cutRuns): each run
// one line past the entries of its belts, a splitter before each sending a belt off into it,
// ending in the last; where what the line still carries falls short of an entry, a belt from
// the west edge joins it through that entry's splitter (planFan). Marks each belt of a run of
// two or more (route.fan: { family }, the run's belts in line order).
function fanOut(belts) {
  const where = r => r.slots[0].inst;
  const columns = new Map();
  for (const r of belts) {
    const inst = where(r);
    if (inst.detached) continue;
    const k = `${inst.step}|${inst.column ?? 0}|${r.bases.join()}`;
    if (!columns.has(k)) columns.set(k, []);
    columns.get(k).push(r);
  }
  for (const list of columns.values()) {
    const y = r => r.slots[0].part.pieces[0].y * ((where(r).column ?? 0) % 2 ? -1 : 1);
    list.sort((a, b) => where(a).index - where(b).index || y(a) - y(b));
    for (const run of cutRuns(list, true)) if (run.length > 1) for (const r of run) r.fan = { family: run.map(m => m.id) };
  }
}

// A Side Input's belts into several Sub-Blocks (its own route to each, routes.js: Parts in Bands,
// or more than one belt carries), one item or the same two merged, entered from the west, cut
// into runs of a Fan-out by where their entries stand: in columns (each entry within twice
// FAN_REACH of the one west of it), down the first, up the next and so on; the cut takes the
// fewest belts from the west edge, then the fewest splitters, then the shortest lines (from the
// west edge to each run's first entry and each belt joining it, entry to entry between). Belts in
// a Fan-out of their Sub-Block's copies keep it. Returns the runs of two belts or more.
function fanAcross(routes, placed, area, most = FAN_RUN) {
  const at = new Map();
  const groups = new Map();
  for (const r of routes) {
    if (r.kind !== 'belt' || !r.perConsumer || r.fan || r.loop || (r.slots[0].part.dir ?? E) !== E) continue;
    const { inst, part } = r.slots[0];
    at.set(r, { x: placed[inst.index].x + part.pieces[0].x, y: placed[inst.index].y + part.pieces[0].y });
    const k = r.items.map(i => i.item).sort().join();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const line = (run, { joins }) => run.reduce((sum, r, k) => sum + (k === 0 || joins.includes(k) ? at.get(r).x - area.x : 0)
    + (k > 0 ? Math.abs(at.get(r).x - at.get(run[k - 1]).x) + Math.abs(at.get(r).y - at.get(run[k - 1]).y) : 0), 0);
  const runs = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => at.get(a).x - at.get(b).x);
    const columns = [];
    for (const r of list) {
      const column = columns.at(-1);
      if (column && at.get(r).x - at.get(column.at(-1)).x <= 2 * FAN_REACH) column.push(r);
      else columns.push([r]);
    }
    const order = columns.flatMap((column, c) => column.sort((a, b) => (at.get(a).y - at.get(b).y) * (c % 2 ? -1 : 1)));
    runs.push(...cutRuns(order, true, line, most).filter(run => run.length > 1));
  }
  return runs;
}

// The orders a line from `start` (where a Fan-out leaves its producers) may pass its consumers'
// entries in, each tried in turn: their entries in columns (each within twice FAN_REACH of the one
// west of it), the column whose nearer end is nearest first, walked from that end, then the one
// nearest where it ends, and so on; the column beside the start cut there, the part ahead of the
// line first and the rest last (round the others, the line never doubling back); and each entry
// nearest the last.
function lineOrders(members, start) {
  const at = r => r.slots[0].pieces[0];
  const far = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
  const columnsOf = list => {
    const out = [];
    for (const r of [...list].sort((a, b) => at(a).x - at(b).x)) {
      const column = out.at(-1);
      if (column && at(r).x - at(column.at(-1)).x <= 2 * FAN_REACH) column.push(r);
      else out.push([r]);
    }
    for (const column of out) column.sort((a, b) => at(a).y - at(b).y);
    return out;
  };
  // Columns walked from `here`, each from its end nearest where the line is.
  const walk = (columns, here) => {
    const out = [];
    columns = [...columns];
    while (columns.length) {
      const ends = columns.flatMap((column, k) => [false, true].map(flip => ({ k, flip, d: far(here, at(flip ? column.at(-1) : column[0])) })));
      const best = ends.reduce((a, b) => (b.d < a.d ? b : a));
      const [column] = columns.splice(best.k, 1);
      out.push(...(best.flip ? [...column].reverse() : column));
      here = at(out.at(-1));
    }
    return out;
  };
  const columns = columnsOf(members);
  const orders = [walk(columns, start)];
  // (The column nearest the start, where the start stands within its rows: the part ahead first.)
  const near = columns.reduce((a, b) => (Math.abs(at(b[0]).x - start.x) < Math.abs(at(a[0]).x - start.x) ? b : a));
  const below = near.filter(r => at(r).y >= start.y), above = near.filter(r => at(r).y < start.y);
  for (const [ahead, behind] of [[below, above], [[...above].reverse(), [...below].reverse()]]) {
    if (!ahead.length || !behind.length) continue;
    const rest = walk(columns.filter(c => c !== near), at(ahead.at(-1)));
    const here = rest.length ? at(rest.at(-1)) : at(ahead.at(-1));
    const tail = far(here, at(behind[0])) <= far(here, at(behind.at(-1))) ? behind : [...behind].reverse();
    orders.push([...ahead, ...rest, ...tail]);
  }
  const nearest = [];
  for (let here = start, left = [...members]; left.length;) {
    const k = left.reduce((b, r, j) => (far(here, at(r)) < far(here, at(left[b])) ? j : b), 0);
    nearest.push(...left.splice(k, 1));
    here = at(nearest.at(-1));
  }
  orders.push(nearest);
  return orders.filter((o, k) => orders.findIndex(p => p.every((r, j) => r === o[j])) === k);
}

// Belts in line order cut into runs: the fewest belts from the west edge, then the fewest
// splitters (then, with `line`, the shortest lines: line(run, planFan(run))); with `joins`, a run
// may take belts joining it (a joining belt never ends a run), else each run's belts together
// fit one.
function cutRuns(list, joins, line = null, most = FAN_RUN) {
  const n = list.length;
  const best = [{ belts: 0, splitters: 0, length: 0, from: -1 }];
  for (let j = 1; j <= n; j++) {
    best[j] = null;
    for (let i = j - 1; i >= Math.max(0, j - most); i--) {
      const run = list.slice(i, j);
      const plan = planFan(run);
      if (plan.joins.includes(run.length - 1) || (!joins && plan.joins.length)) continue;
      const belts = best[i].belts + plan.belts, splitters = best[i].splitters + run.length - 1;
      const length = best[i].length + (line ? line(run, plan) : 0);
      const b = best[j];
      if (!b || belts < b.belts || (belts === b.belts && (splitters < b.splitters || (splitters === b.splitters && length < b.length)))) best[j] = { belts, splitters, length, from: i };
    }
  }
  const runs = [];
  for (let j = n; j > 0; j = best[j].from) runs.unshift(list.slice(best[j].from, j));
  return runs;
}

// What a run of a Fan-out needs, its belts in line order: the line starts as one belt from the
// west edge (or with what producers bring, `brought`: item → items/min); before an entry whose belt would get less of an item than it takes, a belt joins
// (joins: the entries where). Each belt's items: what the line carries on to it (supply), and
// what each belt from the west edge brings (brings: the line's first belt, then each joining
// one: all a belt carries but the last, which brings the rest).
export function planFan(run, brought = null) {
  const left = brought ?? new Map(run[0].items.map(i => [i.item, i.capacity]));
  const joins = [], supply = [];
  run.forEach((r, k) => {
    if (k > 0 && r.items.some(i => (left.get(i.item) ?? 0) < i.rate - 1e-6)) {
      joins.push(k);
      for (const i of r.items) left.set(i.item, (left.get(i.item) ?? 0) + i.capacity);
    }
    supply.push(r.items.map(i => ({ ...i, supply: Math.min(i.capacity, left.get(i.item) ?? 0) })));
    for (const i of r.items) left.set(i.item, (left.get(i.item) ?? 0) - i.rate);
  });
  const belts = joins.length + 1;
  const total = item => run.reduce((sum, r) => sum + (r.items.find(i => i.item === item)?.rate ?? 0), 0);
  const brings = Array.from({ length: belts }, (_, b) => run[0].items.map(i => ({
    item: i.item, rate: b < belts - 1 ? i.capacity : Math.max(0, total(i.item) - (belts - 1) * i.capacity),
  })));
  return { belts, joins, supply, brings };
}

// Pairs belts of one Internal Path through splitters, greedily: the belt short the most with the
// partner that lets the option deliver the most (Path Flow), until no pairing delivers more.
// Marks each pair (g.pair) and returns what is still short.
function pairUp(option, wantOf, deliver) {
  const need = option.reduce((sum, g) => sum + (wantOf(g) ?? 0), 0);
  let best = deliver(option, true);
  for (;;) {
    const short = option.map((g, j) => ({ j, s: (wantOf(g) ?? 0) - best.delivered[j] }))
      .filter(x => x.s > 1e-6 && option[x.j].pair === undefined).sort((a, b) => b.s - a.s);
    let pick = null;
    for (const x of short) {
      for (let y = 0; y < option.length; y++) {
        if (y === x.j || option[y].pair !== undefined) continue;
        option[x.j].pair = y;
        option[y].pair = x.j;
        const flow = deliver(option, true);
        delete option[x.j].pair;
        delete option[y].pair;
        if (flow.total > (pick?.flow.total ?? best.total) + 1e-6) pick = { x: x.j, y, flow };
      }
      if (pick) break;
    }
    if (!pick) return need - best.total;
    option[pick.x].pair = pick.y;
    option[pick.y].pair = pick.x;
    best = pick.flow;
  }
}

// The splitters an option's markers ask for, as Path Flow joins: a pair (2 to 2), a merge (2 to 1)
// or a fork (1 to 2).
function splittersOf(option) {
  return option.flatMap((g, j) => {
    if (g.merge !== undefined) return [{ ins: [j, g.merge], outs: [j] }];
    if (g.forked !== undefined) return [{ ins: [j], outs: [j, g.forked] }];
    if (g.pair !== undefined && g.pair > j) return [{ ins: [j, g.pair], outs: [j, g.pair] }];
    return [];
  });
}

function beltRoute(id, base, bases, items, slots, plan) {
  const servesRows = {}, share = {};
  for (const { inst, part } of slots) {
    servesRows[inst.step] = [...(servesRows[inst.step] ?? []), ...part.rows.map(r => r + inst.rowOffset)];
    share[inst.step] = (share[inst.step] ?? 0) + part.machines / plan[inst.step].count;
  }
  const consumers = [...new Set(slots.map(s => s.inst.step).filter(step => step !== base.source))];
  return {
    ...base, id, base: base.id, bases, items, consumers, servesRows, share,
    slots: slots.map(s => ({ ...s })),
  };
}

// The sum of f over slots i to j - 1, by prefix sums.
function prefix(slots, f) {
  const before = [0];
  for (const s of slots) before.push(before.at(-1) + f(s));
  return (i, j) => before[j] - before[i];
}

// maxFlow of the slots i to j - 1's drops, by prefix sums: every term of it adds up per machine.
function laneFlow(slots, made, lane) {
  const term = f => prefix(slots, s => s.part.drops.reduce((sum, m) => sum + Math.min(made * (m.share ?? 1), f(m)), 0));
  const both = term(m => m.left + m.right + m.either);
  const right = term(m => m.right), leftEither = term(m => m.left + m.either);
  const left = term(m => m.left), rightEither = term(m => m.right + m.either);
  return (i, j) => Math.min(
    Math.min(both(i, j), lane + right(i, j), lane + leftEither(i, j), 2 * lane),
    Math.min(both(i, j), lane + rightEither(i, j), lane + left(i, j), 2 * lane),
  );
}

// Slots cut into runs of neighbours that chain, each starting where startOk and ending where
// endOk allows: for each number of runs up to `most`, the cut costing least — the sum of
// runCost(k, i, j) over its runs, the k-th run (from 0) holding slots i to j - 1 — or null when
// there is none.
function splits(slots, most, chainable, startOk, endOk, runCost) {
  const n = slots.length;
  const cost = Array.from({ length: most + 1 }, () => new Float64Array(n + 1).fill(Infinity));
  const from = Array.from({ length: most + 1 }, () => new Int32Array(n + 1).fill(-1));
  cost[0][0] = 0;
  for (let j = 1; j <= n; j++) {
    if (!endOk(slots[j - 1])) continue;
    // Runs i..j-1, longest last: one that does not chain stops them.
    for (let i = j - 1; i >= 0; i--) {
      if (i < j - 1 && !chainable(slots[i], slots[i + 1])) break;
      if (!startOk(slots[i])) continue;
      for (let k = 1; k <= most; k++) {
        if (cost[k - 1][i] === Infinity) continue;
        const total = cost[k - 1][i] + runCost(k - 1, i, j);
        if (total < cost[k][j]) {
          cost[k][j] = total;
          from[k][j] = i;
        }
      }
    }
  }
  return count => {
    if (count > most || cost[count][n] === Infinity) return null;
    const runs = [];
    for (let j = n, k = count; k > 0; k--) {
      const i = from[k][j];
      runs.unshift(slots.slice(i, j));
      j = i;
    }
    return runs;
  };
}

// Where a module's fluid reaches its west edge (an input) or east edge (an output).
function stubOf(module, fluid) {
  const { area } = module;
  const edge = fluid.role === 'input' ? area.x : area.x + area.w - 1;
  const at = fluid.pieces.find(p => p.x === edge);
  if (!at) throw new RoutingError(`${fluid.fluid}: its pipes do not reach the module's edge`);
  return { x: at.x, y: at.y, side: fluid.role === 'input' ? 'W' : 'E' };
}

const pipeRouteOf = (routes, baseId) => routes.find(r => r.kind === 'pipe' && r.base === baseId).id;

function extentOf(placed, margin) {
  const boxes = placed.map(p => p.box ?? p);
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
  const x1 = Math.max(...boxes.map(b => b.x + b.w)), y1 = Math.max(...boxes.map(b => b.y + b.h));
  return { x: x0 - margin.w, y: y0 - margin.n, w: x1 - x0 + margin.w + margin.e, h: y1 - y0 + margin.n + margin.s };
}

// A routed piece list's tunnels, so links routed later neither cross nor interleave them.
function addTunnels(grid, pieces, name) {
  pieces.forEach((p, i) => {
    if (p.underground === 'input' && pieces[i + 1]?.underground === 'output') grid.addTunnel(name, p, pieces[i + 1]);
  });
}

const hold = (grid, x, y, id) => {
  if (grid.inBounds(x, y) && !grid.occupied.has(key(x, y)) && !grid.reserved.has(key(x, y))) grid.reserve(x, y, id);
};

const westEdge = area => [...Array(area.h).keys()].map(k => ({ x: area.x, y: area.y + k, a: E }));

const shift = (k, ox, oy) => {
  const [x, y] = k.split(',').map(Number);
  return key(x + ox, y + oy);
};

// Each Sub-Block's inserter supply across its copies (one entry per belt of items it takes or
// gives, every machine's share).
function supplyOf(instances) {
  const out = new Map();
  for (const inst of instances) {
    for (const s of inst.module.core.supply) {
      const k = `${s.role}|${s.items.join('+')}`;
      if (!out.has(k)) out.set(k, { ...s, perMachine: [] });
      out.get(k).perMachine.push(...s.perMachine);
    }
  }
  return [...out.values()];
}

function extent(entities) {
  let x = Infinity, y = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of entities) {
    x = Math.min(x, e.x); y = Math.min(y, e.y);
    x1 = Math.max(x1, e.x + e.w); y1 = Math.max(y1, e.y + e.h);
  }
  return { x, y, w: x1 - x, h: y1 - y };
}
