---
status: accepted — refines ADR 0087 (seeds) and ADR 0060
---

# The lowest miss above everything found, tried again with other seeds

The user's request: "Try different ideas to improve the efficiency of the factory layouts."

How it was found: the fast tier laid out with seeds 1–3 (`--seed`, ratecmp). At 20 candidates a try the same code made Py hot air 8437.5 (1 machine), 4921.87 and 18000/min (2 machines) by seed, anthraquinone 9000 or 9937.5, coalbed gas 6000 or 6600, small parts 2 1619.98 or 1799.98: a miss at a Count is often the seed's, not the room's.

What changed (maximize.js `maximize`):

- **Another seed:** after the Annexes (and before the last Annex that may starve), the lowest Count above the total found (first layout and Annexes) that found no layout (not starving) is tried again with seeds + 1 and + 2 (`RESEEDS`, at once where tries are, a fit ends the others). A fit more than the total is the best; the Annexes are laid out again beside it; the next miss above it is tried the same. Not in an Annex's room (`reseed: false`).
- **Above the total only:** a first alone with as many machines as the total would only change what the Annexes get (Py coke seed 1: 4 machines sorted out and 3 more in a starving Annex, against 6 with a byproduct riding alone): its first form, tried right after the climb, lost coke 2520 → 1912.5 and coalbed gas seed 2 6600 → 6000. It also keeps no fit with a byproduct riding alone (the sorting phase kept fewer machines without).

| | Before | After |
|---|---|---|
| Full tier, seed 1 | hot air 8437.5/min (1 machine) | 18000 (2); the 15 others the same layouts |
| Fast tier, seeds 2 and 3 | | no loss; anthraquinone 9000 → 9937.5 (both), perylene 2700 → 3093.75, silicon 555 → 600 |
| Seconds (suite, 3 at once) | | hot air 29 → 70; the others within noise |

Cost: at most two more tries at the end of each Maximize (on the page 2 × the try's budget, at once with workers).

Tests: Maximize tries the lowest miss above the best again with other seeds, not where reseed is off (city.test.js).

Still: the reseed gives each miss two seeds only; a Count that fits with a third seed in ten stays missed.
