---
status: accepted — supersedes ADR 0002
---

# Tunnel hop length is chosen by the solver

ADR 0002 made every tunnel use the underground entity's full reach. That static rule blocked the layouts it was meant to enable: belts could not dive under the inserters of machines narrower than the reach, and dense multi-fluid machines could not be routed at all. The layout engine now chooses each hop's length — anywhere from just clearing the obstacle up to the entity's maximum reach — as one more decision it searches, keeping whichever valid layout is most compact.
