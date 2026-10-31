---
status: accepted — refines ADR 0066
---

# A byproduct's own belt snakes through the copies by its own rate

The user's rule: find what is unnecessary in the layouts and take it out.

How it was found: every belt of the suite's layouts sorted by what it carries and where (from the train, between Sub-Blocks, to the train), with its rate, how many there are and their tiles. Py molybdenum oxide among roboports (the page's own layout, 799.99/min): 12 belts of stone, 120 a minute each, 2156 tiles from the jaw crushers at the west edge to the train at the east edge: a belt and a half's worth on twelve.

Cause: a stack of copies lets a belt it does not use up snake from copy to copy (an output only the train takes, where two copies' share fits one belt; design.js `chainedRoutes`). It measured that share by everything a machine makes, 150 crushed molybdenite and 60 stone a minute each: 2 copies of 2 crushers, 840 a minute, more than the drops' lanes carry. But under One Item a Belt (ADR 0066) the stone has a belt of its own and carries 60 a machine: 240 for two copies. Every copy got a belt of stone to the train.

What changed:

- **What the belt carries** (design.js `chainedRoutes`): an output's share by its route's own product (`routeMade`), all a machine makes only where its products share the belt.

| Py molybdenum oxide among roboports, the page (`run.mjs`, one try at a time) | Before | After |
|---|---|---|
| Rate | 799.99/min (4 furnaces) | 799.99/min (4) |
| Belts of stone to the train | 12, 2156 tiles | 2, 305 tiles |
| Belts between Sub-Blocks and to and from the train | 3765 tiles | 3200 |
| Best at, done at | 741 s, 918 s | 649 s, 815 s |

| The suite's full tier, side by side | Before | After |
|---|---|---|
| Py rayon 116² | 487.5/min | 496.87/min |
| The 14 others (titanium plate, coke, kicalk, silicon, …) | | the same layout (titanium free: no layout either way) |
| Py molybdenum oxide | 999.98/min (5 furnaces, a byproduct riding on) | 799.99/min (4, none riding); 999.98 on the base with ADR 0084's Precheck change |

Molybdenum oxide's suite path, K candidates a try, takes another turn with the stack's belts changed; on the page it makes 4 furnaces either way, as it did in every run before this pass (six side by side, one at 3 under load).

Tests: a byproduct's own belt snakes through the copies by its own rate (Py jaw crushers' stone, supplied.test.js).

Still: a stack's belts that cannot snake (more than fit beside it) still get one a copy; their own belts to the train are not joined until the finished block (mergeByproducts, only those sorted out by a filter splitter).
