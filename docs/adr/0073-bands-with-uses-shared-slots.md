---
status: accepted — refines ADR 0025, ADR 0027 and ADR 0048
---

# Bands with a fluid's Use; Slots shared; the regression suite

Py trits at 60/min (`trits-1` in trits reefs, 10 × 10) with trits-pup made in rcs (22 × 22, `trits-cub-1`, taking back a quarter of the trits: a Recipe Loop), wood seeds and wood made, and the reefs' waste-water evaporated to urea (a Byproduct Use), in a 118 × 118 City Block, Buffer 4, Maximize, yellow belts. Four roboports with their big poles stand in it, two rows of two, so its rows free of Fixtures are three gaps: 22, 56 and 22 tall. The page found 4.5/min, 18 reefs in a core of 76 × 60 round the Fixtures, two rcs below it and a third of the block empty; above 18 reefs the chain needs a third rc, and "no room for trits-pup".

Causes, found in tries that should have fit:

- **Bands refused the chain** (Bands' top 0). Bands puts reefs a row to a gap, but returned nothing for a chain with any Byproduct Use: a Sub-Block's parts give their byproducts to none. Here the byproduct is a fluid, and pipes join.
- **A Slot to each Part, whatever it takes of it** (27 reefs: "trits: its parts fit no gaps"). The rcs, most constrained, took the 56-tall gap for one row of three (28 rows), the wood-seeds factories a whole 103-wide gap for four; the reefs were left 20 places for 27.
- **The first Slot each producer takes, never another** (26: "trits: its parts fit no gaps"): the wood seeds took the narrow gap the reefs needed whole, where the rows the rcs leave over held them.
- **Producers' Parts with spare machines a row wide**: four rcs for three needed (spare 1.15), 22 tiles a machine.
- **A packing that leaves the rcs to Placement** (Bands' top 32, every try from 32 down failing "no room for trits-pup", 627 s): with the City Block cut at a Fixture column, no Slot is wide enough for a row of rcs, so they stood where Placement finds room, and there is none 22 deep.
- **A Sub-Block left out of the Parts placed first** (26: "copies overlap"): the urea evaporator took the corner a Part of reefs was to stand in, and that Part landed on the rcs'.
- **The leftover copy counted as a belt of its own** (19: every design of copies starving 1.63/min). Copies of reefs and a leftover copy on one trits-pup belt: the belt snakes on into the leftover copy, but `copiesUnfed` counted it as a run of its own, one more than the path's one belt. (With it fixed, copies still find no room at 19: the gain is Bands'.)

What changed:

- **Bands with a fluid's Byproduct Use** (bands.js `banded`, `laid`): the Use takes the fluid from the first Part of its source; the source's other Parts and the Use's other sources join that Part's pipe (`joins`, as a General Use's sources do). Entries' `from` and `joins` are mapped to the Parts. A Use of a solid still keeps Bands out.
- **Slots shared** (bands.js `inBands`): a producer all of whose machines one Part takes, in a Slot holding more, takes them whole (none to spare: every Part taking from it takes from this one), and the rest of the Slot is a Slot of its own, below it (two Parts one above the other in the gap, `share`: designs fit its height together, placed in the middle) or east of it in one row or two, whichever holds the most of the Goal's machines. A producer in several Parts keeps its spare, as before.
- **Producers' Slots searched** (bands.js `inBands` `fill`): each producer's first Part in each of the 4 Slots that take most of it in turn (`BRANCHES`), the Goal's Parts after them, the first way all fit (64 ways at most, `PACKS`).
- **No room for a Sub-Block left out** (bands.js `inBands`): one whose machines the free Slots and the rows Parts leave hold too few of, in rows a machine and 2 deep, fails the packing, so Bands' top is what can be laid out.
- **Those with a spot placed first** (bands.js `laid`: `ahead`).
- **A Recipe Loop by train last** (bands.js `inBands`): of the ways to choose producer Parts, one whose loop's tap finds no way is kept only where none closes it (the search ranks it so too).
- **The leftover copy on the snake** (design.js `copiesUnfed`): copies walked in the order the belt runs through them, a kind's module and its reverse in turn, the leftover after; a run goes on into a copy whose part runs the other way while it has machines to feed.
- **The regression suite** (`.claude/skills/tune-layout/suite.json`, `scripts/suite.mjs`, `scripts/suite-one.mjs`, `npm run suite`): 15 setups tuned so far, each laid out the same on any host (K candidates a try), against the result recorded for it; a change with a loss on any of them is not kept, and every setup a pass starts from joins it.

| Py trits, 118² among 4 roboports, side by side | Before | After |
|---|---|---|
| Rate | 4.45/min | 6.94/min |
| Reefs | 18 (one core) | 27 (Parts of 10, 7, 10) |
| rcs | 2 | 4 (one Part, sharing the tall gap) |
| Room empty | 7,200 | 3,672 |
| Maximize (load 6–10 on 8 cores) | best at 466 s, 872 s | best at 382 s, 578 s |

Regressions: the suite, HEAD against this change (K candidates a try, the same on any host): Py trits 4.11 → 6.94/min (16 → 27 reefs at 20 candidates a try); the 14 others the same rate, 12 of them the same layout (Py nexelit and kicalk lay out differently at the same rate); Py aramid left out of the suite (no result in an hour at 3 candidates a try).

The suite's first run caught three regressions before this was committed, each in Py vrauks among roboports (Bands' own reference): the Use's `from` mapping took every entry's `from`, so the water barrels' recycled barrels went to the paddocks' first Part (78 paddocks: "no room for cocoon"; now only a Use of a fluid); the room check counted a row as a machine and its BAND, turning away the 34 sap extractors that fit two rows in 18 (Bands' top 78 → 72); and the Shared Slot cut a producer's last Part of several down to its remainder (vrauks-2's third incubator Part 8 → 1), losing the spare whole Parts divide by.

Tests: the copies of 19 reefs starving nothing; Bands laying out 27 reefs, the rcs a Part sharing the tall gap with a Part of reefs, every Part's waste-water into the evaporator.

Still:
- The trits the rcs take come by train at 27 reefs (2.31/min): the tap off the reef Part feeding them finds no way, and at 26 the one choice of Part whose tap routes starves 1.7/min.
- 28 reefs: "no room for trits" (the gaps hold 27 beside four rcs and the wood seeds).
- 24 reefs: a loop by train routed from the east edge ("does not start at the west edge").
- A Use of a solid byproduct still keeps Bands out.
