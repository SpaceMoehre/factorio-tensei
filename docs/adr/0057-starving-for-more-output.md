---
status: accepted — refines ADR 0008, ADR 0031 and ADR 0056
---

# Starving for more output

Until now a Maximize fit was a layout that starves nothing (ADR 0008). Where none fits, the page said "Nothing fits the city block without starvation", though a layout short of an item here and there would make most of what it was laid out for. The user's rule: accept starving where that gives more output.

What a layout that starves makes:

- **Throughput** (sim.js `throughput`). A Sub-Block short of an input runs as much slower as it is short. It then takes that much less of its other inputs and makes that much less for those it feeds, and so on down the chain, until no Sub-Block is shorter than it runs (`factor`, 0 to 1 per Sub-Block).
  - **Backed up:** a Sub-Block makes no more of an item than the Sub-Blocks it feeds take, where none of it goes on to the train or joins another's belt or pipe. A byproduct whose Use runs slower stops its producer, and with it the producer's main item.
  - **Tapped byproducts with no splitter:** a byproduct tapped off to its Use whose splitter found no room (ADR 0054) brings nothing; the train brings none of it.
  - **What is delivered of an item** (`delivered`): what its Sub-Blocks make, less what they take back, less what its belts to the train cannot carry. A layout that starves nothing delivers exactly its rate.

What changed in Maximize (maximize.js, search.js):

- **Starving tries** (`attempt` with `starving`). The search is not `perfect`: designs and layouts that starve are routed. It is bounded as a perfect one is (`settled`: patience after the structured candidates, Placement and routing ending with its time), and passes over layouts whose tapped byproducts found no splitter. Of the layouts it finds, the one delivering most of the first Goal is kept. No retry with spare machines.
- **Starving last.** The phase runs once nothing more fits without starving, where it can only add:
  - In a City Block with Annexes: after the last Annex that starves nothing, one more Annex in the room left, its layout one that may starve (`starving: 'only'`: no layout without Starvation looked for). It is kept where the two together deliver more.
  - Where no Annex follows, or nothing fitted without starving: above the highest that fit, first the numbers that failed for Starvation or time (lowest first), then a machine more at a time. A layout is kept where it delivers more than the best so far, and the climb ends after 2 tries in a row that deliver no more (`STARVING_MISSES`).
  - Why not first: in Py molybdenum oxide a starving layout of 3.3 furnaces beat 2 that starve nothing, then left no room for the Annex of 2 that the other way found (462.49 vs 799.98/min).
- **An Annex beside a layout that starves** is kept where the two together deliver what each does alone. Beside layouts that starve nothing it must still starve nothing.
- **The page** (app.js) says what a layout that starves delivers and what it was laid out for: "Highest output: 3000/min (laid out for 3300/min)". The worker passes `delivered` on with each fit; a try that may starve says so while it runs.

| | Before | After |
|---|---|---|
| Py small parts in 80², inserters an eighth as fast (test) | nothing fits | a layout delivering part of its rate, the starvation listed |
| Py titanium plate, 236² (1000 s a try) | 8226.56/min (22 casting units: 11.94 and an Annex of 10) | the last Annex, may starve: 3 more casting units, 9351.56/min, none starving (run alone on the room left, 300 s a try: 908 s) |
| Py molybdenum oxide among roboports (`--total 2400`, side by side) | 599.99/min | 599.99/min, the same layout; the starving Annex found none (+58 s) |
| Py small parts in 100², Maximize (side by side) | 2775/min | 2775/min |

In titanium plate the Annex of 1 more without Starvation had failed after 2017 s; the starving Annex found 1, 2 and 3 more in 300 s each, all starving nothing. A try that may starve routes designs whose estimates starve: often they starve nothing once routed, and a perfect try passes them over unbuilt. In the full run (5400 s) the Annexes without Starvation were still climbing when it stopped: the starving one comes after them.

Tests: throughput, slower by what is short and down the chain, a byproduct backing up its producer; Maximize where nothing fits without Starvation keeping the layout that delivers most, and nothing without starving.

Still:
- Throughput sees each Sub-Block as a whole, running as fast as its scarcest input allows. Within a Sub-Block, machines further along a belt starve first, and the game's belts settle in their own way.
- Starving comes only once nothing more fits without. A bigger first layout that starves a little and an Annex that fits beside it are not weighed against the layouts that do not starve.
- A perfect try passes over designs whose estimate starves, though many route without: the starving Annex found what the perfect one missed. Trying those designs in perfect tries too would find more, at the cost of time.
