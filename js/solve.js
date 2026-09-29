import { planSubBlocks } from './plan.js';
import { buildFlows } from './flows.js';
import { buildCore } from './layout/core.js';
import { Grid, E } from './layout/grid.js';
import { routeBelt, routePipe, RoutingError } from './layout/router.js';
import { placePoles } from './layout/poles.js';
import { shelfPack } from './layout/pack.js';

const MARGINS = [4, 8, 12];
// Factorio 2.0 fluid segments move up to 6000 units/s.
const PIPE_CAPACITY = 6000 * 60;

// Goals + Recipe Selections → Compound Block: machines, inserters, belts, pipes, tunnels, poles.
export function solve(entries, catalog, logistics) {
  const plan = planSubBlocks(entries, catalog);
  const flows = buildFlows(plan);
  const belt = catalog.belts[logistics.belt];
  const routes = buildRoutes(plan, flows, belt.itemsPerSecond * 60 / 2);
  const cores = plan.map((sb, i) => buildCore(sb, catalog.buildings[sb.building], coreRoutes(sb, i, routes)));
  let failure;
  for (const margin of MARGINS) {
    try {
      return layout(plan, flows, routes, cores, catalog, logistics, margin);
    } catch (e) {
      if (!(e instanceof RoutingError)) throw e;
      failure = e;
    }
  }
  throw failure;
}

// Every route item carries its rate (what the plan moves), supply (what enters the route) and
// capacity (what the route can carry), all per minute. The train keeps Side Input saturated.
function buildRoutes(plan, flows, laneCapacity) {
  const rank = new Map(flows.order.map((sb, i) => [sb, i]));
  const byOrder = (a, b) => rank.get(a) - rank.get(b);
  const consumersOf = item => plan.map((_, i) => i).filter(i => plan[i].inputs.some(x => x.name === item)).sort(byOrder);
  const routes = [];
  const add = r => routes.push({ id: routes.length, ...r });
  const saturated = (item, rate, capacity) => ({ item, rate, supply: capacity, capacity });

  const solids = flows.sideInput.filter(i => i.type === 'item');
  for (const { consumers, items } of mergeGroups(solids, consumersOf, laneCapacity)) {
    // A merged belt gives each item one lane; a lone item fills both.
    const capacity = items.length === 2 ? laneCapacity : 2 * laneCapacity;
    add({ kind: 'belt', source: 'side-input', sink: null, consumers, items: items.map(i => saturated(i.item, i.rate, capacity)) });
  }
  for (const input of flows.sideInput.filter(i => i.type === 'fluid')) {
    add({
      kind: 'pipe', fluid: input.item, source: 'side-input', sink: null,
      items: [saturated(input.item, input.rate, PIPE_CAPACITY)], consumers: consumersOf(input.item),
    });
  }
  plan.forEach((sb, i) => {
    const internalConsumers = item => flows.internal.filter(e => e.from === i && e.item === item).map(e => e.to).sort(byOrder);
    const leavesBlock = item => flows.sideOutput.some(o => o.item === item);
    const solidOut = sb.outputs.filter(o => o.type === 'item');
    if (solidOut.length) {
      // Output inserters drop every product onto the far lane, so the products share it.
      add({
        kind: 'belt', source: i, sink: solidOut.some(o => leavesBlock(o.name)) ? 'side-output' : null,
        items: solidOut.map(o => ({ item: o.name, rate: o.rate, supply: o.rate, capacity: laneCapacity, lane: 'far' })),
        consumers: internalConsumers(sb.item),
      });
    }
    for (const o of sb.outputs.filter(o => o.type === 'fluid')) {
      add({
        kind: 'pipe', fluid: o.name, source: i, sink: leavesBlock(o.name) ? 'side-output' : null,
        items: [{ item: o.name, rate: o.rate, supply: o.rate, capacity: PIPE_CAPACITY }],
        consumers: o.name === sb.item ? internalConsumers(o.name) : [],
      });
    }
  });
  return routes;
}

// Belt Merge: Side Input items share a belt (one per lane) only when they travel the same
// route — the same consumers in the same order — and each fits within a single lane.
function mergeGroups(inputs, consumersOf, laneCapacity) {
  const byConsumers = new Map();
  for (const input of inputs) {
    const consumers = consumersOf(input.item);
    const k = consumers.join(',');
    if (!byConsumers.has(k)) byConsumers.set(k, { consumers, items: [] });
    byConsumers.get(k).items.push({ item: input.item, rate: input.rate });
  }
  const groups = [];
  for (const { consumers, items } of byConsumers.values()) {
    const fits = items.filter(i => i.rate <= laneCapacity);
    for (const i of items) if (i.rate > laneCapacity) groups.push({ consumers, items: [i] });
    for (let i = 0; i < fits.length; i += 2) groups.push({ consumers, items: fits.slice(i, i + 2) });
  }
  return groups;
}

function coreRoutes(sb, i, routes) {
  const fluidIndex = (list, name) => list.filter(x => x.type === 'fluid').findIndex(x => x.name === name);
  const fluids = [];
  for (const r of routes.filter(r => r.kind === 'pipe')) {
    if (r.consumers.includes(i)) fluids.push({ routeId: r.id, fluid: r.fluid, role: 'input', index: fluidIndex(sb.inputs, r.fluid) });
    if (r.source === i) fluids.push({ routeId: r.id, fluid: r.fluid, role: 'output', index: fluidIndex(sb.outputs, r.fluid) });
  }
  return {
    inputs: routes.filter(r => r.kind === 'belt' && r.consumers.includes(i)).map(r => r.id),
    output: routes.find(r => r.kind === 'belt' && r.source === i)?.id ?? null,
    fluids,
  };
}

function layout(plan, flows, routes, cores, catalog, logistics, margin) {
  const placed = shelfPack(cores, flows.order, margin);
  const width = Math.max(...cores.map((c, i) => placed[i].x + c.w));
  const height = Math.max(...cores.map((c, i) => placed[i].y + c.h));
  const area = { x: -margin, y: -margin, w: width + 2 * margin, h: height + 2 * margin };
  const placeCores = () => {
    const grid = new Grid(area);
    const entities = [];
    cores.forEach((core, i) => {
      const { x: ox, y: oy } = placed[i];
      for (const e of core.entities) {
        const abs = { ...e, x: e.x + ox, y: e.y + oy };
        entities.push(abs);
        grid.place(abs);
      }
      for (const row of core.rows) {
        for (let x = 0; x < core.w; x++) grid.reserve(x + ox, row.y + oy, row.routeId);
      }
      for (const port of core.ports) {
        for (const [x, py] of port.tiles) grid.reserveFluidPort(x + ox, py + oy, port.routeId);
      }
      for (const [x, py] of core.pipeBlocked) grid.pipeBlocked.add(`${x + ox},${py + oy}`);
    });
    return { grid, entities };
  };

  const beltSpec = catalog.belts[logistics.belt];
  const beltNames = { belt: beltSpec.name, underground: beltSpec.underground.name, reach: beltSpec.underground.maxDistance };
  const pipeNames = { pipe: 'pipe', underground: logistics.pipe, reach: catalog.pipes[logistics.pipe].maxDistance };
  const rowWaypoints = (i, routeId) => {
    const row = cores[i].rows.find(r => r.routeId === routeId);
    return row.waypoints.map(([x, wy]) => [x + placed[i].x, wy + placed[i].y]);
  };
  const portTerminals = (i, routeId) => cores[i].ports.find(p => p.routeId === routeId).tiles
    .map(([x, py, outward]) => [x + placed[i].x, py + placed[i].y, outward]);

  const routeOne = (grid, route) => {
    if (route.kind === 'pipe') {
      const own = route.source === 'side-input' ? [] : portTerminals(route.source, route.id);
      const terminals = [...own, ...route.consumers.flatMap(i => portTerminals(i, route.id))];
      return routePipe(grid, {
        id: route.id, fluid: route.fluid, terminals, source: route.source === 'side-input', sink: route.sink === 'side-output',
      }, pipeNames);
    }
    let start;
    let waypoints = route.consumers.flatMap(i => rowWaypoints(i, route.id));
    if (route.source === 'side-input') {
      const tiles = [];
      for (let ty = area.y; ty < area.y + area.h; ty++) tiles.push([area.x, ty]);
      start = { tiles, dir: E };
    } else {
      const [first, ...own] = rowWaypoints(route.source, route.id);
      start = { tiles: [first], dir: E };
      waypoints = [...own, ...waypoints];
    }
    const end = route.sink === 'side-output' ? 'east' : 'dead';
    return routeBelt(grid, { id: route.id, start, waypoints, end }, beltNames);
  };

  // Pipes are the most constrained (no fluid may touch another), so they route first. When a
  // route fails, everything is ripped up and rerouted with the failing route first.
  let order = [...routes.filter(r => r.kind === 'pipe'), ...routes.filter(r => r.kind === 'belt')].map(r => r.id);
  const tried = new Set();
  for (;;) {
    tried.add(order.join());
    const { grid, entities } = placeCores();
    const result = routes.map(r => ({ ...r, pieces: [] }));
    let failed = null;
    for (const id of order) {
      try {
        result[id].pieces = routeOne(grid, result[id]);
        entities.push(...result[id].pieces);
      } catch (e) {
        if (!(e instanceof RoutingError)) throw e;
        failed = { id, error: e };
        break;
      }
    }
    if (!failed) return finish(grid, entities, result);
    order = [failed.id, ...order.filter(id => id !== failed.id)];
    if (tried.has(order.join()) || tried.size > 2 * routes.length) throw failed.error;
  }

  function finish(grid, entities, result) {
    const consumers = entities.filter(e => e.kind === 'inserter' || (e.kind === 'building' && catalog.buildings[e.name].energy === 'electric'));
    entities.push(...placePoles(grid, consumers, catalog.poles[logistics.pole]));
    const subBlocks = plan.map((sb, i) => ({ ...sb, index: i, ...placed[i], w: cores[i].w, h: cores[i].h }));
    return { subBlocks, entities, routes: result, bounds: area };
  }
}
