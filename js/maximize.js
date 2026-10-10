import { expandChain, recipeOptions } from './chain.js';
import { planSubBlocks } from './plan.js';
import { search } from './search.js';
import { LayoutError } from './layout/core.js';
import { bands } from './bands.js';
import { annexSite, annexed } from './annex.js';
import { validateBlock } from './layout/validity.js';
import { simulate } from './sim.js';

// Maximize (CONTEXT.md): the highest rate of the Goals whose Compound Block fits the City Block
// without Starvation, its Recipe Selections, modules and the items made here as chosen. The
// Goals scale together, so the first Goal's machines run at full speed: a try asks for n of them.
// Each try designs the Sub-Blocks for n and runs the layout search until it finds a layout that
// starves nothing; a try ends as soon as a Sub-Block cannot be designed without Starvation, and
// soon after its structured candidates when none fits (one whose first layouts do not fit seldom
// finds one later). Which n to try comes from the Foretelling (planner below), then the bounds
// close in from the outcomes (a number whose designs starve bounds them only for a while: the
// next whole number up may not starve); then Filling tries more machines than fit, ten at a time,
// halving. Those tries let every byproduct ride on through its producers' consumers; the highest
// that fit is tried once more, longer, with them sorted out by splitters (yielded where it fits).
// Yields { type: 'foretell', rate, machines } (the highest rate foretold to fit, again whenever
// the outcomes change it), { type: 'try', rate, machines, more } before each try (`more`: while
// Filling, how many machines more than the highest that fit) and { type: 'best',
// block, score, tried, rate, machines, goals } for each that fits; returns { rate, machines,
// goals, tried, failure, above } of the highest that fit (machines 0 when none did), `above` the
// lowest rate tried above it that did not fit and why ({ rate, machines, reason }, null when none
// did not).
// Then Annexes (annex.js): in the room the highest that fit leaves, the chain again, maximized
// there with what was built as Fixtures, while one fits (yielded as the layouts together: `rate`,
// `machines` and `goals` theirs summed).
// options: { made, selections, uses, index, site, budgetMs (each try's), maxCandidates (each try's),
//            seed, now, upTo (no higher than the Goals' own rates: a City Block they do not fit
//            filled up to them), annexes (false: none), bands (false: no Bands), most (no more of
//            the first Goal's machines), probe (one of them first: none fitting, nothing more),
//            least (Filling's fewest machines more, a quarter by default) }
export function* maximize(goals, catalog, logistics, options) {
  const plan = planner(goals, catalog, logistics, options);
  const most = options.most ?? (options.upTo ? plan.wanted : Infinity);
  plan.cap(most);
  let tried = 0, failure = null, best = null, told = null, bestBlock = null;
  // The n the best was found for (null: in Bands).
  let bestN = null, bestScore = null;
  const misses = [];
  // Bands, in a City Block whose Fixtures stand in rows: the most machines its parts hold, then
  // fewer, until a layout fits (whether one routes comes and goes with the Count). First, where
  // they hold many more than the Foretelling foretells (the search then tries above them); else
  // after the search, where they hold more than it found.
  const top = options.bands === false ? 0 : bandsTop(plan, options.site);
  let banded = false;
  // One try in Bands: the layout, else null.
  function* inBand(n) {
    const list = plan.goalsFor(n);
    yield { type: 'try', rate: list[0].rate, machines: n };
    const { entries } = plan.chainOf(list);
    // (As long as a try of the search may take.)
    const deadline = (options.now ?? Date.now)() + (options.budgetMs ?? Infinity);
    const outcome = bands(entries, plan.catalog, plan.logistics, options.site, { seed: options.seed ?? 1, until: () => (options.now ?? Date.now)() > deadline });
    tried++;
    if (!outcome?.block) {
      misses.push({ rate: list[0].rate, machines: n, reason: outcome?.failure?.message ?? null });
      return null;
    }
    plan.record(n, { block: outcome.block, placed: null, designed: null });
    best = { rate: list[0].rate, machines: n, count: n, goals: list };
    bestN = null;
    bestBlock = outcome.block;
    yield { type: 'best', block: outcome.block, score: [0], tried, ...best };
    return outcome.block;
  }
  // From the most its parts hold down, BAND_TRIES Counts one by one; then (with many machines'
  // belts to link, the parts hold far more than route) halfway between the highest known to fit
  // (`above`, or none) and the lowest above it that did not, while a gap is left; then, once,
  // two above the highest that fit (whether one routes comes and goes with the Count), and on
  // halfway from there.
  function* inBands(above) {
    banded = true;
    const missed = new Set();
    let fit = above, skipped = false;
    for (let n = top; n > above && n > top - BAND_TRIES; n--) {
      if (yield* inBand(n)) return;
      missed.add(n);
    }
    for (;;) {
      const miss = Math.min(...[...missed].filter(m => m > fit));
      if (!Number.isFinite(miss)) break;
      let n = Math.floor((fit + miss) / 2);
      if (miss - fit <= 1) {
        if (skipped || fit + 2 >= top - BAND_TRIES + 1) break;
        skipped = true;
        n = fit + 2;
      }
      if (missed.has(n)) break;
      if (yield* inBand(n)) fit = n;
      else missed.add(n);
    }
  }
  let probing = options.probe ? Math.min(1, most) : null;
  if (top >= plan.foretold().machines + FILL) {
    told = plan.foretold().machines;
    yield { type: 'foretell', ...plan.foretold() };
    yield* inBands(plan.foretold().machines);
  }
  for (;;) {
    const foretold = plan.foretold();
    if (foretold.machines !== told) {
      told = foretold.machines;
      yield { type: 'foretell', ...foretold };
    }
    // (An Annex's first try: its least, one of the first Goal's machines. None fitting for want of
    // room, no more is tried.)
    const n = probing ?? plan.next();
    if (n === null) break;
    const list = plan.goalsFor(n);
    yield { type: 'try', rate: list[0].rate, machines: Math.ceil(n), ...(plan.filling ? { more: n - plan.lo } : {}) };
    const outcome = attempt(plan, n, { ...options, precheck: n > plan.designable, unsorted: true });
    plan.record(n, outcome);
    tried += outcome.tried;
    if (outcome.block) {
      best = { rate: list[0].rate, machines: Math.ceil(n), count: n, goals: list };
      [bestN, bestScore, bestBlock] = [n, outcome.score, outcome.block];
      yield { type: 'best', block: outcome.block, score: outcome.score, tried, ...best };
    } else {
      failure = outcome.failure;
      misses.push({ rate: list[0].rate, machines: Math.ceil(n), reason: outcome.failure?.message ?? null });
      if (probing !== null && !outcome.starves) break;
    }
    probing = null;
  }
  if (!banded && top > (best?.machines ?? 0)) yield* inBands(best?.machines ?? 0);
  // The highest that fit found with every byproduct riding on through its producers' consumers
  // (a layout sorting them out by splitters takes far longer to find): once more with them
  // sorted out, given longer, kept where it fits.
  if (best && bestN !== null && bestScore[2] > 0) {
    const sorted = attempt(plan, bestN, { ...options, routing: Math.max(options.budgetMs ?? 0, SORTING_MS), sorting: true });
    tried += sorted.tried;
    if (sorted.block && sorted.score[2] < bestScore[2]) {
      [bestScore, bestBlock] = [sorted.score, sorted.block];
      yield { type: 'best', block: sorted.block, score: sorted.score, tried, ...best };
    }
  }
  // Annexes: the chain again in the room left, while one fits (and the cap leaves any). Each
  // layout found with the one before it (checked together too: a tunnel of one may pair with the
  // other's). Where one drawing a fluid made here from a built pipe finds none (no way to that
  // pipe), once more making it itself.
  // Extensions (ADR 0038): a fluid made here that an Annex makes in a Sub-Block of its own, while
  // a layout before it makes it too: the last such layout once more, its Sub-Block of the fluid
  // making as much more as the Annex's (those feeding it as much more for it), the layouts after
  // it again as before, and the Annex again, as many of the first Goal's machines, drawing the
  // fluid from there; kept where the Annex then needs fewer Sub-Blocks.
  let annexAbove = null;
  const plus = (a, b) => Math.round((a + b) * 100) / 100;
  // The layouts laid out, in turn: { n, extra (what it makes beyond what it takes, for Annexes
  // to draw), alone (the layout itself), base (those before it together; null: none), block (it
  // with them) }. None after Bands.
  let stages = bestN !== null ? [{ n: bestN, extra: {}, alone: bestBlock, base: null, block: bestBlock }] : null;
  // An Annex beside `built`, no more than `cap` of the first Goal's machines: { block (the
  // two together), score, best, stage }, else null.
  function* annexOf(built, before, cap) {
    const site = annexSite(options.site, built, catalog, options.made);
    const alone = { ...site, draws: Object.fromEntries(Object.entries(site.draws).filter(([, d]) => !d.only)) };
    let found = null;
    for (const room of Object.values(site.draws).some(d => d.only) ? [site, alone] : [site]) {
      const run = maximize(goals, catalog, logistics, { ...options, site: room, annexes: false, bands: false, upTo: false, probe: true, least: 1, most: cap });
      let step;
      for (step = run.next(); !step.done; step = run.next()) {
        const v = step.value;
        if (v.type === 'try') yield { ...v, rate: plus(v.rate, before.rate), machines: v.machines + before.machines };
        if (v.type !== 'best') continue;
        const block = annexed(built, v.block, options.site, catalog, logistics);
        if (validateBlock(block, catalog, logistics).length || simulate(block).starvation.length) continue;
        const list = before.goals.map((g, k) => ({ ...g, rate: plus(g.rate, v.goals[k].rate) }));
        found = {
          block, score: v.score, best: { rate: list[0].rate, machines: before.machines + v.machines, count: before.count + v.count, goals: list },
          stage: { n: v.count, extra: {}, alone: v.block, base: built, block },
        };
        yield { type: 'best', block, score: v.score, tried: tried + v.tried, ...found.best };
      }
      tried += step.value.tried;
      annexAbove = step.value.above && { ...step.value.above, rate: plus(step.value.above.rate, before.rate), machines: step.value.above.machines + before.machines };
      if (found) break;
    }
    return found;
  }
  // n of the first Goal's machines laid out beside `built` (null: alone in the City Block), making
  // `extra` beyond what they take: { alone, block (with `built`), score }, else null.
  function relay(n, extra, built) {
    let rooms = [options.site];
    if (built) {
      const site = annexSite(options.site, built, catalog, options.made);
      rooms = Object.values(site.draws).some(d => d.only) ? [site, { ...site, draws: Object.fromEntries(Object.entries(site.draws).filter(([, d]) => !d.only)) }] : [site];
    }
    for (const site of rooms) {
      const out = attempt(planner(goals, catalog, logistics, { ...options, site, extra }), n, { ...options, site, unsorted: true });
      tried += out.tried;
      if (!out.block) continue;
      if (!built) return { alone: out.block, block: out.block, score: out.score };
      const block = annexed(built, out.block, options.site, catalog, logistics);
      if (!validateBlock(block, catalog, logistics).length && !simulate(block).starvation.length) return { alone: out.block, block, score: out.score };
    }
    return null;
  }
  // The Annex `found` with an Extension: { found, stages }, else null.
  function extend(found) {
    const wants = extensionOf(found.stage.alone, goals, options.made);
    const last = item => stages.map(s => s.alone.subBlocks.some(sb => sb.item === item)).lastIndexOf(true);
    const j = Math.max(-1, ...Object.keys(wants).map(last));
    if (j < 0) return null;
    const extra = { ...stages[j].extra };
    for (const [item, rate] of Object.entries(wants)) if (last(item) === j) extra[item] = (extra[item] ?? 0) + rate;
    const redone = [];
    let built = stages[j].base;
    for (let i = j; i < stages.length; i++) {
      const stage = { n: stages[i].n, extra: i === j ? extra : stages[i].extra, base: built };
      const out = relay(stage.n, stage.extra, built);
      if (!out) return null;
      redone.push({ ...stage, alone: out.alone, block: out.block });
      built = out.block;
    }
    const out = relay(found.stage.n, {}, built);
    if (!out || out.alone.subBlocks.length >= found.stage.alone.subBlocks.length) return null;
    const stage = { n: found.stage.n, extra: {}, alone: out.alone, base: built, block: out.block };
    return { found: { ...found, block: out.block, score: out.score, stage }, stages: [...stages.slice(0, j), ...redone, stage] };
  }
  for (let built = bestBlock; built && options.annexes !== false && options.site && most - best.count >= LEAST;) {
    const before = best;
    let found = yield* annexOf(built, before, most - before.count);
    if (!found) break;
    const better = stages && extend(found);
    if (better) {
      ({ found, stages } = better);
      yield { type: 'best', block: found.block, score: found.score, tried, ...found.best };
    } else if (stages) stages.push(found.stage);
    [best, built] = [found.best, found.block];
  }
  // (A number that starved may lie below the highest that fit.)
  const above = annexAbove ?? misses.filter(m => m.rate > (best?.rate ?? 0)).sort((a, b) => a.rate - b.rate)[0] ?? null;
  return { ...(best ?? { rate: 0, machines: 0, count: 0, goals: plan.goalsFor(0) }), tried, failure: best ? null : failure, above };
}

// What an Extension makes beyond what it takes for the Annex `annex` (its layout alone): each
// fluid made here (no Goal) that a Sub-Block of the Annex makes, as much as that makes.
export function extensionOf(annex, goals, made = []) {
  const extra = {};
  for (const sb of annex.subBlocks) {
    if (goals.some(g => g.item === sb.item) || !made.includes(sb.item) || sb.outputs.find(o => o.name === sb.item)?.type !== 'fluid') continue;
    extra[sb.item] = (extra[sb.item] ?? 0) + sb.rate;
  }
  return extra;
}

// One try: the layout search for n of the first Goal's machines, to its first layout without
// Starvation. Returns { block, score, placed, tried, designed, starves, failure }: block null
// when none fits, `starves` when that is for want of a design without Starvation (or of one that
// fits the City Block: a Count's designs come and go like its Starvation), not of room, or the
// try ran out of time (not for want of room either); `budgetMs` is the time its candidates get once
// its Sub-Blocks are designed;
// `designed` lists each Sub-Block's item, Count and best design's area.
// precheck: the Side Output's Sub-Blocks are checked for Starvation first (worth it above the
// highest n whose Sub-Blocks were all designed without). unsorted: no byproduct sorted out after
// its producers (search.js); routing: how long its candidates get once designed (budgetMs);
// sorting: on past layouts whose byproducts ride on, to the first that sorts them all out (else
// the best of them).
/** @param {any} plan @param {number} n @param {any} options */
export function attempt(plan, n, { site, seed = 1, budgetMs = 10000, maxCandidates = Infinity, now = () => Date.now(), precheck = false, unsorted = false, routing = budgetMs, sorting = false }) {
  const list = plan.goalsFor(n);
  let designed = null, entries;
  try {
    ({ entries } = plan.chainOf(list));
  } catch (e) {
    return { block: null, tried: 0, designed, starves: true, failure: e };
  }
  try {
    const run = search(entries, plan.catalog, plan.logistics, {
      seed, site, maxCandidates, deadline: now() + budgetMs, routing, unsorted, now, perfect: true, precheck, designed: d => { designed = d; },
    });
    // (Sorting: the best so far, while its byproducts ride on.)
    let kept = null;
    for (let step = run.next(); ; step = run.next()) {
      if (step.done) {
        if (kept) return { block: kept.block, score: kept.score, placed: kept.placed, tried: step.value.tried, designed, starves: false, failure: null };
        const failure = step.value.failure ?? new Error(`no layout without starvation fits ${list[0].rate}/min`);
        return { block: null, tried: step.value.tried, designed, starves: Boolean(step.value.starves || step.value.timedOut), failure };
      }
      if (sorting && step.value.score[0] === 0 && step.value.score[2] > 0) kept = step.value;
      else if (step.value.score[0] === 0) {
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
// the highest whole number foretold to fit (after a try that found no room, or two in a row whose
// designs starved, no more than halfway; right after one that starved, the number below it);
// with none left below a number that starved, the one above it, once; then Filling: FILL
// machines more than the highest that fit, again while they fit, half as many after each that
// does not; null after. None above the cap (cap(n)): that one instead, null once it fit.
// filling: how many more Filling adds (null before it starts).
// record(n, outcome): a try's outcome (attempt's). foretold(): { rate, machines }. span(n): the
// tiles n machines' Sub-Blocks are foretold to span, of the City Block's `room`; `asked`: the
// first Goal's machines at the Goals' own rates, `wanted` as many running as fast as those take.
/** @param {any[]} goals @param {any} catalog @param {any} logistics @param {any} options */
export function planner(goals, catalog, logistics, { made = [], selections = {}, uses = [], index = recipeOptions(catalog), site, least = LEAST, extra = {} }) {
  // In an Annex's City Block, a fluid made here that a pipe built before it has to spare comes
  // from there instead, while that has enough (ADR 0032).
  const draws = Object.entries(site?.draws ?? {}).filter(([fluid]) => made.includes(fluid));
  const chainOf = list => {
    const drawn = new Set(draws.map(([fluid]) => fluid));
    for (;;) {
      const chain = expandChain(list, catalog, { made: made.filter(item => !drawn.has(item)), selections, uses, index, extra });
      const short = draws.filter(([fluid, { spare }]) => drawn.has(fluid) && (chain.trainInputs.find(t => t.item === fluid)?.rate ?? 0) > spare + 1e-6);
      if (!short.length) return chain;
      for (const [fluid] of short) drawn.delete(fluid);
    }
  };
  const lead = goals[0];
  const sb = planSubBlocks(chainOf(goals).entries, catalog, logistics).find(s => s.item === lead.item);
  // What one of its machines adds to the Goal at full speed: its share of what the step makes,
  // less what goes back into a Recipe Loop.
  const perMachine = sb.rate * sb.headroom / sb.count * Math.min(1, lead.rate / sb.rate);
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
  const size = s => catalog.buildings[s.building].size;
  // (In an Annex's City Block, only the room where one of the first Goal's machines fits with a
  // tile round it: the layout before it leaves slivers no machine fits in.)
  const room = site.annex ? usable(site, Math.max(size(sb).w, size(sb).h) + 2)
    : inner.w * inner.h - site.fixtures.reduce((sum, f) => sum + overlap(f, inner), 0);
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
  const reach = 0.95 * room * (site.annex ? 1 : 1 - broken(site, 2 * (largest + 5)) / 2);
  const fits = n => loose * modules(n) <= reach;

  // The highest n that fit, the lowest that did not for want of room (more machines never take
  // less room) and the numbers whose designs starved. Starvation comes and goes with the Count
  // (how a Sub-Block's machines cut into the belts of its Internal Paths: 14 bolts machines may
  // starve where 13 and 15 do not), so a number that starved bounds the tries only until the
  // whole numbers below it are done; then the one above it is tried (`passed`).
  let lo = 0, ceiling = upper, fill = null, designable = 0, most = Infinity;
  const starved = new Set(), passed = new Set();
  // Whether the last try did not fit, and how many tries in a row starved.
  let failed = false, streak = 0;
  // The lowest number above the highest that fit that did not fit.
  const hiOf = () => Math.min(ceiling, ...[...starved].filter(s => s > lo));
  // The least looseness the tries that found no room show (one at least that loose did not fit).
  let tightest = 0;
  // Once a layout found shows how loosely this City Block packs (its Sub-Blocks spanning so much
  // more than their modules), n whose modules, spread as much, would span more than all its
  // room are not tried (another layout may pack a little tighter). Not with Fixtures in the
  // room: how far a layout spreads round them says little of the next.
  let spread = null;
  const crowded = site.fixtures.some(f => overlap(f, inner) > 0);
  const overflows = n => !crowded && spread !== null && spread * modules(n) > 1.05 * room;
  // The highest n foretold to fit (more machines never take less room), and no fewer than fit.
  const foretold = () => {
    let a = Math.floor(lo), b = Math.ceil(hiOf());
    while (b - a > 1) {
      const mid = Math.floor((a + b) / 2);
      if (fits(mid)) a = mid;
      else b = mid;
    }
    a = Math.max(a, lo);
    return { machines: a, rate: goalsFor(a)[0].rate };
  };
  // The n next() tries, the cap aside.
  function uncapped() {
    const hi = hiOf();
    if (fill === null) {
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
        // After a try that found no room, or the second in a row that starved, no more than
        // halfway down (the Foretelling knows nothing of designs that starve, and was wrong);
        // right after the first that starved, the number just below it.
        let want = Math.max(low, foretold().machines);
        if (failed && streak !== 1) want = Math.min(want, Math.ceil((lo + hi) / 2));
        return Math.min(want, top - 1);
      }
      // None left below the lowest that starved: the whole number above it, once — not where
      // that one starved too, found no room or would overflow it.
      if (hi < ceiling && Number.isInteger(hi) && !passed.has(hi)) {
        passed.add(hi);
        if (hi + 1 < ceiling && !starved.has(hi + 1) && !overflows(hi + 1)) return hi + 1;
      }
      fill = FILL;
    }
    // Filling: FILL machines more than the highest that fit, again while they fit; half as many
    // after each that does not (or would be no fewer than the lowest that did not), down to a
    // quarter machine (`least`; in an Annex whole machines, one at least), the last machine slower (the other Sub-Blocks
    // need fewer machines than the next whole number's, and machines that starve at full speed
    // may not a little slower). Never held back by the Foretelling: a layout found may pack
    // looser than the next, and only a try tells.
    const rate = n => goalsFor(n)[0].rate;
    for (; fill >= least; fill /= 2) {
      // (No fewer than one: whole machines.)
      const more = least < 1 ? fill : Math.floor(fill);
      if (lo + more < hiOf() && rate(Math.min(lo + more, most)) > rate(lo)) return lo + more;
    }
    return null;
  }
  return {
    catalog, logistics, chainOf, goalsFor, room,
    asked: sb.count,
    wanted: lead.rate / perMachine,
    cap(n) {
      most = n;
    },
    span: n => Math.round(loose * modules(n)),
    get lo() { return lo; },
    get hi() { return hiOf(); },
    // The highest n whose Sub-Blocks were all designed without Starvation.
    get designable() { return designable; },
    get filling() { return fill; },
    foretold,
    next() {
      if (lo >= most) return null;
      const n = uncapped();
      return n === null ? null : Math.min(n, most);
    },
    record(n, outcome) {
      for (const d of outcome.designed ?? []) if (d.area) tiles.set(d.item, d.area / d.count);
      if (outcome.designed) designable = Math.max(designable, n);
      failed = !outcome.block;
      streak = !outcome.block && outcome.starves ? streak + 1 : 0;
      if (outcome.block) {
        lo = Math.max(lo, n);
        if (outcome.placed) loose = Math.max(spread = outcome.placed / modules(n), tightest);
        return;
      }
      if (outcome.starves) {
        starved.add(n);
        return;
      }
      ceiling = Math.min(ceiling, n);
      // It did not fit for want of room: the Foretelling must not say it does (nor again after a
      // layout found below it).
      tightest = Math.max(tightest, 1.02 * reach / modules(n));
      loose = Math.max(loose, tightest);
    },
  };
}

// The share of a City Block's stretches of `side` × `side` tiles (inside its Buffer, every
// other tile) that a Fixture breaks.
function broken(site, side) {
  const { inner } = site;
  if (!site.fixtures.length || inner.w < side || inner.h < side) return 0;
  const sum = fixtureSums(site);
  let hit = 0, all = 0;
  for (let y = 0; y + side <= inner.h; y += 2) {
    for (let x = 0; x + side <= inner.w; x += 2) {
      all++;
      if (sum[y + side][x + side] - sum[y][x + side] - sum[y + side][x] + sum[y][x] > 0) hit++;
    }
  }
  return hit / all;
}

// A City Block's Fixture tiles inside its Buffer summed over every rectangle from its corner.
function fixtureSums(site) {
  const { inner } = site;
  const sum = Array.from({ length: inner.h + 1 }, () => new Int32Array(inner.w + 1));
  for (const f of site.fixtures) {
    for (let x = Math.max(f.x, inner.x); x < Math.min(f.x + f.w, inner.x + inner.w); x++) {
      for (let y = Math.max(f.y, inner.y); y < Math.min(f.y + f.h, inner.y + inner.h); y++) sum[y - inner.y + 1][x - inner.x + 1] = 1;
    }
  }
  for (let y = 1; y <= inner.h; y++) for (let x = 1; x <= inner.w; x++) sum[y][x] += sum[y - 1][x] + sum[y][x - 1] - sum[y - 1][x - 1];
  return sum;
}

// The tiles of a City Block's room (inside its Buffer) in some stretch of `side` × `side` tiles
// no Fixture breaks.
function usable(site, side) {
  const { inner } = site;
  const sum = fixtureSums(site);
  const covered = Array.from({ length: inner.h + 1 }, () => new Int32Array(inner.w + 1));
  for (let y = 0; y + side <= inner.h; y++) {
    for (let x = 0; x + side <= inner.w; x++) {
      if (sum[y + side][x + side] - sum[y][x + side] - sum[y + side][x] + sum[y][x] > 0) continue;
      // (Marked at its corners, summed below: every tile of a free stretch counted once.)
      covered[y][x]++; covered[y][x + side]--; covered[y + side][x]--; covered[y + side][x + side]++;
    }
  }
  let tiles = 0;
  for (let y = 0; y < inner.h; y++) {
    for (let x = 0; x < inner.w; x++) {
      covered[y][x] += (y ? covered[y - 1][x] : 0) + (x ? covered[y][x - 1] : 0) - (x && y ? covered[y - 1][x - 1] : 0);
      if (covered[y][x] > 0) tiles++;
    }
  }
  return tiles;
}

// The most machines Bands' parts hold in the City Block (a binary search: more machines never fit
// fewer parts), or 0 where Bands does not apply.
function bandsTop(plan, site) {
  if (!site?.fixtures.some(f => overlap(f, site.inner) > 0)) return 0;
  const packs = n => {
    try {
      return Boolean(bands(plan.chainOf(plan.goalsFor(n)).entries, plan.catalog, plan.logistics, site, { pack: true })?.packed);
    } catch {
      return false;
    }
  };
  // From the Foretelling up (fewer machines than it foretells are no use, and too few fill no part).
  let lo = 0, hi = Math.max(4, plan.foretold().machines);
  while (hi < plan.hi && packs(hi)) [lo, hi] = [hi, hi * 2];
  if (!lo) return 0;
  hi = Math.min(hi, Math.ceil(plan.hi));
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (packs(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Bands: how many Counts below the most its parts hold Maximize tries with them one by one,
// before halving the gap down to the highest known to fit.
const BAND_TRIES = 2;

// How long the candidates of the last try (the highest that fit, its byproducts sorted out) get
// at least once designed.
const SORTING_MS = 120000;

// Filling: how many machines more than the highest that fit it first tries, and the fewest.
const FILL = 10;
const LEAST = 1 / 4;

function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
