---
status: accepted — refines ADR 0097
---

# Failures kept longer

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time. This one is the same work: every layout the same, by its hash.

How it was measured: every module routing of molybdenum oxide among roboports counted at 20 candidates a try (module.js `routeModule`, in a scratch copy): 4,480 asked, 557 taken as routed, 3,923 routed (122.6 s of a 352.8 s run), 1,515 of them failing. 1,704 of the 3,923 had been routed before, their core let go from the 50 kept (`ROUTED_KEPT`; reuse distances up to 1,000 cores): 38.1 s, 464 of them failures (14.8 s). Keeping more cores costs memory: 1,000 kept, −7% for +0.5 GB (the modules are the memory, not their keys: keyed by a hash, the peak stayed 3.0 GB). A failure holds only its error.

What changed:

- **Failed routings kept apart, FAILED_KEPT (20,000), by a hash of the core and the options** (module.js `routeModule`, `failedKept`, `hashOf`): a core let go from those kept fails again at once, with the same error.
- **A failure kept as its fields alone** (the error's own fields and message on its class, no stack trace): a PowerError's captured stack trace holds what its frames held; kept by the thousand, molybdenum oxide's peak rose 2989 → 3443 MB, as fields alone 2961 → 3048 MB.

| Full tier as pairs (`pairs.mjs`), 20 candidates a try, twice (host loaded 13–28) | Before | After |
|---|---|---|
| Hot air 118² | 65.0 s; 73.2 s | 58.3 s; 63.7 s (−10%, −13%) |
| Anthraquinone 116² | 141.6 s; 180.7 s | 138.2 s; 172.4 s |
| Coke 116² | 144.0 s; 197.3 s | 141.6 s; 188.5 s |
| Molybdenum oxide among roboports | 508.5 s; 797.0 s | 500.5 s; 772.0 s |
| All 17 | 2213.3 s; 3204.9 s | 2184.5 s; 3155.1 s (−1.3%, −1.6%), every setup the same layout |

(The first pairs with the failures kept whole, the second as fields alone.) Peak memory (`suite-one.mjs`, maxRSS): molybdenum oxide 2961 → 3048 MB, titanium plate 2021 → 2048 MB, kicalk 1574 → 1554 MB.

Tests: a routing that failed fails again once its core was let go from those kept, the same class and message, and then the same error, not routed again (module.test.js).

The session's cuts together, ADR 0097–0107, timed as pairs (`pairs.mjs`: each setup on the code before ADR 0097 and on this one at the same moment, the longest first, two pairs at once; host loaded 13–28):

| Full tier | Before ADR 0097 | After ADR 0107 |
|---|---|---|
| Kicalk among roboports | 761.2 s | 181.9 s |
| Molybdenum oxide among roboports | 702.7 s | 569.6 s |
| Py titanium plate 236² | 511.4 s | 431.4 s |
| Anthraquinone 116² | 320.9 s | 220.4 s |
| Rayon 116² | 289.3 s | 187.2 s |
| Coke 116² | 250.4 s | 175.6 s |
| Titanium plate standing on its own (no layout, the same failure) | 258.2 s | 164.0 s |
| Wood 116² (the user's) | 148.1 s | 134.3 s |
| All 17 | 4065.7 s | 2763.0 s (−32%), every setup the same layout, each faster (−3% to −76%) |

Still:
- Molybdenum oxide's layouts routed again once let go (1,240, 23 s of 353): kept, they cost memory.
- Where the time goes now (`suite-one.mjs` profiled, 20 candidates a try): titanium plate 236² (417 s) routing its links, the router's search 46% inclusive, its Annexes 49%; anthraquinone (95 s) designing 37% (buildCore 22%), Placement 23%; kicalk among roboports (119 s) Placement 25%, routing its modules 21%, the router's search 19%. Garbage collection 6–10% in each.
