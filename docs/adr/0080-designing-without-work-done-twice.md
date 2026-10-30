---
status: accepted — refines ADR 0058 and ADR 0078
---

# Designing without work done twice

The user's rule: the same result in less time; a build after a speed-up delivers at least what it did before. This pass changes no layout.

How it was measured: CPU profiles of designing on the fast tier after ADR 0079, and counts in a scratch copy of how often a variant, a core or a repeated module was built that had been built before.

What was done twice:

- **Plain variants again, inside one design.** In Py silicon, 10,000 of the 16,500 variants a design tried were field for field like one it had made, most of them several row caps coming out the same. Plain variants draw no random numbers.
- **Repeated modules again** (`repeatable`): 26% (nexelit) to 55% (silicon) of its variants' builds were alike one before.
- **Cores again, across designs.** On the page's path, 34% of nexelit's cores and 42% of silicon's were alike one built before in the process: Maximize designs a Sub-Block of the same Count again and again (its tries, the Precheck and the design after it, Bands, Annexes).
- **`buildCore` itself**: string keys for every tile, each held belt row gathered twice, machines looked for among every entity, the period scanned again for every machine, fluid connections placed again for every row.

What changed (each lays out exactly as before):

- **A plain variant asked again taken as made** (design.js `variants`, `plainVariant`; `attempt` keeps its key).
- **A repeated module's core built once**, and a core whose routing failed not routed again (design.js `repeatable`).
- **Cores kept between designs** (design.js `keptCores`): the last 2000, by everything `buildCore` reads (the Sub-Block, its links and their routes, the logistics' env, the variant), by catalog; each taken as a copy, with its signature; a variant that failed fails again. Routing already copies a core's entities before it changes them (module.js). Keeping 600 was slower on silicon (305 against 285 s of CPU).
- **`buildCore` without work done twice** (core.js): tiles by a small integer (`cell`), each belt row's tiles gathered once, machines among the buildings only, what each row stamps from the period found in one pass, inserters and machines given their keys in place, fluid connections placed once for each building and rotation (`placedBoxes`). Replaying 5,825 of silicon's calls: 28% less, every core the same.
- A core's signature and `placeInserters`' band key joined by hand, not by `JSON.stringify`; each core's measures for ranking taken once, the best of each kind in one pass.

The same layouts, faster (side by side, one setup at a time each):

| The fast tier | Before (ADR 0079) | After |
|---|---|---|
| Py nexelit 100² | 130.8 s | 78.7 s |
| Py silicon 116² | 253.9 s | 189.7 s |
| Py trits 118² | 184.4 s | 153.9 s |
| Py hot air 118² | 68.6 s | 57.1 s |
| Py perylene 116² | 174.9 s | 147.4 s |
| all ten | 1289 s | 1095 s, every setup the same layout |

| The full tier's big setups | Before | After |
|---|---|---|
| Py coke 116² | 402.9 s | 380.8 s |
| Py rayon 116² | 270.1 s | 233.2 s |
| Py molybdenum oxide among roboports | 590.9 s | 581.4 s |
| Py kicalk among roboports | 328.9 s | 313.6 s |
| Py titanium plate 236² | 322.5 s | 316.6 s, every one the same layout |
| Py titanium plate standing on its own | no layout | no layout, the same failure (twice more side by side: 111.5 and 127.3 s against 108.7 and 125.9 s) |

Titanium plate's peak memory: 1313 → 1255 MB.

A try's candidates get its budget, never less than twice as long as designing took (search.js `LAYING`, ADR 0059): designing faster, that floor is lower. It decides only in tries of 10 s. On the page, side by side with the code from before ADR 0078 (`run.mjs`, the setups' own budgets, one try at a time):

| | Before ADR 0078 | After |
|---|---|---|
| Py molybdenum oxide among roboports (10 s a try) | 799.99/min, best at 1487 s, done at 1732 s | 799.99/min, the same tries in the same order, best at 579 s, done at 684 s |
| Py small parts in 100² (10 s) | 600/min at 14 s | 600/min at 12 s |

Tried and dropped: telling a core will fail earlier (1,184 of 1,525 failing builds fail at the first cheap check already); exceptions' stack traces (1%).

Tests: the 321 as before.

Still:
- Routing the modules (`designOf` → `routeModule`): some 20% of nexelit's run, pipes within modules 11%.
- The inserter search (`placeInserters`): a quarter of what is left of `buildCore`.
- Bands' first look (`twoRowsFit`), 13% of nexelit's: it designs too, so it gains from this.
