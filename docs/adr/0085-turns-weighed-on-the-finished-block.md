---
status: reverted — it cost Py small parts 2 a machine on the page
---

# Turns weighed on the finished block as Compactness weighs them

Reverted. On the page (`run.mjs`, one try at a time, twice side by side), Py small parts 2 made 1799.98/min (7 and an Annex of 3) before and 1619.98 (7 and an Annex of 2) with it: the first layout's straightened belts stand on other tiles, and its Annex found room for one machine fewer. The suite, which lays out with K candidates a try, showed every rate the same. What follows is what was tried and measured.

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

- **Module belts routed with a turn weighing a tile** (module.js, router.js `routeBelt` `turn`): the molten salt module's jogs gone the same way, and side by side in the suite coke 1800 → 2160/min, anthraquinone 9000 → 9937.5, rayon 487.5 → 496.87, small parts 2 1619.98 → 1799.98, on the page perylene 2793.75 → 3093.75; but titanium plate 4992.18 → 867.18/min in the suite (14 → 3 casting units: its try at 5 found no layout) and on the page, 2 at once for an hour, 24 → 19.
- **The producer standing east of its consumer turned half round** (small parts 2's belts, 7 machines east of the small parts, its link 200 tiles for a gap of 1; edit.js `turnCopies` on the first layout): Compactness 7213 → 7720, links 1142 → 1482 tiles; its rubber then came round from the west edge instead.

Tests: a belt stepping down twice where once does turns twice (straighten.test.js).

Still: a belt that turns on a tile an inserter takes from keeps that turn (its anchors stay as they are): the jog round two inserters in a module (`^ii>` under `>>>v`) is decided when the module is routed.
