---
status: superseded by ADR 0003
---

# Tunnels always take the underground entity's maximum reach, not the minimal clearing distance

When a belt/pipe path needs to go underground, it always consumes the tunnel entity's maximum reach in one hop rather than computing the shortest distance needed to clear the obstacle. This is deliberate, not wasteful: it makes tunneling available unconditionally as a compaction primitive (e.g. an inserter placed directly against its assembler, with a pole on the same tile-line, relies on the feeding belt always being able to tunnel underneath both) instead of only when the gap happens to be small. Don't "optimize" this to minimal-distance tunneling — it would break the compaction cases that depend on guaranteed max-reach hops.
