---
status: accepted — refines the Belt Merge glossary entry
---

# Belt Merge built in the blueprint

Belt Merge puts two items on one belt from the train, a lane each. The block took that belt already mixed, so the user had to build the merge at the station. The user asked for the blueprint to build it: two belts meeting head-on, one coming from each side, and the belt between them turning. Each item then lands on its own side.

The merge is built in the blueprint (`mergers`, blueprint.js), not in the layout. The block's merged belt starts at its west edge heading east. The blueprint adds a belt a tile west of it, with nothing behind it. Above it, a belt turns south into it, and below it, a belt turns north into it. Each takes one item from the west. Coming in from the side, each lands on the lane on its side: the first item on the north lane, the second on the south. The display panel stands behind the merge, where no belt may come in. It says which item comes from the north (↑) and which from the south (↓).

The merge needs three tiles in the column west of the block. These are the tiles the train's belts come in through, so it is left out when another Side Input comes in a row above or below. It is also left out in a City Block whose Buffer has no room there. In both cases the train brings the merged belt as before. The layout, its checks and the simulation are unchanged: the merged belt still starts at the west edge. The map does not show the merge; the blueprint holds it.
