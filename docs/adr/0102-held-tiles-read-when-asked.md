---
status: accepted — refines ADR 0098
---

# Held tiles read when asked

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time; prove each cut lays out the same before measuring the seconds it saves. This pass changes no layout. It mends a cost ADR 0098 brought, and records what this session tried after ADR 0101 that did not pay.

The cost: ADR 0098 had a link read the tiles held for its route's other links (where they meet their copies) into numbers before its search (router.js `FewTiles`), so each step of the search asked by coordinates. Kicalk's links search long and ask often: the share of those asks fell from 3% to 1%. But titanium plate standing on its own routes belts through dozens of copies, each link holding every other's tiles, and most of its links are short: reading every key into numbers for each of them took 3% of its run, where the asks had taken under 1%.

What changed (lays out exactly as before):

- **Held tiles read into numbers only once asked as often as they are many** (router.js `FewTiles` `hasAt`): until then each ask makes the tile's key, as before ADR 0098; after it, the numbers. Either way a key not as `key` makes it is no tile's.

| Share of each run | ADR 0098 | Now |
|---|---|---|
| Titanium plate standing on its own: reading held tiles; routing its links (`routeLink`) | 3%; 13% | 0%; 10% |
| Kicalk among roboports: asking of held tiles; routing its links | 3% (`among`, `hasAt`); 16% | 4%; 16% |

The suite run to record it lays out every setup as recorded before.

Tried and dropped since ADR 0101 (each measured; none kept):
- **Bridging poles, each spot's spots in reach kept across a network's joins** (poles.js `connect`): titanium plate on its own's share 22% → 16%, 44 → 41 s in a pair, but 58 MB more at its peak; kicalk the same time, 58 MB more.
- **A slot's inserter vectors made once** (core.js `inserter`): stamping a core took the same share.
- **Parting's copies carrying their own answers; a column's rows asked with its bounds fixed** (place.js `parting`, `column`): kicalk's shares the same (Layers 20%, Parting 9%).
- **Whole tries done again with the same inputs** (maximize.js `once`): none in six setups (one in silicon, its outcome another).
- **Cores rebuilt for rates alone** (design.js `keptCores`): of the cores built again, almost all had been let go from the 2,000 kept (coke 20,215 of 22,297 alike in all but their rates); silicon none for rates. A kept core takes some 59 KB, 44% of it its belt rows' tiles as pairs of numbers: kept flat, some 1.75 times as many would fit in the same memory.
- **Garbage collection** (7–11% of a run): in anthraquinone 924 scavenges took 2.4 s and 5 mark-compacts 50 ms of 42.8 s: what lives past the young generation, not how much is kept for long.

Tests: the routing and city tests as they were.

Still:
- A core's belt rows' tiles kept as pairs (core.js `rowsOut`, read by module.js `placeCore`): flat, the cores kept could be more for the same memory.
- Bands' two-row Parts routed one by one until one fits its Slot (bands.js `twoRowsFit`): trits 32%, vrauks 40%.
