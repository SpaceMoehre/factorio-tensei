---
status: accepted — refines ADR 0034, ADR 0035 and ADR 0040
---

# General Uses and Supplied Items

Py titanium plate at 1800/min, with its grade 1, 3 and 4 titanium, ti-enriched dust, MIBC and sand made here. Two byproducts are worth processing in the block:
- The grade 3 screeners' ti rejects go to secondary crushers (gravel, and some grade 3 titanium).
- The jigs' ti pulp goes to pans (overflow waste and MIBC).

The user had to add a Byproduct Use for each step's byproduct, and what the Uses made left by train (ADR 0034). That meant the recrushed gravel went away while the sand's gravel came by train. It also meant a further Use was needed to turn the recrushers' grade 3 into grade 4, which then left by train too. The user asked for two things:
- To say once what a byproduct is used for, at every step making it.
- Where what that Use makes is needed by another step, to prefer it.

What changed:

- **General Use** (`uses` entries without `from`, chain.js). Every step and Use making the item, besides its own item, gets a Use of that recipe. Each is a Sub-Block of its own, keyed by its step as before (Py: the grade 3 screeners' rejects and the ti-enriched dust's both go to recrushers). There are two exceptions:
  - a step that a Use names for the item;
  - a step of the Use's own recipe (it would recurse).
- **Supplied Items** (chain.js). A Use may make an item that a step of the chain makes, with no Use of its own taking it. That item joins the step's on its way to the steps taking it, and the step makes that much less. In the chain's linear system, the step's row loses what one of the Use's gives. A Use's goal names the step whose belt or pipe its item joins (`goal.joins`), and the chain lists them (`supplies`).
  - A solid only where one lane of the chosen belt carries all the solids the Use makes: its belt sends the item off onto the step's.
  - Not where the step would then make none: it leaves by train.
- **Use products as Recycled Byproducts** (chain.js). An ingredient that would come by train comes from a Use making at least as much of it, as from a step's byproduct (Py: the recrushed gravel to the sand). The lane rule of ADR 0039/0040 now holds only for a byproduct fed back into a loop. An Internal Path from a Use to a step needs no tap.
- **Flows and routes** (flows.js, routes.js). A Supplied Item is a `joined` flow from the Use into the step's Sub-Block, counted as taken from the Use and brought to the step's route. Its Use comes before the step's consumers in the Dependency Order where that makes no cycle. The step's output belt lists it (`supplied`) and the Use's (`supplies`). The Use's pipe of it names the step's pipe (`into`), whose items carry both.
- **Laid out** (compose.js):
  - The step's belts are planned for what their consumers take, less what joins them. That counts at the belt into the first consumer taking the item.
  - That belt carries the joined amount (`joined`), which the simulation adds to what arrives.
  - Each belt of the Use's carrying the item sends it there. Where the rest of the belt goes on to its consumers or the train, it uses a gatherer (ADR 0040): a filter splitter after its producers puts the item on a belt of its own, side-loading onto the step's belt. Its link is routed after that belt's links up to its consumer, onto one of their straight belts after the step's producers. Otherwise the Use's own belt ends side-loading there (`supplyEnd`).
  - The Use's pipe joins the step's pipe network (`pipeNetworks`, `mustJoin`), after it, searching 20 times as far as other pipes joining their network. At the block's edge it gets room to turn back, as a pipe from several copies does.
  - Placement links the Use to the consumer whose belt or pipe its item joins, so it stands near it rather than at the east edge, where a Sub-Block with no consumer stands.
  - A Supplied Item's way is routed even plain, since nothing else brings it. Where none is found, the item goes on to the train instead: its pipe goes to the east edge, or its belt's rest. That consumer is short of it, so the layout starves, and the search prefers one where the item joins. A Use's belt with no way to the train either fails the layout.
  - The checks see each such belt head into the side of the step's belt. The search does not count the item as riding on through the Use's consumers.
- **The app.** A byproduct's *Use in…* has *At every step making it*. A Use's row has *Every step making it*, which turns a General Use into one at that step and back; *By train* on a General Use removes it everywhere. A step's row says how much more comes from which Use, so that it makes that much less, and a Use's row says what joins which step's. The Inspector shows how much joins a belt and what a joining belt joins.

Py titanium (powdered titanium 60/min, rejects recrushed everywhere, the jigs' pulp to pans): the grade 3 screeners make 104 a minute, not 120. The recrushers' 16 a minute of grade 3 joins their belt through a filter splitter, and the pans' 900 MIBC a minute joins the mixers' pipe. It is valid and nothing starves.

Titanium plate at 1800/min itself found no layout within 10 minutes here, before this change or after it: every candidate failed on the grade 1 screeners' splitter, which sorts their grade 2 out and finds no room (an existing limit). Each candidate took about 40% longer than before.

Still:
- The side-loaded lane's room is not checked.
- A Supplied Item joins one belt of the step's: where the step's path runs on parallel belts, the others carry what their consumers take.
- A step's byproduct (not a Use's product) that another step makes still leaves by train.
