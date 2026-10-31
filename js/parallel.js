// Maximize's tries at once (ADR 0060). maximize, given `parallel`, yields { type: 'start', id,
// job } for a try to run elsewhere, { type: 'wait' } for the first under way to finish (given
// back as { id, outcome }) and { type: 'cancel', id } for one no longer worth finishing; drive
// runs them in a pool of workers and yields everything else as it comes. Each environment makes
// its own workers (the page's Web Workers, Node's worker threads), each running runTry.
import { planner, attempt, bandsTop } from './maximize.js';

// One try, as a worker runs it: attempt's outcome, its failure as its message. (Or, `top`, the
// most machines Bands' parts hold: { top }.)
export function runTry(job, catalog, logistics) {
  const plan = planner(job.goals, catalog, logistics, job.planner);
  if (job.top) return { top: bandsTop(plan, job.planner.site) };
  const outcome = attempt(plan, job.n, job.options);
  return { ...outcome, failure: outcome.failure ? { message: outcome.failure.message } : null };
}

// A pool of workers for tries: `make()` makes one, { run(job) (a promise of runTry's outcome),
// stop() }. A worker whose try is stopped is stopped with it (a try cannot be interrupted);
// one whose try finished takes the next.
export function tryPool(make) {
  const idle = [], going = new Map();
  return {
    start(id, job) {
      const worker = idle.pop() ?? make();
      going.set(id, { worker, done: worker.run(job).then(outcome => ({ id, outcome: { ...outcome, failure: outcome.failure ? new Error(outcome.failure.message) : null } })) });
    },
    async wait() {
      const first = await Promise.race([...going.values()].map(g => g.done));
      idle.push(going.get(first.id).worker);
      going.delete(first.id);
      return first;
    },
    cancel(id) {
      going.get(id)?.worker.stop();
      going.delete(id);
    },
    close() {
      for (const worker of [...idle, ...[...going.values()].map(g => g.worker)]) worker.stop();
      idle.length = 0;
      going.clear();
    },
  };
}

// maximize's events (its generator `run`) with its tries run by `pool`: every other event
// yielded as it comes; returns what maximize returns.
export async function* drive(run, pool) {
  let step, reply;
  try {
    for (step = run.next(); !step.done; step = run.next(reply)) {
      const v = step.value;
      reply = undefined;
      if (v.type === 'start') pool.start(v.id, v.job);
      else if (v.type === 'cancel') pool.cancel(v.id);
      else if (v.type === 'wait') reply = await pool.wait();
      else yield v;
    }
  } finally {
    pool.close();
  }
  return step.value;
}
