import { wirePairs } from './layout/wires.js';

// Factorio 2.0.0 as the packed 64-bit version number blueprints carry.
const VERSION = 562949953421312;
const POLE_COPPER = 5;

// Compound Block → Factorio blueprint: the importable string ("0" + base64(zlib(JSON)))
// and the JSON it encodes. Built in a City Block, it is the City Block's blueprint (`city`) with
// the Compound Block added: its entities, tiles, wires and grid snapping as they were, and
// copper wires joining the block's poles to its own.
export async function encodeBlueprint(block, catalog, city = null) {
  const kept = city?.entities ?? [];
  const numberOf = new Map(kept.map((e, i) => [e.entity_number, i + 1]));
  const entities = [...block.entities, ...markers(block)].map((e, i) => {
    const out = { entity_number: kept.length + i + 1, name: e.name, position: { x: e.x + e.w / 2, y: e.y + e.h / 2 } };
    if (e.direction) out.direction = e.direction;
    if (e.recipe) out.recipe = e.recipe;
    const modules = e.kind === 'building' ? block.subBlocks[e.subBlock]?.modules ?? [] : [];
    if (modules.length) out.items = moduleRequests(modules);
    if (e.underground && e.kind === 'underground-belt') out.type = e.underground;
    // 90° inserters (Inserter_Config): vectors relative to the inserter, in world axes.
    if (e.vectors) {
      out.pickup_position = { ...e.vectors.pickup };
      out.drop_position = { ...e.vectors.drop };
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
  const wires = [
    ...(city?.wires ?? []).map(([a, ca, b, cb]) => [numberOf.get(a), ca, numberOf.get(b), cb]),
    ...wirePairs(block.entities, catalog, city ? fixtures : []).map(([a, b]) => [numbered(a), POLE_COPPER, numbered(b), POLE_COPPER]),
  ];
  const blueprint = {
    blueprint: {
      ...(city ?? {}),
      item: 'blueprint', label: city?.label ? `${city.label} · factory` : 'Factory block', icons,
      entities: [...kept.map((e, i) => ({ ...e, entity_number: i + 1 })), ...entities],
      wires, version: city?.version ?? VERSION,
    },
  };
  const json = JSON.stringify(blueprint);
  return { string: '0' + await zlibBase64(json), json };
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
function markers(block) {
  const taken = new Set([...block.entities, ...(block.site?.fixtures ?? [])].flatMap(e => [...Array(e.w * e.h).keys()].map(i => `${e.x + (i % e.w)},${e.y + Math.floor(i / e.w)}`)));
  const out = [];
  // In a City Block, only inside it (in its Buffer).
  const area = block.site?.area;
  for (const route of block.routes ?? []) {
    const side = route.source === 'side-input' ? -1 : route.sink === 'side-output' ? 1 : 0;
    if (!side || !route.pieces.length) continue;
    const end = route.pieces.reduce((best, p) => (p.x * side > best.x * side ? p : best));
    let x = end.x + side;
    while (taken.has(`${x},${end.y}`)) x += side;
    if (area && (x < area.x || x >= area.x + area.w)) continue;
    taken.add(`${x},${end.y}`);
    const [first] = route.items;
    out.push({
      name: 'display-panel', kind: 'marker', x, y: end.y, w: 1, h: 1,
      icon: { type: route.kind === 'pipe' ? 'fluid' : 'item', name: first.item },
      text: route.items.map(i => `${i.item} ${Math.round(i.rate)}/min`).join(' + '),
    });
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
