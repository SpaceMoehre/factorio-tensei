import { expandChain, recipeOptions } from './chain.js';
import { planSubBlocks } from './plan.js';
import { search } from './search.js';
import { LayoutError } from './layout/core.js';

// Maximize (CONTEXT.md): the highest rate of the Goals whose Compound Block fits the City Block
// without Starvation, its Recipe Selections, modules and the items made here as chosen. The
// Goals scale together, so the first Goal's machines run at full speed: a try asks for n of them.
// Each try designs the Sub-Blocks for n and runs the layout search until it finds a layout that
// starves nothing; a try ends as soon as a Sub-Block cannot be designed without Starvation, and
// soon after its structured candidates when none fits (one whose first layouts do not fit seldom
// finds one later). Which n to try comes from the Foretelling (planner below), then the bounds
// close in from the outcomes.
// Yields { type: 'foretell', rate, machines } (the highest rate foretold to fit, again whenever
// the outcomes change it), { type: 'try', rate, machines } before each try and { type: 'best',
// block, score, tried, rate, machines, goals } for each that fits; returns { rate, machines,
// goals, tried, failure, above } of the highest that fit (machines 0 when none did), `above` the
// lowest rate tried that did not fit and why ({ rate, machines, reason }, null when none did not).
// options: { made, selections, index, site, budgetMs (each try's), maxCandidates (each try's),
//            seed, now }
export function* maximize(goals, catalog, logistics, options) {
  const plan = planner(goals, catalog, logistics, options);
  let tried = 0, failure = null, best = null, told = null, above = null;
  for (;;) {
    const foretold = plan.foretold();
    if (foretold.machines !== told) {
      told = foretold.machines;
      yield { type: 'foretell', ...foretold };
    }
    const n = plan.next();
    if (n === null) break;
    const list = plan.goalsFor(n);
    yield { type: 'try', rate: list[0].rate, machines: Math.ceil(n) };
    const outcome = attempt(plan, n, { ...options, precheck: n > plan.designable });
    plan.record(n, outcome);
    tried += outcome.tried;
    if (outcome.block) {
      best = { rate: list[0].rate, machines: Math.ceil(n), goals: list };
      yield { type: 'best', block: outcome.block, score: outcome.score, tried, ...best };
    } else {
      failure = outcome.failure;
      if (!above || list[0].rate < above.rate) above = { rate: list[0].rate, machines: Math.ceil(n), reason: outcome.failure?.message ?? null };
    }
  }
  // One more machine than fit, not tried: foretold to overflow the City Block.
  const next = Math.floor(plan.lo) + 1;
  if (best && next < plan.hi && plan.goalsFor(next)[0].rate < (above?.rate ?? Infinity)) {
    above = { rate: plan.goalsFor(next)[0].rate, machines: next, reason: 'its layout is foretold to take more room than the city block has' };
  }
  return { ...(best ?? { rate: 0, machines: 0, goals: plan.goalsFor(0) }), tried, failure: best ? null : failure, above };
}

// One try: the layout search for n of the first Goal's machines, to its first layout without
// Starvation. Returns { block, score, placed, tried, designed, starves, failure }: block null
// when none fits, `starves` when that is for want of a design without Starvation (not of room);
// `designed` lists each Sub-Block's item, Count and best design's area.
// precheck: the Side Output's Sub-Blocks are checked for Starvation first (worth it above the
// highest n whose Sub-Blocks were all designed without).
/** @param {any} plan @param {number} n @param {any} options */
export function attempt(plan, n, { site, seed = 1, budgetMs = 10000, maxCandidates = Infinity, now = () => Date.now(), precheck = false }) {
  const list = plan.goalsFor(n);
  let designed = null, entries;
  try {
    ({ entries } = plan.chainOf(list));
  } catch (e) {
    return { block: null, tried: 0, designed, starves: true, failure: e };
  }
  try {
    const run = search(entries, plan.catalog, plan.logistics, {
      seed, site, maxCandidates, deadline: now() + budgetMs, now, perfect: true, precheck, designed: d => { designed = d; },
    });
    for (let step = run.next(); ; step = run.next()) {
      if (step.done) {
        const failure = step.value.failure ?? new Error(`no layout without starvation fits ${list[0].rate}/min`);
        return { block: null, tried: step.value.tried, designed, starves: Boolean(step.value.starves), failure };
      }
      if (step.value.score[0] === 0) {
        run.return(undefined);
        return { block: step.value.block, score: step.value.score, placed: step.value.placed, tried: step.value.tried, designed, starves: false, failure: null };
      }
    }
  } catch (e) {
    // A Sub-Block that cannot be built at this rate.
    if (!(e instanceof LayoutError)) throw e;
    return { block: null, tried: 0, designed, starves: true, failure: e };
  }
}

// What a Maximize knows and foretells. The Foretelling: how much room n of the first Goal's
// machines take — each Sub-Block's machines so many tiles each (at first its building with a belt
// band above and below and a column beside it, then what its last design took), spread out by
// how loosely the City Block's layouts pack (at first a guess, then from the layouts found) —
// against the room the City Block has; the highest n whose layout it says fits.
// goalsFor(n): the Goals with n of the first Goal's machines at full speed (rates rounded down to
// 1/100 a minute, so its Count stays n; n need not be whole: the last of them runs slower).
// next(): the n to try next, strictly between the highest that fit and the lowest that did not:
// the highest whole number foretold to fit (right after a try that did not fit, or below one
// whose designs starved, no more than halfway: the Foretelling knows nothing of designs that
// starve, and was wrong); once the whole numbers meet, a few rates between, halving the gap;
// null after.
// record(n, outcome): a try's outcome (attempt's). foretold(): { rate, machines }. span(n): the
// tiles n machines' Sub-Blocks are foretold to span, of the City Block's `room`; `asked`: the
// first Goal's machines at the Goals' own rates.
/** @param {any[]} goals @param {any} catalog @param {any} logistics @param {any} options */
export function planner(goals, catalog, logistics, { made = [], selections = {}, index = recipeOptions(catalog), site }) {
  const chainOf = list => expandChain(list, catalog, { made, selections, index });
  const lead = goals[0];
  const sb = planSubBlocks(chainOf(goals).entries, catalog, logistics).find(s => s.item === lead.item);
  const perMachine = sb.rate * sb.headroom / sb.count;
  const goalsFor = n => {
    const rate = Math.floor(n * perMachine * 100) / 100;
    return goals.map(g => ({ ...g, rate: g === lead ? rate : Math.max(0.01, Math.floor(g.rate * rate / lead.rate * 100) / 100) }));
  };
  const plans = new Map();
  const planOf = n => {
    if (!plans.has(n)) {
      let list = null;
      try {
        list = planSubBlocks(chainOf(goalsFor(n)).entries, catalog, logistics);
      } catch {
        // A chain that cannot be built at this rate: its try says why.
      }
      plans.set(n, list);
    }
    return plans.get(n);
  };
  // The room the City Block has: its area inside the Buffer, less its Fixtures there.
  const { inner } = site;
  const room = inner.w * inner.h - site.fixtures.reduce((sum, f) => sum + overlap(f, inner), 0);
  const size = s => catalog.buildings[s.building].size;
  // The fewest machines whose footprints alone need more room than there is: no try goes that far.
  const machineArea = n => planOf(n)?.reduce((sum, s) => sum + s.count * size(s).w * size(s).h, 0) ?? Infinity;
  let upper = 1;
  while (machineArea(upper) <= room) upper *= 2;
  for (let lo = upper / 2, hi = upper; hi - lo > 1;) {
    const mid = Math.floor((lo + hi) / 2);
    if (machineArea(mid) <= room) lo = mid;
    else hi = mid;
    upper = hi;
  }

  const tiles = new Map();
  const tilesOf = s => tiles.get(s.item) ?? (size(s).w + 2) * (size(s).h + 5);
  const modules = n => planOf(n)?.reduce((sum, s) => sum + s.count * tilesOf(s), 0) ?? Infinity;
  // How much more room than its modules a layout's Sub-Blocks span, and how much of the City
  // Block's room they may span: more than that seldom fits. Fixtures scattered all over it (a
  // grid of substations) leave room only for what fits between them: the more of its stretches
  // as big as a few machines' modules a Fixture breaks, the less.
  let loose = 1.6;
  const largest = Math.max(1, ...(planOf(1) ?? []).map(s => Math.max(size(s).w, size(s).h)));
  const reach = 0.95 * room * (1 - broken(site, 2 * (largest + 5)) / 2);
  const fits = n => loose * modules(n) <= reach;

  let lo = 0, hi = upper, failed = false, starves = false, between = 0, designable = 0;
  // The least looseness the tries that found no room show (one at least that loose did not fit).
  let tightest = 0;
  // Once a layout found shows how loosely this City Block packs (its Sub-Blocks spanning so much
  // more than their modules), n whose modules, spread as much, would span more than all its
  // room are not tried (another layout may pack a little tighter). Not with Fixtures in the
  // room: how far a layout spreads round them says little of the next.
  let spread = null;
  const crowded = site.fixtures.some(f => overlap(f, inner) > 0);
  const overflows = n => !crowded && spread !== null && spread * modules(n) > 1.05 * room;
  // The highest n foretold to fit (more machines never take less room).
  const foretold = () => {
    let a = Math.floor(lo), b = Math.ceil(hi);
    while (b - a > 1) {
      const mid = Math.floor((a + b) / 2);
      if (fits(mid)) a = mid;
      else b = mid;
    }
    return { machines: a, rate: goalsFor(a)[0].rate };
  };
  return {
    catalog, logistics, chainOf, goalsFor, room,
    // The first Goal's machines at the Goals' own rates, and the tiles n machines' Sub-Blocks are
    // foretold to span.
    asked: sb.count,
    span: n => Math.round(loose * modules(n)),
    get lo() { return lo; },
    get hi() { return hi; },
    // The highest n whose Sub-Blocks were all designed without Starvation.
    get designable() { return designable; },
    foretold,
    next() {
      // Whole numbers above the highest that fit, below the lowest that did not and the first
      // that would overflow the room (more machines never take less room).
      let top = Math.ceil(hi);
      for (let a = Math.floor(lo); top - a > 1;) {
        const mid = Math.floor((a + top) / 2);
        if (overflows(mid)) top = mid;
        else a = mid;
      }
      const low = Math.floor(lo) + 1;
      if (low < top) {
        // Only a try tells whether the one above the highest that fit does: at least that one.
        let want = Math.max(low, foretold().machines);
        if (failed || starves) want = Math.min(want, Math.ceil((lo + hi) / 2));
        return Math.min(want, top - 1);
      }
      // Between the highest that fit and the next whole number (or the lowest that did not): a
      // few rates, halving the gap, the last machine slower — fewer machines of the other
      // Sub-Blocks may fit where the next whole number's do not, and machines that starve at full
      // speed may not a little slower. Not one foretold to overflow the room.
      for (;;) {
        const ceiling = Math.min(hi, top);
        if (between >= BETWEEN || ceiling - lo <= 1 / 8) return null;
        between++;
        const mid = (lo + ceiling) / 2;
        if (!overflows(mid)) return mid;
        hi = mid;
      }
    },
    record(n, outcome) {
      for (const d of outcome.designed ?? []) if (d.area) tiles.set(d.item, d.area / d.count);
      if (outcome.designed) designable = Math.max(designable, n);
      failed = !outcome.block;
      if (outcome.block) {
        lo = Math.max(lo, n);
        if (outcome.placed) loose = Math.max(spread = outcome.placed / modules(n), tightest);
        return;
      }
      if (n < hi) [hi, starves] = [n, Boolean(outcome.starves)];
      // It did not fit for want of room: the Foretelling must not say it does (nor again after a
      // layout found below it).
      if (!outcome.starves) tightest = Math.max(tightest, 1.02 * reach / modules(n));
      loose = Math.max(loose, tightest);
    },
  };
}

// The share of a City Block's stretches of `side` × `side` tiles (inside its Buffer, every
// other tile) that a Fixture breaks.
function broken(site, side) {
  const { inner } = site;
  if (!site.fixtures.length || inner.w < side || inner.h < side) return 0;
  // Fixture tiles summed over every rectangle from the corner.
  const sum = Array.from({ length: inner.h + 1 }, () => new Int32Array(inner.w + 1));
  for (const f of site.fixtures) {
    for (let x = Math.max(f.x, inner.x); x < Math.min(f.x + f.w, inner.x + inner.w); x++) {
      for (let y = Math.max(f.y, inner.y); y < Math.min(f.y + f.h, inner.y + inner.h); y++) sum[y - inner.y + 1][x - inner.x + 1] = 1;
    }
  }
  for (let y = 1; y <= inner.h; y++) for (let x = 1; x <= inner.w; x++) sum[y][x] += sum[y - 1][x] + sum[y][x - 1] - sum[y - 1][x - 1];
  let hit = 0, all = 0;
  for (let y = 0; y + side <= inner.h; y += 2) {
    for (let x = 0; x + side <= inner.w; x += 2) {
      all++;
      if (sum[y + side][x + side] - sum[y][x + side] - sum[y + side][x] + sum[y][x] > 0) hit++;
    }
  }
  return hit / all;
}

// Rates tried between whole numbers of machines, at most.
const BETWEEN = 2;

function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
