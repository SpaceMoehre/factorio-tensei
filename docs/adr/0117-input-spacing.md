---
status: accepted — refines ADR 0114 and ADR 0087
---

# Input Spacing

The user's rule: the input lines need to be more evenly separated; with more than one Input Side, the inputs are shared among them so each side takes as even an amount as can be, without infringing on the layout.

Each belt from the train came in across the tile of its Input Side nearest its entry (ADR 0114): those to one row of copies side by side, a dozen rows to the next. Py iron plate 900/min in 150 stone furnaces, 17 ore and coal belts down the west edge of 46 rows: at rows 3 4 5, 16–21, 32–36, 42, 47 48 (gaps `1 1 11 1 1 1 1 1 11 1 1 1 1 6 5 1`). With several Input Sides, each line took whichever side it reached soonest, so one side could take nearly all.

What changed:

- **Spacing, on the layout shown** (compact.js `spreadInputs`, `spacedInputs`, `inputPlaces`). On each Input Side, its belts from the train in their order along it, each gets its place: the middle of its equal stretch of the side. A belt away from its place has its first stretch (up to where anything takes from it or it forks; up to 12 places to join it again) routed again from the side's free tiles nearer its place, each tile from it 2 dearer (more than a tile of belt), kept from the nearest; the new stretch keeps off the other belts' places. Again while any moves (three passes): one that found no way may find one once others moved. The poles are taken up first and placed again after (they stood where spaced belts would go), the belts straightened; the farthest from its place first and the nearest first are both tried, the nearer in all kept. Nothing else moves: the machines, the other belts, the block's size stay as they were.
  - Where: each layout a search yields standing on its own (search.js `spaced`: kept where valid and starving nothing more), and the layout Maximize ends with (compact.js `tidyBelts`, maximize.js `tidied`, ADR 0087). The search ranks and Maximize builds on the layouts as routed.
- **Sharing, when the links are routed** (sides.js `shareSides`; compose.js `linesOf`, `trainLink`). Only with several Input Sides. Each line from the train (a belt into its first copy, a Fan-out's belts one line; a pipe not on an Input Side's edge already) gets a side: the largest first onto the side taking least so far, by rate, belts and pipes apart (the nearest of those alike); then two lines on two sides change places where the loads stay as even and their way in is shorter. A belt starts from any tile of its side, a pipe's source leg likewise (router.js `routePipe` `inStarts`); where none finds a way, from every tile of every Input Side as before.
- router.js `search`: a start may carry what starting there costs (`g`).
- **A try stopped before its worker took it no longer ends the Maximize** (jobs.js `runJob`, its tries' pool). Found on the user's setup run headless (Py reo, cobalt extract and tinned cable among 32 poles, 116², input and output left and up, two tries at once): a try begun and stopped in one turn found its worker stopped and threw; nothing waited for it, and under Node the unhandled rejection ended the worker thread running the whole Maximize. The run stopped at 1,295 layouts, "the worker was stopped", its later phases and the layout shown (turned round, tidied, spaced) never reached; it ran to 4,399 when the timing missed it. A stopped try's error is now no failure. (A web worker outlives an unhandled rejection: the page did not stop.)

Tried and dropped:
- **Places planned when the links are routed** (each belt from the train started from its place, the other places kept free). The routing room is wider than the block, and squeezing takes its empty rows out after: places spread over it came out bunched again. Spread over the copies' own extent, most belts started at their place and squeezing still took out the rows between them (gaps `1 6 5 2 1 3 2 4 5 1 1 2 1 6 3 3`). And it moved every layout's routing.
- **Spacing every finished block** (`finishBlock`). In a City Block Maximize lays an Annex beside a layout as routed, and spaced belts took room it had found: the full suite lost a machine in five setups (hot air 2 → 1, perylene 11 → 10, rayon 10 → 9, titanium plate 15 → 14, small parts 2 9 → 8; small parts 2's first layout spaced, its try at 9 then failed). Standing on its own, spaced belts are longer and the search ranked by them chose another layout (vanilla gears, cables and petroleum gas: one whose Sub-Blocks' boxes overlap). Spacing changes how a layout looks, not what it is: only the one shown.
- **Spacing with the poles standing, one order**: the page's layout kept four belts in four rows (`17 18 19 20`).

| Py iron plate 900/min, stone furnaces, west in | Before | After |
|---|---|---|
| Page's layout (81 × 46; K 100): rows of the 17 belts from the train | 3 4 5 16–21 32–36 42 47 48 | 3 4 9 12 15 17 19 20 26 28 31 34 36 39 42 44 47 |
| gaps | `1 1 11 1 1 1 1 1 11 1 1 1 1 6 5 1` | `1 5 3 3 2 2 1 6 2 3 3 2 3 3 2 3` |
| Suite's (K 20, 25 × 105) gaps | `11 1 11 1 …` (pairs) | `6` each |
| Rate, machines, size, valid, starving | 900/min, 150, as before, yes, 0 | the same |

| Same, input left and up (K 100) | Before | After |
|---|---|---|
| West: 8 belts at | 1 12 15 26 31 32 43 44 | −3 3 9 15 20 26 32 38 (gaps 5–6) |
| Top: 9 belts at | 24 25 26 27 50 54 55 56 58 | 4 13 21 30 39 48 57 65 74 (gaps 8–9) |
| Rate, valid, starving | 900/min, yes, 0 | the same (79 × 46 for 78 × 46) |

| The user's: Py reo, cobalt extract, tinned cable among 32 poles, 116², input and output left and up (page-like, two tries at once) | Before | After |
|---|---|---|
| Rate, machines | 180/min, 3 (the run ended at 1,295 layouts: "the worker was stopped") | 180/min, 3 (to its end: 2,711 and 4,399 layouts in two runs) |
| Top: 5 belts at | 11 51 52 89 92 | 15 37 59 81 103 |
| West: 5 belts at | 47 48 67 68 100 | 15 37 59 80 103 |
| Belts, pipes a minute: west, top | 3360, 10080; 3420, 10800 | the same |
| At one machine (K 4): pipes a minute, west and top | 0, 4347 | 2098, 2248 |

| Vanilla iron plate 900/min, stone furnaces, input left and up (test) | Before | After |
|---|---|---|
| Brought across the west, the top a minute | 935, 30 | 825, 140 (the ore one Fan-out line) |

| Suite (K 20, seed 1) | |
|---|---|
| Full tier, 22 setups | every rate the same; layouts the same, or the same but the belts from the train spaced (the shown layout's) |
| New: the user's setup (reo-cobalt-tinned-116) | 180/min, 3 machines, valid, starving 0 |
| Time | the same side by side (advanced circuits 339 vs 340 s); spacing a layout well under a second |

Tests: the belts from the train come in evenly along their side (gaps differ by 2 at most; vanilla iron plate 900/min, five belts, gaps `5 8 5 13` before); `shareSides` gives two sides alike lines two each, the nearer to each; with the west and top open each takes some of the train's belts; with every side open more than one does (input-output-sides.test.js). The test that no belt from the train ran longer with every side open than from the west alone (ADR 0114) is gone: sharing may send a line to a farther side.

Still:
- A belt whose way from its place is shut stays where it was: the page's layout has three columns west of its furnaces, and two of its 17 belts stand three rows off their place.
- Pipes from the train are shared among the sides but not spaced along them.
- A Fan-out's belts count as one line, whatever it splits into: the sides' loads are only as even as the lines allow (vanilla iron plate, west and top: 825 vs 140 a minute, one ore line).
- A build in a City Block (Maximize off) and a layout the user edits are shown as routed, not spaced.
- A line that finds no way in from its own side comes in across the nearest, as before: the user's setup at one machine brought 1130 belts' worth a minute across the west, 281 across the top.
