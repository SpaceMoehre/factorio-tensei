---
status: accepted — refines ADR 0032 and ADR 0053
---

# The Precheck and an Annex's own fluid only where they can tell

The user's rule: the same output in less time. Layouts may differ; no setup may make less.

How it was measured: every try of every Maximize in the full tier, in a scratch copy: whether the Precheck failed it, and for each Annex whose room draws a fluid only from a built pipe, why its tries failed and whether the second Maximize making that fluid itself fit.

What told nothing:

- **The Precheck on every try above the highest designable Count** (ADR 0053): the Side Output's Sub-Blocks designed first from structured variants, to end early a try whose designs starve. In the whole full tier it failed one try, an Annex of 1 in Py molybdenum oxide, which the design after it (random draws and all) then fits without starving. It cost 3–6 s a try in Py nexelit, about 12 s in molybdenum oxide.
- **An Annex making a drawn fluid itself after any failure** (ADR 0032): where a room drew a fluid only from a built pipe, a failed Annex ran a whole second Maximize making that fluid, whatever the first failed on (no room, starving designs, no columns). None of those fit anywhere in the suite; each took 6–74 s (Py coke, rayon, molybdenum oxide).

What changed (maximize.js `maximize`):

- **The Precheck only once a try's designs starved** (`prechecked`): a try that starved (not one out of time) turns it on for the tries after it.
- **The Annex makes the fluid itself only where drawing it failed** (`drawFailed`, `annexOf`): Maximize in an Annex's room says whether a try failed on a fluid the room draws only from a built pipe (its failure names that fluid); only then is the Annex tried again making it.

| The full tier, side by side, one setup at a time (against ADR 0083) | Before | After |
|---|---|---|
| Setups making less | | none of 16; every layout the same but molybdenum oxide (the same rate, a byproduct riding 1 → 0) |
| Same layouts, total | 2961 s | 2621 s |
| Py coke 116² | 474 s | 316 s (tries 14 → 11) |
| Py rayon 116² | 284 s | 223 s |
| Py silicon 116² | 233 s | 204 s |
| Py anthraquinone 116² | 179 s | 156 s |
| Py molybdenum oxide | | 12–18% slower in the suite (another path: an Extension try and more Annex probes) |

| On the page (`run.mjs`, one try at a time, both at once) | Before | After |
|---|---|---|
| Py molybdenum oxide | 799.99/min, best at 451 s, done at 563 s | 799.99/min, best at 419 s, done at 470 s |
| Py coke (2700 s cut-off) | 7 machines, 2272.5/min at about 1441 s; a second Maximize making the drawn fluid begun at 2302 s | the same at about the same time, without the second Maximize |

Tried and dropped: the Precheck's designs taken into the try's own design (not the same work: another random stream, structured variants only; 1.4 s on nexelit); a cheap test for Bands' top answering 0 (all of molybdenum oxide's 47 s is the two-row check, which only designing answers); an early "no room" for Annex probes in Bands layouts (one probe each, and a Breakout or room made can still change the Goal's box); designs shared across workers with tries at once (none was built again in another worker).

Tests: Maximize in an Annex's room tells a try that failed drawing its fluid from one that failed for want of room (fluids-between.test.js).

Still:
- Annex probes failing on room: coke, rayon and molybdenum oxide spend 10–60 s a probe on 20 candidates.
- Bands' top answering 0 runs in turn in the suite (molybdenum oxide 47 s).
- Molybdenum oxide's Extension try at the full Count costs 20–60 s and does not fit.
