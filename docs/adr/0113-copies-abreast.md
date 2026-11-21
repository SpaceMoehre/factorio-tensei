---
status: accepted — refines ADRs 0044 and 0048
---

# Copies abreast

The setup (the user's, `/tune-layout`): Py advanced circuits, 60/min asked, among 8 roboports and their big poles in a 116² City Block whose snap grid spans 238 × 120 (buffer 4), out to the right, Maximize on; as ADR 0112's but inductors, ceramic, fiberboard, cobalt extract and methanal by train (18 Sub-Blocks). The Foretelling said 240/min (4 chipshooters); the page reached 60/min, one chipshooter (230 × 106): "120/min does not fit: belt 0: no path".

Cause: no design of two chipshooters or more routed, so every try above one machine failed before a candidate was laid out ("advanced-circuit: belt 1: no path to waypoint 3,10", tried 0). A chipshooter (5 × 5) takes eleven belts: twelve ingredients, two pairs merged off the train, and its output. Two machines in a row or a column share at most about eight belts (each machine's own band, the band or gap between them, belts beside them), so each of the five whole cores, its estimate starving nothing, failed once routed. Copies were never tried: a Sub-Block of under 8 machines gets them only where every whole core starves.

What changed:

- **Where no whole module routes though its core starves nothing, fewer machines repeat a module after all, a machine a copy too** (design.js `designOnce`, `copyCandidates` `abreast`).
- **Those copies stand abreast, a column each** (compose.js `makeInstances`: the design's `abreast`), none reversed. Their belts run west to east through every copy, so each leaves one copy straight for the next one's entry. In one column, as copies stand otherwise, a belt leaving a copy east must come round to the next one's west face, where all eleven belts of each copy enter: splitters forking belts to both copies found no room (74 of the 82 failures a trace listed at 2 machines; tried 375, none fitting).
- **Their module is the one with fewest Head-on Belts** (design.js `repeatable` `through`). A belt ending against a machine ends its run in every copy, so each copy would want a belt of its own (resistor2's).
- **Their estimate counts a run going on through copies abreast** (design.js `copiesUnfed`, `copiesShortfall` `abreast`): where its part runs through a copy, into the next, not a run of its own in each (as in a column where copies alternate with their reverse).

| Py advanced circuits 116², out to the right, one try at a time | Before | After |
|---|---|---|
| Design of 2 chipshooters | none routes | 2 copies of one machine abreast, starving nothing |
| One try at 2 machines | fails before a candidate (4.5 s) | fits at the 16th candidate (23 s) |
| Maximize (1000 s a try, side by side on a host loaded 11 on 8 cores) | 60/min (1 machine, 230 × 106), done at 1847 s | 159.85/min (3 machines: 2.66, 230 × 108), best at 1001 s, done at 4444 s (its tries above at 400–770 s each) |
| Valid, starving, byproducts riding | yes, 0, 0 | yes, 0, 0 |
| Suite (K 20) | 60/min (1 machine), 214 s | 159.85/min (3 machines: 2.66), 262 s |

| Suite | Seed 1 | Seed 2 |
|---|---|---|
| Fast tier, 12 setups | every layout the same | every layout the same |
| Full tier, 19 setups | every layout the same | — |

Tests: two and four chipshooters (no City Block) repeat a module of one, abreast, their belts running through every copy, starving nothing; they stand a column each, none reversed (copies-abreast.test.js).

Still:
- Maximize's tries above 2.66 machines run long (400–770 s each, 3500 s after its best), and three whole chipshooters' tries fail on links among the 18 Sub-Blocks (a belt finding no way, 416 candidates), four on placement (four copies abreast, 56 wide, find no room among the roboports).
- A stack of copies in one column forks an Internal Path's belt to a second copy only through a splitter east of the first copy's entry (compose.js `routeSplit` searches between the belts' ends): never west of it, where a belt entering head-on comes from.
