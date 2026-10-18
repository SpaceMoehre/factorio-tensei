---
status: accepted — supersedes ADR 0008's "don't run tries in parallel workers"; refines ADR 0013, ADR 0031, ADR 0047, ADR 0052 and ADR 0057
---

# Tries at once

The user's rule: parallelize as much as possible to squeeze out more time.

One try at a time, Maximize waits on each before choosing the next. In Py titanium plate (236 × 236, 1000 s a try) the Foretelling says 26 casting units; 26, 13 and later 12 fail, two of them after their whole 1000 s, and the first fit (7) comes after some 1200 s. ADR 0008 kept tries one at a time: two at once slowed the try that decided by a third, and the Foretelling usually made the second unnecessary. Neither holds here: the Foretelling is far off, and the machine has 8 cores, 7 of them idle.

What changed:

- **Tries at once** (maximize.js; `parallel`: how many). Beside the try the bounds call for come those they would call for next: were the tries under way all not to fit (as tries out of time: no more than halfway down from the fewest of them), and were the fewest of them to fit (then halfway between it and the next): a bisection (`planner.beside`). Titanium plate's first six: 26, 13, 20, 7, 10, 4; kicalk's 67, 34, 51, 17, 26, 9. Every outcome closes the bounds as it comes. A try that can no longer tell anything is stopped: at no more machines than a fit, at more than found no room, or begun on the hope that one which then did not fit would. A fit counts only where it has more machines than the best. An Annex's first try (one machine) goes alone.
- **The tries are the caller's to run.** maximize yields `{ type: 'start', id, job }` (the planner's and attempt's options as plain data), `{ type: 'wait' }` (given back the first to finish, `{ id, outcome }`) and `{ type: 'cancel', id }`. parallel.js `drive` runs them in a pool of workers (`tryPool`), each running `runTry`. With `parallel` 1 (the default) maximize makes its tries itself, one at a time, as before: its events and layouts the same (`maxdet.mjs`).
- **Annexes' tries too**: an Annex's own Maximize hands its tries on (annexOf).
- **Annexes beside two layouts** (`roomiest`, `together`). Many machines stand many ways, and how much room a layout leaves its Annexes varies more than its count: in Py kicalk among roboports, a layout of 66 left room the Foretelling says holds 4 more (its Annex fit 16), another of 66 61, one of 63 43. With 4 tries at once or more, the Annexes run beside the layout with most machines and, where that is another, beside the one with most machines and Annex room together (of the 4 fits with most machines), side by side, half the tries each; the chain that makes more is kept. A layout is shown only where it makes more than any shown before.
- **Annexes begun early** (the climb's `spec`). Workers idle with no try left to begin (titanium plate's last tries of its first layout ran 1000 s each, some 20 minutes all told, most workers idle), the Annexes beside the best begin; their layouts are held back until those tries are done, and one fitting more machines stops them. Only where nothing after the tries may change the best: no Fixtures in the room (Bands, Giving Way), no byproduct riding alone (sorting out).
- **Bands' top in a worker** beside the tries (`bandsTop`, Py molybdenum oxide's two minutes before its first try): Bands then runs after them, where its parts hold more than they found, not before.
- **Giving Way's steps at once**: FILL machines more, and each half as many, together; the most that fit going on from there, the fewest above it that did not bounding the next.
- **The tries sorting byproducts out** (at the most that fit, and up to two fewer, each given 120 s at least) **and those that may starve** run ahead of their turn, taken in turn (`inTurn`): the first that is kept stops the rest.
- **The page** runs as many tries at once as the machine has cores but one, and no more than one per gigabyte of its memory (a try of titanium plate's 21 Sub-Blocks holds about 0.6 GB), 8 at most: the Maximize worker makes them, workers of its own (worker.js). Its status names the others under way: "Trying 4500/min (12 machines; also 26, 20 at once)…".
- **run.mjs `--parallel N`**, in worker threads (try-worker.mjs).

Side by side on one host of 8 cores (`run.mjs`):

| | One at a time | Tries at once |
|---|---|---|
| Py titanium plate, 1 h (6 at once; three runs) | 5601.56, 7101.56 and 8226.56/min (12 casting units and an Annex of 3, 7, 10); first fit (7) at 1224 to 1246 s | 9750/min each time (19 and an Annex of 7), reached at 2343 to 2421 s; first fit at 51 to 67 s, 19 in one layout at 342 to 379 s |
| Py molybdenum oxide among roboports, 40 min (3, then 4 at once) | 599.99/min at 560 s, every phase done at 1494 s | 599.99/min at 158 s and 210 s, done at 1042 s and 854 s |
| Py kicalk among roboports, 40 min (4 at once; two runs) | 470.4/min (147 kicalk) at 1368 s, done at 1552 s | 502.4/min (157) at 652 s and 938 s, done at 1072 s and 1347 s |
| Py small parts in 100² (4 at once, 10 s a try) | 2775/min at about 50 s | 2775/min at 20 s, done at 55 s |

(One at a time ran beside the tries at once, on a busier host than alone, and its tries of 1000 s come and go with the load: hence its three titanium plate results. Titanium plate's 19 casting units in one layout come from tries above 13 and 12, which ran out of time: the bounds one at a time do not reach them.)

The Annexes begun early started at 1066 s in titanium plate's run, not after the last tries for more casting units at 1342 s: their first layouts showed at 1457 s, not 1535 s. The hour's end was the same (9750/min at 2349 s, not 2343 s): those tries kept most workers busy until they ended.

Before Annexes ran beside two layouts, kicalk with 3 at once made less than one at a time, twice: 384/min (a layout of 78 with Giving Way, its Annexes 42 more) and 371.2/min without Giving Way (a layout of 66, its first Annex 16), where one at a time made 470.4 and 432 (layouts of 64 and 63, Annexes of 48 and 27 first). More tries found more machines in the first layout, which left its Annexes less room.

Tried and dropped:

- **Spare workers on the same count with other seeds** (a portfolio: the first to fit wins). Titanium plate at 13 casting units with seeds 2, 3 and 4, 600 s each: none fit, as with seed 1.

Tests: Maximize with tries at once, run by a pool on the test's own thread, as high a rate as one at a time, every fit valid and higher than the last; with Annexes, every layout shown making more than the last; in a block with no Fixtures, its tries finishing out of turn (the Annexes begun early), as high a rate as one at a time.

Still:
- A try under way that cannot fit is stopped only once another's outcome says so: titanium plate's tries at 20 casting units and more run their 1000 s.
- In a City Block with Fixtures the Annexes still wait for the first layout's last tries (Giving Way and Bands may change it).
- Each try in a worker designs its Sub-Blocks itself: a try like one before it in another worker designs them again (ADR 0058's kept designs are a worker's own).
- Which first layout leaves its Annexes most room is told only by the Foretelling's room, and only two are laid out beside.
