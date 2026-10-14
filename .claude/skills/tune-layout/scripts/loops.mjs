// Usage: node loops.mjs <best.json> [pieces]: belts that turn 180° or more within so many pieces (10) after a splitter.
// Belts that turn 270° (or 180°+) within a few pieces after a splitter.
import fs from 'node:fs';
const L = JSON.parse(fs.readFileSync(process.argv[2]));
const span = Number(process.argv[3] ?? 10);
let found = 0;
for (const r of L.routes) {
  const p = r.pieces ?? [];
  p.forEach((s, i) => {
    if (s.kind !== 'splitter') return;
    let turn = 0, prev = s.travel, max = 0, tunnel = false;
    for (const q of p.slice(i + 1, i + 1 + span)) {
      if (q.kind === 'splitter') break;
      if (q.kind === 'underground-belt') tunnel = true;
      let d = ((q.travel - prev + 24) % 16) - 8; // -4 left, 4 right
      turn += d; prev = q.travel; max = Math.max(max, Math.abs(turn));
    }
    if (max >= 8) { found++; console.log(`route ${r.id} splitter ${s.x},${s.y} dir ${s.direction} turns ${max / 4 * 90}° tunnel ${tunnel}: ${p.slice(i + 1, i + 1 + span).map(q => `${q.x},${q.y}${q.kind[0]}${q.travel}`).join(' ')}`); }
  });
}
console.log('found', found);
