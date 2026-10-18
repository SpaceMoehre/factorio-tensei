// Runs the layout search off the page's thread, with the strategy it is given ('search' or
// 'spread', ADR 0013; the page runs one worker for each, side by side, each Sub-Block designed
// first in a worker of its own and the designs handed to them: `designs`). Posts every layout
// that beats its best so far ({ type: 'best', block, score, tried }), then { type: 'done',
// tried, failure } when the budget is spent, or { type: 'error', message }. The page stops a
// search by terminating the worker; it keeps the best layout any worker sent.
// In a City Block (site) with `maximize` ({ goals, made, selections, uses, upTo }), it looks for the
// highest rate that fits instead (upTo: no higher than the Goals' own): { type: 'foretell', rate, machines } whenever the Foretelling changes,
// { type: 'try', rate, machines } before each try, { type: 'best', …, rate, machines, goals } for
// each that fits, and { type: 'done', tried, failure, rate, machines, goals, above } at the end
// (`above`: the lowest rate tried that did not fit, and why). A layout that starves comes with
// what it delivers of the first Goal (`delivered`, ADR 0057); a 'try' of one says `starving`.
// Its tries run several at once, each in a worker of its own made here (ADR 0060: `attempt`, a
// try's job, answered by { type: 'attempted', outcome }); a 'try' names the others under way
// (`others`: their machines).
// A move (`move`: { edit (the shown block's), step, inst, dx, dy, score }) lays the shown block out
// again with that Sub-Block moved (edit.js): { type: 'trying', tried, at, pushed } before each
// layout it tries, then { type: 'moved', block, at, pushed, back, score, tried }, or { type:
// 'stuck', message, tried } where none routes. A reshape (`reshape`: { edit, step, way ('squarer'
// or 'longer'), score, list (the Sub-Block's design candidates the build had, or null: designed
// here) }) the same, its 'moved' with `shape` and `was`; a turn (`turn`: { edit, step, turns,
// dx, dy, score }) the same. Pulling together (`compact`: { edit, score }) posts { type:
// 'better', block, score, slid } for each slide it keeps, then { type: 'moved', block (null where
// none was kept), score, slid, back, tried }.
import { search } from './search.js';
import { maximize } from './maximize.js';
import { runTry, tryPool, drive } from './parallel.js';
import { context, designStep, random, revive } from './design.js';
import { moveCopies, reshapeCopies, turnCopies, compactCopies } from './layout/edit.js';

const catalog = fetch(new URL('../data/catalog.json', import.meta.url)).then(r => r.json());

// The most tries a Maximize runs at once (each worker holds its own catalog and search).
const TRIES_AT_ONCE = 8;

self.onmessage = async ({ data: { entries, logistics, budgetMs, seed, site = null, maximize: goals = null, strategy = 'search', design = null, designs = null, move = null, reshape = null, turn = null, compact = null, attempt = null } }) => {
  try {
    // One of a Maximize's tries, run for the worker running it (ADR 0060): { type: 'attempted',
    // outcome }.
    if (attempt) {
      self.postMessage({ type: 'attempted', outcome: runTry(attempt, await catalog, logistics) });
      return;
    }
    if (move || reshape || turn || compact) {
      // (The Production Chain the block was laid out for: a Maximize's at the rate that fit.)
      const { edit, score, list = null, ...what } = move ?? reshape ?? turn ?? compact;
      const ctx = context(edit.entries ?? entries, await catalog, logistics, site);
      const deadline = Date.now() + budgetMs;
      const rng = random((seed ?? 1) + (what.step ?? 0));
      const run = move ? moveCopies(ctx, edit, what, { score, deadline })
        : turn ? turnCopies(ctx, edit, what, { score, deadline })
          : compact ? compactCopies(ctx, edit, { score, deadline })
            : reshapeCopies(ctx, edit, what, { score, deadline, list: list ? revive(ctx, what.step, list, rng) : designStep(ctx, what.step, rng, { deadline }) });
      let step = run.next();
      for (; !step.done; step = run.next()) self.postMessage(step.value);
      const { failure, ...out } = step.value;
      self.postMessage(failure ? { type: 'stuck', message: failure.message, tried: out.tried } : { type: 'moved', ...out });
      return;
    }
    // One Sub-Block designed on its own (`design`: its index): its candidates, those built with
    // their design, the rest as what they are ({ type: 'designed', index, list }).
    if (design !== null) {
      const ctx = context(entries, await catalog, logistics, site);
      const list = designStep(ctx, design, random(seed + design));
      self.postMessage({ type: 'designed', index: design, list: list.map(({ build, ...c }) => c) });
      return;
    }
    if (goals) {
      // Its tries several at once, a worker of its own each (ADR 0060): as many as the machine
      // has cores, but this one's (mostly waiting), and no more than a gigabyte of its memory
      // each (a try of Py titanium plate's 21 Sub-Blocks holds about 0.6).
      const memory = /** @type {any} */ (self.navigator)?.deviceMemory ?? 4;
      const parallel = Math.max(1, Math.min(TRIES_AT_ONCE, (self.navigator?.hardwareConcurrency ?? 1) - 1, Math.floor(memory)));
      const run = maximize(goals.goals, await catalog, logistics, { made: goals.made, selections: goals.selections, uses: goals.uses, upTo: goals.upTo, site, budgetMs, seed, parallel });
      const events = drive(run, tryPool(() => {
        const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        return {
          run: job => new Promise((done, failed) => {
            worker.onmessage = ({ data }) => (data.type === 'attempted' ? done(data.outcome) : data.type === 'error' ? failed(new Error(data.message)) : null);
            worker.onerror = e => failed(new Error(e.message));
            worker.postMessage({ attempt: job, logistics });
          }),
          stop: () => worker.terminate(),
        };
      }));
      let step = await events.next();
      for (; !step.done; step = await events.next()) self.postMessage(step.value);
      const { tried, failure, rate, machines, goals: list, above, delivered } = step.value;
      self.postMessage({ type: 'done', tried, failure: failure?.message ?? null, rate, machines, goals: list, above, delivered });
      return;
    }
    const run = search(entries, await catalog, logistics, { seed, deadline: Date.now() + budgetMs, site, strategy, designs });
    let step = run.next();
    for (; !step.done; step = run.next()) self.postMessage({ type: 'best', ...step.value });
    self.postMessage({ type: 'done', tried: step.value.tried, failure: step.value.failure?.message ?? null });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
