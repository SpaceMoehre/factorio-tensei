// One setup of the regression suite (suite.mjs), laid out the same on any host under any load:
// each try's search ends after K candidates, with no time limit (as maxdet.mjs). Built as the page
// builds (js/session.js, the same code): in a City Block, Maximize (with Maximize off, up to the
// Goals: upTo, where they are foretold not to fit or a build finds no layout); elsewhere a build.
// Prints `RESULT <json>`: rate, machines, delivered, valid, starving, the layout's hash, seconds.
//
//   node suite-one.mjs <setup.json> [K] [most]      ROOT=<repo> for another worktree
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { root, catalog, load } from './probe-common.mjs';

const { buildSession } = await import(`${root}/js/session.js`);
const { inlineRunner } = await import(`${root}/js/runners.js`);
const { validateBlock } = await import(`${root}/js/layout/validity.js`);
const { simulate, throughput } = await import(`${root}/js/sim.js`);
const { scoreOf } = await import(`${root}/js/layout/score.js`);

const [file, K = '20', most] = process.argv.slice(2);
const { site, logistics, goals, choices, city } = await load(file);
const t0 = performance.now();
const secs = () => +((performance.now() - t0) / 1000).toFixed(1);
let block = null, rate = null, machines = null, tries = 0, failure = null;
// As the page builds (session.js), every job in this process, one after another (Maximize's
// tries one at a time): in a City Block with Maximize on, the highest rate that fits; a build
// each Sub-Block designed on its own, then every strategy from those designs, K candidates each.
const session = buildSession({ goals, choices, logistics, budget: Infinity, city }, site, catalog, inlineRunner(catalog), { width: 1, maxCandidates: Number(K), ...(most ? { maximize: { most: Number(most) } } : {}) });
let maximizing = false;
for await (const v of session.events) {
  if (v.type === 'start') maximizing = v.maximize;
  else if (v.type === 'try') tries++;
  else if (v.type === 'best') [block, rate, machines] = [v.block, v.found?.rate ?? goals[0].rate, v.found?.machines ?? null];
  else if (v.type === 'done') {
    failure = v.failure ?? null;
    if (!maximizing) tries = v.tried;
  }
}
const result = { secs: secs(), tries, rate, machines, failure };
if (block) {
  const starvation = simulate(block).starvation;
  Object.assign(result, {
    delivered: +throughput(block).delivered(goals[0].item).toFixed(2),
    valid: validateBlock(block, catalog, logistics).length === 0,
    starving: +starvation.reduce((s, x) => s + x.demand - x.available, 0).toFixed(3),
    riding: scoreOf(block).riding,
    bounds: `${block.bounds.w}x${block.bounds.h}`,
    entities: block.entities.length,
    hash: createHash('sha1').update(JSON.stringify(block.entities.map(e => [e.name, e.x, e.y, e.direction]))).digest('hex').slice(0, 12),
  });
}
// (BEST=<file>: the layout written there, for draw.mjs and links.mjs.)
if (block && process.env.BEST) writeFileSync(process.env.BEST, JSON.stringify(block));
console.log(`RESULT ${JSON.stringify(result)}`);
