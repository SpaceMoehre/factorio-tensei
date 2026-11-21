---
status: accepted — refines ADR 0026
---

# Side Inputs each on its own

The setup (the user's, `/tune-layout`): Py advanced circuits, 60/min asked (one chipshooter), among 8 roboports and their big poles in a 116² City Block whose snap grid spans 238 × 120 (buffer 4), Maximize on. The chain is 29 Sub-Blocks of a machine or a few (clay to ceramic to crude cermet to cermet to resistors, capacitors, inductors, diodes, transistors, microchips, mosfets, pcbs), 46 items by train: 30 Side Input belts and 8 pipes from the west edge. The Foretelling said 120/min (2 machines); the page reached 19.5/min (0.325 machines), the layout spanning the whole room (225 × 112) with 5460 belt tiles.

Cause: at 1 and at 0.625 machines every candidate failed on a belt finding no way (528 candidates at 0.625, none fitting; 1558 with no patience limit, none; seeds 2–4 none). 13 of the 30 Side Inputs were taken by several Sub-Blocks and, each carrying less than a belt, came on one belt chained from one Sub-Block taking it to the next (tin-plate from the west edge through resistor1, capacitor1, diodes, microchips and the pcb mill). Those Sub-Blocks stand far apart (the chain is 7 deep across the block), so each chained belt ran across the block between them, crossing the others and taking the corridors the links between Sub-Blocks needed.

What changed:

- **In a City Block where 3 Side Inputs or more would each be chained across Sub-Blocks, every Sub-Block takes each on its own** (routes.js `buildRoutes`, `CHAINED`; design.js `context` passes `city`). As a Side Input more than a belt already did (ADR 0026), their belts share a line from the west edge, a splitter sending one off into each (a Fan-out across Sub-Blocks); two bound for one Sub-Block share a belt, a lane each (Belt Merge). One or two chained stay chained: made so everywhere, Py perylene's Annexes (phosphate rock to two Sub-Blocks) lost 3300 → 2460/min, a line and splitters taking more of their room than a short chain.

| Py advanced circuits 116², one try at a time | Before | After |
|---|---|---|
| One try at 0.625 machines | no fit (528 candidates, 450 s; 1558 with no patience limit) | fits at the 2nd candidate (17 s) |
| Maximize (3000 s) | 19.47/min (0.32 machines), best at 2127 s | 46.87/min (0.78 machines), best at 1269 s |
| Valid, starving, byproducts riding | yes, 0, 0 | yes, 0, 0 |

| Suite | Seed 1 | Seeds 2 and 3 |
|---|---|---|
| Fast tier, 11 setups | every layout the same | — |
| Trits 236² (Bands' Parts of the reefs make its seaweed, moondrop and filtration media three chained) | 32.13 → 34.19/min (125 → 133 reefs) | 32.91 → 35.73, 32.91 → 32.65 |
| Full tier | every layout the same but trits 236² | — |
| Py advanced circuits 116² (added, K 20) | no layout (the Sub-Blocks fit no columns, 308 s) → 44.96/min (0.75 machines, 250 s) | — |

Tried and dropped (each a cause found, none moving this setup's rate):

- A pipe's way out of its copy (the tile beyond its stub) kept like a machine's fluid connection, no other network's pipe beside it until its own stands there: "ammonia (al-pulp): connection is blocked" had sunk 113 of 290 candidates at 1 machine (etching's pipe from the west edge ran past ammonia's way out of the phenolic board mill). Gone, the candidates failed on belts instead; Maximize the same 46.87/min, later; perylene 3300 → 2700.
- Pipes routed as tunnels (pipe-to-ground reaching 32 tiles), or buried as soon as their network is routed, rather than as plain pipes walling rows of the block until finishing buries them: no try fitted that did not before, and routing slowed.
- More patience (every candidate to the budget) or other seeds at 0.625: none fit.

Tests: three Side Inputs each taken by two of four Sub-Blocks come chained standing on their own, to each Sub-Block on its own in a City Block (merged two to a belt where bound for one), two stay chained (side-inputs.test.js).

Still:
- One machine (60/min) does not fit: candidates fail on links into the chipshooter, whose ten belts arrive at one 12 × 15 face; belts coming along the face to their entry run in columns in front of it and wall off the entries of those routed after.
- Train pipes run as plain pipes across the room while belts are routed (buried only when the layout is finished): rows of pipe a belt must tunnel under.
