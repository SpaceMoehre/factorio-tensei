---
status: accepted — refines ADR 0052 and ADR 0117
---

# Belts to the train of one item merged

The user's rule: some builds send several belts to the train though together they carry less than the 900 a minute a yellow belt does; the items should merge onto one belt in a balanced way, without infringing on the layout. Asked which: belts of one item only, every belt still carrying one item.

Each run of producers sent its item to the Output Side on a belt of its own. Only byproducts sorted out by a filter splitter were merged (ADR 0052), and only where the merged way came out shorter. The user's Py reo, cobalt extract and tinned cable among 32 poles (116², input and output left and up): 12 belts to the train, two of stone (90 and 240 a minute) and two of iron oxide (72 sorted off the reo, and 216).

What changed:

- **Every belt to the train of one item, on the layout shown** (compact.js `mergeOutputs`, was `mergeByproducts`; `spacedInputs`). A belt's stretch past the last piece anything puts on it, takes from it or joins it at (a splitter, an inserter's or machine's drop, another belt side-loading) is routed again to beside another's of the same item, heading the same way, and the two go through a splitter there, on only on that one's side (ADR 0052's merge). Kept however long its new way (`slack`), the longest ways freed first. Not while the block is laid out: the search ranks, and Maximize builds Annexes on, layouts as routed (ADR 0117); there byproducts alone merge, as before. Spacing's pass takes the poles up, spaces the belts from the train, merges, straightens and places the poles again.
- **Balanced: each lane as it is** (compact.js `lanesOf`). A splitter merging two belts into one keeps each lane's items on that lane, so a merge is made only where neither lane then carries more than half a belt. A belt's lanes come from where its output inserters and machines drop (module.js `laneOf`, each inserter's `flow`), else as much as it carries on either lane; a byproduct's, where its drops do not say, half on each as before. Two belts of 400 a minute, each on both lanes, merge; two on one lane each, the same lane, do not.
- **A belt carrying on past a filter splitter is not the byproduct's** (compact.js `mergeOutputs` `filtered`). The belt carrying the item on from a byproduct's filter splitter (fedFrom) started at that splitter, and was taken for the byproduct's own belt: it could merge the item onto the byproduct's belt (on the user's layout, reo 180 a minute onto the iron oxide's).
- **The panels at the train's edge** (blueprint.js `markers`, `leaving`). A belt merged into another has no panel of its own; the other's shows what both carry.

| The user's: Py reo, cobalt extract, tinned cable among 32 poles, 116², input and output left and up | Before | After |
|---|---|---|
| Belts to the train | 12 | 10 |
| Stone | 90 + 240 on two belts | 330 on one |
| Iron oxide | 72 + 216 on two belts | 288 on one |
| Tinned cable | 900 + 450 | the same (1350: more than a belt) |
| Belts to the train, tiles | 702 | 663 (with the belts from the train spaced) |
| Rate, machines, valid, starving | 180/min, 3, yes, 0 | the same |

| Suite (K 20, seed 1) | |
|---|---|
| Full tier, 23 setups | every rate the same; titanium plate standing on its own (titanium-free) fails either way: "no inserter moves route 47 into machine" before, "route 52 does not start at the west edge" (starving 160) after — the filter splitter fix moves its search |

Tests: belts to the train of one item merge where each lane has room, on the layout shown alone, and not where both put all on the same lane (straighten.test.js); 364 pass. Suite times ran with the full tests beside them (no time compared).

Still:
- Belts of different items each go to the train on their own (the user's sand 144, gravel 96, rich dust 72, uranium ore 4 a minute).
- A merge needs two free tiles beside a straight stretch of the other belt; tinned cable's 900 + 450 stays two belts (more than one carries).
- A City Block build without Maximize, and a layout the user edits, are shown as routed (as Input Spacing).
