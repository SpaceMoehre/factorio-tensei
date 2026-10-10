// Path Flow: how much of a producer's output its belts deliver, as a max-flow. Every machine makes
// up to its full rate (its share of the path's total at most, which its inputs are sized for);
// its output inserters drop onto the lanes of the belts they reach, each lane carrying half a
// belt. A machine with inserters onto two belts is not split in fixed shares: an inserter whose
// lane is full waits with its item, so the machine's output goes wherever there is room (Two-Way
// Output). Splitters join belts after their producers: lane to lane, either input to either
// output (2 to 2, 2 to 1, 1 to 2). Each belt then brings its consumers what they take, at most.
// In the game backpressure settles the network where every belt is either backed up or fed all
// its machines can spare, which is the max-flow for these networks (each machine on one or two
// neighbouring belts).
const EPS = 1e-9;

// spec: {
//   lane: items/min one lane carries,
//   total: the most all machines make together,
//   machines: Map(machine key → its full rate),
//   belts: [{ want, drops: [{ machine, left, right, either, free }] }] — want: what its
//          consumers take (Infinity: all it carries); drops: items/min a machine's inserters can
//          put on its left lane, its right lane, a lane the drop leaves undecided (either), or a
//          lane the module may still choose (free: either, as it likes),
//   splitters: [{ ins: [belt index], outs: [belt index] }] }
// Returns { total, delivered: [per belt] }. An undecided lane may be either: the worse case of
// all of them on the left and all on the right counts.
export function pathFlow(spec) {
  const either = spec.belts.some(b => b.drops.some(d => (d.either ?? 0) > EPS));
  const left = solve(spec, 'left');
  if (!either) return left;
  const right = solve(spec, 'right');
  return right.total < left.total ? right : left;
}

function solve({ lane, total, machines, belts, splitters = [] }, side) {
  const net = new Network();
  const source = net.node(), sink = net.node(), pool = net.node();
  net.edge(source, pool, total);
  const machine = new Map();
  for (const [k, cap] of machines) {
    const n = net.node();
    machine.set(k, n);
    net.edge(pool, n, cap);
  }
  // Each belt's lanes where its producers drop (upstream), and its consumers' end.
  const up = belts.map(() => ({ left: net.node(), right: net.node() }));
  const end = belts.map(b => {
    const n = net.node();
    net.edge(n, sink, Number.isFinite(b.want) ? b.want : 2 * lane);
    return n;
  });
  belts.forEach((b, i) => {
    for (const d of b.drops) {
      const m = machine.get(d.machine);
      if (m === undefined) continue;
      const l = d.left + (side === 'left' ? d.either ?? 0 : 0), r = d.right + (side === 'right' ? d.either ?? 0 : 0);
      if (l > EPS) net.edge(m, up[i].left, l);
      if (r > EPS) net.edge(m, up[i].right, r);
      if (d.free > EPS) {
        const choice = net.node();
        net.edge(m, choice, d.free);
        net.edge(choice, up[i].left, d.free);
        net.edge(choice, up[i].right, d.free);
      }
    }
  });
  const joined = new Set();
  for (const s of splitters) {
    for (const k of ['left', 'right']) {
      const hub = net.node();
      for (const i of s.ins) net.edge(up[i][k], hub, lane);
      for (const o of s.outs) net.edge(hub, end[o], lane);
    }
    s.ins.forEach(i => joined.add(i));
  }
  belts.forEach((b, i) => {
    if (joined.has(i)) return;
    net.edge(up[i].left, end[i], lane);
    net.edge(up[i].right, end[i], lane);
  });
  const flow = net.max(source, sink);
  return { total: flow, delivered: end.map(n => net.flowOut(n, sink)) };
}

// Max-flow by Dinic's algorithm, over real capacities.
class Network {
  constructor() {
    this.adj = [];
    this.to = [];
    this.cap = [];
    this.original = [];
  }

  node() {
    this.adj.push([]);
    return this.adj.length - 1;
  }

  // An edge and its residual twin (index ^ 1).
  edge(u, v, cap) {
    this.adj[u].push(this.to.length);
    this.to.push(v);
    this.cap.push(cap);
    this.adj[v].push(this.to.length);
    this.to.push(u);
    this.cap.push(0);
    this.original.push(cap, 0);
  }

  max(s, t) {
    let flow = 0;
    for (;;) {
      const level = this.levels(s);
      if (level[t] < 0) return flow;
      const next = new Int32Array(this.adj.length);
      for (let f = this.push(s, t, Infinity, level, next); f > EPS; f = this.push(s, t, Infinity, level, next)) flow += f;
    }
  }

  levels(s) {
    const level = new Int32Array(this.adj.length).fill(-1);
    level[s] = 0;
    const queue = [s];
    for (let q = 0; q < queue.length; q++) {
      const u = queue[q];
      for (const e of this.adj[u]) {
        if (this.cap[e] > EPS && level[this.to[e]] < 0) {
          level[this.to[e]] = level[u] + 1;
          queue.push(this.to[e]);
        }
      }
    }
    return level;
  }

  push(u, t, f, level, next) {
    if (u === t) return f;
    for (; next[u] < this.adj[u].length; next[u]++) {
      const e = this.adj[u][next[u]], v = this.to[e];
      if (this.cap[e] <= EPS || level[v] !== level[u] + 1) continue;
      const got = this.push(v, t, Math.min(f, this.cap[e]), level, next);
      if (got > EPS) {
        this.cap[e] -= got;
        this.cap[e ^ 1] += got;
        return got;
      }
    }
    return 0;
  }

  // The flow through the edges from u to v.
  flowOut(u, v) {
    let sum = 0;
    for (const e of this.adj[u]) if (this.to[e] === v && e % 2 === 0) sum += this.original[e] - this.cap[e];
    return sum;
  }
}
