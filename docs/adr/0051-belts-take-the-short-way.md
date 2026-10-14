---
status: accepted — refines ADR 0021, ADR 0026 and ADR 0050
---

# Belts take the short way after a splitter and once pipes are buried

The user saw, in Py aramid at 900/min in a 236 × 236 City Block of roboports, a lane leave a Fan-out's splitter and turn three times (270°) into a tunnel. No tunnel was needed there, or one turn the other way would have done.

Two causes, both found at 24 machines, which had three such loops:

- **Pipes buried after the belts were routed.** Links are routed while every pipe is a plain pipe on the surface. A belt sent off a splitter, two plain pipe columns between it and its entry, could only tunnel under them heading east. It had to turn three times to head east with a tile to dive from. Burying (ADR 0021) then took the pipes underground, and the loop stayed round tiles that were now empty.
- **The splitter spot nearest the entry first, whatever its belt sent off costs.** Only a few spots are tried per entry (`FAN_TRIES`), in order of nearness. A splitter whose side sent off faced a Fixture made that belt loop round under it, while one facing east a tile on would have fed it with one tunnel.

What changed:

- **Belts straightened once the block is finished** (compact.js `straightenBelts`, after `buryPipes`). Each belt's stretches between anchors are routed again on the finished block, from the same tile and heading to the same tile and heading. The anchors are its ends, splitters, tiles an inserter picks from or drops on (validity.js `inserterTiles`), and tiles where another belt feeds it. A new route is kept where it costs less, counting tiles, turns and tunnels as the router does (router.js `legCost`). Belts and tunnels keep both lanes as they are, and no new tile is fed or reached.
  Poles are placed after. Where a straightened belt took the only tile a pole could power an inserter from, the block is powered as buried, unstraightened (compact.js `finishBlock`).
- **Spots ranked by the belt they send off** (compose.js `routeFan`, `FAN_RANKED`). The first 8 usable spots for each entry are tried in the order of their belt sent off: its tiles, turns and tunnels to the entry. Ties keep the order of nearness. The rest follow as before.

| Py aramid, 24 machines, one try | Before | After |
|---|---|---|
| Loops after a splitter (270° or more) | 3 | 0 |
| Entities | 2,710 | 2,663 |
| Seconds to the layout | 49 | 26 |
| Valid, starving | yes, 0 | yes, 0 |

Py small parts in 100 × 100: 600/min both ways.

Still:
- Links are routed before pipes are buried, so they still find their way round pipes that go underground later. Straightening takes the loops out after; it never moves an anchor, so a splitter stays where it stood.
