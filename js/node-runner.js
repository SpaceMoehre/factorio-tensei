// A runner (runners.js) for a run without the page: each worker a worker thread (node-worker.js)
// with the catalog at `catalogPath` read for itself, as each of the page's web workers fetches
// its own.
import { Worker } from 'node:worker_threads';
import { webRunner } from './runners.js';

export function threadRunner(catalogPath) {
  return webRunner(() => {
    const thread = new Worker(new URL('./node-worker.js', import.meta.url), { workerData: { catalogPath } });
    const worker = {
      onmessage: null, onerror: null,
      postMessage: job => thread.postMessage(job),
      terminate: () => thread.terminate(),
    };
    thread.on('message', data => worker.onmessage?.({ data }));
    thread.on('error', e => worker.onerror?.(e));
    return worker;
  });
}
