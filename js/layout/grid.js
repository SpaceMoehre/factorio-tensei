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
    this.reservedFluid = new Map();
    // Machine fluid connections not used by the recipe: no pipe may sit there.
    this.pipeBlocked = new Set();
    this.tunnels = [];
  }

  reserveFluid(x, y, routeId, fluid) {
    this.reserve(x, y, routeId);
    this.reservedFluid.set(key(x, y), fluid);
  }

  addTunnel(name, a, b) {
    this.tunnels.push({ name, ...span(a.x, a.y, b.x, b.y) });
  }

  // Undergrounds of one type pair with the nearest partner along their axis, so spans of the
  // same type on the same line must not overlap or they would cross-connect.
  tunnelFits(name, x, y, qx, qy) {
    const s = span(x, y, qx, qy);
    return !this.tunnels.some(t => t.name === name && t.axis === s.axis && t.line === s.line && !(s.hi < t.lo || s.lo > t.hi));
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

function span(x, y, qx, qy) {
  return y === qy
    ? { axis: 'h', line: y, lo: Math.min(x, qx), hi: Math.max(x, qx) }
    : { axis: 'v', line: x, lo: Math.min(y, qy), hi: Math.max(y, qy) };
}
