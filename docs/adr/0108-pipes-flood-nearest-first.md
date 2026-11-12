---
status: accepted — refines ADR 0058
---

# Pipes flood nearest first

The user's rule (the speed-up skill, "take at least 25 hours", continued): the same result in less time. This one is the same work: every layout the same, by its hash.

How it was found: titanium plate 236² profiled at 20 candidates a try (`suite-one.mjs`): routing its pipes (router.js `routePipe`, `growTree`) took 24% of its run, the check a pipe leg asks once it has searched long (`pipeReaches`: could a pipe reach the tree from here at all?) 23 s of 418. Its outcomes counted (in a scratch copy): 0 "no" in 1,345 asks across titanium plate, molybdenum oxide and anthraquinone (21.8 s, 6.5 s, 1.2 s). Each ask flooded breadth first from the connection: every tile nearer than the tree, up to a 236 × 236 area, its dives too, before it met the tree. The belt's check (`reachable`) already floods nearest its goal first.

What changed:

- **The pipe's check floods nearest the tree first** (router.js `pipeReaches`): a bucket for each distance to the tree, the distance the leg's search already keeps (`toTree.heuristic`). What it reaches, and so its answer, is the same in any order; where it reaches the tree it sees a few tiles, not every tile nearer than it.

| Titanium plate 236², one process each, the three at once | Old flood | Nearest first | Both, compared |
|---|---|---|---|
| Its 670 asks | 30.5 s | 0.2 s | every answer the same |
| Run; layout | 542.9 s | 516.3 s | the same hash |

| Full tier as pairs (`pairs.mjs`, host loaded 13–14) | Before | After |
|---|---|---|
| Molybdenum oxide among roboports | 696.7 s | 669.6 s |
| Titanium plate 236² | 511.5 s | 503.3 s |
| Nexelit 100 | 72.2 s | 67.6 s |
| All 17 | 2681.8 s | 2638.6 s (−1.6%), every setup the same layout |

Tests: a pipe connection walled in thicker than its reach fails at once, the check asked; with a way out through the wall, it connects (router.test.js).

Still:
- Routing pipes otherwise (`growTree`'s search) is most of titanium plate's 24%.
