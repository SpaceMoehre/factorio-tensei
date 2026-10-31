// A job, as a worker runs it: on the page in a web worker of its own (worker.js), in a worker
// thread (node-worker.js), or in-process (runners.js inlineRunner) — each the same, its events
// yielded as they come, ending with { type: 'end' }.
//
// The layout search, with the strategy it is given ('search' or 'spread', ADR 0013; a build runs
// one worker for each, side by side, each Sub-Block designed first in a worker of its own and the
// designs handed to them: `designs`): { type: 'best', block, score, tried } for every layout that
// beats its best so far, then { type: 'done', tried, failure } when the budget (or `maxCandidates`)
// is spent, or { type: 'error', message }.
// In a City Block (site) with `maximize` ({ goals, made, selections, uses, exports, voids, upTo,
// parallel }), the highest rate that fits instead (upTo: no higher than the Goals' own):
// { type: 'foretell', rate, machines } whenever the Foretelling changes, { type: 'try', rate,
// machines } before each try, { type: 'best', …, rate, machines, goals } for each that fits, and
// { type: 'done', tried, failure, rate, machines, goals, above } at the end (`above`: the lowest
// rate tried that did not fit, and why). A layout that starves comes with what it delivers of the
// first Goal (`delivered`, ADR 0057); a 'try' of one says `starving`. Its tries run `parallel` at
// once, each in a worker of the runner's (ADR 0060: `attempt`, a try's job, answered by
// { type: 'attempted', outcome }); a 'try' names the others under way (`others`: their machines).
// One Sub-Block designed on its own (`design`: its index): { type: 'designed', index, list } (its
// candidates, those built with their design, the rest as what they are).
// A move (`move`: { edit (the shown block's), step, inst, dx, dy, score }) lays the shown block out
// again with that Sub-Block moved (edit.js): { type: 'trying', tried, at, pushed } before each
// layout it tries, then { type: 'moved', block, at, pushed, back, score, tried }, or { type:
// 'stuck', message, tried } where none routes. A reshape (`reshape`: { edit, step, way ('squarer'
// or 'longer'), score, list (the Sub-Block's design candidates the build had, or null: designed
// here) }) the same, its 'moved' with `shape` and `was`; a turn (`turn`: { edit, step, turns,
// dx, dy, score }) the same. Pulling together (`compact`: { edit, score }) yields { type:
// 'better', block, score, slid } for each slide it keeps, then { type: 'moved', block (null where
// none was kept), score, slid, back, tried }.
import { search } from './search.js';
import { maximize, tidied } from './maximize.js';
import { runTry, tryPool, drive } from './parallel.js';
import { context, designStep, random, revive } from './design.js';
import { moveCopies, reshapeCopies, turnCopies, compactCopies } from './layout/edit.js';

// job: as above, with { entries, logistics, budgetMs, seed, site, maxCandidates }; runner: where a
// Maximize's tries at once run (runners.js).
export async function* runJob(job, catalog, runner) {
  const { entries, logistics, budgetMs, seed, site = null, maximize: goals = null, strategy = 'search', design = null, designs = null, move = null, reshape = null, turn = null, compact = null, attempt = null, maxCandidates = Infinity } = job;
  try {
    // One of a Maximize's tries, run for the worker running it (ADR 0060).
    if (attempt) {
      yield { type: 'attempted', outcome: runTry(attempt, catalog, logistics) };
    } else if (move || reshape || turn || compact) {
      // (The Production Chain the block was laid out for: a Maximize's at the rate that fit.)
      const { edit, score, list = null, ...what } = move ?? reshape ?? turn ?? compact;
      const ctx = context(edit.entries ?? entries, catalog, logistics, site);
      const deadline = Date.now() + budgetMs;
      const rng = random((seed ?? 1) + (what.step ?? 0));
      const run = move ? moveCopies(ctx, edit, what, { score, deadline })
        : turn ? turnCopies(ctx, edit, what, { score, deadline })
          : compact ? compactCopies(ctx, edit, { score, deadline })
            : reshapeCopies(ctx, edit, what, { score, deadline, list: list ? revive(ctx, what.step, list, rng) : designStep(ctx, what.step, rng, { deadline }) });
      let step = run.next();
      for (; !step.done; step = run.next()) yield step.value;
      const { failure, ...out } = step.value;
      yield failure ? { type: 'stuck', message: failure.message, tried: out.tried } : { type: 'moved', ...out };
    } else if (design !== null) {
      const ctx = context(entries, catalog, logistics, site);
      const list = designStep(ctx, design, random(seed + design));
      yield { type: 'designed', index: design, list: list.map(({ build, ...c }) => c) };
    } else if (goals) {
      const { goals: list, upTo, parallel = 1, ...chosen } = goals;
      const run = maximize(list, catalog, logistics, { ...chosen, upTo, site, budgetMs, seed, parallel, ...(maxCandidates < Infinity ? { maxCandidates } : {}) });
      // Its tries at once, each in a worker of the runner's.
      const events = drive(run, tryPool(() => {
        const worker = runner.worker();
        let stopped = false;
        return {
          run: async job => {
            for await (const data of worker.run({ attempt: job, logistics })) {
              if (data.type === 'attempted') return data.outcome;
              if (data.type === 'error') throw new Error(data.message);
            }
            // (A try stopped, its worker with it, has no outcome: nothing waits for one.)
            if (stopped) return new Promise(() => {});
            throw new Error('the try ended without an outcome');
          },
          stop: () => {
            stopped = true;
            worker.stop();
          },
        };
      }));
      let step = await events.next(), last = null;
      for (; !step.done; step = await events.next()) {
        if (step.value.type === 'best') last = step.value;
        yield step.value;
      }
      // The last layout once more, its belts straightened as Compactness weighs turns (ADR 0087).
      const shown = last && tidied(last.block, catalog, logistics, list[0].item);
      if (shown && shown !== last.block) yield { ...last, block: shown };
      const { tried, failure, rate, machines, goals: fit, above, delivered } = step.value;
      yield { type: 'done', tried, failure: failure?.message ?? null, rate, machines, goals: fit, above, delivered };
    } else {
      const run = search(entries, catalog, logistics, { seed, deadline: Date.now() + budgetMs, maxCandidates, site, strategy, designs });
      let step = run.next();
      for (; !step.done; step = run.next()) yield { type: 'best', ...step.value };
      yield { type: 'done', tried: step.value.tried, failure: step.value.failure?.message ?? null };
    }
  } catch (e) {
    yield { type: 'error', message: e.message };
  }
}
