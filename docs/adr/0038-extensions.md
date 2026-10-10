---
status: accepted — refines ADR 0031 and ADR 0032
---

# Extensions: a built Sub-Block grows before an Annex builds its own

Py sodium hydroxide, maximized in a 100 × 100 City Block (Buffer 2), with its slacked lime, lime and water made here. The first layout fit 6 chemical plants of sodium hydroxide, and three Annexes followed. Each Annex had its own slacked lime and lime Sub-Blocks, the last one being 2 sodium hydroxide, 1 slacked lime and 1 lime. ADR 0031 already named the gap: "An Annex's small Sub-Blocks are its own." The user's rule: a big Sub-Block that cannot grow splits off a new one, but before a small one is split off, check whether a Sub-Block of the same item already built could be extended.

What changed:

- **Extra** (`chain.js`, `plan.js`): a chain may make more of a step's item than is taken (`extra`). The step's rate and the rates of the steps feeding it grow with it. Its entry and Sub-Block carry `extra`, and the extra does not leave by train (`flows.js`, `routes.js`): it stays on the Sub-Block's pipe.
- **Spare** (`annex.js`): a Sub-Block with an extra has as spare what it was planned to make beyond what is taken. This holds even though it takes things from other Sub-Blocks, since those were planned for it. Spares are rounded down to 1/100 with a little tolerance, and the Annex's check for enough allows the same, so an extra of exactly what the Annex takes is enough.
- **Extension** (`maximize.js`): Maximize remembers each layout it laid out: its n, its extra and the layouts before it. When an Annex is found that makes a fluid made here in a Sub-Block of its own:
  1. The last layout with a Sub-Block of that fluid is laid out again, making that much more of it.
  2. The layouts after it are laid out again, as before, beside it.
  3. The Annex is laid out again at the same number of the first Goal's machines, so it draws the fluid from the grown Sub-Block's pipe (ADR 0032) and does not make it, nor what only fed it.

  The result is kept when every step fits, nothing starves, and the Annex has fewer Sub-Blocks. Otherwise the Annex keeps its own, as before. Each of these lays out at one n (`relay`), with no search over the count.
- Only fluids. An Annex draws only from pipes, so a solid made here still gets its own Sub-Block in the Annex. A solid fed only into a drawn fluid's Sub-Block (Py's lime into slacked lime) is no longer needed there.

Py sodium hydroxide in 100 × 100: before, 20 machines at 1999.96/min in Sub-Blocks of 6/3/1/3 (water once), 6/3/3, 6/3/3 and 2/1/1. With Extensions: 23 machines at 2299.95/min. The first Annex draws its slacked lime from the first layout, whose slacked lime grew from 3 to 6 chemical plants and its lime from 3 to 5. So that Annex is 6 sodium hydroxide alone, and its room left fits two more Annexes. The later Annexes' Extensions did not fit (the first layout grown further found no layout), so they keep their own (3/2/2 and 2/1/1). It took 1407 s, against 684 s before, on a host busy with other runs.

Still:
- Each Extension costs a layout for every layout from the grown one on, and one for the Annex. Later Annexes cost more.
- A solid's Sub-Block is not extended.
