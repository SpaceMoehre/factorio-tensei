// One setup of the regression suite (suite.mjs), laid out the same on any host under any load:
// each try's search ends after K candidates, with no time limit (as maxdet.mjs). In a City Block,
// Maximize as the page runs it (with Maximize off, up to the Goals: upTo); elsewhere a build.
// Prints `RESULT <json>`: rate, machines, delivered, valid, starving, the layout's hash, seconds.
//
//   node suite-one.mjs <setup.json> [K] [most]      ROOT=<repo> for another worktree
import { createHash } from 'node:crypto';
import { root, catalog, load } from './probe-common.mjs';

const { maximize } = await import(`${root}/js/maximize.js`);
const { search } = await import(`${root}/js/search.js`);
const { expandChain, recipeOptions } = await import(`${root}/js/chain.js`);
const { validateBlock } = await import(`${root}/js/layout/validity.js`);
const { simulate, throughput } = await import(`${root}/js/sim.js`);
const { rankOf } = await import(`${root}/js/layout/score.js`);

const [file, K = '20', most] = process.argv.slice(2);
const { site, logistics, goals, state, plan } = await load(file);
const options = { made: state.made ?? [], selections: state.selections ?? {}, uses: state.uses ?? [], exports: state.exports ?? [], voids: state.voids ?? [], index: recipeOptions(catalog) };
const t0 = performance.now();
const secs = () => +((performance.now() - t0) / 1000).toFixed(1);
let block = null, rate = null, machines = null, tries = 0, failure = null;
const upTo = Boolean(site && !state.city?.maximize);
if (site && (!upTo || plan.foretold().machines < plan.wanted)) {
  const run = maximize(goals, catalog, logistics, { ...options, site, upTo, budgetMs: 1e12, maxCandidates: Number(K), seed: 1, ...(most ? { most: Number(most) } : {}) });
  let step;
  for (step = run.next(); !step.done; step = run.next()) {
    const v = step.value;
    if (v.type === 'try') tries++;
    if (v.type === 'best') [block, rate, machines] = [v.block, v.rate, v.machines];
  }
  failure = step.value?.failure?.message ?? null;
} else {
  const chain = expandChain(goals, catalog, { ...options, belt: logistics.belt, logistics });
  const run = search(chain.entries, catalog, logistics, { seed: 1, deadline: Infinity, maxCandidates: Number(K), site });
  let step;
  for (step = run.next(); !step.done; step = run.next()) block = step.value.block;
  tries = step.value?.tried ?? 0;
  failure = step.value?.failure?.message ?? null;
  rate = block ? goals[0].rate : null;
}
const result = { secs: secs(), tries, rate, machines, failure };
if (block) {
  const starvation = simulate(block).starvation;
  Object.assign(result, {
    delivered: +throughput(block).delivered(goals[0].item).toFixed(2),
    valid: validateBlock(block, catalog, logistics).length === 0,
    starving: +starvation.reduce((s, x) => s + x.demand - x.available, 0).toFixed(3),
    riding: rankOf(block)[2],
    bounds: `${block.bounds.w}x${block.bounds.h}`,
    entities: block.entities.length,
    hash: createHash('sha1').update(JSON.stringify(block.entities.map(e => [e.name, e.x, e.y, e.direction]))).digest('hex').slice(0, 12),
  });
}
console.log(`RESULT ${JSON.stringify(result)}`);
