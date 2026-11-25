---
status: accepted — refines ADR 0121
---

# TURD upgrades chosen

The user's rule: let the user also choose their TURD upgrades, optionally. Py's TURD upgrades (Alien Life's technology upgrades): researching an upgrade technology (kicalk upgrade) the player chooses one of its sub-technologies (wire netting, extra water, crop rotation), which unlocks recipes and replaces others (kicalk-1 → kicalk-1-dry). Py's script does it: the game's data dump names the upgrade technologies (`is_turd`) and their choices (as effects of type "nothing"), not their recipes, so with packs chosen ADR 0121 offered none of the 797 recipes no research unlocks.

What changed:

- **The upgrades from the Py source** (scripts/py-turds.mjs, new): each `prototypes/upgrades/*.lua` of pyalienlife run in a Lua VM (fengari) with `data` unset, so only its returned table is built: each upgrade technology's choices, with the recipes each unlocks and replaces (old → new). Written to `data/py-turds.json` (pyalienlife 3.1.9: 61 upgrades, 182 choices).
- **The catalog's `turds`** (catalog-builder.js `turdsOf`; scripts/build-catalog.mjs reads data/py-turds.json): each upgrade technology the dump has, with the packs researching it (prerequisites' too), and its choices' recipes the catalog has. Against the Factorio 2.0 dump: all 60 upgrades and their 182 choices, all 632 recipes they name; 623 of the 797 recipes no research unlocks are a choice's (the rest: base recipes Py replaced, the pumpjack, and others no upgrade names).
- **The offer** (chain.js `recipeOptions(catalog, sciencePacks, turds)`): with TURD upgrades chosen (`turds`, { [upgrade]: choice }), a recipe a choice unlocks or brings in is offered only where its choice is chosen and its upgrade researched with the packs; a recipe the choice replaces no longer is (its Recipe Selection gives way). A TURD recipe research unlocks too stays (Py's heatsink). Buildings follow the recipes making them (`madeBy`: the kicalk plantation's -with-mesh recipes). None chosen, as ADR 0121.
- **A Chain Choice** (setup.js `normalized`, `setupFrom`; chain.js `expand`; maximize.js `planner`, `plannerOf`): `turds` in the saved state, kept to the upgrades and choices the catalog knows.
- **The page** (index.html, app.js `renderTurds`, `offer`): Logistics' "TURD upgrades", off by default ("choose mine"); on, every upgrade the packs ticked research, each with its choices or Not chosen. A choice of an upgrade the packs no longer research is kept and counts for nothing.

| Py, every pack ticked, recipes offered | |
|---|---|
| TURD upgrades not chosen (off) | 6843 |
| On, none chosen | 6220 |
| On, every upgrade's first choice | 6252 |
| On, kicalk upgrade wire netting: kicalk's recipes | kicalk-1-dry … kicalk-5-dry for kicalk-1 … kicalk-5 |

Layouts are the same: no suite setup chooses upgrades.

Tests: the catalog's upgrades (the dump's alone, their packs, their choices' recipes the catalog has; catalog-builder.test.js); the offer (none chosen: every TURD recipe as the packs offer it; on: a choice's recipes and buildings only where chosen, the one it replaces gone, another choice bringing none, an upgrade the packs do not research counting for nothing), the choices a Chain Choice, a Goal nothing chosen makes told so (science-packs.test.js).

Still:
- A choice's module effects (Py's TURD modules: a farm's speed, productivity) and machine replacements are not applied.
- data/py-turds.json is pyalienlife master's; regenerate with the Py version installed (a dump's upgrades and recipes it lacks are left out).
