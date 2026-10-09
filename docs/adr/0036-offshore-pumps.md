---
status: accepted
---

# Offshore pumps

Water made here could come only from Py's pumpjack recipe or a recipe giving it off. The user asked for the plain offshore pump: built on 6 tiles of shallow water (Py's shallow safefill), it pumps 1200 water a second.

The catalog turns every offshore pump into a building of one recipe, `offshore-water`. The recipe takes nothing and makes 60 of the shallow water tile's fluid each second for each unit of crafting speed. The pump's crafting speed is its pumping speed per tick: 20, so 1200 a second. The pump needs no power. The game wants ground under the pump and water across 3 × 2 tiles before it, so the building takes 3 × 3 tiles: the pump in the middle of the south row, facing north, its pipe leaving south, and the water in the two rows north of it. The layout treats it as any machine. The blueprint puts the pump there, turned with the building, and lays the six `water-shallow` tiles. The recipe is offered first for water, since nothing simpler makes it.
