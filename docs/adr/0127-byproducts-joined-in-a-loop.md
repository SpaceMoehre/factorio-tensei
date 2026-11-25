---
status: accepted — refines Supplied Items and General Uses' sources (flows.js joins) and ADR 0126
---

# Byproducts joined in a loop

The setup: Py pu-238 among 32 poles, 116², its byproducts processed (ADR 0126): the separation and four shuffles, each isotope made by up to three Sub-Blocks (the separation, two shuffles) and taken by up to two, the shuffles in a ring (shuffle 1's pu-240 into shuffle 2, its pu-242 into shuffle 3, whose pu-239 and pu-241 go back into shuffle 1).

The user's rule (ADR 0126): the byproducts processed into pu-238 as much as they can, and built.

Causes, found in a try at 1 separation that should have fit:
- What a Sub-Block makes of an item another makes joins that one's belt before its takers (a Supplied Item, a General Use's sources). In a ring a join cannot come before its takers: the belt joined runs into a Sub-Block that feeds the joining one, or closes a loop. The loop's last link is laid as feedback, and what joins it is dropped (flows.js `joined`: into an Internal Path only); the others joined after their takers. The try starved: pu-242 3.54 of 6.4 a minute reaching shuffles 3 and 4, shuffle 2's alone.
- Tapped off each maker instead (below), shuffle 1's belt still found no taps: every product it makes was tapped off, nothing rode on, so its belt had no consumer and no end, was never laid, and its three taps came by train.

What changed:
- **flows.js** `buildFlows`: an item joined into a Sub-Block (`joins`) whose takers close a loop, lead to the joining Sub-Block, or lead back to the one joined into is a pool: each maker's (the one joined into, and every joining one) tapped off its own belt into each taker (`split` edges, tapped: feedback belts with their share, ADR 0064), the takers filled from the makers in turn, most first (as few belts as makers and takers less one); its joins dropped (`joinsOf`). None of those belts is a step of the Dependency Order. Loops by items only: one closed by a fluid (Py coke's quench steam back to the ovens, their redhot-coke joined) closes as before, the join riding on; pooled, coke lost 2520 → 2385/min.
- **routes.js** `buildRoutes`: a Sub-Block's belt every product of which is tapped off, none riding on, runs on to the train (`tappedOff`): a belt to tap them off.

| Py pu-238, 116² among 32 poles (page-like, one try at a time) | pu-238 | Machines | Valid | Starving | Time |
|---|---|---|---|---|---|
| Processed, before | — (every layout starving; a try at 1 separation: pu-242 3.54 of 6.4) | | | | |
| Processed, after | 4.79/min | 1 separation (+ 16 shuffles each) | yes | 0 | 122 s |
| Not processed (no Uses of the isotopes) | 13.05/min | 4 separations | yes | 0 | 425 s |

Processing makes 72× less plutonium oxide per pu-238 (and fewer centrifuges per pu-238 for its plutonium peroxide), but the shuffles take 203–552 s a craft: in this block it makes less pu-238 than the separation alone, whose isotopes leave by train. The button does what the user asked; whether it pays is the block's.

On open ground at 3.59/min: before, a layout without starvation but 2–3 isotopes by train; after, 0 by train, 144 × 106, valid.

Suite: fast tier every layout the same; full tier 18 of 25 run every rate the same (coke 2520/min), the rest's flows and routes as before at 1–3× their rates. The setup joins it (fast tier, 20 candidates a try: 3.59/min, 1 separation, 71 s).

Tests: byproduct-loops.test.js: in the processed chain no isotope joins or rides an Internal Path, each taker's taps bring what it takes, at most makers + takers − 1 belts an isotope, every Sub-Block's belt goes somewhere; laid out at 3.59/min, 12 candidates: nothing starving, none by train, valid.

Still:
- Maximize stops at 2 separations (3 starve) with the block 60% empty of machines: the shuffles' 16-machine rows and their taps are the next lead.
- A pool's makers all tap; a maker whose belt has no room for a filter splitter brings its share by train (`loopsByTrain`), as a Recipe Loop's feedback does.
