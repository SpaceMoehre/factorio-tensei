---
status: accepted — refines ADR 0030 and ADR 0035
---

# Designs tried again, belts bringing what rides along, Recycled Byproducts within a lane

Py aramid at 600/min, with 77 items made here (none in a City Block), failed with `tpa: liquid-nitrogen: cannot connect 9,1`. Once that was fixed, its layout starved 475/min.

- **A design is tried again with other random numbers** (`designStep`, design.js). The tpa Sub-Block's 5 rectisols failed to route on every candidate with 2 of 5 seeds, and the build failed with them. Where no candidate routes, the Sub-Block is now designed again with new random numbers, up to 3 more times, before the LayoutError stands.
- **A belt brings what rides along with what its consumers take** (`wantOf`, compose.js). An Internal Path's belt is planned to bring what its consumers take, its items scaled to that. The sodium hydroxide belts to the aramid also carry limestone on its way to the lime's feedback splitter. That limestone was counted against the sodium hydroxide, so the belts were planned for 2/3 of it, and 250/min short. A belt's want now grows by what rides along in step with what its consumers take. A path sorting a byproduct out is unchanged.
- **A solid Recycled Byproduct only within a lane** (`expandChain`'s `belt`). The feedback is tapped off one of its producer's output belts. Where the producer's solids need more than one lane, the byproduct is spread over several belts. A tap on one of them feeds part of it; the rest runs on into consumers that never take it, which would clog in the game. A solid is now fed back only where one lane of the chosen belt carries all the solids its step makes. Py sodium hydroxide's limestone is fed back at 60/min (90 items a minute) but not at 750/min (1125), where limestone comes by train and the sodium hydroxide's limestone leaves by train. The Production Chain follows the belt chosen.

Py aramid at 600/min: starving 50/min, not 475 (after failing). What is left: 8 sodium hydroxide plants on 2 belts sorting their limestone out, for 5 aramid machines (400 a minute for 450), where the Fan-out evening them out found no room.

Still: a feedback fed from several output belts (a splitter on each, side-loading one belt) would keep a busy step's byproduct in the block. It is not built.
