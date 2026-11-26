---
status: accepted — refines Byproducts joined in a loop (ADR 0127), Byproduct Use (ADR 0054)
---

# A belt all tapped off ends in a taker

The user's rule: after a filter splitter the two outputs are the filtered item and everything else; where only one item is left on the belt, no filter splitter is needed: the belt goes on into the step taking it. Nothing already split off rides on to the train.

Setup: Py tin plate in 116² (ADR 0131): the grade 1 screeners make grade 1 and grade 2, the grade 2 crushers grade 1 and stone, the rejects crushers grade 1; the grade 3 screeners take the grade 1 of all three (a pool, ADR 0127).

Before: each product of those belts was tapped off into its taker (a filter splitter each), and the belt, nothing left on it, ran on to the train all the same (ADR 0127: a belt to tap from must run somewhere), shown with the items split off before it: 6 splitters, three tin belts to the train.

What changed:
- **flows.js** `buildFlows`: a producer's belt every product of which is tapped off, none left for the train, goes into one of its takers itself: the biggest tap, of an item tapped into no other, whose taker's steps lead not back to the producer, becomes an Internal Path (each product's own belt so, One Item a Belt). The others are tapped off before it, as before. It stays out of the Dependency Order (`loose`), placed as the tap was: in it, the screeners, the grade 3 screeners and the steps after them stood in one row 330 tiles long, and nothing placed. A ring's taps stay as they are (Py's plutonium shuffles).
- **routes.js** `buildRoutes`: such a belt (`loose`) takes its share of what its taker takes (`portion`), as the tap did; without, the taker's whole demand was charged to it (the grade 3 screeners' 600/min on a belt bringing 420, Py advanced circuits' nisi 60 on a cobalt extract belt of 30): every layout starved, or fewer fit.

Py tin plate, 116², 32 poles (page budget, 2 tries at once):

| | before | after |
|---|---|---|
| rate | 945/min | 945/min |
| splitters | 6 | 4 |
| tin belts to the train | 3 (grade 1 + 2, grade 1 + stone, grade 1) | 1 (the rejects crushers' grade 1, a ring) |
| time to best | 416 s | 177–295 s |

Suite: advanced-circuit-116 60 → 69.37/min (its cobalt extract belt into the nisi itself, 2 machines); tin-plate-116 674.33 → 598.76/min at K 20 seed 1, seeds 2 and 3 590.62 → 590.62 and → 598.76 (search luck; the page's search 945 as before); every other setup's flows and routes the same (each compared at its first count), the pu-238 ones the same layout.

Tests: supplied.test.js: the tin screeners' belt ends in the grade 3 screeners, its share, the grade 2 tapped off, nothing split off to the train; byproduct-loops.test.js: an isotope's own belt on an Internal Path only so (`loose`).

Still:
- A belt into a ring (the rejects crushers' grade 1 into the grade 3 screeners, which make the rejects) is still tapped off and runs on to the train empty: without that gate Py's plutonium shuffles found no layout (pu238-processed-116 3.59 → 0/min).
