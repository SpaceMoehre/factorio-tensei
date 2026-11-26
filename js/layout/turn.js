import { key } from './grid.js';

// A module turned `turns` quarter turns clockwise (the user's turn of a Sub-Block, ADR 0045), as a
// blueprint turns in the game: every machine, inserter, belt and pipe, and what the Compound
// Block reads of it (its area, its parts and their belts, its pipes, its poles, the tiles its core
// keeps free or for a fluid). A tile (x, y) goes to (-y - 1, x); an entity of w × h at (x, y) to
// (-(y + h), x), h × w; a direction (0 north, 4 east, 8 south, 12 west) a quarter on; a vector
// (an inserter's pickup and drop) (x, y) to (-y, x). The turned module knows how far it is
// turned (`turns`): a belt may enter and leave it on any side, its fluids reach other edges
// (compose.js). Turned modules are kept: the same module turned as far is the same object.
const turnedOf = new WeakMap();

export function turnModule(module, turns) {
  const t = ((turns % 4) + 4) % 4;
  if (!t) return module;
  if (!turnedOf.has(module)) turnedOf.set(module, []);
  const kept = turnedOf.get(module);
  if (!kept[t]) {
    let m = module;
    for (let k = 0; k < t; k++) m = quarter(m);
    kept[t] = { ...m, turns: ((module.turns ?? 0) + t) % 4 };
  }
  return kept[t];
}

// A turned design (design.js: { kinds: [{ module, reverse?, count, detached? }] }): its stack's
// modules turned, the machines a Breakout stood apart as they were.
export function turnDesign(design, turns) {
  if (!design || !(((turns % 4) + 4) % 4)) return design;
  return {
    ...design,
    kinds: design.kinds.map(k => (k.detached ? k : { ...k, module: turnModule(k.module, turns), ...(k.reverse ? { reverse: turnModule(k.reverse, turns) } : {}) })),
  };
}

// A side (W, N, E, S) a quarter turn on, `turns` times.
const SIDES = ['N', 'E', 'S', 'W'];
export const turnSide = (side, turns = 0) => SIDES[(SIDES.indexOf(side) + (((turns % 4) + 4) % 4)) % 4];

function quarter(module) {
  const dir = d => (typeof d === 'number' ? (d + 4) % 16 : d);
  const tile = ([x, y, ...rest]) => [-y - 1, x, ...rest];
  const port = ([x, y, d, ...rest]) => [-y - 1, x, dir(d), ...rest];
  // (0 - v, not -v: no -0 among the coordinates.)
  const vector = v => ({ ...v, x: 0 - v.y, y: v.x });
  const entity = e => {
    const w = e.w ?? 1, h = e.h ?? 1;
    const out = { ...e, x: 0 - (e.y + h), y: e.x, w: h, h: w };
    if (e.direction !== undefined) out.direction = dir(e.direction);
    if (e.travel !== undefined) out.travel = dir(e.travel);
    if (typeof e.out === 'string') {
      const [ox, oy] = e.out.split(',').map(Number);
      out.out = key(-oy - 1, ox);
    }
    if (e.vectors) out.vectors = { ...e.vectors, pickup: vector(e.vectors.pickup), drop: vector(e.vectors.drop) };
    // (An Output Drop's point, from the machine's top-left corner.)
    if (e.drop) out.drop = { ...e.drop, x: h - e.drop.y, y: e.drop.x };
    return out;
  };
  const { area, core } = module;
  return {
    ...module,
    area: { x: 0 - (area.y + area.h), y: area.x, w: area.h, h: area.w },
    w: module.h, h: module.w,
    entities: module.entities.map(entity),
    parts: module.parts.map(p => ({ ...p, dir: dir(p.dir ?? 4), pieces: p.pieces.map(entity) })),
    fluids: module.fluids.map(f => ({ ...f, pieces: f.pieces.map(entity) })),
    poles: module.poles.map(entity),
    core: {
      ...core,
      w: core.h, h: core.w,
      entities: core.entities?.map(entity),
      ports: core.ports.map(p => ({ ...p, tiles: p.tiles.map(port) })),
      pipeBlocked: core.pipeBlocked.map(tile),
      surfacePorts: core.surfacePorts.map(tile),
      poleSlots: core.poleSlots.map(tile),
      dropTiles: (core.dropTiles ?? []).map(tile),
      taps: (core.taps ?? []).map(t => ({ ...t, tile: tile(t.tile) })),
    },
  };
}
