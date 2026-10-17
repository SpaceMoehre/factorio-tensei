// A CPU profile (node --cpu-prof) summed by function: inclusive seconds (each function counted
// once per sample, however deep it recurs) and self seconds, the largest first.
//
//   node --cpu-prof --cpu-prof-dir=<dir> run.mjs …      then
//   node profsum.mjs <dir>/<file>.cpuprofile [top]
import { readFileSync } from 'node:fs';

const [file, top = '40'] = process.argv.slice(2);
if (!file) {
  console.error('usage: node profsum.mjs <file.cpuprofile> [top]');
  process.exit(2);
}
const p = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map(n => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const ticks = new Map();
p.samples.forEach((s, i) => ticks.set(s, (ticks.get(s) ?? 0) + (p.timeDeltas[i] ?? 0)));
const name = id => {
  const f = byId.get(id).callFrame;
  return `${f.functionName || '(anon)'}@${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`;
};
const inclusive = new Map(), self = new Map();
let total = 0;
for (const [id, t] of ticks) {
  total += t;
  self.set(name(id), (self.get(name(id)) ?? 0) + t);
  const seen = new Set();
  for (let n = id; n !== undefined; n = parent.get(n)) {
    if (seen.has(name(n))) continue;
    seen.add(name(n));
    inclusive.set(name(n), (inclusive.get(name(n)) ?? 0) + t);
  }
}
const line = ([k, t]) => `${(t / 1e6).toFixed(1).padStart(8)}s ${(100 * t / total).toFixed(1).padStart(5)}%  ${k}`;
console.log(`total ${(total / 1e6).toFixed(1)}s`);
console.log('--- inclusive');
for (const e of [...inclusive].filter(([k]) => /\.js:/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, Number(top))) console.log(line(e));
console.log('--- self');
for (const e of [...self].sort((a, b) => b[1] - a[1]).slice(0, Number(top))) console.log(line(e));
