---
status: accepted
---

# Machines with an Output Drop put their products on their belt themselves

Some Py machines (soil extractors, casting units, sand and clay extractors…) carry a `vector_to_place_result`: a point just beside them where they put their products themselves, onto the lane of the belt there nearer the machine. The user asked that they use it instead of output inserters, and that inserters support a machine only where it makes more than its lane takes (a casting unit's 900 plates a minute on a yellow belt, 450 a lane).

- **A drop is an inserter fixed on its lane.** The lane machinery (`laneDrops`, `outputSplit`, `chooseLanes`, Path Flow, `maxFlow`) already reasons about inserters dropping on lanes. A machine's drop joins it as one more: from the machine to its drop point, moving up to a lane's worth, its lane fixed (no Drop Offset moves it). Supporting 90° inserters then choose the other lane by the same max-flow as any output inserter.
- **Band faces only.** In the band model a row's output belt at depth 1 on the face its drop tiles lie on takes the drops: the variants try the rotations that put the drop on a machine's top or bottom face first (also for machines without fluids, which used to try only one or two rotations), and a band one tile high between two rows dropping toward each other, each on its own lane. A drop on a machine's side is not used.
- **Sized for the worst place on the belt.** The belt's direction is the router's, and a Copy routed the other way round reverses it, so a machine may be the last its belt passes. A row of n machines making m each on a lane of L: the last finds L − (n − 1)·m of room at least, so it gets 90° inserters for the rest of m. Rows are cut so their drops fit a lane (`dropLane`); a lone machine making more than a lane gets inserters for m − L. Two rows sharing one belt have no lane to spare: they get none.
- **Drop tiles stay clear.** A drop tile holds its output's belt or nothing that takes items: another route's belt would get the products. The core keeps unused drop tiles out of its belt rows (they dive under), the Module and Compound Block hold them, the squeeze never takes out the line between a machine and its drop tile (a belt beyond would move onto it), and `validateBlock` checks every machine.
- **Preferred, not only allowed.** Fewer inserters alone do not win: an inserter's tile counts as filled for Compactness, and a drop design often needs a gap for side connections. So a Sub-Block's designs rank the fewest output inserters at machines with a drop right after Starvation, and the search's score puts the same count after Starvation and Recipe Loops, before Compactness.

Without 90° inserters nothing reaches a belt against the machine, so a machine making more than a lane loses the rest; a second belt for straight inserters (a Two-Way Output with a drop) would fix that, not built.
