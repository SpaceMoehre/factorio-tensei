---
status: accepted — extends ADR 0005
---

# Building inside a City Block: Fixtures stay, nothing is squeezed

A City Block's blueprint holds what the user has already built — poles, roboports, radars, lamps, rails. They stay where they are (Fixtures), so the Compound Block is laid out in the City Block's own coordinates from the start: Placement puts every Sub-Block inside the Buffer and the links are routed on a grid holding the Fixtures, round them or under them. Laying the block out on its own and then looking for a spot where it misses every Fixture would fail for any City Block with a roboport or pole inside.

A Fixture may stand in a Module's empty tiles: Placement checks each Module's machines, inserters, belts and pipes (and the tiles where its belts meet their links) against the Fixtures, not its box. Boxes would keep every Sub-Block clear of a grid of substations, which leaves no room for anything bigger than the gaps between them.

The block is not squeezed. Taking a line out moves everything beyond it, and the Fixtures cannot move. It packs looser than one standing on its own; the search's corridors and gaps make up some of it.

The Side Input enters on the Buffer's west edge and the Side Output leaves on its east edge, as on any Compound Block's edges, so the user knows where to bring and take the belts. Placement starts the Goals against the east edge and then slides the whole block west as far as it fits: the Side Input has many belts and the Side Output few, so the outputs cross the City Block, not the inputs. Where a Fixture stops the slide, each Side Input is routed in two legs, through the block from the column just west of it and then from the west edge, so the router does not flood all the room in front of the block.

A City Block's poles are taken as one network (its blueprint wires them), so nothing of the block needs to connect them; its own poles join that network, bridged by a best-first search toward it (it may stand far off). The exported blueprint is the City Block's own, entities, tiles, wires and snap grid as they were, with the Compound Block added: pasted onto the built city block, only the factory is new.

Maximize looks for the highest rate by trying whole numbers of the first Goal's machines, each try a layout search that ends at the first layout without Starvation. The machines' footprints bound it from above before any try; which numbers it tries, and when a try gives up, is ADR 0008's. Don't search the rate inside one layout search: the Count, the Modules and every design change with it.

Later, Sub-Blocks are kept apart the same way: one may stand in the room another's box leaves, its Nook (ADR 0016).

Later, a Fixture may also stand where a machine would: that machine is left out and built apart (ADR 0017).
