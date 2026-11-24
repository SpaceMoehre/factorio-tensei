---
status: accepted — refines ADR 0081, ADR 0025 and ADR 0060
---

# The search at Bands' top first

The user's setup: Py navens 60/min (navens cultures, 10 × 10, four navens modules), every side in and out, in the roboport City Block (236², Buffer 4, 99 Fixtures: big poles and roboports in rows about 30 apart, a column of poles down the middle), Maximize on. Their page: 335.1/min, 133 cultures (six Bands Parts of 21, one of 7), still trying after many minutes; the Foretelling said 98.

Found in tries that should have fit: one try alone at 147 cultures fit in 25 s, at 170 in 31 s (valid, starving nothing). Maximize never tried them:

- **No search above a Bands fit** (ADR 0081). Bands' Parts hold 153, FILL more than the 98 foretold, so Bands went first (ADR 0073) and fit 125; the search then tried nothing above it. ADR 0081 rested on vrauks and trits, where the search's Placement round the Fixtures packs looser than Bands. Here its copies Make Way round the few Fixtures (a culture left out where a pole or roboport stands) and stand in rows across the Fixture rows; Bands' Parts (17 rows) stand only between them: the user's two 54-row gaps held two Parts and one.
- **Bands' tries up to their whole budget.** Bands bisected between 125 and 152 one try at a time, on the main thread, the workers idle: 138 ran its 1000 s. The page reached 145 (with Annexes) at 3561 s.

What changed (maximize.js `maximize`, `afterTop`):

- **The search once at Bands' top first.** Where Bands would go first, the search tries once at the most Bands' Parts hold, alone (`atTop`, as `probing`; with tries at once, the tries under way stopped). Fitting there, Bands cannot fit more and is not tried: the search goes on above. Not fitting, Bands goes as before, and fitting FILL more than foretold the search tries nothing above it (ADR 0081, `past`).
- Bands' top is the try asked: a try at Bands' fit + 1 would wait for Bands' whole bisection (up to 1000 s a try here), and the workers sit idle while Bands runs (it cannot be interrupted).

| The user's: Py navens 60/min, 236² roboport City Block, every side (page-like, 3 tries at once, 1 h cap) | Before | After |
|---|---|---|
| Rate, cultures | 365.37/min, 145 (Bands 21+21+7+21+21+21+21, Annexes 11 + 1) | 430.91/min, 171 (one Sub-Block, Giving Way) |
| Best at, done at | 3561 s, cut at 3600 s | 1075 s, done at 1075 s |
| First layout above 125 | 1213 s (Bands 131) | 106 s (the search at 153) |
| Valid, starving | yes, 0 | yes, 0 |
| The user's page | 335.1/min, 133 cultures, still trying | |

| Suite (K candidates, seed 1) | |
|---|---|
| Full tier, 23 setups | every layout the same |
| New: navens-236 (K 50: 153 fits at the search's 45th candidate) | 413.26/min, 164 cultures, valid, starving 0 |
| As pairs (HEAD and this side by side), K candidates | vrauks 37.3 → 51.6 s, trits 118² 67.9 → 74.1 s, the same layouts: the search's try at Bands' top finds no room (78 paddocks, 27 reefs) |

Tried and dropped:
- **The search once above Bands' fit, after Bands** (its fit + 1). The search may climb only once Bands' whole bisection is done (138 alone ran 1000 s on the page); Bands takes no candidate count, and the K 20 run was still in it past 25 minutes.

Tests: Maximize among Fixture rows tries the search at Bands' top first and, fitting, never Bands (Py navens, K 50); with tries at once in vrauks' City Block, three search tries are begun (the two beside the top's worker, then one at Bands' top, 78), then Bands' 78 (city.test.js). 366 pass.

Still:
- At a fixed K the search at Bands' top may miss where a budget finds it: navens at 153 needs 45 candidates (the suite's K 50). At K 20 it misses, and Bands' tries run without a limit (`bands` takes no candidate count).
- The climb from 153 went a culture a try (the Foretelling kept saying the best); 160–162 found no room, Giving Way found 169 and 171.
- Where the search fits between Bands' fit and its top, Bands goes first and the search tries nothing above it (ADR 0081).
- Vrauks and trits pay one search try that finds no room (14 s and 6 s at K candidates).
