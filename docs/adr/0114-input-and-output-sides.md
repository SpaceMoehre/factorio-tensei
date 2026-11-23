---
status: accepted — refines ADR 0069
---

# Input and Output Sides

The user's rule: let the user choose where the inputs come from too, and several sides for the inputs and for the outputs; in the extreme all four for both, and each item takes the shortest way.

The train brought every input across the west edge; the products left across the one Output Side (ADR 0069). Both are now lists of sides, each belt and pipe to or from the train taking whichever of its sides it reaches soonest.

What changed:

- **Input Sides and Output Sides** (grid.js `inSides`, `outSides`, `edgeTiles`, `onEdge`; `logistics.input`: 'left', 'up', 'right' or 'down', or a list of them, left by default; `logistics.output` likewise, right by default, now left too). The block still runs west to east; only the first legs from the train and the last legs to it change.
  - router.js: a belt to the train ends leaving across any Output Side, the distance left the nearest's (`edgeGoal`, `leaving`); a pipe from the train starts from every tile of its Input Sides (`inStarts`), a pipe to it from every tile of its Output Sides (`outStarts`). One search from all of them at once: the nearest wins.
  - compose.js: a Side Input's belt starts from every tile of the Input Sides heading in (`fromTrain`); one whose first entry already stands on one, heading in, needs none. The approach column (a Side Input routed through the City Block from just west of the westmost copy, then from the west edge) and the column kept for Side Inputs beside a Fan-out's line only where the west is the one Input Side. A pipe stub on the west (east) edge reaches the train only where that side is an Input (Output) Side.
  - place.js: Goals stand from the bottom up only where the Output Sides are down and neither up nor right.
  - compact.js: the finished block carries `outs` (several Output Sides) and `ins` (Input Sides other than the west alone); validity.js checks each belt and pipe from the train starts on an Input Side and each to it leaves across an Output Side.
  - blueprint.js: the display panels naming what a train belt carries stand beyond the side it crosses; a Belt Merge is built behind a belt coming in across any Input Side.
  - render.js shades every Input and Output Side; app.js has four boxes each for "Input sides" and "Output sides" (at least one stays ticked) and names the train's edges.

| Py advanced circuits 116², 2 chipshooters, one try | West in, right out | All four sides in and out |
|---|---|---|
| Fit | 16th candidate, 35.9 s | 20th candidate, 37.4 s |
| Valid, starving | yes, 0 | yes, 0 |
| Tiles of belts and pipes from the train | 2952 | 1400 |
| Tiles of belts and pipes to the train | 278 | 156 |
| Tiles of every belt and pipe | 5695 | 3906 |

| Suite | Seed 1 |
|---|---|
| Fast tier | every layout the same (every setup's sides as before) |
| Py advanced circuits 116² (out up), 116² out to the right | every layout the same |
| Full tier's others | not run: their sides (west in, right out) take the code's old paths alone |

Tests: belts from the train come in across the bottom (top) edge alone where chosen; with all four sides in and out, in a City Block and standing on its own, and with up and down in, up and left out, each belt from the train starts on an Input Side and each to it leaves across an Output Side, valid, starving nothing; with every side open no belt from the train runs longer in all than from the west alone (input-output-sides.test.js).

Still:
- Placement still orders the chain west to east and puts the Goals against the east edge (or the top or bottom): with the inputs coming in from the east or the products leaving west alone, the links to the train cross the block.
- Bands keep room for the Side Inputs at the west edge whatever the Input Sides.
