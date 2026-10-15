---
status: accepted — refines ADR 0008 and ADR 0028
---

# Machines with pipes on both sides keep a column between them

The user maximized Py anthraquinone in a 116 × 116 City Block among 32 Fixtures (Buffer 4). The chain runs on Py's agitators: vpulp1, vpulp2, vpulp3 and vanadium-pulp-3-void. Each agitator has a fluid connection on every side: inputs east and south, outputs west and north. Maximize stopped at 3937.5/min, 2 reformers, with 9700 of the block's 12,048 tiles empty. The same try run on its own, without the Precheck, fitted at 6000/min and at 9000/min.

Causes:

- **The Precheck ended a try at a design failure.** Above the highest designable count, Maximize's tries first design the Sub-Blocks making the Side Output from structured variants only (the Precheck, search.js). For vanadium-pulp-3-void none of them routed: designStep threw "vpulp3: connection at 6,3 is blocked". The throw ended the whole try as if it starved. Random draws, which the Precheck leaves out, did route one.
- **Structured variants put neighbours' side pipes against each other.** A row's machines stand a pitch apart: a pad column each side for side connections, plus the gap. Structured variants take no gap. So one agitator's east pipe (blue liquor) and the next one's west pipe (vpulp1) stood side by side and joined. Every structured core and every Copy of more than one machine in a row failed ("cannot connect", "connection blocked"). Only random draws with a gap routed. At 18 agitators of vpulp1, no random draw routed narrower than the block's 110 tiles: "vpulp1: no design without starvation fits the city block".

What changed:

- **The Precheck skips what it cannot design** (search.js). A Sub-Block that no structured variant routes is left to its own designing, random draws and all; the Precheck goes on to the next.
- **A column between side pipes of two fluids** (core.js `buildCore`). Where a row's machines have connections on their east side and on their west side, and those connections carry other fluids, the pitch keeps a gap of one column. Machines joined through their boxes (Liquid Fuel, ADR 0028), and rows with Side or Head-on Belts in their gap, are unchanged.

| Py anthraquinone, 116 × 116, Maximize | Before | After |
|---|---|---|
| Rate | 3937.5/min (2 reformers, 1.3125) | 10875/min (4 reformers, 3.625) |
| Machines | 34 | 85 |
| Factory | 110 × 98 | 110 × 103 |
| Empty tiles | 9700 | 6945 |
| Seconds (best at / all) | 21 / 79 | 348 / 832 |

The time went on tries that now get as far as placement. Before, each try above 2 reformers failed within 3 s.

Py small parts in 100² (side by side): 600/min both ways, the same layout. Py molybdenum oxide among roboports (`--total 2400`, side by side): 124.99/min both ways in 850 s. Its purest-nitrogen-gas Sub-Block took a design that routes only now (68 × 11 rather than 63 × 13, fewer tiles), and the block came out 4 rows taller (228 × 75, Compactness 15,042 → 16,003).

Tests: 272 pass.

Still:
- Above 3.625 reformers the tries fail for room ("no room for ammonia", "no room for vanadium-oxide"), though the right and bottom of the block stay empty. The vpulp3 row of 10 agitators is 83 wide, and the designs ranked first for vpulp1 are rows wider than the block.
- A design is ranked by its own area, not by how it packs with the others: a smaller Sub-Block can leave the block taller.
