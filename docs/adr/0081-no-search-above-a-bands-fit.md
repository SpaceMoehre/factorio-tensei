---
status: accepted — refines ADR 0025, ADR 0060 and ADR 0073
---

# No search above a Bands fit

The user's rule: the same output in less time. Layouts may differ; no setup may make less.

How it was measured: every try of every Maximize in the suite, in a scratch copy: its Count, its outcome, its seconds, and whether it changed the bounds.

What was never used:

- **Search tries above a Bands fit.** In Py vrauks and trits among roboports, Bands goes first (its Parts hold FILL more than the Foretelling foretells, ADR 0073) and fits 78 paddocks and 27 reefs. The search then tried 79, 78.625 and 78.3125 (28, 27.625 and 27.3125), each ending "no room": 237 of vrauks' 273 s, 77 of trits' 196 s. Its Placement round the Fixtures packs looser than Bands' Parts in their Slots (vrauks: 55 paddocks; trits: 18 reefs). Of vrauks' 237 s, 152 went on routing every design to count its room between the Fixtures.
- **Bands waiting for every try, with tries at once.** Bands' top (the most its Parts hold) is worked out in a worker beside the first tries (ADR 0060), but Bands itself ran only once the search's tries were done: vrauks' 78 came at 503 s, after the search had climbed slowly to about 55.

What changed (maximize.js `maximize`):

- **No search above a Bands fit** (`past`): Bands gone first and fitting FILL more than the Foretelling foretold, Maximize tries nothing above it. Elsewhere the path is the one before.
- **Bands as soon as its top is known** (tries at once): where the top holds FILL more than foretold before any try (`foretold0`) and more than the best so far, Bands runs then, as one try at a time goes first; fitting FILL more than foretold, no search try begins after it, and those under way at no more machines than it fit are stopped.

Results:

| The suite (K candidates, side by side, the full tier) | Before | After |
|---|---|---|
| Py vrauks among roboports | 124 s | 28 s, the same layout |
| Py trits among roboports | 95 s | 65 s, the same layout |
| The 14 others | | the same layouts (they take the path before) |

| On the page (`run.mjs`, the setups' own budgets) | Before | After |
|---|---|---|
| Py vrauks, one try at a time | done at 233 s | the same 78 paddocks, done at 116 s |
| Py trits, one try at a time | done at 123 s | the same 27 reefs, done at 73 s |
| Py vrauks, 2 tries at once | 78 paddocks at 503 s, done at 573 s | 78 at 55 s, done at 142 s |
| Py trits, 2 tries at once | 27 reefs at 175 s, done at 197 s | 27 at 133 s, done at 153 s |

Tried and dropped:

- **A climb of tries that may starve stopping at a Count that found no room.** Hot air 19 s sooner, but Py titanium plate lost 14 → 11 machines, twice: in its last Annex 1 machine found no room in K candidates where 2 and 3 then fit. With K candidates a try, more machines do not always take more room.
- **No Annex probe where its machines' tiles alone exceed the room** (anthraquinone: 1036 tiles of machines for 576 of room). The room counts only spots where a Goal's machine fits with a tile round it; smaller machines stand in slivers outside them. Unsafe; it was in the batch that lost titanium plate.
- **Bands asking whether two rows fit only where a Slot is ranked** (same work): designs saved only in trits (25 → 21).
- **Bands' top cheaper where it comes out 0** (molybdenum oxide 36 s, nexelit 21): each check designs a Part of its own; no cheaper test found that answers the same.
- **Fallbacks**: 0–1 s a setup in the instrumented runs; nothing to cut.

Tests: Maximize with tries at once in vrauks' City Block begins only 2 search tries (city.test.js; 9 before).

Still:
- Designing is 70–80% of silicon's and nexelit's runs; nexelit's Precheck 4.5–6.7 s a try, passing every time.
- Bands' first look 21–36 s in trits and vrauks, 5–36 s where it answers 0.
- Annex probes in Bands' layouts fail after 7–15 s each.
