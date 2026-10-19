---
status: accepted — refines ADR 0026, ADR 0031 and ADR 0032
---

# An Annex's belts from the train come off the block's

The user's rule: this setup has two drill inputs that could be one.

Py coalbed gas in 80 × 40 (Buffer 4), Maximize: 7800/min, 11 coalbed extractors and an Annex of 2. The Annex's drill heads (8 a minute) came on a belt of their own from the west edge, 56 tiles along the block's south side, beside the first layout's (44 a minute, one belt carries 900). An Annex's Side Inputs came from the west edge as the first layout's (ADR 0031); Draws joined built pipes only, a belt needing a splitter cut into it (ADR 0032's "Still").

What changed:

- **An Annex's belts fed from the block's** (compact.js `shareSideBelts`, run by annex.js `annexed` once the Annex is laid out beside the block). An Annex's belt of one item from the train, where a belt of the block's from the west edge carries that item alone with room for both, is cut short: the stretch of it before any machine takes from it (straight belts, up to 12 cuts spread over it) is routed again from a splitter cut into a straight belt of the block's, not one an inserter takes from, the splitter's other side and the tile ahead of it free. Of the ways found, the one costing least over what it frees is kept, longer or not: one belt from the train fewer. The Annex's belt is then a Fan-out branch of the block's (`fedBy`), whose route counts what both take; one that finds no way comes from the west edge as before.
- Every Annex after it sees the new belt as a Fixture, as it does all built before it.

| | Before | After |
|---|---|---|
| Py coalbed gas in 80 × 40, Maximize, one try at a time (side by side) | 7725/min (11 and 2), drill heads on 2 belts from the train, best at 30.7 s, done at 51 s | 7725/min (11 and 2), drill heads on 1 belt (the Annex's 15 tiles off a splitter, not 56 from the west edge), best at 31.3 s, done at 51.7 s |
| Vanilla electronic circuits in 40 × 30 among a roboport, Maximize | 810/min (6, an Annex of 3); 4 belts from the train | 900/min (6, Annexes of 3 and 1); 3 belts from the train at 810, 4 at 900: the room the Annex's belts no longer take holds another Annex |
| Py small parts in 100² (`maxdet.mjs`, 20 candidates a try) | 3000/min | 3000/min |

Tests: Maximize with Annexes in 40 × 30, every layout valid: an Annex's belt from the train starts at a splitter on the first layout's, and nothing starves.

Still:
- Only a belt of one item: a Belt Merge's two items, a lane each, would need the splitter to keep each lane where the Annex's Sub-Blocks take it.
- The way is found once the Annex is laid out, not while its layout is searched: its Sub-Blocks stand as they would with a belt from the west edge.
- An Annex's belt is fed only from a belt of the block's from the west edge, not from another Annex's fed this way.
- Py molybdenum oxide, kicalk and titanium plate (Annexes taking solids from the train) were not run again.
