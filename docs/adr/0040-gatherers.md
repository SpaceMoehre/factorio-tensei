---
status: accepted — refines ADR 0035 and ADR 0039
---

# Gatherers: a Goal's byproduct fed back from every output belt

Py sodium hydroxide on express belts in a 100 × 100 City Block, maximized to 3300/min: the limestone was neither sorted out at the end of its Sub-Block nor fed back to the lime. ADR 0039 fed back a solid only where one lane carries everything its step makes. At 2000/min the 20 chemical plants make 3000 items a minute on 2 belts, and a tap on one of them fed a third of what the lime takes, so the limestone came by train.

What changed:

- **Goals' steps feed back at any rate** (`expandChain`). The lane rule of ADR 0039 now holds only for a step whose item another step takes. Such an Internal Path's belts are joined by splitters and take no tap. A Goal's belts go on to the train each on their own.
- **Gatherers** (`tapLoop`, `routeGather`, compose.js). Where the loop takes all its producer makes of the byproduct, the producer's output belts left without a tap each gather theirs into the feedback belt short of it. A gatherer is a belt of its own. It starts at a filter splitter on that output belt, a few tiles past the producers, which gives it priority. It ends heading into the side of one of the feedback's straight belts, side-loading onto it. The output belt goes on through the splitter to the train.
  - Only where the loop takes all of it: a filter splitter whose filtered side backs up would stop the output belt.
  - A gatherer is routed right after its feedback's splitters, even where its own link comes first, since it needs the feedback belt to join. It may try 16 spots for its splitter, counting only those with room, and may search farther than a tap.
  - Where a gatherer finds no way, the layout is routed again; in the end, plain, every feedback by train. A feedback fed short would starve.
  - Where belts a splitter joins carry too much of it for the others to feed the loop, it comes by train.
- **Sim and checks.** The gatherer's output belt lists the feedback among its taps, so the simulation counts what the feedback takes first. The feedback's supply is what its tap and gatherers bring, and a gatherer not routed is dropped (`dropped`), unchecked.

Py sodium hydroxide at 2000/min on express belts:
- alone: one feedback belt of 1000 limestone a minute, tapped off one output belt (550) and gathered from the other (450). Nothing starves, and no limestone comes by train.
- in the 100 × 100 City Block: the same, no limestone by train.

- **Maximize prefers loops fed here** (`attempt`, maximize.js). A try took its first layout without Starvation, even one bringing a Recipe Loop's feedback by train. Now such a first fit is kept while the search goes on about as long again (at least 1 s) for one feeding it here; the search's clock then runs out.

Py sodium hydroxide maximized in the 100 × 100 City Block (express belts, bulk inserters, hpf-mk04): 3099.94/min, not 2499.98. The two Annexes making their own lime feed the limestone back in the block. The first layout (21 chemical plants) still brings its limestone by train: in the room it has, no gatherer found a way within the extra time.

Still: the gatherer side-loads onto one lane of the feedback, and no check makes sure that lane has room. An Internal Path's byproduct still comes by train above one lane (ADR 0039).
