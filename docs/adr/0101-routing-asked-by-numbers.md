---
status: accepted — refines ADR 0095, ADR 0097 and ADR 0098
---

# Routing asked by numbers

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time; prove each cut lays out the same before measuring the seconds it saves. This pass changes no layout.

How it was measured: routing a module (module.js `routeAnew`: its belts and pipes, squeezing, poles) is 10–30% of most suite runs. 300 module routings taken from a molybdenum oxide run (every seventh routed, 161 that route and 139 that fail) were routed again in separate processes, old and new in turn, each outcome compared (pieces, parts' lanes and ends, poles, or the failure's message), and profiled.

Where a module's routing went, beyond the A* search and its moves (each its own share of the routing):

| | Share |
|---|---|
| A tunnel's line looked up (`tunnelLine`: a span made, then a string, per hop asked) | 4% |
| A row's part found again for every tile it reserves (`partKey`) | 2% |
| A waypoint's key read back into numbers (`TileSet` `spot`) | 1.6% |
| Placing poles: the candidates covering each consumer, in a Map of lists | 3% |
| Routing errors' stack traces, by the thousand as legs fail | 0.8% |

What changed (each lays out exactly as before: the 300 routings' outcomes the same):

- **A tunnel's line by numbers** (grid.js `Grid` `byLine`, `lineOf`, `tunnelLine`): the same lists, by type and then the line as a number (rows even, columns odd), next to those by string that `tunnelFits` and the Compound Block read; a pipe's line looked up once for all its hops, as a belt's is (router.js `pipeMoves`).
- **A row's part found once** (module.js `routeAnew` `placeCore`).
- **Waypoints added and taken by their coordinates** (grid.js `TileSet` `addAt`, `deleteAt`; router.js `routeBelt`, `growTree`): the same key, the mask set from the numbers given.
- **Each candidate's consumers in an array by its index** (poles.js `placePoles` `covers`): its spots read in the same order, the lowest first.
- **`RoutingError` with no stack trace** (router.js), as `LayoutError` has none (ADR 0095): its message and fields are all anyone reads.

The same layouts, faster:

| | Before | After |
|---|---|---|
| The 300 routings, in turn, three pairs (twice each) | 10966, 11010, 11235 ms | 8977, 10497, 10462 ms |
| The same with poles' consumers in an array, under load, three pairs | 56328, 57547, 67489 ms | 48051, 49667, 53971 ms |
| The full tier, side by side, three at once each (without the poles' array) | 3535 s | 3473 s, every setup the same layout (titanium plate standing on its own: the same failure, no layout) |
| Perylene 116², nexelit 100, titanium plate 236², molybdenum oxide | 166.9, 123.1, 442.3, 709.0 s | 154.2, 115.8, 424.2, 680.4 s |

(In the suite the changed side's last setups, small parts 2 and wood, ran beside the other side's longest: 89 → 98 s, 91 → 123 s, as in every A/B of this session; run as pairs before, they came out alike. The recorded suite, run with every change of this ADR, lays out every setup as recorded before.)

Tests: the routing, module, poles and city tests as they were; the 300 routings' outcomes compared.

Still:
- The A* search and its moves: some fifth of a module's routing, a tenth of a whole run, their own work.
- A tile's key as a string where a route holds it (`Grid` `reserved`), next to the typed array that holds the same.
