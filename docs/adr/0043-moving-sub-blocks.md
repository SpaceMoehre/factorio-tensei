---
status: accepted
---

# Moving Sub-Blocks

The user asked to drag Sub-Blocks on the map once a layout is shown. The program lays the belts, pipes and poles again to fit. Where its links find no way, it moves the Sub-Block a little to make room. Where other Sub-Blocks box it in on every side, those may move a little instead.

What changed:

- **What a move needs** (search.js, edit.js `editOf`). Each layout the search yields carries `edit`:
  - its copies and routes as prepared (the Modules, their instances, the routes with their slots and stubs);
  - where each copy stood (`positions`);
  - each Sub-Block's box with the room beside its stack, relative to its first copy (`rooms`, place.js);
  - how the links were routed (compose's layout: plain, Fan-outs last, alone);
  - the lines the squeeze took out (`squeeze`, compact.js).

  Every piece of a copy carries its copy's index (`copy`, compose.js); a broken-out machine's box carries its instance (`inst`). An Annex's layout is two layouts as one and carries none: it is not moved. Nor are Bands.
- **Laid out again as it stands** (edit.js `standing`). A squeezed block shows its copies closer together than they were routed. A move lays the links again between the copies as they stand on the map, not as they were routed, so the Sub-Blocks not moved stay exactly where the user sees them.
  - A line the squeeze took out between copies stays out.
  - A line through a copy's machines goes back: the copy stands as its Module made it.
  - A line through only the end of a copy's belt or pipe stays out. The copy stands where its machines stood, and that end reaches back into the corridor.
  - Where that puts two copies on each other, the lines through either's pieces go back. Everything past such a line stands one tile further out (the status says by how much).
  - Where the links do not route even with nothing moved (the squeeze left corridors too narrow to lay them again), every line goes back first: the block as it was routed.
- **The move** (edit.js `moveCopies`, worker.js). The Sub-Block's stack moves as one, or a machine a Breakout stood apart moves on its own. Every link is routed again (compose.js, with the layout's own routing), the pipes buried and the poles placed again. The block is not squeezed again, so nothing the user put down moves after.
  - It is kept where it routes, is valid, and is as good as before: it starves no more, feeds no Recipe Loop by train that it fed itself, and lets no byproduct ride on that was sorted out.
  - Otherwise the Sub-Block goes a little further, the least way first (by distance, straight lines before diagonals), up to 6 tiles. It never lands on another copy, a Fixture or outside the City Block, nor touches another copy.
  - Where none of those works, the Sub-Blocks in its way are pushed off instead, one way each (east, south, west, north). They move as far as leaves a gap of 1, 2 or 3 tiles round its box. Those they come next to or run into go with them, as far. The fewest tiles moved go first.
  - A layout that routes but is worse than before is kept as a last resort, only a little further looked past it.
  - Within the search time it gives up, and the block stays as it was.
- **The map** (render.js). A Sub-Block may be picked up two ways:
  - Press and hold it (420 ms) to pick it up.
  - Once it is selected, drag it straight away.

  While carried, it follows the pointer tile by tile: faint where it stood, whole where it goes, with how far it goes. Its box turns red where it would stand on another or on a Fixture. The panels over the map fade. Near the map's edge it pans the map, Escape puts it back, and a second finger cancels it. Put down, it shows there while its move is laid out.
- **The page** (app.js).
  - A move runs in a worker of its own and stops a search still running, whose layouts would replace it.
  - The new layout shows where the map stood, the moved Sub-Block selected.
  - The status says where it went: further than put, what was pushed and how far, and how far the block opened up.
  - *Undo* (and Ctrl+Z) shows the layout before the last move.
  - The Inspector of a Sub-Block says it can be dragged, and has arrows moving it a tile at a time.

Py small parts at 300/min (iron sticks, bolts, copper cable, gears made here), copper cable dragged 9 tiles south: laid out on the first try, valid, starving nothing, every other Sub-Block where it stood. Dropped onto a neighbour's last column, a Sub-Block lands on the nearest spot clear of it. With no room within reach, the neighbour is pushed off instead.

Still:
- A move keeps the Fixtures off every machine: no Making Way. A Sub-Block whose machines Fixtures stood on keeps their gaps, its machines built apart where they were.
- The links are routed as the layout routed them. A byproduct's splitter that finds no room does not fall back to riding on through the consumers: the Sub-Block moves on instead.
- Copies of one Sub-Block move together; one copy of a stack does not move alone.
