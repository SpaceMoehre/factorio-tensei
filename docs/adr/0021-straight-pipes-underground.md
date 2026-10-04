---
status: accepted — refines ADR 0002 and ADR 0003
---

# Straight pipe runs go underground; pipes are of one material

The user set two rules. Plain pipes and pipe-to-grounds of different materials do not connect, so the Logistics settings take one pipe material, not a plain pipe and a pipe-to-ground chosen apart. And wherever three plain pipes or more stand in a straight line, a pipe-to-ground should take their place, so pipes take as little room above ground as they can.

- **One setting.** A material is its pipe-to-ground and the plain pipe named like it (`niobium-pipe-to-ground`, `niobium-pipe`). Saved settings take the plain pipe of their pipe-to-ground.
- **After routing, not in the router.** The router lays plain pipes where it can and dives only at obstacles; a pipe tree still growing needs its plain pipes, where later legs join it. Once the block is routed and squeezed, before its poles, a pass looks for runs: pipes that each join only the pipe (or machine connection) before and after them on one line. Three or more become a pipe-to-ground at each end facing out, nothing between. The squeeze has shortened them first; the poles may then stand on the tiles freed.
- **What stays above ground.** A pipe with a branch or a machine connection beside it (the run is cut there), runs of two (two pipe-to-grounds would free nothing), and a run that another network's tunnel crosses along its line: a pipe-to-ground there would pair with that tunnel's end.
- **Long runs.** As many tunnels as the reach needs, of even lengths, each end facing the next.

Don't bury pipes inside a Module before the block is composed: the links between copies join their pipe stubs, and a stub that has gone underground can only be met from one side.
