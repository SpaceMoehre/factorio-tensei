import { Heap } from './router.js';

export class PowerError extends Error {
  /** @type {{ x: number, y: number } | undefined} where a machine found no pole to power it */
  at;
}

const center = e => [e.x + e.w / 2, e.y + e.h / 2];
const distance = (a, b) => {
  const [ax, ay] = center(a), [bx, by] = center(b);
  return Math.hypot(ax - bx, ay - by);
};

// Minimal Pole Placement: greedy cover of every consumer's footprint by supply areas, then
// bridge poles until the network is connected, then drop any pole that is redundant. Poles may
// also stand in the strips just north and south of the block (growing it), never west or east,
// where the Side Input and Side Output edges are; a spot inside wins a tie.
// Spatial indexes keep it fast on blocks with thousands of machines and inserters.
// options: { fixed: a City Block's poles, each with its own spec ({ x, y, w, h, spec }) — they
//            power what lies in their supply areas and are one network already, which the new
//            poles join; inside: no pole outside the grid's area }
export function placePoles(grid, consumers, spec, { fixed = [], inside = false } = {}) {
  const { x: ax, y: ay, w: aw, h: ah } = grid.area;
  const { w: pw, h: ph } = spec.size;
  const r = spec.supplyRadius;
  const anchors = fixed.map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h, reach: f.spec.wireReach }));
  consumers = consumers.filter(e => !fixed.some(f => powers(f, f.spec, e)));
  // Candidate positions on a dense index: column x - ax, row y - y0.
  const y0 = inside ? ay : ay - ph, cols = aw - pw + 1, rows = inside ? ah - ph + 1 : ah + ph + 1;
  if (cols <= 0 || rows <= 0) throw new PowerError('the block is narrower than a pole');
  const index = (x, y) => (y - y0) * cols + (x - ax);
  const fitsAt = new Uint8Array(cols * rows);
  for (let y = y0; y < y0 + rows; y++) {
    for (let x = ax; x < ax + cols; x++) if (fits(grid, x, y, pw, ph)) fitsAt[index(x, y)] = 1;
  }
  // For each candidate, the consumers it powers; for each consumer, the candidates powering it.
  const covers = new Map();
  const poweredBy = consumers.map((e, i) => {
    const out = [];
    const xs = Math.floor(e.x - r - pw / 2) + 1, xe = Math.ceil(e.x + e.w + r - pw / 2) - 1;
    const ys = Math.floor(e.y - r - ph / 2) + 1, ye = Math.ceil(e.y + e.h + r - ph / 2) - 1;
    for (let y = Math.max(ys, y0); y <= Math.min(ye, y0 + rows - 1); y++) {
      for (let x = Math.max(xs, ax); x <= Math.min(xe, ax + cols - 1); x++) {
        const c = index(x, y);
        if (!fitsAt[c]) continue;
        out.push(c);
        if (!covers.has(c)) covers.set(c, []);
        covers.get(c).push(i);
      }
    }
    return out;
  });
  const position = c => ({ x: ax + (c % cols), y: y0 + Math.floor(c / cols) });
  const outside = c => {
    const { y } = position(c);
    return y < ay || y + ph > ay + ah;
  };
  // Each pole remembers its candidate index while placing; it is dropped before returning.
  const pole = c => ({ name: spec.name, kind: 'pole', ...position(c), w: pw, h: ph, direction: 0, candidate: c });

  // Greedy cover: the candidate powering the most consumers not yet powered; among equals, one
  // inside the block, then the one nearest a pole already placed.
  const gain = new Int32Array(cols * rows);
  for (const [c, list] of covers) gain[c] = list.length;
  const blocked = new Uint8Array(cols * rows);
  const poles = [];
  const placed = new Buckets(spec.wireReach);
  const coverCount = new Int32Array(consumers.length);
  let uncovered = consumers.length;
  // Candidates by gain, so each round looks only at the best ones. Among equals: inside the block
  // first, then the one nearest the last pole placed (poles grow out from each other and stay
  // wired together).
  const byGain = [];
  const file = c => (byGain[gain[c]] ??= new Set()).add(c);
  for (const c of [...covers.keys()].sort((a, b) => a - b)) file(c);
  const regain = (c, before) => {
    byGain[before]?.delete(c);
    if (gain[c] > 0 && !blocked[c]) file(c);
  };
  const addAndRefile = c => {
    const touched = new Map();
    const p = pole(c);
    poles.push(p);
    placed.add(p);
    for (let y = p.y - ph + 1; y < p.y + ph; y++) {
      for (let x = p.x - pw + 1; x < p.x + pw; x++) {
        if (x < ax || x >= ax + cols || y < y0 || y >= y0 + rows) continue;
        const d = index(x, y);
        if (!blocked[d]) { blocked[d] = 1; byGain[gain[d]]?.delete(d); }
      }
    }
    for (const i of covers.get(c) ?? []) {
      if (coverCount[i]++ === 0) {
        uncovered--;
        for (const d of poweredBy[i]) {
          if (!touched.has(d)) touched.set(d, gain[d]);
          gain[d]--;
        }
      }
    }
    for (const [d, before] of touched) regain(d, before);
    return p;
  };
  let last = null;
  let top = byGain.length - 1;
  while (uncovered > 0) {
    while (top > 0 && !byGain[top]?.size) top--;
    if (top <= 0) {
      const i = consumers.findIndex((_, j) => coverCount[j] === 0);
      throw Object.assign(new PowerError(`no free tile can power ${consumers[i].name} at ${consumers[i].x},${consumers[i].y}`), { at: { x: consumers[i].x, y: consumers[i].y } });
    }
    let best = -1, bestKey = Infinity;
    for (const c of byGain[top]) {
      const { x, y } = position(c);
      const key = (outside(c) ? 1e9 : 0) + (last ? Math.abs(x - last.x) + Math.abs(y - last.y) : 0);
      if (key < bestKey) { best = c; bestKey = key; }
    }
    last = addAndRefile(best);
  }

  const free = [];
  for (let c = 0; c < cols * rows; c++) if (fitsAt[c] && !blocked[c]) free.push(pole(c));
  const greedy = poles.length;
  connect(poles, free, spec, placed, anchors);
  // Bridging poles power what lies in their reach too.
  for (const p of poles.slice(greedy)) for (const i of covers.get(p.candidate) ?? []) coverCount[i]++;
  prune(poles, spec, coverCount, p => covers.get(p.candidate) ?? [], anchors);
  for (const p of poles) {
    delete p.candidate;
    grid.place(p);
  }
  return poles;
}

// Joins the network one component at a time: the smallest component searches outward — a
// breadth-first search over free pole positions, each hop within wire reach — for the nearest
// pole of another component, and the fewest poles linking them are placed, even where the link
// has to go around machines. Components are kept in a union-find as poles join them. Anchors (a
// City Block's poles, each with its reach) are one component from the start.
function connect(poles, free, spec, placed, anchors = []) {
  const reach = spec.wireReach;
  // Two poles wire together within the shorter reach of the two.
  const near = (a, b) => distance(a, b) <= Math.min(a.reach ?? reach, b.reach ?? reach);
  const spots = new Buckets(reach);
  for (const c of free) spots.add(c);
  // Toward far-off anchors, poles of a long reach (a nexelit substation's 60 tiles) hop between
  // spots a few tiles apart, not every free tile in reach (thousands of them, each a step of the
  // search): the first free spot of each cell a sixth of the reach wide.
  const cell = Math.floor(reach / 6);
  let sparse = null;
  if (anchors.length && cell >= 4) {
    sparse = new Buckets(reach);
    const seen = new Set();
    for (const c of free) {
      const k = Math.floor(c.x / cell) * 100003 + Math.floor(c.y / cell);
      if (seen.has(k)) continue;
      seen.add(k);
      sparse.add(c);
    }
  }
  const used = new Set();
  const parentOf = new Map();
  const root = p => {
    let r = p;
    while (parentOf.get(r) !== r) r = parentOf.get(r);
    for (let q = p; parentOf.get(q) !== r;) { const next = parentOf.get(q); parentOf.set(q, r); q = next; }
    return r;
  };
  const join = (a, b) => { const ra = root(a), rb = root(b); if (ra !== rb) parentOf.set(ra, rb); };
  const add = p => {
    parentOf.set(p, p);
    for (const q of placed.within(p, reach)) if (q !== p && parentOf.has(q) && near(p, q)) join(p, q);
  };
  for (const a of anchors) {
    placed.add(a);
    parentOf.set(a, anchors[0]);
  }
  for (const p of poles) parentOf.set(p, p);
  for (const p of poles) for (const q of placed.within(p, reach)) if (q !== p && parentOf.has(q) && near(p, q)) join(p, q);
  for (;;) {
    const groups = new Map();
    for (const p of [...anchors, ...poles]) {
      const r = root(p);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(p);
    }
    if (groups.size <= 1) return;
    // Never from the anchors' network: it may be large, and every other component joins it.
    const anchored = anchors.length ? root(anchors[0]) : null;
    const start = [...groups].filter(([r]) => r !== anchored).map(([, g]) => g).reduce((a, b) => (b.length < a.length ? b : a));
    const own = root(start[0]);
    const parent = new Map();
    for (const p of start) parent.set(p, null);
    // Whether a pole at `node` wires to another component; the free spots it wires to.
    const reaches = node => placed.within(node, reach).some(p => parentOf.has(p) && root(p) !== own && near(node, p));
    const around = (node, from = spots) => from.within(node, reach).filter(c => !used.has(c) && !overlaps(c, node) && distance(node, c) <= reach
      && !placed.within(c, 0).some(p => overlaps(p, c)));
    let reached = null;
    if (anchors.length) reached = toward(start, own, parent, reaches, node => around(node, sparse ?? spots));
    else {
      let frontier = [...start];
      while (frontier.length) {
        // A wave's poles are all asked first: one that reaches ends the search before it spreads.
        reached = frontier.find(reaches) ?? null;
        if (reached) break;
        const next = [];
        for (const node of frontier) {
          for (const c of around(node)) {
            if (parent.has(c)) continue;
            parent.set(c, node);
            next.push(c);
          }
        }
        frontier = next;
      }
    }
    if (!reached) throw new PowerError('cannot connect all poles into one network');
    for (let n = reached; parent.get(n) !== null; n = parent.get(n)) {
      poles.push(n);
      placed.add(n);
      used.add(n);
      add(n);
    }
  }

  // Toward a City Block's network, which may stand far off: best first by the fewest hops a
  // chain from `start` could still need (its hops so far, and the distance left in wire reaches),
  // the nearest first among equals. Fills in `parent`; returns the spot that reaches, or null.
  function toward(start, own, parent, reaches, around) {
    const targets = new Buckets(reach);
    for (const p of [...anchors, ...poles]) if (root(p) !== own) targets.add(p);
    const hops = new Map(start.map(p => [p, 0]));
    const done = new Set();
    const open = new Heap();
    const push = (node, g) => {
      const d = Math.min(targets.nearest(node), 1e5);
      open.push(node, (g + Math.max(0, Math.ceil((d - reach) / reach))) * 1e6 + d);
    };
    for (const p of start) push(p, 0);
    while (open.size) {
      const node = open.pop();
      if (done.has(node)) continue;
      done.add(node);
      if (reaches(node)) return node;
      const g = hops.get(node) + 1;
      for (const c of around(node)) {
        if (hops.has(c) && hops.get(c) <= g) continue;
        hops.set(c, g);
        parent.set(c, node);
        push(c, g);
      }
    }
    return null;
  }
}

// Removes poles whose consumers are all powered by others and whose loss keeps the network
// connected, last placed first. Poles holding the wire graph together (its articulation points)
// are found once; after a removal, whether the network survives losing a pole is checked
// locally: searches from each of its neighbours grow, smallest first, until they all meet (it
// can go) or one runs out (it holds a part on its own). Anchors stay, wired to each other.
function prune(poles, spec, coverCount, coveredBy, anchors = []) {
  const reach = spec.wireReach;
  const all = [...anchors, ...poles];
  const links = new Buckets(reach);
  for (const p of all) links.add(p);
  const near = (a, b) => distance(a, b) <= Math.min(a.reach ?? reach, b.reach ?? reach);
  const wired = new Map(all.map(p => [p, links.within(p, p.reach ?? reach).filter(q => q !== p && near(p, q))]));
  for (const a of anchors) wired.set(a, [...new Set([...wired.get(a), ...anchors.filter(b => b !== a)])]);
  const holding = articulation(all, wired);
  let removed = 0;
  // (Again while a pass removes any: one passed over as holding a pole removed after it can go.)
  for (let before = -1; removed > before;) {
    before = removed;
    for (let i = poles.length - 1; i >= 0; i--) {
      const p = poles[i];
      const mine = coveredBy(p);
      if ((poles.length === 1 && !anchors.length) || mine.some(c => coverCount[c] < 2) || holding.has(p)) continue;
      if (removed && !reconnects(p, wired)) continue;
      for (const q of wired.get(p)) {
        wired.set(q, wired.get(q).filter(n => n !== p));
        // A pole holding up only this one no longer holds anything.
        holding.delete(q);
      }
      wired.delete(p);
      for (const c of mine) coverCount[c]--;
      poles.splice(i, 1);
      removed++;
    }
  }
}

// Whether the poles wired to p stay connected without it.
function reconnects(p, wired) {
  const ends = wired.get(p);
  if (ends.length <= 1) return true;
  const group = new Map(), root = g => (group.get(g) === g ? g : root(group.get(g)));
  const seen = new Map(), queue = new Map(), size = new Map();
  ends.forEach((q, g) => { group.set(g, g); seen.set(q, g); queue.set(g, [q]); size.set(g, 1); });
  let groups = ends.length;
  for (;;) {
    let g = -1;
    for (const [k, list] of queue) {
      if (!list.length) return false;
      if (g < 0 || size.get(k) < size.get(g)) g = k;
    }
    const u = queue.get(g).pop();
    for (const w of wired.get(u)) {
      if (w === p) continue;
      if (!seen.has(w)) {
        seen.set(w, g);
        queue.get(g).push(w);
        size.set(g, size.get(g) + 1);
        continue;
      }
      const h = root(seen.get(w));
      if (h === g) continue;
      group.set(h, g);
      queue.get(g).push(...queue.get(h));
      size.set(g, size.get(g) + size.get(h));
      queue.delete(h);
      if (--groups === 1) return true;
    }
  }
}

// The poles whose removal would split the wire graph (Tarjan's lowlink, iteratively).
function articulation(poles, wired) {
  const at = new Map(poles.map((p, i) => [p, i]));
  const neighbours = poles.map(p => wired.get(p).map(q => at.get(q)));
  const order = new Array(poles.length).fill(-1), low = new Array(poles.length).fill(0);
  const out = new Set();
  let time = 0;
  for (let rootIndex = 0; rootIndex < poles.length; rootIndex++) {
    if (order[rootIndex] >= 0) continue;
    order[rootIndex] = low[rootIndex] = time++;
    let children = 0;
    const stack = [{ v: rootIndex, parent: -1, k: 0 }];
    while (stack.length) {
      const top = stack.at(-1);
      if (top.k < neighbours[top.v].length) {
        const w = neighbours[top.v][top.k++];
        if (order[w] < 0) {
          order[w] = low[w] = time++;
          if (top.v === rootIndex) children++;
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
        if (up.v !== rootIndex && low[top.v] >= order[up.v]) out.add(poles[up.v]);
      }
    }
    if (children > 1) out.add(poles[rootIndex]);
  }
  return out;
}

// Entities bucketed by their centre, for "everything within d of this" queries.
class Buckets {
  constructor(size) {
    this.size = Math.max(1, size);
    this.map = new Map();
  }

  key(bx, by) { return bx * 100003 + by; }

  add(e) {
    const [cx, cy] = center(e);
    const k = this.key(Math.floor(cx / this.size), Math.floor(cy / this.size));
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(e);
  }

  // Everything whose centre may lie within d of e's centre (a superset; callers check exactly).
  within(e, d) {
    const [cx, cy] = center(e);
    const span = Math.ceil((d + 1) / this.size);
    const bx = Math.floor(cx / this.size), by = Math.floor(cy / this.size);
    const out = [];
    for (let dx = -span; dx <= span; dx++) {
      for (let dy = -span; dy <= span; dy++) {
        const list = this.map.get(this.key(bx + dx, by + dy));
        if (list) for (const x of list) out.push(x);
      }
    }
    return out;
  }

  // Distance from e to the nearest entity, searching outward ring by ring.
  nearest(e) {
    if (!this.map.size) return Infinity;
    const [cx, cy] = center(e);
    const bx = Math.floor(cx / this.size), by = Math.floor(cy / this.size);
    let best = Infinity;
    const visit = (x, y) => {
      const list = this.map.get(this.key(x, y));
      if (list) for (const o of list) best = Math.min(best, distance(e, o));
    };
    for (let ring = 0; ; ring++) {
      // Anything in a farther ring lies at least (ring - 1) buckets away.
      if (best <= (ring - 1) * this.size) return best;
      if (ring === 0) { visit(bx, by); continue; }
      for (let d = -ring; d <= ring; d++) {
        visit(bx + d, by - ring);
        visit(bx + d, by + ring);
        if (d > -ring && d < ring) { visit(bx - ring, by + d); visit(bx + ring, by + d); }
      }
      if (ring > 100000) return best;
    }
  }
}

function powers(pole, spec, e) {
  const [cx, cy] = center(pole);
  const r = spec.supplyRadius;
  return e.x < cx + r && e.x + e.w > cx - r && e.y < cy + r && e.y + e.h > cy - r;
}

function fits(grid, x, y, w, h) {
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) if (grid.at(x + dx, y + dy)) return false;
  }
  return true;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
