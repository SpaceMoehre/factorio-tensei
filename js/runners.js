// Runners: where jobs (jobs.js) run. A runner makes workers, each running one job after another:
// runner.worker() → { run(job) (the job's events as they come, async), stop() (ends the job
// under way, and the worker) }. The page runs each in a web worker of its own (webRunner), a run
// without it in a worker thread (node-runner.js) or in-process (inlineRunner); every one runs a
// job alike.
import { runJob } from './jobs.js';

// Events as they come from a worker: pushed, and read (drained) as an async iterator until one
// that ends the job. `ended`: once that one came, whether or not it was read to the end.
function channel() {
  const queue = [];
  let wake = null, done;
  const ended = new Promise(resolve => { done = resolve; });
  return {
    ended,
    push(event) {
      if (event.type === 'end') done();
      queue.push(event);
      wake?.();
      wake = null;
    },
    async* drain() {
      for (;;) {
        while (queue.length) {
          const event = queue.shift();
          if (event.type === 'end') return;
          yield event;
        }
        await new Promise(resolve => { wake = resolve; });
      }
    },
  };
}

// Each worker a web worker of worker.js (`url`), or anything with its interface: postMessage,
// onmessage, onerror, terminate (`make`).
export function webRunner(make) {
  return {
    worker() {
      const worker = make();
      // (`dead`: why the worker failed, or that it was stopped: a job after that runs nowhere.)
      let events = null, dead = null;
      worker.onmessage = ({ data }) => events?.push(data);
      worker.onerror = e => {
        dead = e.message;
        events?.push({ type: 'error', message: e.message });
        events?.push({ type: 'end' });
      };
      return {
        // (A job after the last one ended, though its reader stopped early: what the worker still
        // posts of it stays its own.)
        async* run(job) {
          await events?.ended;
          if (dead) {
            yield { type: 'error', message: dead };
            return;
          }
          events = channel();
          worker.postMessage(job);
          yield* events.drain();
        },
        stop() {
          dead ??= 'the worker was stopped';
          worker.terminate();
          events?.push({ type: 'end' });
        },
      };
    },
  };
}

// Each job in this thread, one after another (each worker's jobs share its module state, as a
// worker's do). Jobs side by side take turns, each running on to its next event: with a time
// budget, one after another rather than at once (a run with a candidate count only).
export function inlineRunner(catalog) {
  const runner = {
    worker() {
      let stopped = false;
      return {
        async* run(job) {
          for await (const event of runJob(job, catalog, runner)) {
            if (stopped) return;
            yield event;
          }
        },
        stop() {
          stopped = true;
        },
      };
    },
  };
  return runner;
}
