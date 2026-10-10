---
status: accepted — refines ADR 0041
---

# Byproducts listed once, processed by one step

ADR 0041 listed each step's byproducts under that step, and a General Use made a Use of its own at every step making the item. The user asked for the byproducts to be collected under the train inputs instead, with a button that creates a step to process one: Py titanium's ti rejects, made by both the grade 3 screeners and the ti-enriched dust.

What changed:

- **A General Use is one step** (chain.js). It takes all of its item from every step and Use making it besides its own item (`sources`). The exceptions are as before: a step a Use names for the item, and a step of the Use's own recipe. Its key is `* > item` (`EVERY`).
  - In the linear system its row sums what each source gives it.
  - It takes the item from the source making the most (`from`). The other sources' entries name that one for it (`goal.joins`), so their belts or pipes of it join that one's on its way to the step.
  - This is the Supplied Item's join of ADR 0041, from any step: a filter splitter after their producers sends the item onto a belt side-loading onto that belt, ahead of the step. A pipe joins that pipe's network.
- **A Supplied Item's lane rule** now holds for the item itself: one lane must carry it. Each of the Use's belts sends its share off. Before, it held for all the solids the Use makes. One recrusher takes the rejects of both steps (469.6 gravel and 140.9 grade 3 a minute, more than a yellow lane), and its grade 3 still joins the grade 3 screeners'.
- **The app:**
  - Every step of the chain, Uses included, stands at the top level. A Use's row says which steps' byproduct it takes.
  - The byproducts that leave by train are listed once each under *Leaves by train*, after what comes by train. Each shows its rate in all and the steps making it, with *Add a step processing it*: a recipe taking it, which adds a General Use.
  - The per-step *Use in…* and *Every step making it* are gone. A Use naming a step (`from`) from an older setup still works and shows as a step.

Py titanium plate at 1800/min, rejects recrushed: one recrusher, 24 machines, takes all 469.6 rejects a minute (290 from the grade 3 screeners, 180 from the dust). Its grade 3 joins the grade 3 screeners', which make 579 a minute, not 720; its gravel feeds the sand. Ti-enriched dust 60/min laid out: the dust's rejects leave its belt through a filter splitter and side-load onto the grade 3 screeners' belt ahead of the recrusher, valid and starving nothing.

Still:
- A byproduct is processed in one step for all its sources, or (from an older setup) at one step.
