import { Grid, E, key } from './grid.js';
import { routeBelt, routePipe, RoutingError } from './router.js';
import { placePoles, PowerError } from './poles.js';
import { wirePairs } from './wires.js';

export { RoutingError, PowerError };

const REROUTES = 6;

// Places every Sub-Block's core, routes every belt and pipe, and places poles: one candidate
// Compound Block. Throws RoutingError or PowerError when the candidate cannot be built.
// ctx: { plan, routes, catalog, logistics }
// layout: { cores, placed: [{ x, y }], margin: { w, e, n, s }, routeOrder }
export function buildCompound(ctx, layout) {
  const { plan, catalog, logistics } = ctx;
  const { cores, placed, margin } = layout;
  const laneCapacity = catalog.belts[logistics.belt].itemsPerSecond * 30;
  const { routes, idOf } = splitRoutes(ctx.routes, cores, plan, laneCapacity);
  const width = Math.max(...cores.map((c, i) => placed[i].x + c.w));
  const height = Math.max(...cores.map((c, i) => placed[i].y + c.h));
  const area = { x: -margin.w, y: -margin.n, w: width + margin.w + margin.e, h: height + margin.n + margin.s };

  const placeCores = () => {
    const grid = new Grid(area);
    const entities = [];
    cores.forEach((core, i) => {
      const { x: ox, y: oy } = placed[i];
      for (const e of core.entities) {
        const abs = { ...e, x: e.x + ox, y: e.y + oy, subBlock: i };
        entities.push(abs);
        grid.place(abs);
      }
      for (const row of core.rows) for (const [x, y] of row.reserve) grid.reserve(x + ox, y + oy, idOf(i, row.routeIds[0], row.part));
      for (const row of core.pipeRows) for (const [x, y] of row.reserve) grid.reserve(x + ox, y + oy, idOf(i, row.routeId));
      for (const port of core.ports) for (const [x, y] of port.tiles) grid.reserveFluidPort(x + ox, y + oy, idOf(i, port.routeId));
      for (const [x, y] of core.pipeBlocked) grid.pipeBlocked.add(key(x + ox, y + oy));
      for (const [x, y] of core.surfacePorts) grid.surfaceOnly.add(key(x + ox, y + oy));
      // A tap is where a connection's pipe surfaces before its pipe row: its fluid's alone.
      for (const { routeId, tile: [x, y] } of core.taps ?? []) grid.reserve(x + ox, y + oy, idOf(i, routeId));
      // Pole slots stay free while routing, so belts dive under them.
      for (const [x, y] of core.poleSlots) grid.reserve(x + ox, y + oy, -1);
    });
    // A fluid with pipe rows in several bands joins them in a riser column beside its core: the
    // first such fluid on the west, the next on the east, then further out. The rows' ends touch
    // it; belts cross it underground and turn between rows outside it. Without risers the first
    // fluid routed could take both sides and enclose the other's rows.
    cores.forEach((core, i) => {
      const { x: ox, y: oy } = placed[i];
      const fluids = [...new Set(core.pipeRows.map(p => p.routeId))]
        .filter(id => core.pipeRows.filter(p => p.routeId === id).length > 1);
      fluids.forEach((id, k) => {
        const out = 1 + 2 * Math.floor(k / 2);
        const x = k % 2 ? ox + core.w - 1 + out : ox - out;
        const ys = core.pipeRows.filter(p => p.routeId === id).map(p => p.y + oy);
        for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
          if (!grid.occupied.has(key(x, y)) && !grid.reserved.has(key(x, y))) grid.reserve(x, y, idOf(i, id));
        }
      });
    });
    return { grid, entities };
  };

  const beltSpec = catalog.belts[logistics.belt];
  const beltNames = { belt: beltSpec.name, underground: beltSpec.underground.name, reach: beltSpec.underground.maxDistance };
  const pipeNames = { pipe: 'pipe', underground: logistics.pipe, reach: catalog.pipes[logistics.pipe].maxDistance };
  const rowsOf = (i, id) => cores[i].rows.filter(r => idOf(i, r.routeIds[0], r.part) === id)
    .map(r => r.waypoints.map(([x, y]) => [x + placed[i].x, y + placed[i].y]));
  const portTerminals = (i, id) => cores[i].ports.find(p => idOf(i, p.routeId) === id).tiles
    .map(([x, y, outward]) => [x + placed[i].x, y + placed[i].y, outward]);

  const routeOne = (grid, route) => {
    if (route.kind === 'pipe') {
      const own = route.source === 'side-input' ? [] : portTerminals(route.source, route.id);
      const terminals = [...own, ...route.consumers.flatMap(i => portTerminals(i, route.id))];
      return routePipe(grid, {
        id: route.id, fluid: route.fluid, terminals, source: route.source === 'side-input', sink: route.sink === 'side-output',
      }, pipeNames);
    }
    let start;
    const segments = route.consumers.flatMap(i => rowsOf(i, route.id));
    if (route.source === 'side-input') {
      const tiles = [];
      for (let ty = area.y; ty < area.y + area.h; ty++) tiles.push([area.x, ty]);
      start = { tiles, dir: E };
    } else {
      // The belt starts at its producer's first drop tile and visits the producer's rows first.
      const [firstRow, ...otherRows] = rowsOf(route.source, route.id).filter(row => row.length);
      start = { tiles: [firstRow[0]], dir: E };
      segments.unshift(firstRow.slice(1), ...otherRows);
    }
    const end = route.sink === 'side-output' ? 'east' : 'dead';
    return routeBelt(grid, { id: route.id, start, waypoints: serpentine(start.tiles.length === 1 ? start.tiles[0][0] : area.x, segments), end }, beltNames);
  };

  // Pipes are the most constrained (no fluid may touch another), so they route first unless the
  // layout says otherwise. When a route fails, everything is ripped up and rerouted with the
  // failing route first — a few times; beyond that the search's own routing orders take over.
  let order = layout.routeOrder
    ? [...new Set(layout.routeOrder.flatMap(base => routes.filter(r => (r.bases ?? [r.base]).includes(base)).map(r => r.id)))]
    : [...routes.filter(r => r.kind === 'pipe'), ...routes.filter(r => r.kind === 'belt')].map(r => r.id);
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
    if (tried.has(order.join()) || tried.size > REROUTES) throw failed.error;
  }

  function finish(grid, entities, result) {
    const consumers = entities.filter(e => e.kind === 'inserter' || (e.kind === 'building' && catalog.buildings[e.name].energy === 'electric'));
    entities.push(...placePoles(grid, consumers, catalog.poles[logistics.pole]));
    const subBlocks = plan.map((sb, i) => ({
      ...sb, index: i, ...placed[i], w: cores[i].w, h: cores[i].h, inserters: cores[i].supply,
    }));
    return { subBlocks, entities, routes: result, bounds: extent(entities), wires: wirePairs(entities, catalog) };
  }
}

// A route a core splits into parts — parallel belts, each serving some of its machine rows —
// becomes one route per part, carrying the part's share. Only a Side Input taken by that one
// Sub-Block, or an output nothing else takes, is split. Two Side Inputs whose parts a core
// merged become one route per part, an item on each lane. idOf(sub-block, base route, part)
// gives the route id on the grid.
function splitRoutes(baseRoutes, cores, plan, laneCapacity) {
  const routes = [];
  const ids = new Map();
  for (const base of baseRoutes) {
    const owner = base.source === 'side-input' && base.consumers.length === 1 ? base.consumers[0]
      : typeof base.source === 'number' && base.consumers.length === 0 ? base.source : null;
    const parts = owner === null ? [] : cores[owner].parts.filter(p => p.routeIds.includes(base.id));
    if (parts.length < 2 && !parts.some(p => p.routeIds.length > 1)) {
      const id = routes.length;
      routes.push({ ...base, id, base: base.id });
      ids.set(`${base.id}`, id);
      continue;
    }
    const isOutput = base.source === owner;
    for (const part of parts) {
      const key = `${base.id}:${owner}:${part.part}`;
      if (ids.has(key)) continue;
      const share = part.machines / plan[owner].count;
      const merged = part.routeIds.length > 1;
      const items = part.routeIds.flatMap(id => baseRoutes[id].items.map(i => ({
        ...i, rate: i.rate * share, ...(isOutput && { supply: i.supply * share }),
        ...(merged && { capacity: laneCapacity, supply: laneCapacity }),
      })));
      const id = routes.length;
      routes.push({
        ...base, id, base: base.id, bases: part.routeIds, part: part.part,
        servesRows: { [owner]: part.rows }, share: { [owner]: share }, items,
      });
      for (const b of part.routeIds) ids.set(`${b}:${owner}:${part.part}`, id);
    }
  }
  const idOf = (i, baseId, part = 0) => ids.get(`${baseId}:${i}:${part}`) ?? ids.get(`${baseId}`);
  return { routes, idOf };
}

// Each row's waypoints are visited in the direction that starts nearer to where the belt is,
// so a belt serving several rows snakes through them instead of doubling back.
function serpentine(fromX, segments) {
  const out = [];
  let x = fromX;
  for (const row of segments) {
    if (!row.length) continue;
    const sorted = [...row].sort((a, b) => a[0] - b[0]);
    const ordered = Math.abs(sorted[0][0] - x) <= Math.abs(sorted.at(-1)[0] - x) ? sorted : sorted.reverse();
    out.push(...ordered);
    x = ordered.at(-1)[0];
  }
  return out;
}

// The Compound Block's bounding box: what Compactness measures.
function extent(entities) {
  const xs = entities.map(e => e.x), ys = entities.map(e => e.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...entities.map(e => e.x + e.w)) - x, h: Math.max(...entities.map(e => e.y + e.h)) - y };
}
