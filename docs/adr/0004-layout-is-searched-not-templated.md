---
status: accepted
---

# Layouts are found by search, not stamped from templates

v1 builds each Sub-Block from one fixed template (belt rows at set distances, inserters in set columns, fixed margins between Sub-Blocks) and patches failures with static fallbacks. That caps what fits — at most 4 belt rows per Sub-Block, one machine row — and it can't trade one layout choice against another. The layout is instead an anytime search: it varies machine rotation and rows, belt and inserter placement (up to 4 belts per side, 90° inserters, tunnels under inserters and poles), gaps, Sub-Block positions and routing order. It fully builds and validates each candidate and keeps the one with the best Compactness (area, then entity count) within a time budget. Don't reintroduce fixed layout rules to make a case work; add it as an option the search can choose.
