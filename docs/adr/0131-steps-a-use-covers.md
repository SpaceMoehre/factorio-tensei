---
status: accepted — refines Supplied Item (ADR 0041), Recycled Byproduct (ADR 0035)
---

# Steps a Use covers are not made

The user's rule: an item leaves by train as a byproduct only where nothing in the block takes it, or what is left over that would clog; a byproduct comes before the train or a step making the item.

Setup: Py tin plate at 60/min in 116² among 32 poles, the sand casting's sand made (soil washing, its soil), the screeners' grade 2 and rejects crushed, their stone to gravel and the gravel to sand (General Uses).

Before: the gravel's sand (7.5/min) joins the sand step's as a Supplied Item only where the step still makes some; the sand casting takes 2.38/min, so the step would make none, the supply was dropped, and all 7.5 left by train while the soil washing (and soil extractors) made the 2.38.

What changed:
- **chain.js** `expandChain`, `expand`: a solid's supply dropped because its step would make none marks that step `idle`; the chain is expanded again without it made here, so its item comes as one by train does: a Recycled Byproduct from the Use, what is left over leaving by train. The step's own steps go with it (the soil). Where the chain then balances no more, it stays as it was. Not a Goal's step.

Py tin plate, 116²: the page's Foretelling fit not one casting unit → 945/min, valid, starving 0, 110×109, 416 s (suite: tin-plate-116 674.33/min at K 20). At 60/min: soil washing and soil gone; sand recycled from the gravel 2.38/min, 5.12 by train (was 7.5); the muddy sludge electrolyzers gone with the washer.

Every suite setup's and test fixture's chain is the same step by step.

Tests: supplied.test.js: the tin chain above.

Still:
- Fluids: a fed-back fluid covering all is cut to leave its step TOP_UP (ADR 0062); its step stays.
