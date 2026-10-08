---
status: accepted — refines ADR 0002, ADR 0021 and ADR 0028
---

# Fluids Between: rows facing each other across their pipes

Py's moss farms (Moss-1, 35/min: 8 farms) take muddy sludge and carbon dioxide through two connections on one face. The search stacked two rows of four facing their belt, which left each row's connections facing outward. Each band outside then held both pipe rows a row apart, and one fluid ran round the stack to reach the other band. The block came out 28 × 21. The user's own blueprint was 24 × 16: the rows face each other across a band of two pipe rows, one per fluid, and each row's belt lies outside it.

The user's blueprint shows what the search lacked:

- **Each fluid's connections line up.** The lower row is turned half round and mirrored too: the upper row's mirror image across the band. Each fluid's connections then meet column for column, joined by one pipe across the band. Turned only, the two rows' connections of different fluids would stand in the same columns.
- **Pipe rows of two fluids side by side.** Each fluid dives under the other's connections and surfaces only on its own. The search kept a row between them, since plain pipes side by side would join.
- **No margin.** The fluids come in straight along their rows, their stubs side by side at the west edge. The belts start and end at the edges too. A margin's column let the first fluid's pipe take the second's way in. The second then ran under a row of machines to come in from the east.
- **Poles over the belts' tunnels.** Poles stand in the belt rows, above the belts' tunnels.

What changed:

- **Fluids Between** designs (`between`). Pairs of rows face each other across a band holding their fluids' pipe rows. Every second row is reflected (`reflect`): turned half round and mirrored the other way. They come in two kinds:
  - **outside**: a pipe row per fluid, side by side (`interleave`), and the belts outside the pair. A belt that may split takes a part per band, so it does not run round the rows from one band to the next. This is the user's 24 × 16.
  - **inside**: the pipe rows nearest the machines on either side, and the pair's shared belts between them. A connection across the band reaches its row by a tap that the belts dive under. The moss belt lies in the middle of the band, so the farms stand 24 × 15, smaller than the user's blueprint.

  These designs are tried for every Sub-Block with fluids, in rows of half its machines, about square, or as long as its busiest belt allows, and for repeated modules of two rows. They are routed with no margin first.
- **Bands of their own height** (`middles`). In more than two rows, the band between two pairs holds only their shared belts: a row for each (outside), or none at all, the rows standing against each other (inside). Before, every band between rows was as tall as the others.
- **Risers.** A fluid in the pipe bands of several pairs joins them in a riser beside the stack, one fluid on each side. The belts pass outside the risers, so such a stack is routed in two columns each side first.
- **Beside another fluid's connection in a pipe row an inserter may stand.** The row dives under both. Only beside its own fluid's connection does a pipe row keep the tiles free, where its pipe carries on.
- **Bridging poles inside.** Of the links joining the poles' networks that need as few poles, one through spots inside the block wins over one through the strips north and south of it. Before, a pole above the moss farms' belt row grew the block by a row.

Py moss:

| Rate | Farms | Before | Now |
|---|---|---|---|
| 35/min | 8 | 28 × 21 | 24 × 15 |
| 100/min | 23 | 45 × 42 | 40 × 30 |
| 250/min | 58 | 63 × 63 | 58 × 45 |
| 600/min | 138 (Copies) | 93 × 94 | 92 × 71 |

Still:
- A fluid reaches each pair's pipe band through a riser beside the stack, not by a stub of its own at the west edge.
