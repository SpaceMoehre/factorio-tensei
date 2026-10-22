---
status: accepted — refines ADR 0052, ADR 0054 and ADR 0064
---

# One Item a Belt

The user's rule: the output of a Sub-Block must be sorted into different belts. Their blueprint of Py coke (ADR 0064) had the crushers' crushed coal, coal and coal dust on one belt into the screeners, the screeners' coarse coal, coal and coal dust on one into the coal crushers, the quenching towers' coke and coal dust on one to the train.

Sorting a byproduct out after the producers (ADR 0052) did not do it there: under the rule even 3 quenching towers found no layout. A belt into several Sub-Blocks never splits into parallel belts, and the belts of an Internal Path that sorts a byproduct out have no splitter evening them, so whole crushers could not be cut to match the screeners' runs.

What changed:

- **Each product its own belt** (design.js `context`, flows.js, routes.js `buildRoutes`). Where a byproduct would ride on the item's belt into a Sub-Block (one taking it, not tapped off by a filter splitter after the producers; or the train's, past those taking the item), the Sub-Block puts each solid product on a belt of its own (`product`), each to those taking it or on to the train. Its byproducts are no longer tapped off its belt (ADR 0054); each is an Internal Path of its own.
  - A step taking an item off several such belts (Py's BOFs: the crushers' coal and the screeners') takes its share off each (`portion`, design.js `takenOff`, core.js `routeItems`, compose.js `portionOf`). Every machine takes from either, and a belt of more than a belt's worth runs on parallel belts as any Internal Path's does.
  - core.js `buildCore` (`links.apart`): the other products' belts take output inserters, filtered to their product. module.js splits a machine's output among one route's belts only. blueprint.js writes the filters (`use_filters`).
  - Not a machine putting its products down itself (an Output Drop).
- **A byproduct only the train takes, with an item only the train takes**, is sorted out after the producers (compose.js `trainByproduct`, `fanFrom`): a filter splitter sends it onto a belt of its own to the east edge, the rest going on on another. score.js `riding` counts such a belt unsorted, past what a filter splitter sends off it.
- **The page** has a toggle, "One item a belt", on by default. Off (`logistics.mixedOutputs`), the products stay on one belt as before.
- place.js, compose.js: a belt with no slots (the rest sorted out off another's) is routed with its splitter. compose.js `supplyJoins`: a Supplied Item joins the producer's belt of that item, not its first.

| Run (side by side with ADR 0064's code) | ADR 0064 | One Item a Belt |
|---|---|---|
| Py coke 116², Maximize, 2 at once, 1800 s | 3352.5/min (7 + 3), 6 belts riding a byproduct | 2160/min (6 in one chain), none |
| Py molybdenum oxide among roboports, 1500 s | 599.98/min (2 + 1), 9 riding | 387.49/min (2), none |
| Py small parts 100², Maximize | 2775/min | 2775/min, the same |

Single tries of Py coke with the rule: 3 towers fit in 11 s, 4 in 26 s, 5 in 35 s and 6 in 88 s (before ADR 0064, none above 3), sorted out in 16 s. One chain of 6 quenching towers: its 22 crushers in one Sub-Block put crushed coal, coal and coal dust on three belts.

The rule costs rate where room is tight: a belt more at every machine of a Sub-Block making a byproduct its consumers do not take. Neither coke's Annex of one tower nor molybdenum's of one furnace found room beside the first layout.

Tests: Py coke at 1440/min: the crushers' three belts, the BOFs' coal off the crushers' and the screeners', both its share; the towers' coal dust sorted out; nothing riding; filtered inserters in the blueprint. Tests of sorting out after the producers, sharing a lane, Bands of vrauks-2 and Layers of titanium plate run with the toggle off.

Still:
- Py titanium plate's one-machine try (Layers test's setup) takes 687 s to its first layout with the rule, 7 s without: its solid separator's three products on three belts and the grade 3 Use's two, most candidates finding no path for a belt to the east edge or a pipe's connection blocked.
- Py vrauks-2 in Bands: the cocoons' barrels on a belt of their own, the cocoon Parts fit no gaps between the Fixture rows.
- Coke above 6 towers: the crushers' first design, 53 × 43, fits no columns, and the 6-tower chain leaves no room in one piece for an Annex.
