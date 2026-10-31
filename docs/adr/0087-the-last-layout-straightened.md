---
status: accepted — refines ADR 0051 and ADR 0085
---

# The last layout's belts straightened as Compactness weighs turns

The user's rule: find what is unnecessary in the layouts and take it out; "belts wiggle around … where underground belts would do".

How it was found: ADR 0085 straightened every finished layout with a turn weighing a tile and every suite rate stayed, but on the page Py small parts 2's Annex beside the straightened first layout fit a machine fewer: a tidier first layout leaves its Annexes room of another shape. Only the layout Maximize ends with has nothing laid out beside it after.

What changed:

- **The last layout straightened once more** (jobs.js `runJob`; maximize.js `tidied`; compact.js `tidyBelts`): once Maximize ends, its last layout's belts are straightened again (ADR 0051) with a turn weighing a tile (`straightenBelts` `turn`; router.js `routeLink`, `legCost`), and shown as one more 'best' at the same rate. Kept only where the straightened block is valid and starves and delivers no less; else the layout as it was.
- Maximize's tries, Annexes, Extensions and every layout it shows on the way are as before: what is laid out beside a layout is found beside it as it was laid out.

| The fast tier's layouts (suite, 20 candidates a try), before → after | Turns | Jogs (a turn one way, then the other within three tiles) | Belts, undergrounds |
|---|---|---|---|
| Py trits 118² | 123 → 89 | 42 → 21 | 2573 → 2346, 274 → 258 |
| Py perylene 116² | 147 → 137 | 48 → 39 | 1198 → 1191, 310 |
| Py small parts 2 116² | 311 → 299 | 62 → 55 | 2801 → 2806, 604 → 598 |
| Py nexelit 100² | 158 → 150 | 37 → 32 | 1101 → 1087, 454 → 452 |
| Py anthraquinone 116² | 81 → 75 | 29 → 23 | 540 → 547, 106 → 104 |
| Py hot air 118² | 49 → 45 | 20 → 16 | 432, 148 |
| Py silicon 116² | 104 → 102 | 35 → 32 | 780 → 793, 200 → 198 |
| Py small parts 100² | 26 → 24 | 10 → 9 | 203 → 201, 66 |
| Py coalbed gas 80 × 40 | 13 | 5 | the same |

The full tier, side by side: every rate the same, 16 of 16, each valid and starving nothing (coalbed gas and small parts 100² the same layout: nothing to straighten). It costs one straightening at the end: 0.1–3.6 s (small parts 2's 3400 belts the most).

Tests: a belt stepping down twice where once does turns twice in the layout shown, the block laid out kept (straighten.test.js).

Still: a belt that turns on a tile an inserter takes from keeps that turn (its anchors stay); a layout shown before the end, or a Maximize stopped on the page, is shown as laid out.
