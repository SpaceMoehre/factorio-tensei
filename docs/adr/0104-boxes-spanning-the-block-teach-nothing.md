---
status: accepted — refines ADR 0024
---

# Boxes spanning the block teach nothing

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time. This one is a schedule change: Maximize may try other Counts; it is kept because no suite setup lays out otherwise, at three seeds, and it takes fewer tries.

What was done again: in kicalk among roboports, Maximize climbed from 67 kicalk machines to 89 one machine a try, each a fit (22 tries, about half of a Maximize at 20 candidates a try); on the page, three tries at once, it climbed to 125 three at a time. The Foretelling (maximize.js `planner`) learns how loosely a City Block packs from each layout found: its box over its modules. Among Fixtures, every layout's box spans the City Block round them (ADR 0024 named it: "the Foretelling learns from a box spanning the block"), so after each fit it foretold that nothing more fits, and only the next whole number was tried.

What changed:

- **Among Fixtures, a layout whose box spans nine tenths of the room or more teaches the Foretelling nothing** (maximize.js `planner` `record`, `SPANNING`): its looseness stays what it was (the first guess, a layout before that spanned less, or what tries that found no room taught: `tightest`, as before). In a City Block clear of Fixtures such a box still means it is full.

| Full tier as pairs (`pairs.mjs`), 20 candidates a try | Before | After |
|---|---|---|
| Kicalk among roboports: tries, seconds | 41, 301.8 s | 22, 160.4 s (67 → 87 in one try, then as before; the same 129 machines) |
| Silicon 116²; molybdenum oxide among roboports | 15, 128.7 s; 10, 488.1 s | 16, 147.4 s; 11, 513.4 s (one try more each, above what fits) |
| Perylene 116² | 12, 93.9 s | 11, 90.5 s |
| All 17 | 2391.3 s | 2276.7 s, every setup the same layout, every rate the same |
| Fast tier at seeds 2 and 3 (`ratecmp.mjs`) | | every rate the same (22 of 22) |

| Page-like, three tries at once (`run.mjs --parallel 3`, the two sides at once) | Before | After |
|---|---|---|
| Kicalk: tries, best at | 73, 851 s | 59, 829 s (400/min, 125 machines, both) |
| Silicon | 20, 243.0 s | 20, 242.8 s (799.45/min, both) |

On the page the climb already ran three at a time, so the saving there is the tries, not much of the time.

Tests: among Fixtures, a fit whose box spans all but a twentieth of the room leaves the Foretelling as it was, the next try the one it foretold; in the same City Block clear of them it foretells no more than fit; a try that then finds no room still teaches it (city.test.js).

Still:
- On the page kicalk still climbs from 87 to 125 three at a time, each fit's box spanning less than nine tenths of the room but its looseness still too loose to foretell more.
