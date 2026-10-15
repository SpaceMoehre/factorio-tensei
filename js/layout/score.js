import { simulate } from '../sim.js';
import { supporting } from './validity.js';

// Compactness (CONTEXT.md): how good a Compound Block's shape is, lower better. Square first, then
// as little empty room as can be, every belt and pipe as straight as can be:
//   square  the strip a rectangle has beyond a square, |w − h| × min(w, h) tiles (in a City Block
//           none: its shape is given)
//   empty   tiles of the bounding box no machine, inserter or pole stands on — a belt or pipe
//           leaves its tiles empty, so one running wild round the block fills nothing
//   bends   where a belt turns, or a pipe meets pipes of its own on both axes
// value = SQUARE × square + empty + BEND × bends.
export const SQUARE = 1;
export const BEND = 4;

export function compactness(block) {
  const { w, h } = block.bounds;
  const square = block.site ? 0 : Math.abs(w - h) * Math.min(w, h);
  let used = 0;
  for (const e of block.entities) if (e.kind === 'building' || e.kind === 'inserter' || e.kind === 'pole') used += e.w * e.h;
  const empty = w * h - used;
  let bends = 0;
  for (const route of block.routes) {
    if (route.kind === 'belt') {
      for (let k = 1; k < route.pieces.length; k++) {
        const a = route.pieces[k - 1].travel, b = route.pieces[k].travel;
        if (a !== undefined && b !== undefined && a !== b) bends++;
      }
    } else {
      const at = new Set(route.pieces.map(p => `${p.x},${p.y}`));
      for (const p of route.pieces) {
        const across = at.has(`${p.x - 1},${p.y}`) || at.has(`${p.x + 1},${p.y}`);
        const along = at.has(`${p.x},${p.y - 1}`) || at.has(`${p.x},${p.y + 1}`);
        if (across && along) bends++;
      }
    }
  }
  return { square, empty, bends, value: SQUARE * square + empty + BEND * bends };
}

// How the layout search ranks a valid Compound Block, part by part, lower better: Starvation
// (per minute, to a thousandth), Recipe Loops whose feedback comes by train (no room for its
// splitter), byproducts riding on through their producers' consumers (no room to sort them out
// after them; a Supplied Item a filter splitter sends off after them is not), output inserters at
// machines with an Output Drop, Compactness, entities.
export function rankOf(block) {
  const starving = simulate(block).starvation.reduce((sum, s) => sum + s.demand - s.available, 0);
  const loopsByTrain = block.routes.filter(r => r.loop && r.fedBy === undefined).length;
  // (A byproduct tapped off to the Sub-Block taking it, as a feedback is, is not either.)
  const sentOff = new Set(block.routes.filter(g => g.fedBy !== undefined && (g.joins !== undefined || g.loop)).map(g => `${g.fedBy}:${g.items[0].item}`));
  const unsorted = block.routes.filter(r => r.kind === 'belt' && typeof r.source === 'number' && r.consumers.length
    && r.items.some(i => !sentOff.has(`${r.id}:${i.item}`) && !r.consumers.some(c => block.subBlocks[c].inputs.some(x => x.name === i.item)))).length;
  return [Math.round(starving * 1000) / 1000, loopsByTrain, unsorted, supporting(block), compactness(block).value, block.entities.length];
}
