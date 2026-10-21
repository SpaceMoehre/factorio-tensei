---
status: accepted — refines ADR 0062 and ADR 0065
---

# Fluid temperatures

The user's rule: where a recipe takes a fluid at a minimum or maximum temperature, or makes one at a set temperature, the application must respect it; a fluid any temperature serves needs nothing.

Py hot air at 6000/min (ADR 0065): the RHEs warming stone bricks take coke oven gas at 250° (warm) and 500° (warmer) at least, and give it back at 100° and 250°; the heat exchangers reheat it to 500° from gas at 100° at most. The catalog had no temperatures, so the chain took all of it as one fluid: the heat exchangers made 16000/min of it for both kinds of bricks and took theirs by train, the bricks' gas leaving by train. In the game the warm bricks' and the heat exchangers' would take the wrong gas.

What changed:

- **The catalog** (catalog-builder.js, data/catalog.json rebuilt): a fluid ingredient's `minTemperature` and `maxTemperature`, a fluid product's `temperature`, and each fluid's default (`temperatures`: what it comes at by train, or from a recipe naming none).
- **The chain** (chain.js):
  - A step taking a fluid at a temperature only takes it from the step making that fluid where it makes it so; else by train (`temperature`).
  - A fluid fed back (ADR 0062) goes to those taking it at the temperature it comes at (`takers`), the step making the fluid making theirs; a step taking the fluid itself at another temperature still feeds it back. What tops up its pipe is what those takers take beyond it.
  - A fluid a loop takes back, or one its step makes at another temperature, comes from a step making it so where one does (a Recycled Byproduct through valves), the train topping it up: the heat exchangers' gas at 100° from the warm bricks.
  - A Byproduct Use taking a fluid at a temperature only takes it from steps making it so.
- **Pipes** (plan.js, routes.js, compose.js `pipeNetworks`): a fluid's pipe carries the temperature it comes out at, and pipes of a fluid at two temperatures never join one network (to the train they may).

| Py hot air 6000/min, free-standing, 120 s | Before | After |
|---|---|---|
| Heat exchangers | 6, making 16000/min of gas for both kinds of bricks | 3, making 8080/min at 500° for the warmer bricks |
| Coke oven gas by train | 16842/min (a loop's) | 505/min (topping up the heat exchangers' 100° gas) |
| Gas leaving by train | 16000/min (the bricks') | 80/min (the spare the loop starts with) |
| Layout | 184 × 12, 625 entities | 59 × 48, valid at 14 s |

The four reference setups' and Py coke's chains are the same (no recipe of theirs takes a fluid at a temperature).

Tests: Py hot air's gas round its loop (500° to the warmer bricks, 250° to the warm, 100° to the heat exchangers), the heat exchangers making 8080/min, no two temperatures in one network, a layout without Starvation; the catalog records temperatures in and out and each fluid's default.

Still:
- A fluid two steps make at temperatures a taker both takes goes from one of them, as before; mixing them in one pipe is not planned.
- Where the step making a fluid makes it at a temperature a taker does not take, and no other step does, it comes by train at its default temperature, which that taker may not take either: the chain does not say so.
