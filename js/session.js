// A build, as the page runs it and a run without it alike: from a setup (setup.js) to the layouts
// its workers find. In a City Block with Maximize on, the highest rate that fits; elsewhere a
// build: each Sub-Block designed in a worker of its own, all at once, then every Strategy side by
// side from those designs (ADR 0013), the best layout any of them finds kept. A City Block the
// Goals' own rates are foretold not to fit, or one a build finds no layout in, is filled up to
// them instead (upTo: a Maximize no higher than the Goals' own rates).
import { expandChain } from './chain.js';
import { partByConsumer } from './plan.js';
import { planner } from './maximize.js';
import { better } from './layout/score.js';

export const STRATEGIES = ['search', 'spread'];

// Several workers' events as they come: { index (whose), event }.
async function* merged(streams) {
  const its = streams.map(s => s[Symbol.asyncIterator]());
  const next = i => its[i].next().then(r => ({ i, r }));
  const pending = new Map(its.map((_, i) => [i, next(i)]));
  while (pending.size) {
    const { i, r } = await Promise.race(pending.values());
    if (r.done) {
      pending.delete(i);
      continue;
    }
    pending.set(i, next(i));
    yield { index: i, event: r.value };
  }
}

// Whether the Goals' own rates are foretold not to fit the City Block.
export function foretoldShort({ goals, choices, logistics }, site, catalog) {
  try {
    const plan = planner(goals, catalog, logistics, { ...choices, site });
    return plan.foretold().machines < plan.wanted;
  } catch {
    return false;
  }
}

// setup: setupOf's { goals, choices, logistics, budget (seconds), city }; site: the City Block's
// (city.js siteOf), or null; runner: where the jobs run (runners.js). options: { width (the most
// tries a Maximize runs at once), maxCandidates (each search's and try's, the budget then no limit:
// a run laid out the same every time), seed (the searches' random numbers, 1 by default: the
// regression suite lays out with others to tell what a change does from what its seed does),
// strategies (a build's, STRATEGIES by default), maximize (more of a Maximize's options: { most,
// annexes, bands, giving, starving }), upTo (filling the City Block up to the Goals' rates), now }.
// Returns { events, stop() } — events (async), in turn:
//   { type: 'start', maximize, upTo, job (what the moves lay the block out again from: { entries,
//     logistics, seed, site }) } — again where a build finding no layout fills up to the Goals;
//   a build: { type: 'designing', count }, then { type: 'designed', designs };
//   { type: 'searching' }; a Maximize's { type: 'foretell', … } and { type: 'try', … } (jobs.js);
//   { type: 'best', block, score, tried, found } for each layout better than the last (a
//     Maximize's every fit, `found`: its { rate, machines, goals, delivered });
//   { type: 'done', how ('Done', or 'Stopped' where designing failed), tried, failure (why the
//     last worker found no more, or none), above (a Maximize's lowest rate that did not fit),
//     found (a Maximize's highest that did: { rate, machines, goals, delivered }, or null) }.
// stop() ends every worker; no event comes after.
export function buildSession(setup, site, catalog, runner, options = {}) {
  const { width = 1, maxCandidates = Infinity, seed = 1, now = () => Date.now() } = options;
  const live = new Set();
  let stopped = false;
  const worker = () => {
    const w = runner.worker();
    live.add(w);
    return w;
  };
  const end = w => {
    w.stop();
    live.delete(w);
  };
  const budgetMs = started => (maxCandidates < Infinity ? 1e12 : Math.max(1, setup.budget * 1000 - (now() - started)));

  async function* run(upTo) {
    const { goals, choices, logistics, city } = setup;
    upTo = Boolean(site && !city.maximize && (upTo || foretoldShort(setup, site, catalog)));
    const maximize = Boolean(site && (city.maximize || upTo));
    const started = now();
    const chain = expandChain(goals, catalog, { ...choices, logistics });
    // (Parted by Consumer before designing, as the search parts them: each Sub-Block by its index.)
    const job = { entries: partByConsumer(chain.entries, catalog, logistics), logistics, seed, site, ...(maxCandidates < Infinity ? { maxCandidates } : {}) };
    yield { type: 'start', maximize, upTo, job };
    let designs = null;
    if (!maximize) {
      yield { type: 'designing', count: job.entries.length };
      const lists = [];
      const ws = job.entries.map(() => worker());
      for await (const { index, event } of merged(ws.map((w, i) => w.run({ ...job, design: i })))) {
        end(ws[index]);
        if (stopped) return;
        if (event.type !== 'designed') {
          for (const w of ws) end(w);
          yield { type: 'done', how: 'Stopped', tried: 0, failure: event.message ?? 'designing failed', above: null, found: null };
          return;
        }
        lists[event.index] = event.list;
      }
      if (stopped) return;
      designs = lists;
      yield { type: 'designed', designs };
    }
    yield { type: 'searching' };
    const strategies = maximize ? ['search'] : options.strategies ?? STRATEGIES;
    const ws = strategies.map(() => worker());
    const tried = strategies.map(() => 0);
    let best = null, failure = null, above = null, found = null;
    const streams = ws.map((w, i) => w.run({
      ...job, strategy: strategies[i], designs,
      // The search time counts from the start, designing included (each strategy tries a layout
      // however little is left).
      budgetMs: budgetMs(started),
      ...(maximize ? { maximize: { goals, ...choices, upTo, parallel: width, ...options.maximize } } : {}),
    }));
    for await (const { index, event } of merged(streams)) {
      if (stopped) return;
      if (event.type === 'foretell' || event.type === 'try') yield event;
      else if (event.type === 'best') {
        tried[index] = event.tried;
        // A Maximize's every fit is a higher rate than the last: kept whatever its score.
        if (event.goals || better(event.score, best?.score)) {
          best = { block: event.block, score: event.score };
          yield { type: 'best', block: event.block, score: event.score, tried: tried.reduce((a, b) => a + b, 0), found: event.goals ? { rate: event.rate, machines: event.machines, goals: event.goals, delivered: event.delivered } : null };
        }
      } else {
        // ('done', or 'error': that worker found no more.)
        if (event.type === 'done') tried[index] = event.tried;
        failure = event.type === 'done' ? event.failure : event.message;
        if (event.above !== undefined) above = event.above;
        if (event.goals) found = { rate: event.rate, machines: event.machines, goals: event.goals, delivered: event.delivered };
        end(ws[index]);
      }
    }
    if (stopped) return;
    // (Nothing fits at the Goals' own rates: filled up to them instead.)
    if (!best && site && !maximize) {
      yield* run(true);
      return;
    }
    yield { type: 'done', how: 'Done', tried: tried.reduce((a, b) => a + b, 0), failure, above, found };
  }

  return {
    events: (async function* () {
      try {
        for await (const event of run(Boolean(options.upTo))) {
          if (stopped) return;
          yield event;
        }
      } catch (e) {
        // (A setup whose chain cannot be made: told, as a worker's failure is.)
        if (!stopped) yield { type: 'done', how: 'Stopped', tried: 0, failure: e.message, above: null, found: null };
      } finally {
        for (const w of [...live]) end(w);
      }
    })(),
    stop() {
      stopped = true;
      for (const w of [...live]) end(w);
    },
  };
}
