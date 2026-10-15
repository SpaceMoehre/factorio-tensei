---
name: tune-layout
description: Take a user's factory setup (the page's saved state JSON, optionally with a City Block blueprint), run it headless as the page would (build / Maximize / one try), measure and draw the result, find why room stays empty or the rate stops short, and improve the layout algorithms cause by cause with A/B evidence, tests, an ADR and a commit. Use when the user hands over a setup and says the result is not maxed, too loose, too slow, starving, or asks to improve the search/Maximize on it.
---

# Tune Layout

The goal is to improve the layout algorithms (`js/`) on a real setup until its result is as good as the search can reasonably get it. The output is a measured gain, reached cause by cause, documented the way this repo documents changes.

The setup decides the target. The user's complaint (for example "not maxed, put the chains closer, sacrifice 2–3 buildings") is a rule to build and test, not a vague wish.

**Read `lessons.md` (next to this file) before anything else.** It says what already worked, what was tried and reverted, and the rules every change keeps. Do not repeat a reverted idea unless you can say why it differs this time.

## Tools in this skill

`$SKILL` = `.claude/skills/tune-layout`. `$S` = the session scratchpad. Put every output there, never in the repo.

| Script | What it does |
|---|---|
| `node $SKILL/scripts/run.mjs <setup.json> [--mode auto\|maximize\|build\|attempt] [--n N] [--budget S] [--total S] [--root DIR] [--out DIR]` | Runs the setup as the page does (auto). Logs each event and writes `log.txt`, `best.json` and `summary.json`: rate, goal machines, Sub-Blocks, valid, starving, byproducts riding, room empty, machine share, tries with ✓/✗ and seconds. |
| `node $SKILL/scripts/draw.mjs <best.json> <out.png> [scale]` | Draws the layout as a PNG: Fixtures grey, each Sub-Block's machines a colour labelled `index item ×count`, belts yellow, pipes blue, splitters red, the Buffer outlined red. Then Read the PNG to look at it. |
| `node $SKILL/scripts/compare.mjs a/summary.json b/summary.json …` | A table of those summaries side by side. |
| `node $SKILL/scripts/ascii.mjs <best.json> x0 y0 x1 y1` | A region as text, tile by tile: quicker than a PNG for one belt's shape. |
| `node $SKILL/scripts/loops.mjs <best.json> [pieces]` | Belts turning 180° or more just after a splitter (ADR 0051). |

The probes below go one level under a failed try. Each takes the same setup file, `ROOT=` for another repo, and `[spare JSON]` (for example `'{"soil":240}'`) to give a step spare output.

| Probe | Answers |
|---|---|
| `node $SKILL/scripts/designs.mjs <setup> <n> <item> [count] [spare]` | A Sub-Block's design candidates: core or copies, size, trouble (Starvation), each part's machines and drops by lane, and whether copies alternate with a reverse. Use it for "every design starves" or "no design without starvation fits". |
| `node $SKILL/scripts/trace.mjs <setup> <n> [secs] [spare]` | One try's search: every candidate's failure counted with its design choice and columns, and each layout found with its Starvation. `PERFECT=0` also counts starving layouts. |
| `node $SKILL/scripts/place.mjs <setup> <n> [spare] [choice] [columns]` | Placement alone: each Sub-Block's stack size, and whether one-by-one placement and Layers find room. Use it for "no room for X" or "fit no columns". |

**A try that runs long or never returns:**

```
run.mjs … --profile-slow 300 [--profile-for 60]
```

The run goes under V8's tick profiler. Once a try has had no event for 300 s, the next 60 s are written to `<out>/slow-<k>.txt`: the functions taking the time, and the bottom-up callers.

- The inspector can't be used for this: the main thread never yields inside a try.
- Read the profile before guessing. ADR 0049's hung Annex tries were all in Placement's backtracking, not routing.

The search in a Maximize try (`perfect`) passes over candidates silently when a chosen design or the prepared layout starves (search.js `if (!ready)`, `ready.least`). To see those, add a temporary env-gated `console.log` there, and for which route starves, in compose.js `leastStarvation`. Keep a clean copy of the file in `$S` and restore it after; never commit the debug lines.

`attempt --n N [--giving] [--unsorted]` runs one Maximize try at N of the first Goal's machines. It prints the failure message, which names the Sub-Blocks or links that failed. This is the main diagnostic.

Reference setups in `$SKILL/setups/` are for regressions:

| Setup | What it is | Exercises |
|---|---|---|
| `kicalk-roboports.json` | Py kicalk 400/min, 236² among roboports and big poles, Buffer 4, fill-up | Fixture rows, Parting, Giving Way, Annexes. Slow: an hour or more in full. |
| `molybdenum-oxide-roboports.json` | Same City Block, Maximize | Byproducts, sorting, many Sub-Blocks |
| `small-parts-100.json` | Py small parts in 100², Buffer 3, few Fixtures | Busy belts, Layers, Filling. Fast: about 1 min to the best. |
| `titanium-free.json` | Py titanium plate 1800/min, standing on its own | Uses, Supplied Items. Known hard: may find no layout. |

## The loop

### 1. Take the setup

- The user pastes the page's state, or gives a file. "Copy setup" on the page gives the saved state plus `chain`, `foretold` and `result` (what their build said). The raw localStorage `factory-tensei:v1` works too.
- Save it as `$S/<name>/setup.json`.
- The City Block blueprint goes in `city.blueprint` (or a top-level `blueprint`). Keep `city.buffer` and `city.maximize`.
- `run.mjs` warns if a logistics key is missing. The page fills in defaults for missing keys, so set them explicitly to match what the user saw.
- Note the user's numbers: what they got (`result.status`, `result.subBlocks`), and what they believe fits.
- A setup's `logistics.budget` is each try's seconds. The page's 1000 lets a single Maximize try run for minutes; pass `--budget` to cap it for quick looks.

### 2. Baseline

- Check the load first with `uptime`. Budgets are wall clock, so a busy host finds less.
- Never use `ps` with full arguments: environments here have exposed secrets that way. Use `pgrep -f run.mjs`, which prints PIDs only.
- Run in the background:

  ```
  node $SKILL/scripts/run.mjs $S/x/setup.json --out $S/x/base [--total 900]
  ```

  Use `run_in_background`, then wait with an until-loop on `summary.json`, or with Monitor. While it runs, read the code paths involved.
- Draw `best.json` and look at it. Compare the result to the user's numbers. A mismatch means the setup was not reproduced; fix that first.

### 3. Diagnose: find a try that should have fit

1. Say where room stays empty, and how many more machines it would hold. Use the PNG, `room.empty`, `machineShare`, and the Foretelling line in the log.
2. Pick the smallest Count above the best that the room says fits. Run it alone: `--mode attempt --n <N> --budget 60`.
3. Read the failure. Then go one level down. Write a probe in `$S` that imports the module concerned, for example:
   - `planner(...).goalsFor(n)`;
   - `search(..., { trace })` to log each candidate's error;
   - `placeBlocks`, or `designStep` for the designs and their sizes.

   Find the one concrete cause. ADRs 0019 and 0023–0025 show the level of concreteness: "a link took the tile another link of its route starts from".
4. Check whether the schedule is the problem instead: Maximize climbing one machine a try, a phase never reached, or tries timing out (`timedOut`) rather than failing.

Write down the cause in one sentence before changing code.

### 4. Change

- Make the smallest change that removes that cause:
  - add it as an option or candidate the search may choose (ADR 0004);
  - gate it to where it pays;
  - keep a fallback to the old behaviour.
- Check `lessons.md` "What failed" for the same idea.
- Match the code around it:
  - plain ES modules with JSDoc, and `npm run typecheck` must stay clean;
  - comments as dense and in the same voice (short sentences, Glossary terms capitalised);
  - name the ADR in the comment where the rule comes from.
- Use the Glossary terms (`CONTEXT.md`): Sub-Block, Copy, Module, Fixture, Making Way, Parting, Bands, Slot, Part, Nook, Annex, Filling, Foretelling.

### 5. Verify: A/B with the same load

1. Run the failing try again (`attempt --n N`). It should now fit, and be valid with no starvation.
2. Run a full A/B side by side, on the same host at the same time:

   ```
   git worktree add $S/base-tree HEAD
   node run.mjs setup --root $S/base-tree --out $S/x/A &
   node run.mjs setup --out $S/x/B
   ```

   (`HEAD` is the code before your change; commit nothing yet.) Then `compare.mjs`. Remove the worktree after (`git worktree remove`).
3. Regressions:
   - Run `small-parts-100.json` (fast) plus the reference setup that shares the mechanism you touched, A/B the same way.
   - A change that wins here but loses there needs a gate, not a shrug.
4. Tests:
   - First the targeted file: `node --test tests/city.test.js`, or whichever covers the module.
   - Then `npm run typecheck`.
   - Then the full `npm test` in the background (about 20 min, 262+ tests).
   - Add a test for the new behaviour. Use a small setup that shows it in seconds; `tests/city.test.js`'s `inBlock` helper and `tests/fixtures/` hold examples.

A change is kept only if it gains on the user's setup and loses nowhere else (or loses only time, said plainly). Otherwise revert it and record why in `lessons.md`.

### 6. Iterate

- Go back to step 3 with the new best. Each cause found and fixed is one bullet in the ADR.
- Stop when one of these is true:
  - the user's target is met;
  - the PNG shows no room a machine fits;
  - the next cause needs a design change too big for this pass. Name it as the "Still:" item.

### 7. Document, in the repo's own style

Read the latest ADR in `docs/adr/` and copy its shape.

- **ADR:** `docs/adr/NNNN-<slug>.md`.
  - Frontmatter `status: accepted — refines ADR …`.
  - The setup and its numbers.
  - The user's rule, if one was given.
  - `What changed:` bullets naming each `file.js` and `function`.
  - A before/after table: rate, machines, size, time.
  - `Still:`.
- **`CONTEXT.md`:** a Glossary entry for any new term, and the related entries updated.
- **`PRD.md`:** a `## vNN: <Name> (implemented)` section, and the Testing/limits lines it changes.
- **`lessons.md`:** what worked or failed here, one line each with its ADR. The skill learns this way.

### 8. Commit and push

- Commit without asking (standing rule). The subject is one long single line in the style of `git log`: what changed, then the result in parentheses with the setup and numbers.
- After a blank line, add the trailers given by the session's attribution reminder.
- Push. Report the hash.

### 9. Report

Tell the user, tersely:

- before → after (rate, machines, time);
- the causes fixed;
- what still limits it;
- the commit.

## Pitfalls

- **`pkill -f <pattern>` kills your own shell** when the pattern appears in that shell's command line, for example a path in the same command. Find the PIDs with `pgrep -f` (or `ps -eo pid,etime,pcpu,comm`, never with arguments) and kill those PIDs.
- **A try's failure message names only the last cause.** A Count often fails for several reasons in turn: designs starve, then belts don't chain, then the prepared layout starves, then placement. Fix one, then run the same try again. Expect three or four rounds before the try fits, each a cause and a bullet in the ADR.
- **Maximize on Fixture-heavy blocks can run for an hour.**
  - Use `--total` for quick looks, and attempts for diagnosis.
  - Keep the full run for the A/B.
  - Never start an identical run twice. Check `pgrep -f run.mjs` first.
- **One fit or miss at a Count proves little.** Starvation and routing come and go with the Count (0023). Look at neighbours (N−1, N+1) before concluding.
- **`attempt` passes `unsorted` only when you ask for it.** Maximize's tries run unsorted and sort once at the end, so diagnose with `--unsorted` to match. Above the highest count designed so far they also run the Precheck: add `--precheck` where Maximize fails fast and the attempt fits (ADR 0053).
- **Seeds are deterministic; wall clock is not.** A result that changes between identical runs points to load, not code.
- **Do not change rates or rules the user set** (selections, modules, belts) to get a better number. Improve the algorithm.
- **The page must still work.** Worker messages and `edit` fields carry new state (for example `edit.giving`). Check that moves, reshapes and turns keep it, and run the browser check for UI-visible changes (memory: ui-browser-testing).
