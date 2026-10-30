---
status: accepted — refines ADR 0080
---

# Modules routed once

The user's rule: the same result in less time; a build after a speed-up delivers at least what it did before. This pass changes no layout.

How it was measured: CPU profiles of designing after ADR 0080, and counts in a scratch copy of how often a core was routed as a module, a plain variant made, or a Path Flow worked out, alike one before.

What was done again:

- **Modules routed again.** 35% of nexelit's routings of a core into a module, 30% of perylene's, were alike one routed before in the process: mostly copies of a core (ADR 0080 hands out copies), not the same object. Routing draws no random numbers.
- **Plain variants made again.** Of silicon's 92,700 asks for a plain stack, 30,500 were new.
- **Path Flows worked out again** (`corePathShort`): nexelit asked 11,753 times, 463 of them different.

What changed (each lays out exactly as before):

- **Routed modules kept** (module.js `routeModule`): the last 50, by the core's fields but its Path Flow and the options, failures too; each caller gets an object of its own over the same entities, parts and pieces (routing copies a core's entities before it changes them, ADR 0080).
- **Plain variants made once** (design.js `stackVariant`, `keyOf`): the last 60 shapes, by all it reads of the shape and the options; their keys kept with them.
- **Path Flows once** (design.js `corePathShort`): the last 2000, by the drops and what is wanted.
- `keptCores` numbers each context rather than writing it into every key; `makeStack` keys faces and band rows by small integers and sorts its options by measures taken once; `placeInserters` gathers its rows by hand, `searchInserters` a row's longest run once.

The same layouts, faster (side by side, one setup at a time each):

| | Before (ADR 0081) | After |
|---|---|---|
| The fast tier, all ten | 773 s | 741 s, every setup the same layout |
| Py nexelit 100² (fast tier) | 68.1 s | 56.0 s |
| Py silicon 116² (fast tier) | 135.5 s | 119.8 s |
| Py coalbed gas 80 × 40 | 15.2 s | 10.1 s |
| Py silicon 116², again beside the big setups | 273.2 s | 242.2 s |
| Py coke, rayon, molybdenum oxide, kicalk, titanium plate | 1915 s | 1869 s, every one the same layout |
| Py titanium plate standing on its own | no layout | no layout, the same failure (twice side by side: 124.6 and 134.5 s against 124.1 and 136.2 s) |

Memory: titanium plate's peak 1186 → 1290 MB (the first sizes of the caches cost 517 MB more; cut to these). Each try at once on the page holds its own.

Tried and dropped: routed modules kept by the core object (63 of 152 repeats: most are copies); designs kept by the random stream's state (12 of silicon's 116 repeat); a flood before a pipe's search from the west edge (11 s spent for 1.7 s saved); keeping 6000 cores, not 2000 (4 s on silicon, for memory).

Tests: a core routed again, a copy with the same options, comes back as the same module in an object of its own (module.test.js).

Still:
- `buildCore`, 30–33% of silicon's and nexelit's runs: nearly all of it different work, each try's Count changing the cores.
- Routing modules, 20% of perylene's: half of it routings that fail.
- Plain stacks (`makeStack`), 7% of silicon's; `placeInserters`, 5%.
