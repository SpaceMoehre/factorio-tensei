---
status: accepted — refines ADR 0063
---

# Burnt Results as byproducts

The user's rule: "when a building consumes fuel, some fuels produce ash as a result. This needs to be treated as a byproduct."

A Fuel item may name a Burnt Result: Py's coal, coke, coal dust, crushed coal and others leave ash. A burner machine burning one puts the Burnt Result into its own slot, one for each item burnt. When the slot is full, the machine stops. The chain counted the fuel as an ingredient (ADR 0063) but left out what it leaves. So a layout of Py coke had its BOFs' ash taken out by nothing: in the game they would stop when their ash slots filled.

What changed:

- **The catalog records each fuel's Burnt Result** (catalog-builder.js, data/catalog.json `fuels[name].burntResult`). Only `fuels` changed in the rebuilt catalog.
- **The Production Chain counts it** (chain.js `productsFor`): a step burning a Fuel item with a Burnt Result makes it besides its products, one for each item burnt. No productivity adds to it. It is a byproduct like any other: by train, to a Byproduct Use, or a Recycled Byproduct where a step takes it.
- **The Sub-Block makes it** (plan.js `planSubBlocks`): an output at the fuel's rate, among the Sub-Block's byproducts. Its machines' output inserters take it out as they take any product (an inserter takes from the burnt result slot too).

| Py coke, 116² among 32 poles | Before | After |
|---|---|---|
| BOFs' ash | none counted (in the game, BOFs stop once full) | 1.3 + 7.7/min at 60/min of coke, by train |
| The page's Maximize, one try at a time | 2520/min, 6 + an Annex of 1 (ash left in the BOFs) | 2632.5/min, 7 + an Annex of 1 |
| The suite, 20 candidates a try | 2160/min, 6 towers | 1800/min, 5 towers (6 fits alone, at 113 candidates) |

Regressions: the suite's full tier. Coke is the one setup whose machines burn a fuel that leaves ash, and the only one that changed: the others laid out the same, 2226 s at 4 at once. Coke's new result is recorded.

Tests: a stone furnace on coal leaving ash makes 2.7 ash a minute at 37.5 iron plates (plan); Py coke's chain counts as much ash from its BOFs as their Sub-Blocks make (chain).

Still:
- A fuel with a Burnt Result in a burner with no slot for one cannot be burnt in the game. The catalog does not record those slots, so no such building is refused.
- Nuclear fuel's used cells are Burnt Results of reactors, which make nothing and are not laid out.
