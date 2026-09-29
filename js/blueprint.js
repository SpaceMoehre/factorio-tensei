import { wirePairs } from './layout/wires.js';

// Factorio 2.0.0 as the packed 64-bit version number blueprints carry.
const VERSION = 562949953421312;
const POLE_COPPER = 5;

// Compound Block → Factorio blueprint: the importable string ("0" + base64(zlib(JSON)))
// and the JSON it encodes.
export async function encodeBlueprint(block, catalog) {
  const entities = block.entities.map((e, i) => {
    const out = { entity_number: i + 1, name: e.name, position: { x: e.x + e.w / 2, y: e.y + e.h / 2 } };
    if (e.direction) out.direction = e.direction;
    if (e.recipe) out.recipe = e.recipe;
    if (e.underground && e.kind === 'underground-belt') out.type = e.underground;
    // 90° inserters (Inserter_Config): vectors relative to the inserter, in world axes.
    if (e.vectors) {
      out.pickup_position = { ...e.vectors.pickup };
      out.drop_position = { ...e.vectors.drop };
    }
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
