// Runs the layout search off the page's thread. Posts every layout that beats the best so far
// ({ type: 'best', block, score, tried }), then { type: 'done', tried, failure } when the
// budget is spent, or { type: 'error', message }. The page stops a search by terminating the
// worker; it keeps the last layout it was sent.
import { search } from './search.js';

const catalog = fetch(new URL('../data/catalog.json', import.meta.url)).then(r => r.json());

self.onmessage = async ({ data: { entries, logistics, budgetMs, seed } }) => {
  try {
    const run = search(entries, await catalog, logistics, { seed, deadline: Date.now() + budgetMs });
    let step = run.next();
    for (; !step.done; step = run.next()) self.postMessage({ type: 'best', ...step.value });
    self.postMessage({ type: 'done', tried: step.value.tried, failure: step.value.failure?.message ?? null });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
