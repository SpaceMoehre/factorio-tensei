import assert from 'node:assert/strict';

const DIR = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] };
const INSERTER_REACH = { 'fast-inserter': 1, 'long-handed-inserter': 2 };

const tilesOf = e => {
  const tiles = [];
  for (let dx = 0; dx < e.w; dx++) for (let dy = 0; dy < e.h; dy++) tiles.push(`${e.x + dx},${e.y + dy}`);
  return tiles;
};
const key = (x, y) => `${x},${y}`;

export function assertNoOverlaps(entities) {
  const owner = new Map();
  for (const e of entities) {
    for (const t of tilesOf(e)) {
      assert.ok(!owner.has(t), `${e.name} overlaps ${owner.get(t)?.name} at ${t}`);
      owner.set(t, e);
    }
  }
}

// Each piece must hand its contents to the next one: a surface piece feeds the adjacent tile
// in its travel direction; an underground entrance surfaces exactly maxDistance tiles ahead.
export function assertRouteChain(route, catalog, logistics) {
  const pieces = route.pieces;
  assert.ok(pieces.length > 0, `route ${route.id} has no pieces`);
  const reach = route.kind === 'belt'
    ? catalog.belts[logistics.belt].underground.maxDistance
    : catalog.pipes[logistics.pipe].maxDistance;
  for (let i = 0; i + 1 < pieces.length; i++) {
    const a = pieces[i], b = pieces[i + 1];
    const [dx, dy] = DIR[a.travel];
    const step = a.underground === 'input' ? reach : 1;
    assert.deepEqual([b.x, b.y], [a.x + dx * step, a.y + dy * step],
      `route ${route.id}: piece ${i} at ${a.x},${a.y} does not feed piece ${i + 1} at ${b.x},${b.y}`);
    if (a.underground === 'input') assert.equal(b.underground, 'output', `route ${route.id}: tunnel entrance without exit`);
  }
}

function routeTiles(route) {
  return new Set(route.pieces.map(p => key(p.x, p.y)));
}

function inserterTiles(ins) {
  const [dx, dy] = DIR[ins.direction];
  const r = INSERTER_REACH[ins.name];
  return { pickup: key(ins.x + dx * r, ins.y + dy * r), drop: key(ins.x - dx * r, ins.y - dy * r) };
}

function insideEntity(tile, e) {
  const [x, y] = tile.split(',').map(Number);
  return x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h;
}

export function assertFeedsEveryMachine(block, route, machines) {
  const tiles = routeTiles(route);
  const inserters = block.entities.filter(e => e.kind === 'inserter');
  for (const m of machines) {
    assert.ok(inserters.some(ins => {
      const { pickup, drop } = inserterTiles(ins);
      return tiles.has(pickup) && insideEntity(drop, m);
    }), `no inserter moves route ${route.id} into machine at ${m.x},${m.y}`);
  }
}

export function assertDrainsEveryMachine(block, route, machines) {
  const tiles = routeTiles(route);
  const inserters = block.entities.filter(e => e.kind === 'inserter');
  for (const m of machines) {
    assert.ok(inserters.some(ins => {
      const { pickup, drop } = inserterTiles(ins);
      return insideEntity(pickup, m) && tiles.has(drop);
    }), `no inserter moves output of machine at ${m.x},${m.y} onto route ${route.id}`);
  }
}

const center = e => [e.x + e.w / 2, e.y + e.h / 2];

function powers(pole, spec, e) {
  const [cx, cy] = center(pole);
  const r = spec.supplyRadius;
  return e.x < cx + r && e.x + e.w > cx - r && e.y < cy + r && e.y + e.h > cy - r;
}

function consumers(block, catalog) {
  return block.entities.filter(e => e.kind === 'inserter' || (e.kind === 'building' && catalog.buildings[e.name].energy === 'electric'));
}

function networkConnected(poles, spec) {
  if (poles.length === 0) return true;
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const [ax, ay] = center(poles[stack.pop()]);
    poles.forEach((p, j) => {
      const [bx, by] = center(p);
      if (!seen.has(j) && Math.hypot(ax - bx, ay - by) <= spec.wireReach) { seen.add(j); stack.push(j); }
    });
  }
  return seen.size === poles.length;
}

export function assertPowerNetwork(block, catalog, logistics) {
  const spec = catalog.poles[logistics.pole];
  const poles = block.entities.filter(e => e.kind === 'pole');
  const needs = consumers(block, catalog);
  for (const e of needs) {
    assert.ok(poles.some(p => powers(p, spec, e)), `${e.name} at ${e.x},${e.y} is not powered`);
  }
  assert.ok(networkConnected(poles, spec), 'poles do not form one connected network');
  poles.forEach((removed, i) => {
    const rest = poles.filter((_, j) => j !== i);
    const stillCovered = needs.every(e => rest.some(p => powers(p, spec, e)));
    assert.ok(!(stillCovered && networkConnected(rest, spec)), `pole at ${removed.x},${removed.y} is redundant`);
  });
}

// Pipe connectivity: a pipe connects on all four sides; a pipe-to-ground only on the side
// its direction names (the other end is underground).
const connectsToward = (piece, dir) => piece.kind === 'pipe' || (piece.kind === 'pipe-to-ground' && piece.direction === dir);
const OPPOSITE = { 0: 8, 4: 12, 8: 0, 12: 4 };

function pipeNeighbors(pieces, a, reach) {
  const at = new Map(pieces.map(p => [key(p.x, p.y), p]));
  const out = [];
  for (const [d, [dx, dy]] of Object.entries(DIR)) {
    const b = at.get(key(a.x + dx, a.y + dy));
    if (b && connectsToward(a, +d) && connectsToward(b, OPPOSITE[d])) out.push(b);
  }
  const partner = a.kind === 'pipe-to-ground' ? tunnelPartner(at, a, reach) : null;
  if (partner) out.push(partner.piece);
  return out;
}

// A pipe-to-ground pairs with the nearest pipe-to-ground facing it within reach.
function tunnelPartner(at, a, reach) {
  const [dx, dy] = DIR[OPPOSITE[a.direction]];
  for (let i = 1; i <= reach; i++) {
    const b = at.get(key(a.x + dx * i, a.y + dy * i));
    if (b?.kind === 'pipe-to-ground' && b.direction === OPPOSITE[a.direction]) return { piece: b, distance: i };
  }
  return null;
}

function portTiles(machine, catalog, fluid, role) {
  const building = catalog.buildings[machine.name];
  const recipe = catalog.recipes[machine.recipe];
  const isInput = role === 'input';
  const list = (isInput ? recipe.ingredients : recipe.products).filter(i => i.type === 'fluid');
  const boxes = building.fluidBoxes.filter(b => (isInput ? b.production !== 'output' : b.production !== 'input'));
  const box = boxes[list.findIndex(i => i.name === fluid)];
  // Rotating clockwise by a quarter turn maps (x, y) to (-y, x).
  const rotate = ({ x, y }, turns) => (turns === 0 ? [x, y] : rotate({ x: -y, y: x }, turns - 1));
  const cx = machine.x + machine.w / 2, cy = machine.y + machine.h / 2;
  return box.connections.map(c => {
    const [rx, ry] = rotate(c, machine.direction / 4);
    const dir = (c.direction + machine.direction) % 16;
    const [dx, dy] = DIR[dir];
    return { tile: key(Math.floor(cx + rx + dx), Math.floor(cy + ry + dy)), towardBuilding: OPPOSITE[dir] };
  });
}

export function assertPipeNetwork(block, route, catalog, logistics, machines) {
  const reach = catalog.pipes[logistics.pipe].maxDistance;
  const pieces = route.pieces;
  const seen = new Set([pieces[0]]);
  const stack = [pieces[0]];
  while (stack.length) for (const n of pipeNeighbors(pieces, stack.pop(), reach)) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  assert.equal(seen.size, pieces.length, `fluid route ${route.id} (${route.fluid}) is not one connected network`);
  // Partners are searched among every pipe-to-ground, so interleaved tunnels are caught.
  const allTunnels = new Map(block.entities.filter(e => e.kind === 'pipe-to-ground').map(q => [key(q.x, q.y), q]));
  for (const p of pieces.filter(p => p.kind === 'pipe-to-ground')) {
    assert.equal(tunnelPartner(allTunnels, p, reach)?.distance, reach,
      `pipe-to-ground at ${p.x},${p.y} is not paired exactly ${reach} tiles away`);
  }
  const at = new Map(pieces.map(p => [key(p.x, p.y), p]));
  const producer = typeof route.source === 'number' ? block.subBlocks[route.source].recipe : null;
  for (const m of machines) {
    const role = m.recipe === producer ? 'output' : 'input';
    assert.ok(portTiles(m, catalog, route.fluid, role).some(({ tile, towardBuilding }) => at.has(tile) && connectsToward(at.get(tile), towardBuilding)),
      `${route.fluid} does not reach ${m.name} at ${m.x},${m.y}`);
  }
  if (route.source === 'side-input') assert.ok(pieces.some(p => p.x === block.bounds.x), `${route.fluid} does not start at the west edge`);
  if (route.sink === 'side-output') assert.ok(pieces.some(p => p.x === block.bounds.x + block.bounds.w - 1), `${route.fluid} does not reach the east edge`);
}

export function assertNoFluidMixing(block, catalog, logistics) {
  const reach = catalog.pipes[logistics.pipe].maxDistance;
  const fluidPieces = block.entities.filter(e => e.kind === 'pipe' || e.kind === 'pipe-to-ground');
  for (const a of fluidPieces) {
    for (const b of pipeNeighbors(fluidPieces, a, reach)) {
      assert.equal(b.fluid, a.fluid, `${a.fluid} at ${a.x},${a.y} connects to ${b.fluid} at ${b.x},${b.y}`);
    }
  }
  const at = new Map(fluidPieces.map(p => [key(p.x, p.y), p]));
  for (const m of block.entities.filter(e => e.kind === 'building')) {
    const recipe = catalog.recipes[m.recipe];
    const used = [
      ...recipe.ingredients.filter(i => i.type === 'fluid').map(f => [f, 'input']),
      ...recipe.products.filter(p => p.type === 'fluid').map(f => [f, 'output']),
    ];
    for (const [f, role] of used) {
      for (const { tile, towardBuilding } of portTiles(m, catalog, f.name, role)) {
        const p = at.get(tile);
        if (p && connectsToward(p, towardBuilding)) assert.equal(p.fluid, f.name, `${p.fluid} plugged into ${f.name} connection of ${m.name}`);
      }
    }
  }
}

// Different routes are different pipe networks even when they carry the same fluid.
export function assertSeparateNetworks(block, catalog, logistics) {
  const reach = catalog.pipes[logistics.pipe].maxDistance;
  const fluidPieces = block.entities.filter(e => e.kind === 'pipe' || e.kind === 'pipe-to-ground');
  for (const a of fluidPieces) {
    for (const b of pipeNeighbors(fluidPieces, a, reach)) {
      assert.equal(b.route, a.route, `${a.fluid} route ${a.route} at ${a.x},${a.y} joins route ${b.route} at ${b.x},${b.y}`);
    }
  }
}

export function assertEndsAtEastEdge(block, route) {
  const last = route.pieces[route.pieces.length - 1];
  assert.equal(last.x, block.bounds.x + block.bounds.w - 1, `route ${route.id} does not reach the east edge`);
  assert.equal(last.travel, 4, `route ${route.id} does not leave eastward`);
}
