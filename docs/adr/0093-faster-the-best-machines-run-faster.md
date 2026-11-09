---
status: accepted — refines ADR 0015 and ADR 0072
---

# Faster: the machines of the highest that fit, run faster

The setup: Py wood (wood processors from logs, 60/min asked) in a 116 × 116 City Block among 4 roboports, Buffer 4, Maximize. The page: 1048.7/min (3.625 wood processors), "1337.9/min does not fit: no room for moss". The chain is 7 deep (water, soil, muddy sludge, moss, seedlings, logs, wood) and 87 machines.

How it was found: the room left (6435 tiles empty) said more fits; every try above 3.625 failed. At 3.9375 (Filling's last step) and 3.75 the search found no layout in 3300 candidates, starving ones allowed: placement, not designs. Moss's first design (36 farms in a row, 108 × 15) never stands (a Sub-Block fed by others keeps a column west of it per link: 108 + 1 + 3 > 110), and the rest find no room one by one; Layers cannot hold a chain 7 deep in 110 columns. Excluding that design, Turning in the main tries and 200 times the Backtracking each moved the failure to another Sub-Block, no fit. But 3.6875 and 3.694 have exactly the Sub-Blocks of 3.625 (each Count rounded up), and fit in 5 s: Filling stopped at 0.3125 more (a quarter machine its least), never trying them.

What changed (maximize.js `planner`):
- `uncapped`: once Filling has no step left, Faster: the highest n whose Sub-Blocks need the machines of the highest that fit (`sameTop`, a bisection on `countsOf`), a thousandth short of it (`SAME_SPARE`: at the top one machine runs at full speed and no layout of it stood without Starvation, 3.696 against 3.694); where that does not fit, halfway down, while the step is an eighth of Filling's last at least (`FINER`). Not in an Annex (whole machines).
- `same(n)`: whether n needs no machine more than the highest that fit. A miss of it (`misses[].same`) is no reseed's (ADR 0090), no starving try's (ADR 0057) and not what the summary says does not fit: it tells nothing of more machines.

| | Before | After |
|---|---|---|
| Py wood 116², page-like, side by side | 1048.66/min (3.625), 672 s | 1068.14/min (3.692), 709 s |
| Suite wood-116 (new, 20 candidates a try) | 1048.66/min | 1058.4/min |
| Suite silicon 116² | 675/min | 687.56/min, the same layout |
| Suite rayon 116² | 496.87/min | 499.7/min |
| The other 14 setups (full tier) | | the same layouts and rates |
| Full tier time | | 975 s, 4 at once (each setup 1.3–2× its recorded seconds, recorded under other load; the layouts the same, so the cost is Faster's one to three tries) |

Still: the wood block's next machine. 3.9375 and 3.75 find no room one by one: the placer stands each Sub-Block west of its consumers, near them, greedily; moss's 36 farms in two rows are too wide once its links' columns are kept, its other designs leave soil (28 × 50) or muddy sludge (25 × 49) no spot. A packing that weighs where the big Sub-Blocks go together (or Turning in the main tries, routed after) would be needed.
