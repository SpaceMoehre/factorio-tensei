import { wirePairs, circuitPairs } from './layout/wires.js';
import { clocksOf } from './clocks.js';

// Factorio 2.0.0 as the packed 64-bit version number blueprints carry.
const VERSION = 562949953421312;
// Wire connectors (defines.wire_connector_id): a pole's copper, and the red and green circuit
// wires of poles and inserters.
const POLE_COPPER = 5;
const CIRCUIT = { red: [1], green: [2], both: [1, 2] };

// Compound Block → Factorio blueprint: the importable string ("0" + base64(zlib(JSON)))
// and the JSON it encodes. Built in a City Block, it is the City Block's blueprint (`city`) with
// the Compound Block added: its entities, tiles, wires and grid snapping as they were, and
// copper wires joining the block's poles to its own. circuit: 'red', 'green' or 'both' wires
// every pole and inserter of the block onto one circuit network (circuitPairs); 'none' none.
// signals: an Inserter Clock's signal by its key (clocks.js): its inserters work while the signal
// is above 0; the others run freely. handSize: what an inserter moves a swing (its clocks count swings).
export async function encodeBlueprint(block, catalog, city = null, { circuit = 'none', signals = {}, handSize = 1 } = {}) {
  const kept = city?.entities ?? [];
  const clocks = Object.keys(signals).length ? clocksOf(block, catalog, handSize).of : new Map();
  const numberOf = new Map(kept.map((e, i) => [e.entity_number, i + 1]));
  const merges = mergers(block);
  const entities = [...block.entities, ...merges, ...markers(block, merges)].map((e, i) => {
    const out = { entity_number: kept.length + i + 1, name: e.name, position: { x: e.x + e.w / 2, y: e.y + e.h / 2 } };
    // An offshore pump stands in the middle of its south row (turned with it), facing its water.
    if (e.kind === 'building' && catalog.buildings?.[e.name]?.offshore) {
      const [dx, dy] = turned([0, 1], e.direction ?? 0);
      out.position = { x: out.position.x + dx, y: out.position.y + dy };
    }
    if (e.direction) out.direction = e.direction;
    // A mirrored machine (Factorio 2.0): its fluid connections flipped east to west.
    if (e.mirror) out.mirror = true;
    if (e.recipe && !catalog.buildings?.[e.name]?.offshore) out.recipe = e.recipe;
    const modules = e.kind === 'building' ? block.subBlocks[e.subBlock]?.modules ?? [] : [];
    if (modules.length) out.items = moduleRequests(modules);
    if (e.underground && e.kind === 'underground-belt') out.type = e.underground;
    // A Recipe Loop's splitter gives its feedback side priority; one sending a byproduct away
    // sends it (filter) to that side.
    if (e.priority) out.output_priority = e.priority;
    if (e.filter) out.filter = { name: e.filter };
    // An output inserter of a machine putting each product on a belt of its own (ADR 0066).
    if (e.filters) Object.assign(out, { use_filters: true, filters: e.filters.map((name, k) => ({ index: k + 1, name, quality: 'normal', comparator: '=' })) });
    // 90° inserters (Inserter_Config): vectors relative to the inserter, in world axes.
    if (e.vectors) {
      out.pickup_position = { ...e.vectors.pickup };
      out.drop_position = { ...e.vectors.drop };
    }
    const signal = signals[clocks.get(e)];
    if (signal) {
      out.control_behavior = {
        circuit_enabled: true,
        circuit_condition: { first_signal: { type: signal.type, name: signal.name }, comparator: '>', constant: 0 },
      };
    }
    if (e.kind === 'marker') Object.assign(out, { icon: e.icon, text: e.text, always_show: true, show_in_chart: true });
    return out;
  });
  const icons = block.subBlocks.slice(0, 4).map((sb, i) => ({
    signal: { type: sb.outputs?.find(o => o.name === sb.item)?.type === 'fluid' ? 'fluid' : 'item', name: sb.item },
    index: i + 1,
  }));
  // Wires between the block's poles, and on to the City Block's (indices past the block's
  // entities are its Fixtures).
  const fixtures = block.site?.fixtures ?? [];
  const numbered = i => (i < block.entities.length ? kept.length + i + 1 : numberOf.get(fixtures[i - block.entities.length].number));
  const colors = CIRCUIT[circuit] ?? [];
  const wires = [
    ...(city?.wires ?? []).map(([a, ca, b, cb]) => [numberOf.get(a), ca, numberOf.get(b), cb]),
    ...wirePairs(block.entities, catalog, city ? fixtures : []).map(([a, b]) => [numbered(a), POLE_COPPER, numbered(b), POLE_COPPER]),
    ...(colors.length ? circuitPairs(block.entities, catalog, city ? fixtures : []) : [])
      .flatMap(([a, b]) => colors.map(c => [numbered(a), c, numbered(b), c])),
  ];
  const waters = block.entities.flatMap(e => waterOf(e, catalog));
  const blueprint = {
    blueprint: {
      ...(city ?? {}),
      item: 'blueprint', label: city?.label ? `${city.label} · factory` : 'Factory block', icons,
      entities: [...kept.map((e, i) => ({ ...e, entity_number: i + 1 })), ...entities],
      ...(waters.length || city?.tiles ? { tiles: [...(city?.tiles ?? []), ...waters] } : {}),
      wires, version: city?.version ?? VERSION,
    },
  };
  const json = JSON.stringify(blueprint);
  return { string: '0' + await zlibBase64(json), json };
}

// An offshore pump's water: the tiles of its 3 x 3 but its own row (south facing north), turned
// with it.
function waterOf(e, catalog) {
  const tile = e.kind === 'building' && catalog.buildings?.[e.name]?.offshore?.tile;
  if (!tile) return [];
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  return [-1, 0, 1].flatMap(x => [-1, 0].map(y => {
    const [dx, dy] = turned([x, y], e.direction ?? 0);
    return { name: tile, position: { x: Math.floor(cx + dx), y: Math.floor(cy + dy) } };
  }));
}

// An offset from a north-facing entity's centre, the entity turned to `direction` (0, 4, 8, 12).
function turned([x, y], direction) {
  for (let d = 0; d < direction; d += 4) [x, y] = [-y, x];
  return [x + 0, y + 0];
}

// Item requests for a machine's modules: one per module type, each in its own slots of the
// module inventory (defines.inventory.crafter_modules = 4).
const MODULE_INVENTORY = 4;
function moduleRequests(modules) {
  let slot = 0;
  return modules.map(({ name, count }) => ({
    id: { name },
    items: { in_inventory: Array.from({ length: count }, () => ({ inventory: MODULE_INVENTORY, stack: slot++ })) },
  }));
}

// Display panels showing which item each train route carries, just outside the block: west of
// where a Side Input enters, east of where a Side Output leaves (further out if that tile is
// taken). They show the item's icon in the world and on the map.
function markers(block, merges = []) {
  const taken = new Set([...block.entities, ...merges, ...(block.site?.fixtures ?? [])].flatMap(e => [...Array(e.w * e.h).keys()].map(i => `${e.x + (i % e.w)},${e.y + Math.floor(i / e.w)}`)));
  const out = [];
  // In a City Block, only inside it (in its Buffer).
  const area = block.site?.area;
  const merged = new Set(merges.map(m => m.merge));
  // (Across the sides the train comes in and leaves by, ADR 0069 and 0114: the one whose edge
  // the route reaches, the first otherwise.)
  const ins = block.ins ?? [12], outs = block.outs ?? [block.out ?? 4];
  const STEP = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] };
  for (const route of block.routes ?? []) {
    const sides = route.source === 'side-input' ? ins : route.sink === 'side-output' ? outs : [];
    // A Fan-out's belts come in on its belts from the west edge, each with what it brings; a belt
    // to the train merged into another leaves on it (ADR 0052, ADR 0118).
    if (!sides.length || !route.pieces.length || route.fedBy !== undefined || (route.sink === 'side-output' && route.joins !== undefined)) continue;
    const ends = sides.map(d => {
      const [dx, dy] = STEP[d];
      return { d, dx, dy, end: route.pieces.reduce((best, p) => (p.x * dx + p.y * dy > best.x * dx + best.y * dy ? p : best)) };
    });
    const b = block.bounds;
    const { dx, dy, end } = ends.find(({ d, end: p }) => (b ? (d === 4 ? p.x === b.x + b.w - 1 : d === 12 ? p.x === b.x : d === 0 ? p.y === b.y : p.y === b.y + b.h - 1) : false)) ?? ends[0];
    let x = end.x + dx, y = end.y + dy;
    while (taken.has(`${x},${y}`)) [x, y] = [x + dx, y + dy];
    if (area && (x < area.x || x >= area.x + area.w || y < area.y || y >= area.y + area.h)) continue;
    taken.add(`${x},${y}`);
    const [first] = route.items;
    out.push({
      name: 'display-panel', kind: 'marker', x, y, w: 1, h: 1,
      icon: { type: route.kind === 'pipe' ? 'fluid' : 'item', name: first.item },
      // (A merged belt's items each on the belt coming in north and south of it.)
      text: (route.brings ?? leaving(block, route)).map((i, k) => `${merged.has(route.id) ? (k ? '↓ ' : '↑ ') : ''}${i.item} ${Math.round(i.rate)}/min`).join(merged.has(route.id) ? ' · ' : ' + '),
    });
  }
  return out;
}

// What a route carries, with what the belts to the train merged into it bring of their item.
function leaving(block, route) {
  const into = (block.routes ?? []).filter(r => r.sink === 'side-output' && r.joins === route.id);
  if (!into.length) return route.items;
  return route.items.map(i => ({ ...i, rate: i.rate + into.reduce((sum, r) => sum + (r.items.find(x => x.item === i.item)?.rate ?? 0), 0) }));
}

// Belt Merge built: a Side Input belt carrying two items, a lane each, starts a tile west of the
// block, nothing behind it, each item coming in on a belt of its own a row above and below and
// turning into it from the side (head-on), so it lands on that side's lane. Not where those tiles
// are taken, or another Side Input comes in beside it (its belt or pipe passes there), or in a
// City Block outside it.
function mergers(block) {
  const belt = block.entities.find(e => e.kind === 'belt')?.name;
  if (!belt) return [];
  const tiles = e => [...Array(e.w * e.h).keys()].map(i => `${e.x + (i % e.w)},${e.y + Math.floor(i / e.w)}`);
  const taken = new Set([...block.entities, ...(block.site?.fixtures ?? [])].flatMap(tiles));
  const area = block.site?.area;
  // The tiles beside the west edge Side Inputs come in through (or the edges, ADR 0114: a belt
  // coming in heading d, across the side opposite d).
  const inputs = (block.routes ?? []).filter(r => r.source === 'side-input' && r.fedBy === undefined && r.pieces.length);
  const STEP = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] };
  const b = block.bounds ?? (() => {
    const x = Math.min(...block.entities.map(e => e.x)), y = Math.min(...block.entities.map(e => e.y));
    return { x, y, w: Math.max(...block.entities.map(e => e.x + e.w)) - x, h: Math.max(...block.entities.map(e => e.y + e.h)) - y };
  })();
  const ins = block.ins ?? [12];
  // (Where a piece heading d stands on the edge it came in across.)
  const entersAt = (p, d) => ins.includes((d + 8) % 16) && (d === 4 ? p.x === b.x : d === 12 ? p.x === b.x + b.w - 1 : d === 8 ? p.y === b.y : p.y === b.y + b.h - 1);
  const entering = new Set(inputs.flatMap(r => r.pieces.flatMap(p => [0, 4, 8, 12].filter(d => entersAt(p, d)).map(d => `${p.x - STEP[d][0]},${p.y - STEP[d][1]}`))));
  const out = [];
  for (const r of inputs) {
    const [first] = r.pieces;
    const d = first.travel ?? first.direction;
    if (r.kind !== 'belt' || r.items.length !== 2 || r.loop || !['belt', 'underground-belt'].includes(first.kind) || !entersAt(first, d)) continue;
    // (Behind it, and either side of that: left, then right of its heading.)
    const [fx, fy] = STEP[d], [lx, ly] = STEP[(d + 12) % 16];
    const x = first.x - fx, y = first.y - fy;
    const spots = [[x + lx, y + ly], [x, y], [x - lx, y - ly]];
    if (spots.some(([u, v]) => taken.has(`${u},${v}`)) || entering.has(`${spots[0][0]},${spots[0][1]}`) || entering.has(`${spots[2][0]},${spots[2][1]}`)) continue;
    if (area && spots.some(([u, v]) => u < area.x || u >= area.x + area.w || v < area.y || v >= area.y + area.h)) continue;
    // (Facing in, the left side's lane is the first item's.)
    const piece = (/** @type {number[]} */ [u, v], dir) => ({ name: belt, kind: 'belt', x: u, y: v, w: 1, h: 1, direction: dir, merge: r.id });
    out.push(piece(spots[0], (d + 4) % 16), piece(spots[1], d), piece(spots[2], (d + 12) % 16));
    for (const [u, v] of spots) taken.add(`${u},${v}`);
  }
  return out;
}

async function zlibBase64(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
