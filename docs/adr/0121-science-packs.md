---
status: accepted — refines the Recipe Selection (CONTEXT.md) and the catalog
---

# Science Packs

The user's rule: in Factorio recipes are unlocked by research, each technology taking science packs. The user sets the packs they have, and the page offers only recipes they can unlock with them.

What changed:

- **The catalog's Science Packs** (catalog-builder.js `packsOf`, `research`, `placedBy`): `sciencePacks`, the tools technologies take, in the game's order (Py: automation, py 1, logistic, military, py 2, chemical, py 3, production, py 4, utility, space). A recipe off at start carries `unlock`: the sets of packs (indices into `sciencePacks`) researching it, one per technology unlocking it, each with its prerequisites' packs, sets holding another dropped. A technology researched by a trigger (crafting, mining: Py's steam power) takes no packs of its own; one off (`enabled: false`, hidden), or needing one off, unlocks nothing. A building whose placing items only recipes off at start make names them (`madeBy`), and is offered while one of them is; one an item made from the start places, or none a recipe makes, always is.
- **A recipe no research unlocks** (`unlock` empty: 797 in Py, its TURD upgrades, unlocked by its script, kicalk-dry and py-science-pack-2-turd among them, and base recipes it replaced, the pumpjack) is not offered with packs chosen: the data does not say which upgrade unlocks it (Py's cheapest upgrade technology takes automation packs alone, so gating every one by it would offer py-science-pack-2-turd with automation packs alone). Every pack ticked chooses none, and offers them. The user may choose their TURD upgrades instead (ADR 0122).
- **The offer** (chain.js `recipeOptions(catalog, sciencePacks)`): only recipes and buildings on at start or researched with the packs given; a recipe left with no building is not offered. Kept per catalog and packs.
- **A Chain Choice** (setup.js `normalized`, `setupFrom`; chain.js `expand`; maximize.js `planner`, `plannerOf`): `sciencePacks` in the saved state, none for every one (every pack saved, or none the catalog knows, is none). The chain, the Foretelling and every try (in workers too) take the same offer; a Recipe Selection the packs do not unlock gives way to the first they do, and an item made here that nothing unlocked makes comes by train ("the science packs and TURD upgrades chosen unlock nothing making it"); a Goal nothing unlocked makes is an error saying so.
- **The page** (index.html, app.js): the Research dialog (ADR 0124), each pack's icon, all ticked by default. Ticking them all saves none (packs a catalog adds later count too); none ticked, only what is on at start. A change redraws the Goals' chooser and the chain.

| Py (Factorio 2.0 dump), packs in the game's order, each with those before | Recipes offered | Items made |
|---|---|---|
| Automation | 1258 | 1159 |
| + py 1 | 2006 | 1363 |
| + logistic | 2495 | 1583 |
| + py 2 (and military) | 2984 | 1871 |
| + chemical | 3762 | 2259 |
| + py 3 | 4284 | 2545 |
| + production | 5385 | 3122 |
| + py 4 | 5664 | 3245 |
| + utility, space (every pack ticked: none chosen) | 6843 | 3518 |

The catalog grows 3.59 → 3.80 MB (with ADR 0122's upgrades). Layouts are the same: no suite setup chooses packs.

Tests: the catalog's packs in order and each recipe's sets (prerequisites' packs, two ways to one recipe, a trigger technology, one off; catalog-builder.test.js); the offer with packs (a recipe and a building unlocked by none of them left out, either of two ways enough, one no research unlocks left out), a selection giving way, an item nothing unlocked makes by train, the packs a Chain Choice (science-packs.test.js).

Still:
- Logistics (belts, pipes, poles, inserters), fuels and modules are offered whatever the packs.
- A technology on a prerequisite cycle unlocks nothing (the game refuses such data).
