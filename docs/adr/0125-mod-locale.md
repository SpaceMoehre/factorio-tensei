---
status: accepted — refines the catalog's names (catalog-builder.js localeNames)
---

# The game's names from the mods' locale

The user's report: names are still wrong at times; Py's "Rare Earth Oxides" shows as "Reo", its prototype name.

Cause: the catalog had no names at all. build-catalog reads them from the game's locale dump (`factorio --dump-prototype-locale`, prototype-locale.json beside the data dump), and none was ever made here (no Factorio install), so every name was the prototype name made words.

What changed:

- **scripts/mod-locale.mjs**: makes prototype-locale.json from the mods' own English locale files (`locale/en/*.cfg`), loaded in the mods' load order (dependencies first, then by name; a key a later mod gives again is the later one's), and the dump's `localised_name`s. `node scripts/mod-locale.mjs script-output/data-raw-dump.json <mod folders>…`, then `npm run build-catalog`.
- **js/mod-locale.js** `localeKeys`, `modLocale`: each prototype's name as the game makes it: its `localised_name` (`""` joins, `"?"` the first that resolves, `__1__` its parameters), else its section's key (`item-name`, `fluid-name`, `entity-name`, `recipe-name`, `technology-name`), else an item's what it places (entity, tile, equipment), a recipe's its main or one product's, a technology `x-2`'s `x` and its level; `__ITEM__x__` and the like resolved; one needing a key none gives left out (the page makes it of its prototype name).
- **catalog-builder.js** `buildCatalog`, `localeNames`: `technologyNames`, kept only for the TURD upgrades and choices (Py's choices are not in the dump; a choice may share its name with an item: cags the technology is "C.A.G.S.", the item "Climate adaptive glass shell").
- **app.js** `techLabel`: the Research dialog names upgrades and choices by them, and searches them.

Py (Factorio 2.0 dump, nine Py mods' locale, 7,370 keys): 3,299 names, 6,843 recipe names, 242 TURD names; 2,872 of the 3,519 items and fluids recipes make are named; of the 647 left, 630 are base's (some with Py's icons) and 17 other mods' (AAI loaders, inserter cranes, safefill), whose sources were not read. The catalog 3.81 → 4.26 MB. Layouts are the same: names are not read by the search.

**The game's own locale dump, after** (the user ran `factorio --dump-prototype-locale`: a `<type>-locale.json` each, `{ names, descriptions }`, beside the data dump): build-catalog.mjs reads those first and prototype-locale.json (the mods' made) only for what they lack, Py's TURD choices (not technologies in the game). The mods' names had matched the game's on 2,605 of 2,607 items (two wagons renamed since) and differed on 222 recipe names (the source being Py's current master, the game's 2.0 versions); the game's win. Item groups' names (item-group-locale.json) are the chooser's tabs' (`groups[].title`: "Py Alien Life", not "Py alienlife"), kept apart from the items' names. Every one of the 3,519 items and fluids recipes make is now named (base's too: stone-wall "Wall", small-lamp "Lamp"): 4,448 names; the catalog 4.37 MB.

Tests: locale files to names (a later mod's key winning, a localised name joined and with parameters, an item named by what it places, a recipe by its main product, a technology's level; mod-locale.test.js); technologies' names kept for TURD upgrades and choices only (catalog-builder.test.js).

Still:
- TURD choices' names come from Py's current master (pyalienlife 3.1.9), not the game's 2.0 versions (3.0.67).
- The game's dump is in script-output/ (git-ignored); a catalog rebuilt without it falls back to the mods' names, and without either to prototype names.
