---
status: accepted — refines ADR 0030 and ADR 0032
---

# Pipes of one fluid join into one network

Each pipe route was its own network: every Sub-Block making a byproduct fluid sent it to the east edge on a pipe of its own, and the router kept pipes of different routes apart even when they carried the same fluid. Byproduct belts already join one another on their way to the east edge (ADR 0030). The user's rule: pipes with the same content always connect, across Sub-Blocks and across blocks.

What changed:

- **Networks** (`pipeNetworks`, compose.js). A fluid's pipe routes are grouped into networks:
  - those carrying it to the east edge (byproducts, and a main product the train takes) together;
  - the others (the train's, and those between Sub-Blocks) together.
  The two kinds stay apart, because a pipe to the train would draw off what the other pipes' consumers take. A Sub-Block's input of a fluid never joins its output of that fluid, since a recipe's input and output of one fluid must stay apart.
- **Joining** (`joins`, router.js). A route's pipe tree first joins a pipe of its network that was routed before it. It starts from a free tile beside one of that pipe's plain pipes and searches a short way (`JOIN_STATES`). Once joined, a route to the east edge does not go there itself: the other pipe reaches it. Where the tree finds no way, it routes on its own as before. Its pipes may touch its network's pipes anywhere.
- **Checks.** Pipes of one network may touch (`separateNetworks`). A route to the east edge reaches it through the pipes of its network it joins (`joinedTo`).
- **Annexes.** The built pipes keep their networks as Fixtures (`network`). An Annex's pipe of a fluid joins the network of the built one first, by the same rules. The Annex's Sub-Blocks are apart from those built before it. When the layouts are joined (`annexed`), the networks are joined too. Draws (ADR 0032) are unchanged: a drawing route still becomes the route it draws from.

Py slaughterhouses bleeding auogs (cages, 10/min) and rendering them (bones, 10/min) both make blood: one blood pipe to the east edge, 47 × 28 (was two, 38 × 42). In the Py moss Annex, the Annex's muddy sludge joins the first layout's.

Still:
- The simulation still takes each route on its own: a network does not let one route's spare make up another's shortfall.
- Pipes to the east edge and the others of the same fluid stay apart.
