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

## Above 200/min

At 200/min the City Block's layout was 228 × 178, two thirds of it empty: 400/min and more found no layout.

- **Belts a splitter evens out, in the design.** Ten hydrocyclones make 1200/min of concentrate for seven thickeners on two belts, cut 6 and 4 to 4 and 3: 720 for 686 and 480 for 514. The Compound Block joins such belts through a splitter (pairUp), but the design judged each belt on its own, so every design starved (34/min short) and Maximize gave up. A design now pairs a belt short of what its consumers take with the one that makes the path deliver the most, as pairUp does, while that helps (not belts sorting a byproduct out: none joins them).
- **Designs routed past one that starves.** Looking for a layout without Starvation, a Sub-Block's designs are routed past a first one that starves however long that takes. Before, once the try's time was up (it often was while designing), the first was all there was: the hydrocyclones' copies (300/min short) ended the try though a whole module starved nothing.
- **A byproduct riding on where its belts cannot sort it out evenly.** Where belts sorting a byproduct out, each on its own, would starve their consumers (or chain none: four crusher copies to three runs of mills), they are joined as any Internal Path's belts are (merging, forking, a splitter between two), and the byproduct rides on through the consumers to the east edge. Each belt brings what its consumers take where its producers' lanes carry it (as an Internal Path's do), not only its producers' share at the plan's rate.
- **Even input belts first.** Of the designs that starve alike, those whose belts of a path sorting a byproduct out take nearer an equal share each come first.
- **Candidates get as long as designing took.** A try's candidates get its budget, and never less than designing took: here about 20 s, the first layout some 10 s after.

Py molybdenum oxide in the 236 × 236 City Block, Maximize (budget 1 s or 10 s): 599.99/min (3 furnaces, 147 machines, 228 × 168) in about 6 minutes, not 199.99. At 662/min the hydrocyclones still starve 5/min (20 of them at 800/min: 60), more than one splitter per belt would even out.

## Sorted out by splitters where they fit

At 400/min and more no belt sorted its byproduct out: wherever runs of producers and of consumers did not pair up one to one without starving, every belt of the route rode on. A filter splitter that found no way also set every belt of its route riding, and only when it failed on the first try at the links.

- **Filtered lines into several runs of consumers.** Where one belt per run would starve, each run of producers still sorts the byproduct out right after them; the rest goes on as a line past the entries of as many runs of consumers as it brings what they take, a splitter before each (a Fan-out). The consumers are cut as finely as they chain (a belt off the line enters from either side), dealt out in order so that each line keeps within what it brings, with the fewest runs of producers that do. Only where no such dealing exists (22 ball mills making 3630/min of dust for 15 agitators taking 3600, 240 each) do the belts ride on, joined.
- **A splitter that finds no way rides on alone.** Its run keeps its line past its consumers, the byproduct with it, each belt off it on to the east edge; the other runs keep their filters. This holds however the links are routed: the Fan-outs last, without those across Sub-Blocks, or plain.
- **Maximize sorts at the end.** A layout sorting byproducts out takes far longer to find (at 600/min in the 236 × 236 City Block, over 2 minutes of candidates, not under one). Maximize's tries let every byproduct ride on (`unsorted`); the highest that fit is tried once more with them sorted out, its candidates given at least 2 minutes (`SORTING_MS`), on past layouts that ride to the first that rides nowhere (`sorting`). It is kept where it rides less.

Py molybdenite pulp at 9000/min outside a City Block: every gravel and stone belt filtered (was gravel riding). Py molybdenum oxide in the 236 × 236 City Block: at 200/min all six byproduct belts filtered; at 599.99/min (Maximize's best) no layout with filters was found within the 2 minutes, so the byproducts still ride on there.

Still:
- A route sorting a byproduct out gets no splitter between its belts: where its producers and consumers divide among none evenly, it starves.
