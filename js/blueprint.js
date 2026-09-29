import { wirePairs } from './layout/wires.js';

// Factorio 2.0.0 as the packed 64-bit version number blueprints carry.
const VERSION = 562949953421312;
const POLE_COPPER = 5;

// Compound Block → Factorio blueprint: the importable string ("0" + base64(zlib(JSON)))
// and the JSON it encodes.
export async function encodeBlueprint(block, catalog) {
  const entities = [...block.entities, ...markers(block)].map((e, i) => {
    const out = { entity_number: i + 1, name: e.name, position: { x: e.x + e.w / 2, y: e.y + e.h / 2 } };
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
  const blueprint = {
    blueprint: {
      item: 'blueprint', label: 'Factory block', icons, entities,
      wires: poleWires(block.entities, catalog), version: VERSION,
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
  const taken = new Set(block.entities.flatMap(e => [...Array(e.w * e.h).keys()].map(i => `${e.x + (i % e.w)},${e.y + Math.floor(i / e.w)}`)));
  const out = [];
  for (const route of block.routes ?? []) {
    const side = route.source === 'side-input' ? -1 : route.sink === 'side-output' ? 1 : 0;
    if (!side || !route.pieces.length) continue;
    const end = route.pieces.reduce((best, p) => (p.x * side > best.x * side ? p : best));
    let x = end.x + side;
    while (taken.has(`${x},${end.y}`)) x += side;
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

function poleWires(entities, catalog) {
  return wirePairs(entities, catalog).map(([a, b]) => [a + 1, POLE_COPPER, b + 1, POLE_COPPER]);
}

async function zlibBase64(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
