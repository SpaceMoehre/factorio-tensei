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

## Filling a City Block

Maximized in a 116 × 116 City Block (Buffer 1), Py moss came out 940.8/min: seven copies of two rows of 14 farms, 84 of the 114 columns, a strip of 9 rows left below. Three things held it back:

- **Rows as long as fit.** A stack of copies in a City Block was tried in rows as long as its width less 12 columns and 4 per belt that may snake through it, 28 columns in all. Copies of Fluids Between need only a column and a lane each side for the one belt snaking through, a trunk per fluid and the module's margins: 18. They are now also tried in rows that long (`snug`): 16 farms, 96 columns.
- **One row Fluids Between.** The module of the machines left over is a single row. Its connections on one face had no pipe rows of their own: once routed, its pipes took a row each below the belt, 10 rows. Now one row may stand inside too: its pipe rows either side of its belt, below it, 9 rows: seven copies of 15 and the last row fill 114. A module's cores are ranked by the rows their connections' pipes will take once routed, not the core alone.
- **Tries out of time.** Designing a Sub-Block of 86 farms built 1,750 cores of the whole module (each about 3 ms), though past 40 machines copies go first and a whole module seldom routes: the first try ran out of its 10 seconds and Maximize took it for want of room, stopping at 86 farms. In a City Block such a Sub-Block's whole module now takes only its structured variants, every second row shifted a column at most (a try takes 1 to 4 s); a try that runs out of time bounds the next only as one that starves does.

Py moss, Maximize in 116 × 116: 1152/min, 240 farms in 114 × 114, found in 34 s (was 940.8/min, 196 in 114 × 105).

Still:
- A fluid reaches each pair's pipe band through a riser beside the stack, not by a stub of its own at the west edge.
