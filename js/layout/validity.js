// The rules every Compound Block must satisfy. The layout search keeps a candidate only when
// validateBlock finds no problem, and the tests assert the same rules. Each check returns a list
// of problems (empty when the rule holds).

const DIR = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] };
const OPPOSITE = { 0: 8, 4: 12, 8: 0, 12: 4 };
const key = (x, y) => `${x},${y}`;

const tilesOf = e => {
  const tiles = [];
  for (let dx = 0; dx < e.w; dx++) for (let dy = 0; dy < e.h; dy++) tiles.push(key(e.x + dx, e.y + dy));
  return tiles;
};

export function overlaps(entities) {
  const owner = new Map();
  const problems = [];
  for (const e of entities) {
    for (const t of tilesOf(e)) {
      if (owner.has(t)) problems.push(`${e.name} overlaps ${owner.get(t).name} at ${t}`);
      owner.set(t, e);
    }
  }
  return problems;
}

// Each piece hands its contents to the next: a surface piece feeds the adjacent tile in its
// travel direction; an underground entrance surfaces within the entity's reach, at the nearest
// underground of its type on that line (no other one lies between them, or they would pair).
export function routeChain(route, catalog, logistics, entities) {
  const pieces = route.pieces;
  if (!pieces.length) return [`route ${route.id} has no pieces`];
  const reach = route.kind === 'belt'
    ? catalog.belts[logistics.belt].underground.maxDistance
    : catalog.pipes[logistics.pipe].maxDistance;
  const problems = [];
  for (let i = 0; i + 1 < pieces.length; i++) {
    const a = pieces[i], b = pieces[i + 1];
    const [dx, dy] = DIR[a.travel];
    if (a.underground === 'input') {
      if (b.underground !== 'output') problems.push(`route ${route.id}: tunnel entrance at ${a.x},${a.y} without exit`);
      const hop = dx ? (b.x - a.x) / dx : (b.y - a.y) / dy;
      const inLine = dx ? b.y === a.y : b.x === a.x;
      if (!inLine || !(hop >= 1 && hop <= reach)) {
        problems.push(`route ${route.id}: tunnel at ${a.x},${a.y} does not surface within ${reach} tiles ahead`);
      } else {
        const sameAxis = e => (DIR[e.travel][0] !== 0) === (dx !== 0);
        const between = entities.find(e => e !== a && e !== b && e.name === a.name && e.underground && sameAxis(e)
          && (dx ? e.y === a.y && (e.x - a.x) / dx > 0 && (e.x - a.x) / dx < hop : e.x === a.x && (e.y - a.y) / dy > 0 && (e.y - a.y) / dy < hop));
        if (between) problems.push(`route ${route.id}: tunnel at ${a.x},${a.y} is interleaved with ${between.name} at ${between.x},${between.y}`);
      }
    } else if (b.x !== a.x + dx || b.y !== a.y + dy) {
      problems.push(`route ${route.id}: piece ${i} at ${a.x},${a.y} does not feed piece ${i + 1} at ${b.x},${b.y}`);
    }
  }
  return problems;
}

// Where an inserter picks up and drops, as tiles: custom vectors when it has them, otherwise its
// prototype's vectors turned to face its direction (the side it picks up from).
function inserterTiles(ins, catalog) {
  const cx = ins.x + 0.5, cy = ins.y + 0.5;
  const tile = v => key(Math.floor(cx + v.x), Math.floor(cy + v.y));
  if (ins.vectors) return { pickup: tile(ins.vectors.pickup), drop: tile(ins.vectors.drop) };
  const spec = catalog.inserters[ins.name];
  const turn = v => {
    let { x, y } = v;
    for (let r = 0; r < ins.direction; r += 4) [x, y] = [-y, x];
    return { x, y };
  };
  return { pickup: tile(turn(spec.pickup)), drop: tile(turn(spec.insert)) };
}

function insideEntity(tile, e) {
  const [x, y] = tile.split(',').map(Number);
  return x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h;
}

const routeTiles = route => new Set(route.pieces.map(p => key(p.x, p.y)));

export function feedsEveryMachine(block, route, machines, catalog) {
  const tiles = routeTiles(route);
  const inserters = block.entities.filter(e => e.kind === 'inserter').map(i => inserterTiles(i, catalog));
  return machines.filter(m => !inserters.some(({ pickup, drop }) => tiles.has(pickup) && insideEntity(drop, m)))
    .map(m => `no inserter moves route ${route.id} into machine at ${m.x},${m.y}`);
}

export function drainsEveryMachine(block, route, machines, catalog) {
  const tiles = routeTiles(route);
  const inserters = block.entities.filter(e => e.kind === 'inserter').map(i => inserterTiles(i, catalog));
  return machines.filter(m => !inserters.some(({ pickup, drop }) => insideEntity(pickup, m) && tiles.has(drop)))
    .map(m => `no inserter moves output of machine at ${m.x},${m.y} onto route ${route.id}`);
}

// Only inserters with allow_custom_vectors may carry custom vectors, and none at all when 90°
// inserters are switched off.
export function customVectors(block, catalog, logistics) {
  return block.entities.filter(e => e.kind === 'inserter' && e.vectors
    && (logistics.rightAngle === false || !catalog.inserters[e.name].customVectors))
    .map(e => `${e.name} at ${e.x},${e.y} uses custom vectors`);
}

const center = e => [e.x + e.w / 2, e.y + e.h / 2];

function powers(pole, spec, e) {
  const [cx, cy] = center(pole);
  const r = spec.supplyRadius;
  return e.x < cx + r && e.x + e.w > cx - r && e.y < cy + r && e.y + e.h > cy - r;
}

function electricConsumers(block, catalog) {
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

export function powerNetwork(block, catalog, logistics) {
  const spec = catalog.poles[logistics.pole];
  const poles = block.entities.filter(e => e.kind === 'pole');
  const needs = electricConsumers(block, catalog);
  const problems = needs.filter(e => !poles.some(p => powers(p, spec, e))).map(e => `${e.name} at ${e.x},${e.y} is not powered`);
  if (!networkConnected(poles, spec)) problems.push('poles do not form one connected network');
  poles.forEach((removed, i) => {
    const rest = poles.filter((_, j) => j !== i);
    const stillCovered = needs.every(e => rest.some(p => powers(p, spec, e)));
    if (stillCovered && networkConnected(rest, spec)) problems.push(`pole at ${removed.x},${removed.y} is redundant`);
  });
  return problems;
}

// Pipe connectivity: a pipe connects on all four sides; a pipe-to-ground only on the side its
// direction names (the other end is underground).
const connectsToward = (piece, dir) => piece.kind === 'pipe' || (piece.kind === 'pipe-to-ground' && piece.direction === dir);

function pipeNeighbors(at, a, reach) {
  const out = [];
  for (const [d, [dx, dy]] of Object.entries(DIR)) {
    const b = at.get(key(a.x + dx, a.y + dy));
    if (b && connectsToward(a, +d) && connectsToward(b, OPPOSITE[d])) out.push(b);
  }
  const partner = a.kind === 'pipe-to-ground' ? tunnelPartner(at, a, reach) : null;
  if (partner) out.push(partner);
  return out;
}

// A pipe-to-ground pairs with the nearest pipe-to-ground facing it within reach.
function tunnelPartner(at, a, reach) {
  const [dx, dy] = DIR[OPPOSITE[a.direction]];
  for (let i = 1; i <= reach; i++) {
    const b = at.get(key(a.x + dx * i, a.y + dy * i));
    if (b?.kind === 'pipe-to-ground' && b.direction === OPPOSITE[a.direction]) return b;
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

const tileMap = pieces => new Map(pieces.map(p => [key(p.x, p.y), p]));

export function pipeNetwork(block, route, catalog, logistics, machines) {
  const reach = catalog.pipes[logistics.pipe].maxDistance;
  const pieces = route.pieces;
  const problems = [];
  const own = tileMap(pieces);
  const seen = new Set([pieces[0]]);
  const stack = [pieces[0]];
  while (stack.length) for (const n of pipeNeighbors(own, stack.pop(), reach)) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  if (seen.size !== pieces.length) problems.push(`fluid route ${route.id} (${route.fluid}) is not one connected network`);
  // Partners are searched among every pipe-to-ground, so interleaved tunnels are caught.
  const allTunnels = tileMap(block.entities.filter(e => e.kind === 'pipe-to-ground'));
  for (const p of pieces.filter(p => p.kind === 'pipe-to-ground')) {
    const partner = tunnelPartner(allTunnels, p, reach);
    if (!partner || partner.route !== p.route) problems.push(`pipe-to-ground at ${p.x},${p.y} has no partner of its own within ${reach} tiles`);
  }
  const producer = typeof route.source === 'number' ? block.subBlocks[route.source].recipe : null;
  for (const m of machines) {
    const role = m.recipe === producer ? 'output' : 'input';
    if (!portTiles(m, catalog, route.fluid, role).some(({ tile, towardBuilding }) => own.has(tile) && connectsToward(own.get(tile), towardBuilding))) {
      problems.push(`${route.fluid} does not reach ${m.name} at ${m.x},${m.y}`);
    }
  }
  if (route.source === 'side-input' && !pieces.some(p => p.x === block.bounds.x)) problems.push(`${route.fluid} does not start at the west edge`);
  if (route.sink === 'side-output' && !pieces.some(p => p.x === block.bounds.x + block.bounds.w - 1)) problems.push(`${route.fluid} does not reach the east edge`);
  return problems;
}

export function noFluidMixing(block, catalog, logistics) {
  const reach = catalog.pipes[logistics.pipe].maxDistance;
  const fluidPieces = block.entities.filter(e => e.kind === 'pipe' || e.kind === 'pipe-to-ground');
  const at = tileMap(fluidPieces);
  const problems = [];
  for (const a of fluidPieces) {
    for (const b of pipeNeighbors(at, a, reach)) {
      if (b.fluid !== a.fluid) problems.push(`${a.fluid} at ${a.x},${a.y} connects to ${b.fluid} at ${b.x},${b.y}`);
    }
  }
  for (const m of block.entities.filter(e => e.kind === 'building')) {
    const recipe = catalog.recipes[m.recipe];
    const used = [
      ...recipe.ingredients.filter(i => i.type === 'fluid').map(f => [f, 'input']),
      ...recipe.products.filter(p => p.type === 'fluid').map(f => [f, 'output']),
    ];
    for (const [f, role] of used) {
      for (const { tile, towardBuilding } of portTiles(m, catalog, f.name, role)) {
        const p = at.get(tile);
        if (p && connectsToward(p, towardBuilding) && p.fluid !== f.name) problems.push(`${p.fluid} plugged into ${f.name} connection of ${m.name}`);
      }
    }
  }
  return problems;
}

// Different routes are different pipe networks even when they carry the same fluid.
export function separateNetworks(block, catalog, logistics) {
  const reach = catalog.pipes[logistics.pipe].maxDistance;
  const fluidPieces = block.entities.filter(e => e.kind === 'pipe' || e.kind === 'pipe-to-ground');
  const at = tileMap(fluidPieces);
  const problems = [];
  for (const a of fluidPieces) {
    for (const b of pipeNeighbors(at, a, reach)) {
      if (b.route !== a.route) problems.push(`${a.fluid} route ${a.route} at ${a.x},${a.y} joins route ${b.route} at ${b.x},${b.y}`);
    }
  }
  return problems;
}

export function endsAtEastEdge(block, route) {
  const last = route.pieces[route.pieces.length - 1];
  if (last.x !== block.bounds.x + block.bounds.w - 1) return [`route ${route.id} does not reach the east edge`];
  if (last.travel !== 4) return [`route ${route.id} does not leave eastward`];
  return [];
}

function startsAtWestEdge(block, route) {
  return route.pieces[0].x === block.bounds.x ? [] : [`route ${route.id} does not start at the west edge`];
}

// Every rule, for every route and machine of a Compound Block.
export function validateBlock(block, catalog, logistics) {
  const machinesOf = i => block.entities.filter(e => e.kind === 'building' && e.subBlock === i);
  // A route split into parallel belts serves only its part's machine rows.
  const servedBy = (route, i) => machinesOf(i).filter(m => !route.servesRows?.[i] || route.servesRows[i].includes(m.row));
  const problems = [
    ...block.subBlocks.filter(sb => machinesOf(sb.index).length !== sb.count).map(sb => `${sb.item} does not have its ${sb.count} machines`),
    ...overlaps(block.entities),
    ...noFluidMixing(block, catalog, logistics),
    ...separateNetworks(block, catalog, logistics),
    ...customVectors(block, catalog, logistics),
  ];
  for (const route of block.routes) {
    if (!route.pieces.length) { problems.push(`route ${route.id} has no pieces`); continue; }
    if (route.kind === 'pipe') {
      const machines = [...(typeof route.source === 'number' ? machinesOf(route.source) : []), ...route.consumers.flatMap(machinesOf)];
      problems.push(...pipeNetwork(block, route, catalog, logistics, machines));
      continue;
    }
    problems.push(...routeChain(route, catalog, logistics, block.entities));
    if (typeof route.source === 'number') problems.push(...drainsEveryMachine(block, route, servedBy(route, route.source), catalog));
    else problems.push(...startsAtWestEdge(block, route));
    problems.push(...feedsEveryMachine(block, route, route.consumers.flatMap(i => servedBy(route, i)), catalog));
    if (route.sink === 'side-output') problems.push(...endsAtEastEdge(block, route));
  }
  // Together, the parts of a split route serve every machine row.
  const basesOf = r => r.bases ?? [r.base];
  for (const route of block.routes.filter(r => r.servesRows)) {
    for (const i of Object.keys(route.servesRows)) {
      for (const base of basesOf(route)) {
        const covered = new Set(block.routes.filter(r => basesOf(r).includes(base)).flatMap(r => r.servesRows?.[i] ?? []));
        if (machinesOf(+i).some(m => !covered.has(m.row))) problems.push(`route ${base} does not reach every row of ${block.subBlocks[i].item}`);
      }
    }
  }
  if (!problems.length) problems.push(...powerNetwork(block, catalog, logistics));
  return problems;
}
