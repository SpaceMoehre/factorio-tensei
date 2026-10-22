---
status: accepted — refines ADR 0005 and ADR 0031
---

# The Output Side

The user's rule: let the user define where the output area is: up, right or down.

The block ran west to east: the train's belts and pipes came in across its west edge and its products left across its east edge. The inputs stay on the left; the side the products leave by is now the user's choice.

What changed:

- **The Output Side** (grid.js `outSide`, `atOut`; `logistics.output`: 'right', 'up' or 'down', right by default). Every Sub-Block, Module and link still runs west to east; only the last legs to the train go to the chosen edge.
  - router.js: a belt's way to the train ends leaving across that edge (`edgeGoal`), a pipe's starts from it (`outStarts`).
  - compose.js: a belt already at the train's edge is there only on that edge; a pipe's stub on the east edge reaches the train only where it leaves east.
  - place.js: with the Output Side down, the Goals stand from the bottom of the City Block up (up, as before, from the top down).
  - compact.js: the post-passes' grid knows it; the finished block carries it (`block.out`); validity.js checks belts and pipes to the train reach that edge, heading out across it.
  - render.js shades the edge the products leave by; app.js has the "Output side" choice beside the inserters, and names the train's edge.

| Setup | Output Side | Result |
|---|---|---|
| Py small parts 600/min, 100², build 60 s | up | valid, 88 × 20 |
| Py small parts 600/min, 100², build 60 s | down | valid, 74 × 22, against the bottom |
| Py coke, 3 towers, 116², one sorted try | up | valid at 3.7 s, every belt and pipe to the train leaving north |

Tests: in a City Block, with the Output Side up and then down, every belt to the train ends on that edge heading out across it, the layout valid.

Still:
- The Side Input stays on the west edge.
- With the Output Side up or down, placement still slides Sub-Blocks west from the east edge: the products' last legs run on north or south from there.
