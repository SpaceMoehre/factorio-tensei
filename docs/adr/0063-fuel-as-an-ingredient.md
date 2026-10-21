---
status: accepted — refines ADR 0035 and ADR 0062
---

# Fuel as an ingredient of the recipe

The user's rule: handle the fuel as an input in the recipe.

Py coke at 60/min (`quench-redcoke`) in a 116² City Block among 32 Fixtures (Buffer 4), the chain making its own coal from raw coal (crusher, screener, crusher) for the BOFs' red-hot coke, the steam the quenching tower gives fed back (ADR 0062), a General Use turning the coal byproducts into red-hot coke. The BOF (`bof-mk01`) is a burner, its Fuel coal.

Cause found: plan.js added each burner Sub-Block's fuel to its inputs (on the coal it takes as an ingredient), but chain.js sized the steps from the recipes' ingredients alone. The coal step made 6.86/min for a Sub-Block taking 8.14, the Use's byproducts 41.14 for one taking 48.86: every layout starved 9/min, whatever its design, and the page found nothing in 1000 s ("no layout without starvation fits").

What changed:

- **chain.js `ingredientsFor`**: a recipe's ingredients as its building takes them, with the fuel its machines burn a craft (the Fuel item, or the Liquid Fuel) added as one more ingredient (or onto the ingredient of that name). Every use of a step's ingredients goes through it: visiting (the fuel made in the block where the user makes it, else by train, its Train Input's rate counting it), the linear system, a Use's take (a Use burning the item it takes counts its fuel in what it takes, so it takes less coal per craft of its own byproducts), Recycled Byproducts and the feeds check. Errors (no Fuel chosen) stay plan.js's to report.
- **plan.js `fuelOf`**: what a busy machine of a building burns a minute, and its name.
- `expandChain` takes `logistics` (app.js, maximize.js, the skill's run.mjs pass it); without it the chain is as before.

| Py coke 60/min, 116² | Before | After |
|---|---|---|
| Coal step | 6.86/min (Sub-Block takes 8.14) | 8.14/min |
| Raw coal by train | 30.86/min | 36.64/min |
| Starvation, every layout | 9/min | 0 |
| Result (build, 120 s) | nothing fits | 60/min, 1 quenching tower, valid, first fit at 20–35 s |

The four reference setups' chains are unchanged (no machine burns a fuel the chain makes).

Tests: Py coke's chain makes the coal its BOFs burn, the coal made equal to what every Sub-Block takes (before, 9/min short).

Still:
- A Liquid Fuel the chain makes reaches its machines as any fluid from a step does; no setup exercising it was laid out.
- The chain's coal-dust rides on the coarse coal belt to its end (byproducts riding 1).
