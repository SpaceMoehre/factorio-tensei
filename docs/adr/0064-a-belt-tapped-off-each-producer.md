---
status: accepted — refines ADR 0041, ADR 0052 and ADR 0054
---

# A belt tapped off each producer: a step takes a byproduct on several belts

Py coke, maximized in a 116² City Block among 32 Fixtures (Buffer 4): quenching towers, the chain making its red-hot coke in BOFs from its own coal (crushers, screeners, crushers), General Uses turning the coal byproducts into red-hot coke, the coke oven gas into flue gas, the flue gas into ash. The page's best was 2520/min: three chains of 3, 3 and 1 quenching towers (the first layout and two Annexes), each with its own crushers, screeners and BOFs.

The user's rule: compact them together, one chain with more lanes in and out of its Sub-Blocks, rather than many small ones.

Causes found in the tries above 3 quenching towers, which every one failed:

- **One belt where the BOFs take more than a belt.** The coal Use's BOFs take the crushers' coal and the screeners' (a Supplied Item joining the crushers' belt, ADR 0041). That belt also carried the crushed coal into the screeners and the coal dust to the train: one belt through two Sub-Blocks, which never splits into parallel belts. At 4 towers the BOFs take 1173/min of coal on it, at 5 1466: "every design starves (566/min short)". A byproduct is tapped off its producers' belt to its Use (ADR 0054), but not where another's joins that belt.
- **Copies in columns never chained.** Copies of one Sub-Block standing in several columns cross from one column to the next, both running west to east (makeInstances); `chainable` held every copy of a Sub-Block to the rule of one stack, so none chained across: "no belts chain crushed-coal's machines to coarse-coal's".
- **A sorted-out byproduct's belts planned short.** An Internal Path's belt was planned for what its consumers take, the byproduct sorted out after the producers, and what is tapped off them, left out (`along` 1, `pathWants`): a run of crushers making 3.3 times the crushed coal the screeners took looked enough, no splitter evened the belts, and the screeners starved 35/min.
- **Tapped filter splitters taken for a sorted-out byproduct's** (compact.js `mergeByproducts`): a belt carrying its byproduct on through its consumers was merged into another as if its tap were its sorting splitter, cutting the belt past the screeners off ("no inserter moves route … into machine"). And a merging belt's way could pass over the tile its splitter then took ("transport-belt overlaps splitter").

What changed:

- **A belt tapped off each producer** (flows.js `buildFlows`, given what a belt carries): where a step takes more of a byproduct than a belt carries, it is tapped off even where a Supplied Item joins its producer's belt, and the Supplied Item is tapped off its own producer's belt onto a feed of its own. The step takes it on both: each feed a belt past every machine (routes.js, one per edge), each machine taking from either. Below a belt, as before (the first layout at 3 towers stays as fast to find).
  - core.js `routeItems`: a feed tapped off one of several producers brings its share (its rate); the inserters' supply records it (`portion`), and sim.js `inserterStarvation` counts that share. compose.js: each feed's demand and `share` its part; `supplyOf` keeps the feeds apart.
- **compose.js `chainable`**: copies in different columns chain west to east, as in separate stacks.
- **compose.js `along`, design.js `pathWants`**: a run of producers brings what its consumers take with all that rides along up to where it leaves (a byproduct sorted out, an item tapped off).
- **compact.js `mergeByproducts`**: only a belt's own filter splitter (`filter`) counts, and a way passing over its splitter's tiles is no way.

| Py coke, 116², Maximize, 3 tries at once, 1800 s | Before | After |
|---|---|---|
| Rate | 2520/min | 2880/min |
| Quenching towers | 3 + 3 + 1 (three chains) | 5 + 3 (two chains) |
| First layout | 3 towers at 6.5 s | 5 at 143 s |
| Bounds | 110 × 110 | 110 × 107 |
| Machine share of the room | 0.275 | 0.303 |
| Best at | 677 s | 1193 s |

The BOFs of the 5-tower chain take their coal on two belts, one from the crushers' filter splitter and one from the screeners'. Single tries: 4 and 5 towers fit in 15 and 29 s (before, never); 7 still fails, every crushers' design short of the screeners' runs.

Py small parts in 100² (Maximize, side by side): 2775/min, 5 machines, the same layout. Py molybdenum oxide among roboports (1500 s, side by side): 662.47 → 599.98/min, byproducts riding 19 → 9. An Annex of 2 riding its byproducts reached 799.98 at 508 s; its own sorting phase then kept one that sorts them out with 1 machine (ADR 0052's rule: fewer machines rather than riding), which judging sorted paths by what they carry now finds.

Tests: Py coke at 1440/min: the BOFs' coal on a feed tapped off the crushers' belt and one off the screeners', both at most a belt; a layout without Starvation, valid.

Still:
- Belts out of a Sub-Block still carry several items: the quenching towers' coke and coal dust to the train, the crushers' and screeners' coal dust riding on through their consumers in Maximize's tries (the user's new rule: one item a belt).
- 7 towers in one chain: the crushers' copies cannot be cut to match the screeners' runs (whole machines, no splitter evening a path that sorts a byproduct out).
