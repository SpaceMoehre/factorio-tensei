// City Block (CONTEXT.md): the area a Compound Block is built in, read from the blueprint of a
// city block or given as a size. The blueprint's entities — poles, roboports, radars, lamps,
// rails… — are Fixtures: they stay where they are, the layout is built around them and their
// poles power it. A Buffer inside the border stays free for the belts to and from the train:
// the Side Input enters on the inner west edge, the Side Output leaves on the inner east edge.

// Tile footprints of entities a city block holds that the catalog does not list (vanilla
// Factorio 2.0 and Space Age), as width × height facing north. A catalog built from the game's
// data dump lists every entity's (`footprints`).
const FOOTPRINTS = {
  roboport: [4, 4], radar: [3, 3], 'small-lamp': [1, 1], 'stone-wall': [1, 1], gate: [1, 1],
  'straight-rail': [2, 2], 'half-diagonal-rail': [4, 4], 'curved-rail-a': [4, 6], 'curved-rail-b': [4, 6],
  'legacy-straight-rail': [2, 2], 'legacy-curved-rail': [4, 8], 'rail-ramp': [4, 16], 'rail-support': [4, 4],
  'rail-signal': [1, 1], 'rail-chain-signal': [1, 1], 'train-stop': [2, 2],
  locomotive: [2, 6], 'cargo-wagon': [2, 6], 'fluid-wagon': [2, 6], 'artillery-wagon': [2, 6],
  accumulator: [2, 2], 'solar-panel': [3, 3], 'steam-engine': [3, 5], boiler: [3, 2], 'steam-turbine': [3, 5],
  'nuclear-reactor': [5, 5], 'heat-exchanger': [3, 2], 'heat-pipe': [1, 1], 'offshore-pump': [1, 2], pump: [1, 2],
  'storage-tank': [3, 3], beacon: [3, 3], lab: [3, 3], 'rocket-silo': [9, 9],
  'wooden-chest': [1, 1], 'iron-chest': [1, 1], 'steel-chest': [1, 1], 'passive-provider-chest': [1, 1],
  'active-provider-chest': [1, 1], 'storage-chest': [1, 1], 'buffer-chest': [1, 1], 'requester-chest': [1, 1],
  'constant-combinator': [1, 1], 'arithmetic-combinator': [1, 2], 'decider-combinator': [1, 2],
  'selector-combinator': [1, 2], 'power-switch': [2, 2], 'programmable-speaker': [1, 1], 'display-panel': [1, 1],
  'gun-turret': [2, 2], 'laser-turret': [2, 2], 'flamethrower-turret': [2, 3], 'artillery-turret': [3, 3],
  'electric-mining-drill': [3, 3], 'burner-mining-drill': [2, 2], pumpjack: [3, 3], 'land-mine': [1, 1],
  splitter: [2, 1], 'fast-splitter': [2, 1], 'express-splitter': [2, 1], 'turbo-splitter': [2, 1],
  'lightning-rod': [1, 1], 'lightning-collector': [2, 2], 'agricultural-tower': [3, 3], 'heating-tower': [3, 3],
};

// Directions of Factorio 2.0 (16 of them) and of 1.x blueprints (8).
const VERSION_2 = 2 ** 49;

// A blueprint string ("0" + base64(zlib(JSON))) or its JSON → the blueprint in it (of a book,
// the one it shows, else its first).
export async function decodeBlueprint(text) {
  const s = text.trim();
  let json;
  if (s.startsWith('{')) json = JSON.parse(s);
  else {
    if (s[0] !== '0') throw new Error('not a blueprint string (it starts with 0)');
    let bytes;
    try {
      bytes = Uint8Array.from(atob(s.slice(1).replace(/\s+/g, '')), c => c.charCodeAt(0));
    } catch {
      throw new Error('not a blueprint string (it is not base64)');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    try {
      json = JSON.parse(await new Response(stream).text());
    } catch {
      throw new Error('not a blueprint string (it does not unpack)');
    }
  }
  const blueprint = pick(json);
  if (!blueprint) throw new Error('it holds no blueprint');
  return blueprint;
}

function pick(node) {
  if (node?.blueprint) return node.blueprint;
  const book = node?.blueprint_book;
  if (!book) return null;
  const list = book.blueprints ?? [];
  const shown = list.find(b => b.index === book.active_index);
  for (const entry of [shown, ...list]) {
    const found = entry && pick(entry);
    if (found) return found;
  }
  return null;
}

// A blueprint → the City Block: its area (the blueprint's snap grid when it has one and
// everything lies on it, or straddles its border, else the extent of its entities and tiles), its
// Fixtures (each entity as the tiles it covers) and the entities whose footprint is unknown (taken
// as one tile).
export function readCityBlock(blueprint, catalog) {
  if ((blueprint.version ?? VERSION_2) < VERSION_2) throw new Error('the blueprint is from Factorio 1.x: import it in 2.0 and export it again');
  const unknown = new Set();
  const fixtures = [];
  for (const e of blueprint.entities ?? []) {
    let size = footprintOf(e.name, catalog);
    if (size === null) continue;
    if (!size) {
      unknown.add(e.name);
      size = { w: 1, h: 1 };
    }
    // Rolling stock turns by orientation (0 north, 0.25 east), everything else by direction.
    const turned = e.orientation !== undefined ? Math.round(e.orientation * 4) % 2 === 1 : e.direction === 4 || e.direction === 12;
    const w = turned ? size.h : size.w, h = turned ? size.w : size.h;
    fixtures.push({
      name: e.name, kind: 'fixture', number: e.entity_number,
      x: Math.round(e.position.x - w / 2), y: Math.round(e.position.y - h / 2), w, h,
    });
  }
  const tiles = (blueprint.tiles ?? []).map(t => ({ x: Math.floor(t.position.x), y: Math.floor(t.position.y), w: 1, h: 1 }));
  const all = [...fixtures, ...tiles];
  if (!all.length) throw new Error('the blueprint is empty');
  const extent = extentOf(all);
  const grid = blueprint['snap-to-grid'];
  const cell = grid && { x: 0, y: 0, w: grid.x, h: grid.y };
  // The grid's cell holds the city block when what the blueprint holds lies on it, some of it
  // perhaps straddling its border or just beyond (poles, walls or rails shared with the
  // neighbouring city blocks: a twentieth of the cell at most); a grid much smaller than that
  // (a rail grid) only aligns it.
  const beyond = cell && Math.max(-extent.x, -extent.y, extent.x + extent.w - cell.w, extent.y + extent.h - cell.h);
  const area = cell && beyond <= Math.ceil(Math.min(cell.w, cell.h) / 20) ? cell : extent;
  return { area, fixtures, unknown: [...unknown].sort() };
}

// An entity's tile footprint facing north: the catalog's, else the built-in table's; undefined
// when unknown, null for what stands above the ground (elevated rails).
export function footprintOf(name, catalog) {
  if (name.startsWith('elevated-')) return null;
  const known = catalog.buildings?.[name]?.size ?? catalog.poles?.[name]?.size ?? catalog.footprints?.[name];
  if (known) return { w: known.w, h: known.h };
  const pair = FOOTPRINTS[name];
  if (pair) return { w: pair[0], h: pair[1] };
  const oneTile = [
    ...Object.keys(catalog.belts ?? {}), ...Object.values(catalog.belts ?? {}).map(b => b.underground?.name),
    ...Object.keys(catalog.pipes ?? {}), ...(catalog.plainPipes ?? []), ...Object.keys(catalog.inserters ?? {}),
  ];
  return oneTile.includes(name) ? { w: 1, h: 1 } : undefined;
}

// What the layout search builds in: the City Block's area, the area inside its Buffer (where the
// Compound Block stands, its Side Input entering on the west edge and Side Output leaving on the
// east edge), and its Fixtures.
export function siteOf(city, buffer = 0) {
  const b = Math.max(0, Math.floor(buffer));
  const { area } = city;
  const inner = { x: area.x + b, y: area.y + b, w: area.w - 2 * b, h: area.h - 2 * b };
  if (inner.w < 3 || inner.h < 3) throw new Error('the buffer leaves no room inside the city block');
  return { area: { ...area }, inner, buffer: b, fixtures: city.fixtures.map(f => ({ ...f })) };
}

function extentOf(boxes) {
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
  return { x: x0, y: y0, w: Math.max(...boxes.map(b => b.x + b.w)) - x0, h: Math.max(...boxes.map(b => b.y + b.h)) - y0 };
}
