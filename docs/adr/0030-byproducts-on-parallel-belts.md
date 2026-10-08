---
status: accepted — refines ADR 0028
---

# Byproducts on parallel belts, and Maximize's budget after designing

Py molybdenum oxide, maximized in a 236 × 236 City Block among roboports and big poles, found nothing: not even 62/min. Three things stood in the way.

- **A byproduct kept its route on one belt.** Py's ball mills make molybdenite dust with gravel (1800 and 180 a minute at 200/min), the jaw crushers crushed molybdenite with stone (900 and 360). The agitators and the mills take only the first. A route whose items partly leave on the train was no Internal Path: it ran as one belt, through the producers and consumers and on to the east edge. More than one belt carries (900 a minute) starved every design, so Maximize had no layout at any rate. Side Belts also cut that one belt into parts, which then could not chain at all.
- **A try's budget went on designing.** Ten Sub-Blocks take about 10 s to design in that City Block. The candidates got what was left of the try's budget, here none (the budget was 1 s), so the first layout, found about 5 s after the designs, was never reached.
- **Bands checked every Slot by designing anew.** Whether a Sub-Block's machines stand two rows to a Part in a Slot was designed for each row length and Slot, with every kind of variant: about 60 designs of 5 s before Maximize's first try (298 s).

What changed:

- **Byproducts sorted out of each belt.** A producer's route to its one consumer Sub-Block, whose only item left over is one its consumer does not take, and more than one belt carries, is an Internal Path all the same (`sorted`): parallel belts, each a run of producers to a run of consumers. Each belt sorts the byproduct out right after its producers with a filter splitter, on to the east edge, and the rest goes into its consumers. Where a splitter finds no way, that route's belts run on through their consumers to the east edge, the byproduct with them, as one belt did before (ADR 0028). No splitter joins such belts, so the path takes as many of them as make the fewest producers a belt has make what the most consumers it has take: 12 ball mills to 8 agitators on 4 belts (3 to 2), not 3 (4 to 3, 75 a minute short). Each belt carries what its own producers' lanes carry, the byproduct with it.
- **A route that runs as one belt stays one on Side Belts.** A Side Belt runs down every machine.
- **The budget is the candidates'.** A try's candidates get its budget once the Sub-Blocks are designed (`routing`). The search says when it stopped for want of time (`timedOut`): only such a try bounds the next as one that starves does, not one that took long to design.
- **Bands' two-row check designs each row once.** The sizes of the designs that route without starving are kept for the Sub-Block and the row, and each Slot is checked against them. They are designed from rows of that length only, Fluids Between and random draws of that length (`only`): no other variants, copies or Side Belts.

Py molybdenum oxide in the 236 × 236 City Block (Buffer 4), Maximize with a 10 s budget: 199.99/min (2 furnaces), the Bands check 34 s, not 272 s. Above that, 16 ball mills to 11 agitators divide among no belts without a splitter (the milling starves), and at 400/min the hydrocyclones' concentrate starves.

Still:
- A route sorting a byproduct out gets no splitter between its belts: where its producers and consumers divide among none evenly, it starves.
- With a 1 s budget the City Block's first layout is still out of reach: the candidates need about 5 s.
