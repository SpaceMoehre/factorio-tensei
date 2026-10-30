---
status: accepted — refines ADR 0058 and ADR 0078
---

# Routing and placement written for the hot loop

The user's rule: the same result in less time; a build after a speed-up delivers at least what it did before. Like ADR 0078, this pass changes no layout.

How it was measured: CPU profiles of the fast tier after ADR 0078 (`suite-one.mjs`), summed by function and by line, then counts of the hottest calls in a scratch copy.

What was left, and why:

- **Search states of many shapes.** The router's states came from starts, belt moves, tunnels and pipe moves, each built differently: about eight shapes, so every read of a state in the search loop was megamorphic. Every move also built its piece objects and an `out` key string, though most moves are never taken.
- **A tree's distance field computed afresh for every leg** (`distanceField`): 11 s of trits' run, the tree having grown by one leg.
- **Key strings for every tile asked.** A pipe's moves made three a tile; `canPipe` called `Object.entries(VEC)` on every call (7.5 s of perylene); the sets of a grid's fluid ports, blocked and surface-only tiles were string sets.
- **Every snapshot copying every tile.** The grid kept every entity's every tile in a Map besides its array, and each snapshot (every option routing tries and takes back) copied that Map: 9.4 s of trits, mostly compose's taps.
- **Overlap scans.** Placement asked whether two boxes clash 4.3 million times in perylene, scanning 2.83 billion tiles.
- **Memo lookups through three Maps.** Small parts 2 asked where a Sub-Block lands 18.9 million times (95% answered from the memo).

What changed (each lays out exactly as before):

- **One shape of state** (router.js `state`, `lay`, `unwind`, `conflictsWithOwnPath`): every state carries the tiles it lays; pieces are made only for the leg found; the own-path check compares numbers. The cheap best-cost check comes before the walk back over the last steps (either only passes a move over).
- **The heap in two arrays** (router.js `Heap`): values and priorities, no object a push.
- **The distance to a pipe tree grown** (router.js `grownField`): a flood from the leg's new tiles only. Against the field computed afresh: 8.1 million queries, none different.
- **Tiles asked by coordinates** (grid.js `TileSet`, `hasAt`): fluid ports, blocked and surface-only tiles keep a mask besides their keys; `canPipe`, `pipeMoves`, `pipeReaches`, a growing tree and a belt's waypoints ask it without a key.
- **Only tiles outside the area in the grid's Map** (grid.js `occupied`, `taken`, `clear`): inside it, its array alone; a snapshot copies the few outside.
- **Clashes summed where a mask is full** (place.js `apart`, an integral image), and looked up once a call in `scored`.
- **Where a Sub-Block lands by a typed array** (place.js `lands`), each size's; `landing` reads a mask of the box and marks Fixtures seen by stamps; Layers' `shape` and `column` without arrays a row.

The same layouts, faster (the fast tier, the code before and after side by side, one setup at a time each; every setup `same layout`):

| | Before (ADR 0078) | After |
|---|---|---|
| Py small parts in 100² | 13.1 s | 10.4 s |
| Py trits 118² | 321.5 s | 220.7 s |
| Py hot air 118² | 163.4 s | 87.0 s |
| Py silicon 116² | 311.4 s | 314.6 s (designing) |
| Py anthraquinone 116² | 226.7 s | 148.9 s |
| Py perylene 116² | 337.1 s | 226.4 s |
| Py coalbed gas 80 × 40 | 33.0 s | 18.6 s |
| Py vrauks 100² | 468.3 s | 334.9 s |
| Py nexelit 100² (again, two at once) | 168 s | 155 s |
| Py small parts 2 116² (again, two at once) | 189 s | 141 s |

All ten: 2232 → 1658 s (-26%).

The full tier's big setups, side by side, one at a time each:

| | Before (ADR 0078) | After |
|---|---|---|
| Py coke 116² | 733.7 s | 461.7 s, the same layout |
| Py rayon 116² | 505.5 s | 445.8 s, the same layout |
| Py molybdenum oxide among roboports | 1389.1 s | 912.2 s, the same layout |
| Py kicalk among roboports | 791.5 s | 647.8 s, the same layout |
| Py titanium plate 236² | 761.5 s | 564.8 s, the same layout |
| Py titanium plate standing on its own | 223.3 s, no layout | 198.7 s, no layout (the same failure) |

Against the records taken before ADR 0078 (suite.json): molybdenum oxide 2308 → 912 s, titanium plate 1454 → 565 s, kicalk 1220 → 648 s, every one the same layout.

Tried and dropped: one array of moves reused for every node (clearing it cost more than the arrays it saved).

Tests: the 321 as before.

Still:
- The router's search loop and a belt's moves, about 15% of self time: the expansion itself.
- Garbage collection, 5–6%; `fedByOther`, 3%.
- Placement: `landing` where the memo has no answer and Layers trying every row of a column, together 8% of small parts 2.
- Designing the Sub-Blocks (`buildCore` 8%), untouched here.
