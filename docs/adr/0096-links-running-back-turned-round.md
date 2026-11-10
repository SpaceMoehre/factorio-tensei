---
status: accepted — refines ADR 0045 and ADR 0087
---

# Links running back, turned round

The user's complaint, on Py wood among four roboports (116², Maximize, 1157.14/min, 4 wood processors): the map draws wild connections between belts.

Measured on that layout (`links.mjs`): the wood seedlings' belt to the log farms ran 255 tiles, their boxes one tile apart. The seedlings' stack (80 × 11) stands over the log farms' (45 × 34), both against the City Block's east side.

Why: a Sub-Block's belts enter it from the west and leave it east (compose.js: an unturned module's parts run west to east; a turned one's on the sides it turned to, ADR 0045). The seedlings' belt left their stack's east end, ran back west 42 tiles over it, west again to the City Block's west side, and down under the seedlings and the carbon dioxide to the log farms' west end. Placement weighs a link running back (`behind`), but a stack 80 wide stands west of nothing: every spot left runs back. Straightening the belts at the end (ADR 0087) shortened nothing, even let search 100 times as far: the stretch from where the belt leaves the stack to the log farms finds no shorter way.

Turned half round where it stands, the same stack takes the same box, its belt leaving west from its foot: straight down the City Block's west side to the log farms' west end.

What changed:

- **The last layout's links running back, turned round** (maximize.js `turnedRound`, jobs.js): once Maximize ends, before its belts are straightened (`tidied`), each Sub-Block at either end of a belt link whose producer's east end lies east of its consumer's west end, the one running furthest back first, is laid out again turned half round where it stands (the user's turn, edit.js `turnCopies`: every other copy where it stands, every link routed again). Kept where the block ranks better (score.js: Starvation first, Compactness weighs every turn of a belt, then entities), is valid, starves nothing more and delivers as much of the first Goal. A Sub-Block turned already, or linked to one turned, is left as it is. Only the last layout, as `tidied` (an Annex is found beside a layout as laid out, ADR 0085); not one with Annexes (no Sub-Block of it moves). Within a try's budget.

| Py wood 116² among roboports (suite, K 20) | Before | After |
|---|---|---|
| Rate, machines | 1157.14/min, 4 | the same |
| Seedlings → log farms | 255 belt tiles: east, back west over the stack, round to the west side, under two stacks | down the west side |
| Belt tiles, entities | 1221, 2023 | 1166 (as turned, before straightening), 2012 |
| Compactness | 6942 | 6929 |
| Turning it | | 0.7 s |

The suite (full tier): every rate the same; wood the only layout changed. Of the other City Block layouts, anthraquinone's had links running back (its two turns ranked worse: fewer entities, more turns), the rest none, or Annexes.

Tests: a City Block 18 × 90, too narrow for copper cable beside the circuits: the cable's belt runs back, its stack turned half round where it stood, valid, starving nothing, fewer belt tiles, ranked better; a block with nothing running back as it was (move.test.js).

Still:
- Placement takes every link as leaving east (`behind`, the start and corridors): a producer that would leave west, turned before it is placed, is placed for leaving east. Turns as candidates of the search (half round where a link runs back) would need Placement to know each part's side.
- The moss's belt to the seedlings (277 tiles) runs up the City Block's east side, the length of the block: the moss's stack, 102 wide, stands where nothing else fits.
- A build (no Maximize) is shown as found: no turning round.
