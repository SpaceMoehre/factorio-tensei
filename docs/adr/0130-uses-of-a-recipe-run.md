---
status: accepted — refines General Use (ADR 0041, ADR 0042), Recycled Byproduct (ADR 0062)
---

# A General Use of a fluid by a recipe a step runs is that step's

Setup: Py pu-238 and fuel rods mk01 at 4.79/min each among the 32 poles of 116², the plutonium oxidation's sb phosphate 2 and the antimony phosphate's purex concentrate both into purex antimony void, its phosphorous acid made into phosphoric acid, that and its antimony oxide back into antimony phosphate (General Uses of each).

Before: every General Use was a step of its own, taking all of its item, its recipe's other ingredients by train. Purex antimony void ran twice (one taking all the sb phosphate 2, its concentrate by train; one all the concentrate, its sb phosphate 2 by train: 431.87/min), making twice the phosphorous acid, and antimony phosphate ran twice more beside the sb-hpo-pu step, each taking all the phosphoric acid or antimony oxide and making concentrate: the concentrate went round more than it took (0.8 + 0.33 a pass) and no rates balanced ("without the Use of Purex concentrate 1 by Purex antimony void or …").

What changed:
- **chain.js** `expand` `addUse`: a General Use of a fluid by a recipe a step of the chain or another Use runs already (valves buildable) is not a step: the fluid is that one's, fed back to it as any byproduct would be (a Recycled Byproduct through valves, the train bringing the rest). A solid's stays a step of its own (fed back a solid must cover all its taker takes): Py's antimony oxide into a second antimony phosphate, its sb-hpo-pu joining the step's.

- **chain.js** `expand` `visit`: an item made by the recipe chosen for it that a step of the chain runs already, and makes, is that step's byproduct, not a second step of it: it comes as one not made here does (recycled from that step, the train bringing the rest). The user's purex concentrate made by antimony phosphate, the sb-hpo-pu step's recipe: two steps of it, each supplying the other what it makes, were no system of rates (singular): every supply dropped and the separation ran at 4.79/min, 72 times the rate (phosphoric acid 60,012/min by train).

Py pu-238 + fuel rods, the loop closed (purex concentrate made, sb-hpo-pu by a second plutonium oxidation), 116², 32 poles: no rates balance → 4.72/min each, 16 shuffle 2s, 109×108, valid, starving 0, 302 s.

Py pu-238 + fuel rods, 116², 32 poles (page budget, 3 tries at once):

| | before | after |
|---|---|---|
| chain | no rates balance | balances |
| purex antimony void | 2 steps | 1 (all 431.87 sb phosphate 2, 213.78 of 215.94 concentrate fed back) |
| antimony phosphate | 3 steps | 2 (431.87 of 539.84 phosphoric acid fed back) |
| layout | none | 3.59/min pu-238 + 3.58 fuel rods, 1 separation, 110×97, valid, starving 0, 565 s |

Every suite setup's and test fixture's chain is the same step by step. Suite: new setups pu238-fuelrods-116 (3.59/min) and pu238-fuelrods-loop-116 (1.58/min at K 20; the page's search 4.72).

Tests: byproducts.test.js: the Uses above make one purex antimony void and one antimony phosphate, the concentrate and phosphoric acid fed back.

Still:
- The second antimony phosphate's concentrate (72/min) leaves by train while the train brings as much to purex antimony void: a fluid is fed back from one maker only.
- A solid fed back must cover all its taker takes: the antimony oxide (3.6 of 10.8/min) goes to a second step, not the first.
- Past 1 separation (4.16–5.85/min tried): placement alone fits 1.16, but no try routes; 1000 random candidates more (patience 12 → 1000) fit neither 1.16 nor 1.33: the shuffles' room and the plutonium peroxide's pipe round 18 Sub-Blocks and 32 poles.
