---
status: accepted — refines ADR 0045 and ADR 0088
---

# An Annex turns a Sub-Block that finds no room

The user's rule: "you can rotate complete subblocks … a subblock does not have to be a square".

How it was found: as ADR 0088, an Annex tried beside each finished layout's largest empty rectangles. The room the layout before an Annex leaves runs in strips: Py silicon's second Annex had 22 × 75, 22 × 27 and 27 × 22 free, its soil extractors 31 × 18; Py hot air's 21 × 73, 13 × 77 and 17 × 55, its warmer bricks' 10 heat exchangers 55 × 9. Turned a quarter, each stands in a strip; narrower designs of them exist, but taller than the strips or, as stacks of copies, wider with the lanes beside them. The search turned no Sub-Block: only the user's Turn did (ADR 0045).

What changed:

- **Turning** (search.js `search`, option `turning`): a Sub-Block that finds no room is tried next in the same candidate turned a quarter (its design's modules turned, layout/turn.js `turnDesign`, as the user's Turn turns them; compose.js routes a turned Sub-Block's belts from any side).
- **Only an Annex's try that found no room, once more** (maximize.js `attempt`): in an Annex's room, a try that found no layout (not out of time, not starving) is made again turning. Turning in every Annex try changed what fit where it fit already (Py rayon's Annex 10 → 9 machines, coke 7 → 5); after a miss it only adds.
- **A copy's pipe beside a built pipe of its own fluid in another network** fails as placed too (compose.js `placeAll`, ADR 0088's check): hot air's turned Annex fit with its coke oven gas pipe against the first layout's, two networks joined.

| | Before | After |
|---|---|---|
| Py silicon 116², the suite (20 candidates a try) | 555/min: 4 furnaces and an Annex of 1 | 675/min: 4, 1 and 1, the second Annex's soil extractors turned (31 × 18 standing 18 × 31) |
| The 15 others | | the same layouts (titanium free no layout either way) |
| Py silicon on the page (1000 s tries, side by side) | 795/min (5, 1 and 1), done at 432 s | the same, done at 481 s: with the page's time the second Annex fits unturned too |

Tests: turning, a Sub-Block that finds no room is tried again turned a quarter; not turning, never (fluids-between.test.js).

Still:
- Hot air's Annex fits turned (30 candidates and more), beyond the suite's 20 a try; on the page its first layout holds 2 heat exchangers and no Annex fits beside it either way.
- A turned Sub-Block is turned a quarter one way only; a half turn, or the other quarter, is not tried.
