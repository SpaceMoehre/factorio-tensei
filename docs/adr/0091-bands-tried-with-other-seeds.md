---
status: accepted — refines ADR 0073 and ADR 0090
---

# A Count that finds no layout in Bands is tried again with other seeds

The user's request: "Try different ideas to improve the efficiency of the factory layouts."

How it was found: the fast tier with seeds 1–3 (ADR 0090). Py vrauks made 55.84/min (78 machines) with seed 1, 37.93 with seed 2 and 43.66 with seed 3. With seed 2 its first Bands try, at the 78 its parts hold, found no layout, then 77, then halving (54, 42, 36 ... 31): the search climbed one machine a try from 31 to 54 for minutes. Whether a Count routes in Bands comes and goes with the seed (compose's random designs and orders), as it does with the Count.

What changed (maximize.js `inBand`): a Count that finds no layout in Bands is tried again with seeds + 1 and + 2 (`BAND_RESEEDS`) before it counts as missed; the layout of the first that fits is the try's. Five seeds found no more (52.97 at 216–228 s against 131 s).

| | Before | After |
|---|---|---|
| Py vrauks, seed 2 | 37.93/min | 52.97 (74 machines) |
| Py vrauks, seed 3 | 43.66 | 52.97 |
| Py vrauks, seed 1 | 55.84 | 55.84 (the first try fits) |
| Full tier seed 1, fast tier seeds 2 and 3 | | every other setup the same layout |
| Seconds, vrauks seeds 2 and 3 | 95–140 | 130 |

Still: 52.97 against 55.84: with seed 2 or 3, the first Bands try at 78 does not fit with three seeds either; 74 does.
