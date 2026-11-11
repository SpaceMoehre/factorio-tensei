---
status: accepted — refines ADR 0058
---

# Cores built leaner

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time; prove each cut lays out the same before measuring the seconds it saves. This pass changes no layout.

How it was measured: after ADR 0099, building a core (core.js `buildCore`) is the largest single function of the suite's profiles, 9% of each run on average (13% with what is inlined into its caller), 40% of nexelit's. Its lines spread the time thinly, and two ways of timing a change to it disagreed: built turn about with the old version in one process, the two versions shared the collector's work and timed alike; run apart, load moved them by a third. So 400 cores taken from a nexelit run (200 of 44–50 machines, 200 of 12 or fewer) were built five times over in separate processes, old and new in turn, with a timer at each section of `buildCore`, and every core's output compared.

Where a core's time went (2,000 builds, the 400 cores five times):

| Section | ms |
|---|---|
| Stamping each machine and its inserters onto the core | 350 |
| A fluid connection's way out (`free`, `machineAt`) | 131 |
| Inserters placed in each band | 128 |
| Belt rows: the tiles each holds and those its inserters reach | 119 |
| Ports: each machine's connections | 115 |
| The variant's setup (rows, connections, drops) | 111 |
| Ports checked clear of machines | 74 |
| Pole slots | 30 |
| The rest | 187 |

What was done again, for every machine or tile, that was the same each time:

- **A machine found by looking at every machine.** Whether a tile lies on a machine (each connection's tile, each tile out from it toward a way for its pipe) looked at every machine of the core: for a core of 45, thousands of looks.
- **A slot's lists made for each of its inserters.** Each inserter got its own list of the items it moves (and filters), its own mark for the belt tile it reaches, and its belt's key joined again; each machine's output inserters were found by copying and filtering the entities made so far.
- **A port found by searching the ports, and its pipe row by searching the rows, at every machine.**
- **A belt row's tiles looked up twice**, once for the tiles it holds, once for those its inserters reach; the pole slots by listing every tile of the core.

What changed (each lays out exactly as before: the 400 cores' outputs the same, field for field):

- **A machine found by its row and period** (core.js `buildCore` `machineAt`): machines stand in rows, each at the same offset in its period; a fluid connection's way out asked tile by tile in a loop.
- **A slot's names, mark and key made once** (core.js `buildCore` slots: `names`, `filterNames`, `mark`, `supplyKey`): every inserter of the slot reads the same lists, as nothing changes them (clocks.js, blueprint.js, app.js read them only); a machine's output inserters counted where they stand.
- **Each fluid's port by its route** (a Map, made in the order the ports were), **whether a row's connection lies on its pipe row decided once a row**.
- **A belt row's tiles in one look each**; **the pole slots read where they lie**, in the order stamped.

The same layouts, faster:

| | Before | After |
|---|---|---|
| The 400 cores built five times, in turn, two pairs (the old version with its section timers) | 1567, 1381 ms | 1132, 1060 ms |
| of it the 200 cores of 44–50 machines | 1192, 1019 ms | 810, 754 ms |
| The full tier, side by side, three at once each | 3380 s | 3343 s, every setup the same layout (titanium plate standing on its own: the same failure, no layout) |
| Nexelit 100 (building cores 40% of it) | 116.0 s | 98.9 s |
| Silicon 116² | 211.6 s | 199.7 s |

(In the suite the changed side's last setups, wood and small parts 2, ran beside the other side's longest again: 89 → 105 s and 89 → 96 s; run as pairs before, they came out alike.)

Tried and dropped: a machine found by its row on its own, timed turn about with the old version in one process: 12.0 vs 11.8 s (ADR 0097), as both versions shared the collector; timed apart with a timer on each section, the same change cut the way out from 131 to about 70 ms.

Tests: the tests that build cores as they were (module.test.js, drop.test.js, fluids-between.test.js, liquid-fuel.test.js, lanes.test.js, two-way.test.js); the 400 cores' outputs compared field for field.

Still:
- Stamping (still the largest section): each inserter and machine is an object of its own, as the core's entities must be.
- Inserters placed in each band: the key each band is kept by, joined tile by tile.
