---
status: accepted — refines ADR 0058
---

# Hot paths written out

The user's rule: the same result in less time. A build after a speed-up delivers at least what it did before; this pass changes no layout at all.

How it was measured: CPU profiles of the suite's ten fast setups (`suite-one.mjs`, the page's path in-process, 20 candidates a try), summed by function, then by line within the hottest functions (V8's position ticks).

Where the time went (self time, the largest on every setup):

| | Hot air | Nexelit | Small parts 2 | Anthraquinone | Trits |
|---|---|---|---|---|---|
| Router: a belt's moves (`beltMoves`) | 20% | 3% | 19% | 2% | 18% |
| Router: a pipe's moves (`pipeMoves`) | 9% | 7% | — | 23% | 7% |
| Router: `fedByOther` | 6% | 1% | 8% | — | 7% |
| `buildCore` | 4% | 28% | 4% | 6% | 7% |
| Placement: `lands`, `part` | 3% | — | 5% | 2% | — |

Within those, a few lines took most of it:

- **Object spreads.** A tunnel's two pieces were each spread from one base (`{ ...base, underground: 'input', … }`): 25 s of hot air's 177 in the belt's moves, 13 s in the pipe's. `buildCore` spread every inserter it built into a new object with what it moves (`{ ...inserter(…), flow, machine, ...moving(…) }`): 24 of nexelit's 58 s in `buildCore`. Each spread copies through V8's generic object cloning; the same keys written out cost a fraction.
- **The same tile asked three times.** A belt's moves asked, for each of three headings, whether a belt may stand on the tile it leaves (`canBelt`: free for it, fed by no other belt), then again for a tunnel: four times the same answer.
- **Keys for nothing.** Every move made a string key to look up in the tiles held for the route's other links, most often an empty set; every length of tunnel looked up its line's tunnels again.
- **Large numbers as Map keys.** Placement's memos (where a Sub-Block lands, where its stack parts, where a copy lands) were keyed by numbers above 2³⁰ (heap numbers, not small integers) or by strings: a Map finds those about 3.7 times slower.

What changed (each lays out exactly as before):

- **A tile's own checks once a step** (router.js `beltMoves`): whether a belt may stand on it, asked once for every heading and tunnel; no key made where no tiles are held (`held`); a tunnel's line looked up once for every length (grid.js `tunnelLine`); tunnel pieces and the search's start states written out; `fedByOther` makes its key only where a neighbour may feed it.
- **The heap sifts with a hole** (router.js `Heap`): the same comparisons, the same order, no swaps.
- **Cores built without spreads** (core.js `buildCore`): an inserter carries what it moves on its own object; slots and picked connections written out; the belt rows' tiles gathered only where a connection asks.
- **Placement's memos by small integers** (place.js `lands`, `part`, `copyLands`): by Sub-Block (or copy) and size, then corner.

The same layouts, faster (`npm run suite -- --tier fast`, the code before and after side by side, 4 setups at once each; every setup `same layout`):

| | Before | After |
|---|---|---|
| Py small parts in 100² | 33.1 s | 23.8 s |
| Py hot air 118² | 393.9 s | 215.5 s |
| Py anthraquinone 116² | 536.7 s | 319.1 s |
| Py coalbed gas 80 × 40 | 40.1 s | 31.7 s |
| Py silicon 116² | 654.7 s | 440.4 s |
| Py trits 118² | 865.1 s | 500.9 s |
| Py nexelit 100² | 258.2 s | 204.6 s |
| Py perylene 116² | 530.4 s | 361.7 s |
| Py small parts 2 116² (again, two at once) | 242.7 s | 164.2 s |
| Py vrauks 100² (again, two at once) | 363.2 s | 247.8 s |

The first eight: 3312 → 2097 s (-37%). (In the side-by-side run the code before ran its last two setups alone once the code after had finished, so those two were run again together.) On the page every try's candidates get the same wall-clock budget: more of them fit in it.

The runs with no time limit now have one (`watchdog.mjs`): suite-one.mjs (3 h) and maxdet.mjs (4 h) run themselves again in a child process and kill it past `TIMEOUT` seconds, exiting 124. A try is synchronous, so no timer inside the process could stop it. The suite passes each setup's timeout through. `npm test` gives each test 30 minutes at most (the longest took 254 s).

Tests: the 321 as before.

Still:
- Router `search` itself (its loop, `conflictsWithOwnPath`), `landing` and `scored` in placement, and garbage collection (7–10%) are the largest self times left.
- Designing the Sub-Blocks is still 35–60% of most fast setups, routing their modules included.
- Bands' first look (`twoRowsFit`) is 24% of trits' run.
