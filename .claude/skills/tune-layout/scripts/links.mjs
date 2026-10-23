// Link belts' length and producer→consumer gap (box to box), from a best.json.
import { readFileSync } from 'node:fs';
const b = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const gap = (p, q) => Math.max(0, p.x - (q.x + q.w), q.x - (p.x + p.w)) + Math.max(0, p.y - (q.y + q.h), q.y - (p.y + p.h));
let pieces = 0, belts = 0, all = 0;
const pairs = new Map();
for (const r of b.routes) {
  if (r.kind === 'belt') all += r.pieces.length;
  if (r.kind !== 'belt' || typeof r.source !== 'number' || !r.consumers.length) continue;
  belts++; pieces += r.pieces.length;
  for (const c of r.consumers) {
    const k = `${r.source} ${b.subBlocks[r.source].item} -> ${c} ${b.subBlocks[c].item}`;
    const e = pairs.get(k) ?? { belts: 0, pieces: 0, gap: gap(b.subBlocks[r.source], b.subBlocks[c]) };
    e.belts++; e.pieces += r.pieces.length; pairs.set(k, e);
  }
}
for (const [k, e] of pairs) console.log(k.padEnd(44), `belts ${e.belts}`, `tiles ${e.pieces}`, `gap ${e.gap}`);
console.log(`links: ${belts} belts, ${pieces} tiles; all belts ${all} tiles; gaps sum ${[...pairs.values()].reduce((s, e) => s + e.gap, 0)}`);
