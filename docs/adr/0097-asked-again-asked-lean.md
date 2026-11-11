---
status: accepted — refines ADR 0055, ADR 0058, ADR 0068 and ADR 0095
---

# Asked again, asked lean

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time; prove each cut lays out the same before measuring the seconds it saves. This pass changes no layout.

How it was measured: CPU profiles of all 17 suite setups (`suite-one.mjs`, the page's path in one process), summed by function and by caller; then counts in a scratch copy of how often each costly piece of work was asked again, and of what each candidate of each try came to (its kind, how far it got, how long). The host was loaded from elsewhere throughout (load 5–20 with none of this pass's runs going): seconds came and went by half between identical runs, so shares of a profile and two sides run at once are what count.

Where the time went (share of each run, before):

| | Titanium plate standing on its own | Kicalk among roboports | Py titanium plate 236² | Molybdenum oxide | Anthraquinone 116² |
|---|---|---|---|---|---|
| Poles bridging two networks (`connect`) | 47% | 13% (in routing modules) | | 7% | |
| Layers weighing every way of the columns (`shape`) | | | 19% | 5% | 5% |
| Parting a stack round the Fixtures (`parting`) | | 13% | | | |
| A machine broken out of its Sub-Block placed (`placeApart`) | | 9% | | | |
| Placement weighing spots one by one (`scored`) | | | 7% | 7% | 26% |

What was done again, or more than it had to be:

- **Every spot within reach, asked of in full.** Bridging two pole networks searches outward a wave at a time; each pole of a wave lists every free spot within wire reach (some 2,000 of them, made a list), each measured by `Math.hypot`, and only then are the spots reached already passed over: most of them, wave after wave.
- **The same ways of the columns weighed again.** Layers weighs up to 88,573 ways of putting the Sub-Blocks in columns; the candidates of a try put the same Sub-Blocks, of the same sizes and Nooks, in columns again: in titanium plate 18 of 39 such searches were alike one before, two seconds each. And each step of a search asked `shape`, which made a dozen arrays and closures to say whether a way fits.
- **A stack's copies sorted at every spot.** Parting asks of a stack at every spot of every column it is tried in (2.5 million times a kicalk Maximize), and sorted its copies, looked up their offsets and made a box for every spot each copy tried.
- **The room spanned, found again at every spot.** A broken-out machine weighs every spot round the Sub-Blocks: at each, the span of all the boxes and it (twice, each a list made) and which of its belts' links count.
- **Spots passed over after something was made for them.** Weighing a City Block's thousands of spots one by one, each got its box made before the cheapest tests passed it over.

What changed (each lays out exactly as before):

- **Bridging poles, lean** (poles.js `connect`, `inReach`, `Buckets.each`): a wave's spots are walked where they lie, not listed; a spot reached already is passed over first; within reach by the squares of the distance, `Math.hypot` only where the two all but tie (so the answer is its own: every offset within reach and three tiles beyond checked both ways for each of the catalog's five wire reaches). The search toward a City Block's network (`toward`) asks the same way.
- **The ways that fit, kept** (place.js `inLayers`, `waysKept`): by everything the search over the ways reads (each Sub-Block's size, Nooks and Side Inputs, the links between them, their order, the Side Outputs, the room's size, the corridor, gap and spread); the 24 cheapest of each, the last 64 searches. 
- **A way weighed in typed arrays** (place.js `inLayers` `weigh`): the columns' ranks, widths, heights, turning and crossing belts counted in arrays made once a search; `shape` stays for the ways that fit. 193 searches of four setups checked against `shape` in a scratch copy, every way and its cost the same.
- **A stack's copies, worked out once a placement** (place.js `parting`, `copyLands`): their order, offsets, sizes, the gap above each and the budget; a box made only where a spot is not known yet.
- **The room spanned, once a machine** (place.js `placeApart`): the boxes' span grown by the spot; which links and pipes count found before the spots are weighed.
- **A spot passed over first** (place.js `scored`): whether it runs back of its consumers before its box is made; whether a sum says it is clear decided once a list.

The same layouts, faster:

| Side by side, at once | Before | After |
|---|---|---|
| The full tier, 17 setups, three at once each (the last ones of a side run beside the other's longest: wood 78 → 156 s, small parts 2 76 → 140 s, titanium plate on its own 137 → 170 s; run as pairs below) | 5178 s | 4846 s, every setup the same layout (titanium plate standing on its own: the same failure, no layout) |
| Titanium plate standing on its own, three times | 75.3, 84.8, 238.3 s | 51.8, 62.7, 168.1 s |
| Kicalk among roboports | 417.4 s | 374.3 s |
| Py titanium plate 236² | 391.6 s | 337.3 s |
| Molybdenum oxide among roboports | 588.0 s | 556.2 s |
| Anthraquinone 116² | 249.6 s | 225.3 s |
| Wood 116², twice | 77.3, 83.8 s | 74.9, 85.0 s |

(Pairs run as the cuts came: titanium plate on its own's first two and wood with the poles and the ways kept only; kicalk and titanium plate 236² without the spots passed over first; the rest with all.)

| Share of each run | Before | After |
|---|---|---|
| Titanium plate on its own: poles | 50% | 22% |
| Kicalk: Parting, placing broken-out machines | 13%, 9% | 11%, 3% |
| Py titanium plate 236²: Layers (of it weighing the ways) | 20% (19%) | 6% (6%) |
| Anthraquinone: `scored` | 26% | 19% |

Memory: the ways kept are a few kilobytes a search; nothing else is kept longer than before.

Tried and dropped:
- **More routed modules kept** (module.js `ROUTED_KEPT`). Of molybdenum oxide's 3,401 module routings, 1,432 redid one let go from the 50 kept; with 400 or 2,000 kept, molybdenum oxide and kicalk ran 3% faster, kicalk's peak 1.9 → 2.5 GB.
- **Whole Layers placements kept.** 93 of kicalk's 457 were asked again with the same inputs, but what Layers returns holds the stacks parted for this placement's Sub-Blocks: keyed safely, not worth it.
- **A machine found by its row** (core.js `buildCore` `machineAt`) and the way out of a fluid connection asked in a loop: 400 cores dumped from nexelit, built by both in one process turn about, 12.0 vs 11.8 s. A profile's lines had put a quarter of `buildCore` there; two processes timed apart had shown a third saved: both load.
- **Spot lists kept by size, and only the spots each pass takes made** (place.js `siteRules` `spots`): `scored`'s share the same.

Tests: bridging poles finds the poles it found before, round a wall between two rows of machines and toward a substation far off (poles.test.js); the same Sub-Blocks in columns again stand where they stood (city.test.js).

Still:
- Designing, 25–60%: `buildCore`'s time is spread over its lines; cores of 40 machines and more (nexelit: 3,759 built in six tries, 4.7 ms each) are built from every variant where no copies are designed.
- Routing (`search` in router.js), 10–38%: pipes most (`growTree`).
- Kicalk's Layers still scans every row of every column it tries for each Sub-Block (`column`), and parts stacks at most of them.
