---
status: accepted — builds on ADR 0045
---

# The splitter sorting a byproduct out turns with its Sub-Block

The user asked whether the filter splitter that sorts a byproduct out right after its producers should be part of their Sub-Block. Until now a turned Sub-Block lost it (ADR 0045), and its byproduct rode on through its consumers.

What changed:

- **The splitter stands as its Sub-Block faces** (compose.js `fanFrom`).
  - It stands a few tiles on from where the producers' belt leaves them, facing the way the belt leaves, the belt coming in on either side.
  - A turned Sub-Block's belt leaves on the side it turned to, so its splitter turns with it. An unturned one's leaves east, as before.
  - Where none of those spots finds a way, spots facing east are tried, as before the turn.
- **Planned for turned Sub-Blocks** (compose.js `groupRoutes`).
  - A byproduct is sorted out after turned producers too. Their belt may leave them on any side, and the consumers' belt may enter them on any side.
  - A belt off the splitter into one entry enters it from whatever side (`routeFan`). So in the search too, one run of consumers entered from the east no longer lets the byproduct ride on for want of a way in.
- **Where the splitter finds no way** (edit.js `moveCopies`, `riding`).
  - As in the search, the producers' belt is chained through its consumers and the byproduct rides on: first that run of producers; then, where its line past them finds no way either, the whole route.
  - This happens once per edit, at the first place it is needed. The layout is kept aside and used only where nothing as good routes, or at once where it is as good as before.
  - The edit looks no less far for a layout that sorts the byproduct out.
- **Sorted out again** (edit.js `reshaped`).
  - The routes a move or turn chained this way (`rode`) are sorted out again when their Sub-Block is next turned or reshaped.
  - The search's own chained routes stay chained. (Sorting those out after a turn made Py titanium starve 90/min, or take 30 s to fail.)
- **The page** (app.js). A move, turn or reshape that leaves a byproduct riding on says which: "Stone rides on through its consumers now: no splitter sorting it out finds a way there. Undo takes it back."

Results:

- **Py glassworks on crushed quartz from jaw crushers** (stone sorted out). The crushers were turned a quarter, half and three quarters, and the glassworks a quarter.
  - Every turn is valid and sorts the stone out, by a splitter facing the way the crushers' belt leaves.
  - Before, the stone rode on in every one.
- **Py molybdenite pulp at 9,000/min** (the ball mills' gravel and the crushers' stone sorted out on 6 belts). Each of its 3 Sub-Blocks was turned a quarter, half and three quarters.
  - All 9 are valid, 8 of them sorting every byproduct out.
  - Turned half round, the ball mills let their gravel ride on, because no splitter finds a way.
  - Before, only 2 of the 9 laid out at all.
- **Py titanium, iron pulp, molybdenum oxide:** turned as before.

Still:

- A line past several entries (a Fan-out) still reaches each heading east. Where a byproduct is sorted out into several runs of a turned Sub-Block's consumers, it rides on.
- Fan-outs from producers into several Sub-Blocks' Parts (Bands) are still planned only for belts leaving east.
