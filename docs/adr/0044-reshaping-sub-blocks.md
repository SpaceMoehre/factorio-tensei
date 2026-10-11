---
status: accepted — builds on ADR 0043
---

# Reshaping Sub-Blocks

The user asked to tell a large chain to be squarer: a long line of a production, right-clicked, made squarer or longer. A shape is how far a Sub-Block's box's sides differ (the longer over the shorter).

What changed:

- **What a reshape needs** (compose.js `prepare`, edit.js `editOf`). A prepared layout keeps what it was made of: each Sub-Block's design, the columns each stack stands in, and the routes chained through their consumers. A layout's `edit` carries them, and the Production Chain's entries it was laid out for. A move of a Maximize's layout now takes those entries too, the rate that fit, not the page's.
- **The shapes it may take** (edit.js `shapesOf`):
  - its own stack of copies in other columns, measured as placement would stand them (place.js `stackOf`, taken out of `placeBlocks`);
  - a whole module of rows of another length (up to 40 machines; rows no longer than one belt of each of its routes feeds), designed for those rows only (design.js `designStep` with `only` and `lengths`);
  - copies of a module of one or two rows of n machines, in 1 to 12 columns (design.js `copiesDesign`);
  - the search's other designs of it (the build's design candidates for that Sub-Block, else designed again in the worker).

  Each comes with about the box its copies take, as the box it takes now scales. A shape is judged by the box the map shows, not counting the room beside a stack.
- **Which first** (edit.js `shapesToward`). Squarer (longer) is a shape whose sides differ at least 15% less (more) than now, and fits the City Block.
  - Its own stack goes first, a column more or fewer at a time: nothing to design.
  - Then other designs no more than twice its box, the least change first, then the smaller box.
  - Longer keeps the way it lies: a shape that would turn a tall Sub-Block wide comes last.
- **The reshape** (edit.js `reshapeCopies`).
  - Each shape in turn is designed (the first time), and its belts must chain into its neighbours'.
  - Its design must starve no more than the one it has.
  - It must turn out squarer (longer) as prepared again.
  - The Sub-Block stands with its box's middle where it stood, every other copy where it stands. It is then laid out as a move with nothing moved (`moveCopies`): where its links find no way it goes a little further, else what stands in its way is pushed off.
  - A shape whose layout routes but starves more is passed over for the next. The least starving is kept only where no shape starves no more, and the status says so.
  - Up to 4 shapes are laid out, within the search time.
- **The page.**
  - A right click (or Ctrl click) on a Sub-Block selects it and opens its menu: Squarer, Longer. Squarer is disabled where it is about square, and both where it is one machine.
  - The Inspector of a Sub-Block has the same two buttons, for phones and keyboards.
  - A reshape runs in a worker as a move does, keeps the map's view, and says the shape it took ("stands longer now: 20 × 11 tiles (was 17 × 14)") and what moved. Undo takes it back.
  - A move or reshape that starves more than before says so too.

Fixture circuits, cable and gears, the gears' 10 machines in 3 copies (14 × 21): squarer, 2 copies of a module of 5 machines, 17 × 14; longer, one module of 10, 13 × 30. Both are valid, starve nothing, and every other Sub-Block stays where it stood. Py iron sticks at 900/min of small parts (6 machines, 17 × 14): longer, 20 × 11, its bolts then a little short of iron sticks (no longer shape starved less: the status says so, and Undo takes it back).

Still:
- An Internal Path cut into parallel belts ties its producer's rows to as many parts. Copies of smaller modules then starve or do not chain, so such a Sub-Block (Py bolts, 13 × 99) may have no squarer shape.
- A busy Side Input split into parallel belts across a whole module's rows is the same: 20 gear assemblers at 2400/min have none.
- In another design, machines a Breakout stood apart go back into the Sub-Block; only in other columns do they stay where they stood.
