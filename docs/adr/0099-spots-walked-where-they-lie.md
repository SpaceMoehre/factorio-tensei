---
status: accepted — refines ADR 0095, ADR 0097 and ADR 0098
---

# Spots walked where they lie

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time; prove each cut lays out the same before measuring the seconds it saves. This pass changes no layout.

How it was measured: CPU profiles of the suite's setups on the code after ADR 0098, by function and by line; allocation sampling (objects collected included) of a whole anthraquinone run; the full tier side by side. The host stayed loaded from elsewhere (load 4–22).

Where the time went: placing one Sub-Block at a time, a Sub-Block that fits none of its candidate spots weighs every spot of the City Block (`scored` of `site.spots`), some 12,000 in one 116 wide, once west of its consumers and, where none fits, once east; Backtracking asks for both lists again. Before this pass that took 24% of anthraquinone 116², 18% of coke, 15% of perylene, 11% of silicon. Its lines put most of it in the walk itself: reading each spot from a list made anew at every ask (12,000 objects a time, 2.4 of the 23.7 GB a 78 s anthraquinone run allocates), and the two tests that pass most spots over, which read only the spot's column.

What changed (each lays out exactly as before):

- **The City Block's spots walked where they lie** (place.js `scored`, `siteRules` `spotGrid`): row by row, column by column, as the list had them, with no list made; its count, which decides whether a sum over the tiles placed answers whether a spot is clear, worked out from the grid.
- **A spot's column passed over once, not at every row** (place.js `scored` `behindAt`): whether a column lies in the room kept west of a Sub-Block for its feeds, or runs back of its consumers (or not, by the pass), and how far, found once a scan; only the columns left are walked.
- **A spot asked of by its numbers** (place.js `scored` `visit`, `clear`): where the stack lands among the Fixtures by its corner (`landerOf`, its answers by size found once a scan, ADR 0098), clear of those placed by a sum over a rectangle; a box made only for `apart`, where a Sub-Block has Nooks.

The same layouts, faster:

| Side by side, at once | Before | After |
|---|---|---|
| The full tier, 17 setups, three at once each | 4221 s | 4135 s, every setup the same layout (titanium plate standing on its own: the same failure, no layout) |
| Anthraquinone 116² | 289.7 s | 267.4 s |
| Hot air 118² | 134.3 s | 116.2 s |
| Silicon 116² | 280.3 s | 264.6 s |
| Coke 116² | 405.1 s | 390.6 s |
| Wood 116², small parts 2 (run as a pair: in the suite the changed side's last setups ran beside the other side's longest) | 100.5, 89.1 s | 100.6, 86.0 s |

| Share of each run | Before | After |
|---|---|---|
| Anthraquinone: weighing spots one by one (`scoredOf`); Placement | 24%; 30% | 15%; 21% |
| Coke: the same | 18%; 23% | 10%; 16% |

Tried and dropped (this pass and the one after ADR 0098):
- **Fewer objects made** (place.js `apart` answering a stack with no Nooks without making its full mask; spot lists kept by size; `scored`'s entries made without spreading; core.js `buildCore` reading its pole slots and machines' moves without lists): the same layouts, the full tier 4247 → 4241 s. A run allocates by the gigabyte, but collecting the young generation costs by what still lives, not by what was made: the share of garbage collection stayed 7%.
- **A module's routing given three tries, not four** (module.js `REROUTES`): the fourth costs 3–6% (hot air 6.8 s routing no module, molybdenum oxide 11.4 s for 18), but the full tier lost coke 2520 → 2311.97/min and titanium plate 5424.49 → 4359.37/min, and saved no time.
- **More cores kept** (design.js `CORES_KEPT` 2000 → 8000): the ones built again after being let go are many (coke 20,215 of 51,728, molybdenum oxide 38,295 of 72,224), but kept they saved 2–4% (titanium plate, coke, molybdenum oxide) and cost kicalk's big cores 450 MB more at its peak. Failures kept apart: 1.5%.
- **A module's tiles and their key kept by the module's own objects** (place.js `coveredBy`, `siteRules` `room`): molybdenum oxide's share 4% → 3%.
- **Bands' two-row Parts shared across Counts** (bands.js `twoRowsFit`): each of trits' 25, vrauks' 36 and molybdenum oxide's 140 is its own (recipe, machines, row and the Part's rate).
- **The page's workers idle** (run.mjs `--parallel 3`): busy 73–78% of the time in wood, silicon and coke, of which cancelled tries 11–33%; silicon's Extensions (ADR 0038) lay out on the main thread with every worker idle (29 of 190 s), but what comes after an Extension depends on it.

Tests: the placement tests as they were (city.test.js: Backtracking, Layers, the same designs prepared again standing where they stood).

Still:
- Weighing a spot that passes: clear of those placed, landing among the Fixtures, its cost (anthraquinone 12%).
- Designing, routing (`buildCore`, the A* search), each spread over its lines.
- Extensions on the page's main thread: their next Annex could start on a worker while one is laid out, a speculation to cancel where it extends.
