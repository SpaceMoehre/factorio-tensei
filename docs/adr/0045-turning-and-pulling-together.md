---
status: accepted — builds on ADR 0043 and ADR 0044
---

# Turning Sub-Blocks, and pulling them together

The user asked for two more things:
- To turn a Sub-Block.
- Once happy with the layout, to have the application shift the Sub-Blocks together as far as it can, without changing them.

What changed:

- **A turned module** (turn.js `turnModule`). A module turns a quarter clockwise as a blueprint turns in the game: a tile (x, y) to (-y - 1, x), an entity of w × h at (x, y) to (-(y + h), x), h × w, a direction a quarter on. That covers:
  - its machines, inserters (their custom pickup and drop vectors too) and Output Drops;
  - its belts (where each points), pipes and poles, its parts' belts and the way they run;
  - its core's fluid ports, the tiles it keeps free, its pole slots, drop tiles and taps.

  The turned module knows how far it turned (`turns`), and turned modules are kept: the same module turned as far is the same object.
- **Belts and pipes of a turned module** (compose.js).
  - Its belts may enter and leave on any side. Between Sub-Blocks, a turned one's parts chain into any other's; a run of them may end and start on any side. Its copies in a stack still chain one copy's exit to the next copy's entry.
  - A fluid's stub is on the edge its module's west (east) edge turned to, and its link joins it from that side.
  - A turned stack keeps no lanes beside it for the belts turning between its copies: the router finds their way.
  - Fan-outs from producers and byproducts sorted out after their producers are still planned only for belts leaving east: a turned Sub-Block has neither, its byproduct riding on.
- **The turn** (edit.js `turnCopies`).
  - A layout's `edit` keeps its designs as designed, and how far the user turned each Sub-Block (`turns`). The layout is prepared again from the designs, each turned so far (`prepareTurned`).
  - The Sub-Block's stack stands as placement would stand it (`stackOf`), turned within its box about the box's middle where it stood. Every other copy stands where it stands, the room beside its stack as it was.
  - It is then laid out as a move (`moveCopies`): a little further where its links find no way, else what stands in its way is pushed off.
  - A turned Sub-Block's box gets 3 tiles of room every way, so its belts can turn back toward its links.
  - Where the layout's own routing finds no way, it is tried once more without splitters.
  - In a squeezed block, 12 layouts at most are tried as it stands. Then it is tried as it was routed, every line back: a turned Sub-Block's belts need room to turn that the squeeze took.
  - Reshaping a turned Sub-Block (ADR 0044) shapes it as designed and turns the new shape as far.
- **Pulling together** (edit.js `compactCopies`). Every Sub-Block keeps its design, shape and turn; only where it stands changes.
  - The block as it stands is laid out again first. A squeezed one may open up a little, so a layout counts only where its Compactness beats the block's own.
  - Then, round after round, each Sub-Block (and each machine stood apart) slides toward the block's middle, the farthest first. It goes as far as it can without standing on another copy (or a Fixture, or outside the City Block) or next to one, and not past the middle; along the axis it is farther off first.
  - Where its links find no way there, it goes half as far, and so on.
  - A slide is kept where the block is as good as before (starving no more, no more Recipe Loops by train or byproducts riding on) and its Compactness no worse.
  - It stops where none moves, or the search time (10 s at least) is out.
- **The page.**
  - **Turning:** a Sub-Block's right-click menu has Turn clockwise and Turn anticlockwise, and its Inspector has ↺ and ↻. While dragging, R turns the Sub-Block a quarter clockwise (Shift+R the other way), as in the game. The preview turns with it about its box's middle, its box red where it would stand on another, outside the City Block, or on a Fixture. Put down, it is turned and moved at once. A machine stood apart does not turn.
  - **Pull together** in the map's toolbar slides them together; each slide that beats the block is shown as it comes. Again (Stop pulling) stops it, keeping what it pulled. Undo goes back to the block before. Where nothing beats it, the status says the Sub-Blocks are already as close as their links allow.

The test layout of fixture circuits and cable, its cable turned a quarter, half round and three quarters, and the circuits a quarter and half: each is valid and starves nothing, the cable's machines turned with it. Py small parts at 600/min, each Sub-Block turned: valid, as good as before. Py iron pulp (water made here) and Py titanium (MIBC and sand made here), with pipes: each Sub-Block turned a quarter and half, valid, as good as before (titanium's 2 riding byproducts as before).

Spread out by moves (the circuits 12 tiles east, the cable 10 south: 31 × 27, Compactness 910), pulled together: 19 × 22, Compactness 442, tighter than the search's own (19 × 23, 472), in about 0.2 s. Py small parts spread to 74 × 42 (Compactness 3,800): pulled together to 59 × 31 (2,057) in about 0.6 s.

Still:
- Fan-outs from producers, and byproducts sorted out by a filter splitter after their producers, are planned (groupRoutes) only for belts leaving east: a turned Sub-Block's byproduct rides on through its consumers, as good as before only where none was sorted out.
- Pulling together slides; it does not swap Sub-Blocks round or move one past another.
