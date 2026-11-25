---
status: accepted — refines Recipe Selection (chain.js selectionOf)
---

# Buildings by default

The user's rule: a step whose building is not set runs in the highest building available; a building chosen for one recipe is the default of every other recipe it runs.

Before: a step's building, where none was chosen, was the slowest of those running its recipe (`buildingsFor`, slowest first): mk01 in Py whatever was researched, and every other step in the slowest too after the user chose a faster one for one of them.

What changed:
- **chain.js** `expand` `selectionOf`: the building chosen for the step, where it runs the recipe; else one of the buildings the user chose for any recipe (Recipe Selections and Byproduct Uses: `chosen`, each with how many it was chosen for) that runs this one too, the one chosen for most, then the fastest; else the fastest the Science Packs research (`buildingsFor`'s last). A chosen building not researched is passed over, as before; one a chosen TURD choice replaces runs as its TURD building (`recipeOptions` `replacedBy`; before, the TURD building came first only by being the slowest).
- **The suite's setups and the tests' fixtures** keep the buildings they were laid out with: each step's and Use's building, as the code before chose it, written into its selections and uses (an explicit choice; only those two keys rewritten; every chain the same under the old code and the new, checked step by step), so their recorded layouts still compare. Tests building their chains inline pin them so too (tests/support/slowest.js).

Py examples:
- Small parts with gears, cable and bolts made, no building chosen, every pack: all four in the automated factory mk04 (crafting speed 4, the fastest of its category); the automated factory mk01 chosen for the small parts: all four in it.
- Antimony oxide with the user's packs (to py science 2): mk01 is the highest researched of the bof, flotation cell, ball mill and screeners, so its chain is as before; the high pressure furnace chosen at mk04 is not researched, so the lime runs in the fastest that is (the hpf).

Tests: chain.test.js: the fastest researched, else the one chosen for another recipe.

Still:
- "Fastest" is the crafting speed within the recipe's category: where a category holds two families (Py's crafting: assembling machines and automated factories), the faster family wins unless one is chosen.
