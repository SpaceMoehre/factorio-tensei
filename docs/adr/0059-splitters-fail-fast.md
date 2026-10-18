---
status: accepted — refines ADR 0030 and ADR 0058
---

# A splitter with no room fails the layout at once

ADR 0058 left Py titanium plate's tries at 12 and 13 casting units (236 × 236, 1000 s a try) running their whole budget: every candidate failed. Of those that routed, most starved 20.26/min of grade 2 titanium, the same amount whatever the designs.

Cause: the grade 1 screeners' Internal Path into the jaw crushers runs on two belts, grade 1 and grade 2 sharing a lane on each (450.8/min on lanes the producers fill to 390). The plan joins the two belts through a splitter (pairUp, ADR 0030), so each brings its share. In these layouts the splitter finds no room; each belt goes on alone (routeSplit's "each goes straight on"), the second short of grade 2. The prepared layout counts on the splitter and starves nothing, so every candidate was placed, routed in full, and only then passed over: 20 to 30 s each.

What changed:

- **No room for the splitter, no layout** (compose.js `routeSplit`, search.js). Looking for a layout without Starvation (`strict`, Maximize's tries but those giving way), where the two belts would starve unbalanced the layout fails there. The Compound Block routes again with that pair first (as for any link that finds no way), else the error names the Sub-Blocks the belts run between and the search makes room round them, as for a link. Without splitters (the last fallback) they starve all the same: not tried. The user's moves lay a layout out again unbalanced where the splitter finds no room, as before.
- **Candidates keep their time** (search.js `LAYING`, refines ADR 0030 and ADR 0058). A try's candidates get its budget and never less than twice as long as designing took. Designing took about as long as laying out until each core was built once (ADR 0058): with tries of 10 s, Py molybdenum oxide's candidates were cut short and its Maximize found 1 furnace and an Annex of 1, not 3.

| Side by side | Before (ADR 0058) | After |
|---|---|---|
| Py titanium plate at 12 casting units, 25 candidates (no time limit) | 51.0 s, no layout | 44.7 s, no layout |
| Py titanium plate, Maximize (1000 s a try, an hour) | 4476.56/min at 2438 s | the same fits at the same times: the tries at 12 and 13 still fail after 1000 s |
| Py small parts at 4 factories, molybdenum oxide at 3 furnaces (25 candidates, no time limit) | | the same layouts |
| Py small parts in 100², Maximize with no time limit (`maxdet.mjs`, 20 candidates a try) | 2775/min | 3000/min |

Against the code before ADR 0058, side by side, both changes with it:

| | Before ADR 0058 | After |
|---|---|---|
| Py molybdenum oxide among roboports (10 s a try, 40 min) | 462.49/min at 548 s; every phase done at 1481 s | 599.99/min at 287 s; done at 1162 s |
| Py small parts in 100² (10 s a try) | 2587.5/min (4 and an Annex of 1), 125 s | 2775/min (5), 151 s: its tries get more time |

The router keeps each reach's list of tunnel lengths rather than making it at every step (router.js `HOPS`).

Tests: no new one (a splitter with no room needs a crowded layout built for it); the suite passes as before, and searches with no time limit lay out as before where every splitter finds room.

Still:
- At 12 and 13 casting units Py titanium plate's screeners' splitter finds no room in any candidate tried; made room round, the Sub-Blocks then find none in the City Block. Its way (routeSplit: the cheapest few spots between where the belts leave and reach their machines) or the design putting the two belts apart would be the next step.
- Twice as long as designing is a measure of how big the chain is, not of what its candidates need.
