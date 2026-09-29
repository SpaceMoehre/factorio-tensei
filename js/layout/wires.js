// Copper wires between poles: Kruskal over pole pairs within wire reach, the shortest wires
// that join every pole. Returns pairs of indices into `entities`.
export function wirePairs(entities, catalog) {
  const poles = entities.map((e, i) => ({ e, i })).filter(p => p.e.kind === 'pole');
  const center = ({ e }) => [e.x + e.w / 2, e.y + e.h / 2];
  const edges = [];
  poles.forEach((a, n) => poles.slice(n + 1).forEach(b => {
    const [ax, ay] = center(a), [bx, by] = center(b);
    const d = Math.hypot(ax - bx, ay - by);
    const reach = Math.min(catalog.poles[a.e.name].wireReach, catalog.poles[b.e.name].wireReach);
    if (d <= reach) edges.push({ a: a.i, b: b.i, d });
  }));
  edges.sort((p, q) => p.d - q.d || p.a - q.a || p.b - q.b);
  const parent = new Map(poles.map(p => [p.i, p.i]));
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
