---
status: accepted — refines ADR 0055, ADR 0068, ADR 0095 and ADR 0097
---

# Rows asked of as numbers

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time; prove each cut lays out the same before measuring the seconds it saves. This pass changes no layout. It follows ADR 0097 on what that pass left: Layers standing its columns among roboports.

How it was measured: CPU profiles of 14 suite setups on the code after ADR 0097, summed by function, by caller and by line; each cut checked by the shares of a profile and the layouts' hashes, then the full tier side by side. The host stayed loaded from elsewhere (load 7–20): shares and pairs run at once are what count.

Where the time went (share of each run, after ADR 0097):

| | Kicalk among roboports | Vrauks 100 | Coalbed gas 80 × 40 |
|---|---|---|---|
| Layers standing its columns (`column`) | 27% | 27% | 19% |
| of it, where a stack lands among the Fixtures (`lands`) | 8% | 6% | 4% |
| A link's tiles held for its route's others (`among`) | 3% | 1% | |
| A stack's tiles gathered (`blockTiles`) | 4% | | |

What was made again:

- **A box for every row.** Layers stands each Sub-Block of a column level with what it feeds, then scans up and down, row by row, for one clear of the Fixtures and the others (and where none is, parts its stack row by row): each row asked made its box, each step of Parting's scan an array of the two rows, and each ask looked up the stack's answers by its size again.
- **A tile's key made for every step.** A link holds the tiles where its route's other links meet their copies; the search asks of them at every state it expands, each time making the tile's key as a string.
- **A stack's tiles gathered anew at every placement.** Where a stack may stand is kept across candidates by its tiles (ADR 0095), but each placement gathered them again, thousands for kicalk's stacks of 125 machines, and sorted them into the key.

What changed (each lays out exactly as before):

- **Rows asked of as numbers** (place.js `inLayers` `column`, `landerOf`, `landIn`, `sizeOf`, `inside`): a column's scan asks of each row by its corner's numbers, the stack's answers for its size found once a scan; Parting's scan asks above, then below, with no list made. `lands` asks as it did.
- **A link's held tiles by their coordinates** (router.js `routeLink`, `FewTiles`, `among`): the few keys held, read once into numbers; asked by coordinates. (A key not as `key` makes it is no tile's: none of them answered before either.)
- **A stack's tiles kept by what it is made of** (place.js `blockTiles`, `tilesKept`, `moduleOf`): by each copy's module (its entities, area, belts and pipes: the same objects in every routing of a module taken again, module.js), number and offset; the last 64 stacks.

The same layouts, faster:

| Side by side, at once | Before | After |
|---|---|---|
| The full tier, 17 setups, three at once each | 4846 s | 4660 s, every setup the same layout (titanium plate standing on its own: the same failure, no layout) |
| Kicalk among roboports | 695 s | 592 s |
| Vrauks 100 | 120 s | 101 s |
| Coalbed gas 80 × 40 | 45 s | 38 s |

| Share of each run | Before | After |
|---|---|---|
| Kicalk: Layers (standing its columns) | 28% (27%) | 20% (19%) |
| Vrauks: Layers (standing its columns) | 30% (27%) | 18% (17%) |
| Coalbed gas: Layers (standing its columns) | 21% (19%) | 13% (10%) |
| Kicalk: a link's held tiles; a stack's tiles | 3%; 4% | 1%; 3% |

Memory: the stacks' tiles kept are some 64 sets of a few thousand numbers.

Tried and dropped:
- **The cheapest spot found first** (place.js `scored`). Placing one by one, a Sub-Block that fits none of its candidate spots weighs every spot of the City Block for the cheapest. Weighing them by a lower bound of their cost (the block grown by the box, its links), cheapest bound first, until no bound left beat the best: 20,212 picks over 104 million spots in five setups, every one the same as before, but anthraquinone's Placement rose from 30% to 40% of its run. Where Fixtures stand, the machines they stand on (four tiles of room each) and the Side Input rows a spot blocks add most of a spot's cost, so the bound passed over few; and Backtracking weighs the whole list after all.
- **A layout's validity checked before it is finished** (lay.js `layOut`). Every layout found invalid once finished (a fluid's network in two, a fluid that does not reach a machine) was invalid as routed, with the same first problem; but finishing may fail first, its pole telling the next candidates where to make room, so skipping it steers the search elsewhere; 1–3% of a run at stake.
- **A module's routing given up where its core alone cannot be powered**: no core of molybdenum oxide or vrauks was; the belts routed take the room a pole needed.
- **A belt's way to the east edge given up where a flood finds none** (router.js `routeBelt`): those searches took 0.4 s of trits' run.

Tests: in a City Block, the same designs prepared again stand where they stood, one by one and in columns (city.test.js).

Still:
- Designing, 25–60%: `buildCore`, its time spread over its lines.
- Placement weighing spots one by one (`scored`), 10–20% where Fixtures stand: each spot's own work, clear of the others, landing among the Fixtures.
- Parting each stack at every row a column tries (kicalk 9%).
