---
status: accepted — refines ADR 0007 and ADR 0009
---

# In a City Block, a Sub-Block may stand in another's Nook

Placement kept every Sub-Block's box clear of every other's. A box is not full, though. A stack of copies whose last copy holds the machines left over leaves room beside that copy. Copies in columns leave room above or below the shorter column. Py kicalk at 132 plantations in 230 × 230 stacks rows of 13, with the two plantations left over in a row of their own and some 140 × 20 tiles of nothing beside them. Placed one by one from the plantations west, the clay pits found no room, and the try did not fit. The user set the rule: Sub-Blocks should be able to take in what is placed already, to use the space better.

So in a City Block, Placement keeps Sub-Blocks apart by the tiles they need, as it keeps them off Fixtures (ADR 0007), not by their boxes:
- A Sub-Block needs its copies and the room its links need. That is the column in front of a narrower copy's east edge, where its links meet it, and the room beside each column of copies where belts turn and trunks run (as far as the column's copies reach, and a row more). It is also the rows between copies and above columns, the corridors between columns, and the room east of it for a Recipe Loop's splitters.
- The rest of its box is its Nooks: beside a copy narrower than the widest, and above or below a column shorter than the stack.
- What two Sub-Blocks need stays `gap` tiles apart, as their boxes did.
- Placement also tries the corners of every placed Sub-Block's Nooks, and the spots where a placed Sub-Block stands in a corner of one of the new one's Nooks. The spot that grows the block least still wins.
- In Layers, a column's Sub-Blocks still stand one below the other, level with what they feed. Only where that is too tall for the room do they stack in each other's Nooks. The tallest goes at the top, and each next stands as high as it stays clear, in line with the column's east side or in a corner of a Nook above.

A Sub-Block the search made room round (ADR 0014) has no Nooks and stands in none. So when a link finds no way round a Sub-Block standing in a Nook, spacing them out undoes it.

Py kicalk in 230 × 230 (clay, steam and seeds made here, 10 s a try): 206/min (132 plantations) instead of 187/min (120). The nurseries and clay pits stand in the Nook beside the plantations left over. In 260 × 260 it is 254/min instead of 231/min; in 200 × 200, 155/min as before. At 170/min the block takes 226 × 199 tiles instead of 226 × 207. Py small parts, whose Sub-Blocks leave no Nooks, places as before.

Standing on its own, a block keeps its boxes apart; Refinement's slides already let one reach into a neighbour's corner.
