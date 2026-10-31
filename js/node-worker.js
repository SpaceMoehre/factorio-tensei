// A worker thread running jobs (jobs.js) for a run without the page (node-runner.js), as the
// page's web workers do (worker.js): each job's events posted as they come, then { type: 'end' }.
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { runJob } from './jobs.js';
import { threadRunner } from './node-runner.js';

const catalog = JSON.parse(readFileSync(workerData.catalogPath, 'utf8'));
const runner = threadRunner(workerData.catalogPath);

parentPort.on('message', async job => {
  try {
    for await (const event of runJob(job, catalog, runner)) parentPort.postMessage(event);
  } catch (e) {
    parentPort.postMessage({ type: 'error', message: e.message });
  }
  parentPort.postMessage({ type: 'end' });
});
