import { Grid, E, key } from './grid.js';
import { routeBelt, routePipe, RoutingError } from './router.js';
import { placePoles, PowerError } from './poles.js';

export { RoutingError, PowerError };

// Places every Sub-Block's core, routes every belt and pipe, and places poles: one candidate
// Compound Block. Throws RoutingError or PowerError when the candidate cannot be built.
// ctx: { plan, routes, catalog, logistics }
// layout: { cores, placed: [{ x, y }], margin: { w, e, n, s }, routeOrder }
export function buildCompound(ctx, layout) {
  const { plan, routes, catalog, logistics } = ctx;
  const { cores, placed, margin } = layout;
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
      for (const row of core.rows) for (const [x, y] of row.reserve) grid.reserve(x + ox, y + oy, row.routeId);
      for (const port of core.ports) for (const [x, y] of port.tiles) grid.reserveFluidPort(x + ox, y + oy, port.routeId);
      for (const [x, y] of core.pipeBlocked) grid.pipeBlocked.add(key(x + ox, y + oy));
      // Pole slots stay free while routing, so belts dive under them.
      for (const [x, y] of core.poleSlots) grid.reserve(x + ox, y + oy, -1);
    });
    return { grid, entities };
  };

  const beltSpec = catalog.belts[logistics.belt];
  const beltNames = { belt: beltSpec.name, underground: beltSpec.underground.name, reach: beltSpec.underground.maxDistance };
  const pipeNames = { pipe: 'pipe', underground: logistics.pipe, reach: catalog.pipes[logistics.pipe].maxDistance };
  const rowsOf = (i, routeId) => cores[i].rows.filter(r => r.routeId === routeId)
    .map(r => r.waypoints.map(([x, y]) => [x + placed[i].x, y + placed[i].y]));
  const portTerminals = (i, routeId) => cores[i].ports.find(p => p.routeId === routeId).tiles
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
  // failing route first.
  let order = layout.routeOrder ?? [...routes.filter(r => r.kind === 'pipe'), ...routes.filter(r => r.kind === 'belt')].map(r => r.id);
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
    const subBlocks = plan.map((sb, i) => ({
      ...sb, index: i, ...placed[i], w: cores[i].w, h: cores[i].h, inserters: cores[i].supply,
    }));
    return { subBlocks, entities, routes: result, bounds: extent(entities) };
  }
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
