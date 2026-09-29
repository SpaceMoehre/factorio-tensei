import { N, E, S, W, VEC, key } from './grid.js';
import { inserterRate } from '../inserters.js';

export const ROTATIONS = [0, 4, 8, 12];
const SIDE = { [N]: 'top', [S]: 'bottom', [W]: 'left', [E]: 'right' };

// How an inserter reaches a belt at depth d from the machine face (the diagram in PRD v2):
//   d=4  long-handed inserter standing in row 2 (drops 2 tiles, into the machine)
//   d=3  long-handed inserter in row 1
//   d=2  fast inserter in row 1
//   d=1  90° fast inserter in row 1, reaching sideways to the belt beside it in its own row
// Belts at d=1 and d=2 share their row with inserters (and pole slots) and dive under them.
const REACH = {
  1: { row: 1, long: false, turn: 90 },
  2: { row: 1, long: false, turn: 180 },
  3: { row: 1, long: true, turn: 180 },
  4: { row: 2, long: true, turn: 180 },
};

export class LayoutError extends Error {}

// Lays out one Sub-Block in local coordinates from a variant — every choice the layout search
// makes for it:
//   rotation      machine direction
//   belts         [{ routeId, face: 'top' | 'bottom', depth: 1..4 }], one per belt route
//   gap           extra columns between neighbouring machines
//   columns       'center' | 'left' | 'right': which inserter columns are tried first
//   side          -1 | 1: which neighbour a 90° inserter reaches for first
//   poleSlot      null or { face, row }: a tile per machine kept free for a pole
// Where fewer inserters fit than a belt needs, the core records the shortfall (items/min its
// machines cannot get); the search ranks such layouts below any that fit, and Starvation
// reports them.
// links: { inputs: [routeId], output: routeId | null, fluids: [{ routeId, fluid, role, index }] }
// env: { routes, inserters: { short, long }, rightAngle, beltReach }
export function buildCore(sb, building, links, variant, env) {
  const { rotation } = variant;
  const { w: Wm, h: Hm } = rotatedSize(building.size, rotation);
  const faceBelts = face => variant.belts.filter(b => b.face === face);
  const connections = pickConnections(sb, building, links.fluids, rotation, faceBelts);
  const used = connections.filter(c => c.routeId !== undefined);
  const ported = side => used.some(c => c.side === side);

  // Rows on each face, counted outward from the machines. A row left without a belt stays free
  // for pipes and poles.
  const depthOf = face => Math.max(ported(face) ? 1 : 0, ...faceBelts(face).map(b => b.depth));
  const top = depthOf('top'), bottom = depthOf('bottom');
  const machineY = top;
  const rowY = (face, row) => (face === 'top' ? machineY - row : machineY + Hm - 1 + row);

  // Side connections sit in the gaps between machines: one column per machine side.
  const leftPad = ported('left') ? 1 : 0, rightPad = ported('right') ? 1 : 0;
  const pitch = Wm + (leftPad && rightPad ? 2 : leftPad || rightPad ? 1 : 0) + variant.gap;
  const machineX = i => leftPad + i * pitch;
  const width = machineX(sb.count - 1) + Wm + rightPad;
  const height = top + Hm + bottom;

  const tiles = new Map();
  const at = (x, y) => tiles.get(key(x, y));
  const set = (x, y, v) => tiles.set(key(x, y), v);
  const entities = [];
  for (let i = 0; i < sb.count; i++) {
    const m = { name: sb.building, kind: 'building', recipe: sb.recipe, x: machineX(i), y: machineY, w: Wm, h: Hm, direction: rotation };
    entities.push(m);
    for (let dx = 0; dx < Wm; dx++) for (let dy = 0; dy < Hm; dy++) set(m.x + dx, m.y + dy, { type: 'machine' });
  }

  const ports = [];
  const pipeBlocked = [];
  for (let i = 0; i < sb.count; i++) {
    for (const c of connections) {
      const [x, y] = [machineX(i) + c.tileX, machineY + c.tileY];
      if (c.routeId === undefined) { pipeBlocked.push([x, y]); continue; }
      if (at(x, y) || x < 0 || x >= width) throw new LayoutError('fluid connections collide');
      set(x, y, { type: 'port', routeId: c.routeId });
      let port = ports.find(p => p.routeId === c.routeId);
      if (!port) ports.push(port = { routeId: c.routeId, fluid: c.fluid, tiles: [] });
      port.tiles.push([x, y, c.dir]);
    }
  }
  // A pipe on a neighbour's unused connection would plug into it, and connections of different
  // pipe networks side by side would join them.
  const unused = new Set(pipeBlocked.map(([x, y]) => key(x, y)));
  for (const p of ports) {
    for (const [x, y] of p.tiles) {
      if (unused.has(key(x, y))) throw new LayoutError('a fluid connection sits on a neighbour\'s unused connection');
      for (const [dx, dy] of Object.values(VEC)) {
        const n = at(x + dx, y + dy);
        if (n?.type === 'port' && n.routeId !== p.routeId) throw new LayoutError('fluid connections of different networks touch');
      }
    }
  }

  if (variant.poleSlot) {
    const { face, row } = variant.poleSlot;
    if (row > depthOf(face)) throw new LayoutError('pole slot outside the belt rows');
    for (let i = 0; i < sb.count; i++) {
      const x = columnOrder(Wm, variant.columns).map(c => machineX(i) + c).find(x => !at(x, rowY(face, row)));
      if (x === undefined) throw new LayoutError('no room for a pole slot');
      set(x, rowY(face, row), { type: 'pole' });
    }
  }

  // Inserters: each machine gets enough for every belt it uses, from its real swing rate.
  const supply = [];
  let shortfall = 0;
  const beltAt = (face, depth) => variant.belts.find(b => b.face === face && b.depth === depth);
  const freeTile = (x, y) => !at(x, y);
  const beltTileFor = (routeId, x, y) => {
    const t = at(x, y);
    return !t || (t.type === 'belt' && t.routeId === routeId);
  };
  // Long-handed inserters in row 2 first: they need that row, which the d=2 belt must then
  // dive under.
  const slots = [...variant.belts].sort((a, b) => REACH[b.depth].row - REACH[a.depth].row);
  for (const belt of slots) {
    const isOutput = belt.routeId === links.output;
    const reach = REACH[belt.depth];
    if (belt.depth === 1 && !env.rightAngle) throw new LayoutError('a belt against the machine needs 90° inserters');
    const spec = reach.long ? env.inserters.long : env.inserters.short;
    const rate = inserterRate(spec, reach.turn);
    const items = routeItems(sb, env.routes[belt.routeId], isOutput);
    const demand = items.reduce((sum, i) => sum + i.rate, 0) / sb.count;
    const needed = Math.max(1, Math.ceil(demand / rate - 1e-9));
    const perMachine = [];
    for (let i = 0; i < sb.count; i++) {
      let placed = 0;
      for (const c of columnOrder(Wm, variant.columns)) {
        if (placed === needed) break;
        const x = machineX(i) + c;
        const y = rowY(belt.face, reach.row);
        if (!freeTile(x, y)) continue;
        let pickX = x, pickY = rowY(belt.face, belt.depth);
        if (belt.depth === 1) {
          const side = [variant.side, -variant.side].find(s => beltTileFor(belt.routeId, x + s, y) && x + s >= 0 && x + s < width);
          if (side === undefined) continue;
          pickX = x + side;
        } else if (!beltTileFor(belt.routeId, pickX, pickY)) continue;
        set(pickX, pickY, { type: 'belt', routeId: belt.routeId, waypoint: true });
        set(x, y, { type: 'inserter' });
        entities.push(inserter(spec, belt, reach, isOutput, x, y, pickX - x));
        placed++;
      }
      if (placed === 0) throw new LayoutError(`${sb.building} has no room for the inserters its belts need`);
      shortfall += Math.max(0, demand - placed * rate) * (placed < needed ? 1 : 0);
      perMachine.push(placed * rate);
    }
    supply.push({ route: belt.routeId, role: isOutput ? 'output' : 'input', items: items.map(i => i.name), perMachine });
  }

  // Belt rows: every tile not taken by an inserter, a connection or a pole slot is held for the
  // row's route. The belt dives under the rest, so no run of those may outreach a tunnel, and a
  // belt stretch between two of them needs two tiles: one to surface on, one to dive from.
  const rows = [];
  for (const belt of variant.belts) {
    const y = rowY(belt.face, belt.depth);
    const waypoints = [];
    const blocked = x => { const t = at(x, y); return t && t.type !== 'belt'; };
    for (let x = 0, run = 0; x < width; x++) {
      if (!blocked(x)) { run = 0; continue; }
      if (++run >= env.beltReach) throw new LayoutError('a belt row is blocked for longer than a tunnel reaches');
    }
    for (let x = 1; x + 1 < width; x++) {
      if (!blocked(x) && blocked(x - 1) && blocked(x + 1)) throw new LayoutError('a belt tile is boxed in between inserters');
    }
    for (let x = 0; x < width; x++) {
      const t = at(x, y);
      if (blocked(x)) continue;
      if (t?.waypoint) waypoints.push([x, y]);
      else set(x, y, { type: 'belt', routeId: belt.routeId });
    }
    rows.push({ routeId: belt.routeId, y, waypoints, reserve: [...Array(width).keys()].filter(x => at(x, y)?.type === 'belt').map(x => [x, y]) });
  }

  const poleSlots = [];
  for (const [k, t] of tiles) if (t.type === 'pole') poleSlots.push(k.split(',').map(Number));
  return { w: width, h: height, entities, rows, ports, pipeBlocked, poleSlots, supply, shortfall };

  function inserter(spec, belt, reach, isOutput, x, y, sideways) {
    const toward = belt.face === 'top' ? S : N;
    const away = belt.face === 'top' ? N : S;
    // A straight inserter's direction is the side it picks up from.
    const e = { name: spec.name, kind: 'inserter', x, y, w: 1, h: 1, direction: isOutput ? toward : away };
    if (belt.depth === 1) {
      // 90°: the belt beside it, the machine in front of it (vectors relative to the inserter).
      const length = v => Math.hypot(v.x, v.y);
      const [tx, ty] = VEC[toward];
      const beside = { x: sideways * length(spec.pickup), y: 0 };
      const into = { x: tx * length(spec.insert), y: ty * length(spec.insert) };
      e.vectors = isOutput
        ? { pickup: { x: tx * length(spec.pickup), y: ty * length(spec.pickup) }, drop: { x: sideways * length(spec.insert), y: 0 } }
        : { pickup: beside, drop: into };
    }
    return e;
  }
}

// What a Sub-Block takes from (or puts on) a belt route: the route's items it consumes, or its
// solid products.
function routeItems(sb, route, isOutput) {
  if (isOutput) return sb.outputs.filter(o => o.type === 'item');
  const names = new Set(route.items.map(i => i.item));
  return sb.inputs.filter(i => names.has(i.name));
}

// Inserter columns in front of a machine, in the order they are tried.
export function columnOrder(Wm, mode) {
  const all = [...Array(Wm).keys()];
  if (mode === 'left') return all;
  if (mode === 'right') return all.reverse();
  const center = Math.floor(Wm / 2);
  const order = [center];
  for (let d = 1; order.length < Wm; d++) {
    if (center - d >= 0) order.push(center - d);
    if (center + d < Wm) order.push(center + d);
  }
  return order;
}

// One connection per used fluid box (preferring faces with fewer belts, so pipes cross fewer
// of them), plus every connection the recipe leaves unused.
function pickConnections(sb, building, fluids, rotation, faceBelts) {
  const boxesFor = role => building.fluidBoxes.filter(b => (role === 'input' ? b.production !== 'output' : b.production !== 'input'));
  const crowding = c => (c.side === 'top' || c.side === 'bottom' ? faceBelts(c.side).length : 0);
  const picks = fluids.map(f => {
    const box = boxesFor(f.role)[f.index];
    if (!box) throw new Error(`${sb.building} has no ${f.role} fluid box for ${f.fluid}`);
    const options = box.connections.map(c => placeConnection(c, rotation, building));
    const best = options.reduce((a, b) => (crowding(b) < crowding(a) ? b : a));
    return { ...best, routeId: f.routeId, fluid: f.fluid };
  });
  const taken = new Set(picks.map(c => `${c.tileX},${c.tileY}`));
  const unused = building.fluidBoxes.flatMap(b => b.connections.map(c => placeConnection(c, rotation, building)))
    .filter(c => !taken.has(`${c.tileX},${c.tileY}`));
  return [...picks, ...unused];
}

export function rotatedSize({ w, h }, rotation) {
  return rotation === 4 || rotation === 12 ? { w: h, h: w } : { w, h };
}

// Where a connection's pipe tile lies relative to the machine's top-left corner once rotated.
// Rotating clockwise by a quarter turn maps (x, y) to (-y, x).
export function placeConnection(c, rotation, building) {
  let [x, y] = [c.x, c.y];
  for (let r = 0; r < rotation; r += 4) [x, y] = [-y, x];
  const dir = (c.direction + rotation) % 16;
  const size = rotatedSize(building.size, rotation);
  const [dx, dy] = VEC[dir];
  const tileX = Math.floor(size.w / 2 + x + dx);
  const tileY = Math.floor(size.h / 2 + y + dy);
  return { side: SIDE[dir], dir, tileX, tileY };
}
