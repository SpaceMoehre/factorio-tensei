// The rules every Compound Block must satisfy. The layout search keeps a candidate only when
// validateBlock finds no problem, and the tests assert the same rules. Each check returns a list
// of problems (empty when the rule holds).

import { assignFluidBoxes } from '../fluidboxes.js';

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
        const between = undergroundsOnLine(entities, a.name, dx !== 0, dx ? a.y : a.x)
          .find(e => e !== a && e !== b && (dx ? (e.x - a.x) / dx > 0 && (e.x - a.x) / dx < hop : (e.y - a.y) / dy > 0 && (e.y - a.y) / dy < hop));
        if (between) problems.push(`route ${route.id}: tunnel at ${a.x},${a.y} is interleaved with ${between.name} at ${between.x},${between.y}`);
      }
    } else if (a.kind === 'splitter' || b.kind === 'splitter') {
      // A splitter spans two tiles across its travel: the belt meets it, and leaves it, in line.
      const s = a.kind === 'splitter' ? a : b, other = s === a ? b : a;
      const [sx, sy] = DIR[s.direction];
      const lane = sx ? other.y - s.y : other.x - s.x;
      const ahead = s === a ? 1 : -1;
      const along = sx ? (other.x - s.x) * sx : (other.y - s.y) * sy;
      if (lane < 0 || lane > 1 || along !== ahead || (s === b && a.travel !== s.direction)) {
        problems.push(`route ${route.id}: piece ${i} at ${a.x},${a.y} does not feed piece ${i + 1} at ${b.x},${b.y}`);
      }
    } else if (b.x !== a.x + dx || b.y !== a.y + dy) {
      problems.push(`route ${route.id}: piece ${i} at ${a.x},${a.y} does not feed piece ${i + 1} at ${b.x},${b.y}`);
    }
  }
  return problems;
}

// Undergrounds of one type travelling along one axis on one line, indexed once per entity list.
const lineIndex = new WeakMap();
function undergroundsOnLine(entities, name, horizontal, line) {
  if (!lineIndex.has(entities)) {
    const index = new Map();
    for (const e of entities) {
      if (!e.underground || e.travel === undefined) continue;
      const h = DIR[e.travel][0] !== 0;
      const k = `${e.name}|${h}|${h ? e.y : e.x}`;
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(e);
    }
    lineIndex.set(entities, index);
  }
  return lineIndex.get(entities).get(`${name}|${horizontal}|${line}`) ?? [];
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

// Every inserter's pickup and drop tiles, and per machine the inserters dropping into it and
// picking up from it — worked out once per entity list.
const reachIndex = new WeakMap();
function inserterReach(entities, catalog) {
  if (!reachIndex.has(entities)) {
    const machineAt = new Map();
    for (const e of entities.filter(x => x.kind === 'building')) {
      for (let dx = 0; dx < e.w; dx++) for (let dy = 0; dy < e.h; dy++) machineAt.set(key(e.x + dx, e.y + dy), e);
    }
    const into = new Map(), outOf = new Map();
    const add = (map, m, v) => { if (m) { if (!map.has(m)) map.set(m, []); map.get(m).push(v); } };
    for (const ins of entities.filter(x => x.kind === 'inserter')) {
      const t = inserterTiles(ins, catalog);
      add(into, machineAt.get(t.drop), t);
      add(outOf, machineAt.get(t.pickup), t);
    }
    reachIndex.set(entities, { into, outOf });
  }
  return reachIndex.get(entities);
}

export function feedsEveryMachine(block, route, machines, catalog) {
  const tiles = routeTiles(route);
  const { into } = inserterReach(block.entities, catalog);
  return machines.filter(m => !(into.get(m) ?? []).some(({ pickup }) => tiles.has(pickup)))
    .map(m => `no inserter moves route ${route.id} into machine at ${m.x},${m.y}`);
}

// A machine with an Output Drop puts its products on its drop tile itself.
const dropTile = m => key(Math.floor(m.x + m.drop.x), Math.floor(m.y + m.drop.y));

export function drainsEveryMachine(block, route, machines, catalog) {
  const tiles = routeTiles(route);
  const { outOf } = inserterReach(block.entities, catalog);
  return machines.filter(m => !(m.drop && tiles.has(dropTile(m))) && !(outOf.get(m) ?? []).some(({ drop }) => tiles.has(drop)))
    .map(m => `no inserter moves output of machine at ${m.x},${m.y} onto route ${route.id}`);
}

// A machine with an Output Drop puts its products on whatever belt lies on its drop tile: only
// a belt of its own output may lie there.
export function dropsOnItsOwnBelt(block) {
  const belts = beltTiles(block.entities);
  return block.entities.filter(m => m.kind === 'building' && m.drop).flatMap(m => {
    const belt = belts.get(dropTile(m));
    return belt && block.routes[belt.route]?.source !== m.subBlock ? [`${m.name} at ${m.x},${m.y} drops its products on route ${belt.route}`] : [];
  });
}

// Output inserters at machines with an Output Drop: supporting their drops, or doing their work
// where no belt takes them.
export function supporting(block) {
  const dropping = new Set(block.entities.filter(e => e.kind === 'building' && e.drop).map(e => e.subBlock));
  return block.entities.filter(e => e.kind === 'inserter' && e.role === 'output' && dropping.has(e.subBlock)).length;
}

function beltTiles(entities) {
  const belts = new Map();
  for (const e of entities.filter(e => e.route !== undefined && ['belt', 'underground-belt', 'splitter'].includes(e.kind))) {
    for (const t of tilesOf(e)) belts.set(t, e);
  }
  return belts;
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

// Poles bucketed by centre: the poles within reach of a point without scanning them all.
function bucketed(poles, size) {
  const buckets = new Map();
  const cell = v => Math.floor(v / size);
  poles.forEach((p, i) => {
    const [cx, cy] = center(p);
    const k = `${cell(cx)},${cell(cy)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  });
  // Indices of poles whose centre lies within the box [x0, x1] × [y0, y1].
  return (x0, y0, x1, y1) => {
    const out = [];
    for (let bx = cell(x0); bx <= cell(x1); bx++) {
      for (let by = cell(y0); by <= cell(y1); by++) out.push(...(buckets.get(`${bx},${by}`) ?? []));
    }
    return out;
  };
}

// Each pole's neighbours in the wire graph: the poles within the shorter wire reach of the two;
// a City Block's poles (the first `anchors` of them) are all joined already.
function wireGraph(poles, reachOf, near, anchors) {
  return poles.map((p, i) => {
    const [ax, ay] = center(p);
    const reach = reachOf(p);
    const out = near(ax - reach, ay - reach, ax + reach, ay + reach).filter(j => {
      if (j === i) return false;
      const [bx, by] = center(poles[j]);
      return Math.hypot(ax - bx, ay - by) <= Math.min(reach, reachOf(poles[j]));
    });
    if (i < anchors) for (let j = 0; j < anchors; j++) if (j !== i && !out.includes(j)) out.push(j);
    return out;
  });
}

// Whether the poles are wired into one network.
function networkConnected(neighbours) {
  if (!neighbours.length) return true;
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    for (const j of neighbours[stack.pop()]) if (!seen.has(j)) { seen.add(j); stack.push(j); }
  }
  return seen.size === neighbours.length;
}

// The poles whose removal would split the network (Tarjan's lowlink, iteratively).
function articulationPoints(poles, neighbours) {
  const order = new Array(poles.length).fill(-1), low = new Array(poles.length).fill(0);
  const out = new Set();
  let time = 0;
  for (let root = 0; root < poles.length; root++) {
    if (order[root] >= 0) continue;
    order[root] = low[root] = time++;
    let children = 0;
    const stack = [{ v: root, parent: -1, k: 0 }];
    while (stack.length) {
      const top = stack.at(-1);
      if (top.k < neighbours[top.v].length) {
        const w = neighbours[top.v][top.k++];
        if (order[w] < 0) {
          order[w] = low[w] = time++;
          if (top.v === root) children++;
          stack.push({ v: w, parent: top.v, k: 0 });
        } else if (w !== top.parent) {
          low[top.v] = Math.min(low[top.v], order[w]);
        }
        continue;
      }
      stack.pop();
      const up = stack.at(-1);
      if (up) {
        low[up.v] = Math.min(low[up.v], low[top.v]);
        if (up.v !== root && low[top.v] >= order[up.v]) out.add(up.v);
      }
    }
    if (children > 1) out.add(root);
  }
  return out;
}

// Every machine and inserter powered, the poles one network, none of them redundant. In a City
// Block its poles (Fixtures) power what lies in their supply areas too, and are one network
// already: the block's own poles join it.
export function powerNetwork(block, catalog, logistics) {
  const spec = catalog.poles[logistics.pole];
  const anchors = (block.site?.fixtures ?? []).filter(f => catalog.poles[f.name]);
  const own = block.entities.filter(e => e.kind === 'pole');
  const poles = [...anchors, ...own];
  const specOf = p => (p.kind === 'fixture' ? catalog.poles[p.name] : spec);
  const needs = electricConsumers(block, catalog);
  const r = Math.max(...poles.map(p => specOf(p).supplyRadius), spec.supplyRadius);
  const supplyNear = bucketed(poles, Math.max(1, 2 * r));
  // The poles powering each consumer, and how many.
  const powering = needs.map(e => supplyNear(e.x - r, e.y - r, e.x + e.w + r, e.y + e.h + r).filter(i => powers(poles[i], specOf(poles[i]), e)));
  const problems = needs.filter((e, n) => !powering[n].length).map(e => `${e.name} at ${e.x},${e.y} is not powered`);
  const reach = Math.max(...poles.map(p => specOf(p).wireReach), spec.wireReach);
  const neighbours = wireGraph(poles, p => specOf(p).wireReach, bucketed(poles, Math.max(1, reach)), anchors.length);
  if (!networkConnected(neighbours)) problems.push('poles do not form one connected network');
  // A pole is redundant when every consumer it powers has another pole and the network holds
  // without it (it is no articulation point of the wire graph).
  const sole = new Set(powering.filter(list => list.length === 1).map(([i]) => i));
  const holding = articulationPoints(poles, neighbours);
  own.forEach((removed, k) => {
    const i = anchors.length + k;
    if (sole.has(i) || holding.has(i)) return;
    if (own.length === 1 && needs.length && !anchors.length) return;
    problems.push(`pole at ${removed.x},${removed.y} is redundant`);
  });
  return problems;
}

// In a City Block, everything stands inside its Buffer and off its Fixtures.
export function insideSite(block) {
  const { site } = block;
  if (!site) return [];
  const { inner } = site;
  const problems = block.entities.filter(e => e.x < inner.x || e.y < inner.y || e.x + e.w > inner.x + inner.w || e.y + e.h > inner.y + inner.h)
    .map(e => `${e.name} at ${e.x},${e.y} lies outside the city block's buffer`);
  const fixed = new Map();
  for (const f of site.fixtures) for (const t of tilesOf(f)) fixed.set(t, f);
  for (const e of block.entities) {
    const on = tilesOf(e).find(t => fixed.has(t));
    if (on) problems.push(`${e.name} at ${e.x},${e.y} stands on ${fixed.get(on).name} at ${on}`);
  }
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

// The tiles where a pipe meets a machine's connections for a fluid: those of every box the
// fluid takes (its Sub-Block's, a Liquid Fuel's too).
function portTiles(machine, catalog, fluid, role, block) {
  const building = catalog.buildings[machine.name];
  const all = block?.subBlocks?.[machine.subBlock]?.boxes ?? assignFluidBoxes(catalog.recipes[machine.recipe], building);
  const boxes = all[role === 'input' ? 'inputs' : 'outputs'][fluid] ?? [];
  // Rotating clockwise by a quarter turn maps (x, y) to (-y, x).
  const rotate = ({ x, y }, turns) => (turns === 0 ? [x, y] : rotate({ x: -y, y: x }, turns - 1));
  const cx = machine.x + machine.w / 2, cy = machine.y + machine.h / 2;
  // (A mirrored machine's connections flipped east to west before it turns.)
  const flipped = c => (machine.mirror ? { ...c, x: -c.x, direction: (16 - c.direction) % 16 } : c);
  return boxes.flatMap(b => building.fluidBoxes[b].connections).map(flipped).map(c => {
    const [rx, ry] = rotate(c, machine.direction / 4);
    const dir = (c.direction + machine.direction) % 16;
    const [dx, dy] = DIR[dir];
    // (from: the machine's own tile the connection lies on.)
    return {
      tile: key(Math.floor(cx + rx + dx), Math.floor(cy + ry + dy)), towardBuilding: OPPOSITE[dir],
      from: key(Math.floor(cx + rx), Math.floor(cy + ry)), through: !!c.through,
    };
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
  // A machine is reached by a pipe at one of its connections, or through a neighbour's: two
  // connections letting fluid both ways (through) facing each other join their machines' boxes.
  const ports = new Map(machines.map(m => [m, portTiles(m, catalog, route.fluid, m.recipe === producer ? 'output' : 'input', block)]));
  const reached = new Set(machines.filter(m => ports.get(m).some(({ tile, towardBuilding }) => own.has(tile) && connectsToward(own.get(tile), towardBuilding))));
  const joined = (a, b) => ports.get(a).some(p => p.through && ports.get(b).some(q => q.through && q.tile === p.from && p.tile === q.from));
  for (let grew = true; grew;) {
    grew = false;
    for (const m of machines) {
      if (reached.has(m) || ![...reached].some(n => joined(m, n))) continue;
      reached.add(m);
      grew = true;
    }
  }
  for (const m of machines.filter(m => !reached.has(m))) problems.push(`${route.fluid} does not reach ${m.name} at ${m.x},${m.y}`);
  if (route.source === 'side-input' && !pieces.some(p => p.x === block.bounds.x) && drawnFrom(block, route) === null) problems.push(`${route.fluid} does not start at the west edge`);
  if (route.sink === 'side-output' && !pieces.some(p => p.x === block.bounds.x + block.bounds.w - 1)) problems.push(`${route.fluid} does not reach the east edge`);
  return problems;
}

// The route of the pipe the layout before an Annex built (a Fixture of its City Block) that a
// Side Input of the Annex joins, drawing its fluid from it (ADR 0032), or null.
export function drawnFrom(block, route) {
  const built = new Map((block.site?.fixtures ?? []).filter(f => (f.kind === 'pipe' || f.kind === 'pipe-to-ground') && f.fluid === route.fluid).map(f => [key(f.x, f.y), f]));
  if (!built.size) return null;
  for (const p of route.pieces) {
    for (const [d, [dx, dy]] of Object.entries(DIR)) {
      const b = built.get(key(p.x + dx, p.y + dy));
      if (b && connectsToward(p, +d) && connectsToward(b, OPPOSITE[d])) return b.route;
    }
  }
  return null;
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
      for (const { tile, towardBuilding } of portTiles(m, catalog, f.name, role, block)) {
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
  // A byproduct's belt joining another that carries it there (side-loading onto it): its last
  // belt heads into the side of one of that one's.
  if (route.joins !== undefined) {
    const other = block.routes[route.joins];
    const [dx, dy] = DIR[last.travel];
    const into = other?.pieces.find(p => p.x === last.x + dx && p.y === last.y + dy);
    if (!into || into.kind === 'splitter' || into.travel === last.travel || into.travel === (last.travel + 8) % 16) return [`route ${route.id} does not join route ${route.joins} from the side`];
    return endsAtEastEdge(block, other);
  }
  if (last.x !== block.bounds.x + block.bounds.w - 1) return [`route ${route.id} does not reach the east edge`];
  if (last.travel !== 4) return [`route ${route.id} does not leave eastward`];
  return [];
}

function startsAtWestEdge(block, route) {
  return route.pieces[0].x === block.bounds.x ? [] : [`route ${route.id} does not start at the west edge`];
}

// A Side Input's belt in a Fan-out starts at a splitter on the belt from the west edge; a Recipe
// Loop's feedback, at one on its producer's output belt.
function fedBySplitter(block, route) {
  const [s] = route.pieces;
  const trunk = block.routes[route.fedBy];
  if (s.kind !== 'splitter' || !trunk.pieces.some(p => p.kind === 'splitter' && p.x === s.x && p.y === s.y)) return [`route ${route.id} does not start at a splitter of route ${route.fedBy}`];
  return trunk.source === 'side-input' ? startsAtWestEdge(block, trunk) : [];
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
    ...dropsOnItsOwnBelt(block),
    ...insideSite(block),
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
    else if (route.fedBy !== undefined) problems.push(...fedBySplitter(block, route));
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
