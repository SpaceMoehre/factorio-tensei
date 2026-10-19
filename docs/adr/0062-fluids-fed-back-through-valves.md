---
status: accepted — refines ADR 0032, ADR 0035, ADR 0041, ADR 0052 and ADR 0055
---

# Fluids fed back through valves; items and fluids leaving by train too; fluids destroyed

The user's rules:
- Reuse a material that comes out as one goes in for fluids too. The coalbed production runs water → pressured water → coalbed → water. The input is to be capped by an overflow valve.
- The user chooses whether any material or fluid is also available on the output side, through splitters that prefer the internal chain, or overflow valves capping the output side.
- The user chooses whether to destroy a fluid in an exhaust pipe or a sinkhole: which fluid goes into which is the game's.

Py coalbed gas (`minor-extract-gas-from-coalbed-3`) gives back as water all the water its vacuum pumps take for pressured water: 7800/min needs 130000/min of water, and the extractors make 130000. Before, a fluid's Recycled Byproduct came only where the steps taking it did not feed its step (ADR 0035): the extractors' water left by train while two offshore pumps made the vacuum pumps' 130000.

What changed:

- **The catalog** (catalog-builder.js `valves`, `voids`): the valves one can build — Py's overflow and underflow (top-up) valves, 12000 a second; base 2.0's are hidden — and, for each fluid, the building destroying it: the one running on no energy, with one input box, whose hidden recipe takes that fluid and makes nothing. That is Py's sinkhole for 387 fluids and its gas vent for 71 (neutron has none).
- **Fluids fed back** (chain.js, where the catalog has both valves):
  - A fluid a step makes besides its item, that a step of the chain makes for the steps taking it (no Goal, none a Use takes), goes to those steps first. The step making it makes only the rest, its row of the linear system less what the byproduct gives, as a Supplied Item's (`supplies`, `valve`).
  - Where the byproduct covers all its takers take, it still leaves that step a hundredth (`TOP_UP`), so a closed loop starts and keeps up. Py coalbed gas: one offshore pump at 1300/min.
  - A fluid the train brings that a step makes less of than its takers take now comes from that step all the same; the train brings the rest (`topUp`). One whose takers feed its step (a loop) comes from it too, the train bringing a hundredth.
  - Entries carry it: `overflow` (fluids whose spare leaves through an overflow valve) and `topUp` (fluid → the entry making the rest, or the train).
- **Flows and routes** (flows.js, routes.js):
  - The byproduct's pipe is an Internal Path to its takers, though it closes a loop: no longer by train, and no step of the Dependency Order (`fedBack`).
  - What makes up the rest joins it through a top-up valve: the making Sub-Block's pipe, or a pipe from the west edge (`valve: { mode: 'top-up', on }`).
  - Its spare leaves on a pipe of its own off an overflow valve (`source: 'valve'`, `valve: { mode: 'overflow', on }`), to the east edge or destroyed.
  - Neither valve route joins a network (pipeNetworks).
- **Routing** (router.js, compose.js):
  - A valve route reaches a valve beside a pipe of the route it meets: the valve faces so that its output (top-up) or input (overflow) meets that pipe (`valveSpots`). A route with machines grows its tree, then a leg to a valve; one without (the train's top-up, the overflow) runs from the west edge, or to the east edge or a void, to its valve (`routeLoose`).
  - A Sub-Block topping up gets its valve planned at its first connection, before the pipe it tops up is routed, and that pipe reaches the tile beyond as one more of its terminals. With one connection, the valve stands on the connection's tile itself, taking from the machine.
  - Cause found: the extractors' water pipe, routed first, ran past the one offshore pump's connection, which stood against the vacuum pumps' own: 11 extractors fit in 1 of 6 seeds, against 6 of 6 before.
  - Placement links a top-up as a link into its pipe's consumers, and no link for the pipe fed back (place.js). Without that the extractors came last in placement: no room for them.
- **Destroyed** (`voids`, the page's "Destroy" choice by a fluid leaving by train, and "Spare" by a step's fluid fed back): its pipe ends at the fluid's void instead of the east edge (`sink: 'void'`), placed where it fits beside the tree, its connection facing it (`voidStarts`).
- **Leaving by train too** (`exports`, the page's "Also leaves by train" by a step made here):
  - A fluid: its pipe goes to its consumers, and its spare off an overflow valve to the east edge.
  - An item its consumers take all of: once routed (compact.js `exportBelts`), a splitter is cut into a straight belt of it past its producers' last drop, giving the side going on to its consumers priority (`output_priority`). The other side's belt runs to the east edge (`source: 'export'`, a Fan-out branch, `fedBy`). Where none finds room, it does not leave.
- **Checks** (validity.js `fluidEnds`): a valve between its route's pipe (or the machine it stands on) and the pipe it meets; a void at the end of its pipe. Pipes beside them stay above ground (compact.js `buryPipes`). The simulation counts the overflow's spare from the pipe it leaves (sim.js). The map draws valves (ringed red for overflow, green for top-up, an arrow the way the fluid goes) and voids.
- Bands lays out the chain without fluids fed back, as before (maximize.js `chainOf(…, plain)`).

Py coalbed gas in 80 × 40 (Buffer 4), Maximize, one try at a time, 400 s; old and new side by side, seeds 1 to 4:

| Seed | Before | After |
|---|---|---|
| 1 | 7725/min (11, an Annex of 2) | 6000/min (9 and 1) |
| 2 | 7087.5/min (12) | 7200/min (12) |
| 3 | 7087.5/min (12) | 7200/min (12) |
| 4 | 8287.5/min (12 and 2) | 8325/min (12 and 2) |
| Offshore pumps | 2, 130000/min | 1, 1300/min: the rest the extractors' own water |
| Tries at 11 / 12 extractors, 6 seeds | 6 / 5 fit | 5 / 5 fit |

Py molybdenum oxide among roboports (its purest nitrogen's nitrogen and oxygen now fed back), Maximize, 3 tries at once, 40 min, side by side: 599.99/min either way, best at 289 → 270 s, done at 1580 → 1535 s, 3 machines fewer of purest nitrogen and 1 of nitrogen.

Seed 1: with the smaller water step the search draws other candidates, and none places 10 or more. The Annex in seed 4 has its own vacuum pumps, its extractors' water fed back, the train topping it up.

Tests: Py coalbed gas's chain (the offshore pumps make a hundredth; without valves, all of it, as before); a layout of 6 extractors, valid and starving nothing, an overflow and a top-up valve on the extractors' water pipe, one offshore pump, and with its water destroyed, a sinkhole; vanilla electronic circuits whose copper cable also leaves by train, through a splitter giving the circuits priority.

Still:
- A Recipe Loop's fluid (the chain's `cycle`) still comes by train: only byproducts are fed back.
- A belt of two items, or one leaving by train already (a Goal's), gets no export splitter.
- The overflow's spare is the headroom of the Count rounding up: an item or fluid leaving by train too is not made more of for it (a Goal is).
- Base 2.0's valves are hidden; a catalog without valves one can build feeds no fluid back.
