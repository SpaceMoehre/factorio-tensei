// Copper wires between poles: Kruskal over pole pairs within wire reach, the shortest wires
// that join every pole. Returns pairs of indices into `entities`, followed by `fixtures`: a City
// Block's poles are one network already, and wires join the block's own poles to it.
export function wirePairs(entities, catalog, fixtures = []) {
  const poles = entities.map((e, i) => ({ e, i })).filter(p => p.e.kind === 'pole');
  const anchors = fixtures.map((e, j) => ({ e, i: entities.length + j })).filter(p => catalog.poles[p.e.name]);
  const all = [...anchors, ...poles];
  const center = ({ e }) => [e.x + e.w / 2, e.y + e.h / 2];
  const edges = [];
  all.forEach((a, n) => all.slice(n + 1).forEach((b, m) => {
    if (n + 1 + m < anchors.length) return;
    const [ax, ay] = center(a), [bx, by] = center(b);
    const d = Math.hypot(ax - bx, ay - by);
    const reach = Math.min(catalog.poles[a.e.name].wireReach, catalog.poles[b.e.name].wireReach);
    if (d <= reach) edges.push({ a: a.i, b: b.i, d });
  }));
  edges.sort((p, q) => p.d - q.d || p.a - q.a || p.b - q.b);
  const parent = new Map(all.map(p => [p.i, anchors.length ? (p.i >= entities.length ? anchors[0].i : p.i) : p.i]));
  const root = n => (parent.get(n) === n ? n : root(parent.get(n)));
  const wires = [];
  for (const { a, b } of edges) {
    const ra = root(a), rb = root(b);
    if (ra === rb) continue;
    parent.set(ra, rb);
    wires.push([a, b]);
  }
  return wires;
}

// A circuit wire from an inserter reaches 9 tiles (Factorio's circuit_wire_max_distance for
// inserters); from a pole, as far as its copper wires. A wire spans no more than the shorter
// reach of its two ends.
export const INSERTER_WIRE_REACH = 9;

// Circuit wires (red, green or both) putting every pole and inserter of the block on one
// circuit network: Kruskal over pairs within reach, the shortest wires that join them. A City
// Block's poles may carry it across, never wired to each other (its own wires stay as they
// are). Returns pairs of indices into `entities`, followed by `fixtures`, like wirePairs.
export function circuitPairs(entities, catalog, fixtures = []) {
  const nodes = [];
  entities.forEach((e, i) => {
    if (e.kind === 'pole') nodes.push({ i, e, reach: catalog.poles[e.name]?.wireReach ?? INSERTER_WIRE_REACH, pole: true, fixture: false });
    else if (e.kind === 'inserter') nodes.push({ i, e, reach: INSERTER_WIRE_REACH, pole: false, fixture: false });
  });
  fixtures.forEach((e, j) => {
    if (catalog.poles[e.name]) nodes.push({ i: entities.length + j, e, reach: catalog.poles[e.name].wireReach, pole: true, fixture: true });
  });
  for (const n of nodes) [n.x, n.y] = [n.e.x + n.e.w / 2, n.e.y + n.e.h / 2];
  const edges = [];
  const consider = (a, b) => {
    if (a.fixture && b.fixture) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d <= Math.min(a.reach, b.reach)) edges.push({ a, b, d });
  };
  // Within an inserter's reach: neighbours in a grid of cells that wide.
  const cell = INSERTER_WIRE_REACH;
  const cells = new Map();
  nodes.forEach((n, k) => {
    n.k = k;
    const c = `${Math.floor(n.x / cell)},${Math.floor(n.y / cell)}`;
    if (!cells.has(c)) cells.set(c, []);
    cells.get(c).push(n);
  });
  for (const a of nodes) {
    const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const b of cells.get(`${cx + dx},${cy + dy}`) ?? []) if (b.k > a.k) consider(a, b);
    }
  }
  // Poles further apart than that.
  const poles = nodes.filter(n => n.pole);
  poles.forEach((a, m) => poles.slice(m + 1).forEach(b => {
    if (Math.hypot(a.x - b.x, a.y - b.y) > cell) consider(a, b);
  }));
  edges.sort((p, q) => p.d - q.d || p.a.i - q.a.i || p.b.i - q.b.i);
  const parent = nodes.map((_, k) => k);
  const root = k => (parent[k] === k ? k : (parent[k] = root(parent[k])));
  const wires = [];
  for (const { a, b } of edges) {
    const ra = root(a.k), rb = root(b.k);
    if (ra === rb) continue;
    parent[ra] = rb;
    wires.push([a.i, b.i]);
  }
  return wires;
}
