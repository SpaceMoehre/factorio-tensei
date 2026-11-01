---
status: accepted
---

# A belt balancer for an end result, a Sub-Block of the factory

The user's request: "Add an option to include a belt balancer for an end result. All resulting belts must carry only that item and then go into a belt balancer. Out comes the minimum amount of belts. For example 8 yellow belts carrying 4000 items per sec result in a 8-5 belt balancer." Then: "Do not incorporate the balancer in the buffer. Treat it as a subblock in the factory", and "Your solution wastes a lot of space. Make it a real subblock. Maximizing space efficiently is the highest priority."

The rule: a Goal's "balancer" box. The Goal's item then goes by Internal Path (as few belts as its machines' lanes carry, each with only that item) into a balancer, a Sub-Block the search places and links like any other; as many belts come out as the rate fills, rounded up (4000/min on yellow belts: 5). (The first form, built after the layout east of the block in room kept off the inner area, wasted most of its space and was dropped: a belt to the train for every machine, 55 columns of tracks, Annexes of its own.)

What changed:
- `chain`/plan: `balancer.js withBalancers` adds an entry for each asked item taking it from the step making it (a Byproduct Use's way: `use`, `goal.from`, no producer of its own) and leaving by train what it gives back. The plan sees a building of one tile (`BALANCER`) and a recipe moving a belt's worth a second (`ensureBalancer` puts them into the catalog): its count is its out belts. session.js and maximize.js `chainOf` call it; `setup.js setupFrom` gives the asked items as `logistics.balance`.
- design.js `designOnce` takes a balancer Sub-Block to `balancerCandidates`: one candidate, its network for as many in belts as the Internal Path has (`pathBelts`: as many as its producers' machines put on a belt, both lanes, no machines of its own to feed; `pathWants`: it wants all its belts bring; compose.js `wantOf` likewise).
- `layout/balancecore.js balancerCore`: the Module, no machines: the network of balancer.js (`designBalancer`, `arrangement`, `layBalancer`) with its in belts on the rows its first splitters take them on and its belts, undergrounds and splitters as the core's entities, each in belt a Head-on part ending against its west side, each out belt a Head-on part starting at its east side (the Links' to lay), drops for the Path Flow of the belts to the train.
- balancer.js: the network (Batcher's bitonic merge pairs on the next power of two of the out belts; belts merged down by splitters with one output left without a belt where a pair fits one, so 12 belts of 360/min become 8 lanes, an 8-5 network); the lanes laid in rows with channels of tracks, undergrounds under crossing tracks, a spare row for two lanes swapping; `traceBalancer`/`flowOfTrace` follow the built belts as items move (tests lay out 2-2 to 8-5 and 12-5, no belt side-loaded, every out belt its share).
- maximize.js: no Annexes where a balancer takes the Goal's belts (an Annex is another chain, its belts its own).
- validity.js: a balancer Sub-Block has no machines to count.

| | Before (built after, east of the block) | After (a Sub-Block) |
|---|---|---|
| Py small parts at 3000/min goal, 100 × 100 city block, 20 candidates a try | | 2362/min (4 machines, balancer 3 in, 2 out) inside the block, 94 × 94 |
| Py titanium plate, 12 belts of 360/min | 75 × 12 tiles east of a 142-wide block | 6 in belts (two machines a belt) |

Still: an Annex (another chain) does not feed the balancer, so none run with it; one balancer a block; the network's width (19 columns for 3-3, more for others); the in belts' loads are taken as equal; only the east edge.
