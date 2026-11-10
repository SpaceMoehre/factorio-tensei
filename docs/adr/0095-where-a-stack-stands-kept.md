---
status: accepted — refines ADR 0049, ADR 0058 and ADR 0079
---

# Where a stack stands, kept

The user's rule (the speed-up skill): the same result in less time; prove each cut lays out the same before measuring the seconds it saves. This pass changes no layout.

How it was measured: CPU profiles of the suite's Py wood, silicon and anthraquinone 116² among roboports (`suite-one.mjs`, 20 candidates a try, the page's path in one process), summed by function and by line; then counts in a scratch copy of how often Placement asked the same question again.

Where the time went (share of each run):

| | Wood | Silicon | Anthraquinone |
|---|---|---|---|
| Designing the Sub-Blocks (`buildCore` most of it) | 46% | 45% | 29% |
| Placement | 24% | 28% | 39% |
| of it scoring spots (`scored`) | 19% | 19% | 26% |
| of that, where a stack may stand among the Fixtures (`lands`) | 12% | 10% | 6% |
| of that, clear of the Sub-Blocks placed (`apart` with each) | 2% | | 10% |
| `LayoutError`s made (their stack traces) | 2% | | 2% |

What was done again:

- **Where a stack may stand, asked again.** A City Block's Placement asks, for every spot, whether a Sub-Block's stack stands there among the Fixtures (`lands`): kept per placement only. The candidates of a try place the same stacks again (a sweep's other weights, a mutation of another Sub-Block, Backtracking): of 1,000,000 asks in wood, 834,000 were alike one asked before, stack, budget and spot.
- **Clear of each Sub-Block, spot by spot.** Placing one by one, every spot of the City Block (some 12,000) is weighed against every Sub-Block placed, box by box.
- **Stack traces no one reads.** Variants that fail throw a `LayoutError` (by the thousand); each captured a stack trace, whose message alone is read.

What changed (each lays out exactly as before):

- **Where a stack may stand, kept** (place.js `landedFor`, `blockTiles`, `lands`): by the City Block, the stack's tiles (in order, each machine's named) and its budget; the last 128 stacks asked.
- **Clear of all, one sum** (place.js `neededBy`): where the Sub-Block has no Nooks and was not made room round, a spot is clear where none of the tiles those placed need (with the gap round them, as `apart` has them) lies in its box: one sum over a rectangle of an integral image. Only where the spots are many (more spots times boxes than tiles round those placed): weighing a few spots, as outside a City Block, the sums cost more than they save. 4.2 million spots checked both ways in a scratch copy (wood, coalbed gas, small parts): every one the same.
- **`LayoutError` with no stack trace** (core.js): its message as before.

The same layouts, faster. The host was busy throughout (load 4–13 from elsewhere), so seconds came and went by a third between identical runs; each line is the two sides at once.

| Side by side | Before | After |
|---|---|---|
| The full tier, 17 setups, three at once each | 4620 s | 4414 s, every setup the same layout (titanium plate standing on its own: the same failure, no layout) |
| Anthraquinone, small parts 2, titanium plate on its own, wood, one at a time | 271 s | 242 s |
| Py wood 116², alone, twice | 70, 50 s | 50, 45 s |
| Py anthraquinone 116², alone | 98.8 s | 90.3 s |
| Py titanium plate 236², one after the other | 201.6 s, peak 1406 MB | 177.0 s, peak 1430 MB, the same layout |

Memory: the answers kept come to some 50 MB in titanium plate (its block and two Annexes' rooms, 128 stacks in the block); the peak rose 24 MB. Each try at once on the page holds its own. A spot on no machine answers with one empty set for all.

Tried and dropped: scored spot lists kept across placements, by what stands placed (22% of wood's lists asked again: too few for a key of every Sub-Block placed); Grown's likest designs found before the rest routed (the routing of copies draws random numbers: not the same work).

Tests: a stack placed again, prepared anew as another candidate does, stands where it stood with the same machine left out; with no machine to leave out, asked anew (city.test.js).

Still:
- Designing, 29–46%: `buildCore`, each try's Count changing every core.
- Scoring spots of Sub-Blocks with Nooks: each box looked at in turn.
- Grown's Sub-Blocks with no machine more designed again (`shareOf`, 10% of wood): the search's own designs, likest first, would draw on the search's random numbers.
