---
status: accepted — refines ADR 0092
---

# A balancer built as made, its belts judged in all

The setup (the user's, `/tune-layout`): Py tinned cable 1800/min into a belt balancer (the Goal's "balance" box), standing on its own (no City Block), the inputs and products on the left, top or right (ADR 0114). The page stopped at once: `can't access property "underground", p is undefined`. With the sides as before, the same; and the same at commits well before ADR 0114.

Causes:

1. **A balancer's candidate come back from a design worker was built as a core of machines.** Candidates cross from a worker without their `build` (structured clone); `revive` gave every one back `buildSpec`, the build of a core of machines. A balancer's own build routes its network unsqueezed and feeds its out belts as if by machines of their own (ADR 0092); built as a core of machines, it was squeezed: the column of its in belts' end tiles (straight belts only, nothing reaching them) came out, the end tiles (each in belt's waypoint) with it, and module.js `deadEnd` read a piece at index −1. The suite's in-process path takes the same way (kept designs are cloned too).
2. **Squeezed or not, its in belts were judged one by one.** Fifteen machines put 570, 750 and 480/min on the three belts into the 3–2 balancer; the simulation wanted 600 of each and counted 150/min starving. A balancer takes whatever each belt brings.

What changed:

- design.js: `buildBalancer`, a balancer's build, called by its candidate and by `buildSpec` for a spec whose variant is a balancer (so `revive` builds it as made).
- sim.js `simulate`: a balancer Sub-Block's demand on its belts is summed with what they bring; short only where they bring less in all than it gives.

| Py tinned cable 1800/min, balancer, no City Block | Before | After |
|---|---|---|
| Page-like build (30 s) | fails at once: "p is undefined" | 1800/min, 15 + 15 machines, 3–2 balancer, 65 × 50, valid, starving 0, at 11.7 s |
| Suite (K 20) | fails at once | 1800/min, 69 × 49, valid, starving 0, 7.2 s |

| Suite | Seed 1 |
|---|---|
| Fast tier, 12 setups | every layout the same |

Tests: a balancer candidate revived as from a worker builds the same entities and drops as the one made; belts bringing a balancer 570, 750 and 480/min starve nothing, 570, 600 and 480 starve 150/min (balancer.test.js).

Still:
- The design's estimate takes the balancer's in belts' loads as equal (ADR 0092); only the simulation now judges them in all.
