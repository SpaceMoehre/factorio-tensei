import { N, E, S, W, VEC, key } from './grid.js';
import { inserterRate } from '../inserters.js';

export const ROTATIONS = [0, 4, 8, 12];
const SIDE = { [N]: 'top', [S]: 'bottom', [W]: 'left', [E]: 'right' };
const SEARCH_NODES = 3000;

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

// Lays out one Sub-Block in local coordinates from a variant — the choices the layout search
// makes for it:
//   rotation  machine direction; flip turns the second machine row half round
//   rows      1, or 2 machine rows facing each other across a middle band `middle` rows high
//   belts     [{ routeId, band: 'top' | 'middle' | 'bottom', row }]: the band row each belt
//             runs in, counted outward from the machines (in the middle band, from the first
//             machine row). A two-row block reaches a middle belt from both rows; a route in
//             the top band also needs one in the bottom band, for the second row.
//   gap       extra columns between neighbouring machines
//   columns   'center' | 'left' | 'right': which inserter columns are tried first
//   poleSlot  null or { band, row }: a tile per machine kept free for a pole
//   ports     for each fluid, which of its box's connections to use (index, wrapping); when
//             absent, the one on the face with fewest belts
// Every machine gets enough inserters for its share of each belt, from real swing rates; where
// fewer fit, the core records the shortfall (items/min its machines cannot get), which the
// search ranks below any layout that fits and Starvation reports.
// links: { inputs: [routeId], output: routeId | null, fluids: [{ routeId, fluid, role, index }] }
// env: { routes, inserters: { short, long }, rightAngle, beltReach }
export function buildCore(sb, building, links, variant, env) {
  const rows = variant.rows ?? 1;
  const middle = rows === 2 ? variant.middle : 0;
  const rotations = [variant.rotation, variant.flip ? (variant.rotation + 8) % 16 : variant.rotation];
  const { w: Wm, h: Hm } = rotatedSize(building.size, variant.rotation);
  const counts = rows === 1 ? [sb.count] : [Math.ceil(sb.count / 2), Math.floor(sb.count / 2)];
  if (counts[rows - 1] === 0) throw new LayoutError('two rows need two machines');

  // The faces machine rows reach belts through, and the band each faces.
  const faces = rows === 1
    ? [face('top', 0, 'top'), face('bottom', 0, 'bottom')]
    : [face('top', 0, 'top'), face('bottom', 0, 'middle'), face('top', 1, 'middle'), face('bottom', 1, 'bottom')];
  function face(side, machineRow, band) {
    // Depth from this face of a row of its band.
    const depth = row => (band === 'middle' && machineRow === 1 ? middle + 1 - row : row);
    return { side, machineRow, band, depth };
  }

  const connections = rotations.slice(0, rows).map(r => pickConnections(sb, building, links.fluids, r, variant));
  const ported = (r, side) => connections[r].some(c => c.routeId !== undefined && c.side === side);

  // Each machine row reaches each route through the nearest of the route's belts it can.
  const access = [];
  for (let r = 0; r < rows; r++) {
    for (const routeId of new Set(variant.belts.map(b => b.routeId))) {
      const options = variant.belts.filter(b => b.routeId === routeId)
        .flatMap(belt => faces.filter(f => f.machineRow === r && f.band === belt.band).map(f => ({ face: f, belt, depth: f.depth(belt.row) })))
        .filter(a => a.depth >= 1 && a.depth <= 4).sort((a, b) => a.depth - b.depth);
      if (!options.length) throw new LayoutError('a machine row cannot reach one of its belts');
      access.push(options[0]);
    }
  }
  if (!env.rightAngle && access.some(a => a.depth === 1)) throw new LayoutError('a belt against the machine needs 90° inserters');
  const bandHeight = band => {
    if (band === 'middle') return middle;
    const f = faces.find(f => f.band === band);
    return Math.max(ported(f.machineRow, f.side) ? 1 : 0, ...variant.belts.filter(b => b.band === band).map(b => b.row));
  };
  if (rows === 2) {
    const needed = Math.max(1, ...variant.belts.filter(b => b.band === 'middle').map(b => b.row));
    if (middle < needed) throw new LayoutError('the middle band is too narrow');
  }

  // Columns: every machine sits at the same offset in a period of `pitch` columns, with pads for
  // side connections and the gap after it.
  const anySide = side => [0, 1].slice(0, rows).some(r => ported(r, side));
  const leftPad = anySide('left') ? 1 : 0, rightPad = anySide('right') ? 1 : 0;
  const pitch = leftPad + Wm + rightPad + variant.gap;

  // Rows, top to bottom: top band, machine row A, [middle band, machine row B], bottom band.
  const top = bandHeight('top');
  const machineY = [top, top + Hm + middle];
  const height = machineY[rows - 1] + Hm + bandHeight('bottom');
  const faceY = (f, k) => (f.side === 'top' ? machineY[f.machineRow] - k : machineY[f.machineRow] + Hm - 1 + k);
  const bandY = (band, row) => {
    if (band === 'top') return top - row;
    if (band === 'middle') return machineY[0] + Hm - 1 + row;
    return machineY[rows - 1] + Hm - 1 + row;
  };

  // One period of every band row is laid out once and repeated for each machine. Its tiles hold
  // a connection, an inserter, a pole slot or a waypoint (a belt tile an inserter reaches).
  const period = new Period(pitch, height);
  for (let r = 0; r < rows; r++) {
    for (const c of connections[r]) {
      if (c.routeId === undefined || (c.side !== 'top' && c.side !== 'bottom')) continue;
      const [x, y] = [leftPad + c.tileX, machineY[r] + c.tileY];
      if (x < 0 || x >= pitch || period.get(x, y)) throw new LayoutError('fluid connections collide');
      period.set(x, y, { type: 'port' });
    }
  }
  const slots = access.map(a => {
    const reach = REACH[a.depth];
    const spec = reach.long ? env.inserters.long : env.inserters.short;
    const rate = inserterRate(spec, reach.turn);
    const isOutput = a.belt.routeId === links.output;
    const items = routeItems(sb, env.routes[a.belt.routeId], isOutput);
    const demand = items.reduce((sum, i) => sum + i.rate, 0) / sb.count;
    return {
      ...a, spec, rate, isOutput, items, demand,
      needed: Math.max(1, Math.ceil(demand / rate - 1e-9)),
      insY: faceY(a.face, reach.row), beltY: faceY(a.face, a.depth),
    };
  });
  const beltRows = variant.belts.map(b => ({ routeId: b.routeId, y: bandY(b.band, b.row) }));
  if (variant.poleSlot && variant.poleSlot.row > bandHeight(variant.poleSlot.band)) throw new LayoutError('pole slot outside its band');
  const poleY = variant.poleSlot ? bandY(variant.poleSlot.band, variant.poleSlot.row) : null;
  const columns = placeInserters(slots, beltRows, period, {
    pitch, cyclic: counts[0] > 1, beltReach: env.beltReach, poleY,
    machineColumns: columnOrder(Wm, variant.columns).map(c => c + leftPad),
  });

  // Stamp the period onto every machine. The core is as wide as its last period's used columns.
  const lastColumn = Math.max(leftPad + Wm + rightPad - 1, period.lastColumn());
  const width = (counts[0] - 1) * pitch + lastColumn + 1;
  const entities = [];
  const stamped = new Map();
  const supply = new Map();
  let shortfall = 0;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < counts[r]; i++) {
      const x0 = i * pitch;
      entities.push({ name: sb.building, kind: 'building', recipe: sb.recipe, x: x0 + leftPad, y: machineY[r], w: Wm, h: Hm, direction: rotations[r] });
      for (const s of slots.filter(s => s.face.machineRow === r)) {
        const placed = columns.get(s);
        for (const { column, side } of placed) {
          entities.push(inserter(s, x0 + column, side));
          stamped.set(key(x0 + column, s.insY), 'inserter');
          stamped.set(key(x0 + column + side, s.beltY), { waypoint: s.belt.routeId });
        }
        const moved = placed.length * s.rate;
        shortfall += Math.max(0, s.demand - moved);
        if (!supply.has(s.belt.routeId)) supply.set(s.belt.routeId, { route: s.belt.routeId, role: s.isOutput ? 'output' : 'input', items: s.items.map(i => i.name), perMachine: [] });
        supply.get(s.belt.routeId).perMachine.push(moved);
      }
      if (poleY !== null && r === 0) {
        stamped.set(key(x0 + period.find(v => v.type === 'pole')[0], poleY), 'pole');
      }
    }
  }

  const ports = [];
  const pipeBlocked = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < counts[r]; i++) {
      for (const c of connections[r]) {
        const [x, y] = [i * pitch + leftPad + c.tileX, machineY[r] + c.tileY];
        if (c.routeId === undefined) { pipeBlocked.push([x, y]); continue; }
        let port = ports.find(p => p.routeId === c.routeId);
        if (!port) ports.push(port = { routeId: c.routeId, fluid: c.fluid, tiles: [] });
        port.tiles.push([x, y, c.dir]);
        stamped.set(key(x, y), 'port');
      }
    }
  }
  // A connection must lie in the core, clear of machines and other connections, and a pipe on a
  // neighbour's unused connection would plug into it.
  const machineAt = (x, y) => entities.some(e => e.kind === 'building' && x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h);
  const unused = new Set(pipeBlocked.map(([x, y]) => key(x, y)));
  const portTiles = ports.flatMap(p => p.tiles);
  if (new Set(portTiles.map(([x, y]) => key(x, y))).size !== portTiles.length
    || portTiles.some(([x, y]) => x < 0 || x >= width || y < 0 || y >= height || machineAt(x, y) || unused.has(key(x, y)))) {
    throw new LayoutError('fluid connections collide');
  }

  // Belt rows: the route holds every tile of its row that no inserter, connection or pole slot
  // takes; the tiles its inserters reach are its waypoints.
  const rowsOut = beltRows.map(({ routeId, y }) => {
    const row = { routeId, y, waypoints: [], reserve: [] };
    for (let x = 0; x < width; x++) {
      const v = stamped.get(key(x, y));
      if (v === 'inserter' || v === 'port' || v === 'pole') continue;
      row.reserve.push([x, y]);
      if (v?.waypoint === routeId) row.waypoints.push([x, y]);
    }
    return row;
  });
  const poleSlots = [...stamped].filter(([, v]) => v === 'pole').map(([k]) => k.split(',').map(Number));
  return { w: width, h: height, entities, rows: rowsOut, ports, pipeBlocked, poleSlots, supply: [...supply.values()], shortfall };

  function inserter(s, x, side) {
    const toward = s.face.side === 'top' ? S : N;
    const away = s.face.side === 'top' ? N : S;
    // A straight inserter's direction is the side it picks up from.
    const e = { name: s.spec.name, kind: 'inserter', x, y: s.insY, w: 1, h: 1, direction: s.isOutput ? toward : away };
    if (s.depth === 1) {
      // 90°: the belt beside it, the machine in front of it (vectors relative to the inserter).
      const length = v => Math.hypot(v.x, v.y);
      const [tx, ty] = VEC[toward];
      const pick = length(s.spec.pickup), drop = length(s.spec.insert);
      e.vectors = s.isOutput
        ? { pickup: { x: tx * pick, y: ty * pick }, drop: { x: side * drop, y: 0 } }
        : { pickup: { x: side * pick, y: 0 }, drop: { x: tx * drop, y: ty * drop } };
    }
    return e;
  }
}

// Chooses inserter columns for one machine period by depth-first search. Every inserter stands
// in front of its machine on a free tile of its row and reaches a tile of its own belt that no
// inserter or connection takes: 90° inserters sideways within the period, the others straight
// out. Every belt row must stay passable: no run of blocked tiles longer than a tunnel spans,
// and no lone belt tile boxed in between blocked ones (it would have to surface and dive at
// once). When the machines' whole demand does not fit, it settles for fewer inserters on the
// belt that wants the most, down to one per belt.
function placeInserters(slots, beltRows, period, { pitch, cyclic, beltReach, poleY, machineColumns }) {
  const at = (c, y) => period.get(c, y);
  const put = (c, y, v) => period.set(c, y, v);
  const blocked = (c, y) => {
    if (!cyclic && (c < 0 || c >= pitch)) return false;
    const v = at(((c % pitch) + pitch) % pitch, y);
    return v !== undefined && v.type !== 'waypoint';
  };
  if (poleY !== null) {
    const all = [...machineColumns, ...[...Array(pitch).keys()].filter(c => !machineColumns.includes(c))];
    const c = all.find(c => !at(c, poleY));
    if (c === undefined) throw new LayoutError('no room for a pole slot');
    put(c, poleY, { type: 'pole' });
  }
  const longestRun = y => {
    let run = 0, longest = 0;
    for (let c = cyclic ? 0 : -1; c < (cyclic ? 2 * pitch : pitch + 1); c++) {
      run = blocked(c, y) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    return longest;
  };
  const passable = y => {
    const longest = longestRun(y);
    if (longest >= beltReach || (cyclic && longest >= pitch)) return false;
    for (let c = 0; c < pitch; c++) if (!blocked(c, y) && blocked(c - 1, y) && blocked(c + 1, y)) return false;
    return true;
  };
  const beltYs = new Set(beltRows.map(b => b.y));
  const stillOpen = y => !beltYs.has(y) || (longestRun(y) < beltReach && !(cyclic && longestRun(y) >= pitch));

  // Row-2 inserters first (the row-1 belt has to dive under them), then nearest belts first.
  const sorted = [...slots].sort((a, b) => REACH[b.depth].row - REACH[a.depth].row || a.depth - b.depth);
  const targets = sorted.map(s => s.needed);
  for (;;) {
    let nodes = 0;
    const chosen = sorted.map(() => []);
    const place = (si, n) => {
      if (++nodes > SEARCH_NODES) return false;
      if (si === sorted.length) return beltRows.every(b => passable(b.y));
      if (n === targets[si]) return place(si + 1, 0);
      const s = sorted[si];
      const mine = chosen[si];
      // A belt's inserters are chosen in column order, so no set is tried twice.
      for (let ci = n ? mine.at(-1).index + 1 : 0; ci < machineColumns.length; ci++) {
        const column = machineColumns[ci];
        if (at(column, s.insY)) continue;
        for (const side of s.depth === 1 ? [-1, 1] : [0]) {
          const pick = column + side;
          if (pick < 0 || pick >= pitch) continue;
          const there = at(pick, s.beltY);
          if (there && !(there.type === 'waypoint' && there.route === s.belt.routeId)) continue;
          put(column, s.insY, { type: 'inserter' });
          put(pick, s.beltY, { type: 'waypoint', route: s.belt.routeId });
          mine.push({ column, side, index: ci });
          if (stillOpen(s.insY) && place(si, n + 1)) return true;
          mine.pop();
          put(column, s.insY, undefined);
          put(pick, s.beltY, there);
        }
      }
      return false;
    };
    if (place(0, 0)) return new Map(sorted.map((s, i) => [s, chosen[i]]));
    // Settle for one inserter fewer on the belt that wants the most.
    const most = targets.indexOf(Math.max(...targets));
    if (targets[most] <= 1) throw new LayoutError('no room for the inserters its belts need');
    targets[most]--;
  }
}

// The tiles of one machine period: `pitch` columns by the core's height.
class Period {
  constructor(pitch, height) {
    this.pitch = pitch;
    this.tiles = new Array(pitch * height);
  }

  get(c, y) {
    return c < 0 || c >= this.pitch ? undefined : this.tiles[y * this.pitch + c];
  }

  set(c, y, v) {
    this.tiles[y * this.pitch + c] = v;
  }

  lastColumn() {
    let last = -1;
    this.tiles.forEach((v, i) => { if (v) last = Math.max(last, i % this.pitch); });
    return last;
  }

  // [column, y] of the first tile matching.
  find(match) {
    const i = this.tiles.findIndex(v => v && match(v));
    return [i % this.pitch, Math.floor(i / this.pitch)];
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
function columnOrder(Wm, mode) {
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

// One connection per used fluid box, as the variant picks it (by default the one on the face
// with fewest belts, so its pipe crosses fewest), plus every connection the recipe leaves unused.
function pickConnections(sb, building, fluids, rotation, variant) {
  const boxesFor = role => building.fluidBoxes.filter(b => (role === 'input' ? b.production !== 'output' : b.production !== 'input'));
  const crowding = c => variant.belts.filter(b => (c.side === 'top' ? b.band === 'top' : c.side === 'bottom' && b.band !== 'top')).length;
  const picks = fluids.map((f, i) => {
    const box = boxesFor(f.role)[f.index];
    if (!box) throw new Error(`${sb.building} has no ${f.role} fluid box for ${f.fluid}`);
    const options = box.connections.map(c => placeConnection(c, rotation, building));
    const pick = variant.ports ? options[variant.ports[i] % options.length] : options.reduce((a, b) => (crowding(b) < crowding(a) ? b : a));
    return { ...pick, routeId: f.routeId, fluid: f.fluid };
  });
  const taken = new Set(picks.map(c => `${c.tileX},${c.tileY}`));
  const unused = building.fluidBoxes.flatMap(b => b.connections.map(c => placeConnection(c, rotation, building)))
    .filter(c => !taken.has(`${c.tileX},${c.tileY}`));
  return [...picks, ...unused];
}

function rotatedSize({ w, h }, rotation) {
  return rotation === 4 || rotation === 12 ? { w: h, h: w } : { w, h };
}

// Where a connection's pipe tile lies relative to the machine's top-left corner once rotated.
// Rotating clockwise by a quarter turn maps (x, y) to (-y, x).
function placeConnection(c, rotation, building) {
  let [x, y] = [c.x, c.y];
  for (let r = 0; r < rotation; r += 4) [x, y] = [-y, x];
  const dir = (c.direction + rotation) % 16;
  const size = rotatedSize(building.size, rotation);
  const [dx, dy] = VEC[dir];
  const tileX = Math.floor(size.w / 2 + x + dx);
  const tileY = Math.floor(size.h / 2 + y + dy);
  return { side: SIDE[dir], dir, tileX, tileY };
}
