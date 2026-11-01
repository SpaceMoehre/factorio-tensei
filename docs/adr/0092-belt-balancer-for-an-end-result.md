---
status: accepted
---

# A belt balancer for an end result

The user's request: "Add an option to include a belt balancer for an end result. All resulting belts must carry only that item and then go into a belt balancer. Out comes the minimum amount of belts. For example 8 yellow belts carrying 4000 items per sec result in a 8-5 belt balancer."

The rule: a Goal may ask for a balancer (the Goal's "balancer" box). Every belt of its item leaving across the east edge, each carrying only that item (One Item a Belt on), goes into a balancer; as many belts come out as its rate fills, rounded up (`beltsFor`: 4000/min on yellow belts of 900/min, 5).

What changed:
- `js/balancer.js`, the network (`designBalancer`): a splitter network on P = the next power of two of lanes, the pairs of Batcher's bitonic merge (`stagesOf`), the n in belts on the first n inputs, the m out belts on the m outputs (of all the ways to choose them) that balance best under a fluid model of the belts with backpressure (`flowOf`, `evenness`: all in belts full, every other at half, alternately three quarters and a quarter); the other outputs have no belt, so their splitter side is blocked. A power of two balances evenly (2-2, 4-4, 8-8: 1.00); 8-5 at 0.90 of an even share, 4-3 at 0.75 at a load of 0.75: a network with no loop back splits in halves, so 3 belts cannot be exactly even.
- `layBalancer`, the layout east of the block: lanes are rows; stage by stage the splitters stand in slots of two rows (`arrangement`: the order and the side of each chosen for the cheapest channel before it), and a channel (`channelOf`) takes each lane from its row to the next splitter's: along its row to a track, along the track, on east. A lane crossing another's track goes under it (an underground belt, a run no longer than its reach, else tracks are spread with two free columns every few, or two or three columns apart); two lanes swapping rows (a cycle that cannot be drawn) take a spare row beside the band. Belts of other items leaving through the input channel run straight on under its tracks; a pipe row there rules a place out. Tracks whose rows do not overlap share a column. Candidate places for the band are tried nearest the in belts first, each checked tile by tile against the block and the Fixtures.
- `traceBalancer` and `flowOfTrace` follow the built belts as items move (underground to its exit, splitters, side-loading found) and run the same fluid model: the tests lay out 2-2, 4-4, 4-3, 3-2 and 8-5 and check no belt is fed from two tiles and every out belt carries its share.
- `balanceBlock` builds it into a layout: the routes with only that item (more than one item on a belt, or the Output Side up or down: nothing built, and why), the n belts, m from their total, the balancer's belts a route of their own (`balancer: true`, no sink), the in routes marked `balanced` (their display panels moved to the out belts: blueprint.js `markers`, each out belt with its share). The layout itself is untouched; a note says what was built or why not.
- `siteOf(city, buffer, east)` and app.js `balancerEast`: a Goal that asks keeps the width of its balancer (laid out for as many belts in as out, `balancerWidth`) free on the inner area's east side, so Maximize and the build leave room. More in belts than out may need the Buffer too.
- app.js: the Goal's box, `withBalancers` (the layout shown and written to the blueprint with the balancers, the layout moves and reshapes work on without), the notes in the status.

| | |
|---|---|
| Py small parts at 1800/min (3 belts in, 2 out), the page, 100 × 100 city block | built, 23 × 4 tiles, 100% even at that load; 7 splitters in the blueprint |
| Py small parts 4 belts of 600/min in the 2400/min layout | 4-3, 23 × 4 tiles, traced: no belt side-loaded |
| Width, 4-3 / 8-5 (yellow belts) | 23 / 55 columns |

Still: the width (a hand-made 8-5 is far narrower; the channels' tracks and spare rows cost columns); the reserve counts as many belts in as out, so a block with more belts in needs the Buffer; only the east edge; a fluid or a mixed belt is not balanced. The load the evenness is checked at is the rate over the belts in.
