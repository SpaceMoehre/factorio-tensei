import { search } from './search.js';

const CANDIDATES = 60;

// Goals + Recipe Selections → the most compact valid Compound Block the layout search finds
// within its budget: machines, inserters, belts, pipes, tunnels, poles.
// options: { seed, maxCandidates, budgetMs, site (a City Block to build in) }
export function solve(entries, catalog, logistics, options = {}) {
  const { seed = 1, maxCandidates = options.budgetMs ? Infinity : CANDIDATES, budgetMs, site = null } = options;
  const run = search(entries, catalog, logistics, { seed, maxCandidates, deadline: budgetMs ? Date.now() + budgetMs : Infinity, site });
  let best = null;
  for (let step = run.next(); ; step = run.next()) {
    if (step.done) {
      if (best) return best;
      throw step.value.failure ?? new Error('no layout found within the budget');
    }
    best = step.value.block;
  }
}
