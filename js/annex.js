import { wirePairs } from './layout/wires.js';
import { prunePoles } from './layout/poles.js';
import { VEC } from './layout/grid.js';

// Annexes (CONTEXT.md): where a City Block's layout leaves room the chain no longer grows into, a
// second Compound Block of the same chain, smaller, stands in it: each of its Sub-Blocks a Sub-Block
// of its own, linked only to its own, its Side Inputs from the west edge and its Side Output to the
// east edge as the first one's. It is laid out in the City Block with everything the layout before
// it built as Fixtures, its poles joining theirs.

// The City Block an Annex is laid out in: `site` with every entity of `block` a Fixture (its
// poles as poles; its belts and pipes as what they are, on routes of their own, so no belt of the
// Annex's runs into theirs nor a pipe beside theirs), their tunnels (so none of the Annex's pairs
// with theirs) and the tiles where a pipe would join its machines.
export function annexSite(site, block, catalog) {
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
  return { ...site, fixtures: [...site.fixtures, ...fixtures], tunnels: [...(site.tunnels ?? []), ...tunnels], pipeBlocked: [...(site.pipeBlocked ?? []), ...ports] };
}

// The layout `block` with the Annex `annex` laid out beside it (in `site`, the City Block both
// stand in): one block, the Annex's Sub-Blocks and routes numbered after the block's, its poles
// wired to the block's (and those of either that the other's make redundant gone).
export function annexed(block, annex, site, catalog, logistics) {
  const S = block.subBlocks.length, R = block.routes.length;
  const sb = i => (typeof i === 'number' ? i + S : i);
  const route = id => (typeof id === 'number' ? id + R : id);
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
  const routes = [
    ...block.routes.map(r => ({ ...r, pieces: r.pieces.map(p => own.get(p) ?? { ...p }) })),
    ...annex.routes.map(r => ({
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
