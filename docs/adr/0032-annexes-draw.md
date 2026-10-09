---
status: accepted — refines ADR 0031
---

# Annexes draw from built pipes, and find out fast what fits

ADR 0031 laid Annexes out as the whole chain over again: each has its own greenhouse, washer and soil extractor, and its water comes from the west edge. Each Annex was a whole Maximize. Py moss in 116 × 116 took 840 s for 775.8/min. Three costs stood out:

- Each Annex started from a room estimate of every free tile. After the first layout, much of that room is in slivers no farm fits in. So each Annex tried 8 to 12 farms above what fit, one failing try after another; the last Annex fit none and took 108 s to find that out.
- Each Maximize ran its sorting try (about 25 s), even with nothing riding on.
- An Annex never used what was built: the first greenhouses make 1200/min more carbon dioxide than their farms take, while each Annex built a greenhouse of its own.

What changed:

- **Draws** (`annex.js`, `router.js`). A pipe built before an Annex can feed it:
  - **What is spare:** each built pipe route has a spare. A Side Input's is unlimited, since the train brings more. A Sub-Block's is what its producers make at full speed beyond what its consumers take. It counts only where they feed that one pipe of the fluid and take nothing but the train's fluids: anything else they take comes only as fast as they were planned to run. Only a Side Input's pipe, or the pipe of a fluid made here, is drawn from.
  - **Planning:** a fluid made here whose built pipe has enough to spare for the Annex is planned as a Side Input of the Annex instead: no Sub-Block makes it there. Where it has too little, the Annex makes it itself. This is decided per try, since the need grows with the farms.
  - **Routing:** such a Side Input's pipe tree starts beside the built pipe and may join it, a pipe of no other route. A fluid made here is drawn from the built pipe only; one the train brings comes from the built pipe or the west edge, whichever is nearer.
  - **Burying pipes:** the pipe where the Annex joins the built one stays above ground.
  - **Merging:** the Annex's drawing route becomes part of the route it was to draw from (one it touches by chance is left apart, and the check fails): its pipes, its consumers and what they take are added to that route, so the check and the simulation see one network.
- **Probe:** an Annex first tries one of the first Goal's machines. If that finds no room, no more is tried and annexing ends. If it only starves or runs out of time, the search goes on, since Starvation comes and goes with the Count.
- **Making it after all:** an Annex drawing a fluid made here that finds nothing (say no way to the built pipe) is maximized once more, making that fluid itself.
- **An Annex's room:** only the tiles in some stretch where one of the first Goal's machines fits with a tile round it, with no further cut for Fixtures breaking the room up.
- **Filling in an Annex** adds whole machines, one at least, except to reach its cap. Fractions of a machine seldom fit there, and each failing try cost 15 to 35 s.
- **The sorting try** runs only where the highest that fit lets a byproduct ride on.

Py moss in 116 × 116. The old code and the new ran side by side, so both had the same load. Each try's budget is wall-clock time: one run alone on a busy host reached only 101 farms in its first layout.

| Run | Rate | Farms | Greenhouses | Time |
|---|---|---|---|---|
| Maximize, ADR 0031 | 777.3/min | 135, 18, 8 and 1 | 5 | 801 s |
| Maximize, now | 806.4/min | 135, 20, 8 and 5 | 4 | 695 s (777.6/min at 505 s) |
| 750/min asked, ADR 0031 | 749.99/min | 135, 18 and 4 | 4 | 375 s |
| 750/min asked, now | 749.99/min | 135, 20 and 2 | 3 | 403 s |

The first Annex's 20 farms draw their carbon dioxide from the first greenhouses, and the third Annex's 5 from the second Annex's greenhouse. At a fixed rate the new code takes a little longer: in this run its first Annex's tries at 21 farms failed before 20 fit.

Still:
- Items on belts are not drawn: the Annex's soil comes from its own soil extractor. Joining a built belt needs a splitter cut into it.
- A fluid with a little to spare is drawn whole or not at all: the Annex does not make only the rest of it.
- Designing is about 60% of an Annex try and is not cached between tries. The Sub-Blocks differ in rate from one try to the next, so a cache would seldom hit.
