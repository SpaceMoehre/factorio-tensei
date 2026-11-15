---
status: accepted — refines ADR 0077 and ADR 0071
---

# Copies as wide as fit

The setup (the user's, `/tune-layout`): Py trits, 60/min asked, in a clear 236 × 236 City Block (buffer 4, no Fixtures), Maximize on. The Foretelling said about 28.8/min (112 reefs). On the page it reached 31.87/min: 108 reefs in its first layout and two Annexes of 8; at 20 candidates a try (`maxdet.mjs`) only 91.

Causes, in turn:

- **Rows of reefs as long as the City Block came out a column too wide.** A try at 112 placed nothing ("no room for trits-pup", 254 candidates): the reefs came in copies of 12 a row, a stack 155 × 199, the rcs (22 × 22) in 120 × 127; side by side they need 275 columns, one above the other 326 rows, of 228. Copies come also as wide as the City Block (design.js `copyCandidates` `wide`): rows of 20 reefs, 202 wide, reserving 20 columns beside them. But beside a stack of copies Placement stands a lane each side for every belt snaking through them, a trunk per fluid and room for a Recipe Loop's taps (place.js `stackOf`): 27 here, the stack 229 wide in 228.
- **The flattest designs were placed one by one late.** Rows of 19 fit (stack 219 wide, the rcs' core 169 × 60 above them: 112 placed one by one), but the search's choice of each Sub-Block's flattest design (search.js `sweep`) also reserved 20 columns, and took rows of 20 wherever they divided the reefs better; and in a City Block every candidate in columns (Layers) goes first, then (ADR 0055) those placed one by one, behind the retries the failures queue: at 95 reefs the flattest placed one by one came 28th, past 20 candidates. Wide stacks stand one above the other, never side by side.

What changed:

- **Copies also in rows as long as leave room for all a stack stands beside it** (design.js `copyCandidates` `fit`): a lane each side for each of its belts, a trunk per fluid, its Recipe Loop's taps; each design of copies carries that room (`estimate.sides`).
- **Besides the flattest choice (as before), the flattest whose stacks fit with that room** (search.js `sweep`, `flattestBy`): a candidate of its own, last.
- **Either, where one of its stacks of copies spans most of the room's width (`ACROSS`, 0.8), is placed one by one second once the candidates in columns fit none** (`flat`; search.js `failed`): right after the first placed one by one. (First of them, it lost Py wood among roboports 1157.14 → 958.25/min: its 3.625 processors had fit the first; and spanning half the room, not most of it, it moved coke and silicon at seeds 2 and 3.)

| Py trits 236², the user's setup | Before | After |
|---|---|---|
| 20 candidates a try (`maxdet.mjs`) | 23.31/min, 91 reefs, 138 s | 32.13/min, 125 reefs, 174 s |
| Page-like, three tries at once (the two sides at once) | 31.87/min, 124 reefs (108 + Annexes of 8 and 8), 58 tries, best at 717 s | 32.48/min, 127 (120 + an Annex of 7), 35 tries, best at 571 s |
| One try at 112 reefs | no room for trits-pup (254 candidates) | fits (22 candidates) |

| Suite (full tier) | Seed 1 | Seeds 2 and 3 (`ratecmp.mjs`) |
|---|---|---|
| The 17 setups before | every layout the same | every rate the same |
| Trits 236² (new) | 32.13/min | 25.70 → 32.91, 22.80 → 32.91 |

Tests: Py trits in its clear 236² City Block, a try at 112 reefs fits within 20 candidates, valid and starving nothing (city.test.js; before, none fit).

Still:
- The room left runs in strips under 18 wide beside the reefs and above the rcs: an Annex's own rcs (22 × 22) fit none of them, so Annexes add few reefs.
