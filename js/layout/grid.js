export const N = 0, E = 4, S = 8, W = 12;
export const VEC = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
export const turnLeft = d => (d + 12) % 16;
export const turnRight = d => (d + 4) % 16;
export const opposite = d => (d + 8) % 16;
export const key = (x, y) => `${x},${y}`;

const FREE = -2147483648;
const NONE = Object.freeze([]);

// The Output Side (ADR 0069): the edge the block's belts and pipes to the train leave across, as
// the user chooses it (logistics.output: 'right', 'up' or 'down'; east by default). The block runs
// west to east all the same; only the last legs to the train turn there.
export const outSide = logistics => ({ up: N, down: S }[logistics?.output] ?? E);
// Whether a piece at x, y heading a leaves `area` across the Output Side `out`.
export const atOut = (area, out, x, y, a) => a === out && (out === E ? x === area.x + area.w - 1 : out === N ? y === area.y : y === area.y + area.h - 1);

export class Grid {
  // out: the Output Side (outSide).
  constructor(area, out = E) {
    this.area = area;
    this.out = out;
    // What stands on each tile: outside the area by key (`occupied`), inside it by tile index
    // (`cells`). (A snapshot copies the few outside, not every entity's every tile.)
    this.occupied = new Map();
    this.reserved = new Map();
    this.cells = new Array(area.w * area.h);
    this.held = new Int32Array(area.w * area.h).fill(FREE);
    // Machine fluid connections: held for their route, and no other pipe may touch them.
    this.fluidPorts = new TileSet(area);
    // Machine fluid connections not used by the recipe: no pipe may sit there.
    this.pipeBlocked = new TileSet(area);
    // Connections that must take a plain pipe, never a pipe-to-ground.
    this.surfaceOnly = new TileSet(area);
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
    return !this.tunnelLine(name, a, b).some(t => spansOverlap(t, s));
  }

  // The tunnels of this type on the line from a to b (a router weighing several lengths of
  // tunnel from one tile asks once).
  tunnelLine(name, a, b) {
    return this.tunnelLines.get(lineKey(name, span(a, b))) ?? NONE;
  }

  // Routing may try an option and take it back: everything it changes is saved here (with
  // `holds`, the tiles held for routes too, where what it tried held some).
  snapshot({ holds = false } = {}) {
    return {
      occupied: new Map(this.occupied), cells: this.cells.slice(), tunnels: this.tunnels.length,
      ...(holds ? { reserved: new Map(this.reserved), held: this.held.slice() } : {}),
    };
  }

  restore({ occupied, cells, tunnels, reserved = null, held = null }) {
    this.occupied = occupied;
    this.cells = cells;
    if (reserved && held) {
      this.reserved = new Map(reserved);
      this.held = held.slice();
    }
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
        const i = this.index(entity.x + dx, entity.y + dy);
        if (i >= 0) this.cells[i] = entity;
        else this.occupied.set(key(entity.x + dx, entity.y + dy), entity);
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

  // Whether anything stands on the tile.
  taken(x, y) {
    const i = this.index(x, y);
    return i >= 0 ? this.cells[i] !== undefined : this.occupied.has(key(x, y));
  }

  // Nothing stands on the tile any more.
  clear(x, y) {
    const i = this.index(x, y);
    if (i >= 0) this.cells[i] = undefined;
    else this.occupied.delete(key(x, y));
  }

  at(x, y) {
    const i = this.index(x, y);
    return i >= 0 ? this.cells[i] : this.occupied.get(key(x, y));
  }
}

// A set of tile keys (`x,y`) that also answers by coordinates (`hasAt`) without making a key:
// inside the area from a mask kept as keys come and go. (The router asks for every tile of every
// step of every pipe it searches.)
export class TileSet extends Set {
  /** @param {{ x: number, y: number, w: number, h: number }} area */
  constructor(area) {
    super();
    this.area = area;
    this.mask = new Uint8Array(area.w * area.h);
  }

  // The tile's index in the mask, or -1 outside the area.
  spot(k) {
    const [x, y] = String(k).split(',').map(Number);
    // (Only a key as `key` makes it is the tile's.)
    if (key(x, y) !== k) return -1;
    const i = x - this.area.x, j = y - this.area.y;
    return i >= 0 && j >= 0 && i < this.area.w && j < this.area.h ? j * this.area.w + i : -1;
  }

  add(k) {
    super.add(k);
    // (The constructor's super() adds nothing: no mask yet.)
    const i = this.mask ? this.spot(k) : -1;
    if (i >= 0) this.mask[i] = 1;
    return this;
  }

  delete(k) {
    const i = this.spot(k);
    if (i >= 0) this.mask[i] = 0;
    return super.delete(k);
  }

  clear() {
    this.mask.fill(0);
    super.clear();
  }

  hasAt(x, y) {
    const i = x - this.area.x, j = y - this.area.y;
    if (i < 0 || j < 0 || i >= this.area.w || j >= this.area.h) return this.has(key(x, y));
    return this.mask[j * this.area.w + i] === 1;
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
