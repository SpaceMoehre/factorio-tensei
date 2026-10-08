---
status: accepted — refines ADR 0015, ADR 0019 and ADR 0023
---

# Annexes: the chain again in the room a layout leaves

Py moss by Moss-1 in a 116 × 116 City Block (Buffer 1), its carbon dioxide (moondrop greenhouses), muddy sludge (washers) and soil (soil extractors) made here, water by train. Maximize stopped at 648/min: 135 farms in a stack 84 × 75, the other three Sub-Blocks below it. A strip about 80 × 30 at the bottom right stayed empty, and narrower ones beside the stack. One more farm grows the stack by a row, and that row has no room; the empty strip is too low for one more Copy.

The user's rule: once a Sub-Block is as big as it gets, start a new, smaller one in the empty room, together with its own dependent Sub-Blocks, and grow it. The same holds for a fixed rate: where the block gets too big before it reaches the rate, fill the room left with a smaller one until the rate is reached.

What changed:

- **Annexes** (`annex.js`). Once Maximize has its highest rate (Bands and the sorting try included), it runs again in the same City Block. Everything the layout built counts as Fixtures there:
  - its poles stay poles, and the Annex's poles join them;
  - its belts and pipes stay what they are, on routes of their own, so no belt of the Annex runs into theirs and no pipe of the Annex lies beside theirs;
  - its tunnels are kept, so no tunnel of the Annex pairs with theirs, nor do the Annex's buried pipes;
  - the tiles where a pipe would join its machines take no pipe.

  The Annex is the whole chain over again, each of its Sub-Blocks a Sub-Block of its own, linked only to its own. Its Side Inputs come from the west edge and its Side Output goes to the east edge, as the first layout's do. It is maximized there without Bands, then added to the layout:
  - its Sub-Blocks and routes are numbered after the layout's;
  - a pole either layout's poles now make redundant goes;
  - the two together are checked and simulated, since a check of each alone misses a tunnel of one pairing with the other's.

  This repeats with the layout so far while an Annex fits. Its rate, machines and Goals are the sums.
- **A cap** (`most`, `cap(n)`): no try above so many machines. Filling stops at the cap, and once the cap fits there is nothing left to try. Each Annex is capped by what the layouts before it leave of the cap.
- **Fixed rates fill up to the rate.** A fixed rate in a City Block may be foretold not to fit, or a build may find no layout for it there. It is then a Maximize capped at the Goals' own rates (`upTo`): the highest that fits up to them, then Annexes until they are reached or nothing more fits. The status says how far it got of the rate asked.

Py moss in 116 × 116:

| Run | Rate | Farms | Time |
|---|---|---|---|
| Maximize, before | 648/min | 135 | 47 s |
| Maximize, now | 777.3/min | 135, 18, 8 and 1 | 6.4 min |
| 750/min asked, now | 749.99/min | 135, 18 and 3 | 2.4 min |

In the 777.3/min run the first Annex stands in the strip at the bottom right: two rows of 9 farms with their own greenhouse, washer and soil extractor beside them. The later Annexes fill the gaps left.

Still:
- Each Annex costs a whole Maximize. The last one, a single farm, takes minutes for under 1%.
- An Annex's small Sub-Blocks are its own. A second greenhouse beside a first that has room to spare is not shared.
