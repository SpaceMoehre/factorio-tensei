// Runs the layout search off the page's thread. Posts every layout that beats the best so far
// ({ type: 'best', block, score, tried }), then { type: 'done', tried, failure } when the
// budget is spent, or { type: 'error', message }. The page stops a search by terminating the
// worker; it keeps the last layout it was sent.
// In a City Block (site) with `maximize` ({ goals, made, selections }), it looks for the highest
// rate that fits instead: { type: 'foretell', rate, machines } whenever the Foretelling changes,
// { type: 'try', rate, machines } before each try, { type: 'best', …, rate, machines, goals } for
// each that fits, and { type: 'done', tried, failure, rate, machines, goals } at the end.
import { search } from './search.js';
import { maximize } from './maximize.js';

const catalog = fetch(new URL('../data/catalog.json', import.meta.url)).then(r => r.json());

self.onmessage = async ({ data: { entries, logistics, budgetMs, seed, site = null, maximize: goals = null } }) => {
  try {
    if (goals) {
      const run = maximize(goals.goals, await catalog, logistics, { made: goals.made, selections: goals.selections, site, budgetMs, seed });
      let step = run.next();
      for (; !step.done; step = run.next()) self.postMessage(step.value);
      const { tried, failure, rate, machines, goals: list } = step.value;
      self.postMessage({ type: 'done', tried, failure: failure?.message ?? null, rate, machines, goals: list });
      return;
    }
    const run = search(entries, await catalog, logistics, { seed, deadline: Date.now() + budgetMs, site });
    let step = run.next();
    for (; !step.done; step = run.next()) self.postMessage({ type: 'best', ...step.value });
    self.postMessage({ type: 'done', tried: step.value.tried, failure: step.value.failure?.message ?? null });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
