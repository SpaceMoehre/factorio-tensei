// A worker thread for run.mjs --parallel: runs a Maximize's tries (js/parallel.js runTry) as the
// page's workers do. workerData: { root (the repo), logistics }.
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';

const { root, logistics } = workerData;
const { runTry } = await import(`${root}/js/parallel.js`);
const catalog = JSON.parse(readFileSync(`${root}/data/catalog.json`, 'utf8'));
parentPort.on('message', job => {
  try {
    parentPort.postMessage({ outcome: runTry(job, catalog, logistics) });
  } catch (e) {
    parentPort.postMessage({ error: e.message });
  }
});
