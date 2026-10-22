// Runs a setup headless, as the page would, and measures what came out.
//
//   node run.mjs <setup.json> [options]
//
// <setup.json>: the page's saved state (localStorage 'factory-tensei:v1': goals, logistics, made,
// selections, uses, exports, voids, city { on, blueprint, w, h, buffer, maximize }), or the same with the City
// Block's blueprint string at the top level (`blueprint`).
//
// options:
//   --mode auto|maximize|build|attempt   auto (default): as the page does — a City Block with
//                                        Maximize on maximizes; a City Block the Goals are
//                                        foretold not to fit (or a build finds no layout in)
//                                        fills up to them (upTo); elsewhere a build
//   --n N             attempt: the first Goal's machines to try (one try of Maximize)
//   --budget S        seconds: each try's (maximize/attempt), the whole search's (build); default
//                     the setup's logistics.budget, else 10
//   --total S         maximize: stop after S seconds of wall clock, keeping the best so far
//                     (checked between events: a try running finishes first, up to --budget)
//   --upTo            maximize no higher than the Goals' own rates
//   --giving --unsorted --sorting --precheck --starving   attempt: search options as Maximize passes them
//   --no-annexes --no-bands --no-giving --no-starving   maximize: leave that phase out
//   --parallel N      maximize: tries at once, each in a worker thread (ADR 0060); default 1,
//                     one after another (the page runs as many as its machine has cores, less 1)
//   --seed N          default 1
//   --root DIR        the repo to run (another worktree for an A/B), default this one
//   --out DIR         where log.txt, best.json and summary.json go (default ./out-<setup name>)
//   --strategy S      build: one strategy only (search|spread); default both side by side
//   --profile-slow S  once a try runs S seconds with no event, sample the CPU for --profile-for
//                     seconds (60): <out>/slow-<k>.txt (hottest functions and stack), .cpuprofile
//
// Prints each event as it comes (seconds, type, rate, machines), then the summary (summary.json).
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const file = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.match(/^--(mode|n|budget|total|seed|root|out|strategy|profile-slow|profile-for|parallel)$/));
if (!file) {
  console.error('usage: node run.mjs <setup.json> [--mode auto|maximize|build|attempt] [--n N] [--budget S] [--total S] [--root DIR] [--out DIR]');
  process.exit(2);
}
// (--profile-slow: the run itself under V8's tick profiler, its log in <out>/v8.log.)
if (opt('profile-slow') && !process.execArgv.includes('--prof')) {
  const outDir = resolve(opt('out', `out-${basename(file, '.json')}`));
  mkdirSync(outDir, { recursive: true });
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['--prof', `--logfile=${outDir}/v8.log`, '--no-logfile-per-isolate', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const root = resolve(opt('root', resolve(here, '../../../..')));
const out = resolve(opt('out', `out-${basename(file, '.json')}`));
mkdirSync(out, { recursive: true });

const { decodeBlueprint, readCityBlock, siteOf } = await import(`${root}/js/city.js`);
const { maximize, planner, attempt } = await import(`${root}/js/maximize.js`);
const { search } = await import(`${root}/js/search.js`);
const { expandChain, recipeOptions } = await import(`${root}/js/chain.js`);
const { validateBlock } = await import(`${root}/js/layout/validity.js`);
const { simulate, throughput } = await import(`${root}/js/sim.js`);
const { compactness, rankOf } = await import(`${root}/js/layout/score.js`);
const catalog = JSON.parse(readFileSync(`${root}/data/catalog.json`, 'utf8'));

const state = JSON.parse(readFileSync(file, 'utf8'));
const city = { on: false, blueprint: '', w: 100, h: 100, buffer: 2, maximize: false, ...state.city };
if (state.blueprint && !city.blueprint) Object.assign(city, { on: true, blueprint: state.blueprint });
const { budget: setupBudget, ...logistics } = state.logistics ?? {};
for (const key of ['belt', 'pipe', 'pole', 'inserter', 'longInserter']) if (!logistics[key]) console.error(`warning: logistics.${key} is not set (the page fills in its default; set it in the setup)`);
const goals = (state.goals ?? []).filter(g => g.item && g.rate > 0);
const made = state.made ?? [], selections = state.selections ?? {}, uses = state.uses ?? [], exports = state.exports ?? [], voids = state.voids ?? [];
const index = recipeOptions(catalog);
const budgetMs = 1000 * Number(opt('budget', setupBudget ?? 10));
const seed = Number(opt('seed', 1));

let site = null, cityInfo = null;
if (city.on) {
  const read = city.blueprint ? readCityBlock(await decodeBlueprint(city.blueprint), catalog) : { area: { x: 0, y: 0, w: city.w, h: city.h }, fixtures: [], unknown: [] };
  site = siteOf(read, city.buffer);
  cityInfo = { area: read.area, buffer: city.buffer, fixtures: read.fixtures.length, unknown: read.unknown };
}

// ---- A child running one build strategy (forked below) ----
if (flag('child')) {
  const chain = expandChain(goals, catalog, { made, selections, uses, exports, voids, index, belt: logistics.belt, logistics });
  const run = search(chain.entries, catalog, logistics, { seed, deadline: Date.now() + budgetMs, site, strategy: opt('strategy') });
  let step;
  // (Each message sent before the search goes on: the search never yields, and a large one
  // queued until it ends was lost at the exit.)
  const send = m => new Promise(res => process.send(m, res));
  for (step = run.next(); !step.done; step = run.next()) await send({ type: 'best', block: step.value.block, score: step.value.score, tried: step.value.tried });
  await send({ type: 'done', tried: step.value.tried, failure: step.value.failure?.message ?? null });
  process.exit(0);
}

const t0 = Date.now();
const secs = () => +((Date.now() - t0) / 1000).toFixed(1);
const log = line => {
  console.log(line);
  appendFileSync(`${out}/log.txt`, line + '\n');
};
writeFileSync(`${out}/log.txt`, '');
if (opt('profile-slow')) {
  const { Worker } = await import('node:worker_threads');
  new Worker(new URL('./profiler-worker.mjs', import.meta.url), {
    workerData: { log: `${out}/log.txt`, out, slow: Number(opt('profile-slow')), span: Number(opt('profile-for', 60)), v8log: `${out}/v8.log`, start: Date.now() - performance.now() },
  }).on('error', e => console.error('profiler:', e.message)).unref();
}

const plan = () => planner(goals, catalog, logistics, { made, selections, uses, exports, voids, index, site });
let mode = opt('mode', 'auto');
let upTo = flag('upTo');
if (mode === 'auto') {
  if (!site) mode = 'build';
  else if (city.maximize) mode = 'maximize';
  else {
    const p = plan();
    mode = p.foretold().machines < p.wanted ? 'maximize' : 'build';
    upTo = true;
  }
}
log(`# ${basename(file)} mode=${mode}${upTo ? ' upTo' : ''} budget=${budgetMs / 1000}s root=${root} goals=${goals.map(g => `${g.item}@${g.rate}`).join(',')}`
  + (state.result?.status ? `\n# the page said: ${state.result.status}` : '')
  + (site ? ` site=${site.area.w}x${site.area.h} buffer=${site.buffer} fixtures=${site.fixtures.length}` : ''));

let best = null, bestAt = null, result = {};
const keep = (block, extra = {}) => {
  best = { block, ...extra };
  bestAt = secs();
  writeFileSync(`${out}/best.json`, JSON.stringify(block));
};

if (mode === 'attempt') {
  const n = Number(opt('n'));
  const p = plan();
  log(`${secs()} try machines=${n}`);
  const outcome = attempt(p, n, { site, budgetMs, seed, unsorted: flag('unsorted'), sorting: flag('sorting'), giving: flag('giving'), precheck: flag('precheck'), starving: flag('starving') });
  result = { n, tried: outcome.tried, failure: outcome.failure?.message ?? null, timedOut: outcome.timedOut ?? null, starves: outcome.starves ?? null };
  if (outcome.block) keep(outcome.block, { machines: n, rate: p.goalsFor(n)[0].rate });
  log(`${secs()} attempt n=${n} ${outcome.block ? 'FIT' : 'no'} tried=${outcome.tried} ${outcome.failure?.message ?? ''}`);
} else if (mode === 'maximize') {
  const total = opt('total') ? Number(opt('total')) * 1000 : Infinity;
  const parallel = Number(opt('parallel', 1));
  const generator = maximize(goals, catalog, logistics, {
    made, selections, uses, exports, voids, index, upTo, site, budgetMs, seed, parallel,
    ...(flag('no-annexes') ? { annexes: false } : {}), ...(flag('no-bands') ? { bands: false } : {}), ...(flag('no-giving') ? { giving: false } : {}), ...(flag('no-starving') ? { starving: false } : {}),
  });
  // (Tries at once: each in a worker thread, ADR 0060.)
  let run = generator;
  if (parallel > 1) {
    const { Worker } = await import('node:worker_threads');
    const { tryPool, drive } = await import(`${root}/js/parallel.js`);
    run = drive(generator, tryPool(() => {
      const worker = new Worker(new URL('./try-worker.mjs', import.meta.url), { workerData: { root, logistics } });
      return {
        run: job => new Promise((done, failed) => {
          worker.removeAllListeners('message');
          worker.on('message', m => (m.error ? failed(new Error(m.error)) : done(m.outcome)));
          worker.postMessage(job);
        }),
        stop: () => worker.terminate(),
      };
    }));
  }
  const tries = [];
  let step, open = null;
  for (step = await run.next(); !step.done; step = await run.next()) {
    const v = step.value;
    if (v.type === 'best') {
      keep(v.block, { rate: v.rate, machines: v.machines });
      // (Tries at once: the fit is the try of its rate, not the last begun.)
      const fit = parallel > 1 ? tries.findLast(t => t.rate === v.rate && t.machines === v.machines) : open;
      if (fit) fit.fit = true;
      log(`${secs()} BEST rate=${v.rate}${v.delivered !== undefined ? ` delivered=${v.delivered}` : ''} machines=${v.machines} goalCounts=${goalCounts(v.block).join('+')}`);
    } else {
      if (v.type === 'try') tries.push(open = { t: secs(), rate: v.rate, machines: v.machines, more: v.more ?? null, giving: v.giving ?? false, starving: v.starving ?? false, fit: false });
      log(`${secs()} ${v.type} rate=${v.rate} machines=${v.machines}${v.more ? ` more=${v.more}` : ''}${v.giving ? ' giving' : ''}${v.starving ? ' starving' : ''}`);
    }
    if (Date.now() - t0 > total) {
      log(`${secs()} STOPPED (--total)`);
      await run.return?.();
      break;
    }
  }
  // (Tries at once: no try's own time, only when it began.)
  tries.forEach((t, i) => t.secs = parallel > 1 ? null : +((tries[i + 1]?.t ?? secs()) - t.t).toFixed(1));
  result = step.done ? { ...step.value, failure: step.value.failure?.message ?? null } : { stopped: true };
  result.tries = tries;
} else {
  // A build: every strategy side by side (the page's workers), the best any finds kept.
  const strategies = opt('strategy') ? [opt('strategy')] : ['search', 'spread'];
  const better = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
    return false;
  };
  const done = await Promise.all(strategies.map(strategy => new Promise(res => {
    const child = fork(fileURLToPath(import.meta.url), [...process.argv.slice(2).filter(a => a !== '--strategy' && !strategies.includes(a)), '--child', '--strategy', strategy], { serialization: 'advanced' });
    let last = null;
    child.on('message', m => {
      if (m.type === 'best') {
        const rank = rankOf(m.block);
        if (!best || better(rank, best.rank)) {
          keep(m.block, { rank, strategy });
          log(`${secs()} BEST ${strategy} tried=${m.tried} rank=${JSON.stringify(rank)} ${m.block.bounds.w}x${m.block.bounds.h}`);
        }
      } else last = m;
    });
    child.on('exit', () => res({ strategy, ...last }));
  })));
  result = { strategies: done };
  log(`${secs()} build done ${done.map(d => `${d.strategy}: tried=${d.tried}${d.failure ? ` failure=${d.failure}` : ''}`).join('; ')}`);
  if (!best && site && mode === 'build' && opt('mode', 'auto') === 'auto') log('# no layout: the page would now fill up to the rate — rerun with --mode maximize --upTo');
}

function goalCounts(block) {
  return block.subBlocks.filter(sb => sb.item === goals[0]?.item).map(sb => sb.count);
}

// ---- The summary ----
const summary = { setup: basename(file), mode, upTo, root, seed, budgetS: budgetMs / 1000, secs: secs(), bestAtS: bestAt, city: cityInfo, ...result, tries: undefined };
if (best) {
  const b = best.block;
  const errors = validateBlock(b, catalog, logistics);
  const starvation = simulate(b).starvation;
  const tiles = (list, pred) => list.filter(pred).reduce((s, e) => s + (e.w ?? 1) * (e.h ?? 1), 0);
  Object.assign(summary, {
    rate: best.rate ?? goals[0]?.rate, machines: best.machines ?? null,
    goalMachines: goalCounts(b).reduce((s, n) => s + n, 0), goalCounts: goalCounts(b),
    subBlocks: b.subBlocks.map(sb => ({ item: sb.item, recipe: sb.recipe, count: sb.count, rate: +sb.rate.toFixed(2), box: sb.w && `${sb.w}x${sb.h}`, ...(sb.part !== undefined ? { part: sb.part } : {}) })),
    bounds: `${b.bounds.w}x${b.bounds.h}`,
    compactness: compactness(b),
    valid: errors.length === 0, errors: errors.slice(0, 5),
    starving: +starvation.reduce((s, x) => s + x.demand - x.available, 0).toFixed(3), starvation: starvation.slice(0, 5),
    loopsByTrain: rankOf(b)[1], byproductsRiding: rankOf(b)[2],
    delivered: goals[0] ? +throughput(b).delivered(goals[0].item).toFixed(2) : null,
    entities: b.entities.length, routes: b.routes.length,
  });
  if (site) {
    // The room inside the Buffer, less the Fixtures in it, and how much of it the block fills.
    const { inner } = site;
    const taken = new Set();
    const mark = (x, y, w = 1, h = 1) => {
      for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) if (i >= inner.x && j >= inner.y && i < inner.x + inner.w && j < inner.y + inner.h) taken.add(i * 100000 + j);
    };
    for (const f of site.fixtures) mark(f.x, f.y, f.w, f.h);
    const fixtureTiles = taken.size;
    for (const e of b.entities) mark(e.x, e.y, e.w, e.h);
    for (const r of b.routes) for (const p of r.pieces) mark(p.x, p.y);
    const room = inner.w * inner.h - fixtureTiles;
    const machineTiles = tiles(b.entities, e => e.kind === 'building');
    summary.room = { tiles: room, used: taken.size - fixtureTiles, empty: room - (taken.size - fixtureTiles), machineShare: +(machineTiles / room).toFixed(3) };
  }
}
writeFileSync(`${out}/summary.json`, JSON.stringify({ ...summary, tries: result.tries }, null, 1));
const { subBlocks, tries, compactness: c, ...head } = summary;
console.log('\n== summary', JSON.stringify(head));
if (subBlocks) for (const sb of subBlocks) console.log('  ', JSON.stringify(sb));
if (result.tries) console.log('  tries:', result.tries.map(t => `${t.machines}${t.fit ? '✓' : '✗'}${t.giving ? 'g' : ''}${t.secs === null ? '' : `(${t.secs}s)`}`).join(' '));
console.log(`files: ${out}/{log.txt,best.json,summary.json}`);
process.exit(0);
