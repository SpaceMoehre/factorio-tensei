---
status: accepted — refines ADR 0018, ADR 0031 and ADR 0048
---

# Annex tries return: Placement keeps to the try's time and turns crowded spots away at once

Maximizing Py silicon in a 118 × 118 City Block, budget 1000 s a try, some runs sat in one Annex try for more than half an hour, with or without ADR 0048. The user asked why they took so long and did not return.

Sampled while stuck, every such try spent its time in Placement (place.js `placeFrom`, `others`, `scored`, `landing`), not in routing. Four things added up:

- **An Annex's room is full of Fixtures.** Everything built before it stands as Fixtures (ADR 0031): 2,189 here, every belt, pipe, pole and machine.
- **Every spot, every tile of every Fixture.**
  - A City Block of 110 tiles inside its Buffer is scanned tile by tile, about 10,000 spots.
  - For each spot, `landing` walked every Fixture tile under the box.
  - Where a Sub-Block found no room, Backtracking scanned every spot again, several times per Sub-Block (the cheapest spot, then the others, as one-by-one and "anywhere"), for up to 24 backtracks.
  - In an Annex's room most tries find no room, so each candidate took about 5 s, some 8 s.
- **The try's time was checked only between candidates,** never inside Placement.
- **Failing candidates queued more.** Each queued its retries:
  - made room round it, up to six times (ADR 0014);
  - Fixtures kept off its machines (ADR 0017);
  - in two columns (ADR 0048).

  Each retry raised the number of candidates the try would see before giving up.

One Annex try at 1 machine, in the room left by 4.94 furnaces and an Annex of 1, took 274 s for 98 candidates and found none. In the Maximize it ran once more with spare machines (ADR 0048), on a busy host.

What changed:

- **Crowded spots turned away at once** (place.js `makeRules`). The City Block's Fixture tiles are summed over rectangles once (an integral image). A box over more Fixture tiles than it has tiles a Fixture may stand on (its box less the tiles of belts, pipes and the rest that no Fixture may take) is turned away without looking at them. Every other box is checked tile by tile as before.
- **Each spot checked once** (place.js `lands`). Where a Sub-Block may stand at a spot is kept for the rest of Placement, so Backtracking does not check the same spots again.
- **Placement keeps to the try's time** (place.js `until`, search.js). Once the try is out of time, Backtracking stops, and the candidate fails like any other.
- **Retries within reach** (search.js `RETRIES`). No more than 24 candidates queued again by failing ones count beyond a try's patience. Others are still tried first, but within it.

The same Annex try: 47 s, not 274 s, with the same 98 candidates and the same outcome.

Still:
- A Sub-Block's spots in a City Block are every tile; a coarser scan would be faster still and miss tight fits.
- An Annex still costs a whole Maximize (ADR 0031), its tries each designing every Sub-Block again.
