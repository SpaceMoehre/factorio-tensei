# Factorio Factory Block Blueprint Tool

A web tool that turns a list of item-rate goals into a packed, belt/pipe-routed, simulated Factorio blueprint.

## Language

**Goal**:
An item and a target production rate (items/minute), independent of how it is produced.
_Avoid_: recipe rate, item goal (when a recipe is implied)

**Recipe Selection**:
The recipe (and building tier) currently chosen to fulfill a Goal. Re-choosable without changing the Goal itself — a Goal has exactly one active Recipe Selection at a time. Multiple recipes may be able to produce the same item; picking among them is a separate concern from stating the Goal.
_Avoid_: baking a fixed recipe into Goal identity

**Count**:
The number of assembler buildings a Sub-Block needs to meet its Goal's target rate: `ceil(targetRate / ((building.craftingSpeed / recipe.time) * recipe.outputs[item] * 60))`.
_Avoid_: assembler count as a user input (it's derived, not entered)

**Byproduct**:
An output of a Recipe Selection's recipe other than the Goal's target item, produced incidentally by multi-output recipes (e.g. oil-processing). Not tracked as fulfilling other Goals in v1 — unconsumed overflow.
_Avoid_: treating byproducts as satisfying other Goals automatically

**Fuel**:
The item a burner machine burns, treated as one more input of its Sub-Block, at the rate its power draw requires. Only machines take fuel; inserters are always electric.
_Avoid_: fuel for inserters (burner inserters are never used)

**Sub-Block**:
The rectangular unit of `count` assemblers (plus internal belts/inserters) built to satisfy one Goal's Recipe Selection. Its machines may stand in one or more rows; facing rows can share the belts between them. The layout search chooses the arrangement.
_Avoid_: block (ambiguous with Compound Block)

**Compound Block**:
The full packed layout combining every Sub-Block for the current set of Goals, plus poles, inter-block belts/pipes, and side input/output paths.
_Avoid_: factory, blueprint (Blueprint is the exported artifact, not the layout)

**Dependency Order**:
The preferred placement order of Sub-Blocks, derived by topologically sorting on item overlap (Sub-Block A precedes B if A's recipe output is one of B's recipe inputs), so belts generally flow one direction. It is a preference the layout search usually follows, not a rule: a more compact layout may place a consumer beside its producer instead.
_Avoid_: input order, list order

**Compactness**:
What the layout search minimizes when comparing valid Compound Blocks: the bounding-box area (width × height), with the number of entities breaking ties. A layout whose machines get their full inserter throughput always ranks above one whose inserters fall short, whatever its Compactness.
_Avoid_: size, footprint (ambiguous between area and entity count)

**Band**:
The rows of belts beside a row of machines, counted outward from the machines' face (row 1 against the machines). Inserters stand in rows 1 and 2 and reach belts up to row 4. Two facing machine rows share the band between them: both reach its belts.
_Avoid_: lane (a Lane is one side of a belt), belt row index without saying which face it counts from

**Packing**:
Arranging Sub-Block rectangles into the Compound Block. The layout search chooses each position and the width of each gap (down to none where no path must pass), and neighbours may share a belt when one's output is the other's input.
_Avoid_: grid layout (implies uniform cells), fixed margins

**Internal Path**:
A belt or pipe between two Sub-Blocks A→B, carrying whichever item(s) A's Recipe Selection outputs that B's Recipe Selection also needs as input. Items travel on belts, fluids in pipes. When several Sub-Blocks consume A's output, one path visits them in Dependency Order.
_Avoid_: hardcoded path items unrelated to the configured Goals

**Side Input**:
The train-fed path carrying every item some Sub-Block needs but no Sub-Block in the Compound Block produces (raw materials/imports).
_Avoid_: hardcoded raw item list

**Side Output**:
The train-bound path carrying every Goal's target item not consumed internally by another Sub-Block, plus unconsumed Byproducts (the Compound Block's final products).
_Avoid_: hardcoded output item list

**Tunnel**:
An underground belt (or pipe-to-ground) segment, used (1) reactively, whenever a path's straight route would cross a tile occupied by something it isn't connecting to, and (2) proactively as a compaction primitive — an inserter can sit directly adjacent to its assembler with a pole on the same line, because the feeding belt or pipe tunnels underneath both. Each hop's length, up to the underground entity's maximum reach, is chosen by the layout search for compactness.
_Avoid_: tunnel as purely a crossing-avoidance fallback (it's also a compaction tool); a fixed hop length

**Lane**:
One of a belt's two sides, each carrying half the belt's throughput. Output inserters drop only onto the far lane, so a Sub-Block's output belt carries at most half a belt.
_Avoid_: treating a belt as one undivided stream

**Belt Merge**:
Putting two items on one belt, one per Lane. Eligible only when both items already travel the same route (the same Side Input path feeding the same Sub-Blocks in the same order) — not any two unrelated belts — and only when each item's rate fits within one Lane.
_Avoid_: merging belts that don't share a route

**Service Row**:
A row of a Band with no belt in it, left open so pipes can run between machines; long-handed inserters reach over it. The layout search leaves one wherever that is more compact.
_Avoid_: gap, spacer

**Minimal Pole Placement**:
The fewest poles of the chosen pole type (by default the one with the largest supply area) that fully cover every building's footprint and stay wire-connected as one network — computed from the Compound Block's real footprint and the pole's real supply/wire-reach, not a fixed step size or fixed canvas bounds. Scales to huge (modded) buildings because it's footprint-driven, not hardcoded.
_Avoid_: fixed-step pole grid

**Starvation**:
A Sub-Block's demand isn't met because, walking an edge's consumers in belt order (closest to source first), remaining Lane throughput — or the producer's output, if lower — drops below that Sub-Block's demand before reaching it, even if the edge's total capacity ≥ total demand summed naively. Checked per edge (Internal Path / Side Input / Side Output, including Belt Merge lanes), not as one global demand-vs-supply sum. A machine also starves when its inserters for an item cannot move as much as it needs.
_Avoid_: aggregate demand ≤ aggregate supply (ignores belt order and per-edge capacity)

**Blueprint**:
The exported artifact for a Compound Block, provided two ways: the real importable Factorio string (`"0" + base64(zlib_deflate(JSON))`, paste-ready in-game) as the primary output, and the underlying raw JSON available alongside it for inspection/debugging.
_Avoid_: JSON-only export (not usable in-game)
