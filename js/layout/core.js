import { N, E, S, W, VEC, key } from './grid.js';
import { inserterRate } from '../inserters.js';
import { pathFlow } from './flow.js';

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
// makes for it. Machines stand in rows (chains) of `rowLength`, stacked top to bottom; bands of
// belts lie above, between and below them. Band b lies above machine row b (band 0 on top, band
// R below the last of R rows); a band between two rows is shared: both rows reach its belts.
//   rotation   machine direction; flip turns every second row half round, so rows face
//   mirror     true: every machine mirrored (Factorio 2.0: its fluid connections and drop point
//              flipped east to west before it turns)
//   rowLength  machines per row (the last row takes the rest)
//   counts     machines per row, when the short row stands elsewhere (Two-Way Output)
//   middle     height of each band between two rows
//   belts      [{ routeIds, part, band, row, serves: [machine rows], load? }]: a belt row in a band, its
//              row counted from the machine row above (band 0: from row 0 upward). Belt rows of
//              one route with the same part are one belt, visited in turn; different parts are
//              separate belts from the train (or to it), each with its share of the item. Two
//              single-item Side Inputs may share the parts of one belt, one per lane (Belt Merge
//              judged per part: each must fit its lane for the machines that belt feeds).
//   pipes      [{ routeId, band, row }]: a band row kept for a fluid's pipe
//   gap        extra columns between neighbouring machines
//   columns    'center' | 'left' | 'right': which inserter columns are tried first
//   shift      columns every second row sits to the side (|shift| ≤ gap)
//   poleSlot   null or { band, row }: a tile per machine kept free for a pole (poleSlots: one
//              in each of several bands)
//   ports      for each fluid, which of its boxes' connections to use (index, wrapping; the
//              first when absent)
//   sides      [{ routeIds, part, face: 'W' | 'E', slot: 1 | 2, serves: [row] }]: a Side Belt,
//              running along the machine's west or east side `slot` tiles out, its inserters
//              (fast for slot 1, long-handed for slot 2) standing against the machine. Only with
//              one machine per row; the machines of a row stand apart to make room.
//   heads      [{ routeIds, part, face: 'W' | 'E', at, serves: [row] }]: a Head-on Belt, meeting
//              the machine's side square on at its row `at`: an input arrives from the west and
//              ends against the machine, an output starts against it and leaves east. 90°
//              inserters stand either side of its last (first) tile, long-handed ones beside the
//              next tile, so both lanes fill. Only with one machine per row.
// Every machine gets enough inserters for its share of each belt, from real swing rates; where
// fewer fit, the core records the shortfall (items/min its machines cannot get), which the
// search ranks below any layout that fits and Starvation reports.
// links: { inputs: [routeId], output: routeId | null, fluids: [{ routeId, fluid, role, boxes }] }, a
// fluid's boxes the indices of the building's fluid boxes it takes (fluidboxes.js)
// env: { routes, inserters: { short, long }, rightAngle, beltReach, pipeReach, laneCapacity, handSize }
export function buildCore(sb, building, links, variant, env) {
  const belts = variant.belts.map(b => ({ ...b, routeIds: b.routeIds ?? [b.routeId] }));
  const rowLength = Math.min(variant.rowLength ?? sb.count, sb.count);
  // Machines per row: rows of rowLength, the last taking the rest — or where the variant puts them.
  const counts = variant.counts ?? [...Array(Math.ceil(sb.count / rowLength)).keys()].map(r => Math.min(rowLength, sb.count - r * rowLength));
  if (counts.reduce((sum, c) => sum + c, 0) !== sb.count) throw new LayoutError('rows must hold every machine');
  const rowCount = counts.length;
  const widest = Math.max(...counts);
  const middle = rowCount > 1 ? variant.middle : 0;
  const rotationOf = r => (variant.flip && r % 2 ? (variant.rotation + 8) % 16 : variant.rotation);
  const machine_ = oriented(building, !!variant.mirror);
  const { w: Wm, h: Hm } = rotatedSize(building.size, variant.rotation);
  const pipes = variant.pipes ?? [];
  const connections = counts.map((_, r) => pickConnections(sb, machine_, links.fluids, rotationOf(r), variant));
  // Machines in a row standing against each other join a fluid's box where its connections let it
  // through both ways on their west and east sides, facing each other (Py's glassworks' Liquid
  // Fuel): the row takes that fluid by one connection, east of its last machine, and keeps no
  // column for it between them. Not where anything else stands between them.
  if (!variant.gap && !(variant.sides?.length || variant.heads?.length)) {
    const through = links.fluids.map((f, i) => {
      const pairs = counts.map((_, r) => throughPair(machine_, f.boxes ?? [], rotationOf(r)));
      return pairs.every(Boolean) ? i : -1;
    }).filter(i => i >= 0);
    const others = connections.some(list => list.some((c, i) => i < links.fluids.length && !through.includes(i) && (c.side === 'left' || c.side === 'right')));
    if (through.length && !others) {
      counts.forEach((_, r) => {
        const own = connections[r].slice(0, links.fluids.length).map((c, i) => {
          if (!through.includes(i)) return c;
          const pair = throughPair(machine_, links.fluids[i].boxes, rotationOf(r));
          return { ...pair.east, routeId: c.routeId, fluid: c.fluid, through: true };
        });
        // (The east one is used; the west one stays unused, kept clear of other pipes.)
        const pairTiles = new Set(through.map(i => {
          const { east } = throughPair(machine_, links.fluids[i].boxes, rotationOf(r));
          return `${east.tileX},${east.tileY}`;
        }));
        const taken = new Set(own.map(c => `${c.tileX},${c.tileY}`));
        connections[r] = [...own, ...connections[r].slice(links.fluids.length).filter(c => !pairTiles.has(`${c.tileX},${c.tileY}`) && !taken.has(`${c.tileX},${c.tileY}`))];
      });
    }
  }
  const ported = (r, side) => connections[r].some(c => c.routeId !== undefined && c.side === side && !c.through);
  const throughEnd = connections.some(list => list.some(c => c.through));
  // Output Drop: where each row's machines put their products themselves.
  const drops = counts.map((_, r) => dropOf(machine_, rotationOf(r)));

  // Faces: a row's top face looks into band r, its bottom face into band r + 1. A band row is
  // counted from the row above, so the row below sees it at depth middle + 1 - row.
  const depthIn = (band, row, r) => {
    if (band === r) return band === 0 ? row : middle + 1 - row;
    if (band === r + 1) return row;
    return null;
  };
  const allowed = d => d !== null && d >= (env.rightAngle ? 1 : 2) && d <= 4;

  // Side Belts and Head-on Belts beside single machines; their ids follow the band belts'.
  const lines = [
    ...(variant.sides ?? []).map(l => ({ ...l, kind: 'side', routeIds: l.routeIds ?? [l.routeId] })),
    ...(variant.heads ?? []).map(l => ({ ...l, kind: 'head', routeIds: l.routeIds ?? [l.routeId] })),
  ];
  if (lines.length && rowLength !== 1) throw new LayoutError('side belts need one machine per row');
  if (lines.some(l => l.kind === 'head') && !env.rightAngle) throw new LayoutError('head-on belts need 90° inserters');

  // Each machine row takes each route from exactly one belt row (or side or head-on belt).
  const access = [];
  const lineAccess = [];
  for (let r = 0; r < rowCount; r++) {
    for (const routeId of new Set([...belts, ...lines].flatMap(b => b.routeIds))) {
      const serving = [...belts, ...lines].filter(b => b.routeIds.includes(routeId) && b.serves.includes(r));
      // Two-Way Output: a row may drop its output onto a band belt on either side, half each.
      const twoWay = routeId === links.output && serving.length === 2 && serving.every(b => !b.kind) && serving[0].band !== serving[1].band;
      if (serving.length !== 1 && !twoWay) throw new LayoutError('a machine row needs exactly one belt for each route');
      for (const belt of serving) {
        if (belt.kind) {
          if (!lineAccess.some(a => a.r === r && a.line === belt)) lineAccess.push({ r, line: belt });
          continue;
        }
        if (access.some(a => a.r === r && a.belt === belt)) continue;
        const depth = depthIn(belt.band, belt.row, r);
        const side = belt.band === r ? 'top' : 'bottom';
        // An output belt past the machines' drop tiles takes their drops (no inserter needed).
        const drop = routeId === links.output && drops[r]?.side === side && drops[r].depth === depth;
        if (!allowed(depth) && !drop) throw new LayoutError(depth === 1 ? 'a belt against the machine needs 90° inserters' : 'a machine row cannot reach its belt');
        access.push({ r, belt, depth, side, share: 1 / serving.length, drop });
      }
    }
  }

  // An outer band reaches as far as its belts and pipes, its connections' pipes and its drop
  // tiles (kept clear of other belts even where no belt takes the drops).
  const outerHeight = band => {
    const r = band === 0 ? 0 : rowCount - 1;
    const side = band === 0 ? 'top' : 'bottom';
    const drop = drops[r]?.side === side ? drops[r].depth : 0;
    return Math.max(ported(r, side) ? 1 : 0, drop, ...[...belts, ...pipes].filter(b => b.band === band).map(b => b.row));
  };
  // Belts lie within inserter reach; outside the stack, pipe rows may lie further out.
  for (const [list, outer] of [[belts, 4], [pipes, 8]]) {
    for (const b of list) {
      const height = b.band === 0 || b.band === rowCount ? outer : middle;
      if (b.band < 0 || b.band > rowCount || b.row < 1 || b.row > height) throw new LayoutError('a belt row outside its band');
    }
  }
  if (rowCount > 1 && middle < 1) throw new LayoutError('rows need a band between them');
  // Pipes of two fluids side by side would join.
  if (pipes.some(p => pipes.some(q => q.band === p.band && q.row === p.row + 1 && q.routeId !== p.routeId))) {
    throw new LayoutError('pipe rows of two fluids touch');
  }
  const taken = new Set();
  for (const b of [...belts, ...pipes]) {
    const k = `${b.band},${b.row}`;
    if (taken.has(k)) throw new LayoutError('two belts in one band row');
    taken.add(k);
  }

  // Columns: every machine sits at the same offset in a period of `pitch` columns, with pads for
  // side connections and the gap after it.
  const anySide = side => counts.some((_, r) => ported(r, side));
  const leftPad = anySide('left') ? 1 : 0, rightPad = anySide('right') ? 1 : 0;
  // Side and Head-on Belts lie in a lead gap before the machine (its west side) and a trailing
  // gap after it (its east side): a column of inserters against the machine, then the belts.
  const gapWidth = face => {
    const list = lines.filter(l => l.face === face);
    if (!list.length) return 0;
    if (face === 'W' ? leftPad : rightPad) throw new LayoutError('side belts need the machine side free of fluid connections');
    const head = list.filter(l => l.kind === 'head');
    if (head.length && head.length < list.length) throw new LayoutError('a machine side takes side belts or a head-on belt, not both');
    return head.length ? 2 : 1 + Math.max(...list.map(l => l.slot));
  };
  const leadW = gapWidth('W'), trailW = gapWidth('E');
  // The machine's offset in its period.
  const mxOff = leadW + leftPad;
  const pitch = mxOff + Wm + rightPad + (trailW || variant.gap);
  // Every second row may sit a column or two to the side (within the gap), so the connections
  // of facing rows do not interleave.
  const shift = variant.shift ?? 0;
  if (shift && (widest < 2 || variant.gap < Math.abs(shift))) throw new LayoutError('rows shift only within the gap');
  const off = r => (r % 2 ? shift : 0) - Math.min(0, shift);

  const top = outerHeight(0);
  const machineY = counts.map((_, r) => top + r * (Hm + middle));
  const height = machineY[rowCount - 1] + Hm + outerHeight(rowCount);
  const bandY = (band, row) => (band === 0 ? top - row : machineY[band - 1] + Hm - 1 + row);
  const faceY = (r, side, k) => (side === 'top' ? machineY[r] - k : machineY[r] + Hm - 1 + k);

  // One period of the whole stack is laid out once and repeated for each machine. Its tiles hold
  // a connection, an inserter, a pole slot or a waypoint (a belt tile an inserter reaches).
  const period = new Period(pitch, height);
  for (let r = 0; r < rowCount; r++) {
    for (const c of connections[r]) {
      if (c.side !== 'top' && c.side !== 'bottom') continue;
      const [x, y] = [mxOff + off(r) + c.tileX, machineY[r] + c.tileY];
      // An unused connection takes no pipe; belts and inserters may still use its tile.
      if (c.routeId === undefined) {
        if (x >= 0 && x < pitch && !period.get(x, y)) period.set(x, y, { type: 'unused' });
        continue;
      }
      if (x < 0 || x >= pitch || (period.get(x, y) && period.get(x, y).type !== 'unused')) throw new LayoutError('fluid connections collide');
      period.set(x, y, { type: 'port', route: c.routeId });
    }
  }
  const slots = access.map(a => {
    const reach = REACH[a.depth];
    const spec = reach.long ? env.inserters.long : env.inserters.short;
    // A long-handed inserter reaches no further than it must (custom vectors): its belt `depth -
    // row` tiles out, the machine's first tile `row` tiles in.
    const short = reach.long && env.rightAngle && spec.customVectors ? { pickup: a.depth - reach.row, insert: reach.row } : null;
    const rate = inserterRate(spec, reach.turn, env.handSize, short);
    const isOutput = a.belt.routeIds.includes(links.output);
    const items = a.belt.routeIds.flatMap(id => routeItems(sb, env.routes[id], isOutput));
    // A Two-Way Output's belt row carries what the variant plans for its row (load), else an
    // equal share of the row's output.
    const load = a.belt.load?.[a.r];
    const demand = load !== undefined ? load / counts[a.r] : a.share * items.reduce((sum, i) => sum + i.rate, 0) / sb.count;
    return {
      ...a, spec, rate, short, free: env.rightAngle && spec.customVectors, isOutput, items, demand, id: belts.indexOf(a.belt),
      needed: a.drop ? 0 : Math.max(1, Math.ceil(demand / rate - 1e-9)), twin: false,
      insY: faceY(a.r, a.side, reach.row), beltY: faceY(a.r, a.side, a.depth), columns: [],
    };
  });
  // Output Drop: a row's machines drop onto the lane of their belt nearer them, whatever comes
  // down it before them. Where that lane may be full before a machine's turn (its row makes more
  // than it carries), 90° inserters support it, onto the other lane: enough that it gets its
  // output away even behind every other machine of its row. Two rows dropping onto one belt
  // from either side fill both its lanes, and leave no lane for inserters.
  for (const s of slots.filter(s => s.drop)) {
    const twin = access.some(a => a.drop && a.belt === s.belt && a.r !== s.r);
    const sure = Math.max(0, env.laneCapacity - (counts[s.r] - 1) * s.demand);
    s.twin = twin;
    if (env.rightAngle && !twin) s.needed = Math.ceil(Math.max(0, s.demand - sure) / s.rate - 1e-9);
  }
  // An output belt's drops pick their lanes (Drop Offset), but a lane fills by whole inserters:
  // enough of them that they split onto the two lanes carrying what the belt's rows make (all
  // the belt rows of its part) — one more per machine where it adds the most.
  if (env.rightAngle) {
    const outputs = belts.filter(b => b.routeIds.includes(links.output));
    for (const part of new Set(outputs.map(b => b.part))) {
      const mine = slots.filter(s => outputs.includes(s.belt) && s.belt.part === part);
      // Drops fill their lane themselves: their supporting inserters are counted above.
      if (mine.some(s => s.drop)) continue;
      const want = Math.min(2 * env.laneCapacity, mine.reduce((sum, s) => sum + s.demand * counts[s.r], 0));
      const carried = () => onTwoLanes(mine.flatMap(s => Array(counts[s.r] * s.needed).fill(s.rate)), env.laneCapacity);
      for (let more = 0; more < 2 * mine.length && carried() < want - 1e-9; more++) {
        const gain = mine.map(s => {
          s.needed++;
          const g = carried();
          s.needed--;
          return g;
        });
        const best = mine.reduce((m, s, i) => (gain[i] > gain[m] + 1e-9 || (Math.abs(gain[i] - gain[m]) <= 1e-9 && counts[s.r] < counts[mine[m].r]) ? i : m), 0);
        mine[best].needed++;
      }
    }
  }
  // Drop tiles: an output belt row past them has a waypoint there, so its belt surfaces on them;
  // any other is kept clear, so no other belt takes the drops (and no inserter stands there).
  for (let r = 0; r < rowCount; r++) {
    const d = drops[r];
    const c = d ? mxOff + off(r) + d.tileX : -1;
    if (c < 0 || c >= pitch) continue;
    const y = machineY[r] + d.tileY, here = period.get(c, y);
    const used = slots.find(s => s.drop && s.r === r);
    if (used) {
      if (here && here.type !== 'unused' && here.belt !== used.id) throw new LayoutError('a drop tile holds a fluid connection');
      period.set(c, y, { type: 'waypoint', belt: used.id, drop: true });
    } else if (!here || here.type === 'unused') period.set(c, y, { type: 'drop' });
  }
  const beltRows = belts.map((b, id) => ({ ...b, id, y: bandY(b.band, b.row) }));
  const pipeRows = pipes.map(p => ({ ...p, y: bandY(p.band, p.row) }));
  // Pipe rows meet the connections: beside a connection lying in a pipe row no inserter stands
  // (its own pipe carries on there, another fluid's dives round it), and a connection across the
  // band reaches its fluid's pipe row by a pipe-to-ground surfacing just before that row (a tap,
  // which belts dive under) with the pipe row free above it.
  const keep = (c, y) => { if (!period.get(c, y) || period.get(c, y).type === 'unused') period.set(c, y, { type: 'keep' }); };
  // Where a pipe row must surface (its own connections and the tiles where taps join it), both
  // neighbours in the row stay free, since a pipe-to-ground cannot surface there.
  const surfaceAt = (c, y, route) => {
    for (const n of [c - 1, c + 1]) {
      const v = period.get(n, y);
      if (v?.type === 'unused' || v?.type === 'drop' || (v?.type === 'port' && v.route !== route)) throw new LayoutError('a pipe row is cut');
      keep(n, y);
    }
  };
  for (let r = 0; r < rowCount; r++) {
    for (const c of connections[r]) {
      if (c.routeId === undefined || (c.side !== 'top' && c.side !== 'bottom')) continue;
      const [x, y] = [mxOff + off(r) + c.tileX, machineY[r] + c.tileY];
      const band = c.side === 'top' ? r : r + 1;
      for (const p of pipeRows.filter(p => p.band === band && p.y === y)) {
        if (p.routeId === c.routeId) surfaceAt(x, p.y, p.routeId);
        else { keep(x - 1, p.y); keep(x + 1, p.y); }
      }
      const own = pipeRows.find(p => p.routeId === c.routeId && p.band === band);
      if (!own || own.y === y) continue;
      const d = Math.sign(own.y - y);
      // Its pipe joins the row there: no other fluid's connection may lie on or beside that tile.
      if ([x - 1, x, x + 1].some(n => { const v = period.get(n, own.y); return v?.type === 'port' && v.route !== c.routeId; })
        || period.get(x, own.y)?.type === 'unused') {
        throw new LayoutError('a pipe cannot reach its row');
      }
      // The tile where it joins takes a plain pipe, like a connection on its own row.
      keep(x, own.y);
      if (period.get(x, own.y)?.type === 'keep') period.set(x, own.y, { type: 'keep', join: true, row: r });
      surfaceAt(x, own.y, c.routeId);
      if (own.y - d !== y) {
        if (period.get(x, own.y - d) && period.get(x, own.y - d).type !== 'unused') throw new LayoutError('a pipe cannot reach its row');
        period.set(x, own.y - d, { type: 'tap', row: r, route: c.routeId });
      }
    }
  }
  const kept = variant.poleSlots ?? (variant.poleSlot ? [variant.poleSlot] : []);
  if (kept.some(slot => slot.band > rowCount || slot.row > (slot.band === 0 || slot.band === rowCount ? outerHeight(slot.band) : middle))) {
    throw new LayoutError('pole slot outside its band');
  }
  const poleYs = new Map(kept.map(slot => [slot.band, bandY(slot.band, slot.row)]));
  // Bands do not share tiles, so each band's inserters are placed on their own.
  const machineColumns = columnOrder(Wm, variant.columns).map(c => c + mxOff);
  for (const s of slots) s.columns = machineColumns.map(c => c + off(s.r));
  const columns = new Map();
  for (let band = 0; band <= rowCount; band++) {
    const inBand = s => s.belt.band === band;
    const y = poleYs.get(band) ?? null;
    // Pipe rows must stay passable too: their pipes dive under the inserters standing in them.
    const passRows = [
      ...beltRows.filter(b => b.band === band).map(b => ({ y: b.y, reach: env.beltReach })),
      ...pipeRows.filter(p => p.band === band).map(p => ({ y: p.y, reach: env.pipeReach, route: p.routeId })),
    ];
    const placed = placeInserters(slots.filter(inBand), passRows, period, {
      pitch, cyclic: widest > 1, poleY: y, machineColumns,
    });
    for (const [s, c] of placed) columns.set(s, c);
  }
  const lineSlots = new Map(lineAccess.map(a => [a, placeLine(a)]));

  // Stamp the period onto every machine. The core is as wide as its last period's used columns.
  const lastColumn = Math.max(mxOff + Math.max(off(0), off(1)) + Wm + rightPad - 1 + (throughEnd ? 1 : 0), period.lastColumn());
  const width = (widest - 1) * pitch + lastColumn + 1;
  const entities = [];
  const stamped = new Map();
  const joins = [];
  const taps = [];
  const supply = new Map();
  // Drop tiles no belt takes: no belt may pass over them (the Module and the Compound Block
  // hold them too).
  const dropTiles = [];
  let shortfall = 0;
  // Each machine and its inserters carry its number (`machine`, in the order the machines stand
  // in the entities), and so does what its inserters move: a Fixture standing on one leaves it
  // out (place.js).
  // An inserter also carries what it moves, for its clock (clocks.js): into the machine, the
  // items of its belt, shared by the machine's inserters on that belt; out of it, the machine's
  // products, shared by all its output inserters (`sharing`).
  const moving = (isOutput, items, sharing) => ({ role: isOutput ? 'output' : 'input', moves: items.map(i => i.name), sharing });
  let machine = 0;
  for (let r = 0; r < rowCount; r++) {
    for (let i = 0; i < counts[r]; i++, machine++) {
      const x0 = i * pitch;
      // What this machine's inserters move per belt route (a Two-Way Output's two belts add up).
      const movedBy = new Map();
      // A machine with an Output Drop carries its drop point (relative to its corner).
      const d = drops[r];
      entities.push({ name: sb.building, kind: 'building', recipe: sb.recipe, x: x0 + mxOff + off(r), y: machineY[r], w: Wm, h: Hm, direction: rotationOf(r), row: r, machine, ...(variant.mirror && { mirror: true }), ...(d && { drop: d.point }) });
      const first = entities.length;
      // Its drop tile: a waypoint of the output belt past it, else kept clear.
      if (d) {
        const [x, y] = [x0 + mxOff + off(r) + d.tileX, machineY[r] + d.tileY];
        const used = slots.find(s => s.drop && s.r === r);
        if (used) stamped.set(key(x, y), { waypoint: used.id });
        else {
          dropTiles.push([x, y]);
          if (!stamped.has(key(x, y))) stamped.set(key(x, y), 'drop');
        }
      }
      for (const s of slots.filter(s => s.r === r)) {
        const placed = columns.get(s);
        // A machine's drop takes its share of the lane; supporting inserters move the rest, and
        // their clock counts only that (what the drop surely takes, items/s).
        const dropped = s.drop ? Math.min(s.demand, env.laneCapacity / counts[r]) : 0;
        const dropping = s.drop ? { dropping: Math.max(0, env.laneCapacity - (counts[r] - 1) * s.demand) / 60 } : {};
        for (const { column, side } of placed) {
          entities.push({ ...inserter(s, x0 + column, side), flow: (s.demand - dropped) / placed.length, machine, ...moving(s.isOutput, s.items, placed.length), ...dropping });
          stamped.set(key(x0 + column, s.insY), 'inserter');
          stamped.set(key(x0 + column + side, s.beltY), { waypoint: s.id });
        }
        const moved = placed.length * s.rate + dropped;
        // What a row's drops and their inserters cannot move is its belt's (see the parts).
        if (!s.drop) shortfall += Math.max(0, s.demand - moved);
        const supplyKey = s.belt.routeIds.join('+');
        if (!supply.has(supplyKey)) supply.set(supplyKey, { route: s.belt.routeIds[0], role: s.isOutput ? 'output' : 'input', items: s.items.map(i => i.name), perMachine: [], machines: [] });
        movedBy.set(supplyKey, (movedBy.get(supplyKey) ?? 0) + moved);
      }
      for (const [k, moved] of movedBy) {
        supply.get(k).perMachine.push(moved);
        supply.get(k).machines.push(machine);
      }
      for (const a of lineAccess.filter(a => a.r === r)) {
        const l = lineSlots.get(a);
        for (const ins of l.inserters) {
          entities.push({ ...ins.entity, x: x0 + ins.entity.x, flow: l.demand / l.inserters.length, machine, ...moving(l.isOutput, l.items, l.inserters.length) });
          stamped.set(key(x0 + ins.entity.x, ins.entity.y), 'inserter');
          stamped.set(key(x0 + ins.pick[0], ins.pick[1]), { waypoint: l.id });
        }
        for (const [x, y] of l.tiles) if (!stamped.has(key(x0 + x, y))) stamped.set(key(x0 + x, y), { line: l.id });
        const moved = l.inserters.reduce((sum, ins) => sum + ins.rate, 0);
        shortfall += Math.max(0, l.demand - moved);
        const supplyKey = a.line.routeIds.join('+');
        if (!supply.has(supplyKey)) supply.set(supplyKey, { route: a.line.routeIds[0], role: l.isOutput ? 'output' : 'input', items: l.items.map(i => i.name), perMachine: [], machines: [] });
        supply.get(supplyKey).perMachine.push(moved);
        supply.get(supplyKey).machines.push(machine);
      }
      const outputs = entities.slice(first).filter(e => e.role === 'output');
      for (const e of outputs) e.sharing = outputs.length;
      for (const [c, y] of period.all(v => v.type === 'tap' && v.row === r)) {
        stamped.set(key(x0 + c, y), 'tap');
        taps.push({ routeId: period.get(c, y).route, tile: [x0 + c, y] });
      }
      for (const [c, y] of period.all(v => v.join && v.row === r)) joins.push([x0 + c, y]);
      if (r === 0) for (const [c, y] of period.all(v => v.type === 'pole')) stamped.set(key(x0 + c, y), 'pole');
    }
  }

  const ports = [];
  const pipeBlocked = [];
  const surfacePorts = [];
  for (let r = 0; r < rowCount; r++) {
    for (let i = 0; i < counts[r]; i++) {
      for (const c of connections[r]) {
        const [x, y] = [i * pitch + mxOff + off(r) + c.tileX, machineY[r] + c.tileY];
        if (c.routeId === undefined) { pipeBlocked.push([x, y]); continue; }
        // (A row joined through its machines: only its last one's.)
        if (c.through && i < counts[r] - 1) continue;
        let port = ports.find(p => p.routeId === c.routeId);
        if (!port) ports.push(port = { routeId: c.routeId, fluid: c.fluid, tiles: [] });
        port.tiles.push([x, y, c.dir]);
        // On its own fluid's pipe row, the connection takes a plain pipe, so the row runs through.
        if (pipeRows.some(p => p.routeId === c.routeId && p.y === y)) surfacePorts.push([x, y]);
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
  // takes; the tiles its inserters reach are its waypoints. Pipe rows are held the same way.
  const held = y => [...Array(width).keys()].filter(x => {
    const v = stamped.get(key(x, y));
    return v !== 'inserter' && v !== 'port' && v !== 'pole' && v !== 'tap' && v !== 'drop';
  });
  const rowsOut = beltRows.map(b => ({
    routeIds: b.routeIds, part: b.part, y: b.y, reserve: held(b.y).map(x => [x, b.y]),
    waypoints: held(b.y).filter(x => stamped.get(key(x, b.y))?.waypoint === b.id).map(x => [x, b.y]),
  }));
  const pipeRowsOut = pipeRows.map(p => ({ routeId: p.routeId, y: p.y, reserve: held(p.y).map(x => [x, p.y]) }));
  // Side and Head-on Belts: their tiles held for them, the ones their inserters reach in order
  // along the belt (down a side belt, toward the machine or away from it along a head-on one).
  for (const a of lineAccess) {
    const l = lineSlots.get(a);
    const along = p => (l.axis === 'v' ? p[1] : p[0]);
    const waypoints = l.tiles.filter(([x, y]) => stamped.get(key(x, y))?.waypoint === l.id).sort((p, q) => along(p) - along(q));
    rowsOut.push({
      routeIds: a.line.routeIds, part: a.line.part, kind: a.line.kind, face: a.line.face, axis: l.axis,
      y: l.axis === 'h' ? l.tiles[0][1] : null, x: l.axis === 'v' ? l.tiles[0][0] : null, reserve: l.tiles, waypoints,
    });
  }

  // Each part of a route: the machine rows it serves and how many machines that is.
  const parts = [];
  for (const b of belts) {
    let part = parts.find(p => p.routeIds.join() === b.routeIds.join() && p.part === b.part);
    if (!part) parts.push(part = { routeIds: b.routeIds, part: b.part, rows: [], machines: 0, lanes: 2, output: b.routeIds.includes(links.output), dropped: false });
    // A row dropping its output on two belts gives each half its machines.
    for (const r of b.serves) {
      const share = access.find(a => a.r === r && a.belt === b)?.share ?? 1;
      if (share < 1) {
        if (!part.rows.includes(r)) part.rows.push(r);
        const load = b.load?.[r];
        part.machines += load !== undefined ? load / (routeItems(sb, env.routes[links.output], true).reduce((sum, i) => sum + i.rate, 0) / sb.count) : counts[r] * share;
      }
      else if (!part.rows.includes(r)) { part.rows.push(r); part.machines += counts[r]; }
    }
    // Straight inserters drop onto the lane farther from them: a belt between two rows gets both
    // lanes filled, a belt beside one row only one. With custom vectors every output drop
    // chooses its lane (Drop Offset).
    if (!(env.rightAngle && b.routeIds.includes(links.output)) && b.serves.length < 2) part.lanes = 1;
    // Output Drops fill the lane nearer their machines: one row's, its supporting inserters the
    // other; two rows' from either side both.
    const dropping = slots.filter(s => s.drop && s.belt === b);
    if (dropping.length) {
      part.dropped = true;
      part.lanes = dropping.some(s => s.twin || s.needed > 0) ? 2 : 1;
    }
  }
  // A Side Belt fills one lane (an output with custom vectors both); a Head-on Belt both, from
  // inserters either side of it. Nothing
  // feeds a head-on output from behind (the machine is there), and a head-on input ends against
  // the machine.
  for (const l of lines) {
    if (parts.some(p => p.routeIds.join() === l.routeIds.join() && p.part === l.part)) throw new LayoutError('a side belt shares its part');
    const rows = [...new Set(l.serves)];
    parts.push({
      routeIds: l.routeIds, part: l.part, rows, machines: rows.reduce((sum, r) => sum + counts[r], 0),
      lanes: l.kind === 'head' || (env.rightAngle && l.routeIds.includes(links.output)) ? 2 : 1,
      output: l.routeIds.includes(links.output),
      kind: l.kind, face: l.face, canEnter: !(l.kind === 'head' && l.face === 'E'), canExit: !(l.kind === 'head' && l.face === 'W'),
    });
  }
  // Every connection needs a way out for its pipe: a pipe row of its fluid in its band, a free
  // tile beside it, or a free tile straight out within a pipe-to-ground's reach.
  const beltTiles = new Set(rowsOut.flatMap(r => r.reserve.map(([x, y]) => key(x, y))));
  const free = (x, y) => {
    if (y < 0 || y >= height || x < 0 || x >= width) return true;
    const v = stamped.get(key(x, y));
    return !v && !beltTiles.has(key(x, y)) && !machineAt(x, y);
  };
  const bandOf = y => {
    if (y < top) return 0;
    const r = machineY.findIndex(my => y < my);
    return r < 0 ? rowCount : r;
  };
  for (const port of ports) {
    for (const [x, y, dir] of port.tiles) {
      if (dir !== N && dir !== S) continue;
      if (pipeRows.some(p => p.routeId === port.routeId && p.band === bandOf(y))) continue;
      const [, dy] = VEC[dir];
      const out = [...Array(env.pipeReach - 1).keys()].some(h => free(x, y + dy * (h + 2)));
      if (!out && !free(x - 1, y) && !free(x + 1, y) && !free(x, y + dy)) throw new LayoutError('a fluid connection has no way out');
    }
  }

  // What each part must carry beyond its belt's capacity (items/min): Starvation to come. An
  // Internal Path's output is judged by its Path Flow instead (design.js), from pathDrops.
  let overload = 0;
  const outRoute = links.output === null ? null : env.routes[links.output];
  const internal = outRoute !== null && typeof outRoute.source === 'number' && outRoute.consumers.length === 1 && outRoute.sink !== 'side-output';
  for (const part of parts) {
    for (const routeId of part.routeIds) {
      const route = env.routes[routeId];
      const items = routeItems(sb, route, routeId === links.output);
      if (routeId === links.output) {
        if (internal) continue;
        // A row's Output Drops put up to a lane on its belt, its supporting inserters up to a
        // lane more.
        if (part.dropped) {
          for (const s of slots.filter(s => s.drop && partOf(s.belt) === part)) {
            const made = counts[s.r] * s.demand, dropped = Math.min(made, env.laneCapacity);
            const supported = counts[s.r] * columns.get(s).length * s.rate;
            overload += made - dropped - Math.min(env.laneCapacity, supported, made - dropped);
          }
          continue;
        }
        // Output inserters fill the far lane, which the products share: one lane, or both where
        // rows on either side drop onto the belt or every drop picks its lane (Drop Offset).
        const load = items.reduce((sum, i) => sum + i.rate, 0) * part.machines / sb.count;
        overload += Math.max(0, load - route.items[0].capacity * part.lanes);
      } else {
        for (const i of items) {
          // Merged, each item has one lane. An Internal Path gets both lanes where its producer's
          // rows drop onto it from both sides; the simulation checks that it does.
          const lanes = typeof route.source === 'number' ? 2 : 1;
          const capacity = part.routeIds.length > 1 ? env.laneCapacity : lanes * route.items.find(x => x.item === i.name).capacity;
          overload += Math.max(0, i.rate * part.machines / sb.count - capacity);
        }
      }
    }
  }
  const poleSlots = [...stamped].filter(([, v]) => v === 'pole').map(([k]) => k.split(',').map(Number));
  return {
    w: width, h: height, entities, rows: rowsOut, pipeRows: pipeRowsOut, parts, ports, pipeBlocked, surfacePorts: [...surfacePorts, ...joins], taps, poleSlots,
    dropTiles, supply: [...supply.values()], shortfall, overload, pathDrops: internal ? { routeId: links.output, parts: pathDrops() } : null,
    // Output inserters at machines with an Output Drop: the fewer, the more the drops do.
    supporting: building.drop ? entities.filter(e => e.role === 'output').length : 0,
  };

  // An Internal Path's output parts, for its Path Flow: what each part makes at the plan's rate,
  // and per machine row (machines: how many) what its inserters together can put on the part's
  // lanes — on the far lane where a straight drop decides it (the rows either side of a band fill
  // different lanes), on either lane (free) where custom vectors let the module choose. A row's
  // Output Drops go on the near lane (the right lane of a belt above them running east, the left
  // of one below), up to a lane.
  function pathDrops() {
    const total = routeItems(sb, outRoute, true).reduce((sum, i) => sum + i.rate, 0);
    return parts.filter(p => p.routeIds.includes(links.output)).map(part => ({
      made: part.machines * total / sb.count,
      drops: [
        ...slots.filter(s => s.isOutput && partOf(s.belt) === part).map(s => {
          const moved = counts[s.r] * columns.get(s).length * s.rate;
          const row = { machine: s.r, machines: counts[s.r], left: 0, right: 0 };
          if (s.drop) return { ...row, [s.side === 'top' ? 'right' : 'left']: env.laneCapacity, free: moved };
          if (s.free) return { ...row, free: moved };
          return s.side === 'top' ? { ...row, left: moved } : { ...row, right: moved };
        }),
        ...lineAccess.filter(a => partOf(a.line) === part).map(a => {
          const { inserters } = lineSlots.get(a);
          const lane = side => counts[a.r] * inserters.filter(i => (i.side ?? -1) === side).reduce((sum, i) => sum + i.rate, 0);
          const row = { machine: a.r, machines: counts[a.r], left: 0, right: 0 };
          return env.rightAngle ? { ...row, free: lane(-1) + lane(1) } : { ...row, left: lane(-1), right: lane(1) };
        }),
      ],
    }));
  }

  function partOf(belt) {
    return parts.find(p => p.routeIds.join() === belt.routeIds.join() && p.part === belt.part);
  }

  // A Side or Head-on Belt for one machine row, in period coordinates: its tiles, and the
  // inserters it needs for the machine's share (fewest first: fast before long-handed).
  function placeLine({ r, line }) {
    const id = belts.length + lines.indexOf(line);
    const isOutput = line.routeIds.includes(links.output);
    const items = line.routeIds.flatMap(routeId => routeItems(sb, env.routes[routeId], isOutput));
    const demand = items.reduce((sum, i) => sum + i.rate, 0) / sb.count;
    const y0 = machineY[r];
    const free = (c, y) => !period.get(c, y) || period.get(c, y).type === 'unused';
    const claim = (c, y, v) => {
      if (!free(c, y)) throw new LayoutError('a side belt collides');
      period.set(c, y, v);
    };
    // The inserter column against the machine, and the way out from it.
    const A = mxOff + Wm + rightPad, B = mxOff - 1;
    const [column, out] = line.face === 'E' ? [A, 1] : [B, -1];
    const inserters = [];
    const tiles = [];
    const add = (x, y, spec, angle, lengths, entity) => {
      claim(x, y, { type: 'inserter' });
      const rate = inserterRate(spec, angle, env.handSize, lengths);
      inserters.push({ rate, entity: { name: spec.name, kind: 'inserter', x, y, w: 1, h: 1, ...entity, rate } });
    };
    // Enough inserters to move the machine's share. An output's each drop onto a lane of their
    // choosing (Drop Offset; a Head-on Belt's always): whole inserters onto the two lanes.
    const fits = () => {
      const rates = inserters.map(i => i.rate);
      if (isOutput && env.rightAngle) return onTwoLanes(rates, env.laneCapacity) >= demand - 1e-9;
      return rates.reduce((sum, r) => sum + r, 0) >= demand - 1e-9;
    };
    const length = v => Math.hypot(v.x, v.y);
    if (line.kind === 'side') {
      const x = column + out * line.slot;
      for (let k = 0; k < Hm; k++) {
        claim(x, y0 + k, { type: 'line', id });
        tiles.push([x, y0 + k]);
      }
      const spec = line.slot === 1 ? env.inserters.short : env.inserters.long;
      // A straight inserter's direction is the side it picks up from.
      const toward = line.face === 'E' ? W : E, away = line.face === 'E' ? E : W;
      // From the middle of the side outward, so the belt's waypoints stay together.
      const order = [...Array(Hm).keys()].sort((a, b) => Math.abs(a - (Hm - 1) / 2) - Math.abs(b - (Hm - 1) / 2) || a - b);
      for (const k of order) {
        if (fits()) break;
        if (!free(column, y0 + k)) continue;
        // A long-handed one reaches the machine against it, no further (custom vectors).
        const near = line.slot === 2 && env.rightAngle && spec.customVectors;
        const vectors = near && (isOutput
          ? { pickup: { x: -out, y: 0 }, drop: { x: out * 2.2, y: 0 } }
          : { pickup: { x: out * 2, y: 0 }, drop: { x: -out, y: 0 } });
        add(column, y0 + k, spec, 180, near ? { pickup: 2, insert: 1 } : null, { direction: isOutput ? toward : away, ...(near ? { vectors } : {}) });
        inserters.at(-1).pick = [x, y0 + k];
      }
      if (!inserters.length) throw new LayoutError('no room for a side belt\'s inserters');
      return { id, axis: 'v', tiles, inserters, demand, isOutput, items };
    }
    // Head-on: an output leaves east, an input arrives from the west.
    if ((line.face === 'E') !== isOutput) throw new LayoutError('head-on belts carry outputs east and inputs from the west');
    if (line.at < 1 || line.at > Hm - 2) throw new LayoutError('a head-on belt needs a machine row either side');
    const y = y0 + line.at;
    for (const k of [0, 1]) {
      claim(column + out * k, y, { type: 'line', id });
      tiles.push([column + out * k, y]);
    }
    const { short, long } = env.inserters;
    // 90°: the fast ones against the machine take from (or drop onto) the belt's end tile beside
    // them; the long-handed ones behind them reach the machine two tiles away and the belt tile
    // beside them (Inserter_Config custom vectors).
    const options = [
      { spec: short, dx: 0, dy: -1 }, { spec: short, dx: 0, dy: 1 },
      { spec: long, dx: out, dy: -1 }, { spec: long, dx: out, dy: 1 },
    ];
    for (const { spec, dx, dy } of options) {
      if (fits()) break;
      const [ix, iy] = [column + dx, y + dy];
      if (!free(ix, iy)) continue;
      // The machine lies 1 (fast) or 2 (long-handed) tiles away, toward it from the belt side.
      const fromMachine = { x: -out * (Math.abs(dx) + 1), y: 0 };
      const toMachine = { x: -out * length(spec.insert), y: 0 };
      const belt = isOutput ? { x: 0, y: -dy * length(short.insert) } : { x: 0, y: -dy };
      const vectors = isOutput ? { pickup: fromMachine, drop: belt } : { pickup: belt, drop: toMachine };
      const lengths = { pickup: length(vectors.pickup), insert: length(vectors.drop) };
      add(ix, iy, spec, 90, lengths, { direction: isOutput ? (line.face === 'E' ? W : E) : dy < 0 ? S : N, vectors });
      inserters.at(-1).pick = [column + dx, y];
      inserters.at(-1).side = dy;
    }
    return { id, axis: 'h', tiles, inserters, demand, isOutput, items };
  }

  function inserter(s, x, side) {
    const toward = s.side === 'top' ? S : N;
    const away = s.side === 'top' ? N : S;
    // A straight inserter's direction is the side it picks up from.
    const e = { name: s.spec.name, kind: 'inserter', x, y: s.insY, w: 1, h: 1, direction: s.isOutput ? toward : away, rate: s.rate };
    if (s.depth === 1) {
      // 90°: the belt beside it, the machine in front of it (vectors relative to the inserter).
      const length = v => Math.hypot(v.x, v.y);
      const [tx, ty] = VEC[toward];
      const pick = length(s.spec.pickup), drop = length(s.spec.insert);
      e.vectors = s.isOutput
        ? { pickup: { x: tx * pick, y: ty * pick }, drop: { x: side * drop, y: 0 } }
        : { pickup: { x: side * pick, y: 0 }, drop: { x: tx * drop, y: ty * drop } };
    } else if (s.short || (s.isOutput && s.free)) {
      const [tx, ty] = VEC[toward], [ax, ay] = VEC[away];
      const [machine, belt] = s.short ? [s.short.insert, s.short.pickup] : [s.depth - 1, 1];
      // An output drops on the belt's middle: the module picks its lane (module.js chooseLanes),
      // so one row of machines fills both lanes.
      e.vectors = s.isOutput
        ? { pickup: { x: tx * machine, y: ty * machine }, drop: { x: ax * belt, y: ay * belt } }
        : { pickup: { x: ax * belt, y: ay * belt }, drop: { x: tx * machine, y: ty * machine } };
    }
    return e;
  }
}

// What whole inserters (their rates) put on a belt's two lanes at most, each dropping onto the
// lane of its choosing and each lane holding `lane`: the fastest first, each onto the emptier one.
function onTwoLanes(rates, lane) {
  const sums = [0, 0];
  for (const r of [...rates].sort((a, b) => b - a)) sums[sums[0] <= sums[1] ? 0 : 1] += r;
  return Math.min(lane, sums[0]) + Math.min(lane, sums[1]);
}

// Chooses inserter columns for one machine period by depth-first search. Every inserter stands
// in front of its machine on a free tile of its row and reaches a tile of its own belt that no
// inserter or connection takes: 90° inserters sideways within the period, the others straight
// out. Every belt row must stay passable: no run of blocked tiles longer than a tunnel spans,
// and no lone belt tile boxed in between blocked ones (it would have to surface and dive at
// once). When the machines' whole demand does not fit, it settles for fewer inserters on the
// belt that wants the most, down to one per belt.
// passRows: [{ y, reach, route? }], the band's belt and pipe rows and how far their tunnels
// reach; a pipe row surfaces on its own fluid's connections.
// The same band comes up in many of a Sub-Block's variants: its outcome is kept (by everything
// the search reads: the slots, the rows it passes and what their tiles hold) and replayed.
const placedBefore = new Map();
function placeInserters(slots, passRows, period, options) {
  const { pitch, cyclic, poleY, machineColumns } = options;
  const rows = [...new Set([...slots.flatMap(s => [s.insY, s.beltY]), ...passRows.map(p => p.y), ...(poleY === null ? [] : [poleY])])].sort((a, b) => a - b);
  const y0 = rows[0] ?? 0;
  const tile = v => (v === undefined ? '' : `${v.type}:${v.route ?? ''}:${v.belt ?? ''}`);
  const band = JSON.stringify([pitch, cyclic, poleY === null ? null : poleY - y0, machineColumns,
    slots.map(s => [s.depth, s.insY - y0, s.beltY - y0, s.columns, s.needed, s.id]),
    passRows.map(p => [p.y - y0, p.reach, p.route]),
    rows.map(y => [y - y0, ...Array.from({ length: pitch }, (_, c) => tile(period.get(c, y)))])]);
  // Row-2 inserters first (the row-1 belt has to dive under them), then nearest belts first.
  const sorted = [...slots].sort((a, b) => REACH[b.depth].row - REACH[a.depth].row || a.depth - b.depth);
  let known = placedBefore.get(band);
  if (!known) {
    try {
      const chosen = searchInserters(sorted, passRows, period, options);
      const pole = poleY === null ? null : [...Array(pitch).keys()].find(c => period.get(c, poleY)?.type === 'pole');
      known = { pole, chosen: sorted.map(s => chosen.get(s).map(({ column, side, index }) => ({ column, side, index }))) };
    } catch (e) {
      if (!(e instanceof LayoutError)) throw e;
      known = { error: e.message };
    }
    if (placedBefore.size > 20000) placedBefore.clear();
    placedBefore.set(band, known);
    if (known.error) throw new LayoutError(known.error);
    return new Map(sorted.map((s, i) => [s, known.chosen[i]]));
  }
  if (known.error) throw new LayoutError(known.error);
  if (known.pole !== null) period.set(known.pole, poleY, { type: 'pole' });
  sorted.forEach((s, i) => {
    for (const { column, side } of known.chosen[i]) {
      period.set(column, s.insY, { type: 'inserter' });
      period.set(column + side, s.beltY, { type: 'waypoint', belt: s.id });
    }
  });
  return new Map(sorted.map((s, i) => [s, known.chosen[i].map(c => ({ ...c }))]));
}

// placeInserters' search: the slots in the order they are placed (row-2 inserters first, then
// nearest belts first).
function searchInserters(sorted, passRows, period, { pitch, cyclic, poleY, machineColumns }) {
  const at = (c, y) => period.get(c, y);
  const put = (c, y, v) => period.set(c, y, v);
  const pipeOf = new Map(passRows.filter(p => p.route !== undefined).map(p => [p.y, p.route]));
  const blocked = (c, y) => {
    if (!cyclic && (c < 0 || c >= pitch)) return false;
    const v = at(((c % pitch) + pitch) % pitch, y);
    if (v?.type === 'port' && v.route === pipeOf.get(y)) return false;
    // A pipe dives under an unused connection; a belt passes over it.
    if (v?.type === 'unused') return pipeOf.has(y);
    return v !== undefined && v.type !== 'waypoint' && v.type !== 'keep';
  };
  const taken = (c, y) => at(c, y) !== undefined && at(c, y).type !== 'unused';
  if (poleY !== null) {
    const all = [...machineColumns, ...[...Array(pitch).keys()].filter(c => !machineColumns.includes(c))];
    const c = all.find(c => !taken(c, poleY));
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
  const passable = ({ y, reach }) => {
    const longest = longestRun(y);
    if (longest >= reach || (cyclic && longest >= pitch)) return false;
    for (let c = 0; c < pitch; c++) if (!blocked(c, y) && blocked(c - 1, y) && blocked(c + 1, y)) return false;
    return true;
  };
  const reachOf = new Map(passRows.map(p => [p.y, p.reach]));
  const stillOpen = y => !reachOf.has(y) || (longestRun(y) < reachOf.get(y) && !(cyclic && longestRun(y) >= pitch));

  const targets = sorted.map(s => s.needed);
  // No more inserters than a row has free columns: trim the busiest belts on an overfull row
  // first, so the search below starts from what can fit.
  for (const y of new Set(sorted.map(s => s.insY))) {
    const onRow = sorted.map((s, i) => i).filter(i => sorted[i].insY === y);
    const free = new Set(onRow.flatMap(i => sorted[i].columns).filter(c => !taken(c, y))).size;
    let total = onRow.reduce((sum, i) => sum + targets[i], 0);
    while (total > free) {
      const most = onRow.reduce((m, i) => (targets[i] > targets[m] ? i : m), onRow[0]);
      if (targets[most] <= 1) break;
      targets[most]--;
      total--;
    }
  }
  // A row's inserters are all placed once the last belt standing them in it has its own: that row
  // must be passable then, before the search goes on to other rows.
  const lastOn = new Map(sorted.map((s, i) => [s.insY, i]));
  const rowsDone = si => passRows.every(p => lastOn.get(p.y) !== si || passable(p));
  // A row's inserters each take a free tile of it, and a 90° inserter's belt tile beside it is
  // one more (two of them sharing one would leave a lone belt tile between them): targets that
  // need more tiles than a row has cannot fit, and are not searched.
  const freeIn = new Map([...new Set(sorted.map(s => s.insY))].map(y => [y, [...Array(pitch).keys()].filter(c => !taken(c, y)).length]));
  const tilesSuffice = () => [...freeIn].every(([y, free]) => sorted.reduce((sum, s, i) => sum + (s.insY === y ? targets[i] * (s.depth === 1 ? 2 : 1) : 0), 0) <= free);
  // Once the whole demand has failed to fit, each smaller try gets a shorter search.
  let limit = SEARCH_NODES;
  for (;;) {
    let nodes = 0;
    const chosen = sorted.map(() => []);
    const place = (si, n) => {
      if (++nodes > limit) return false;
      if (si === sorted.length) return passRows.every(passable);
      if (n === targets[si]) return rowsDone(si) && place(si + 1, 0);
      const s = sorted[si];
      const mine = chosen[si];
      // A belt's inserters are chosen in column order, so no set is tried twice.
      for (let ci = n ? mine.at(-1).index + 1 : 0; ci < s.columns.length; ci++) {
        const column = s.columns[ci];
        if (taken(column, s.insY)) continue;
        for (const side of s.depth === 1 ? [-1, 1] : [0]) {
          const pick = column + side;
          if (pick < 0 || pick >= pitch) continue;
          const there = at(pick, s.beltY);
          if (there && there.type !== 'unused' && !(there.type === 'waypoint' && there.belt === s.id)) continue;
          put(column, s.insY, { type: 'inserter' });
          put(pick, s.beltY, { type: 'waypoint', belt: s.id });
          mine.push({ column, side, index: ci });
          if (stillOpen(s.insY) && place(si, n + 1)) return true;
          mine.pop();
          put(column, s.insY, undefined);
          put(pick, s.beltY, there);
        }
      }
      return false;
    };
    if (tilesSuffice() && place(0, 0)) return new Map(sorted.map((s, i) => [s, chosen[i]]));
    // Settle for one inserter fewer on the belt that wants the most.
    const most = targets.indexOf(Math.max(...targets));
    if (most < 0 || targets[most] <= 1) throw new LayoutError('no room for the inserters its belts need');
    targets[most]--;
    limit = SEARCH_NODES / 5;
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

  // [column, y] of every tile matching.
  all(match) {
    const out = [];
    this.tiles.forEach((v, i) => { if (v && match(v)) out.push([i % this.pitch, Math.floor(i / this.pitch)]); });
    return out;
  }

  // [column, y] of the first tile matching.
  find(match) {
    const i = this.tiles.findIndex(v => v && match(v));
    return [i % this.pitch, Math.floor(i / this.pitch)];
  }
}

// What a Sub-Block takes from (or puts on) a belt route: the route's items it consumes, or its
// solid products.
export function routeItems(sb, route, isOutput) {
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

// One connection per fluid among its boxes', as the variant picks it (by default the first), plus
// every connection left unused.
function pickConnections(sb, building, fluids, rotation, variant) {
  const picks = fluids.map((f, i) => {
    const options = (f.boxes ?? []).flatMap(b => building.fluidBoxes[b].connections).map(c => placeConnection(c, rotation, building));
    if (!options.length) throw new Error(`${sb.building} has no ${f.role} fluid box for ${f.fluid}`);
    return { ...options[(variant.ports?.[i] ?? 0) % options.length], routeId: f.routeId, fluid: f.fluid };
  });
  const taken = new Set(picks.map(c => `${c.tileX},${c.tileY}`));
  const unused = building.fluidBoxes.flatMap(b => b.connections.map(c => placeConnection(c, rotation, building)))
    .filter(c => !taken.has(`${c.tileX},${c.tileY}`));
  return [...picks, ...unused];
}

// A fluid's connections letting it through both ways on a machine's west and east sides, facing
// each other in a row of machines against each other ({ west, east }), or null.
function throughPair(building, boxes, rotation) {
  for (const b of boxes) {
    const placed = building.fluidBoxes[b].connections.filter(c => c.through).map(c => placeConnection(c, rotation, building));
    const { w } = rotatedSize(building.size, rotation);
    const east = placed.find(c => c.side === 'right' && c.tileX === w);
    const west = east && placed.find(c => c.side === 'left' && c.tileX === -1 && c.tileY === east.tileY);
    if (west) return { west, east };
  }
  return null;
}

// A building mirrored (Factorio 2.0): its fluid connections and drop point flipped east to west,
// as it stands facing north. Kept, so each building is mirrored once.
const mirrors = new WeakMap();
export function oriented(building, mirror) {
  if (!mirror) return building;
  if (!mirrors.has(building)) {
    mirrors.set(building, {
      ...building,
      fluidBoxes: building.fluidBoxes.map(b => ({ ...b, connections: b.connections.map(c => ({ ...c, x: -c.x, direction: (16 - c.direction) % 16 })) })),
      ...(building.drop && { drop: { x: -building.drop.x, y: building.drop.y } }),
    });
  }
  return mirrors.get(building);
}

// Where a machine standing so has its fluid connections (box by box) and its drop: two ways it
// stands alike lay out alike.
export function orientationKey(building, rotation) {
  const { w, h } = rotatedSize(building.size, rotation);
  const boxes = building.fluidBoxes.map(b => b.connections.map(c => placeConnection(c, rotation, building)).map(c => `${c.tileX},${c.tileY},${c.dir}`).sort().join(';'));
  const d = dropOf(building, rotation);
  return `${w}x${h}|${boxes.join('|')}|${d ? `${d.tileX},${d.tileY}` : ''}`;
}

// The side each fluid's connection faces for a rotation, before the search picks among several.
export function fluidSides(sb, building, fluids, rotation) {
  const picks = pickConnections(sb, building, fluids, rotation, {});
  return new Map(fluids.map((f, i) => [f.routeId, picks[i].side]));
}

function rotatedSize({ w, h }, rotation) {
  return rotation === 4 || rotation === 12 ? { w: h, h: w } : { w, h };
}

// Output Drop: where a machine puts its products itself once rotated — the tile beside it its
// drop point lies on (relative to its top-left corner), the face that tile lies against and how
// many tiles out, and the point itself. Null for a machine without one.
export function dropOf(building, rotation) {
  if (!building.drop) return null;
  let { x, y } = building.drop;
  for (let r = 0; r < rotation; r += 4) [x, y] = [-y, x];
  const { w, h } = rotatedSize(building.size, rotation);
  const point = { x: w / 2 + x, y: h / 2 + y };
  const tileX = Math.floor(point.x), tileY = Math.floor(point.y);
  const side = tileY < 0 ? 'top' : tileY >= h ? 'bottom' : tileX < 0 ? 'left' : tileX >= w ? 'right' : null;
  if (!side) return null;
  const depth = { top: -tileY, bottom: tileY - h + 1, left: -tileX, right: tileX - w + 1 }[side];
  return { side, depth, tileX, tileY, point };
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
