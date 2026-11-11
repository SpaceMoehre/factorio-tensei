// Two roots' suite runs as pairs, for a speed-up: each setup laid out on both at the same moment,
// the pairs `--parallel` at a time, the longest (by their recorded seconds) first. Running the
// two sides' suites side by side (speedcmp.mjs's way) leaves the faster side's last setups beside
// the slower side's longest: in every such A/B of ADR 0097–0102 the faster side's wood and small
// parts 2 came out 10–90% slower, alike when run as pairs. Here each setup's two runs share the
// host's load as nearly as two processes can.
//
//   node pairs.mjs <root A> <root B> [--tier fast|full] [--only a,b] [--parallel N] [--out DIR]
//
// Writes DIR/A.json and DIR/B.json (as suite.mjs --out does) and prints speedcmp's table.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tl = resolve(here, '../../tune-layout');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [rootA, rootB] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')).map(r => resolve(r));
if (!rootA || !rootB) {
  console.error('usage: node pairs.mjs <root A> <root B> [--tier fast|full] [--only a,b] [--parallel N] [--out DIR]');
  process.exit(2);
}
const suite = JSON.parse(readFileSync(resolve(tl, 'suite.json'), 'utf8'));
const only = opt('only')?.split(',');
const tier = opt('tier', 'fast');
const chosen = suite.setups.filter(s => (only ? only.includes(s.name) : tier === 'full' || s.tier === 'fast'))
  .sort((a, b) => (b.result?.secs ?? 0) - (a.result?.secs ?? 0));
// (Each pair is two processes: half as many pairs as suite.mjs runs setups.)
const width = Math.max(1, Number(opt('parallel', Math.floor(availableParallelism() / 4))));
const out = resolve(opt('out', '.'));
mkdirSync(out, { recursive: true });

const runOne = (s, root) => new Promise(done => {
  const child = spawn(process.execPath, [resolve(tl, 'scripts/suite-one.mjs'), resolve(tl, 'setups', s.file), String(s.K ?? 20), ...(s.most ? [String(s.most)] : [])], { env: { ...process.env, ROOT: root, TIMEOUT: String(s.timeout ?? 600) } });
  let text = '', err = '';
  child.stdout.on('data', d => (text += d));
  child.stderr.on('data', d => (err += d));
  child.on('exit', code => {
    const line = text.split('\n').find(l => l.startsWith('RESULT '));
    done(line ? JSON.parse(line.slice(7)) : { error: code === 124 ? `timed out (${s.timeout ?? 600} s)` : err.trim().split('\n').slice(-3).join(' ') || `exit ${code}` });
  });
});

const A = {}, B = {};
const queue = [...chosen];
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(width, queue.length) }, async () => {
  while (queue.length) {
    const s = queue.shift();
    const [a, b] = await Promise.all([runOne(s, rootA), runOne(s, rootB)]);
    [A[s.name], B[s.name]] = [a, b];
    console.error(`${((Date.now() - t0) / 1000).toFixed(0).padStart(5)} s  ${s.name}: ${a.secs ?? a.error} s, ${b.secs ?? b.error} s`);
  }
}));
writeFileSync(resolve(out, 'A.json'), JSON.stringify(A, null, 1));
writeFileSync(resolve(out, 'B.json'), JSON.stringify(B, null, 1));
const r = spawnSync(process.execPath, [resolve(here, 'speedcmp.mjs'), resolve(out, 'A.json'), resolve(out, 'B.json')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
