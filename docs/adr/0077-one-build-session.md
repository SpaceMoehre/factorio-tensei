---
status: accepted — refines ADR 0013, ADR 0060, ADR 0073
---

# One build, the page's and the suite's

The regression suite (ADR 0073) is what every change since has been measured against. It said it ran each setup "as the page runs it", and it did not. The page's build lived in app.js, among the page's controls. The tune-layout runners each had a copy of their own:

- **The page** (app.js `build`) designed each Sub-Block in a worker of its own (seed + its index), then ran both Strategies side by side from those designs (ADR 0013). In a City Block a build found no layout in, it filled the block up to the Goals instead.
- **suite-one.mjs** ran one `search`, the `search` Strategy only, designing every Sub-Block from one random stream, and never filled up.
- **run.mjs** forked a child for each Strategy, each designing for itself, and only logged "rerun with --mode maximize --upTo" where the page would fill up. It also left out the page's default logistics.

So what the suite measured for a build was not what the page built.

What changed:

- **The Build Session** (session.js `buildSession`): the one place a build runs, from a setup to its events: `start` (Maximize or a build, upTo, the job the moves lay the block out again from), `designing` and `designed`, `searching`, a Maximize's `foretell` and `try`, each better layout (`best`) and `done`. It chooses the mode, designs each Sub-Block, runs the Strategies side by side, keeps the best, and fills a City Block up to the Goals where a build finds none. The page, run.mjs (auto and build) and suite-one.mjs all run it.
- **Runners** (runners.js): where its jobs run. Each worker runs one job after another: a web worker on the page (worker.js), a worker thread in node (node-runner.js), or in-process (`inlineRunner`). jobs.js holds what a worker runs (a search, a Maximize, a design, a try, a move), whatever the worker is. A Maximize's Tries at once (ADR 0060) take their workers from the same runner.
- **The suite runs the page's path in-process**, one try at a time (Tries at once: 1, as before: the page's width depends on the host's cores, which "the same on any host" cannot) and K candidates for each Strategy.
- **The setup is read in one place** (setup.js `setupOf`), defaults and all, by the page and by every runner: the Goals, the **Chain Choices** (CONTEXT.md), the logistics, the budget and the City Block.
- **A candidate is laid out in one place** (layout/lay.js `layOut`): routed, its fallbacks tried, belts chained where a splitter finds no way, then finished, checked and scored. Before, the search, Bands and the user's moves each had a copy, each reading the routing errors' flags in its own way. Each still has its own ladder of fallbacks, passed in as data: they differ on purpose (ADR 0054, 0057, 0058, 0059). A failure reaches the caller as a hint (room round these Sub-Blocks, place this one first, no columns, a pole), never as the error itself.
- **The score has named parts** (layout/score.js `scoreOf`, `compare`, `better`, `RANK`), not a tuple read by position. Before, it was compared in four places.
- **Bands' design cache keeps City Blocks apart**: by catalog, and by the City Block's inner size, whether it has Fixtures, and the seed (all that the designs depend on). An in-process run laying out several City Blocks would otherwise reuse one block's designs for another. No run did that before; the inline runner can.

| The suite, both tiers | Before | After |
|---|---|---|
| The 14 Maximize setups | recorded | the same layouts (2068 s at 4 at once) |
| small-parts-100 (a build in a City Block) | `search` alone, 60 candidates | both Strategies from designs made apart, 120: the same layout |
| titanium-free (a build) | `search` alone, 10 candidates: no layout | both Strategies, 20: no layout (another failure first) |

The two builds' records were taken again: their candidates count both Strategies now.

On the page (headless, before and after, the same setups): a build of electronic circuits gave the same 12 × 14 block; in a 40 × 30 City Block, Maximize reached the same 540/min in 327 layouts; Goals foretold not to fit filled it up.

Tests: session.test.js (a build's events in turn, each layout better than the last, the same every time with a candidate count, no worse than the search alone; a Maximize's fits; filling up where the Goals are foretold not to fit; nothing after a stop; a web worker's events until it ends, and an error); setup.test.js (defaults, settings the catalog no longer has, Goals left out, the City Block); score.test.js (`compare`, `better`, `scoreOf`).

Still:
- run.mjs `--mode maximize` and `attempt` call maximize.js directly, for their flags. Auto and build run the session.
- A run whose `--root` is a worktree from before this change has no session.js, so auto and build fail there. Compare two worktrees that both have it.
- When two Strategies find equally good layouts, the page keeps whichever came first. The suite's in-process runner always takes them in the same order.
