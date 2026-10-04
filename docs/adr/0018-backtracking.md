---
status: accepted — refines ADR 0007 and ADR 0017
---

# In a City Block, Placement backtracks

Placement stood the Sub-Blocks one by one, each in the spot that grew the block least. That spot is chosen without a thought for the ones still to come. In the City Block of ADR 0017 the nexelit foundries, placed first, took the band between the roboports' rows, where no Fixture stands on them. The washers, placed next, found no room, and the bottom of the City Block stayed empty. The user's verdict on the result: a lot of empty space that could have held more buildings.

So in a City Block, where a Sub-Block finds no room, the ones placed before it try other spots. Each tries up to three, the cheapest first, none overlapping its first spot or another tried by more than half its box. The candidate gives up after 24 in all. Where every Sub-Block finds room at once, Placement is as before.

Py nexelit plates in that City Block: the foundries now span its top in rows of 18, the roboports making way in one of them. The washers fill the band below. Maximize: 1260/min (70 foundries), not 1019/min. Py small parts in an empty 116 × 116 (3375/min) and Py kicalk in 230 × 230 (206/min) stay as they were. A try that used to fail at once can now place its Sub-Blocks and route until its time runs out. Py small parts in 116 × 116 took 144 s instead of 40 s, with 120 s a try.

Designs whose rows span the City Block were tried as well: they changed nothing that backtracking did not. Don't search every spot for every Sub-Block: the few spots far apart are what lets the search see more candidates.
