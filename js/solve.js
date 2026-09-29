import { search } from './search.js';

const CANDIDATES = 60;

// Goals + Recipe Selections → the most compact valid Compound Block the layout search finds
// within its budget: machines, inserters, belts, pipes, tunnels, poles.
// options: { seed, maxCandidates, budgetMs }
export function solve(entries, catalog, logistics, options = {}) {
  const { seed = 1, maxCandidates = options.budgetMs ? Infinity : CANDIDATES, budgetMs } = options;
  const run = search(entries, catalog, logistics, { seed, maxCandidates, deadline: budgetMs ? Date.now() + budgetMs : Infinity });
  let best = null;
  for (let step = run.next(); ; step = run.next()) {
    if (step.done) {
      if (best) return best;
      throw step.value.failure ?? new Error('no layout found within the budget');
    }
    best = step.value.block;
  }
}
