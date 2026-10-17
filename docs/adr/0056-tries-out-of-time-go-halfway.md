---
status: accepted — refines ADR 0030, ADR 0048 and ADR 0055
---

# Tries that run out of time go halfway down

ADR 0055 left Py titanium plate (21 Sub-Blocks in an empty 236 × 236 City Block, 1000 s a try) with two limits. The user asked for both to be fixed.

- Maximize spent half an hour or more before its first fit. After 26 casting units failed it tried 13, then 12: each try ran its whole budget and then a retry with spare machines as long again. A try running out of time counted as one that starved, so the next was the number just below it.
- Layers puts a deep chain in a column per level. In one band of columns the Sub-Blocks spanned more than the block's width, while two thirds of its height stayed empty.

Causes:

- **The tries run out of time routing.** No Count above 11 fitted in its budget. In the try at 12, the candidates placed one by one failed on links between Sub-Blocks with no path (26 of 80), the overflow waste's pipe (16), and Supplied Items finding no way to their belt (24). Seven found no room. The first layout without Starvation, found with no time limit, was passed over: two of its byproducts tapped off to their Uses (ADR 0054) found no room for their filter splitters.
- **The retry doubled each try.** Its search had ended for want of time, so the same try with spare machines (ADR 0048) faced the same links, and took as long again.
- **A sorting phase that could not sort.** After the best fit, Maximize tries the highest that fit again with its byproducts sorted out, then up to two fewer machines (ADR 0030, ADR 0052), each with the whole budget. Here the one riding belt was the solid separators': concentrated titanium for the foundries with nexelit ore and iron oxide, both on to the train. A filter splitter sorts one byproduct out of a belt, so no layout sorts these. The three tries took 3087 s and changed nothing.
- **The number just below came next.** That suits Starvation, which comes and goes with the Count (ADR 0023). A try that ran out of time says the links got too many to route in time; one machine fewer seldom routes in time either.

What changed:

- **No spare machines after running out of time** (maximize.js `attempt`). A try whose search stopped for want of time (`timedOut`, now passed on by `once`) is not made again with spare machines.
- **No sorting phase where nothing can be sorted** (maximize.js; score.js `riding`). It runs only where a belt rides one byproduct alone. `riding` lists each belt's byproducts riding on, and `rankOf` counts its belts as before.
- **Halfway down after running out of time** (maximize.js `planner` `record`). A try that ran out of time counts as the second in a row that starved: the next try is no more than halfway down, as after one that found no room. It still bounds the tries no more than one that starved: the numbers above it are tried again once those below are done.

| Py titanium plate, 236 × 236, Maximize (1000 s a try) | Before | After |
|---|---|---|
| Tries | 26 ✗ 173 s, 13 ✗ 2050 s, 12 ✗ (stopped) | 26 ✗ 141 s, 13 ✗ 1020 s, 7 ✓, 12 ✗ 1008 s, 10 ✓, 11 ✓, 11.625 ✓, 11.94 ✓, then Annexes |
| First fit | none in 3000 s | 2625/min at 1190 s |
| Best | none | 8226.56/min at 3625 s (22 casting units: 11.94 and an Annex of 10; stopped while still climbing) |
| Room empty | — | 29,814 of 51,984 tiles |
| One try at 12 casting units | 1312 s (with its retry) | 693 s |

Without the sorting gate, the same run spent 3087 s after its best first layout (4476.56/min at 2640 s) on sorting tries, and reached no Annex in 5700 s.

Py molybdenum oxide among roboports (`--total 2400`, side by side, nothing else running): 662.48/min both ways, the same layout (3 furnaces and an Annex of 1), its best at 704 s, not 961 s. Run beside two others, one run had stopped at 462.49 and the other at 599.99: its tries of 10 s come and go with the host's load. Py small parts in 100²: the same layout. Py titanium plate at 1800/min on its own builds without Maximize.

Tried and dropped:

- **Banded Layers.** Where no way fits the width, the Sub-Blocks stood in two bands of columns, the levels nearest the Goals above. At 12 casting units Layers still fitted no way: the casting units (18 × 119) and the grade 1 screeners (22 × 132), each one module of all its machines, did not fit one band above the other. At 11 the try found the same layout as without bands (4125/min, 228 × 149), in 183 s, not 124 s. At 12 neither fitted.
- **Tapped byproducts and Supplied Items routed among the links between Sub-Blocks**, not after every other link. At 12 casting units neither variant fitted within the budget (out of time; a layout starving 20/min).

Tests: a try that ran out of time is followed by one no more than halfway down, and bounds the tries no more than one that starved; byproducts riding on are told by belt, two on one belt from one alone.

Still:
- A try that fails takes its whole budget: above 11 casting units every candidate's links fail or run out of time, and the search goes on until the budget is spent.
- The casting units and the grade 1 screeners each stand as one module of all their machines in a row, as tall as half the City Block. They leave its height unused and Layers no way to fit. Copies of a smaller module would fit, but designs are ranked by their own area, not by how they pack (ADR 0053).
