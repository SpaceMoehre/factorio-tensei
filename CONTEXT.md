# Factorio Factory Block Blueprint Tool

A web tool that turns a list of item-rate goals into a packed, belt/pipe-routed, simulated Factorio blueprint.

## Language

**Goal**:
An item and a target production rate (items/minute), independent of how it is produced.
_Avoid_: recipe rate, item goal (when a recipe is implied)

**Recipe Selection**:
The recipe (and building tier) currently chosen to make an item of the Production Chain — a Goal or an ingredient made in the block. Re-choosable without changing the Goal itself — each step has exactly one active Recipe Selection at a time. Multiple recipes may be able to produce the same item; picking among them is a separate concern from stating the Goal.
_Avoid_: baking a fixed recipe into Goal identity

**Production Chain**:
The Goals plus a Sub-Block for every ingredient the user chose to make in the block, each with its Recipe Selection. By default a Goal's ingredients are Train Inputs; making one here adds its step, and its own ingredients become Train Inputs in turn. Each step's rate is its Goal rate (if any) plus what its consumers take.
_Avoid_: recipe tree (it is not always a tree: steps share ingredients)

**Train Input**:
An item the Production Chain does not make but receives by train: an ingredient of a step that the user has not chosen to make here (the default), one no recipe makes, or one a recipe loop would have to make from itself. Train Inputs are what the Side Input carries.
_Avoid_: raw material (a Train Input can be any intermediate)

**Count**:
The number of assembler buildings a Sub-Block needs to meet its Goal's target rate: `ceil(targetRate / ((building.craftingSpeed / recipe.time) * recipe.outputs[item] * 60))`. Rounded up, it leaves headroom: the machines could run a little faster than the plan needs, and do so where one of them cannot get its output away — as far as their inputs keep up (belts from the train with room to spare do, an Internal Path brings only what the plan needs).
_Avoid_: assembler count as a user input (it's derived, not entered)

**Byproduct**:
An output of a Recipe Selection's recipe other than the Goal's target item, produced incidentally by multi-output recipes (e.g. oil-processing). Not tracked as fulfilling other Goals in v1 — unconsumed overflow.
_Avoid_: treating byproducts as satisfying other Goals automatically

**Fuel**:
The item a burner machine burns, treated as one more input of its Sub-Block, at the rate its power draw requires. Only machines take fuel; inserters are always electric.
_Avoid_: fuel for inserters (burner inserters are never used)

**Modules**:
The modules a step's buildings hold — speed, productivity and efficiency modules, and for Py farms the plants and animals that make them work. Chosen per step of the Production Chain; they set its Count and power draw, and the blueprint asks for them in every one of its machines.
_Avoid_: beacons (not modelled)

**Sub-Block**:
The rectangular unit of `count` assemblers (plus internal belts/inserters) built to satisfy one Goal's Recipe Selection. Its machines may stand in one or more rows; facing rows can share the belts between them. It is built from one Module, or from Copies of one Module (and a smaller Module for the machines left over). The layout search chooses the arrangement.
_Avoid_: block (ambiguous with Compound Block)

**Module**:
A Sub-Block's machines — all of them, or a share that is repeated — with their inserters, belts and pipes, laid out and routed on their own: every belt enters on its west edge and leaves on its east edge, every fluid reaches its west edge (an input) or its east edge (an output). Each Sub-Block is designed as Modules first, from the leaves of the Production Chain up; the Compound Block only places them and links them. A huge Sub-Block repeats one Module, sized so its busiest belt is used up and the stack of its Copies comes out about square: pairs of short rows facing the belt between them rather than one long row.
_Avoid_: chunk, tile (a tile is one grid square)

**Copy**:
One placement of a Module in the Compound Block. A Sub-Block's Copies stack; every second one is the Module routed the other way round, so a belt the Module does not use up snakes from Copy to Copy, turning beside the stack. A Copy drops the belt it does not need: before its first inserter where nothing feeds it, after its last where nothing takes it on.
_Avoid_: instance (code word), clone

**Link**:
A belt (or pipe) routed in the Compound Block between Modules: from a Copy's exit to the next Copy's entry along one route, from the train's edge to a Copy, or from a Copy to the train. Only Links are routed when Modules are placed.
_Avoid_: connector, wire (wires join poles)

**Side Belt**:
A belt along the west or east side of a machine standing alone in its row, one or two tiles out, its inserters against the machine; one Side Belt runs down as many machines of a stack as it can feed, crossing the bands between them underground. Machines whose belts above and below cannot bring them enough take more from Side Belts; the machine stands apart from the next to make room.
_Avoid_: side input (that is the train's)

**Head-on Belt**:
A belt meeting a machine's west or east side square on: an input arrives from the west and ends against the machine, an output starts against it and leaves east. 90° fast inserters stand either side of its end tile and long-handed ones beside the next tile, reaching the machine two tiles away and the belt beside them, so an output fills both lanes. Since it ends (or starts) its belt, a machine has one only where it gets a belt of its own.
_Avoid_: dead-end belt

**Compound Block**:
The full packed layout combining every Sub-Block for the current set of Goals, plus poles, inter-block belts/pipes, and side input/output paths.
_Avoid_: factory, blueprint (Blueprint is the exported artifact, not the layout)

**Dependency Order**:
The order of Sub-Blocks derived by topologically sorting on item overlap (Sub-Block A precedes B if A's recipe output is one of B's recipe inputs): the order they are designed in (the leaves of the Production Chain first) and the order a belt visits its consumers in. Placement follows the same direction — producers west of what they feed — so belts flow one way.
_Avoid_: input order, list order

**Compactness**:
What the layout search minimizes when comparing valid Compound Blocks: the bounding-box area (width × height), with the number of entities breaking ties. A layout whose machines get their full inserter throughput always ranks above one whose inserters fall short, whatever its Compactness.
_Avoid_: size, footprint (ambiguous between area and entity count)

**Band**:
The rows of belts beside a row of machines, counted outward from the machines' face (row 1 against the machines). Inserters stand in rows 1 and 2 and reach belts up to row 4. A long-handed inserter reaches no further than it must (custom vectors): its belt, and the machine's nearest tile. Two facing machine rows share the band between them: both reach its belts. A machine row's belts spread over both its faces first: all of one face's inserters stand in one row of tiles (90° ones with their belt tiles beside them), so two busy belts on one face starve where one on each face does not.
_Avoid_: lane (a Lane is one side of a belt), belt row index without saying which face it counts from

**Placement**:
Arranging the Copies of every Module into the Compound Block. Belts run west to east through Modules, so each Sub-Block stands west of the ones it feeds, the Goals furthest east; each sits level with the entries it feeds, as far east as its consumers allow, sliding west, up or down around those already placed, keeping clear of the rows other Sub-Blocks' Side Inputs arrive on. Beside a stack of Copies stays room for the belts turning between them and the pipes joining them. The layout search chooses the corridors and gaps.
_Avoid_: grid layout (implies uniform cells), fixed margins

**Squeeze**:
Taking out a row or column of the routed Compound Block that holds nothing but belts or pipes running straight across it and empty tiles; everything beyond moves in by one, belts and tunnels get shorter. Placement leaves room generously; squeezing takes back what the Links did not use. Poles are placed after.
_Avoid_: compaction (ambiguous with Compactness)

**Internal Path**:
A belt or pipe between two Sub-Blocks A→B, carrying whichever item(s) A's Recipe Selection outputs that B's Recipe Selection also needs as input. Items travel on belts, fluids in pipes. When several Sub-Blocks consume A's output, one path visits them in Dependency Order. Between two Sub-Blocks it runs on as many Parallel Belts as both ends split into, decided from the plan alone: each belt links a run of A's machines to a run of B's.
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
One of a belt's two sides, each carrying half the belt's throughput. The game puts a dropped item on the lane on the side of the belt's centre line its drop point lies (right on the line: the right lane, as the belt sees it; on an underground belt's hood: its belt). Straight inserters without custom vectors drop onto the lane farther from them, so a machine fills one lane and a belt fed from one side carries at most half a belt: as many machines as fit a lane on each side of it (five machines making 180/min each cannot fill one 900/min belt — three of them share a lane). With custom vectors (90° inserters switched on) every output inserter's lane is its Drop Offset's, so one row of machines, a Side Belt and a Head-on Belt fill both lanes, and a belt takes as many machines as fill it.
_Avoid_: treating a belt as one undivided stream

**Drop Offset**:
Where in its target tile an inserter drops: Inserter_Config sets it on a 3×3 grid, and it decides the drop's Lane. The module sets every output inserter's: a quarter tile off a straight belt's centre line, or a quarter tile toward a curve's inner corner (inner lane) or outer corner (outer lane) — the middle of a curve has no predictable lane. On a single-item belt the drops go left and right in turn — the lane its inserters fill less so far — unless one lane lets the belt carry more of what its machines make at full speed (each machine its share of its output: a Two-Way Output's row splits between its two belts as far as its inserters on each allow); then any drop moves over that lets the belt carry more. A lane fills by whole inserters, so a belt gets enough of them to split onto its two lanes and carry what its rows make: seven straight fast inserters move 1008/min, but four on one lane fill it (450) and three leave the other at 432; a full 900/min belt takes eight.

**Belt Merge**:
Putting two items on one belt, one per Lane. Eligible only when both items already travel the same route (the same Side Input path feeding the same Sub-Blocks in the same order) — not any two unrelated belts — and only when each item's rate fits within one Lane. Parallel belts are judged per part: two single-item Side Inputs of one Sub-Block, each split into parallel belts, may share each part's belt when each item fits its Lane for the rows that belt feeds.
_Avoid_: merging belts that don't share a route

**Parallel Belts**:
One item on several belts, each serving some of a Sub-Block's machine rows with its share of the rate — when one belt cannot carry it all. A Side Input taken by one Sub-Block and an output nothing else takes split between the train and that Sub-Block, one belt chaining as many Copies' parts as it can carry; an Internal Path from one Sub-Block to one other runs on as many belts as its rate, its producer's lanes and its consumer's machines need (a belt feeds no more consumer machines than it carries for; no more belts than either end has machines), each taking a run of the producer's parts to a run of the consumer's: the consumer's runs about equal by machines, the producer's making about what each takes. A Side Input one belt cannot carry to all its consumers comes as its own route to each.
Two belts of one Internal Path that bring their consumers too little and too much pass through a Splitter on the way; where no pairing does, the producers' end may have one belt more (two merge into one) or one fewer (one forks into two) than the consumers' end.
_Avoid_: merging parts on one belt (a part's belt carries one run of producers)

**Splitter**:
Two belts of one Internal Path side by side through a splitter between the producers and the consumers, lane to lane: 2 to 2, each consumer run gets what it takes from both belts' supply, so a belt of three producers' parts and a belt of one no longer starve the run fed by the one (paired greedily, the belt short the most with the partner that makes the Path Flow deliver the most); 2 to 1, a second producers' belt ends in it and both carry on as one; 1 to 2, one producers' belt feeds two consumer runs, shared by what each takes. Where no splitter fits, the belts go straight on.
_Avoid_: balancer (only pairs are joined)

**Two-Way Output**:
A machine row dropping its output onto belts in both bands beside it, so a belt may take part of a row: nine machines fill six belts in rows of one, a belt taking a machine's whole output and half the next one's. The split is not fixed: an output inserter whose lane is full waits, so the machine's output goes to whichever belt has room (Path Flow). Rows are cut into belts so each belt can bring its consumers what they take, each row planned to give each of its belts a share (its load), its inserters sized for it; the short row stands where that works. A band between two rows holds a belt row for each row's half, or one both rows reach. Tried only where an Internal Path's belts cannot take a whole row each. Machines standing alone in their rows may also put the half rows two tiles out (straight inserters), clear of the inserter row, so each belt runs straight past its drops.
_Avoid_: splitting one machine's output with a splitter

**Path Flow**:
What an Internal Path's belts deliver, as a max-flow: each producer machine makes up to its full rate (the Count's headroom, as far as its inputs keep up; together no more than the plan), its output inserters put up to their rate on the lanes their drops reach (a Drop Offset the module still sets, either; a drop onto the middle of a curve, the worse lane), each lane carries half a belt, Splitters join belts lane to lane, and each belt brings its run of consumers what they take. In the game backpressure settles on this: an inserter waits while its lane is full, a machine waits while its output is stuck, so items go wherever there is room. Designs are ranked by it before routing (from where their inserters drop) and after (from the lanes the routed belts give), and the Compound Block groups producers into belts, pairs them through Splitters and sets each belt's supply by it.
_Avoid_: fixed shares per machine; summing what each belt carries on its own

**Refinement**:
Once a layout stands, each Sub-Block is slid 8, 4, 2 or 1 tiles every way, its box free to reach into a neighbour's empty corner (its entities never landing on another's), the Links routed again; a slide that shrinks the Compound Block is the new best, refined in turn. The search keeps trying other designs and placements after.
_Avoid_: compaction (that is Squeeze)

**Pipe Row**:
A row of a Band kept for one fluid's pipe, joining every connection of that fluid in the Band. A connection elsewhere in the Band dives under the belts to a tap just before the Pipe Row. Pipe Rows of one fluid in different Bands join in a riser beside the Sub-Block.
_Avoid_: pipe lane (a Lane is one side of a belt)

**Service Row**:
A row of a Band with no belt in it, left open so pipes can run between machines; long-handed inserters reach over it. The layout search leaves one wherever that is more compact.
_Avoid_: gap, spacer

**Minimal Pole Placement**:
The fewest poles of the chosen pole type (by default the one with the largest supply area) that fully cover every building's footprint and stay wire-connected as one network — computed from the Compound Block's real footprint and the pole's real supply/wire-reach, not a fixed step size or fixed canvas bounds. Scales to huge (modded) buildings because it's footprint-driven, not hardcoded.
_Avoid_: fixed-step pole grid

**Starvation**:
A Sub-Block's demand isn't met because, walking an edge's consumers in belt order (closest to source first), remaining Lane throughput — or the producer's output, if lower — drops below that Sub-Block's demand before reaching it, even if the edge's total capacity ≥ total demand summed naively. Checked per edge (Internal Path / Side Input / Side Output, including Belt Merge lanes), not as one global demand-vs-supply sum. What a producer can put on a belt is counted per lane: each machine drops on the lanes its inserters reach, each lane carries half a belt (Path Flow). A machine also starves when its inserters for an item cannot move as much as it needs.
_Avoid_: aggregate demand ≤ aggregate supply (ignores belt order and per-edge capacity)

**Blueprint**:
The exported artifact for a Compound Block, provided two ways: the real importable Factorio string (`"0" + base64(zlib_deflate(JSON))`, paste-ready in-game) as the primary output, and the underlying raw JSON available alongside it for inspection/debugging.
_Avoid_: JSON-only export (not usable in-game)
