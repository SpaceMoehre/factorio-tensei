---
status: accepted — refines ADR 0040 and ADR 0054
---

# A Recipe Loop taking all its producer makes; a train pipe only to those taking it by train

Py hot air at 6000/min (`warmer-air-2` in an RHE), standing on its own: RHEs warm stone bricks with coke oven gas (warm, then warmer), the hot-air RHE gives every stone brick back (a Recipe Loop), heat exchangers reheat the coke oven gas with hot molten salt, taking theirs back by train (a loop of their own). The page said: "warmer-stone-brick-1: fluid connections collide".

Causes:

- **The train's pipe linked to steps fed from a Sub-Block** (routes.js `buildRoutes`). A Side Input's consumers were every step taking the item. The heat exchangers take coke oven gas by train (their own loop's), so the train's pipe went to the brick RHEs too, which take theirs from the heat exchangers' pipe: three gas pipes on a machine with one gas input and one output.
- **A tap on a belt going nowhere else was never routed** (compose.js). The hot-air RHE's stone bricks all go back to the loop: its belt has no consumer and nothing for the train, so no link after its producers was made, its tap never placed, and the feed fell back to the train, entering from the east: "route … does not start at the west edge" on every candidate. `routeTaps` also routed the belt on past its taps to the east edge, and gave up where the producers stand at it.

What changed:

- **routes.js**: a Side Input goes to the steps taking it by train only, not to those an Internal Path or feedback brings it to.
- **compose.js `linkTasks`, `routeTaps`**: a belt whose taps take all it carries gets its link after the producers, through its splitters, ending there.

| Py hot air 6000/min, free-standing, 120 s | Before | After |
|---|---|---|
| Result | none ("fluid connections collide") | 6000/min, valid, at 4.7 s |
| Starvation, loops by train, riding | — | 0, 0, 0 |
| Bounds | — | 184 × 12 |

Tests: Py hot air: the train's coke oven gas only to the heat exchangers; a layout without Starvation, its stone bricks fed back from their splitter.

Still:
- The brick RHEs' coke oven gas leaves by train and the heat exchangers take theirs by train: the chain does not feed the cooled gas back into them (hot and cooled gas are one fluid in the catalog).
- The block is a long strip (184 × 12).
