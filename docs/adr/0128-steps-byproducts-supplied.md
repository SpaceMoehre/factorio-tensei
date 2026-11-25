---
status: accepted — refines Supplied Items (ADR 0041, 0055, 0068) and Recycled Byproducts (ADR 0035)
---

# Steps' byproducts supplied

The setup: Py antimony oxide at 60/min (sb-oxide-02 and the user's Uses), no City Block. The grade 1 screeners make grade 2 antimony besides grade 1; the jaw crushers make grade 2 from grade 1. The grade 3 screeners make grade 4 besides grade 3; the secondary crushers make grade 4 from grade 3.

The user's rule: a byproduct a step of the chain takes is not output while a step makes it.

Cause: only a Byproduct Use's products joined a step making the same item (a Supplied Item, ADR 0041), and only an item coming by train was taken from a step making it besides (a Recycled Byproduct, ADR 0035). A step's byproduct that another step makes as its item left by train: the screeners' 803.6/min of grade 2 while the jaw crushers made 2678.57/min, and 1339.3/min of grade 4 while the secondary crushers made 171.43/min.

What changed:
- **chain.js** `expandChain`: a step's solid byproduct that another step makes as its item is a Supplied Item, as a Use's product is (`supplies`): it joins that step's belt (`joins`, or a belt of its own into those taking it where more than a lane, `feeds`, ADR 0068), and that step makes that much less. Not where a Use takes it, nor where the step would then make none (then by train, as for a Use's). One the step takes itself through the steps before it too (Py's sb-dust's grade 4, the crushed antimony it takes made of it): its join is in a loop, so each maker's is tapped off into the steps taking it (ADR 0127). The rates solve as before (a linear system): the screeners' grade 2 scales with the jaw crushers it feeds, so it never covers more than they make.

| Py antimony oxide 60/min | Jaw crushers (grade 2) | Secondary crushers (grade 4) | Ore by train | Grade 2 / 4 by train |
|---|---|---|---|---|
| Before | 2678.57/min | 171.43/min | 2678.57/min | 803.6 / 1347.9/min |
| After | 222.12/min | 18.48/min | 222.12/min | 0 / 0 |

Its layout (build, no City Block): 60/min, valid, starving nothing; grade 2 joined (the screeners' belt side-loading onto the jaw crushers'), grade 4 tapped off the grade 3 screeners', the sb-dust's and the secondary crushers' belts into the ball mills (a loop, ADR 0127).

The user had added a Byproduct Use of grade 4 by the ball mills' own recipe (sb-crushed) for the sb-dust's 8.6/min left over: a second Sub-Block of the same recipe. With no grade 4 leaving by train the page no longer offers it.

Of the suite's setups only Py advanced circuits' chains change: a cobalt extract made besides joins the step's (in a loop), what comes by train 24687.5 → 22587.5/min. advanced-circuit-116 (20 candidates a try): 44.96 → 60/min (its Goal), 1 machine, 846 → 557 s, recorded; advanced-circuit-116-right the same layout. Every other setup's chain the same, so its layout too.

Tests: supplied.test.js: antimony oxide by sb-oxide-01, no grade byproduct by train, the two supplies, the ore 9375 → 818/min.

Still:
- A step's fluid byproduct another step makes is supplied only through valves (ADR 0062), as before.
