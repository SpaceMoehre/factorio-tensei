import { expandChain, recipeOptions } from './chain.js';
import { planSubBlocks } from './plan.js';
import { search } from './search.js';

// Maximize (CONTEXT.md): the highest rate of the Goals whose Compound Block fits the City Block
// without Starvation, its Recipe Selections, modules and the items made here as chosen. The
// Goals scale together, so the first Goal's machines run at full speed: a try asks for n of them.
// Each try runs the layout search until it finds a layout that starves nothing (a try that finds
// none within its budget does not fit). Tries start from the Goals' own rates and grow until one
// does not fit — no further than the machines alone cover the City Block — then halve the gap.
// Yields { type: 'try', rate, machines } before each try and { type: 'best', block, score,
// tried, rate, machines, goals } for each one that fits; returns { rate, machines, goals, tried,
// failure } of the highest that fit (machines 0 when none did).
// options: { made, selections, index, site, budgetMs (each try's), maxCandidates (each try's),
//            seed, now }
export function* maximize(goals, catalog, logistics, options) {
  const { made = [], selections = {}, index = recipeOptions(catalog), site, budgetMs = 10000, maxCandidates = Infinity, seed = 1, now = () => Date.now() } = options;
  const chainOf = list => expandChain(list, catalog, { made, selections, index });
  const lead = goals[0];
  const sb = planSubBlocks(chainOf(goals).entries, catalog, logistics).find(s => s.item === lead.item);
  const perMachine = sb.rate * sb.headroom / sb.count;
  // The Goals with n of the first Goal's machines at full speed (rates rounded down to 1/100 a
  // minute, so its Count stays n).
  const goalsFor = n => {
    const rate = Math.floor(n * perMachine * 100) / 100;
    return goals.map(g => ({ ...g, rate: g === lead ? rate : Math.max(0.01, Math.floor(g.rate * rate / lead.rate * 100) / 100) }));
  };
  // The fewest machines of the first Goal whose machines alone need more room than the City
  // Block has: no try goes that far.
  const { inner } = site;
  const room = inner.w * inner.h - site.fixtures.reduce((sum, f) => sum + overlap(f, inner), 0);
  const machineArea = n => planSubBlocks(chainOf(goalsFor(n)).entries, catalog, logistics)
    .reduce((sum, s) => sum + s.count * catalog.buildings[s.building].size.w * catalog.buildings[s.building].size.h, 0);
  let upper = 1;
  while (machineArea(upper) <= room) upper *= 2;
  for (let lo = upper / 2, hi = upper; hi - lo > 1;) {
    const mid = Math.floor((lo + hi) / 2);
    if (machineArea(mid) <= room) lo = mid;
    else hi = mid;
    upper = hi;
  }

  let lo = 0, hi = upper, best = null, tried = 0, failure = null;
  let n = Math.max(1, Math.min(hi - 1, sb.count));
  while (hi - lo > 1) {
    const list = goalsFor(n);
    yield { type: 'try', rate: list[0].rate, machines: n };
    const found = yield* attempt(list, n);
    if (found) {
      lo = n;
      best = { rate: list[0].rate, machines: n, goals: list };
    } else hi = n;
    // Up from a layout that fits, as far as the room it leaves suggests (at least one machine
    // more, at most four times as many); else halfway.
    n = found && hi === upper
      ? Math.min(hi - 1, Math.max(n + 1, Math.floor(n * Math.min(4, room / (found.block.bounds.w * found.block.bounds.h)))))
      : Math.floor((lo + hi) / 2);
  }
  return { ...(best ?? { rate: 0, machines: 0, goals: goalsFor(0) }), tried, failure: best ? null : failure };

  function* attempt(list, machines) {
    let entries;
    try {
      entries = chainOf(list).entries;
    } catch (e) {
      failure = e;
      return null;
    }
    const run = search(entries, catalog, logistics, { seed, site, maxCandidates, deadline: now() + budgetMs, now });
    for (let step = run.next(); ; step = run.next()) {
      if (step.done) {
        tried += step.value.tried;
        failure = step.value.failure ?? new Error(`no layout without starvation fits ${list[0].rate}/min`);
        return null;
      }
      if (step.value.score[0] === 0) {
        tried += step.value.tried;
        run.return(undefined);
        yield { type: 'best', ...step.value, tried, rate: list[0].rate, machines, goals: list };
        return step.value;
      }
    }
  }
}

function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
