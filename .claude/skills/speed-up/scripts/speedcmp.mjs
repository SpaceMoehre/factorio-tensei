// Two suite runs side by side, for a speed-up: each setup's seconds before and after, and whether
// it laid out the same (its hash). Run both on one host at the same time, each with --out:
//
//   npm run suite -- --tier fast --root <base worktree> --out A.json &
//   npm run suite -- --tier fast --out B.json
//   node speedcmp.mjs A.json B.json
//
// Exits 1 where any setup laid out otherwise (a speed-up lays out the same, ADR 0058).
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: node speedcmp.mjs <before.json> <after.json>');
  process.exit(2);
}
const [A, B] = [a, b].map(f => JSON.parse(readFileSync(f, 'utf8')));
const names = Object.keys(A).filter(n => n in B);
let differ = 0, before = 0, after = 0;
const rows = names.map(n => {
  const x = A[n], y = B[n];
  const same = x.hash && x.hash === y.hash;
  const verdict = x.error || y.error ? `error ${x.error ?? ''} ${y.error ?? ''}`.trim() : same ? 'same layout' : 'DIFFERS';
  if (verdict !== 'same layout') differ++;
  else [before, after] = [before + x.secs, after + y.secs];
  const ratio = x.secs && y.secs ? `${((y.secs / x.secs - 1) * 100).toFixed(0)}%` : '-';
  return [n, `${x.secs ?? '-'} s`, `${y.secs ?? '-'} s`, ratio, verdict];
});
const head = ['setup', 'before', 'after', 'change', ''];
const widths = head.map((h, k) => Math.max(h.length, ...rows.map(r => String(r[k]).length)));
for (const r of [head, ...rows]) console.log(r.map((c, k) => String(c).padEnd(widths[k])).join('  '));
console.log(`same layouts: ${before.toFixed(1)} s -> ${after.toFixed(1)} s (${before ? ((after / before - 1) * 100).toFixed(0) : 0}%), ${differ} differ`);
process.exit(differ ? 1 : 0);
