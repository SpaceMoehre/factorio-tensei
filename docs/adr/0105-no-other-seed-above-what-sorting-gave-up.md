---
status: accepted — refines ADR 0090
---

# No other seed above what sorting gave up

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time. This one is a schedule change: Maximize tries less; it is kept because no suite setup lays out otherwise, at three seeds.

What was done again, Py coke in its 116² City Block at 20 candidates a try (`maxdet.mjs`, each try logged with its City Block and outcome): 5 coke ovens fit, a byproduct riding on alone; the sorting phase (ADR 0056) found no room for 5 sorted out, and kept 4. Then Another seed (ADR 0090) tried the lowest miss above 4, 5.3125, five times with other seeds: 22 s of a 102 s Maximize. The first fit, and was passed over (a byproduct riding on alone, as Another seed requires, ADR 0090); the other four found no layout. Unsorted, a try above the most that fit can fit only as that one did, its byproduct riding on: the sorting phase had already found none sorted out at fewer machines.

What changed:

- **Another seed tries nothing where the sorting phase kept fewer machines than fit** (maximize.js `maximize`, `sortedDown`).

| Full tier as pairs (`pairs.mjs`), 20 candidates a try | Before | After |
|---|---|---|
| Coke 116² | 247.0 s | 193.4 s (the same layout, 2520/min) |
| The other 16 | 2508.1 s | 2516.4 s, every setup the same layout |
| All 17 | 2755.1 s | 2709.8 s |
| Fast tier at seeds 2 and 3, coke too (`ratecmp.mjs`) | | every rate the same (24 of 24); coke at seeds 2 and 3 the same layouts in the same seconds (146 → 148 s, 143 → 143 s) |

| Page-like, three tries at once (`run.mjs --parallel 3`, the two sides at once) | Before | After |
|---|---|---|
| Coke: tries, best at | 24, 956.7 s | 19, 834.0 s (2160/min, 6 machines, both) |

Tests: Py coke in its City Block, its Annexes and Starving off: after the best the sorting phase kept below what fit, no try follows (city.test.js; before, five).

Still:
- Coke's designing is a third of its time (buildCore 9% on its own, no line of it more than half a second); molybdenum oxide's routing of every design to choose one (buildSpec) a third of its.
