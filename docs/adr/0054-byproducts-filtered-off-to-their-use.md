---
status: accepted — refines ADR 0034, ADR 0035 and ADR 0042
---

# Byproducts filtered off to the step taking them

The user maximized Py perylene and organic acid anhydride (60/min each) in a 116 × 116 City Block among 32 Fixtures (Buffer 4). Their p2s5 comes from sulfur (`p2s5-2`), which makes 2 pyrite with every p2s5, and a General Use (`* > pyrite`) makes p2s5 of the pyrite. The page's best was 3300/min (70 machines, Annexes included). In the blueprint the furnaces' p2s5 and pyrite share one belt, and that belt clogs. The user's rule: the two are separated, in the building chain or after it by a filter splitter.

Causes:

- **A byproduct rode on past the step taking it.** A producer's solids leave on one belt, every product on the same lane (routes.js). That belt ran through every Sub-Block taking any of them: the Use taking the pyrite, then the anhydride mixers and the perylene plants taking the p2s5, ending at the last of them. Only the exact rates kept pyrite off the end of the belt. Whenever the Use stopped (its p2s5 joins the same belt, so a full belt stops it), pyrite went on to the end of the belt, where nothing takes it, and the lane filled with it until no p2s5 got through.
- **The ranking did not see it.** `rankOf` counts a belt as a byproduct riding only where none of its consumers takes the item. The Use on the belt took the pyrite, so the layout counted as sorted.

What changed:

- **Tapped off right after the producers** (flows.js `buildFlows`). A Sub-Block's link takes a byproduct off its producer's belt (not the producer's own item, and no fluid) while taking nothing else off that belt, and the belt goes on to other Sub-Blocks with what they take. That link becomes a feed like a Recipe Loop's feedback (`tapped`): a belt of its own into the Use, fed from a filter splitter after the producers (compose.js `tapLoop`, `routeTaps`). The rest of the belt goes on without it.
  - A spare backs up to the splitter and, at worst, stops the producers until the Use takes it. It never stops the belt into the others.
  - Where another step's byproduct joins that belt on its way to the Use (a General Use's Supplied Item, Py titanium's rejects from the dust), the belt rides on as before.
- **Counted as sorted out** (score.js `rankOf`): a byproduct tapped off its belt is not riding.
- **No room for the splitter is no fit** (search.js). A tapped feed whose splitter finds no room would come by train, and its producers' belt would carry the byproduct to where it ends. In a Maximize try (`perfect`) such a layout is passed over like one that starves, with room round the producer and the Use next.

| Py perylene + anhydride, 116 × 116, Maximize (`--total 1800`, side by side) | Before | After |
|---|---|---|
| Rate | 2700/min (9 machines) | 3300/min (9 + Annex of 2) |
| Pyrite on the p2s5 belt to its end | every furnace belt (1) | none (2 filter splitters) |
| Starving | 0 | 0 |
| Empty tiles | 7047 | 5458 |
| Seconds (best at / all) | 114 / 553 | 1315 / 1804 |

The page's own 3300/min came with the pyrite riding. In the first run after the change, one Annex's splitter found no room, and its pyrite came by train while the furnaces' rode on. That run led to the last bullet above.

Py small parts in 100² (side by side): the same layout. Py titanium standing on its own (side by side, 1000 s): neither finds a layout, as before. Its grade 3 screeners' rejects are now tapped off to the recrusher.

Tests: the jaw crushers' stone goes to its Use through a filter splitter, the ore on to the furnaces; the p2s5 furnaces' pyrite goes to its General Use the same way.

Still:
- A byproduct another step's belt joins on its way to the Use still rides on through the Use to where the belt ends.
- A byproduct is separated after its producers, never by the inserters at the machines (one belt per product).
