---
status: accepted — refines ADR 0007
---

# In a City Block, Sub-Blocks may stand in columns (Layers)

Placement puts the Sub-Blocks one at a time, from the Goals west. Each one goes where it grows the block least and keeps its links short. Free-standing, that packs well. In a City Block, its width is fixed: the Sub-Blocks placed first take the room beside their consumers, and one placed late finds none. Py small parts at 3000/min in 116 × 116: 51,692 candidates, every one with no room for the iron sticks. Its layouts that did fit (2400/min) left a third of the City Block empty.

The search therefore also tries Layers for every candidate in a City Block. Every Sub-Block stands in a column, every producer west of all it feeds, and each column's Sub-Blocks stack top to bottom. The columns are not placed one Sub-Block at a time but chosen together. Every way to put the Sub-Blocks in columns is weighed, each up to two columns further west than its consumers make it. The taken one fits the City Block and spans least. No column may be taller than the room, less a row for every belt that has to cross it: links passing through, Side Inputs bound for columns further east, outputs from columns further west. The same Py small parts then fit 3000/min, in tight columns. Looking for a layout without Starvation (Maximize), the candidates in columns go first: they pack tighter, and what a layout found spans teaches the Foretelling.

The corridors between columns widen with the links turning in them, by half a lane each, not a lane each. Belts also cross through the gaps between stacked Sub-Blocks and along the free rows below them, and a lane each made no Layers fit even where tight corridors route. With many belts crossing far, routing can still fail. That happened at 4800/min in 200 × 200. Only routing tells.

Fixtures are not weighed while columns are chosen. A column whose Sub-Blocks stand on one moves up or down its column, then west as far as the room left lets it. The next-best ways are tried when the best cannot avoid them. Don't drop the one-at-a-time placement: around scattered Fixtures it finds spots that columns cannot.
