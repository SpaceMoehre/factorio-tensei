export const N = 0, E = 4, S = 8, W = 12;
export const VEC = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
export const turnLeft = d => (d + 12) % 16;
export const turnRight = d => (d + 4) % 16;
export const opposite = d => (d + 8) % 16;
export const key = (x, y) => `${x},${y}`;

export class Grid {
  constructor(area) {
    this.area = area;
    this.occupied = new Map();
    this.reserved = new Map();
    // Machine fluid connections: held for their route, and no other pipe may touch them.
    this.fluidPorts = new Set();
    // Machine fluid connections not used by the recipe: no pipe may sit there.
    this.pipeBlocked = new Set();
    this.tunnels = [];
  }

  reserveFluidPort(x, y, routeId) {
    this.reserve(x, y, routeId);
    this.fluidPorts.add(key(x, y));
  }

  addTunnel(name, a, b) {
    this.tunnels.push({ name, ...span(a, b) });
  }

  // Undergrounds of one type pair with the nearest partner along their axis, so spans of the
  // same type on the same line must not overlap or they would cross-connect.
  tunnelFits(name, a, b) {
    const s = span(a, b);
    return !this.tunnels.some(t => t.name === name && spansOverlap(t, s));
  }

  // Routing may try an option and take it back: everything it changes is saved here.
  snapshot() {
    return { occupied: new Map(this.occupied), tunnels: this.tunnels.length };
  }

  restore({ occupied, tunnels }) {
    this.occupied = occupied;
    this.tunnels.length = tunnels;
  }

  inBounds(x, y) {
    const a = this.area;
    return x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h;
  }

  place(entity) {
    for (let dx = 0; dx < entity.w; dx++) {
      for (let dy = 0; dy < entity.h; dy++) this.occupied.set(key(entity.x + dx, entity.y + dy), entity);
    }
  }

  reserve(x, y, routeId) {
    this.reserved.set(key(x, y), routeId);
  }

  // Free for this route: empty, and not held for a different route.
  freeFor(x, y, routeId) {
    if (!this.inBounds(x, y)) return false;
    const k = key(x, y);
    if (this.occupied.has(k)) return false;
    const r = this.reserved.get(k);
    return r === undefined || r === routeId;
  }

  at(x, y) {
    return this.occupied.get(key(x, y));
  }
}

// The line a tunnel runs along and the stretch of it that it covers.
export function span(a, b) {
  return a.y === b.y
    ? { axis: 'h', line: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) }
    : { axis: 'v', line: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) };
}

export function spansOverlap(s, t) {
  return s.axis === t.axis && s.line === t.line && !(s.hi < t.lo || s.lo > t.hi);
}
