---
status: accepted — completes ADR 0122
---

# TURD choices' effects

The user's rule: complete the TURD choice effects. Beside the recipes it unlocks and replaces (ADR 0122), a Py TURD choice does two more things (pyalienlife scripts/turd/turd.lua):

- **module-effects**: each building the upgrade affects (`affected_entities`, in tier order) gets a hidden beacon (effectivity 1, one slot) holding the choice's hidden module, `<choice>-module`, else `<choice>-module-mk0<tier>` (farms: their speed scaled by tier and slots in the prototype). 47 choices in the 2.0 dump, 176 buildings.
- **machine-replacement**: the buildings it names are swapped for TURD buildings, placed by the old building's item. 6 choices in the dump, 24 buildings (aerators, baffles and jacket: burner bio-reactors at twice the speed; humus: compost plants heated by sweet syrup; dosing pump: fish farms; sawblades: wood processing units).

What changed:

- **The upgrades' effects** (scripts/py-turds.mjs: each upgrade's `affected`, each choice's `machines` and `modules`; catalog-builder.js `turdsOf`): a choice's `effects` (by building: its hidden module's speed, productivity and consumption, from the dump) and `machines` (old → new, both in the catalog).
- **A building placed by another's item** (catalog-builder.js `placedBy`, `placeable_by`): made by that item's recipes (the TURD compost plant by the compost plant's).
- **The offer** (chain.js `recipeOptions`): with TURD upgrades chosen, a TURD building is offered only where its choice is chosen, the building it replaces no longer; `bonus`, each building's effect from the chosen choices (summed). The selection carries its building's `bonus` (chain.js `selectionOf`), the Sub-Block too (plan.js).
- **The effect** (modules.js `machineEffect(…, bonus)`): added to the base effect and the modules', the effects the building allows, under the same limits; so the rate a machine, the Count, its fuel, Recycled Byproducts and Inserter Clocks (clocks.js) take it. The page's speed line says "with modules and TURD".
- **Heated machines** (catalog-builder.js `heatMax`, `heatCapacities`; plan.js `liquidFuelOf`, `fuelOf`; chain.js `ingredientsFor`): a machine whose fluid energy source takes heat (burns_fluid false) takes its filter's fluid at its maximum temperature, a unit giving heat capacity × (that − the fluid's default temperature) × effectivity: Py's TURD compost plant, 1 MW on sweet syrup at 10° (made at 10°), 10 kJ × 1000 a unit: 6/min a busy plant. The fluid is an ingredient that must come that hot (ADR 0067). Before, an error ("heated by its fluid's temperature, which is not supported").

| Py, a step | None chosen | Chosen |
|---|---|---|
| free-guano in an auog paddock mk01, auog upgrade underground chambers | speed 5, productivity 0, consumption 1 | speed 5, productivity 0.35, consumption 4 |
| biomass from used comb in compost plants, compost upgrade constant | compost-plant-mk01, no bonus | speed +0.3, consumption +0.45 |
| 1200/min biomass from used comb, compost upgrade humus (headless build) | 2 compost-plant-mk01 | 2 compost-plant-mk01-turd, 12/min sweet syrup piped to their heating boxes, valid, starving 0 (before: failure) |

Layouts are the same where no upgrade is chosen: no suite setup chooses one.

Tests: a choice's effect on each affected building, one module or one a tier, the buildings it replaces, a building placed by another's item (catalog-builder.test.js); a chosen choice's effect on the selection, the machine's speed and the Count, only the effects a building allows; a choice replacing a building offering its TURD building instead, the selection giving way; a machine heated by its fluid at its top temperature, 6/min (science-packs.test.js).

Still:
- A TURD building the upgrade affects gets no effect unless it is named among the affected (as in Py's script).
- A heated machine whose energy source sets no top temperature is not supported.
- Machine replacements of buildings that are not crafting machines (Py's glowing mushrooms: generator-1) are left out.
