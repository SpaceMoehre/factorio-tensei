---
status: accepted — refines ADR 0005 and ADR 0068
---

# Placement takes a producer of many belts next

Py small parts 2 at 1237.5/min in a 116 × 116 City Block of 32 medium poles, as ADR 0074 left it: 1496.23/min, 8 small parts factories and an Annex of 1. The user's rule: "when I max my layout, some consequent Sub-Blocks are not near each other; it is generally more effective if the next processing step is adjacent to the previous step."

Cause: Placement went by depth, consumers first, so all of the Goal's producers were placed before any producer of theirs. The bolts' iron sticks (19 machines, 8 belts to the bolts) came after the small parts' own iron sticks (2 belts) and belts (1). Those took the room west of the bolts, and the iron sticks stood east of the Goal, 35 tiles from the bolts, their 8 belts running back across it (778 tiles).

What changed:

- **A producer of many belts next** (place.js `chainOrder`, `placeBlocks`): still by depth, but where a Sub-Block whose consumers all stand has 5 belts or more to them (`AHEAD`), and more than twice the belts of any step in the chain behind the next by depth, it goes next, beside the step it feeds, before a lighter one takes that room. Belts only: a pipe link is a stub of each copy, and counts run to 168.
- Tried and dropped, each losing a Count in the suite:
  - **The chain followed down for every step** (the one feeding the latest placed next): Py titanium plate 14 → 3 casting units, perylene 11 → 10.
  - **The most links next, gated at twice the next by depth**: molybdenum oxide 5 → 4 furnaces. Its concentrate (4 belts) went before the nitrogen (1), the only way to the purest nitrogen (36 pipe links and more).
  - **Each Sub-Block weighed by the heaviest step in the chain behind it**: anthraquinone 9000 → 6000/min, coke 2160 → 1800.
  - **Whatever is ready, else by depth**: among the Sub-Blocks placed first (`ahead`) and Recipe Loops, anthraquinone's vanabins (depth 4) came before the steps at depth 1. Only a jump changes the order now.
  - **Placed by depth again where a candidate placed so fails**: titanium plate kept its 14, but the user's 8 fit only by depth and so came out as before.

| Py small parts 2, 116² among 32 poles, the page's Maximize, one try at a time | Before | After |
|---|---|---|
| Rate | 1496.23/min | 1619.98/min |
| Small parts factories | 9 (8 + an Annex of 1) | 9 (7 + an Annex of 2), all whole |
| Bolts' iron sticks to the bolts | 35 tiles apart, 8 belts, 778 tiles | 15 apart, 7 belts, 505 tiles |
| The first layout's links | 1584 belt tiles | 1081 |
| Maximize | 439 s (best at 165 s) | 550 s (best at 359 s) |

The gain comes by way of the Annex: 8 in the first layout no longer fit, and 7 with their iron sticks beside the bolts leave room for an Annex of 2.

Regressions: the suite's full tier, the 15 others the same layout, 1896 s at 4 at once.

Tests: the order on Py small parts 2's belts (the bolts' iron sticks right after the bolts; four belts over two by depth; a light step a heavy one feeds by depth, the heavy one next; a Recipe Loop by depth).

Still:
- In the Annex, the small parts' own iron sticks and belts stand 57–63 tiles from their small parts. The Annex's room is a strip along the bottom, and the bolts' iron sticks take the part of it next to the bolts.
- Where the room west of a step is cut up by Fixtures (Making Way's `solid` retry), its producer still stands one Sub-Block further west: the bolts' iron sticks are 15 tiles from the bolts, with the small parts' iron sticks between them.
- Any change of Placement's order moves a Count somewhere in the suite (above). Adjacency for lighter steps needs a measure the search ranks layouts by (link length), not an order.
