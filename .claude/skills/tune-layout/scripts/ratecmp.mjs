// A layout change weighed over several seeds: suite --out files of the code before and after, seed
// by seed (`npm run suite -- --seed N --root <before> --out A<N>.json`, the same with the change to
// B<N>.json). Each setup's rate before → after for each seed, then the mean ratio over every setup
// and seed (geometric) and how many gained and lost. At K candidates a try the same code made
// silicon 5 machines with one seed and 8 with another (ADR 0087): one seed's gain or loss of a
// machine says little.
//
//   node ratecmp.mjs A1.json B1.json [A2.json B2.json …]
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length || files.length % 2) {
  console.error('usage: node ratecmp.mjs <before.json> <after.json> [<before.json> <after.json> …]');
  process.exit(2);
}
const amount = r => r?.delivered ?? r?.rate ?? 0;
const rows = new Map();
let logs = 0, k = 0, gains = 0, losses = 0;
for (let i = 0; i < files.length; i += 2) {
  const [A, B] = [files[i], files[i + 1]].map(f => JSON.parse(readFileSync(f, 'utf8')));
  for (const n of Object.keys(A).filter(n => n in B)) {
    const a = amount(A[n]), b = amount(B[n]);
    if (!rows.has(n)) rows.set(n, []);
    rows.get(n).push(`${a} → ${b}${b > a + 1e-6 ? ' +' : b < a - 1e-6 ? ' −' : ''}`);
    if (a > 0 && b > 0) [logs, k] = [logs + Math.log(b / a), k + 1];
    if (b > a + 1e-6) gains++;
    else if (b < a - 1e-6) losses++;
  }
}
const width = Math.max(...[...rows.keys()].map(n => n.length));
for (const [n, cells] of rows) console.log(n.padEnd(width), ...cells.map(c => c.padEnd(24)));
console.log(`mean ratio ${k ? Math.exp(logs / k).toFixed(4) : '-'} over ${k}; ${gains} gained, ${losses} lost`);
