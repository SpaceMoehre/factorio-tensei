---
status: accepted — refines Supplied Items (ADR 0041, 0055, 0068) and Recycled Byproducts (ADR 0035)
---

# Steps' byproducts supplied

The setup: Py antimony oxide at 60/min (sb-oxide-02 and the user's Uses), no City Block. The grade 1 screeners make grade 2 antimony besides grade 1; the jaw crushers make grade 2 from grade 1. The grade 3 screeners make grade 4 besides grade 3; the secondary crushers make grade 4 from grade 3.

The user's rule: a byproduct a step of the chain takes is not output while a step makes it.

Cause: only a Byproduct Use's products joined a step making the same item (a Supplied Item, ADR 0041), and only an item coming by train was taken from a step making it besides (a Recycled Byproduct, ADR 0035). A step's byproduct that another step makes as its item left by train: the screeners' 803.6/min of grade 2 while the jaw crushers made 2678.57/min, and 1339.3/min of grade 4 while the secondary crushers made 171.43/min.

What changed:
- **chain.js** `expandChain`: a step's solid byproduct that another step makes as its item is a Supplied Item, as a Use's product is (`supplies`): it joins that step's belt (`joins`, or a belt of its own into those taking it where more than a lane, `feeds`, ADR 0068), and that step makes that much less. Not where a Use takes it, nor one the step takes itself through the steps before it (`takesOf`: a loop, Py's sb-dust's grade 4, the crushed antimony it takes made of it), nor where the step would then make none (then by train, as for a Use's). The rates solve as before (a linear system): the screeners' grade 2 scales with the jaw crushers it feeds, so it never covers more than they make.

| Py antimony oxide 60/min | Jaw crushers (grade 2) | Secondary crushers (grade 4) | Ore by train | Grade 2 / 4 by train |
|---|---|---|---|---|
| Before | 2678.57/min | 171.43/min | 2678.57/min | 803.6 / 1347.9/min |
| After | 233.81/min | 19.45/min | 233.81/min | 0 / 8.6/min (sb-dust's, a loop) |

Its layout (build, no City Block): 60/min, valid, starving nothing, 138 × 44; both joins routed (the screeners' belts side-loading onto the crushers').

No suite setup's chain changes (every setup's entries and supplies the same), so no recorded layout can.

Tests: supplied.test.js: antimony oxide by sb-oxide-01, no grade byproduct by train, the two supplies, the ore 9375 → 818/min.

Still:
- A byproduct a step takes through the steps before it (sb-dust's grade 4 into the crushed antimony) still leaves by train: a Recipe Loop's feedback would take it.
- A step's fluid byproduct another step makes is supplied only through valves (ADR 0062), as before.
