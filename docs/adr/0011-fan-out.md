---
status: accepted — refines ADR 0005
---

# A Side Input's belts share belts from the train (Fan-out)

Copies of a Module give each copy a belt of its own for every Side Input whose whole rate does not fit one belt. A belt only snakes through the copies when all of them together fit it (ADR 0005). Py fertilizer in agitators shows the cost: 67 machines in 116 × 116 stand as eleven copies of six. Each copy takes 432 bones and 360 urea a minute, under half a yellow belt. Still, 59 belts came in from the west edge, 12 of them bones and 12 urea, most running the City Block's whole width.

Snaking runs of copies would need the copies reversed in turn and a lane beside the stack for each belt; a run starting at a reversed copy would be fed from the east. Splitters need neither. One belt from the west edge runs past the copies' entries in turn. A splitter before each entry sends one belt off into it, and the belt ends in the last. A splitter's outputs share what comes in by what each takes, so the belts get all they need as long as the line carries enough.

Where the line still carries less than the next entry takes, another belt from the west edge joins it through that entry's splitter: in on its other side, out to the entry and on along the line. A line fed this way needs no more belts from the west edge than the copies' whole take fills, rounded up: five copies taking 720 ash a minute each come from four yellow belts. A belt that joins never ends a line: the entry it would feed is the first of a new line instead, which takes no more belts.

Grouping decides which belts share, before placement. It cuts each Side Input's belts into the copies of one column into runs, in the order the copies stand. The cut takes the fewest belts from the west edge, then the fewest splitters. Runs reaching across columns were tried too; their lines crossed between columns and failed to route far more often than they saved.

Routing tries each run, the runs no belt joins first. A splitter facing along the line stands across it just before the entry's row, so the line runs on straight and the belt it sends off turns into the entry. Failing that, a splitter facing east stands before the entry and the line turns on from its other side. A later leg that finds no way on sends the search back to the earlier splitter's next spot, and both directions along the column are tried. A run that fails is cut into runs no belt joins, then halved, down to belts on their own from the west edge. If the layout's other links then find no room, it is routed again with its runs after the other Side Inputs, and then without splitters.

Placement does not know. It keeps the room it kept for every belt, so nothing fits that did not fit before. The strip beside the first column, against the west edge, is the narrow part: the fluids' trunk stands right before the entries there, and every belt bound further east passes through. Runs there often fail. Py fertilizer, 67 agitators in 116 × 116, on yellow belts: 47 belts from the west edge, not 59. The floor is about 38, and the agitators' ash and biomass bands (720 a minute, 80% of a belt each) hold most of the rest. On express belts the same 67 come in on 19 belts, not 28. At 60 agitators, 13 belts: the fewest that carry the rate.
