---
status: accepted — refines ADR 0077
---

# Two-row Parts designed once a Part

The user's rule (the speed-up skill, "take at least 25 hours", continued): the same result in less time. This one is a schedule change: Bands may judge a Slot by another Count's designs; it is kept because no suite setup lays out otherwise, at three seeds.

How it was found: Bands' check whether a Sub-Block's machines stand two rows to a Part in a Slot (bands.js `twoRowsFit`) was half of vrauks' run (14 of 28 s) and a third of trits' (15.5 of 45 s). It designs that Part (as a Sub-Block of so many machines, the rest of the chain whole) and routes its designs until one fits, kept by what decides them: among them the Sub-Block's Count. But the Part is as many machines as two rows hold, whatever the Count above that: its keys counted (in a scratch copy), vrauks' 36 were 12 Parts, trits' 25 were 17. In most of them every Count's designs came out the same sizes (vrauks' cocoon Parts of eight: one 93 × 48 design at Counts 9 to 36); not in all (its Parts of four at Count 23 found another first design than at 24 to 36: the rest of the chain enters the Part's design).

What changed:

- **The two-row check keyed by the Part's machines, not the Sub-Block's Count** (bands.js `twoRowsFit`): the first Count asked designs the Part, the others take its designs.

| Full tier as pairs (`pairs.mjs`, host loaded 13–25) | Before | After |
|---|---|---|
| Vrauks 100 | 51.5 s | 31.5 s (−39%) |
| Trits 118² | 105.6 s | 92.9 s (−12%) |
| All 17 | 2583.0 s | 2556.4 s, every setup the same layout |

| Seeds 2 and 3 (`ratecmp.mjs`) | |
|---|---|
| Fast tier; molybdenum oxide and kicalk | every rate the same (22 of 22, 4 of 4); every layout the same but kicalk's at seed 2, which lays out by the clock (ADR 0106) |
| Trits, side by side | 200.3 → 166.3 s, 265.0 → 215.8 s |

Tests: the Bands tests as they were (city.test.js).

Still:
- Each Part's designs are routed until one fits the Slot asked (`designOf`): the first Slot asked of a Part routes most of them.
