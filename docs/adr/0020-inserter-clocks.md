---
status: accepted
---

# Inserter Clocks: a signal per clock, the clock at full speed

The user wants inserters enabled by clock signals over red or green wires. The tool works out how often each inserter has to move; the user picks the signal that runs at that rate.

- **Full speed, not the plan's rate.** The Count is rounded up, so machines run below full speed, each Sub-Block by a fraction of its own. At full speed the clock follows from the recipe, the building and its modules alone (1 plate in 3 s), so like machines share clocks and a clock never holds a machine back.
- **Items on a belt add up.** An inserter takes whatever its machine needs from its belt: 1 iron and 2 copper in 3 s are 3 in 3 s.
- **Lowest terms.** 3 in 3 s is 1 in 1 s: the fewer clocks, the fewer signals to set up.
- **Shared evenly.** Two inserters on one belt into a machine, or out of one machine, move half each: 1 in 2 s. How the game splits it between them depends on their swings; the even split is the user's rule.
- **A signal per clock, kept by its key.** The user picks a signal for a clock, not for an inserter, from a modal of icons. The choice is kept under the clock's key ("1/3"), so the next build's clocks keep their signals.
- **Signal > 0.** The blueprint gives the inserter the enable condition `circuit_enabled` with `circuit_condition` first_signal > 0 (Factorio 2.0's InserterBlueprintControlBehavior). An inserter whose clock has no signal gets none and runs freely. Wiring stays with the Circuit Wires setting.

Don't take the clock from the share of the plan an inserter moves (`flow`): at the plan's rate every Sub-Block's clocks differ.
