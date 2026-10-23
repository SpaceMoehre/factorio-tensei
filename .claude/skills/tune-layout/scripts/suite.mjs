// The regression suite: every setup in suite.json laid out by suite-one.mjs (the same on any host
// under any load), side by side, each compared with the result recorded for it. A change that
// gains on the setup it was made for and loses on none of the others is general; one that loses
// somewhere needs a gate (SKILL.md step 5).
//
//   node suite.mjs [--tier fast|full] [--only a,b] [--parallel N] [--root DIR] [--record] [--out FILE]
//
// --tier       fast (default): the setups marked fast, a few minutes each; full: every setup
// --only       these setups (by name), whatever their tier
// --parallel   setups at once, each a process of its own (default: half the cores)
// --root       the repo to run (another worktree), default this one
// --record     write each result into suite.json as the one to compare with from now on
// --out        also write the results as JSON there
//
// Exits 1 where any setup delivers less than recorded, or turns invalid or starving.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = resolve(here, '../suite.json');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const suite = JSON.parse(readFileSync(manifest, 'utf8'));
const only = opt('only')?.split(',');
const tier = opt('tier', 'fast');
const chosen = suite.setups.filter(s => (only ? only.includes(s.name) : tier === 'full' || s.tier === 'fast'));
if (!chosen.length) {
  console.error(`no setups (${only ? `--only ${only.join(',')}` : `--tier ${tier}`})`);
  process.exit(2);
}
const width = Math.max(1, Number(opt('parallel', Math.floor(availableParallelism() / 2))));
const root = resolve(opt('root', resolve(here, '../../../..')));

// One setup in a process of its own, killed past its `timeout` seconds: its RESULT, else { error }.
const runOne = s => new Promise(done => {
  const child = spawn(process.execPath, [resolve(here, 'suite-one.mjs'), resolve(here, '../setups', s.file), String(s.K ?? 20), ...(s.most ? [String(s.most)] : [])], { env: { ...process.env, ROOT: root } });
  let out = '', err = '';
  child.stdout.on('data', d => (out += d));
  child.stderr.on('data', d => (err += d));
  const timer = setTimeout(() => child.kill('SIGKILL'), (s.timeout ?? 600) * 1000);
  child.on('exit', code => {
    clearTimeout(timer);
    const line = out.split('\n').find(l => l.startsWith('RESULT '));
    done(line ? JSON.parse(line.slice(7)) : { error: code === null ? `timed out (${s.timeout ?? 600} s)` : err.trim().split('\n').slice(-3).join(' ') || `exit ${code}` });
  });
});

const results = new Map();
const queue = [...chosen];
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(width, queue.length) }, async () => {
  while (queue.length) {
    const s = queue.shift();
    const r = await runOne(s);
    results.set(s.name, r);
    console.error(`${((Date.now() - t0) / 1000).toFixed(0).padStart(5)} s  ${s.name}: ${r.error ?? `${r.rate}/min, ${r.machines ?? '-'} machines, ${r.secs} s`}`);
  }
}));

// Each against its record: what the Goal delivers first (else the rate), then whether it is
// valid and starves nothing; the same layout where the hashes match.
const amount = r => r?.delivered ?? r?.rate ?? 0;
let losses = 0;
const rows = chosen.map(s => {
  const now = results.get(s.name), was = s.result;
  let verdict;
  if (now.error) verdict = was?.error ? 'error, as recorded' : 'ERROR';
  else if (!was) verdict = 'new';
  else if (now.hash && now.hash === was.hash) verdict = 'same layout';
  else if ((was.valid !== false && now.valid === false) || (now.starving > 1e-6 && !(was.starving > 1e-6))) verdict = 'WORSE (invalid or starving)';
  else if (amount(now) > amount(was) + 1e-6) verdict = 'gain';
  else if (amount(now) < amount(was) - 1e-6) verdict = 'LOSS';
  else verdict = 'same rate';
  if (/^(ERROR|WORSE|LOSS)/.test(verdict)) losses++;
  const show = r => (!r ? '-' : r.error ? 'error' : `${amount(r)}/min ${r.machines ?? '-'}m ${r.valid === false ? 'invalid ' : ''}${r.starving > 1e-6 ? `starving ${r.starving} ` : ''}${r.secs}s`);
  return [s.name, show(was), show(now), verdict];
});
const head = ['setup', 'recorded', 'now', ''];
const widths = head.map((h, k) => Math.max(h.length, ...rows.map(r => String(r[k]).length)));
for (const r of [head, ...rows]) console.log(r.map((c, k) => String(c).padEnd(widths[k])).join('  '));
console.log(`${chosen.length} setups, ${losses} worse, ${((Date.now() - t0) / 1000).toFixed(0)} s (root ${root})`);

if (opt('out')) writeFileSync(opt('out'), JSON.stringify(Object.fromEntries(results), null, 1));
if (args.includes('--record')) {
  for (const s of suite.setups) if (results.has(s.name)) s.result = results.get(s.name);
  writeFileSync(manifest, JSON.stringify(suite, null, 2) + '\n');
  console.log(`recorded in ${manifest}`);
}
process.exit(losses ? 1 : 0);
