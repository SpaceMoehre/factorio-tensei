---
status: accepted — refines ADR 0030, ADR 0038 and ADR 0048
---

# Byproducts sorted out every time, their belts merged

The user maximized Py rayon at 496.87/min in an empty 116 × 116 City Block. Py's ball mills make 6 biomass with every 5 fiber, and the pulp mills take none of the biomass. The biomass was not sorted out everywhere: one Annex's ball mills sent theirs on through the pulp mills (riding, ADR 0030), clogging the belt into them. The user's rule: sort it out every time, and merge the sorted-out belts so fewer of them run.

Causes:

- **Sorting out at the highest count: a little short, never tried again with more.** Maximize lets byproducts ride during its tries and sorts them out once at the end, at the highest count that fit (ADR 0030). Sorted out, the layouts starved by a little: 28 ball mills for 11 pulp mills fell 31/min short on their belts as routed. Spare Machines (ADR 0048) learned of a shortfall only before routing, so no try was made with one ball mill more.
- **An Annex with no way to sort its byproduct out kept it riding.** The Annex of 2 pulp mills found no layout that sorted the biomass out: its 5 ball mills' belt carries 660 a minute on one lane of 450. The Annex was kept with the biomass riding.
- **An Extension laid the first layout out again with its byproducts riding.** An Extension (ADR 0038) lays out an earlier layout again, and those tries let byproducts ride. A layout that had sorted its byproducts out came back with 6 belts of them riding.
- **Six biomass belts to the east edge, each with 358 a minute.** A sorted-out byproduct joins another belt only by side-loading, which puts it all on one lane of that belt. With biomass on both lanes (179 each), no lane had room.

What changed:

- **Short as routed** (search.js). A layout passed over because it starves, where only one producer's belts fall short, now sets the shortfall Spare Machines tries again with (`nearest`), as a prepared layout's shortfall already did.
- **Fewer machines rather than riding** (maximize.js, `SORT_BELOW`). Where no layout sorts the byproducts out at the highest count that fit, up to 2 lower whole counts are tried sorted. The first that sorts everything out is kept, in Annexes too. Giving Way's layouts are left as they are.
- **Extensions keep sorting** (maximize.js `extend`). A layout laid out again whose byproducts ride where they did not before is not taken.
- **Byproduct belts merged** (compact.js `mergeByproducts`, once the block is routed, before belts are straightened).
  - A sorted-out byproduct's belt is routed again from its filter splitter to a tile beside another belt carrying the same byproduct, heading the same way.
  - A splitter takes in both belts there and goes on only on the other belt's side. Each lane keeps its share.
  - A merge is made only where each lane then carries half a belt at most, and is kept where the new way is shorter than the old one to the east edge. The longest ways are freed first.
  - The merged belt's route records the one it joins (`joins`), and validity.js `joinsFromSide` accepts a belt that ends in a splitter the other goes through.
- **A byproduct's `joins` reset every routing round** (compose.js). A round that routed it to the east edge no longer keeps the join from the round before.

| Py rayon, 116 × 116, Maximize | Before | After |
|---|---|---|
| Rate | 696.87/min (12 + 3) | 646.87/min (12 + 2) |
| Belts with byproducts riding | 1 (the Annex's ball mills) | 0 |
| Biomass belts to the east edge, first layout | 6 | 3 |
| Seconds | 433 | 348 |

The rate is lower by one pulp mill: in the Annex's room, 3 pulp mills fit only with the biomass riding through them.

Py molybdenum oxide among roboports (`--total 2400`, side by side): 124.99/min both ways, the same layout. Its three byproducts still ride there: at 1 furnace there is no lower count to try.

Still:
- A Sub-Block whose producers put a belt's worth on one lane (5 ball mills on a lane of 450) cannot sort its byproduct out alone; its designs are not chosen for it.
- Merges are made only after routing, never planned: a belt goes to the east edge first, then is moved where a merge is shorter.
