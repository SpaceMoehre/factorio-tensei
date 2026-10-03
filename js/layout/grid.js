export const N = 0, E = 4, S = 8, W = 12;
export const VEC = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
export const turnLeft = d => (d + 12) % 16;
export const turnRight = d => (d + 4) % 16;
export const opposite = d => (d + 8) % 16;
export const key = (x, y) => `${x},${y}`;

const FREE = -2147483648;

export class Grid {
  constructor(area) {
    this.area = area;
    this.occupied = new Map();
    this.reserved = new Map();
    // The same, by tile index inside the area, for the router's hot lookups.
    this.cells = new Array(area.w * area.h);
    this.held = new Int32Array(area.w * area.h).fill(FREE);
    // Machine fluid connections: held for their route, and no other pipe may touch them.
    this.fluidPorts = new Set();
    // Machine fluid connections not used by the recipe: no pipe may sit there.
    this.pipeBlocked = new Set();
    // Connections that must take a plain pipe, never a pipe-to-ground.
    this.surfaceOnly = new Set();
    this.tunnels = [];
    // Tunnels by type and line, for tunnelFits.
    this.tunnelLines = new Map();
  }

  reserveFluidPort(x, y, routeId) {
    this.reserve(x, y, routeId);
    this.fluidPorts.add(key(x, y));
  }

  addTunnel(name, a, b) {
    const t = { name, ...span(a, b) };
    this.tunnels.push(t);
    const k = lineKey(name, t);
    if (!this.tunnelLines.has(k)) this.tunnelLines.set(k, []);
    this.tunnelLines.get(k).push(t);
  }

  // Undergrounds of one type pair with the nearest partner along their axis, so spans of the
  // same type on the same line must not overlap or they would cross-connect.
  tunnelFits(name, a, b) {
    const s = span(a, b);
    return !(this.tunnelLines.get(lineKey(name, s)) ?? []).some(t => spansOverlap(t, s));
  }

  // Routing may try an option and take it back: everything it changes is saved here.
  snapshot() {
    return { occupied: new Map(this.occupied), cells: this.cells.slice(), tunnels: this.tunnels.length };
  }

  restore({ occupied, cells, tunnels }) {
    this.occupied = occupied;
    this.cells = cells;
    for (const t of this.tunnels.splice(tunnels)) {
      const list = this.tunnelLines.get(lineKey(t.name, t));
      list.splice(list.indexOf(t), 1);
    }
  }

  inBounds(x, y) {
    const a = this.area;
    return x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h;
  }

  // The tile's index inside the area, or -1 outside it.
  index(x, y) {
    const i = x - this.area.x, j = y - this.area.y;
    return i < 0 || j < 0 || i >= this.area.w || j >= this.area.h ? -1 : j * this.area.w + i;
  }

  place(entity) {
    for (let dx = 0; dx < entity.w; dx++) {
      for (let dy = 0; dy < entity.h; dy++) {
        this.occupied.set(key(entity.x + dx, entity.y + dy), entity);
        const i = this.index(entity.x + dx, entity.y + dy);
        if (i >= 0) this.cells[i] = entity;
      }
    }
  }

  reserve(x, y, routeId) {
    this.reserved.set(key(x, y), routeId);
    const i = this.index(x, y);
    if (i >= 0) this.held[i] = routeId;
  }

  unreserve(x, y) {
    this.reserved.delete(key(x, y));
    const i = this.index(x, y);
    if (i >= 0) this.held[i] = FREE;
  }

  // The route a tile is held for (undefined when none).
  holder(x, y) {
    const i = this.index(x, y);
    if (i < 0) return this.reserved.get(key(x, y));
    return this.held[i] === FREE ? undefined : this.held[i];
  }

  // Free for this route: empty, and not held for a different route.
  freeFor(x, y, routeId) {
    const i = this.index(x, y);
    if (i < 0 || this.cells[i]) return false;
    const r = this.held[i];
    return r === FREE || r === routeId;
  }

  at(x, y) {
    const i = this.index(x, y);
    return i >= 0 ? this.cells[i] : this.occupied.get(key(x, y));
  }
}

const lineKey = (name, s) => `${name}|${s.axis}|${s.line}`;

// The line a tunnel runs along and the stretch of it that it covers.
export function span(a, b) {
  return a.y === b.y
    ? { axis: 'h', line: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) }
    : { axis: 'v', line: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) };
}

export function spansOverlap(s, t) {
  return s.axis === t.axis && s.line === t.line && !(s.hi < t.lo || s.lo > t.hi);
}
