---
status: accepted — refines ADR 0053, ADR 0031 and ADR 0084
---

# Annexes that fit, kept

The user's rule: find why room stays empty, and fill it.

How it was found: the largest empty rectangles of each finished suite layout. Py molybdenum oxide among roboports (236²) ends at 4 furnaces with 97 × 22 and 37 × 55 free; Py silicon (116²) with 87 × 21. An Annex of one machine was then tried beside each finished layout as Maximize tries it (`attempt` in its room, 20 candidates), and one level down (the search's every candidate, the Annex joined to the layout and checked).

Causes:

- **The Precheck ended an Annex's try that fits.** Above the highest Count designed, a try first designs the Sub-Blocks making the Side Output from structured variants only and ends where they starve (ADR 0053). Molybdenum oxide's Annex of 1: its milling starved so, "every design starves (75/min short)", no candidate tried, every time; designed as the search designs (random draws too) it does not starve, and the Annex fits at the 12th candidate. ADR 0084 had found this the one try the Precheck ended in the full tier.
- **A copy's pipe joined a pipe built before of another fluid.** A Sub-Block's module is routed on its own, apart from the room it will stand in, and Placement keeps its box off what stands there, not its pipes off pipes beside it. Silicon's Annex of 1 fit at the first candidate, its pure sand washers' water pipe at their module's edge beside the first layout's muddy sludge pipe; joined, the two were one pipe, so the Annex was dropped as invalid and the try counted as a miss (its later Annex, allowed to starve, fit).

What changed:

- **No Precheck verdict in an Annex's room** (search.js `search`, `designAll`): it is still made there, for the time the candidates get (twice as long as designing took, ADR 0059: skipping it cut molybdenum oxide's tries short, ADR 0084), but a starving verdict there ends nothing: the search designs as it would and ends only where its own designs starve.
- **A copy's pipe beside a pipe built before** (compose.js `placeAll`): one that would join a built pipe of another fluid fails the layout as placed, and the search tries its next candidate.

| | Before | After |
|---|---|---|
| Py molybdenum oxide among roboports, the suite (20 candidates a try) | 799.99/min, 4 furnaces | 999.98/min, 4 and an Annex of 1 |
| Py coke 116², the suite | 1800/min, 5 towers | 2520/min, 7 |
| The 14 others | | the same layouts (silicon the same 555/min, its first Annex now found by the Annex's own tries; titanium free no layout either way) |
| Py molybdenum oxide on the page (`run.mjs`, 60 s tries, side by side) | 799.99/min, ended on "milling: every design starves", done at 926 s | 999.98/min (4 + 1), best at 1162 s |
| Py coke on the page (1000 s tries, side by side) | 2160/min, 6 in one layout, done at 1158 s | the same: with the page's time its first layout fits 6, and no Annex beside it either way |

Which fix: with the Precheck change alone, coke laid out as before; its gain in the suite is the built pipes' check (an Annex whose pipe joined a built one was dropped). Molybdenum oxide's is the Precheck's, and shows on the page too.

Tests: an Annex's copy pipe never joins a pipe of another fluid built before beside it (fluids-between.test.js). No small setup shows the Precheck's false verdict; molybdenum oxide in the suite does.

Still:
- Silicon's second Annex finds no room: the strips left (22 × 75, 22 × 27, 27 × 22) hold its soil extractors (13 × 70 designed), not the whole chain of five Sub-Blocks beside them.
- An Annex is the whole chain again: room in strips that holds the first Goal's machines but not every step stays empty (Extensions grow only fluids, ADR 0038).
