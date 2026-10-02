---
status: accepted — refines ADR 0004
---

# Compactness is a score: square first, then empty tiles, then bends

The search used to rank valid layouts by bounding-box area, entity count breaking ties. Area alone favours long, thin blocks: Py small parts at 600/min came out 116 × 12. It is also blind to belts running wild. A belt looping round the block changes nothing about the area, and the entity count it adds barely weighs.

Compactness is now one score in tiles, lower is better. First, the strip a block has beyond a square: |width − height| times the shorter side. Second, its empty tiles: those no machine, inserter or pole stands on. Third, 4 for every bend of a belt or pipe. Starvation still ranks first, and entity count still breaks ties. The squareness term counts in full, so a square block beats a slightly smaller long one, but it is not a strict first sort. Squareness alone would take any growth in area for a squarer shape, so the score weighs both.

A belt or pipe does not fill the tiles it runs through. If it did, a belt winding through empty room would make a layout look more compact. Counted as empty, the winding adds only its bends. Placement grows a free-standing block toward a square too: the strip beyond a square is part of each spot's cost. The ranking alone could only choose among wide candidates.

In a City Block the shape is given and the block spans the Buffer's width, so the squareness term does not count there; empty tiles and bends do. Maximize stops at the first layout without Starvation, so the score does not change what it finds.

Blocks get squarer and their belts straighter for a few percent more area at most. Py small parts at 1200/min went from 111 × 27 to 62 × 55; at 3000/min it is smaller as well.
