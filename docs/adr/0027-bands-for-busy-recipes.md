---
status: accepted — refines ADR 0025 and ADR 0026
---

# Bands for recipes that take many items and give back barrels

Py vrauks by vrauks-2, its cocoons by vrauks-cocoon-2, in the 236 × 236 City Block of roboports (Buffer 4, yellow belts; water barrels, cocoons and saps made here). Each paddock takes five items: cocoons, moss, water barrels, vrauks food and saps. Each incubator takes those but cocoons, and native flora too. Both give back the empty barrels. Maximize stopped at 27.3/min, 30 paddocks, leaving a third of the City Block empty.

- **Bands found no design.** A Part of two rows takes most belts in the band between its rows. The rest serve the bands outside them, top and bottom, and a belt serving both runs round the rows through the margins. That left no tile within reach of the inserters in the outer bands for a pole, so no design of two rows routed.
- **The search could not chain the barrels.** The incubators put cocoons and empty barrels on one belt. The cocoons go to the paddocks and the barrels to the train, so one belt had to run through every paddock copy on to the east edge. Above 30 paddocks no copies chained ("one belt cannot chain every machine that makes or takes it").

What changed:

- **Pole slots band by band.** Where a design's inserters in a band find no pole, it is built again with a tile per machine kept free for one in that band, nearest the machines first, then the next row. Before, only the band between two rows got one. Two rows of incubators now route in 94 × 56, which fits a tall Slot. Two rows of paddocks route only 112 wide, too wide for any Slot.
- **Parts of one row.** A Sub-Block's Parts take two rows only where a design of two fits the Slot. This is checked once per recipe and Slot shape, designing a Part of that Sub-Block, random variants too. Elsewhere a Part takes one row. A tall Slot then holds two Parts of one row, one above the other, where each half fits a row: paddocks two rows of eight in a Slot of 56. A Part's design is the narrowest by its core that routes and fits, tried narrowest first; before, every candidate was routed.
- **Fan-outs from producers.** An item made in one Sub-Block and taken by Parts of several runs on one line from the producers past every consumer Part's entry. Before, one belt chained the Parts, running back west across a whole range between each Part and the next. A splitter before each entry sends a belt off into it, and the last entry takes the line's end. The entries are taken in columns, as a Side Input's are (ADR 0026), from the column nearest where the line leaves the producers. Other orders are tried too:
  - round the others, where the producers stand beside a column's middle;
  - each entry nearest the last.

  Where no order finds a way, a splitter right after the producers starts two lines, one each way. All of a line's tries share one budget of spots, and each of its legs gives up after a few thousand states, so a line that finds no way costs seconds, not a minute. In a City Block, the line keeps off the west edge's column, where the Side Inputs come in. A small producer that only Parts take from, such as the water-barrel machine, stands at the top of the corridor west of the Fixture column, its line running down it.
- **Byproducts filtered off.** Where a Part's output carries an item none of its consumers takes, a splitter right after the producers sends that item on its own side to the east edge. The splitter filters on the item, with its output priority on that side. The rest goes on as the line past the consumers. So the cocoons fan out like the saps, and every consumer's belt can end in it.
- **Layouts tried in turn**, those with the fewest belts from the west edge first:
  1. The Side Inputs' lines are laid first. Each producers' line that then finds no way is chained instead, one by one.
  2. Every producers' route is chained, the Side Inputs' lines laid after the links, as before. With these lines laid first, vrauks-1's water barrels found no way down the west column.
  3. The Side Inputs' lines run past three Parts at most.
  4. The Side Inputs' lines are laid after the producers'.
  5. Each Part's Side Input comes from the west edge on its own.
- **Maximize** tries Bands at the most its Parts hold and one fewer. Then it bisects between the highest known to fit (the Foretelling) and the lowest above it that did not. Once settled, it tries two above the best once and bisects on from there, since whether one routes comes and goes with the Count. Each Bands try stops at the search's time budget. Here the Parts hold 79 paddocks, far more than route. Before, eight tries one by one down from the top all failed, many minutes each.

Py vrauks-2 in that City Block: Maximize finds 60 paddocks, 55.4/min, not 27.3/min, in 9 minutes. The incubators stand two rows of eight in three tall Slots. The paddocks are a row of six to eight in the short Slots below the top ones, and two rows in the last tall Slot. The saps stand in the two top Slots. Vrauks-1 keeps its 78 paddocks, native flora and moss on two belts.

Still:
- The search alone has no Fan-outs from producers and no byproduct filter, so without Fixture rows it still stops where the barrels chain.
- The outputs leave on a belt per Part, where one carries them all.
- At 60 vrauks-2 paddocks, the west column's links leave the Side Inputs' lines too little room, and they come in on a belt per Part.
