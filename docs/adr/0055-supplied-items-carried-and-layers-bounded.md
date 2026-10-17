---
status: accepted — refines ADR 0009, ADR 0040 and ADR 0041
---

# Supplied Items carried in full, and Layers bounded

The user maximized Py titanium plate in an empty 236 × 236 City Block (Buffer 4). Every byproduct is processed in the block by Uses: rejects recrushed, pulps leached and filtered, stone and gravel crushed to sand. That makes 21 Sub-Blocks. The page found nothing at any count: "no layout without starvation fits 117.18/min", in 69 s.

Causes:

- **A belt carrying a Supplied Item was planned short.** The ti-enriched dust's belt carries the dust to the foundries and its rejects, which join the grade 3 screeners' belt. A filter splitter right after the dust's producers sends them off. The belt's flow was planned for what its consumers take, leaving out the Supplied Item (ADR 0041). Each item then got its share of that flow, so the dust arrived a third short (8.6 of 13/min). The same happened on the grade 3 screeners' belt and, through it, on the grade 3 joining the grade 4 ball mills. Every prepared layout starved 40.1/min, whatever the designs.
- **A belt of two Supplied Items sent only one off.** The recrushers' belt carries gravel and grade 3 and nothing else; each joins another belt. One gatherer was made per belt, so the gravel never joined the stone crushers' belt into the sand, which starved 17/min.
- **Layers never returned.** Once layouts no longer starved, the first candidate's Placement ran for over 15 minutes. Layers weighs every way to put the Sub-Blocks in columns, each up to two columns further west than it must: about 3^21 ways for 21 Sub-Blocks.
- **The candidates in columns all came first.** In a Maximize try in a City Block, every candidate in columns goes before those placed one by one (ADR 0009). Here the Sub-Blocks span more than the block's width in columns, and some 150 candidates in columns took about 1.5 s each to fit none. At 4 casting units the first one placed one by one came only after 3 minutes; it fitted.

What changed:

- **Supplied Items along** (compose.js `groupRoutes`). A belt's flow counts what it supplies too: that item shares its lanes up to its filter splitter.
- **The rest joins too** (compose.js `supplyJoins`, `routeGather`). A belt carrying two Supplied Items and nothing else sends the first off through a filter splitter (a gatherer). The rest of it then ends side-loading the second onto the belt it is supplied to, rather than going on to the train. Where it finds no way there, it goes on to the train as before, and that consumer is short of it.
- **Layers bounded** (place.js `inLayers`). Layers takes at most `LAYER_STEPS` steps, about what weighing every way of 10 Sub-Blocks takes (Py molybdenum oxide's). Each Sub-Block goes as far east as it may first. It goes no further down a way that is already too wide or too tall for the room with the Sub-Blocks put in so far: adding more only widens it. Below the bound, it finds the same ways that fit as before (small parts and kicalk checked).
- **One by one first where columns fit none** (search.js). Once 8 candidates in columns have fit none, and none has fit, the candidates placed one by one go first (`LAYERS_UNFIT`). The error says so (`noColumns`).

| Py titanium plate, 236 × 236, Maximize | Before | After |
|---|---|---|
| A layout at 1 casting unit | none (starves 40.1/min) | 375/min in 9 s, valid, 228 × 44 |
| At 4 casting units (one try, 120 s) | none | 1500/min in 56 s |
| At 10 casting units (one try) | none | 3750/min in 92 s, 228 × 122 |
| Maximize (budget 1000 s a try) | nothing fits (69 s) | 26 ✗ in 173 s, 13 ✗ in 2050 s, 12 still trying at 3000 s (stopped) |

Py molybdenum oxide among roboports (`--total 2400`, side by side): 62.49 → 599.99/min (1 → 3 furnaces, 228 × 186). Its candidates in columns fit none there either. 14 belts ride byproducts on to the east edge, as before at 600/min (ADR 0030); no lower count sorts them out. Py small parts in 100²: the same layout. Py titanium plate at 1800/min on its own: no layout either way (1000 s).

Tests: the dust's belt brings the foundries all they take, its rejects sent off; the recrushers' grade 3 sent off and their gravel joining the stone crushers' belt; Py titanium plate's 21 Sub-Blocks in a 236 × 236 City Block, one try in 8 s.

Still:
- A failing try takes its whole budget, and its retry with spare machines as long again (ADR 0048). Each try at 13 casting units and above failed only after the whole budget (1000 s here): Maximize spent half an hour or more before its first fit. At 12 casting units the links ran out of time.
- Layers puts a deep chain in a column per level, which here spans the block's width while two thirds of its height stays empty. Columns that wrap into a second band would use it.
