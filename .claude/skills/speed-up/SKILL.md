---
name: speed-up
description: Make builds and Maximize reach their result in less wall-clock time. Profile the page's own path on the suite's setups, find where the search spends its time and what it works out that no layout uses, cut it cause by cause, and prove each cut lays out the same (hash-identical, no time limit) before measuring the seconds saved; schedule changes (order, tries at once, early exits) measured page-like and against the suite. Ends with tests, an ADR and a commit. Use when the user says a build or Maximize is slow, asks to optimize time / speed / performance, or wants the first or best layout sooner.
---

# Speed Up

The goal is the same result, or a better one, in less wall-clock time: for a build (the page's
search, both Strategies, ADR 0013/0077) and for Maximize (its tries, Annexes and phases, ADR
0008/0060). The output is seconds saved on named setups, each cut proven not to lose a layout,
documented the way this repo documents changes.

Speed matters twice here. Every search runs on a wall-clock budget (`logistics.budget`, 10 s by
default; 1000 s a try in most suite setups): a faster candidate means more candidates in the same
budget, so a speed-up is often also a rate gain on the page.

**Read first:**
- `.claude/skills/tune-layout/lessons.md`: "For speed, profile, then follow every candidate",
  the time lines in "What failed" (0049, 0055, 0056, 0058, 0059, 0060, 0072) and "Time is part of
  the result".
- ADR 0058 (Work no layout used) end to end: it is the template for this skill's loop and its
  ADR. Then 0059 and 0060; 0008, 0013, 0026, 0049, 0056 and 0077 for the mechanism you touch.

Do not repeat a reverted idea unless you can say why it differs this time.

## Two kinds of change

| | Same work, faster | A schedule change |
|---|---|---|
| What | A cache, a memo, a bound, a faster structure, work never used cut | Another order of tries or candidates, more at once, an earlier exit, a phase gated |
| Layouts | Every event and layout the same: hashes identical with no time limit (`maxdet.mjs`, the suite) | May differ: the path changes |
| Proof | Hashes, then seconds | No suite LOSS; page-like wall-clock A/B on the setups it targets, best rate and when it came |
| Example | ADR 0058's variants alike built once (designing 54 → 23 s) | ADR 0060's tries at once (titanium first fit 1224 → 51 s); ADR 0056's halfway down after a try out of time |

Say which kind each change is. Do the first kind first: it needs no judgement, only hashes.

## Tools

`$TL` = `.claude/skills/tune-layout`, `$SP` = `.claude/skills/speed-up`, `$S` = the session
scratchpad (every output goes there, never in the repo).

| Tool | Use |
|---|---|
| `node $TL/scripts/suite-one.mjs <setup> [K] [most]` | The page's path (session.js) in one process, K candidates a try, no time limit: the same on any host. Prints `RESULT` with `secs` and the layout's `hash`. The one to profile: every job runs in-process (inlineRunner), so one profile holds designing, both Strategies, every try. |
| `node --cpu-prof --cpu-prof-dir=$S/prof $TL/scripts/suite-one.mjs …` then `node $TL/scripts/profsum.mjs $S/prof/<file>.cpuprofile [top]` | Where the time goes, inclusive and self, by function. |
| `node $TL/scripts/maxdet.mjs <setup> [K] [most]` | Maximize alone with no time limit: each event with its seconds and a layout hash, then one hash of them all. Two codes laying out the same print the same `END` hash. `STOPAT=<machines>` stops at a fit; `ROOT=` for another worktree. |
| `npm run suite -- [--tier fast\|full] [--only a,b] [--root DIR] [--out F.json]` | Every suite setup, its `secs` and hash against the record. |
| `node $SP/scripts/speedcmp.mjs A.json B.json` | Two suite `--out` files side by side: seconds before and after per setup, `same layout` or `DIFFERS`, and the total over those laid out the same. Exits 1 where any differs. |
| `node $TL/scripts/run.mjs <setup> [--mode auto\|build\|maximize] [--parallel N] [--total S] [--root DIR]` | Page-like wall clock: the setup's own budgets, worker threads (`--parallel N`: Maximize's tries at once). `summary.json` has `secs` and `bestAtS` (when the best came). |
| `run.mjs … --profile-slow S` | A try with no event for S seconds sampled by V8's tick profiler. If it shows no JavaScript frames (0055), use timestamped phase logs instead. |

Builds: the suite's builds are `small-parts-100` (in a City Block, up to the Goals) and
`titanium-free` (no City Block, no layout). For a plain build without a City Block, copy a setup
to `$S` with `city` removed (or `city.maximize: false`), and time it with `suite-one.mjs` (K
candidates for each Strategy) and `run.mjs --mode build`.

Noise: on this host the same code ran 10.5 vs 10.5 s and 12.9 vs 13.2 s side by side (2 %). A
saving under 5 % on one setup is not a saving; look at the total over many.

## The loop

### 1. Baseline

- `uptime` first; `pgrep -f suite-one.mjs` / `pgrep -f run.mjs` (PIDs only: never `ps` with
  arguments, secrets have leaked that way). Never start a run identical to one under way.
- Choose the setups. The user's, if given (save it as `$S/<name>/setup.json`, as tune-layout
  step 1). Otherwise the suite's: fast tier for the loop, full tier for what it says about the
  big ones (titanium plate, molybdenum oxide, kicalk, rayon: tens of minutes each).
- Run each once alone with `suite-one.mjs` (or the suite with `--out $S/base.json`). Note the
  seconds and hashes.

### 2. Profile: where does the time go

Profile each setup chosen (`--cpu-prof` on `suite-one.mjs`), sum with `profsum.mjs`, and write a
table like ADR 0058's: rows the phases, columns the setups, cells their share and seconds.

| Phase | Where (start here) |
|---|---|
| Designing the Sub-Blocks | design.js `designStep`, `designOnce`, `variants`; layout/core.js `buildCore`; search.js `designAll`, `keptDesigns` |
| Choosing designs (the one that fits most spots between Fixtures) | search.js |
| Placement | layout/place.js `placeBlocks`, `inLayers` (Layers), `copyLands` (Parting), `optionsFor`, `roomFor`, Backtracking |
| Routing the links | layout/compose.js (`routeSplit`), layout/router.js (`search`, `routePipe`, `HOPS`) |
| Fallbacks (each caller's ladder) | layout/lay.js `layOut`; the ladders in search.js, bands.js, layout/edit.js |
| Finishing (pipes buried, belts straightened, poles) | layout/compact.js, layout/poles.js |
| Bands | bands.js (`twoRowsFit`), maximize.js / parallel.js `bandsTop` |
| Maximize's schedule | maximize.js `planner` (`record`, `beside`), `attempt`, `once`, `annexOf`; parallel.js `drive`, `tryPool` |
| The Build Session | session.js `buildSession`; runners.js; jobs.js `runJob`, `runTry` |

Each setup has its own sink (0058: molybdenum oxide designing, kicalk Parting, titanium plate
fallbacks and Layers). A cut that pays on one may cost nothing elsewhere; it may also be timed
off by something (step 5).

### 3. Follow every candidate: what work is never used

A profile says where time goes, not whether it was wasted. In a scratch copy (keep a clean copy of
each file in `$S`, restore it after; never commit debug lines), add env-gated logs:

- every candidate of every try: its kind (first, sweep, in columns, made roomy…), how far it got
  (prepared, placed, routed, finished), how long, and whether it became a fit;
- every design variant: its family, whether its core is new or alike one built, whether the
  design kept it, whether a layout used it;
- for Maximize: each try's Count, outcome, seconds, and whether it changed the bounds.

Then sort the work into what the final layouts are made of and what they never use. ADR 0058's
kinds, a checklist to look for again:

- **Alike, done again**: cores alike field for field; the same designs designed again by a try
  like one before; the same spots checked again; candidates that place alike.
- **Done in full, then thrown away**: layouts finished and then passed over for starving as
  routed; every design routed to choose one; a splitter with no room found only after full
  routing (0059).
- **Cannot succeed**: fallbacks that never made a fit (count across runs before cutting one);
  ways of columns wider than the City Block; a phase that cannot fix what it retries (0056's
  sorting); tries above a jump in the chain (0068: print `planSubBlocks` at n, n+0.5, n+1).
- **Waiting**: workers idle while one try runs its whole budget (0060); a try that can no longer
  tell anything still running; Annexes waiting on tries that cannot change the best.

Write the cause in one sentence, with its number ("3,374 of 4,522 cores were alike one built
before"), before changing code.

### 4. Change

- Smallest change that removes that cause. Same-work changes first.
- A cache or memo is keyed by **everything** the cached work reads: catalog, City Block size,
  Fixtures, seed, logistics, chain entries, Precheck (ADR 0058 `keptDesigns`, 0077 Bands' cache).
  A key missing one input passes on one setup and breaks in-process runs laying out several.
- Keep the random stream: work skipped must not change what is drawn after it, or draw on from
  where the skipped work left off (0058's kept designs). Otherwise hashes differ and the change is
  a schedule change.
- Any loop that can grow (backtracking, retries, enumeration) has its deadline inside it and a
  step count, not only pruning (0049, 0055).
- Prefer a bound that says "none fits" at once (0058's Layers width bound) over a faster walk of
  what cannot fit.
- Match the code around it: ES modules with JSDoc, `npm run typecheck` clean, comments in the same
  voice naming the ADR, Glossary terms (`CONTEXT.md`).

### 5. Verify

1. **Same layouts** (same-work changes). Side by side with a HEAD worktree:

   ```
   git worktree add $S/base-tree HEAD
   npm run suite -- --tier fast --root $S/base-tree --out $S/A.json &
   npm run suite -- --tier fast --out $S/B.json
   node $SP/scripts/speedcmp.mjs $S/A.json $S/B.json
   ```

   Every row `same layout`. One `DIFFERS` means the change is not pure: find why (a random
   stream, a cache key, an order of iteration) or treat it as a schedule change. For one setup,
   `maxdet.mjs` on both roots: the `END` hashes match.
2. **What is timed off it.** Budgets derive from timings: a try's candidates get twice as long as
   designing took (search.js `LAYING`, 0059). A faster phase can shorten another and lose a fit
   on the page (0059: molybdenum oxide 3 → 1 + 1 furnaces). grep for what reads the time of the
   part you sped up.
3. **Page-like wall clock.** `run.mjs` on both roots at the same time, same host, same seed,
   `--parallel` equal on both (and say how many). Compare `rate`, `secs`, `bestAtS` with
   `compare.mjs`. Under load, 10 s tries come and go (0072): trust maxdet over one wall-clock loss
   on fast tries, and say the load.
4. **Schedule changes**: the full suite (`--tier full`) with no LOSS. A suite LOSS from a changed
   path (0075) is checked with `maxdet.mjs` events side by side and a page-like A/B before it is
   called luck. Watch what the later phases lose when an earlier one finds more (0060's kicalk:
   more machines first, less Annex room).
5. **Memory**: a try of titanium plate's 21 Sub-Blocks holds about 0.6 GB; anything kept between
   tries (caches) multiplies by the tries at once. Check the peak (`/usr/bin/time -v`) on the
   biggest setup.
6. **Tests**: the targeted file first (`node --test tests/search.test.js`, `session.test.js`…),
   `npm run typecheck`, then `npm test` in the background (about 20 min). Add a test where the
   change has behaviour of its own (a bound says none at once; a cache gives the same as without).
7. **The page**: worker messages carry what jobs carry. A change to session.js, jobs.js,
   runners.js, worker.js or parallel.js gets the browser check (memory: ui-browser-testing).

A change is kept only if it saves time and loses no layout (same work) or no rate (schedule).
Otherwise revert it and record why in `lessons.md`.

### 6. Iterate

Back to step 2 with the new profile: the sink moves. Stop when the user's target is met, the
largest remaining share is work the layouts use, or the next cut needs a design change too big
for this pass (name it as "Still:").

### 7. Document, commit, push

- **ADR** `docs/adr/NNNN-<slug>.md` in ADR 0058's shape: the user's rule; how it was measured;
  "Where the time went" table; "What was never used"; `What changed:` bullets naming each
  `file.js` `function`; side-by-side tables (maxdet: before/after seconds, "every event and
  layout the same"; wall clock: rate, best at, done at); "Tried and dropped"; tests; `Still:`.
- **lessons.md** (tune-layout's, one file for both skills): a row in "What worked" and a line for
  each failure, with the ADR.
- **PRD.md** `## vNN: <Name> (implemented)`; **CONTEXT.md** only for a new term.
- **suite.json**: `npm run suite -- --tier full --record` so the recorded `secs` are the new
  ones (and any new layouts of a schedule change). Commit it with the change.
- Commit without asking (standing rule): one long subject line in `git log`'s style, the result
  in parentheses with setups and seconds; then the session's attribution trailers. Push. Report
  the hash.
- `git worktree remove $S/base-tree`.

### 8. Report

Tersely: seconds before → after per setup (and the suite's total), same layouts or which
changed and how, the causes cut, what still dominates, the commit.

## Open leads (from the ADRs' "Still:")

- Routing the links of candidates that fail: most of titanium plate's tries, 13–36 s a candidate;
  many fail on one Supplied Item's way to its belt (0058).
- Fallbacks where no byproduct is tapped, tried every try: none made a fit in 0058's runs.
- Layers weighs up to every way of ten Sub-Blocks for each candidate, each way measured afresh
  (0058).
- Bands' first look designs each Sub-Block's two-row Part anew for every Count and row: two
  minutes in molybdenum oxide (0058).
- Each try in a worker designs its Sub-Blocks itself: kept designs are a worker's own (0060). An
  Annex costs a whole Maximize, its tries each designing every Sub-Block again (0049).
- A try under way that cannot fit is stopped only once another's outcome says so: titanium
  plate's tries at 20+ casting units run their 1000 s (0060).
- In a City Block with Fixtures, Annexes wait for the first layout's last tries (0060).
- Candidates' time is "twice as long as designing": a measure of the chain's size, not of what
  its candidates need (0059).
- Kicalk/vrauks Maximize climbs one machine a try: the Foretelling learns from a box spanning the
  block (0024).
- One Item a Belt: titanium plate's one-machine try 7 → 687 s to its first layout, most
  candidates finding no path to the east edge (0066).

## Pitfalls

- **`pkill -f` / `kill $(pgrep -f …)` in one command kills your own shell** when the pattern is
  in its command line. List PIDs in one call, kill by number in the next.
- **Profiles of worker threads** are one file per thread: profile `suite-one.mjs` (in-process),
  not `run.mjs`, unless the question is the workers' schedule.
- **Wall-clock budgets hide speed-ups**: a faster try with a 1000 s budget that fails still takes
  1000 s. Measure fixed work (K candidates) for speed, wall clock for what the page shows.
- **A rate gain from a speed-up on the page is real** (more candidates in the budget), but name it
  as that, not as a layout improvement, and show the same-K hashes alongside.
- **Do not change rates or rules the user set** to save time.
