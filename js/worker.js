// A web worker of the page's: runs each job it is sent (jobs.js), posting its events as they
// come, then { type: 'end' }. Its own jobs' workers (a Maximize's tries at once) are web workers
// of this one. The page stops a job by terminating the worker.
import { runJob } from './jobs.js';
import { webRunner } from './runners.js';

const catalog = fetch(new URL('../data/catalog.json', import.meta.url)).then(r => r.json());
const runner = webRunner(() => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));

self.onmessage = async ({ data }) => {
  try {
    for await (const event of runJob(data, await catalog, runner)) self.postMessage(event);
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
  self.postMessage({ type: 'end' });
};
