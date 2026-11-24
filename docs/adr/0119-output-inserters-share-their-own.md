---
status: accepted — corrects the Inserter Clocks' sharing (CONTEXT.md)
---

# Output inserters share only their own products

The user's report: Py's evaporator making iron oxide (ree-concentrate1: 6 iron oxide and 10 ree concentrate in 8 s, speed 1), a hand of 2, showed its iron oxide inserters' clock as 3 swings in 16 s. At full speed it makes 0.75 iron oxide a second: 0.375 swings, 3 in 8 s. (The user took it for the hand counted twice. The hand is applied once; the sharing was wrong.)

Cause: an inserter's clock is what it moves a second, over its hand, over the inserters sharing it (`sharing`). Out of a machine, `sharing` counted every output inserter of the machine. With each product on a belt of its own (ADR 0066), the evaporator has one inserter for its iron oxide and one for its ree concentrate: each counted as sharing with the other, each clock half what it is (iron oxide 3 in 16 s, ree concentrate 5 in 16 s for 5 in 8 s).

What changed:

- **Sharing by what is moved** (layout/core.js, the machine's output inserters' `sharing`): those moving the same products share them; an inserter moving all the products (mixed outputs) still shares with every other such.

| The user's: Py reo, cobalt extract, tinned cable, 116², a hand of 2 (one machine of reo) | Before | After |
|---|---|---|
| Evaporator, iron oxide inserter | 3 swings in 16 s | 3 swings in 8 s |
| Evaporator, ree concentrate inserter | 5 swings in 16 s | 5 swings in 8 s |
| Solid separator, iron oxide and reo on one inserter (2 + 5 in 5 s) | 7 swings in 10 s | the same |

Only the clocks change: `sharing` is read by clocks.js alone, so every layout is the same. Signals are kept by clock ("3/16"), so the corrected inserters take the signal the user set for their true clock where one is set (the user's setup has "3/8" and "5/8"), else run freely until one is chosen; one set for a clock no inserter has any more is left unused.

Tests: a machine's output inserters share only the products they move (Py evaporators feeding solid separators, the iron oxide on a belt of its own: each product's inserters move what the machines make at full speed; before, half; clocks.test.js).
