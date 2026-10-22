---
status: accepted — refines ADR 0041, ADR 0049 and ADR 0066
---

# One chain of seven: the biggest placed first, a Supplied Item on its own belt, room to sort

Py coke in a 116² City Block among 32 Fixtures, with One Item a Belt (ADR 0066): Maximize stopped at one chain of 6 quenching towers (2160/min). The user's wish since ADR 0064: one compact chain rather than many small ones.

Causes found in the tries above 6:

- **The biggest Sub-Block placed last** (place.js `placeBlocks`). Placement goes from the Goals westward, consumers first, so the crushers, which feed everything, came last, and their 26 machines (53 × 43, or copies as tall as the block) found no room: the only space that holds them is the middle, 55 × 55 between the four Fixture clusters, taken by then. Backtracking moves only the last few placed.
- **A Supplied Item more than a lane went by train, and the chain blew up** (chain.js). What the coal Use's BOFs make of red-hot coke joins the red-hot coke step's belt, side-loading onto a lane, so only up to a lane (450/min). Past 7 towers it made more, went by train, and the step made all the towers take, its coal, its crushers' byproduct coal, the Use again: 505 machines for 8 towers (75 for 7), 628 for 10.
- **No room to sort coke and coal dust apart** (place.js). The towers stand against the east edge, so their belts reach the edge before a filter splitter has room: the sorting try kept them on one belt, and Maximize took 6 towers that sort out over 7 that do not (ADR 0052).

What changed:

- **Placed first** (search.js `placeFirst`, place.js `ahead`): a Sub-Block that finds no room is tried next placed first, the rest after it as before.
- **A Supplied Item more than a lane on a belt of its own** (chain.js `feeds`, plan.js, flows.js, routes.js): it goes into those taking the item on a belt of its own, each taking its share off both belts (`portion`, ADR 0066), as the BOFs take coal off the crushers' and screeners'. One the step would then make none of goes by train, as before.
- **Room to sort** (place.js `SORT_ROOM`): a Sub-Block whose belt to the train sorts a byproduct out after it keeps 4 columns east of it for the splitter and the two belts on.

| Py coke 116², Maximize, 3 tries at once, 1800 s | Before (ADR 0066) | After |
|---|---|---|
| Rate | 2160/min | 2520/min |
| Quenching towers | 6 (one chain) | 7 (one chain) |
| Machines in the chain at 8 towers | 505 | 83 |
| Belts riding a byproduct | 0 | 0 |

Single tries: 7 towers fit in 61 s (none before), sorted out in 178 s.

With the first two changes but no room to sort, a run found 7 towers at 145 s, but its sorting try kept their coke and coal dust on one belt; it ended at 6 towers and an Annex of 1, a belt riding coal dust: 2520/min as well, in two chains.

Side by side with ADR 0067's code (1500 s): Py small parts in 100², Maximize, 2775/min (5) → 3000/min (4 and an Annex of 1); Py molybdenum oxide among roboports 387.48/min either way.

Tests: the coke chain at 2880/min under 100 machines, the BOFs' red-hot coke on a belt of its own into the towers.

Still:
- 8 towers: no room for the coal step; 9: the crushers' copies, two belts each, do not snake through their stack into the screeners' runs.
