---
status: accepted — refines ADR 0062 and ADR 0063
---

# A closed loop's fluid, filled only; a burner's own fuel

Py hot air with its hot molten salt made too (`hot-molten-salt` in "made"). The user: "this setup has molten salt as input and as byproduct!"

The heat exchangers (`reheat-coke-gas`) give back as molten salt all the hot molten salt they take (50 → 50), and the biomass powerplants (`biomass-molten-salt-01`) heat all of it again (400 → 400): a closed loop, none of it used up. ADR 0062 fed it back, the train bringing a hundredth so it starts, and gave the heat exchangers an overflow valve: molten salt came by train (42.5/min) and left by train (the spare, a "Spare" toggle on the page) at once, though no spare can ever come of a closed loop.

The same setup did not build at all: the powerplants burn biomass fuel only, and the page has one Fuel (coal): "py-biomass-powerplant-mk01 burns biomass fuel, not coal".

What changed:

- **A closed loop** (chain.js Recycled Byproducts, `closed`; plan.js; flows.js `fedBack`; routes.js): where a loop's fluid fed back is given back just as much as its takers take, the train only fills it (`fill`), through the top-up valve as before. No overflow valve, no pipe to the train: the step's entry has `closed` instead of `overflow`.
- **A burner's own fuel** (plan.js `burnerFuel`, `fuelsFor`): a burner that cannot burn the Fuel burns the one chosen for a category it burns (`logistics.fuels`), else that category's of most energy (charcoal briquettes for biomass).
- **Not leaving by train** (chain.js `byproducts`): a closed loop's fluid is no byproduct; before, the hundredth the train brings so it starts showed as made beyond what is taken back, under "Leaves by train" (the user's second report, Py hot air at 60/min). The step taking it "takes all its molten salt".
- **The page**: the train's row says "a closed loop: the train only fills it, through a top-up valve into the coke oven gas step's pipe"; beside the Fuel, a "Biomass fuel" select for each such category the chain's burners burn; the Fuel itself shows only where a burner burns it.

| Py hot air 6000/min, hot molten salt made, standing on its own | Before | After |
|---|---|---|
| Build | fails: "burns biomass fuel, not coal" | valid, 123 × 38, 6000/min, nothing starving, at 4.4 s |
| Molten salt | 42.5/min in by train, its spare out by train | 42.5/min fills the loop, none out |
| Powerplants' fuel | — | charcoal briquettes 3.5/min by train (or the biomass fuel chosen) |

Tests: the chain (no overflow, `closed`, the train filling, charcoal briquettes or wood), and a layout: no molten salt pipe to the train or overflow valve, the train's through a top-up valve, valid.

Still:
- The page shows the fill as "to fill", not a rate; the layout sizes its pipe for the hundredth ADR 0062 brings so a loop starts.
- Coalbed gas's water (ADR 0062) keeps its overflow valve: the offshore pump making the rest is a step of the chain, the user's rule capping it.
