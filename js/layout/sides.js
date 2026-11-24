import { N, E, S, W } from './grid.js';

// Lines from the train shared among the Input Sides (Input Spacing, ADR 0117). Nearest-first,
// every belt and pipe from the train came in across whichever Input Side it reached soonest: with
// several, one side could take nearly all. Each line now has a side of its own, the largest first
// onto the side taking least so far (by rate, belts and pipes apart; the nearest of those alike),
// then two lines on two sides change places where the loads stay as even and their way in is
// shorter.

/**
 * @typedef {{ ids: number[], kind: 'belt' | 'pipe', rate: number, x: number, y: number }} Line
 * (ids: the routes it brings to, a Fan-out's belts one line; x, y: where it goes: its entry, or the middle of its pipe's stubs.)
 */

// How far a point stands in from side d of the area.
const depth = (area, d, x, y) => (d === W ? x - area.x : d === E ? area.x + area.w - 1 - x : d === N ? y - area.y : area.y + area.h - 1 - y);

/**
 * Each line's side: Map route id → side. None with one Input Side.
 * @param {{ x: number, y: number, w: number, h: number }} area
 * @param {number[]} sides the Input Sides
 * @param {Line[]} lines
 */
export function shareSides(area, sides, lines) {
  /** @type {Map<number, number>} */
  const sideOf = new Map();
  if (sides.length < 2) return sideOf;
  const deep = (d, l) => depth(area, d, l.x, l.y);
  for (const kind of ['belt', 'pipe']) {
    const group = lines.filter(l => l.kind === kind);
    const load = new Map(sides.map(d => [d, 0]));
    for (const l of [...group].sort((a, b) => b.rate - a.rate || a.ids[0] - b.ids[0])) {
      const least = Math.min(...load.values());
      const d = sides.filter(s => load.get(s) <= least + 1e-9 * Math.max(1, least)).sort((a, b) => deep(a, l) - deep(b, l))[0];
      for (const id of l.ids) sideOf.set(id, d);
      load.set(d, load.get(d) + l.rate);
    }
    const uneven = () => [...load.values()].reduce((s, v) => s + v * v, 0);
    for (let changed = true, rounds = 0; changed && rounds < 20; rounds++) {
      changed = false;
      for (const a of group) for (const b of group) {
        const da = sideOf.get(a.ids[0]), db = sideOf.get(b.ids[0]);
        if (da === db || deep(db, a) + deep(da, b) >= deep(da, a) + deep(db, b)) continue;
        const before = uneven();
        const shift = (sign) => {
          load.set(da, load.get(da) + sign * (b.rate - a.rate));
          load.set(db, load.get(db) + sign * (a.rate - b.rate));
        };
        shift(1);
        if (uneven() > before * (1 + 1e-9) + 1e-9) {
          shift(-1);
          continue;
        }
        for (const id of a.ids) sideOf.set(id, db);
        for (const id of b.ids) sideOf.set(id, da);
        changed = true;
      }
    }
  }
  return sideOf;
}
