// Runs the layout search off the page's thread, with the strategy it is given ('search' or
// 'spread', ADR 0013; the page runs one worker for each, side by side, each Sub-Block designed
// first in a worker of its own and the designs handed to them: `designs`). Posts every layout
// that beats its best so far ({ type: 'best', block, score, tried }), then { type: 'done',
// tried, failure } when the budget is spent, or { type: 'error', message }. The page stops a
// search by terminating the worker; it keeps the best layout any worker sent.
// In a City Block (site) with `maximize` ({ goals, made, selections, upTo }), it looks for the
// highest rate that fits instead (upTo: no higher than the Goals' own): { type: 'foretell', rate, machines } whenever the Foretelling changes,
// { type: 'try', rate, machines } before each try, { type: 'best', …, rate, machines, goals } for
// each that fits, and { type: 'done', tried, failure, rate, machines, goals, above } at the end
// (`above`: the lowest rate tried that did not fit, and why).
import { search } from './search.js';
import { maximize } from './maximize.js';
import { context, designStep, random } from './design.js';

const catalog = fetch(new URL('../data/catalog.json', import.meta.url)).then(r => r.json());

self.onmessage = async ({ data: { entries, logistics, budgetMs, seed, site = null, maximize: goals = null, strategy = 'search', design = null, designs = null } }) => {
  try {
    // One Sub-Block designed on its own (`design`: its index): its candidates, those built with
    // their design, the rest as what they are ({ type: 'designed', index, list }).
    if (design !== null) {
      const ctx = context(entries, await catalog, logistics, site);
      const list = designStep(ctx, design, random(seed + design));
      self.postMessage({ type: 'designed', index: design, list: list.map(({ build, ...c }) => c) });
      return;
    }
    if (goals) {
      const run = maximize(goals.goals, await catalog, logistics, { made: goals.made, selections: goals.selections, upTo: goals.upTo, site, budgetMs, seed });
      let step = run.next();
      for (; !step.done; step = run.next()) self.postMessage(step.value);
      const { tried, failure, rate, machines, goals: list, above } = step.value;
      self.postMessage({ type: 'done', tried, failure: failure?.message ?? null, rate, machines, goals: list, above });
      return;
    }
    const run = search(entries, await catalog, logistics, { seed, deadline: Date.now() + budgetMs, site, strategy, designs });
    let step = run.next();
    for (; !step.done; step = run.next()) self.postMessage({ type: 'best', ...step.value });
    self.postMessage({ type: 'done', tried: step.value.tried, failure: step.value.failure?.message ?? null });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
