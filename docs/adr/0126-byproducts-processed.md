---
status: accepted — refines the Byproduct Uses (ADR 0034, 0041) and Recycled Byproducts
---

# Byproducts processed into the Goal

The setup: Py pu-238 at 60/min in a 116² City Block, the separation (plutonium oxide → pu-238 0.3 a craft, pu-239 7.95, pu-240 3.75, pu-241 2.25, pu-242 7.5) and four Byproduct Uses: pu-239 and pu-241 to shuffle 1, pu-240 to shuffle 2, pu-242 to shuffle 3. The page showed "Add a goal to see how it is made" and Build failed ("Cannot read properties of null (reading 'entries')").

The user's rule: "the goal was to continue processing the byproducts into the pu-238 as much as possible, add a feature button that automatically adds process steps for byproducts to build into the target item".

Causes:
- A Use takes all of its item, its recipe's other ingredients by train: shuffle 1 for pu-239 brought pu-241 by train, shuffle 1 for pu-241 brought pu-239; with pu-242 to shuffle 3 each pu-242 came back twice over. No rates balance: `expand` returned null both ways, and the callers read `chain.entries`.
- Four isotopes balanced exactly by three shuffles is four equations in three unknowns: something must be left over. Which shuffles, how much of each, is a linear program, not a Use per isotope.

What changed:
- **chain.js** `expandChain`: no rates balancing is an error saying so, naming the Use without which the chain balances (each Use left out in turn), not null.
- **chain.js** `expand`: a Use's `share` (of what its sources make, the rest leaving by train: `takenShare`, the matrix row scaled, the byproducts listed less it); where a General Use takes a share of an item, the steps taking it as another ingredient take it off that Use's belt, every source's on it already (Recycled Byproducts `pooled`, each source its part; a General Use's `from` chosen before them). Entries' `use.share`.
- **byproducts.js** (new) `processByproducts`, `simplex`: the chain without the user's Uses of the Goal's byproducts (and of what they make); its byproducts the pool; the recipes taking them, three deep, the Goal's own first, those leading to the Goal kept; the most of the Goal they make, each pool item taken no faster than made (the chain's steps' items free, as by train; a cap on each, a hair against each craft among equals). Each recipe used pins a byproduct only it does (a matching), its share of what is made; one that pins none is dropped and the program solved again.
- **app.js** `processButton`, `processNote`: *Process into …* beside "Leaves by train" (and below the error), what it did said below it; a Use's row says the share it takes.

| Py pu-238 at 60/min | Separation | Shuffles (neutron absorbers) | Plutonium peroxide | By train (isotopes) |
|---|---|---|---|---|
| The user's four Uses | no chain | | | |
| No Uses of the isotopes | 60/min, 17 particle accelerators | none | 167 centrifuges | none (all of them leave) |
| Processed | 0.83/min, 1 | 1, 2, 3, 4: 201 each | 91 centrifuges | none (pu-239 1.8e-9 left) |

The linear program alone, on what 200 separations a minute make: shuffle 2 at 13.575 a separation with shuffles 1 and 3 (pu-241 left over, worked by hand), 21.45 with shuffle 4 too (the user's packs unlock it): pu-238 0.3 → 21.75 a craft, 72× less plutonium oxide.

Tests: simplex; the plutonium chain processed (the four shuffles, a Use of another step's byproduct kept, the separation below 1/min, no isotope by train, one belt each isotope; byproducts.test.js); a share's rest by train; the error naming pu-242's Use (byproduct-uses.test.js).

Still:
- The processed chain does not lay out: the isotopes' belts form loops (shuffle 1 → 2 → 3 → 1), the belt closing a loop is laid as feedback, and what joins it is dropped (flows.js `joined`: into an Internal Path only), so a try at 1 separation starves (pu-242 3.54 of 6.4). Layout for byproduct networks with loops is the next step.
- The program ignores productivity and the byproducts of what the Uses add (their plutonium peroxide's sb-phosphate).
- Recipes three deep from the byproducts, 3000 at most before those not leading to the Goal are dropped.
