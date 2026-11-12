---
status: accepted — refines ADR 0058
---

# Failed variants kept apart

The user's rule (the speed-up skill, "take at least 25 hours", continued): the same result in less time. This one is the same work: every layout the same, by its hash.

How it was found: anthraquinone's designing was 37% of its run, `buildCore` 22%. Every ask of the cores kept counted (design.js `keptCores`, in a scratch copy, 20 candidates a try):

| | Asked | Taken as kept | Built | Built again, let go before |
|---|---|---|---|---|
| Anthraquinone 116² | 37,076 | 853 | 36,223 | 16,875 |
| Molybdenum oxide among roboports | 85,372 | 7,575 | 77,797 | 40,415 |
| Coke 116² | 35,780 | 4,546 | 31,234 | 5,285 |
| Titanium plate 236² | 65,330 | 940 | 64,390 | 10,334 |

The 2,000 kept turned over before most were asked again. A third of anthraquinone's variants (6,002 of 19,348) and a quarter of molybdenum oxide's fail, and a failure took a place among the cores like any core. Each run's asks dumped and replayed (a scratch replay, each core's build time as measured): anthraquinone's building 18.1 s as kept, 12.3 s with failures kept apart (9.9 s if each were built once); molybdenum oxide's 31.2 → 28.3 s. More cores kept instead costs memory (a core some 59 KB, ADR 0102): 8,000 kept, anthraquinone 11.0 s.

What changed:

- **A variant that failed is kept apart, its message alone, FAILED_KEPT (50,000)** (design.js `keptCores`, `failed`): it fails again at once, and the 2,000 kept are cores.

| Full tier as pairs (`pairs.mjs`, host loaded 15–19) | Before | After |
|---|---|---|
| Anthraquinone 116² | 187.9 s | 179.7 s |
| Silicon 116² | 206.7 s | 198.7 s |
| Molybdenum oxide among roboports | 684.2 s | 664.9 s |
| All 17 | 2913.2 s | 2875.0 s (−1.3%), every setup the same layout |

Peak memory (`suite-one.mjs`, maxRSS): molybdenum oxide 3019 → 2960 MB, anthraquinone 1045 → 999 MB.

(A session note had this tried before ADR 0102 and timed "−1.5%, noise", side by side; as pairs it is the same size again.)

Tests: a search like one before it takes its designs and lays out the same (city.test.js, as it was): it asks the kept cores and failures again.

Still:
- Molybdenum oxide's cores that build, built again after they were let go: replayed, 28.3 s of building against 18.8 s were each built once.
