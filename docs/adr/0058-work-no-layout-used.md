---
status: accepted — refines ADR 0005, ADR 0009, ADR 0026, ADR 0032 and ADR 0055
---

# Work no layout used

The user's rule: find where the search spends its time, find what it works out and never uses, and prefer the ways that make what the final layouts are made of. All of it for speed.

How it was measured:

- **CPU profiles** of four reference Maximize runs (`node --cpu-prof`, summed by `profsum.mjs`): Py small parts, molybdenum oxide among roboports, kicalk among roboports and the user's titanium plate (236 × 236, 1000 s a try).
- **Every candidate of every try** in a scratch copy of the search: what it was (the first, a sweep's other design, in columns, made roomy…), how far it got (prepared, placed, routed, finished) and how long it took. **Every design variant**: which family of variants it came from, whether it built a core no other had, whether the design kept it, and whether a layout found used it.

Where the time went:

| | Small parts | Molybdenum oxide | Kicalk | Titanium plate |
|---|---|---|---|---|
| Designing the Sub-Blocks | 31% | 38%; cores of rows capped by belt load 290 s, for 2 of the 20 designs fits used | 5% | 7%; at 26 casting units 106 of 114 s |
| Choosing the design that fits most spots between Fixtures | 11% | 26% (every design routed; counting spots 11%) | 10% | — |
| Placement | 34% (Backtracking 12%) | 3% | 76%: Parting in columns 62% | 29%: Layers weighing ways 27% |
| Routing the links | 8% | 13% | 0.4% | 43%: fallbacks 18% |
| Finishing (pipes buried, poles) | 1% | 0.3% | 1% | 11% |

What was never used:

- **Cores alike.** A Sub-Block's design builds every variant's core (often thousands), keeps 8. In molybdenum oxide three in four variants were field for field like one built before (two row caps alike, middle rows in a one-row core, pipe shifts with no pipe row); in titanium plate 3,374 of 4,522 cores of rows capped by belt load were. Rows with every second one shifted sideways (9 shifts) built most of the rest: none was kept where the rows unshifted built without Starvation.
- **The same designs again.** Maximize tries the same Goals again with the same chain: an Annex's first try in each Annex's room, the tries after it, those that may starve after those that may not. Each designed every Sub-Block again: in molybdenum oxide one plan six times (243 s).
- **Every design routed to choose one.** Where a Sub-Block's best design fits few spots between the Fixtures, every design was routed and its spots counted, those starving more by their estimate too.
- **Ways of columns that cannot fit.** Layers weighed up to 88,573 ways of the Sub-Blocks in columns before saying none fits. In titanium plate the chain from ore to plate is wider in columns than the City Block: every try's 8 candidates in columns weighed every way for nothing, 4 s each.
- **The same spots again.** Parting a stack round the Fixtures checks each copy at each row down; the stack is tried at every row and column of its column's room, so the same copy at the same spot was checked again and again, and its tiles collected anew each time. Placing one by one scored the City Block's spots up to three times, twice in Backtracking.
- **Candidates placed alike.** The sweep's candidates in columns include those differing only in how a Sub-Block placed one by one weighs its spots (weight, lift, order), which Layers does not use; mutations often change nothing.
- **Layouts finished to be thrown away.** In a try that may not starve, a layout starving as routed (or whose tapped byproduct found no splitter, ADR 0054) was finished — pipes buried, belts straightened, poles placed — and then passed over. Finishing changes neither (95 of 95 layouts checked). In titanium plate's tries at 12 and 13 casting units: 40 a try, 5 to 7 s each.
- **Fallbacks that cannot fit.** A layout whose links fail is laid out again with its Fan-outs last, without Fan-outs across Sub-Blocks, then without splitters (ADR 0026). Across every instrumented run no fallback made a layout that fit: titanium plate spent half its search in candidates going through them, molybdenum oxide a fifth. Without splitters a tapped byproduct comes by train, which no try that may not starve keeps (ADR 0054).
- **Designs too big for the room first.** Each Sub-Block's first candidate takes its first design. Where that design does not fit the City Block, every candidate changing one other Sub-Block's design is passed over unbuilt: at titanium plate's 26 casting units 393 of 406.

What the final layouts are made of: the first candidate, or it made roomier or kept off the Fixtures, made most fits (small parts, molybdenum oxide, titanium plate). Their designs are each Sub-Block's first in 9 of 10. Of the variants, one row of machines (cheap, 14 of 21 Sub-Blocks in titanium plate), random draws and Two-Way Output made most; rows capped by belt load two in 60.

What changed:

- **Variants alike built once** (design.js `designOnce`). A variant like one built before, field for field, builds the same core or fails the same way: not built again.
- **Pipe rows shifted only where needed** (design.js `variants`). Every second row shifted sideways is built only where the rows unshifted, either way round, do not build a core without Starvation. Both together: a Sub-Block's designs as before (its candidates the same, checked on three setups), designing 54.2 → 23.1 s (molybdenum oxide, 3 furnaces), 25.9 → 11.1 s (titanium plate, 10 casting units).
- **Designs kept between tries alike** (search.js `keptDesigns`). A search for a layout without Starvation (designing with no time limit) keeps its designs, by all designing takes: the chain's entries, the logistics, the City Block's size and whether Fixtures stand in it, the seed and the Precheck. A search like one before it (the last 6) takes them: one machine row and more as they are, routed once for both (routing them draws no random numbers); repeated modules as they were when the first finished designing. It draws its random numbers on from where that one's designing left off, and its candidates get as long as designing took that one. It lays out the same.
- **Designs starving more by estimate not routed** (search.js, the design that fits most spots between Fixtures): routing only adds to what an estimate starves.
- **Room counted faster** (place.js `roomFor`, the City Block's `room`): a module's tiles as a mask, no object for each spot, and kept by its tiles: a module alike in another design or try takes the same.
- **No columns, told at once** (place.js `inLayers`). Where a Sub-Block is taller than the room, or a chain of them, each in a column west of the one it feeds, wider (their widths and a corridor between), no way fits: none is weighed.
- **Parting checks each spot once** (place.js `copyLands`, `copyTiles`): where a copy may stand, by copy and spot, and its tiles, by copy.
- **Spots scored once** (place.js `optionsFor`): placing one by one, each list of spots scored once, Backtracking taking the same; the spots west of the consumers and the others scored apart.
- **Candidates placed alike passed over** (search.js `seen`): one like a candidate tried, in all its placing takes of it, places and lays out the same.
- **The first design that fits first** (search.js `choice`). Looking for a layout without Starvation in a City Block, each Sub-Block starts from its first design without Starvation that fits.
- **Not finished to be passed over** (search.js, score.js `starvationOf`). In a try that may not starve, a layout starving as routed is passed over as routed; so is one whose tapped byproduct found no splitter, in any try that bounds itself so.
- **No fallback without splitters where a byproduct is tapped** (search.js `fallBack`), in those tries. The fallbacks for Fan-outs stay.
- **Bands' check of two rows routes until one fits** (bands.js `twoRowsFit`), not every design.

The same layouts, faster. Maximize with no time limit and 20 candidates a try (`maxdet.mjs`, every try the same on any host):

| Side by side | Before | After |
|---|---|---|
| Py small parts in 100² | 72.2 s, 2775/min | 54.8 s, every event and layout the same |
| Py molybdenum oxide among roboports | 3248 s, 599.99/min | 2660 s, every event and layout the same |

Wall clock, side by side on one host (`run.mjs`, the setups' own budgets):

| | Before | After |
|---|---|---|
| Py titanium plate, 236² (1000 s a try, an hour) | 7101.56/min at 3602 s (12 casting units and an Annex of 7) | the same fits in the same order, each sooner: 7101.56/min at 3229 s. Tries 26: 347 → 231 s; 7: 69 → 29 s; 11: 46 → 21 s; 19: 74 → 25 s. The two that run out of time (13, 12) take their 1000 s either way |
| Py kicalk among roboports (40 min) | 412.8/min (129 kicalk), 28 tries | 460.8/min (144 kicalk), 39 tries; its slowest tries 511 → 70 s, 524 → 132 s, 591 → 202 s |
| Py small parts in 100² (10 s a try) | 2587.5/min, 109 s | the same layout, 98 s (its tries end with their budget) |

Tests: a search like one before it lays out the same; Layers says at once that Sub-Blocks wider in columns than the City Block fit none, and one by one they stand.

Still:
- Routing the links of candidates that fail takes most of titanium plate's tries: 13 to 36 s a candidate. Many fail on one Supplied Item's way to the belt it joins.
- Bands' first look at a City Block of roboports (how many machines its parts hold) designs each Sub-Block's part of two rows anew for every Count and row: two minutes in molybdenum oxide, which Bands then never fits.
- Fallbacks where no byproduct is tapped are still tried in every try: none made a fit in these runs.
- Where Sub-Blocks fit in columns, Layers still weighs up to every way of ten Sub-Blocks' for each candidate, each way measured afresh.
