// Maximize with no time limit: each try's search ends after K candidates, so the run is the same
// every time, on any host and under any load. Prints each event with a hash of its layout, then
// a hash of them all: two runs of code that should lay out the same (a speed-up) must match.
//
//   node maxdet.mjs <setup.json> [K] [most]      ROOT=<repo> for another worktree
//
// K: candidates a try (default 20). most: no more of the first Goal's machines.
// STOPAT=<machines>: stop at the first fit of that many. Wall-clock seconds in the first column.
import { createHash } from 'node:crypto';
import { root, catalog, load } from './probe-common.mjs';

const { maximize } = await import(`${root}/js/maximize.js`);
const { recipeOptions } = await import(`${root}/js/chain.js`);
const [file, K = '20', most] = process.argv.slice(2);
if (!file) {
  console.error('usage: node maxdet.mjs <setup.json> [K] [most]');
  process.exit(2);
}
const { site, logistics, goals, state } = await load(file);
const t0 = performance.now();
const all = createHash('sha1');
const run = maximize(goals, catalog, logistics, {
  made: state.made ?? [], selections: state.selections ?? {}, uses: state.uses ?? [], index: recipeOptions(catalog), site,
  budgetMs: 1e12, maxCandidates: Number(K), seed: 1, ...(most ? { most: Number(most) } : {}),
});
let step;
for (step = run.next(); !step.done; step = run.next()) {
  const v = step.value;
  const h = v.block ? createHash('sha1').update(JSON.stringify(v.block.entities.map(e => [e.name, e.x, e.y, e.direction]))).digest('hex').slice(0, 10) : '';
  all.update(`${v.type}${v.rate}${v.machines}${h}`);
  console.log(((performance.now() - t0) / 1000).toFixed(1).padStart(7), v.type, v.rate, v.machines, h);
  if (process.env.STOPAT && v.type === 'best' && String(v.machines) === process.env.STOPAT) break;
}
console.log('END', ((performance.now() - t0) / 1000).toFixed(1), step.value?.rate ?? '', step.value?.machines ?? '', all.digest('hex').slice(0, 12));
