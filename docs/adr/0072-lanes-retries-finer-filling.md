---
status: accepted — refines ADR 0015, ADR 0048, ADR 0068 and ADR 0071
---

# Whole machines on two lanes; retries behind the structured candidates; Filling a tenth

Py hot air at 6000/min (`warmer-air-2`) with its bricks, coke oven gas and hot molten salt made, in the same 118 × 118 City Block of 32 medium poles, Buffer 4, Maximize, yellow belts, coal as Fuel and biomass for the powerplants. After ADR 0071 the page found 11812.5/min, 1.3125 RHEs making hot air and 51 machines, in a block two thirds empty; the "Still:" of ADR 0071 named 1.46875 and 1.625.

Causes, found in tries that should have fit:

- **Inserters counted at their own rate, not their machine's** (1.46875: "every design starves 20"). 15 RHEs make 881.25 warmer bricks a minute onto one belt, 58.75 each. Each drop picks its lane (Drop Offset), but a lane fills by whole inserters, and a core counted each inserter as moving as much as it can (138 a minute): 8 on one lane "carried" 450, so no machine got a second inserter. 8 machines make 470 of the lane's 450.
- **Retries ahead of the structured candidates** (1.46875: "no room for warm-stone-brick", 294 candidates in 33 s). A candidate finding no room for a Sub-Block queues itself again with that one placed first (ADR 0068), and that one again with the next: 228 retries, each tried first. Past the 24 that count beside `patience`, they took the structured candidates' turns: 192 of 258 were never tried, among them the pairing that places (warm bricks in 4 copies of 6, powerplants in 8 copies of 1).
- **Filling's quarter machine** (1.46875 never tried). From 1.3125 fitting and 1.625 not, Filling stops at a quarter machine: a fifth of the rate where so few machines fit.

What changed:

- **Whole machines on two lanes** (core.js `buildCore`): each inserter carries its share of what its machine makes, so where whole machines leave a lane over, a row's machines get an inserter onto the other lane too.
- **Retries behind** (search.js `search`, `retry`): past RETRIES, a failing candidate's retries queue behind the structured candidates, not ahead of them.
- **Filling a tenth** (maximize.js `planner`, `FINEST`): down to a quarter machine, or a tenth of those that fit where that is less.

| Py hot air, 118² among 32 poles, one try at a time, side by side | Before | After |
|---|---|---|
| Rate | 11812.5/min (1.3125 RHEs) | 13218.75/min (1.46875 RHEs) |
| Machines | 2 + 1 + 14 + 21 + 6 + 7 = 51 | 2 + 1 + 15 + 24 + 7 + 8 = 57 |
| Box, empty | 110 × 104, 7,728 | 110 × 106, 6,881 |
| Maximize (load 14 on 8 cores) | 970 s (best at 313 s) | 843 s (best at 339 s) |

Regressions, side by side: Py small parts in 100², 2775 → 3375/min (5 → 6 machines; maxdet, 60 candidates a try: f6b04d830744 → 4fbcf0f40ec2; wall clock three times: 2775 against 2362.5 at load 9, 3000 and 3375); Py molybdenum oxide among roboports lays out the same (maxdet, 20 candidates a try: 963ab893dfed, 999.98/min); Py titanium plate standing on its own, 1000 s: no layout either way.

Tests: Py hot air in 118²: 15 warmer brick RHEs with a design starving nothing; Filling trying 1.46875 between 1.3125 and 1.625.

Still:
- 1.625 RHEs: the two hot-air RHEs give back 487.5 stone bricks a minute each, more than a lane, onto one belt (design.js `outputBelt` counts a machine a lane at least): 150 short. A belt each lets every design through, and then no pairing finds room for the 26 warm bricks beside 9 powerplants: it gained nothing, left out again (ADR 0071).
- 2 RHEs: 11 powerplants, no room (ADR 0071).
- Copies chained on one belt still split their drops by copy (3 copies of 5 RHEs: 8 and 7 on the lanes): a copy does not know the others' lanes, and the warmer bricks' copies starve 20.
