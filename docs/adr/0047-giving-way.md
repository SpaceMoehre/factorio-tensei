---
status: accepted — refines ADR 0017, ADR 0024 and ADR 0031
---

# Giving Way: the first Goal's machines give up their spots to Fixtures

Py kicalk at 400/min in a 236 × 236 City Block (Buffer 4) with a big pole and a roboport about every 30 tiles filled up to 364.8/min: 105 plantations in 7 rows of 15, then Annexes of 5, 3 and 1, each with its own clay pit, boiler and nursery. Each row of plantations stood between two rows of Fixtures, parted round them (ADR 0024), so about 13 of every 29 rows held only poles. The user's rule: put the rows closer together and give up the few plantations a Fixture stands on; more stand in all.

Making Way (ADR 0017) already lets a Fixture stand on a machine, but builds that machine elsewhere, and for no more than a tenth of a Sub-Block. A row of 15 plantations that takes in a row of Fixtures loses about 6, so the stack used up that budget on its first row and parted round the rest. Where it did take some in, the machines built apart found no room, and the layout was tried again with every Fixture kept off the machines.

What changed:

- **Giving Way** (search.js `giving`, place.js `budget`). One Sub-Block, the first Goal's, may give up the machines Fixtures stand on, up to a quarter of them. Nothing is built elsewhere: its copies leave them out and their belts run on past the gaps. Placement and Parting are as for Making Way, with that larger budget.
- **The rate of the machines left** (compact.js `given`). A layout whose Sub-Block gave machines up runs at the rate of those it has. Every Sub-Block's rates and every route's items are scaled down by as much, since a Production Chain's rates are proportional to its Goals'. The other Sub-Blocks, designed for the machines asked, run below full speed. That Sub-Block counts the machines it has. Moves, turns and reshapes keep this (`edit.giving`).
- **In Maximize** (maximize.js). This applies to a City Block with Fixtures in its room, after the highest that fit is found (Filling and Bands included), before the sorting try and Annexes.
  - Tries go from the most machines that fit: 10 more, again while a layout is found, then half as many more after each that is not.
  - Each try gives way and counts the machines it has. It is kept where that is more than stood before (and no more than the cap).
  - No try goes past a quarter above the cap.
  - Annexes then fill the room left as before. They do not give way themselves (the layout before them stands as their Fixtures).

Py kicalk, as above:

| Run | Plantations | Rate |
|---|---|---|
| Before | 105 + Annexes 5, 3 and 1 = 114 | 364.8/min |
| One try, 135 giving way | 120 in 12 rows, 15 given up | 384/min |

Still:

- Only the first Goal's Sub-Block gives way. Another's machines feed the ones after them, so a gap in it starves them.
- A try for n machines lays out n and then gives some up. It is not told how many it may give up in exchange for how much room, so the Count where giving way pays comes from the tries.
