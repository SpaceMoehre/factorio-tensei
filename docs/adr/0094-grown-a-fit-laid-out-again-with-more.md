---
status: accepted — refines ADR 0015, ADR 0048 and ADR 0093
---

# Grown: a try above a fit lays that fit out again first, its machines more apart

The setup: Py wood in a 116 × 116 City Block among 4 roboports, Buffer 4, Maximize (ADR 0093: 1068.14/min, 3.692 wood processors). The user: "Try harder", then "I see a lot of empty space where more log producing units would fit".

How it was found: 3.75 and 4 wood processors found no layout in 3300 candidates (ADR 0093's Still). Each try designs and places every Sub-Block anew: at 3.75 its first candidate's log stack came out 45 × 34 (95 × 35 in the fit), the seedlings 33 × 66 (80 × 11), soil 28 × 50 (38 × 26), and one-by-one placement packed them another way, finding no room. The fit's places given as hints, with this Count's designs, failed too: muddy sludge's 13th machine made its column 8 tiles taller, into the logs. What fit was the fit's own designs at the fit's machines, the machines more broken out (Breakout) and standing in a gap: 3.75 at the 7th candidate (4 s), 4 at the 6th.

What changed:
- search.js: a search yields, beside each layout, `grown`: by item, each Sub-Block's box, its design's shape (`shapeOf`: copies of how many machines in how many rows, else a whole module; its estimate's size), its columns and the machines its design has. Given `near` (another try's `grown`), its first candidate lays that out again (`regrown`): a Sub-Block with machines more takes a `grown<n>` Breakout (designs for the machines it had, the likest first, `alike`; the n more together, apart), one with none more `alike` (its design likest the one it had); each placed first where it stood. Only where some Sub-Block has machines more and none more than a few (`GROWN`, 3, or a tenth): with none more (Faster's tries) it is the fit again; with many more, nothing like it.
- It costs the search's own nothing: not counted among the candidates, its designs from the Breakouts' random source (built from the search's own, the likest designs shifted every draw after them: Py rayon 10 → 9 machines), its retries behind the rest (queued first they took the turns of the search's own: rayon again, perylene 11 → 10).
- Where its belts starve, by a few of a producer's machines (soil's 15 extractors with 2 more apart, 10/min short), the try ends with that producer short, and Maximize's spare machines (ADR 0048) try again, Grown first again: Py wood's 3.9375 and 4 fit so.
- place.js `optionsFor`: a Sub-Block with `near` stands where it stood (its box there, or grown from its other edges), else the nearest spot within `NEAR` (6) tiles; else as without.
- maximize.js: the best's `grown` kept (`grownAt`); every try above it, and the reseeds of the lowest miss (ADR 0090), take it as `near`. A fit that was Grown hands on what it had, so the next try breaks the machines more out again.

| | Before | After |
|---|---|---|
| Py wood 116², page-like, side by side | 1068.14/min (3.692), 787 s | 1157.14/min (4: moss 33 + 3 apart, soil 15 + 2, seedlings 11 + 1, muddy sludge 12 + 1), 626 s |
| Suite wood-116 (20 candidates a try) | 1058.4/min | 1157.14/min |
| Suite titanium plate 236² | 4992.18/min (14) | 5424.49/min (15) |
| The other 15 setups (full tier) | | the same rates (rayon another layout) |

Still: 5 wood processors (1446.42/min): a 7th log tree farm (15 × 15) and 9 moss farms more than 4's; past `GROWN`, and the room left (5129 tiles empty) lies in pieces. A Breakout's machines more join one part of an Internal Path, so its belts come out uneven and starve where the rest's parts are full: spare machines make up for it.
