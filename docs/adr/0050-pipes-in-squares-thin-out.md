---
status: accepted — refines ADR 0021
---

# Pipes in a square of four thin out to a line

The user saw pipes in blueprints laid in 2 × 2 blocks, several in a chain, where one line would do. Such a band takes no pipe-to-ground: burying (ADR 0021) takes only a run of pipes with nothing joined beside them, and every pipe of a band two wide has a neighbour beside it.

They come from the router. A pipe tree's legs are routed one after another, each joining the tree where it first can. Two legs of one tree may then run side by side, or a leg may double back beside another. Pipes of one route join wherever they touch, so the two lines become one band. Py silicon at 4 furnaces in its 118 × 118 City Block had 17 such squares: the washers' muddy sludge ran as two rows under one row of washers.

What changed (compact.js `buryPipes`):

- Before burying, each plain pipe in a square of four plain pipes of its fluid goes, where all of these hold:
  - every pipe and pipe-to-ground beside it (and a pipe-to-ground's partner through its tunnel) still joins the others without it, not counting a path through a machine;
  - no machine's fluid connection meets it;
  - no pipe built before (an Annex's draw) touches it;
  - it is not the first or last pipe of its route.
- Pipes go row by row from the top-left, again while any goes, so a band loses one of its rows and keeps the other straight. What is left is buried as before.

Py silicon at 4 furnaces: 2 squares left, not 17, both on pipes the washers' connections meet; 127 plain pipes, not 138. The layout is valid and starves nothing.

Still:
- The router still lays the doubled legs; this only takes them out after. A leg joining the nearest pipe of its own tree, not the first it meets, would not lay them.
- Pipes a machine connects to stay, even in a square.
