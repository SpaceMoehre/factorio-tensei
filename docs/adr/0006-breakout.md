---
status: accepted — refines ADR 0005
---

# Machines may stand apart from their Sub-Block (Breakout)

Sub-Blocks placed as rectangles leave gaps wherever their heights and widths differ, and the gaps cannot be filled. Bending a Sub-Block, or rotating single machines in place, would mean routing Modules inside the Compound Block again, which ADR 0005 rules out. Instead, the search tries breaking machines out of a Sub-Block. Its machines left and the ones broken out each become Modules of their own, designed and routed on their own like any other. The broken-out Modules are placed last, each in a gap, and only their Links are routed.

The rest keeps an Internal Path's parts, as many as the whole Sub-Block would have. Each broken-out machine's belt joins one of those parts, downstream of the rest, never back into it. Both ends of the path therefore still cut it into the same number of belts.

Trials run as part of Refinement, one after every two slides: one machine of each Sub-Block first, and more of a Sub-Block's machines only where breaking out one of them packs no looser. A trial is routed only when it packs no looser than the best before routing and its belts' Path Flow starves no more. Don't make broken-out machines a separate Sub-Block: they share its plan, its Count and its routes.
