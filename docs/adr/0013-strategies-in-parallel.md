---
status: accepted — refines ADR 0004 and ADR 0005
---

# Strategies run side by side; Spread places loosely first

The layout search places the Sub-Blocks tightly from the start: each producer west of what it feeds, a corridor and a gap of a tile or two between them. Where the links then find no room, that candidate fails and the next is tried. On a chain with a huge Sub-Block, every candidate takes seconds, and only a handful get tried at all. Py kicalk at 900/min with clay, steam and seeds made in the block (and the seeds' loop closed, ADR 0012) makes 563 13 × 13 plantations. Each candidate took about 5 s to route and squeeze, and the first layout came after 20 s.

The user proposed another strategy. Design each Sub-Block as a task of its own. Place them with a buffer wide enough for their links, and wire them up. Then move the Sub-Blocks closer and into empty room, and break machines out of them (Breakout, ADR 0006).

That strategy, Spread, is the same search with other candidates. The first has a buffer of a tile per belt route (4 to 16) as both corridor and gap, so its links route first try. The next ones halve the buffer, down to the default spacing. A layout that beats the best first tries packing the smaller Sub-Blocks beside the biggest, as one move per way: in rows as wide as it below and above it, in columns as tall as it east and west of it. Placing every producer west of what it feeds leaves a column as tall as the biggest Sub-Block beside it, mostly empty. Placement now takes a position for a Sub-Block's box (`at`), and says where each box stood. Then come the usual slides and Breakouts.

Neither strategy wins everywhere. Py small parts at 600/min: both settle on the same layout, Spread in 12 s instead of 19 s. At 1200/min the tight search does better. On kicalk, a pack once took the block from 574 × 440 to 381 × 478. Since its seeds' loop is closed, the packs there fail to route: the feedback has to cross the whole stack of plantations. So a build runs both side by side, each in a web worker of its own, and shows the best layout either finds. Starvation still ranks first. Maximize stays one worker: its tries depend on each other.

Before that, each Sub-Block is designed in a worker of its own, all at once, and the strategies start from those designs. A design candidate now says what it is — a core, or copies of a module (`spec`) — rather than holding a closure. So the candidates pass between workers as plain data, and a strategy builds any not yet built itself. Kicalk's first layout came after 10 s instead of 20 s.

Squeezing took seconds on big blocks. It now takes out every removable line of a pass in one sweep, by binary search over the lines, not one line at a time over all entities. It finds removable lines on a flat tile index rather than a map of string keys. On the 574 × 440 kicalk block, squeeze and poles dropped from 9.6 s to 2.8 s, with the same results.
