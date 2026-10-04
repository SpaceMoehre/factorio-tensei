---
status: accepted — refines ADR 0017 and ADR 0018
---

# What kept the City Block from filling

The user asked for a loop: judge the screenshot, find why usable room stays empty, fix it, and go again. Py nexelit plates in a 118 × 118 City Block with a roboport and a big pole in each quarter (ADR 0017) went from 1260/min to 1458/min (81 foundries, 73 washers, 30 s a try). Each step was a cause found in a try that should have fitted:

- **A link took the tile another link of its route starts from.** The tile in front of a copy's entry, and the one after its exit, is held for the link that meets it there. The hold was per route, so the belt into the foundries left out for the roboports ran through the tile after their exit, and the belt on to the train had nowhere to start. A link now keeps off the tiles held for its route's other links.
- **A belt took a pipe's way out.** After a link fails, compose routes it first, before the pipes. It then took the tile where the washers' sludge pipe leaves them. That tile is now held for its pipe from the start.
- **Machines built apart stood one tile from a box.** Their belt entry and the box's pipe connection then needed the same tile. They now keep two columns from any box beside them.
- **A Sub-Block fed from elsewhere stood against the west edge.** A core 116 tiles wide left its entries no tile to the west, and the slide west pushed narrower ones back against the edge. In a City Block a Sub-Block fed by other Sub-Blocks keeps a column west of it for each such link, through the slide too.
- **Rows as wide as the City Block.** In a City Block a core is also tried in rows as long as the room is wide, less 12 tiles for the links at their ends.
- **Pairings.** The structured candidates varied one Sub-Block's design at a time. With few Sub-Blocks, every pairing of their best eight designs is tried too, the smallest first.
- **Machines left out stood apart, chained back west.** They now go on the end of their core's last row where it has room for them, the rest of the core as it was. Otherwise they stand apart together as one module, and only then each on its own. Like machines standing apart take their spots in the order their belt visits them, west to east, so no link between them runs back.

A design check that let a splitter balance the two belts of an Internal Path made more washer designs pass. It lowered the result (1150/min): each try spent its time on layouts whose splitter then found no room. It was dropped.

What still stays empty is the end of each Sub-Block's last row and the strips beside them. The next machines need either a sixth row, for which the City Block has no height left, or their left-out machines standing apart, whose belts find no room at the east edge.
