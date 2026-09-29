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

// Kruskal over pole pairs within wire reach: the shortest wires that join every pole.
function poleWires(entities, catalog) {
  const poles = entities.map((e, i) => ({ e, number: i + 1 })).filter(p => p.e.kind === 'pole');
  const center = ({ e }) => [e.x + e.w / 2, e.y + e.h / 2];
  const edges = [];
  poles.forEach((a, i) => poles.slice(i + 1).forEach(b => {
    const [ax, ay] = center(a), [bx, by] = center(b);
    const d = Math.hypot(ax - bx, ay - by);
    const reach = Math.min(catalog.poles[a.e.name].wireReach, catalog.poles[b.e.name].wireReach);
    if (d <= reach) edges.push({ a: a.number, b: b.number, d });
  }));
  edges.sort((p, q) => p.d - q.d || p.a - q.a || p.b - q.b);
  const parent = new Map(poles.map(p => [p.number, p.number]));
  const root = n => (parent.get(n) === n ? n : root(parent.get(n)));
  const wires = [];
  for (const { a, b } of edges) {
    const ra = root(a), rb = root(b);
    if (ra === rb) continue;
    parent.set(ra, rb);
    wires.push([a, POLE_COPPER, b, POLE_COPPER]);
  }
  return wires;
}

async function zlibBase64(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
