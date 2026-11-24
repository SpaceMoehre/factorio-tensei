---
status: accepted — refines ADR 0013 and ADR 0058
---

# Narrow machines take no 90° inserter; a search finding nothing new ends

The setup (the user's, `/tune-layout`): Py iron plate 900/min in stone furnaces, standing on its own (no City Block), basic and long-handed inserters, hand size 1, 90° inserters on. 150 furnaces (6 plates a minute each, 8 ore a plate): 7200 ore, 450 coal in; the plates and 450 ash out on one belt. The page stopped at once: `iron-plate: iron-plate: no module of 18 routes`.

Causes:

1. **A 2 × 2 machine's belt beside it cannot pass its 90° inserters.** Past 120 machines a Sub-Block repeats a module only; every module's core failed to build ("no room for the inserters its belts need"). Each variant put a belt in the row against the furnaces (depth 1), served by a 90° inserter in that row taking from the belt tile beside it: in a furnace's two columns the inserter and its belt tile fill the row, and the belt cannot pass a lone tile between two inserters (a tunnel needs an entrance and an exit). A machine at most 2 tiles across now takes its belts a row off (depth 2, an ordinary inserter between) and further, as without 90° inserters. Below 120 the whole module had routed that way already; no module of copies had.
2. **Then the build ran its whole budget for nothing.** The best came at 15 s; one Sub-Block of few designs mutated into candidates all like ones tried before, each passed over at once: 71,667,356 of them to the end of the 1000 s budget. 10,000 such in a row now end the search.

What changed:

- design.js `shapeOf`: depths without 1 for a building no more than 2 tiles either way.
- search.js `search`: `REPEATS` candidates in a row like ones tried before end it.

| Py iron plate 900/min, stone furnaces, no City Block | Before | After |
|---|---|---|
| Page-like build | fails at once: "no module of 18 routes" | 900/min, 150 furnaces, 81 × 46, valid, starving 0, best at 7.5 s, done at 34 s |
| Suite (K 20) | fails at once | 900/min, 25 × 105, valid, starving 0, ash riding with the plates, 2.7 s |

| Suite | Seed 1 |
|---|---|
| Full tier, 21 setups recorded | every layout the same (titanium plate on its own: no layout either way) |

Tests: stone furnaces with 90° inserters on repeat a module that routes without starving (none built before); a search of two stone furnaces ends long before its minute (search.test.js).

Tried and dropped (/speed-up, same session): the cores kept between designs (2,000) by their entities, not their count. Py silicon built 10,163 cores again it had let go (soil designed at a Count again 17,000 cores later); replayed, 600,000 entities kept rebuilt none in 13 of 14 setups. But a core's memory is mostly its own, not its entities': titanium plate kept 43,000 cores of a few entities each and its peak went 1.35 → 2.53 GB, for no time saved under load.

Still:
- The page's first layout (2.9 s) carried ash riding with the plates on a belt; the best does not.
