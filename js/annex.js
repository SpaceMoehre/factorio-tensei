import { wirePairs } from './layout/wires.js';
import { prunePoles } from './layout/poles.js';
import { VEC, key } from './layout/grid.js';
import { drawnFrom } from './layout/validity.js';

// Annexes (CONTEXT.md): where a City Block's layout leaves room the chain no longer grows into, a
// second Compound Block of the same chain, smaller, stands in it: each of its Sub-Blocks a Sub-Block
// of its own, linked only to its own, its Side Inputs from the west edge and its Side Output to the
// east edge as the first one's. It is laid out in the City Block with everything the layout before
// it built as Fixtures, its poles joining theirs.

// The City Block an Annex is laid out in: `site` with every entity of `block` a Fixture (its
// poles as poles; its belts and pipes as what they are, on routes of their own, so no belt of the
// Annex's runs into theirs nor a pipe beside theirs), their tunnels (so none of the Annex's pairs
// with theirs), the tiles where a pipe would join its machines, and the pipes its Side Inputs
// may draw from (draws(): `made`, the items made here).
export function annexSite(site, block, catalog, made = []) {
  const fixtures = block.entities.map(e => (PIECES.has(e.kind)
    ? { ...e, route: `${BUILT}${e.route}` }
    : { name: e.kind === 'pole' ? e.name : BUILT, kind: 'fixture', x: e.x, y: e.y, w: e.w, h: e.h }));
  const tunnels = [];
  const at = new Map(block.entities.map(e => [`${e.x},${e.y}`, e]));
  for (const e of block.entities.filter(e => e.underground === 'input')) {
    const [dx, dy] = VEC[e.travel];
    for (let i = 1; i <= REACH; i++) {
      const b = at.get(`${e.x + i * dx},${e.y + i * dy}`);
      if (b?.name !== e.name || b.route !== e.route || b.underground !== 'output') continue;
      tunnels.push({ name: e.name, pipe: e.kind === 'pipe-to-ground', a: { x: e.x, y: e.y }, b: { x: b.x, y: b.y }, travel: e.travel });
      break;
    }
  }
  const ports = [];
  for (const m of block.entities.filter(e => e.kind === 'building')) {
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    for (const box of catalog.buildings[m.name]?.fluidBoxes ?? []) {
      // (A mirrored machine's connections flipped east to west before it turns.)
      for (const c of box.connections.map(c => (m.mirror ? { ...c, x: -c.x, direction: (16 - c.direction) % 16 } : c))) {
        const turns = (m.direction ?? 0) / 4;
        let [rx, ry] = [c.x, c.y];
        for (let k = 0; k < turns; k++) [rx, ry] = [-ry, rx];
        const [dx, dy] = VEC[(c.direction + (m.direction ?? 0)) % 16];
        ports.push([Math.floor(cx + rx + dx), Math.floor(cy + ry + dy)]);
      }
    }
  }
  return {
    ...site, annex: true, fixtures: [...site.fixtures, ...fixtures], tunnels: [...(site.tunnels ?? []), ...tunnels], pipeBlocked: [...(site.pipeBlocked ?? []), ...ports],
    draws: draws(block, site, ports, made),
  };
}

// Per fluid, the pipe of `block` an Annex's Side Input of it may draw from (ADR 0032): a Side
// Input's, or one of an item made here with some to spare (only from there: the train brings
// none), the one with the most (spares()); and the free tiles beside its plain pipes, heading
// away. { [fluid]: { route (its Fixtures' route), spare, only, starts } }
function draws(block, site, ports, made) {
  const taken = new Set(ports.map(([x, y]) => key(x, y)));
  for (const e of [...site.fixtures, ...block.entities]) for (let x = e.x; x < e.x + e.w; x++) for (let y = e.y; y < e.y + e.h; y++) taken.add(key(x, y));
  const { inner } = site;
  const inside = (x, y) => x >= inner.x && y >= inner.y && x < inner.x + inner.w && y < inner.y + inner.h;
  const spare = spares(block);
  const out = {};
  for (const route of block.routes.filter(r => r.kind === 'pipe' && (spare.get(r.id) === Infinity || (made.includes(r.fluid) && spare.get(r.id) > 0)))) {
    if (out[route.fluid] && out[route.fluid].spare >= spare.get(route.id)) continue;
    const starts = [];
    for (const p of route.pieces.filter(p => p.kind === 'pipe')) {
      for (const [d, [dx, dy]] of Object.entries(VEC)) {
        const [x, y] = [p.x + dx, p.y + dy];
        if (inside(x, y) && !taken.has(key(x, y))) starts.push({ x, y, a: +d });
      }
    }
    if (starts.length) out[route.fluid] = { route: `${BUILT}${route.id}`, spare: spare.get(route.id), only: spare.get(route.id) !== Infinity, starts };
  }
  return out;
}

// What each pipe route of `block` has to spare of its fluid (by route id): a Side Input's all
// (the train brings more), else what its producers make at full speed beyond what its consumers
// take — none where they feed more than one pipe of it, or take anything but the train's fluids
// (what else they take comes only as fast as they were planned to run).
export function spares(block) {
  const out = new Map();
  for (const route of block.routes.filter(r => r.kind === 'pipe')) {
    if (route.source === 'side-input') {
      out.set(route.id, Infinity);
      continue;
    }
    if (typeof route.source !== 'number') continue;
    if (block.routes.some(r => r !== route && r.kind === 'pipe' && r.source === route.source && r.fluid === route.fluid)) continue;
    if (block.routes.some(r => r.consumers.includes(route.source) && !(r.kind === 'pipe' && r.source === 'side-input'))) continue;
    const producer = block.subBlocks[route.source];
    const made = (producer.outputs.find(f => f.name === route.fluid)?.rate ?? 0) * (producer.headroom ?? 1);
    const taken = route.consumers.reduce((sum, i) => sum + (block.subBlocks[i].inputs.find(f => f.name === route.fluid)?.rate ?? 0) * (route.share?.[i] ?? 1), 0);
    out.set(route.id, Math.max(0, Math.floor((made - taken) * 100) / 100));
  }
  return out;
}

// The layout `block` with the Annex `annex` laid out beside it (in `site`, the City Block both
// stand in): one block, the Annex's Sub-Blocks and routes numbered after the block's, its poles
// wired to the block's (and those of either that the other's make redundant gone).
export function annexed(block, annex, site, catalog, logistics) {
  const S = block.subBlocks.length;
  const sb = i => (typeof i === 'number' ? i + S : i);
  // A Side Input of the Annex's drawn from the pipe of the block's it was to draw from (ADR 0032)
  // is that pipe's route from then on; the Annex's other routes are numbered after the block's.
  const drawing = new Map();
  for (const r of annex.routes.filter(r => r.kind === 'pipe' && r.source === 'side-input')) {
    const from = drawnFrom(annex, r);
    if (from !== null && from === annex.site?.draws?.[r.fluid]?.route) drawing.set(r.id, Number(from.slice(BUILT.length)));
  }
  const ids = new Map();
  let next = block.routes.length;
  for (const r of annex.routes) ids.set(r.id, drawing.has(r.id) ? drawing.get(r.id) : next++);
  const route = id => (typeof id === 'number' ? ids.get(id) : id);
  const keyed = (map, f) => map && Object.fromEntries(Object.entries(map).map(([k, v]) => [f(+k), v]));
  const own = new Map(block.entities.map(e => [e, { ...e }]));
  const added = new Map(annex.entities.map(e => [e, {
    ...e, ...(e.subBlock !== undefined ? { subBlock: sb(e.subBlock) } : {}), ...(e.route !== undefined ? { route: route(e.route) } : {}),
  }]));
  let entities = [...own.values(), ...added.values()];
  const poles = entities.filter(e => e.kind === 'pole');
  const consumers = entities.filter(e => e.kind === 'inserter' || (e.kind === 'building' && catalog.buildings[e.name].energy === 'electric'));
  const fixed = site.fixtures.filter(f => catalog.poles[f.name]).map(f => ({ ...f, spec: catalog.poles[f.name] }));
  const kept = new Set(prunePoles(poles, consumers, catalog.poles[logistics.pole], fixed));
  entities = entities.filter(e => e.kind !== 'pole' || kept.has(e));
  const drawn = new Map();
  for (const r of annex.routes.filter(r => drawing.has(r.id))) drawn.set(drawing.get(r.id), [...(drawn.get(drawing.get(r.id)) ?? []), r]);
  const routes = [
    ...block.routes.map(r => {
      const pieces = r.pieces.map(p => own.get(p) ?? { ...p });
      const from = drawn.get(r.id);
      if (!from) return { ...r, pieces };
      // (Each Side Input drawn from it: its consumers, pipes and what it takes added; its
      // producers make that much more, as they have to spare.)
      return {
        ...r,
        consumers: [...r.consumers, ...from.flatMap(d => d.consumers.map(sb))],
        pieces: [...pieces, ...from.flatMap(d => d.pieces.map(p => added.get(p) ?? { ...p, route: r.id }))],
        items: r.items.map(i => {
          const more = from.reduce((sum, d) => sum + (d.items.find(x => x.item === i.item)?.rate ?? 0), 0);
          return { ...i, rate: i.rate + more, supply: i.supply + more };
        }),
      };
    }),
    ...annex.routes.filter(r => !drawing.has(r.id)).map(r => ({
      ...r, id: route(r.id), base: route(r.base), source: sb(r.source), consumers: r.consumers.map(sb),
      pieces: r.pieces.map(p => added.get(p) ?? { ...p, route: route(p.route) }),
      ...(r.bases ? { bases: r.bases.map(route) } : {}),
      ...(r.servesRows ? { servesRows: keyed(r.servesRows, sb) } : {}),
      ...(r.share ? { share: keyed(r.share, sb) } : {}),
      ...(r.taps ? { taps: r.taps.map(route) } : {}),
      ...Object.fromEntries(['joins', 'fedBy', 'fedFrom', 'balancedWith'].filter(k => r[k] !== undefined).map(k => [k, route(r[k])])),
      ...(r.loop?.from !== undefined ? { loop: { ...r.loop, from: sb(r.loop.from) } } : {}),
    })),
  ];
  const subBlocks = [
    ...block.subBlocks,
    ...annex.subBlocks.map(s => ({ ...s, index: sb(s.index), inserters: s.inserters?.map(x => ({ ...x, route: route(x.route) })) })),
  ];
  let x = Infinity, y = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of entities) {
    x = Math.min(x, e.x); y = Math.min(y, e.y);
    x1 = Math.max(x1, e.x + e.w); y1 = Math.max(y1, e.y + e.h);
  }
  return { ...block, subBlocks, entities, routes, bounds: { x, y, w: x1 - x, h: y1 - y }, site, wires: wirePairs(entities, catalog, site.fixtures) };
}

// What an Annex's Fixtures other than poles are called, and their routes' ids begin with.
const BUILT = 'built';
// Belts and pipes (and their tunnels: no farther apart than any reaches).
const PIECES = new Set(['belt', 'underground-belt', 'splitter', 'pipe', 'pipe-to-ground']);
const REACH = 64;
