---
status: accepted — refines ADR 0004 and ADR 0013
---

# A belt that cannot be connected spaces the blocks out

A candidate whose links did not route used to be dropped, and the search moved on to the next. The user set the rule: if a belt cannot be connected, space out the blocks to make the space.

Routing therefore says where it failed. The error compose throws names the Sub-Blocks the failing link runs between:
- the copies it leaves and enters;
- for a Side Input, the one it feeds;
- for a link to the east edge, the one it leaves;
- for a fluid, every one it joins;
- for splitters, every belt's through them.

A machine that no pole can power names where it stands, which is the Sub-Blocks about that tile.

The same candidate is then tried next with room made round those Sub-Blocks. Placement gives a Sub-Block a padding (`pad`) of 4 tiles on every side, its machines standing that far in from its box's edges. Each further failure doubles the padding. From the fourth time on, every corridor and gap also widens by 4 each time, and after six times the candidate is given up. Where it is not known which Sub-Blocks a link ran between, everything widens at once. A candidate spaced out like this is tried before the rest, and does not count against a City Block search's patience. Where the room is not there, as in a City Block too small for the padding, placement says so and the candidate fails as before.

Compose's own retries come first: links rerouted in another order, a Fan-out after the other Side Inputs, and no splitters at all. Room is made as soon as a layout with its splitters fails. The roomier candidate may then route with them, and it ranks above a layout taking a loop's feedback by train.

On Py kicalk, Spread's packing of the smaller Sub-Blocks below the plantations had failed: no tile could power an inserter there. With the room made round it, it routed: 462 × 502, then 385 × 498 (score 135,238), instead of 507 × 436 (151,611).
