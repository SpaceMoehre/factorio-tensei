---
status: accepted — refines ADR 0090
---

# Other seeds only a machine above

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time. This one is a schedule change: Maximize tries less; it is kept because no suite setup lays out otherwise, at three seeds.

How it was found: every try of eleven suite setups logged at 20 candidates a try (`maxdet.mjs`, each try's City Block, seed and outcome). Another seed (ADR 0090) ran in seven of them. Every seed that fit was at most a machine more than the machines that fit alone (whole machines): hot air 0.9375 → 1, anthraquinone 3 → 3.3125, coalbed gas 9 → 9.3125, 9.625 and 10, wood 3.98 → 4; at seed 3, silicon 3.73 (4 machines) → 5. Py rayon fit 6 alone and Annexes to 10; its first try, 11 alone, found no room, and as the lowest miss above the total Another seed tried it five times more: 22 s of a 97 s Maximize, none fitting. A first layout of nearly twice the machines that fit alone is not the seed's miss, it is the room's.

What changed:

- **Another seed tries a miss no more than a machine more than the machines that fit alone** (maximize.js `maximize`: at most `Math.ceil(plan.lo) + 1`). Where Annexes made more than that, it tries nothing. (First a machine above the count that fit, `Math.floor(plan.lo) + 1`: it lost silicon at seed 3, 600 → 567.56, its seed fitting 5 above 3.73.)

| Full tier as pairs (`pairs.mjs`), 20 candidates a try | Before | After |
|---|---|---|
| Rayon 116² | 134.4 s | 116.4 s (the same layout, 499.7/min) |
| The other 16 | 2112.4 s | 2120.3 s, every setup the same layout |
| All 17 | 2246.8 s | 2236.7 s |
| Fast tier at seeds 2 and 3; rayon, coke and kicalk too (`ratecmp.mjs`) | | every rate the same (22 of 22, 6 of 6) |

| Page-like, three tries at once (`run.mjs --parallel 3`, the two sides at once) | Before | After |
|---|---|---|
| Rayon: rate, tries, best at | 631.25/min (13 machines), 24, 349.7 s | the same, 24, 349.2 s |

On the page, its tries given their budgets, rayon's first layout and Annexes reach 13 machines and every miss above lies within a machine: the gate does not bite there; it saves the suite's tries at 20 candidates.

Kicalk among roboports at seed 2 came out another layout of the same 125 machines, the same tries. Not this change: the code before it, run twice at once, made 129 and 130 machines at seed 2 (`maxdet.mjs`, no limit on 20 candidates a try). A fit that brings a loop by train is kept while the search runs as long again as it took, at least a second (maximize.js `once`, `until`): on a host loaded 20–28 that clock decides what an Annex finds.

Tests: Py rayon in its City Block, Annexes and Starving off: after its first fit no try more than a machine above the most that fit (city.test.js; before, five at 11).

Still:
- Kicalk at seed 2 lays out by the clock (above): the suite's layouts are the same on any host only where no fit brings a loop by train.
- Anthraquinone's 3.625 tried five times after 3.3125 fit on the fourth seed, none fitting (21 s).
