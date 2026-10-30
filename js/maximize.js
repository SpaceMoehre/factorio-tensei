import { expandChain, recipeOptions } from './chain.js';
import { planSubBlocks } from './plan.js';
import { search } from './search.js';
import { LayoutError } from './layout/core.js';
import { bands } from './bands.js';
import { annexSite, annexed } from './annex.js';
import { validateBlock } from './layout/validity.js';
import { simulate, throughput } from './sim.js';
import { scoreOf, riding } from './layout/score.js';

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
// `machines` and `goals` theirs summed). Then, once nothing more fits without Starvation, layouts
// that starve, kept where they deliver more of the first Goal (ADR 0057): one more Annex, or with
// no Annexes (or none that fits without), more machines than the best. A fit that starves carries
// what it delivers (`delivered`, sim.js throughput); its 'try' says `starving`.
// options: { made, selections, uses, exports, voids, index, site, budgetMs (each try's), maxCandidates (each try's),
//            seed, now, upTo (no higher than the Goals' own rates: a City Block they do not fit
//            filled up to them), annexes (false: none), bands (false: no Bands), most (no more of
//            the first Goal's machines), probe (one of them first: none fitting, nothing more),
//            least (Filling's fewest machines more, a quarter by default), giving (false: no
//            Giving Way), starving (false: no layout that starves; 'only': none without looked
//            for, the last Annex's) }
export function* maximize(goals, catalog, logistics, options) {
  const plan = planner(goals, catalog, logistics, options);
  const most = options.most ?? (options.upTo ? plan.wanted : Infinity);
  plan.cap(most);
  let tried = 0, failure = null, told = null, bestBlock = null;
  /** @type {any} */
  let best = null;
  // The n the best was found for (null: in Bands).
  let bestN = null;
  /** @type {any} */
  let bestScore = null;
  const misses = [];
  // (What a layout delivers: its rate where it starves nothing, ADR 0057. Annexes: the lowest
  // rate an Annex tried above what fit, and rates added up.)
  const deliveredBy = b => b?.delivered ?? b?.rate ?? 0;
  let annexAbove = null;
  const plus = (a, b) => Math.round((a + b) * 100) / 100;
  // Bands, in a City Block whose Fixtures stand in rows: the most machines its parts hold, then
  // fewer, until a layout fits (whether one routes comes and goes with the Count). First, where
  // they hold many more than the Foretelling foretells (the search then tries above them); else
  // after the search, where they hold more than it found.
  // (Tries at once: its top worked out in a worker of its own beside the tries, Bands then after
  // them, ADR 0060.)
  let top = 0, topId = null;
  const plannerOf = () => ({ made: options.made, selections: options.selections, uses: options.uses, exports: options.exports, voids: options.voids, site: options.site, least: options.least, extra: options.extra });
  // (`parallel` a function: an Annex begun beside the caller's tries, as many at once as the
  // caller's workers it leaves, asked anew before each; its tries go to those workers even one at
  // a time, `pooled`, not run here in turn while the caller's wait, ADR 0083.)
  const share = typeof options.parallel === 'function' ? options.parallel : null;
  const width = Math.max(1, Math.floor((share ? share() : options.parallel) ?? 1));
  const atOnce = () => (share ? Math.max(1, Math.floor(share())) : width);
  const pooled = width > 1 || options.pooled === true;
  if (options.bands !== false && width > 1 && crowded(options.site) && options.starving !== 'only') {
    topId = ++trySeq;
    yield { type: 'start', id: topId, job: { top: true, goals, planner: plannerOf() } };
  } else if (options.bands !== false) top = bandsTop(plan, options.site);
  let banded = false;
  // One try in Bands: the layout, else null.
  function* inBand(n) {
    const list = plan.goalsFor(n);
    yield { type: 'try', rate: list[0].rate, machines: n };
    const { entries } = plan.chainOf(list, {}, true);
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
    yield { type: 'best', block: outcome.block, score: scoreOf(outcome.block), tried, ...best };
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
  // (A try as a worker makes it: what the planner and attempt take, as plain data.)
  const jobOf = (n, extra) => ({
    goals, n, planner: plannerOf(),
    options: { site: options.site, seed: options.seed, budgetMs: options.budgetMs, maxCandidates: options.maxCandidates, ...extra },
  });
  // (`starving: 'only'`: no layout without Starvation is looked for, only those that may starve:
  // the last Annex, ADR 0057.)
  const only = options.starving === 'only';
  // (What the Foretelling foretells before any try: Bands goes first where its parts hold FILL
  // more.)
  const foretold0 = plan.foretold().machines;
  if (!only && top >= foretold0 + FILL) {
    told = plan.foretold().machines;
    yield { type: 'foretell', ...plan.foretold() };
    yield* inBands(plan.foretold().machines);
  }
  // Bands gone first and fitting FILL more than the Foretelling foretold: the search tries nothing
  // above it. Its Placement round the Fixtures packs looser than Bands' Parts in their Slots (Py
  // vrauks: 55 paddocks, Bands 78; Py trits: 18 reefs, Bands 27, ADR 0025, ADR 0073), and its
  // tries above them found no room after 3 to 4 minutes (vrauks), more than a minute (trits).
  let past = banded && best !== null && best.machines >= told + FILL;
  // Tries made in turn (`next()`: { n, extra (attempt's options), say (an event first) }, or null
  // at the end), up to `width` under way at once: each outcome taken in their order (`take`, a
  // generator: false to end them, those still under way stopped, ADR 0060). One at a time, made
  // here, where width is 1.
  function* inTurn(next, take) {
    const going = [];
    let ended = false;
    for (;;) {
      while (!ended && going.length < atOnce()) {
        const t = next();
        if (!t) {
          ended = true;
          break;
        }
        if (t.say) yield t.say;
        if (!pooled) {
          going.push({ ...t, outcome: attempt(plan, t.n, { ...options, ...t.extra }) });
          break;
        }
        const id = ++trySeq;
        going.push({ ...t, id });
        yield { type: 'start', id, job: jobOf(t.n, t.extra) };
      }
      if (!going.length) return;
      while (going[0].outcome === undefined) {
        const { id, outcome } = yield { type: 'wait' };
        going.find(g => g.id === id).outcome = outcome;
      }
      const { n, outcome } = going.shift();
      if (!(yield* take(n, outcome))) {
        for (const g of going) if (g.outcome === undefined) yield { type: 'cancel', id: g.id };
        return;
      }
    }
  }
  // The layouts that fit, the most machines first (FITS_KEPT of them), for Annexes beside another
  // than the best (ADR 0060).
  const fits = [];
  const fitted = (n, machines, outcome, gives) => {
    if (width < 4) return;
    fits.push({ n, machines, block: outcome.block, score: outcome.score, giving: gives });
    fits.sort((a, b) => b.machines - a.machines);
    fits.length = Math.min(fits.length, FITS_KEPT);
  };
  // The Precheck (the Side Output's Sub-Blocks designed first from structured variants,
  // search.js) only once a try's designs starved: it ends such a try early, and costs every
  // other those designs again (Py nexelit: 3 to 6 s a try, passing every time). In the suite
  // only one try failed it, an Annex of 1 in Py molybdenum oxide, which the design after it,
  // random draws and all, then fits (ADR 0084).
  let starvedOnce = false;
  const prechecked = n => starvedOnce && n > plan.designable;
  // A try's outcome taken in: the planner told, the best kept where it fits more machines.
  function* took(n, outcome) {
    plan.record(n, outcome);
    if (!outcome.block && outcome.starves && !outcome.timedOut) starvedOnce = true;
    tried += outcome.tried;
    const list = plan.goalsFor(n);
    if (outcome.block) {
      fitted(n, Math.ceil(n), outcome, false);
      if (n <= (best?.count ?? -Infinity)) return;
      best = { rate: list[0].rate, machines: Math.ceil(n), count: n, goals: list };
      [bestN, bestScore, bestBlock] = [n, outcome.score, outcome.block];
      yield { type: 'best', block: outcome.block, score: outcome.score, tried, ...best };
    } else {
      failure = outcome.failure;
      misses.push({ rate: list[0].rate, machines: Math.ceil(n), count: n, starves: Boolean(outcome.starves), reason: outcome.failure?.message ?? null });
    }
  }
  const foretelling = function* () {
    const foretold = plan.foretold();
    if (foretold.machines === told) return;
    told = foretold.machines;
    yield { type: 'foretell', ...foretold };
  };
  const trying = n => {
    const list = plan.goalsFor(n);
    return { type: 'try', rate: list[0].rate, machines: Math.ceil(n), ...(plan.filling ? { more: n - plan.lo } : {}) };
  };
  // (The Annexes begun early, beside the best while its last tries run: what they returned.)
  let early = null;
  if (pooled && !only) {
    // Several tries at once (ADR 0060): first the one the planner would make next; then, in turn,
    // those it would make were the tries under way not to fit, and were the one of the fewest
    // machines to fit (between it and the next: a bisection). A try is stopped once it can no
    // longer tell anything: at no more machines than fit, or more than found no room, or made on
    // the hope that one which then did not fit would.
    const going = new Map();
    // Workers idle with no try left to begin, the Annexes beside the best begin (`spec`: { run,
    // ids (its tries under way), held (its layouts, held back until the tries are done), base
    // (the best's n), end (what it returned) }); one fitting more machines stops them. Only where
    // nothing after the tries may change the best: no Fixtures in the room (Bands, Giving Way), no
    // byproduct riding alone (sorting out).
    let spec = null;
    const ahead = () => best && bestN !== null && probing === null && options.annexes !== false && options.site && !crowded(options.site)
      && most - best.count >= LEAST && !(bestScore.riding > 0 && riding(bestBlock).some(r => r.items.length === 1));
    // (Its events on to where it waits for a try or ends: tries under way kept, layouts held back.)
    function* onward(step) {
      for (;;) {
        if (step.done) {
          spec.end = step.value;
          return;
        }
        const v = step.value;
        if (v.type === 'wait') return;
        if (v.type === 'start') spec.ids.add(v.id);
        if (v.type === 'cancel') spec.ids.delete(v.id);
        if (v.type === 'best' && !spec.live) spec.held.push(v);
        else yield v;
        step = spec.run.next();
      }
    }
    for (;;) {
      yield* foretelling();
      // (An Annex's first try alone: none fitting for want of room, no more is tried.)
      while (going.size + (spec?.ids.size ?? 0) < atOnce() && !(probing !== null && going.size)) {
        const ns = [...going.values()].map(g => g.n);
        const hope = going.size % 2 === 0 && going.size > 0;
        const least = Math.min(...ns);
        let n = probing ?? plan.beside(ns, hope);
        let on = hope ? least : null;
        if (n === null || ns.includes(n)) {
          // (The other way.)
          n = going.size ? plan.beside(ns, !hope) : null;
          on = hope ? null : least;
          if (n === null || ns.includes(n)) break;
        }
        // (With the others under way: their machines.)
        yield { ...trying(n), others: [...going.values()].map(g => Math.ceil(g.n)) };
        const id = ++trySeq;
        going.set(id, { n, on });
        yield { type: 'start', id, job: jobOf(n, { precheck: prechecked(n), unsorted: true }) };
        if (probing !== null) break;
      }
      if (!spec && going.size && going.size < width && ahead()) {
        spec = { run: annexPhase(() => Math.max(1, width - going.size), [{ n: bestN, giving: false, extra: {}, alone: bestBlock, base: null, block: bestBlock }]), ids: new Set(), held: [], base: bestN, end: null, live: false };
        yield* onward(spec.run.next());
      }
      if (!going.size) break;
      const got = yield { type: 'wait' };
      const { id, outcome } = got;
      if (spec?.ids.has(id)) {
        spec.ids.delete(id);
        yield* onward(spec.run.next(got));
        continue;
      }
      if (id === topId) {
        [top, topId] = [outcome.top, null];
        // Bands' parts holding FILL more than foretold before any try: Bands now, above the best
        // so far, as one at a time goes first (the tries under way go on meanwhile); fitting FILL
        // more than foretold, the search tries nothing above it (`past`).
        if (!only && top >= foretold0 + FILL && top > (best?.machines ?? 0)) {
          yield* inBands(Math.max(foretold0, best?.machines ?? 0));
          past = bestN === null && best !== null && best.machines >= foretold0 + FILL;
          if (past) break;
          // (Tries under way at no more machines than it fit tell nothing more.)
          for (const [k, g] of going) {
            if (g.n > plan.lo) continue;
            going.delete(k);
            yield { type: 'cancel', id: k };
          }
        }
        continue;
      }
      const { n } = going.get(id);
      going.delete(id);
      yield* took(n, outcome);
      if (spec && bestN !== spec.base) {
        for (const k of spec.ids) yield { type: 'cancel', id: k };
        spec.run.return(undefined);
        [spec, annexAbove] = [null, null];
      }
      if (probing !== null) {
        probing = null;
        if (!outcome.block && !outcome.starves) break;
      }
      for (const [k, g] of going) {
        if (g.n > plan.lo && g.n < plan.ceiling && !(g.on === n && !outcome.block)) continue;
        going.delete(k);
        yield { type: 'cancel', id: k };
      }
    }
    for (const k of going.keys()) yield { type: 'cancel', id: k };
    while (topId !== null) {
      const { id, outcome } = yield { type: 'wait' };
      if (id === topId) [top, topId] = [outcome.top, null];
    }
    // (The Annexes begun early: their layouts held back shown now, and on to their end.)
    if (spec) {
      spec.live = true;
      yield* spec.held;
    }
    while (spec && !spec.end) {
      const got = yield { type: 'wait' };
      if (!spec.ids.has(got.id)) continue;
      spec.ids.delete(got.id);
      yield* onward(spec.run.next(got));
    }
    if (spec) early = spec.end;
  } else {
    for (;;) {
      yield* foretelling();
      // (An Annex's first try: its least, one of the first Goal's machines. None fitting for want
      // of room, no more is tried.)
      const n = only || past ? null : probing ?? plan.next();
      if (n === null) break;
      yield trying(n);
      const outcome = attempt(plan, n, { ...options, precheck: prechecked(n), unsorted: true });
      yield* took(n, outcome);
      if (!outcome.block && probing !== null && !outcome.starves) break;
      probing = null;
    }
  }
  if (!only && !banded && top > (best?.machines ?? 0)) yield* inBands(best?.machines ?? 0);
  // Giving Way (ADR 0047): in a City Block with Fixtures in its room, the first Goal's Sub-Block
  // gives up the machines Fixtures stand on (a quarter of them at most), none built elsewhere: its
  // copies stand closer, a Fixture on a machine rather than between them, and more may stand in
  // all. Each layout counts the machines it has, kept where they are more than stood before. From
  // the most that fit, FILL machines more, again while they fit; half as many after each that does
  // not. (No more of them than the cap, nor tried above a quarter more; nor so many that the
  // three quarters kept would be as many as a try that did not fit: 14 and 9 tried after 5 did
  // not, the best 4, took a fifth of a Maximize, ADR 0048.)
  let giving = false;
  const lead = block => block.subBlocks.find(sb => sb.item === goals[0].item)?.count ?? 0;
  if (best && bestN !== null && options.giving !== false && crowded(options.site)) {
    let n = Math.ceil(bestN), more = FILL, high = Math.floor(most + most / 4);
    const missed = misses.map(m => m.machines).filter(m => m > bestN);
    if (missed.length) high = Math.min(high, Math.floor(Math.min(...missed) * 4 / 3));
    // (A layout giving way, kept where it has more machines than stood before.)
    const gave = function* (k, outcome) {
      const m = lead(outcome.block);
      if (m <= most) fitted(k, m, outcome, true);
      if (m <= best.machines || m > most) return;
      const goalsOf = plan.goalsFor(m);
      best = { rate: goalsOf[0].rate, machines: m, count: m, goals: goalsOf };
      [bestN, bestScore, bestBlock, giving] = [k, outcome.score, outcome.block, true];
      yield { type: 'best', block: outcome.block, score: outcome.score, tried, ...best };
    };
    if (width > 1) {
      // Tries at once (ADR 0060): every step at once, FILL machines more and each half as many,
      // the most that fit going on from there, the fewest above it that did not bounding the next.
      for (const asked = new Set(); ;) {
        const steps = [...new Set([FILL, 5, 2, 1].map(k => n + k))].filter(k => k < high && !asked.has(k)).slice(0, width);
        if (!steps.length) break;
        const going = new Map();
        for (const k of steps) {
          asked.add(k);
          const list = plan.goalsFor(k);
          yield { type: 'try', rate: list[0].rate, machines: k, giving: true };
          const id = ++trySeq;
          going.set(id, k);
          yield { type: 'start', id, job: jobOf(k, { unsorted: true, giving: true }) };
        }
        const done = new Map();
        while (done.size < going.size) {
          const { id, outcome } = yield { type: 'wait' };
          done.set(going.get(id), outcome);
          tried += outcome.tried;
        }
        const fit = steps.filter(k => done.get(k).block).sort((a, b) => a - b);
        for (const k of fit) yield* gave(k, done.get(k));
        const reached = fit.at(-1) ?? n;
        high = Math.min(high, ...steps.filter(k => !done.get(k).block && k > reached));
        n = reached;
      }
    } else {
      for (; more >= 1; more = Math.floor(more / 2)) {
        while (n + more < high) {
          const list = plan.goalsFor(n + more);
          yield { type: 'try', rate: list[0].rate, machines: n + more, giving: true };
          const outcome = attempt(plan, n + more, { ...options, unsorted: true, giving: true });
          tried += outcome.tried;
          if (!outcome.block) {
            high = n + more;
            break;
          }
          n += more;
          yield* gave(n, outcome);
        }
      }
    }
  }
  // The highest that fit found with every byproduct riding on through its producers' consumers
  // (a layout sorting them out by splitters takes far longer to find): once more with them
  // sorted out, given longer, kept where it fits (as many machines, where they gave way). Not
  // where no belt rides one alone: a filter splitter sorts one byproduct out of a belt, so two on
  // one (Py's solid separators' nexelit ore and iron oxide) ride on whatever the layout, ADR 0056.
  // (A byproduct riding on clogs the belts into its consumers, ADR 0052: where none sorts it out
  // at the most that fit, fewer machines that do, SORT_BELOW whole numbers below it, at least the
  // least asked for; with tries at once, all of them together, ADR 0060.)
  if (best && bestN !== null && bestScore.riding > 0 && riding(bestBlock).some(r => r.items.length === 1)) {
    const routing = Math.max(options.budgetMs ?? 0, SORTING_MS), least = Math.max(1, options.least ?? 1);
    const fewer = giving ? [] : [...Array(SORT_BELOW).keys()].map(k => Math.ceil(bestN) - 1 - k).filter(n => n >= least);
    const sorting = [{ n: bestN, extra: { routing, sorting: true, giving } }, ...fewer.map(n => ({ n, extra: { routing, sorting: true } }))];
    const was = bestN;
    yield* inTurn(() => sorting.shift() ?? null, function* (n, out) {
      tried += out.tried;
      if (n === was) {
        if (!out.block || out.score.riding >= bestScore.riding || (giving && lead(out.block) < best.machines)) return true;
        [bestScore, bestBlock] = [out.score, out.block];
        yield { type: 'best', block: out.block, score: out.score, tried, ...best };
        return false;
      }
      if (!out.block || out.score.riding > 0) return true;
      const list = plan.goalsFor(n);
      best = { rate: list[0].rate, machines: n, count: n, goals: list };
      [bestN, bestScore, bestBlock] = [n, out.score, out.block];
      yield { type: 'best', block: out.block, score: out.score, tried, ...best };
      return false;
    });
  }
  // Starving (ADR 0057): above the highest that fit without Starvation, layouts that starve, each
  // kept where it delivers more of the first Goal than the best so far (a Sub-Block short of an
  // input runs as much slower, and those it feeds too: sim.js throughput). First the numbers above
  // it that did not fit for Starvation (or time), lowest first; then a machine more at a time.
  // It ends after STARVING_MISSES tries in a row that deliver no more or find no layout, at the
  // cap, or at a number that found no room. Here only where no Annex follows, or nothing fit
  // without: a layout that takes more room leaves Annexes less, and they may have made more (Py
  // molybdenum oxide: 3 furnaces starving, or 2 and an Annex of 2). Else in the last Annex, in the
  // room the others leave (below). (None in Bands.)
  if (options.starving !== false && (only || !best || options.annexes === false) && (bestN !== null || !best)) {
    const from = bestN ?? 0;
    const starved = [...new Set(misses.filter(m => m.starves && m.count > from && m.count < plan.ceiling && m.count <= most).map(m => m.count))].sort((a, b) => a - b);
    const counts = function* () {
      yield* starved;
      for (let n = Math.max(Math.floor(from), ...starved.map(Math.floor)) + 1; ; n++) yield n;
    };
    let missed = 0;
    const all = counts();
    yield* inTurn(() => {
      const n = all.next().value;
      if (n > most || n >= plan.ceiling) return null;
      const list = plan.goalsFor(n);
      return { n, extra: { unsorted: true, starving: true }, say: { type: 'try', rate: list[0].rate, machines: Math.ceil(n), starving: true } };
    }, function* (n, out) {
      tried += out.tried;
      if (!out.block || out.delivered <= deliveredBy(best) + 1e-6) return ++missed < STARVING_MISSES;
      missed = 0;
      const list = plan.goalsFor(n);
      best = { rate: list[0].rate, machines: Math.ceil(n), count: n, goals: list, delivered: Math.floor(out.delivered * 100) / 100 };
      [bestN, bestScore, bestBlock, giving] = [n, out.score, out.block, false];
      yield { type: 'best', block: out.block, score: out.score, tried, ...best };
      return true;
    });
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
  // The layouts laid out, in turn: { n, extra (what it makes beyond what it takes, for Annexes
  // to draw), alone (the layout itself), base (those before it together; null: none), block (it
  // with them) }. None after Bands.
  let stages = bestN !== null ? [{ n: bestN, giving, extra: {}, alone: bestBlock, base: null, block: bestBlock }] : null;
  // An Annex beside `built`, no more than `cap` of the first Goal's machines: { block (the
  // two together), score, best, stage }, else null.
  function* annexOf(built, before, cap, starving = false, parallel = width) {
    const site = annexSite(options.site, built, catalog, options.made);
    const alone = { ...site, draws: Object.fromEntries(Object.entries(site.draws).filter(([, d]) => !d.only)) };
    let found = null;
    for (const room of Object.values(site.draws).some(d => d.only) ? [site, alone] : [site]) {
      const run = maximize(goals, catalog, logistics, { ...options, site: room, annexes: false, bands: false, upTo: false, probe: true, least: 1, most: cap, giving: false, starving: starving ? 'only' : false, parallel, pooled: width > 1 });
      let step, reply;
      for (step = run.next(); !step.done; step = run.next(reply)) {
        const v = step.value;
        reply = undefined;
        // (Its tries at once go to the caller's workers.)
        if (v.type === 'start' || v.type === 'wait' || v.type === 'cancel') {
          reply = yield v;
          continue;
        }
        if (v.type === 'try') yield { ...v, rate: plus(v.rate, before.rate), machines: v.machines + before.machines };
        if (v.type !== 'best') continue;
        const block = annexed(built, v.block, options.site, catalog, logistics);
        // (Beside a layout that starves, together they deliver what each does alone, ADR 0057;
        // else together they starve nothing.)
        const delivered = deliveredBy(before) + deliveredBy(v);
        const starved = before.delivered !== undefined || v.delivered !== undefined;
        if (validateBlock(block, catalog, logistics).length || (starved ? throughput(block).delivered(goals[0].item) < delivered - 1e-6 * Math.max(1, delivered) : simulate(block).starvation.length)) continue;
        const list = before.goals.map((g, k) => ({ ...g, rate: plus(g.rate, v.goals[k].rate) }));
        found = {
          block, score: v.score, best: { rate: list[0].rate, machines: before.machines + v.machines, count: before.count + v.count, goals: list, ...(starved ? { delivered: Math.floor(delivered * 100) / 100 } : {}) },
          stage: { n: v.count, giving: false, extra: {}, alone: v.block, base: built, block },
        };
        yield { type: 'best', block, score: v.score, tried: tried + v.tried, ...found.best };
      }
      tried += step.value.tried;
      // (The last Annex, starving, leaves what did not fit without as it was.)
      if (!starving) annexAbove = step.value.above && { ...step.value.above, rate: plus(step.value.above.rate, before.rate), machines: step.value.above.machines + before.machines };
      if (found) break;
    }
    return found;
  }
  // n of the first Goal's machines laid out beside `built` (null: alone in the City Block), making
  // `extra` beyond what they take (`giving`: giving way, as they did): { alone, block (with
  // `built`), score }, else null.
  function relay(n, extra, built, giving = false) {
    let rooms = [options.site];
    if (built) {
      const site = annexSite(options.site, built, catalog, options.made);
      rooms = Object.values(site.draws).some(d => d.only) ? [site, { ...site, draws: Object.fromEntries(Object.entries(site.draws).filter(([, d]) => !d.only)) }] : [site];
    }
    for (const site of rooms) {
      const out = attempt(planner(goals, catalog, logistics, { ...options, site, extra }), n, { ...options, site, unsorted: true, giving });
      tried += out.tried;
      if (!out.block) continue;
      if (!built) return { alone: out.block, block: out.block, score: out.score };
      const block = annexed(built, out.block, options.site, catalog, logistics);
      if (!validateBlock(block, catalog, logistics).length && !simulate(block).starvation.length) return { alone: out.block, block, score: out.score };
    }
    return null;
  }
  // The Annex `found` with an Extension: { found, stages }, else null.
  function extend(found, stages) {
    const wants = extensionOf(found.stage.alone, goals, options.made);
    const last = item => stages.map(s => s.alone.subBlocks.some(sb => sb.item === item)).lastIndexOf(true);
    const j = Math.max(-1, ...Object.keys(wants).map(last));
    if (j < 0) return null;
    const extra = { ...stages[j].extra };
    for (const [item, rate] of Object.entries(wants)) if (last(item) === j) extra[item] = (extra[item] ?? 0) + rate;
    const redone = [];
    let built = stages[j].base;
    for (let i = j; i < stages.length; i++) {
      const stage = { n: stages[i].n, giving: stages[i].giving, extra: i === j ? extra : stages[i].extra, base: built };
      const out = relay(stage.n, stage.extra, built, stage.giving);
      // (Laid out again, its byproducts riding on where they were sorted out: not worth it, ADR 0052.)
      if (!out || scoreOf(out.alone).riding > scoreOf(stages[i].alone).riding) return null;
      redone.push({ ...stage, alone: out.alone, block: out.block });
      built = out.block;
    }
    const out = relay(found.stage.n, {}, built);
    if (!out || out.alone.subBlocks.length >= found.stage.alone.subBlocks.length || scoreOf(out.alone).riding > scoreOf(found.stage.alone).riding) return null;
    const stage = { n: found.stage.n, giving: false, extra: {}, alone: out.alone, base: built, block: out.block };
    return { found: { ...found, block: out.block, score: out.score, stage }, stages: [...stages.slice(0, j), ...redone, stage] };
  }
  // The Annexes beside a layout (`from`: { best, block, stages }), one after another while one
  // fits, `parallel` tries at once in each: { best, last (all of them together) }.
  function* annexing(from, parallel) {
    let { best: got, stages: staged } = from, last = from.block;
    for (let built = from.block; built && options.annexes !== false && options.site && most - got.count >= LEAST;) {
      const before = got;
      let found = yield* annexOf(built, before, most - before.count, false, parallel);
      if (!found) break;
      const better = staged && extend(found, staged);
      if (better) {
        ({ found, stages: staged } = better);
        yield { type: 'best', block: found.block, score: found.score, tried, ...found.best };
      } else if (staged) staged.push(found.stage);
      [got, built] = [found.best, found.block];
      last = built;
    }
    return { best: got, last };
  }
  let last = bestBlock;
  if (early) ({ best, last } = early);
  else if (best) ({ best, last } = yield* annexPhase(() => width, stages));
  // The Annexes beside the best (its `staged` layouts, for Extensions), `widthNow()` tries at
  // once: { best, last }. The layout with most machines may leave its Annexes little room
  // (machines the same in number stand many ways: Py kicalk's 66 left room foretold to hold 4
  // more, another of 66 61, one of 63 43). With 4 tries at once or more, the Annexes beside the
  // layout found with most machines and the room the Foretelling says an Annex beside it holds
  // too, where that is another, side by side, half the tries each; the more that makes the more
  // kept (ADR 0060).
  function* annexPhase(widthNow, staged) {
    const other = widthNow() >= 4 && bestN !== null && options.annexes !== false && options.site && !options.extra ? roomiest() : null;
    const ends = other
      ? yield* together([
        annexing({ best, block: bestBlock, stages: staged }, () => Math.ceil(widthNow() / 2)),
        annexing({ best: other.best, block: other.block, stages: [{ n: other.n, giving: other.giving, extra: {}, alone: other.block, base: null, block: other.block }] }, () => Math.floor(widthNow() / 2)),
      ], deliveredBy(best))
      : [yield* annexing({ best, block: bestBlock, stages: staged }, widthNow)];
    return ends.reduce((a, b) => (deliveredBy(b.best) > deliveredBy(a.best) ? b : a));
  }
  // The fit, other than the best, with the most machines and Annex room together (each Annex's
  // room foretold as Annexes' are), else null.
  function roomiest() {
    const room = f => {
      const site = annexSite(options.site, f.block, catalog, options.made);
      return planner(goals, catalog, logistics, { ...options, site, least: 1 }).foretold().machines;
    };
    let top = null;
    for (const f of fits) {
      const worth = f.machines + room(f);
      if (!top || worth > top.worth) top = { ...f, worth };
    }
    if (!top || top.block === bestBlock || top.machines === best.machines) return null;
    const list = plan.goalsFor(top.machines);
    return { ...top, best: { rate: list[0].rate, machines: top.machines, count: top.giving ? top.machines : top.n, goals: list } };
  }
  // Starving, once nothing more fits without (ADR 0057): one more Annex in the room left, its
  // layout one that may starve, kept where the two together deliver more.
  if (options.starving !== false && !only && options.annexes !== false && last && most - best.count >= LEAST) {
    const found = yield* annexOf(last, best, most - best.count, true);
    if (found) best = found.best;
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
// Starvation. Returns { block, score, placed, tried, designed, starves, timedOut, failure }:
// block null when none fits, `starves` when that is for want of a design without Starvation (or
// of one that fits the City Block: a Count's designs come and go like its Starvation), not of
// room, or the try ran out of time (`timedOut`: not for want of room either); `budgetMs` is the
// time its candidates get once its Sub-Blocks are designed;
// `designed` lists each Sub-Block's item, Count and best design's area. Where a Sub-Block other
// than the first Goal's starves by a few of its machines' worth, the try is made again with that
// many spare machines of it (ADR 0048), unless it ran out of time.
// precheck: the Side Output's Sub-Blocks are checked for Starvation first (worth it above the
// highest n whose Sub-Blocks were all designed without). unsorted: no byproduct sorted out after
// its producers (search.js); routing: how long its candidates get once designed (budgetMs);
// sorting: on past layouts whose byproducts ride on, to the first that sorts them all out (else
// the best of them).
/** @param {any} plan @param {number} n @param {any} options */
export function attempt(plan, n, options) {
  const list = plan.goalsFor(n);
  const first = once(plan, list, {}, options);
  // Spare machines (ADR 0048): where a Sub-Block's every design starves, or its belts alone starve
  // the layouts passed over, by no more than a few of its machines make (its belts each bring less
  // than the runs of consumers they feed take: 30 soil extractors on 5 belts of 720 a minute for
  // washers taking 450 each), the try again with that many more of them, their belts bringing
  // more than they are wanted for.
  // (Not after a try that ran out of time: the same again with more machines seldom routes in
  // it, and would take as long, ADR 0056.)
  const short = first.short;
  if (!short || short.item === list[0].item || first.timedOut || options.starving) return first;
  const machines = Math.ceil(short.rate / short.each - 1e-9);
  if (machines > Math.max(SPARE, Math.ceil(short.count / 10))) return first;
  // (Nor where the train would bring an item it did not: a Recipe Loop the spare machines' inputs
  // take more of than its producer makes, ADR 0071 — Py hot air's stone bricks, round the loop
  // before, by train both ways after one warmer brick RHE more.)
  const train = sp => {
    try {
      return plan.chainOf(list, sp).trainInputs.map(t => t.item);
    } catch {
      return null;
    }
  };
  const before = train({}), after = train({ [short.item]: machines * short.each });
  if (before && after?.some(item => !before.includes(item))) return first;
  const again = once(plan, list, { [short.item]: machines * short.each }, options);
  return again.block ? again : first;
}

// The fewest spare machines a try may add to a Sub-Block (else a tenth of its Count).
const SPARE = 2;

// One try at the Goals `list` (attempt), with `spare` more of some steps' items.
function once(plan, list, spare, { site, seed = 1, budgetMs = 10000, maxCandidates = Infinity, now = () => Date.now(), precheck = false, unsorted = false, routing = budgetMs, sorting = false, giving = false, starving = false }) {
  let designed = null, entries;
  try {
    ({ entries } = plan.chainOf(list, spare));
  } catch (e) {
    return { block: null, tried: 0, designed, starves: true, failure: e };
  }
  // (Sorting: the best so far, while its byproducts ride on. A first fit bringing a Recipe Loop's
  // feedback by train: the best so far, while as long again finds one feeding it here — the
  // search's clock then runs out.)
  let kept = null, until = Infinity;
  const start = now();
  const clock = () => (now() > until ? Infinity : now());
  try {
    const run = search(entries, plan.catalog, plan.logistics, {
      seed, site, maxCandidates, deadline: now() + budgetMs, routing, unsorted, now: clock, perfect: !starving, settled: starving, precheck: precheck && !starving, designed: d => { designed = d; },
      ...(giving ? { giving: list[0].item } : {}),
    });
    // (Starving: of the layouts found, the one that delivers most of the first Goal, ADR 0057.)
    /** @type {any} */
    let top = null;
    for (let step = run.next(); ; step = run.next()) {
      if (starving) {
        if (step.done) {
          if (top) return { block: top.block, score: top.score, placed: top.placed, tried: step.value.tried, designed, starves: false, failure: null, delivered: top.delivered };
          return { block: null, tried: step.value.tried, designed, starves: Boolean(step.value.starves || step.value.timedOut), timedOut: Boolean(step.value.timedOut), failure: step.value.failure ?? new Error(`no layout fits ${list[0].rate}/min`) };
        }
        const delivered = throughput(step.value.block).delivered(list[0].item);
        if (!top || delivered > top.delivered + 1e-9) top = { ...step.value, delivered };
        continue;
      }
      if (step.done) {
        if (kept) return { block: kept.block, score: kept.score, placed: kept.placed, tried: step.value.tried, designed, starves: false, failure: null };
        const failure = step.value.failure ?? new Error(`no layout without starvation fits ${list[0].rate}/min`);
        return { block: null, tried: step.value.tried, designed, starves: Boolean(step.value.starves || step.value.timedOut), timedOut: Boolean(step.value.timedOut), failure, short: step.value.short ?? null };
      }
      if (sorting && step.value.score.starving === 0 && step.value.score.riding > 0) kept = step.value;
      else if (!sorting && step.value.score.starving === 0 && step.value.score.loopsByTrain > 0) {
        if (!kept) until = now() + Math.max(1000, now() - start);
        kept = step.value;
      } else if (step.value.score.starving === 0) {
        run.return(undefined);
        return { block: step.value.block, score: step.value.score, placed: step.value.placed, tried: step.value.tried, designed, starves: false, failure: null };
      }
    }
  } catch (e) {
    // (Out of the time a fit bringing a loop by train left: that one.)
    if (kept && !sorting) return { block: kept.block, score: kept.score, placed: kept.placed, tried: kept.tried, designed, starves: false, failure: null };
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
// the highest whole number foretold to fit (after a try that found no room or ran out of time,
// or two in a row whose designs starved, no more than halfway; right after one that starved, the
// number below it);
// with none left below a number that starved, the one above it, once; then Filling: FILL
// machines more than the highest that fit, again while they fit, half as many after each that
// does not; null after. None above the cap (cap(n)): that one instead, null once it fit.
// filling: how many more Filling adds (null before it starts).
// record(n, outcome): a try's outcome (attempt's). foretold(): { rate, machines }. span(n): the
// tiles n machines' Sub-Blocks are foretold to span, of the City Block's `room`; `asked`: the
// first Goal's machines at the Goals' own rates, `wanted` as many running as fast as those take.
/** @param {any[]} goals @param {any} catalog @param {any} logistics @param {any} options */
export function planner(goals, catalog, logistics, { made = [], selections = {}, uses = [], exports = [], voids = [], index = recipeOptions(catalog), site, least = LEAST, extra = {} }) {
  // In an Annex's City Block, a fluid made here that a pipe built before it has to spare comes
  // from there instead, while that has enough (ADR 0032).
  const draws = Object.entries(site?.draws ?? {}).filter(([fluid]) => made.includes(fluid));
  // (`spare`: more of some steps' items than they take, beside `extra`: spare machines.)
  // (`plain`: no fluids fed back through valves, for Bands, ADR 0062.)
  const chainOf = (list, spare = {}, plain = false) => {
    const drawn = new Set(draws.map(([fluid]) => fluid));
    const more = { ...extra };
    for (const [item, rate] of Object.entries(spare)) more[item] = (more[item] ?? 0) + rate;
    for (;;) {
      const chain = expandChain(list, catalog, { made: made.filter(item => !drawn.has(item)), selections, uses, exports, voids, index, extra: more, belt: logistics.belt, logistics, valves: !plain });
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
    // (With few machines, down to a tenth of those that fit: a quarter of 1.3 RHEs is a fifth
    // of the rate, ADR 0072.)
    const finest = least < 1 && lo > 0 ? Math.min(least, lo / FINEST) : least;
    for (; fill >= finest; fill /= 2) {
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
    // The lowest n that found no room.
    get ceiling() { return ceiling; },
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
    // The n next() would try were the tries under way (`pending`) not to fit (as tries out of
    // time: halfway down), but the fewest machines of them (`fits`), the planner left as it was
    // but for the number above one that starved, tried once (ADR 0060).
    beside(pending, fits = false) {
      const was = { lo, ceiling, fill, failed, streak, tightest, loose, spread };
      const starvedWas = [...starved];
      // (The fit first: the others after it not fitting, the next is no more than halfway up.)
      const least = Math.min(...pending);
      if (fits) this.record(least, { block: true, placed: null });
      for (const m of pending) if (!(fits && m === least)) this.record(m, { block: null, starves: true, timedOut: true });
      const n = this.next();
      ({ lo, ceiling, fill, failed, streak, tightest, loose, spread } = was);
      starved.clear();
      for (const m of starvedWas) starved.add(m);
      return n;
    },
    record(n, outcome) {
      for (const d of outcome.designed ?? []) if (d.area) tiles.set(d.item, d.area / d.count);
      if (outcome.designed) designable = Math.max(designable, n);
      failed = !outcome.block;
      // (A try that ran out of time counts as the second in a row that starved: the next no more
      // than halfway down, not the number just below it, which seldom routes in time either,
      // ADR 0056.)
      streak = !outcome.block && outcome.starves ? (outcome.timedOut ? Math.max(2, streak + 1) : streak + 1) : 0;
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
export function bandsTop(plan, site) {
  if (!site?.fixtures.some(f => overlap(f, site.inner) > 0)) return 0;
  const packs = n => {
    try {
      return Boolean(bands(plan.chainOf(plan.goalsFor(n), {}, true).entries, plan.catalog, plan.logistics, site, { pack: true })?.packed);
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
// How many whole numbers of the first Goal's machines below the most that fit are tried with
// every byproduct sorted out, where none sorts them out there (ADR 0052).
const SORT_BELOW = 2;

// Generators run side by side, each handing its tries out (maximize's 'start', 'wait',
// 'cancel'): their events as they come, a 'best' only where it delivers more than every one shown
// before (`shown` at first), and each outcome to the generator whose try it was. Returns what
// each returns.
function* together(runs, shown = -Infinity) {
  const owner = new Map(), waiting = new Set(), inbox = runs.map(() => []), ends = [];
  // (A generator on from its step `first` until it waits for a try's outcome, or ends.)
  function* advanceFrom(k, first) {
    let step = first;
    for (;;) {
      if (step.done) {
        ends[k] = step.value;
        return;
      }
      const v = step.value;
      if (v.type === 'wait') {
        if (!inbox[k].length) {
          waiting.add(k);
          return;
        }
        step = runs[k].next(inbox[k].shift());
        continue;
      }
      if (v.type === 'start') owner.set(v.id, k);
      if (v.type === 'best' && (v.delivered ?? v.rate) <= shown) {
        step = runs[k].next();
        continue;
      }
      if (v.type === 'best') shown = v.delivered ?? v.rate;
      yield v;
      step = runs[k].next();
    }
  }
  for (let k = 0; k < runs.length; k++) yield* advanceFrom(k, runs[k].next());
  while (waiting.size) {
    const got = yield { type: 'wait' };
    const k = owner.get(got.id);
    owner.delete(got.id);
    if (k === undefined) continue;
    if (!waiting.has(k)) {
      inbox[k].push(got);
      continue;
    }
    waiting.delete(k);
    yield* advanceFrom(k, runs[k].next(got));
  }
  return ends;
}

// How many of the layouts that fit Maximize keeps, to annex beside another than the best.
const FITS_KEPT = 4;

// Tries yielded to start, each its own number.
let trySeq = 0;

// How many tries in a row may deliver no more before the climb through starving layouts ends.
const STARVING_MISSES = 2;

// Filling: how many machines more than the highest that fit it first tries, and the fewest.
const FILL = 10;
const LEAST = 1 / 4;
// (Filling's fewest, at least: what fits over FINEST.)
const FINEST = 10;

// Whether a City Block has Fixtures in its room.
function crowded(site) {
  return !!site && site.fixtures.some(f => overlap(f, site.inner) > 0);
}

function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
