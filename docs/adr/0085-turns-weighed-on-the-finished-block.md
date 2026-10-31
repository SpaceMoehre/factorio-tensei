---
status: accepted — refines ADR 0051
---

# Turns weighed on the finished block as Compactness weighs them

The user's rule: find what is unnecessary in the layouts and take it out; "belts wiggle around … where underground belts would do".

How it was found: every fast-tier layout's belts counted (turns, a turn of one hand and then the other within three tiles: a jog) and looked at tile by tile.

Cause: once the block is routed, each belt's stretches between anchors are routed again and kept where they cost less (ADR 0051), as the router counts cost: a tile each, a turn a fifth of a tile more, a tunnel its length and 3. Compactness counts a turn as 4 tiles (score.js `BEND`). So a belt stepping down two rows in two steps where one step does (two turns more, the same tiles) cost 0.4 more, under the half a tile a new way must save, and stayed.

What changed:

- **Straightening weighs a turn as a tile** (compact.js `straightenBelts`, `TIDY_TURN`): the stretches are routed again with turns at a tile each (router.js `routeLink` `turn`, `beltMoves`) and kept where they cost less so counted (`legCost`'s `turn`). Routing the links, and the modules, is as before.
- Only the finished block changes: whether a try fits is decided before (Maximize's tries end at their first layout without Starvation), so every suite setup makes what it made.

| The full tier, side by side | Before | After |
|---|---|---|
| Setups making less | | none of 16 (every rate the same; coalbed gas the same layout) |
| Py anthraquinone 116²: turns, jogs | 81, 29 | 71, 20 |
| Py small parts 2: turns, jogs, belts | 311, 62, 2801 | 295, 53, 2743 |
| Py nexelit 100²: turns, jogs, belts | 158, 37, 1101 | 154, 34, 1069 |
| Py hot air 118²: turns, jogs | 49, 20 | 45, 16 |
| Py silicon 116²: turns, jogs | 104, 35 | 102, 32 |

Tried and dropped (the user's wiggle, in the modules themselves):

- **Modules routed with no row above or below the core first** (design.js `margins`, roomy at the sides only): Py hot air's molten salt module 20 turns and 10 jogs → none (its belt `Uiu^ii>` under a row `>>>v` became `UiuUiiu`), but four fast-tier setups lost a Count (coalbed gas 10 → 9, perylene 11 → 9, vrauks 78 → 75, small parts 2 9 → 8), silicon gained (5 → 7). Kept only where the module came out smaller: perylene still lost (11 → 10) and almost nothing else changed.

Tests: a belt stepping down twice where once does turns twice (straighten.test.js).

Still: a belt that turns on a tile an inserter takes from keeps that turn (its anchors stay as they are): the jog round two inserters in a module (`^ii>` under `>>>v`) is decided when the module is routed.
