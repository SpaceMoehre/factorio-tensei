---
status: accepted — refines ADR 0007, builds on ADR 0006
---

# Making Way: a Fixture may stand where a machine would

In a City Block a Fixture could stand only in a Module's empty tiles (ADR 0007). Modules are dense, so a Sub-Block went round every roboport and pole: beside it, or below it with the room in between wasted. A City Block with a roboport in each quarter leaves 56 tiles between them. Py nexelit plates in 118 × 118 stacked their foundries and washers in that strip and left the rest empty: 797/min, with the block's sides bare. The user set the rule: Sub-Blocks should take the Fixtures in. It is better to leave out the one building a Fixture stands on and add it at the end than to shift the Sub-Block past the Fixture.

So a Fixture may stand on a machine:
- Placement tells each copy's machines and their inserters from the rest of its tiles. A Fixture may stand on those, never on a belt, a pipe or anything else of the copy.
- Each machine a Fixture stands on is left out of its copy, with its inserters. A Sub-Block may lose a tenth of its machines this way, at least one. None are lost where it is a single machine, or where the search made room round it.
- A spot costs four machines' room for each machine it leaves out. A spot without Fixtures on machines still wins where it grows the block as little.
- The search then builds that layout. The copies leave those machines out, and as many single machines stand apart, downstream of the stack like a Breakout's (ADR 0006), so the Sub-Block keeps its Count. Every Sub-Block stands where it stood, and the belts are worked out again for the machines that are there.
- Where that layout fails (no room apart, a link that does not route, Starvation), the same candidate is tried next with every Fixture kept off the machines.

Py nexelit plates in that City Block now run rows of washers straight through the roboports. Maximize fits 1019/min (57 foundries) instead of 797/min. In a City Block with a substation every 18 tiles, Py small parts reach 1575/min instead of 1387/min.

A City Block's area is its blueprint's snap grid even where poles shared with the neighbouring city blocks straddle the grid's border. Before, one entity outside the grid made the area the extent of the blueprint, and the block could stand in the neighbours' rows. A grid far smaller than what the blueprint holds (a rail grid) only aligns it, as before.

Don't route a copy again round a Fixture. The copy stays the Module it was designed as, less the machines left out, and its belts run on past the gap.
