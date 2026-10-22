---
status: accepted — refines ADR 0005, ADR 0019, ADR 0048 and ADR 0057
---

# Few big machines in copies; pairings of the biggest; spare machines keeping a loop

Py hot air at 6000/min (warmer air from RHEs, `warmer-air-2`) with its bricks, coke oven gas and hot molten salt made, in a 118 × 118 City Block of 32 medium poles, Buffer 4, Maximize, yellow belts, biomass as Fuel. The page found 9000/min, one RHE making hot air and the 38 machines of its chain, in a block nearly four fifths empty (9,698 tiles); 18000/min "no room for warmer-stone-brick", and every number Filling tried between failed too.

Causes, found in tries that should have fit:

- **Seven powerplants in one column** (1.3125 RHEs: "no design without starvation fits the city block"). A biomass powerplant is 15 × 15 and burns 638 biomass a minute, more than half a belt: each needs a belt to itself, so a core stacks them one a row, 122–132 tiles high in a room of 110. Copies of a Module, which stand in columns, came only past 8 machines (`COPIES_FROM`).
- **The designs that fit, never tried together** (1.3125: "no room for warm-stone-brick", 140 candidates in 11 s). Placement alone fitted with the powerplants' copies of one in two columns and the warm bricks' other designs; the search changes one Sub-Block's design at a time, and pairs designs only where every pairing of the best 8 is 80 or fewer (8^5 here).
- **Spare machines breaking a Recipe Loop** (found once the two above fit: 1.46875 "fit", delivering 679/min). The warmer brick RHEs, 15 for 881.25 a minute, drop 8 machines' bricks on one lane (470 of 450): every design starves 20. ADR 0048's retry adds a spare machine, and the chain sizes everything it feeds from for it: the warm bricks then take 940 stone bricks, more than the hot-air RHEs give back (881), so the loop came by train both ways, while the layout counted no loop by train. And Throughput scaled the spare machines' belts, already cut to what is taken, by how much slower they run: down the brick loop, round again, to 5%.

What changed:

- **Copies of few big machines** (design.js `tallCores`, `designOnce`): in a City Block, a Sub-Block of 4 machines or more repeats a Module also where its rows, as long as the busiest belt feeds, would stand taller than 0.8 of the room (`TALL`).
- **Pairings of the biggest** (search.js `sweep`): where every pairing of the best PAIRED designs would be more than PAIRINGS, each Sub-Block's designs of another size only (none starving by its estimate or too big for the City Block), the smallest Sub-Blocks' fewer, down to one, until they are no more.
- **Spare machines keeping a loop** (maximize.js `attempt`): no retry with spare machines where the train would then bring an item it did not.
- **Throughput of spare machines** (sim.js `throughput`, `spareOf`): a Sub-Block's belts of its item, cut to what is taken, bring all of it while it runs no slower than the spare leaves room for.

| Py hot air, 118² among 32 poles, one try at a time, side by side | Before | After |
|---|---|---|
| Rate | 9000/min (1 RHE) | 11812.5/min (1.3125 RHEs) |
| Machines | 1 + 10 + 16 + 5 + 6 = 38 | 2 + 14 + 21 + 6 + 7 = 50 |
| Box, empty | 110 × 110, 8,229 | 110 × 110, 7,552 |
| Maximize | 442 s (best at 84 s) | 541 s (best at 362 s) |

Regressions, side by side: Py small parts in 100² and Py molybdenum oxide among roboports lay out the same, try for try (maxdet: 60 and 20 candidates a try, same hashes; 2775/min and 999.98/min); Py titanium plate standing on its own, 300 s: no layout either way.

Tests: Py hot air in 118²: 7 powerplants in copies that fit its height; Throughput of spare machines (plates for gears, 110 for 100: 0.909, all the gears).

Still:
- 1.46875 RHEs and up: the warmer brick RHEs' odd count puts one more machine on one lane of their belt than the other (8 × 58.75 = 470 of 450): every design starves 20–30. A machine whose output two inserters split onto both lanes would even them.
- 1.625: the warm bricks' copies cut their belts to the warmer bricks unevenly (516 and 459 a minute), and the two hot-air RHEs give back 487.5 stone bricks a minute each, more than a lane, onto one belt (design.js `outputBelt` counts a machine a lane at least): 150 short. A belt each fixed that alone, gaining nothing; left out.
- 2 RHEs: 11 powerplants are 2 columns of 111 tiles or 3 of 91 × 59 beside 60 machines more; nothing fits. A stack of copies in columns takes two belt lanes and a fluid trunk each side of every column (the powerplants: 59 wide for two of 19).
