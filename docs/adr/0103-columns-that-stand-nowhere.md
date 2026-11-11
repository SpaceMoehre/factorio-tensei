---
status: accepted — refines ADR 0068, ADR 0097 and ADR 0098
---

# Columns that stand nowhere

The user's rule (the speed-up skill, "take at least 25 hours"): the same result in less time; prove each cut lays out the same before measuring the seconds it saves. This pass changes no layout.

How it was measured: counts in a scratch copy of how Layers stands its columns (place.js `inLayers` `stand`, `column`), then a check mode that ran the old scans beside the new answers, then the full tier as pairs (`pairs.mjs`, ADR 0102).

What was done again: Layers stands each way's columns from the east, a column moving west a step at a time (`stand`, as far as the room left lets it) until its Sub-Blocks stand clear of the Fixtures; for each step, each Sub-Block scans the column's rows outward from where it wants to stand for one it lands on, and where none is, scans again parting its stack round the Fixtures. In kicalk among roboports a Maximize tried 382,046 columns and stood 936; nearly every one was a column of one Sub-Block landing on no row at that step (173 million rows asked), then parting on none (43 million). But whether a stack lands on any row of a column, and whether it parts on any, depends only on the stack, its budget, its size, the column and the City Block: the next candidate with the same stack asks the same columns again, and the scans find nothing again.

What changed (each lays out exactly as before):

- **Columns where a stack lands nowhere, or parts nowhere, kept** (place.js `nowhereOf`, `nowhereKept`, `NO_ROW`, `NO_PARTING`): flagged once a scan of every row found none (a row its stack landed on but another Sub-Block's stood in the way does not count; nor does a Parting scan that never ran), by the City Block and the stack as Parting reads it (each copy's module, number, column and offset), its budget, padding and size, the last 256 stacks; a flagged column is not scanned again.
- **A Sub-Block alone in its column stands on the nearest row it lands on** (place.js `column`): the rows it lands on in that column found once and kept with the flags, the nearest to where it wants to stand found by halving, the upper of two as near: the row the scan finds.

Checked in a scratch copy, the old scans run beside the new answers in kicalk, vrauks, coalbed gas, small parts 2 and titanium plate: 787,476 Sub-Blocks' rows the same, and of 341,136 columns flagged as parting nowhere, none parting anywhere.

The same layouts, faster:

| As pairs (`pairs.mjs`) | Before | After |
|---|---|---|
| The full tier | 2496.3 s | 2448.6 s, every setup the same layout (titanium plate standing on its own: the same failure, no layout); the setups whose Layers stand among Fixtures faster, the rest as they were (±3%) |
| Kicalk among roboports | 387.2 s | 345.7 s |
| Vrauks 100 | 49.2 s | 43.0 s |
| Coalbed gas 80 × 40 | 26.3 s | 24.5 s |
| Small parts 2 116² | 76.0 s | 72.2 s |

| Share of kicalk's run | Before | After |
|---|---|---|
| Layers (standing its columns) | 22% | 12% |

Tests: in a City Block, the same designs prepared again stand where they stood, one by one and in columns (city.test.js), the second time from what the first kept.

Still:
- Parting where a stack does part: each row's parting of the stack, kept for one placement only.
- Columns of several Sub-Blocks: scanned row by row, the others standing in the way.
