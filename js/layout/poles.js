export class PowerError extends Error {}

const center = e => [e.x + e.w / 2, e.y + e.h / 2];
const distance = (a, b) => {
  const [ax, ay] = center(a), [bx, by] = center(b);
  return Math.hypot(ax - bx, ay - by);
};

// Minimal Pole Placement: greedy cover of every consumer's footprint by supply areas, then
// bridge poles until the network is connected, then drop any pole that is redundant.
export function placePoles(grid, consumers, spec) {
  const candidates = [];
  const { x: ax, y: ay, w: aw, h: ah } = grid.area;
  for (let y = ay; y + spec.size.h <= ay + ah; y++) {
    for (let x = ax; x + spec.size.w <= ax + aw; x++) {
      const pole = { name: spec.name, kind: 'pole', x, y, w: spec.size.w, h: spec.size.h, direction: 0 };
      if (!fits(grid, pole)) continue;
      pole.covers = consumers.map((c, i) => (powers(pole, spec, c) ? i : -1)).filter(i => i >= 0);
      candidates.push(pole);
    }
  }

  const poles = [];
  const covered = new Set();
  while (covered.size < consumers.length) {
    let best = null, bestGain = 0, bestDist = Infinity;
    for (const c of candidates) {
      if (poles.some(p => overlaps(p, c))) continue;
      const gain = c.covers.filter(i => !covered.has(i)).length;
      if (gain === 0) continue;
      const dist = poles.length ? Math.min(...poles.map(p => distance(p, c))) : 0;
      if (gain > bestGain || (gain === bestGain && dist < bestDist)) { best = c; bestGain = gain; bestDist = dist; }
    }
    if (!best) {
      const i = consumers.findIndex((_, i) => !covered.has(i));
      throw new PowerError(`no free tile can power ${consumers[i].name} at ${consumers[i].x},${consumers[i].y}`);
    }
    poles.push(best);
    best.covers.forEach(i => covered.add(i));
  }

  connect(poles, candidates, spec);
  prune(poles, consumers, spec);
  for (const p of poles) {
    delete p.covers;
    grid.place(p);
  }
  return poles;
}

// Joins the network one component at a time: a breadth-first search over free pole positions
// (each hop within wire reach) finds the fewest extra poles linking the main component to any
// other pole, even when the link has to go around machines.
function connect(poles, candidates, spec) {
  for (;;) {
    const main = component(poles, spec);
    if (main.size === poles.length) return;
    const free = candidates.filter(c => !poles.some(p => overlaps(p, c)));
    const buckets = bucketize(free, spec.wireReach);
    const outside = new Set(poles.filter((_, i) => !main.has(i)));
    const parent = new Map();
    let frontier = poles.filter((_, i) => main.has(i));
    frontier.forEach(p => parent.set(p, null));
    let reached = null;
    while (frontier.length && !reached) {
      const next = [];
      for (const node of frontier) {
        const other = [...outside].find(p => distance(node, p) <= spec.wireReach);
        if (other) { reached = node; break; }
        for (const c of nearby(buckets, node)) {
          if (parent.has(c) || overlaps(c, node) || distance(node, c) > spec.wireReach) continue;
          parent.set(c, node);
          next.push(c);
        }
      }
      frontier = next;
    }
    if (!reached) throw new PowerError('cannot connect all poles into one network');
    for (let n = reached; parent.get(n) !== null; n = parent.get(n)) poles.push(n);
  }
}

function bucketize(items, size) {
  const buckets = new Map();
  for (const c of items) {
    const k = `${Math.floor(c.x / size)},${Math.floor(c.y / size)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  }
  return { buckets, size };
}

function* nearby({ buckets, size }, node) {
  // Buckets are one wire reach wide, so everything in reach lies within two buckets.
  const span = 2;
  const bx = Math.floor(node.x / size), by = Math.floor(node.y / size);
  for (let dx = -span; dx <= span; dx++) {
    for (let dy = -span; dy <= span; dy++) yield* buckets.get(`${bx + dx},${by + dy}`) ?? [];
  }
}

function prune(poles, consumers, spec) {
  for (let i = poles.length - 1; i >= 0; i--) {
    const rest = poles.filter((_, j) => j !== i);
    const allPowered = consumers.every(c => rest.some(p => powers(p, spec, c)));
    if (allPowered && component(rest, spec).size === rest.length) poles.splice(i, 1);
  }
}

// The poles wired, directly or through others, to the first pole.
function component(poles, spec) {
  const seen = new Set();
  if (!poles.length) return seen;
  const stack = [0];
  seen.add(0);
  while (stack.length) {
    const a = poles[stack.pop()];
    poles.forEach((b, j) => {
      if (!seen.has(j) && distance(a, b) <= spec.wireReach) { seen.add(j); stack.push(j); }
    });
  }
  return seen;
}

function powers(pole, spec, e) {
  const [cx, cy] = center(pole);
  const r = spec.supplyRadius;
  return e.x < cx + r && e.x + e.w > cx - r && e.y < cy + r && e.y + e.h > cy - r;
}

function fits(grid, pole) {
  for (let dx = 0; dx < pole.w; dx++) {
    for (let dy = 0; dy < pole.h; dy++) if (grid.at(pole.x + dx, pole.y + dy)) return false;
  }
  return true;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
