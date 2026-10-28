// Runs a setup headless, as the page would, and measures what came out.
//
//   node run.mjs <setup.json> [options]
//
// <setup.json>: the page's saved state (localStorage 'factory-tensei:v1': goals, logistics, made,
// selections, uses, exports, voids, city { on, blueprint, w, h, buffer, maximize }), or the same with the City
// Block's blueprint string at the top level (`blueprint`).
//
// options:
//   --mode auto|maximize|build|attempt   auto (default): as the page does (js/session.js, the
//                                        same code) — a City Block with Maximize on maximizes; a
//                                        City Block the Goals are foretold not to fit (or a build
//                                        finds no layout in) fills up to them (upTo); elsewhere a
//                                        build: each Sub-Block designed in a worker thread of its
//                                        own, then every strategy side by side. build: the same
//                                        with Maximize off. maximize: maximize.js directly
//   --n N             attempt: the first Goal's machines to try (one try of Maximize)
//   --budget S        seconds: each try's (maximize/attempt), the whole search's (build); default
//                     the setup's logistics.budget, else 10
//   --total S         auto/build/maximize: stop after S seconds of wall clock, keeping the best so far
//                     (checked between events: a try running finishes first, up to --budget)
//   --upTo            maximize no higher than the Goals' own rates
//   --giving --unsorted --sorting --precheck --starving   attempt: search options as Maximize passes them
//   --no-annexes --no-bands --no-giving --no-starving   maximize: leave that phase out
//   --parallel N      maximize: tries at once, each in a worker thread (ADR 0060); default 1,
//                     one after another (the page runs as many as its machine has cores, less 1)
//   --seed N          maximize/attempt (auto and build take the page's, 1); default 1
//   --root DIR        the repo to run (another worktree for an A/B), default this one
//   --out DIR         where log.txt, best.json and summary.json go (default ./out-<setup name>)
//   --strategy S      build: one strategy only (search|spread); default both side by side
//   --profile-slow S  once a try runs S seconds with no event, sample the CPU for --profile-for
//                     seconds (60): <out>/slow-<k>.txt (hottest functions and stack), .cpuprofile
//
// Prints each event as it comes (seconds, type, rate, machines), then the summary (summary.json).
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
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
// (A setup read as the page reads it; this repo's reading where the code under test has none.)
const { setupOf } = await import(`${root}/js/setup.js`).catch(() => import('../../../../js/setup.js'));
const { validateBlock } = await import(`${root}/js/layout/validity.js`);
const { simulate, throughput } = await import(`${root}/js/sim.js`);
const { compactness, scoreOf } = await import(`${root}/js/layout/score.js`);
const catalog = JSON.parse(readFileSync(`${root}/data/catalog.json`, 'utf8'));

const state = JSON.parse(readFileSync(file, 'utf8'));
// (The page's defaults for what the setup leaves unset.)
const { goals, choices, logistics, budget: setupBudget, city } = setupOf(state, catalog);
const budgetMs = 1000 * Number(opt('budget', setupBudget ?? 10));
const seed = Number(opt('seed', 1));

let site = null, cityInfo = null;
if (city.on) {
  const read = city.blueprint ? readCityBlock(await decodeBlueprint(city.blueprint), catalog) : { area: { x: 0, y: 0, w: city.w, h: city.h }, fixtures: [], unknown: [] };
  site = siteOf(read, city.buffer);
  cityInfo = { area: read.area, buffer: city.buffer, fixtures: read.fixtures.length, unknown: read.unknown };
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

const plan = () => planner(goals, catalog, logistics, { ...choices, site });
// (auto and build: as the page builds, session.js; it says which it runs.)
let mode = opt('mode', 'auto');
let upTo = flag('upTo');
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
    ...choices, upTo, site, budgetMs, seed, parallel,
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
  // As the page builds (session.js): in a City Block with Maximize on (not with --mode build), the
  // highest rate that fits; elsewhere each Sub-Block designed in a worker thread of its own, then
  // every strategy side by side from those designs, the best any finds kept; a City Block the
  // Goals are foretold not to fit, or one a build finds no layout in, filled up to them.
  const { buildSession } = await import(`${root}/js/session.js`);
  const { threadRunner } = await import(`${root}/js/node-runner.js`);
  const total = opt('total') ? Number(opt('total')) * 1000 : Infinity;
  const parallel = Number(opt('parallel', 1));
  const session = buildSession({ goals, choices, logistics, budget: budgetMs / 1000, city: mode === 'build' ? { ...city, maximize: false } : city }, site, catalog, threadRunner(`${root}/data/catalog.json`), {
    width: parallel, upTo, ...(opt('strategy') ? { strategies: [opt('strategy')] } : {}),
    maximize: { ...(flag('no-annexes') ? { annexes: false } : {}), ...(flag('no-bands') ? { bands: false } : {}), ...(flag('no-giving') ? { giving: false } : {}), ...(flag('no-starving') ? { starving: false } : {}) },
  });
  const tries = [];
  let open = null, maximizing = false;
  for await (const v of session.events) {
    if (v.type === 'start') {
      [maximizing, upTo] = [v.maximize, v.upTo];
      mode = maximizing ? 'maximize' : 'build';
      log(`${secs()} start ${mode}${upTo ? ' upTo' : ''} subBlocks=${v.job.entries.length}`);
    } else if (v.type === 'best') {
      if (v.found) {
        keep(v.block, { rate: v.found.rate, machines: v.found.machines });
        // (Tries at once: the fit is the try of its rate, not the last begun.)
        const fit = parallel > 1 ? tries.findLast(t => t.rate === v.found.rate && t.machines === v.found.machines) : open;
        if (fit) fit.fit = true;
        log(`${secs()} BEST rate=${v.found.rate}${v.found.delivered !== undefined ? ` delivered=${v.found.delivered}` : ''} machines=${v.found.machines} goalCounts=${goalCounts(v.block).join('+')}`);
      } else {
        keep(v.block, { rank: v.score });
        log(`${secs()} BEST tried=${v.tried} rank=${JSON.stringify(v.score)} ${v.block.bounds.w}x${v.block.bounds.h}`);
      }
    } else if (v.type === 'try' || v.type === 'foretell') {
      if (v.type === 'try') tries.push(open = { t: secs(), rate: v.rate, machines: v.machines, more: v.more ?? null, giving: v.giving ?? false, starving: v.starving ?? false, fit: false });
      log(`${secs()} ${v.type} rate=${v.rate} machines=${v.machines}${v.more ? ` more=${v.more}` : ''}${v.giving ? ' giving' : ''}${v.starving ? ' starving' : ''}`);
    } else if (v.type === 'done') {
      result = { how: v.how, tried: v.tried, failure: v.failure, above: v.above ?? null, ...(v.found ?? {}) };
      log(`${secs()} ${mode} done tried=${v.tried}${v.failure ? ` failure=${v.failure}` : ''}`);
    } else log(`${secs()} ${v.type}${v.count !== undefined ? ` ${v.count}` : ''}`);
    if (Date.now() - t0 > total) {
      log(`${secs()} STOPPED (--total)`);
      session.stop();
      result = { stopped: true };
      break;
    }
  }
  // (Tries at once: no try's own time, only when it began.)
  tries.forEach((t, i) => t.secs = parallel > 1 ? null : +((tries[i + 1]?.t ?? secs()) - t.t).toFixed(1));
  if (maximizing) result.tries = tries;
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
    loopsByTrain: scoreOf(b).loopsByTrain, byproductsRiding: scoreOf(b).riding,
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
