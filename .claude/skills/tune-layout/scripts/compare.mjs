// Compares run.mjs summaries side by side (an A/B, or a setup before and after a change).
//
//   node compare.mjs <a/summary.json> <b/summary.json> [...]
import { readFileSync } from 'node:fs';

const rows = [
  ['rate', s => s.rate],
  ['goal machines', s => s.goalMachines],
  ['goal counts', s => s.goalCounts?.join('+')],
  ['valid', s => s.valid],
  ['starving /min', s => s.starving],
  ['byproducts riding', s => s.byproductsRiding],
  ['loops by train', s => s.loopsByTrain],
  ['bounds', s => s.bounds],
  ['room empty', s => s.room?.empty],
  ['machine share', s => s.room?.machineShare],
  ['compactness', s => s.compactness?.value],
  ['tries', s => s.tries?.length ?? s.tried],
  ['best at s', s => s.bestAtS],
  ['total s', s => s.secs],
  ['failure', s => s.failure ?? s.above?.reason],
];
const files = process.argv.slice(2);
const sums = files.map(f => JSON.parse(readFileSync(f, 'utf8')));
const cols = sums.map((s, i) => `${files[i].split('/').slice(-2, -1)[0] ?? files[i]} (${s.root?.split('/').pop()})`);
const width = Math.max(...cols.map(c => c.length), 14);
console.log(''.padEnd(18) + cols.map(c => c.padEnd(width)).join('  '));
for (const [name, get] of rows) console.log(name.padEnd(18) + sums.map(s => String(get(s) ?? '—').slice(0, width).padEnd(width)).join('  '));
