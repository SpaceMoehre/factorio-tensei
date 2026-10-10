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
The Goals plus a Sub-Block for every ingredient the user chose to make in the block, each with its Recipe Selection. By default a Goal's ingredients are Train Inputs; making one here adds its step, and its own ingredients become Train Inputs in turn. Each step's rate is its Goal rate (if any) plus what its consumers take, a Recipe Loop's included; a machine's productivity counts.
_Avoid_: recipe tree (it is not always a tree: steps share ingredients, and loop)

**Recipe Loop**:
A step's item that a step it feeds — or the step itself — takes again (arqads for arqad eggs that make arqads). The chain sizes every step of the loop so the Goal still leaves on the train and the loop is fed besides (a loop giving back five of every six arqads makes six times its Goal). Its last link, back into the loop, is its feedback: a belt of its own from the producer's output, through a splitter whose output priority is the feedback's side, so the loop never runs short while the rest goes on. A loop that takes more than it makes, or one of fluids, comes by train instead.
_Avoid_: cycle (the chain's word for what comes by train)

**Train Input**:
An item the Production Chain does not make but receives by train: an ingredient of a step that the user has not chosen to make here (the default), one no recipe makes, or a Recipe Loop's that cannot feed itself (a fluid, or one taking more than it makes). Train Inputs are what the Side Input carries.
_Avoid_: raw material (a Train Input can be any intermediate)

**Count**:
The number of assembler buildings a Sub-Block needs to meet its Goal's target rate: `ceil(targetRate / ((building.craftingSpeed / recipe.time) * recipe.outputs[item] * 60))`. Rounded up, it leaves headroom: the machines could run a little faster than the plan needs, and do so where one of them cannot get its output away — as far as their inputs keep up (belts from the train with room to spare do, an Internal Path brings only what the plan needs).
_Avoid_: assembler count as a user input (it's derived, not entered)

**Byproduct**:
An output of a Recipe Selection's recipe other than the Goal's target item, produced incidentally by multi-output recipes (e.g. oil-processing). Not tracked as fulfilling other Goals in v1 — unconsumed overflow, leaving by train unless a Byproduct Use takes it. Where it shares a belt with an item consumers take, a filter splitter right after its producers sorts it out on to the east edge (Splitter).
_Avoid_: treating byproducts as satisfying other Goals automatically

**Recycled Byproduct**:
An ingredient a step would bring by train that another step of the chain makes at least as much of as a byproduct: it comes from that step instead (fed back through a splitter where that closes a loop), what is left over leaving by train (Py's sodium hydroxide gives its lime the limestone it takes; ADR 0035). A solid only where one lane of the chosen belt carries all the solids its step makes (ADR 0039).

**Byproduct Use**:
A step the user adds for a byproduct of a step — a recipe taking it — that takes all of it, sized by what that step makes (Py's iron slime from the hydroclassifiers making iron pulp, to unslimed iron). What it makes leaves by train, unless a Byproduct Use of its own takes it; it never feeds another step nor counts towards a Goal, so its item may also be made by a step of the chain (ADR 0034).
_Avoid_: byproduct recipe (it is a step of the chain), sharing a byproduct among Uses

**Fuel**:
The item a burner machine burns, treated as one more input of its Sub-Block, at the rate its power draw requires. Only machines take fuel; inserters are always electric. Chosen only where a machine of the chain burns an item.
_Avoid_: fuel for inserters (burner inserters are never used)

**Liquid Fuel**:
The fluid a machine burning one burns (Py's glassworks and smelters): one more fluid input of its Sub-Block, at the rate its power draw requires, by train on a pipe of its own into its energy source's box. The user's choice, unless the machine burns one fluid only; chosen only where a machine of the chain burns a fluid.

**Joined Through**:
Machines of a row standing against each other whose box for a fluid has connections on their west and east sides that let it through both ways: their boxes join without a pipe, and the row takes the fluid by one connection, east of its last machine.

**Mirrored**:
A machine standing mirrored (Factorio 2.0): its fluid connections and drop point flipped east to west before it turns. Tried where that puts them where no rotation does, and every second row of Fluids Between.

**Modules**:
The modules a step's buildings hold — speed, productivity and efficiency modules, and for Py farms the plants and animals that make them work. Chosen per step of the Production Chain; they set its Count and power draw, and the blueprint asks for them in every one of its machines.
_Avoid_: beacons (not modelled)

**Sub-Block**:
The unit of `count` assemblers (plus internal belts/inserters) built to satisfy one Goal's Recipe Selection. Its machines may stand in one or more rows; facing rows can share the belts between them. It is built from one Module, or from Copies of one Module (and a smaller Module for the machines left over), standing as one rectangle — but for machines a Breakout stands apart, and in Bands, where it stands in Parts. The layout search chooses the arrangement.
_Avoid_: block (ambiguous with Compound Block)

**Module**:
A Sub-Block's machines — all of them, or a share that is repeated — with their inserters, belts and pipes, laid out and routed on their own: every belt enters on its west edge and leaves on its east edge, every fluid reaches its west edge (an input) or its east edge (an output). Each Sub-Block is designed as Modules first, from the leaves of the Production Chain up; the Compound Block only places them and links them. A huge Sub-Block repeats one Module, sized so its busiest belt is used up and the stack of its Copies comes out about square: pairs of short rows facing the belt between them rather than one long row.
_Avoid_: chunk, tile (a tile is one grid square)

**Copy**:
One placement of a Module in the Compound Block. A Sub-Block's Copies stack; every second one is the Module routed the other way round, so a belt the Module does not use up snakes from Copy to Copy, turning beside the stack. Beside a stack there is room for as many snaking belts as the belt and pipe reach allow (three on Py's yellow belts); where more would snake, an Internal Path's do first, those whose other end has the fewest machines first (one water-barrel machine's belt cannot split into one for every Copy of vrauks paddocks), then outputs, and the rest get a belt per Copy (a Side Input fans out). A Copy drops the belt it does not need: before its first inserter where nothing feeds it, after its last where nothing takes it on. A Two-Way Copy holds the fewest machines that fill some of an Internal Path's belts whole, each dropping onto the belts either side of it (Two-Way Output: 3 bolts factories fill 2 belts for small parts factories): each of its belts out is one of the path's, wanted for the most any of them brings, and runs on to its consumers, not through the other Copies.
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

**City Block**:
The area a Compound Block may be built in instead of standing on its own: the blueprint of a city block — its snap grid (entities shared with the neighbouring city blocks may straddle its border), else the extent of its entities and tiles — or a size given. Its entities are Fixtures. The Compound Block stands inside its Buffer, its Side Input entering on the Buffer's west edge and its Side Output leaving on its east edge, slid as far west as it fits so the Side Input's many belts come in short and only its outputs cross the City Block. It is not squeezed: the Fixtures stay where they are, and so does everything else.
_Avoid_: site (code word), block on its own (ambiguous with Compound Block)

**Fixture**:
An entity of a City Block's blueprint — a pole, roboport, radar, lamp, rail… It stays where it is: nothing of the Compound Block stands on it, though it may stand in a Module's empty tiles or where a machine would (Making Way), and belts and pipes pass round or under it. A Fixture pole powers what lies in its supply area; a City Block's poles are taken as one network already (its blueprint wires them), and the Compound Block's own poles join it. An entity whose footprint the catalog does not know counts as one tile, and the page names it.
_Avoid_: obstacle

**Buffer**:
The tiles kept free inside a City Block's border, on every side, for the belts the user lays to the Side Input and from the Side Output.
_Avoid_: margin (the Compound Block's own rows around it)

**Maximize**:
Finding the highest rate of the Goals whose Compound Block fits the City Block without Starvation, the Recipe Selections, modules and items made here as chosen. The Goals scale together, so the first Goal's machines run at full speed: each try asks for a number of them and runs the layout search until it finds a layout that starves nothing. A try ends at once when a Sub-Block cannot be designed without Starvation, and soon after its structured candidates when none of them fits (one whose first layouts do not fit seldom finds one later). The first try is the most machines the Foretelling says fit; then the bounds close in — after a try that found no room, or the second in a row whose designs starved, no more than halfway down; right after one that starved, the number just below it — and, with no Fixtures in its room, a number whose layout the Foretelling, taught by a layout found, says would span more than the City Block's whole room is not tried. Starvation comes and goes with the Count (how its machines cut into the belts of its Internal Paths), so a number whose designs starve, or none of whose designs without Starvation fits the City Block, bounds the tries only until the whole numbers below it are done: then the one above it is tried, once. Then Filling: from the highest that fit, ten machines more, again while they fit, half as many after each that does not (a number no smaller than the lowest that did not fit counts as not fitting), down to a quarter machine — never held back by the Foretelling. A fractional number runs all the machines but the last at full speed (the other Sub-Blocks need fewer machines than the next whole number's, and machines that starve at full speed may not a little slower). Then Annexes in the room left, while one fits.
_Avoid_: optimize (the layout search optimizes Compactness)

**Annex**:
A second Compound Block of the same chain, smaller, in the room a City Block's layout leaves once the chain grows no further there: each of its Sub-Blocks a Sub-Block of its own (its own dependents too), linked only to its own, its Side Inputs from the west edge and Side Output to the east edge. Laid out with everything built before it as Fixtures (their belts, pipes and tunnels as such, its poles joining theirs), maximized there (one of the first Goal's machines first: none fitting, annexing ends; its room only the stretches one of them fits in with a tile round it; Filling down to one machine, or the cap), and added to the layout; again while one fits. A fluid a built pipe has enough to spare of comes from there (Draw). A fixed rate a City Block does not fit fills up to it so: the highest that fits up to it, then Annexes.
_Avoid_: spill-over, second factory, Part (a Part is one Sub-Block's piece in Bands, linked to the others)

**Draw**:
An Annex's Side Input of a fluid joining a pipe built before it rather than coming from the west edge: a pipe of the train's fluid (from there or the west edge, whichever is nearer), or of one made here whose producers make enough more at full speed than their consumers take (from there only; with too little, the Annex makes it itself). The Annex's pipe becomes part of the route it draws from.
_Avoid_: tap (a Recipe Loop's feedback is tapped off its producers' belt)

**Extension**:
A built Sub-Block of a fluid made here grown, rather than an Annex making that fluid in a small Sub-Block of its own. The last layout with a Sub-Block of the fluid is laid out again, making as much more of it as the Annex takes, with the steps feeding it grown to match. That extra stays on its pipe and does not leave by train. The layouts after it are laid out again as they were, then the Annex, which now draws the fluid from that pipe. This is kept only where all of it fits and the Annex needs fewer Sub-Blocks.
_Avoid_: growing (Filling grows the first Goal's machines)

**Foretelling**:
How much room a Compound Block in a City Block takes, told before it is laid out: each Sub-Block's machines take so many tiles each (at first their building with a band of belts above and below and a column beside it, then what that Sub-Block's last design took), spread out by how loosely the City Block packs them (at first a guess, then what a layout found spans), against the City Block's room (inside the Buffer, less its Fixtures — and the more of its stretches as big as a few machines' Modules its Fixtures break, the less room, since a grid of substations leaves room only for what fits between them). The page tells it with the City Block — about how high a rate fits, and how many tiles the Goals' own rates take — and Maximize tries by it. It knows nothing of designs that starve; only a try tells.
_Avoid_: estimate (says nothing of what it is for), prediction

**Dependency Order**:
The order of Sub-Blocks derived by topologically sorting on item overlap (Sub-Block A precedes B if A's recipe output is one of B's recipe inputs): the order they are designed in (the leaves of the Production Chain first) and the order a belt visits its consumers in. Placement follows the same direction — producers west of what they feed — so belts flow one way.
_Avoid_: input order, list order

**Compactness**:
What the layout search minimizes when comparing valid Compound Blocks, a score in tiles: the strip its bounding box has beyond a square (|width − height| × the shorter side; none in a City Block, whose shape is given), plus its empty tiles (those no machine, inserter or pole stands on: a belt or pipe fills nothing, so belts running round the block never make it look compact), plus 4 for every bend of a belt or pipe (where a belt turns, or a pipe meets its own pipes on both axes); the number of entities breaks ties. Placement grows a block standing on its own toward a square. A layout whose machines get their full inserter throughput always ranks above one whose inserters fall short, whatever its Compactness, then one feeding its Recipe Loops itself above one taking their feedback by train, then one with fewer output inserters at machines with an Output Drop. Its belts' Path Flow and its inserters set the least it can starve before it is placed: a candidate that would starve more than the best is not placed at all.
_Avoid_: size, footprint (ambiguous between area and entity count)

**Band**:
The rows of belts beside a row of machines, counted outward from the machines' face (row 1 against the machines). Inserters stand in rows 1 and 2 and reach belts up to row 4. A long-handed inserter reaches no further than it must (custom vectors): its belt, and the machine's nearest tile. Two facing machine rows share the band between them: both reach its belts. A machine row's belts spread over both its faces first: all of one face's inserters stand in one row of tiles (90° ones with their belt tiles beside them), so two busy belts on one face starve where one on each face does not.
_Avoid_: lane (a Lane is one side of a belt), belt row index without saying which face it counts from

**Placement**:
Arranging the Copies of every Module into the Compound Block. Belts run west to east through Modules, so each Sub-Block stands west of the ones it feeds, the Goals furthest east; each sits level with the entries it feeds, as far east as its consumers allow, sliding west, up or down around those already placed, keeping clear of the rows other Sub-Blocks' Side Inputs arrive on. Beside a stack of Copies stays room for the belts turning between them and the pipes joining them. Machines a Breakout stands apart are placed last, in the gaps. The layout search chooses the corridors and gaps. In a City Block everything stands inside the Buffer, the Goals against its east edge, no belt or pipe on a Fixture and a machine only where it makes way (Making Way; also beside them, against the edges, or anywhere it fits), and a Sub-Block fed by other Sub-Blocks keeping a column west of it for each such link, and a Sub-Block may stand in another's Nook (also in the corners of each Nook, or with one placed already in a corner of its own); where one finds no room, those placed before it try other spots, a few each and far apart (Backtracking); then the whole block slides west as far as it fits. Where a Sub-Block's best design fits few spots between the Fixtures (a grid of substations leaves gaps a Module must fit), the search starts from its design, starving no more, that fits the most. In a City Block the search also tries Layers, and every Sub-Block's narrowest design that routes and stands no taller than the room, all together (stacks of Copies as narrow as keep them within most of its height): side by side in columns they fit where the best designs, squarer, are too wide together.
_Avoid_: grid layout (implies uniform cells), fixed margins

**Layers**:
Placement in a City Block by columns: every Sub-Block in a column, the Goals easternmost and every producer in a column west of all it feeds (up to two columns further west than it must), each column's Sub-Blocks stacked top to bottom (where that is too tall, in each other's Nooks), a column of several keeping a corridor across it for the belts that cross it (a row each, above, between or below them, nearest where those belts arrive), the columns side by side a corridor apart that widens with the belts turning in it. Of the ways to put the Sub-Blocks in columns, the one is taken that fits the City Block — no column taller than its room with a row for every belt crossing it — and spans least; with Fixtures, a column moves on west to where its Sub-Blocks stand clear of them, and where no spot does, its stacks part round them (Parting). Placing Sub-Blocks one by one, from the Goals west, can leave no room for one placed late where columns fit them all.
_Avoid_: columns of copies (a Sub-Block's own stack may stand in several columns: compose.js decides)

**Bands**:
In a City Block whose Fixtures stand in rows, the Production Chain in Parts, each a row or two of machines in a Slot: a run of rows no Fixture stands in across a range of the City Block (it whole, or cut at one of its Fixture columns). The Sub-Blocks with the tallest rows take the tallest Slots first, the Goal fills what is left; small Sub-Blocks stand in the rows a Part's Slot has to spare, or where Placement finds room. Maximize tries it first where its Parts hold many more machines than the Foretelling foretells.
_Avoid_: grid layout, template

**Part**:
One of the pieces a Sub-Block stands in, in Bands: a row or two of its machines in one Slot (two only where a design of two rows fits the Slot; a Slot holds one Part, two of the Goal side by side where whole Parts would not divide among their producers, or two of one row one above the other where its height takes two rows but no design of two fits), designed, placed and linked like a Sub-Block of its own; its Side Input comes on a belt of its own, sent off a line it shares with other Parts (Fan-out). A consumer's Part takes each item from one of its producer's Parts with room for it, the Parts chosen together, those whose links are shortest first; a producer's Parts hold a little more than their consumers need.
_Avoid_: Copy (a Part is designed on its own, not repeated), Breakout

**Slot**:
In Bands, a run of rows no Fixture stands in across a range of the City Block, less the room kept for links beside it (the lowest west of the corridor may lend the Goal's Part most of the corridor's columns, where the Goal does not fit): what one Part stands in.
_Avoid_: cell, gap (any room between things)

**Parting**:
In a City Block, in Layers: a stack of Copies whose belts a Fixture would stand on wherever its column lets it stand parts round the Fixtures. From the top, each Copy moves down as few rows as keep the Fixtures off its belts (no more than its own height and six), the Copies below it with it, so the Fixtures stand in the gaps between Copies; a machine a Fixture stands on makes way as before (Making Way). The stack grows by its gaps and leaves no Nooks; where it then runs past the room, it does not stand there. Only stacks in one column part.
_Avoid_: split stack, gap (the room between Copies, kept as it was elsewhere)

**Nook**:
The room a Sub-Block's box leaves another: beside a Copy narrower than the widest (from a column past its edge, where its Links meet it), above or below a column of Copies shorter than the stack. The rest of the box the Sub-Block needs: its Copies, the room beside them where belts turn and trunks run, the corridors between its columns, the room for a Recipe Loop's splitters. In a City Block another Sub-Block may stand in a Nook: Sub-Blocks are kept a gap apart by the tiles they need, not by their boxes. One the search made room round (Making Room) has no Nook and stands in none.
_Avoid_: hole, gap (a gap is the room Placement keeps between Sub-Blocks)

**Squeeze**:
Taking out a row or column of the routed Compound Block that holds nothing but belts or pipes running straight across it and empty tiles; everything beyond moves in by one, belts and tunnels get shorter. Placement leaves room generously; squeezing takes back what the Links did not use. Poles are placed after. A block in a City Block is not squeezed (its Fixtures cannot move with it).
_Avoid_: compaction (ambiguous with Compactness)

**Internal Path**:
A belt or pipe between two Sub-Blocks A→B, carrying whichever item(s) A's Recipe Selection outputs that B's Recipe Selection also needs as input. Items travel on belts, fluids in pipes. When several Sub-Blocks consume A's output, one path visits them in Dependency Order. Between two Sub-Blocks it runs on as many Parallel Belts as both ends split into, decided from the plan alone: each belt links a run of A's machines to a run of B's.
_Avoid_: hardcoded path items unrelated to the configured Goals

**Side Input**:
The train-fed path carrying every item some Sub-Block needs but no Sub-Block in the Compound Block produces (raw materials/imports). It enters on the Compound Block's west edge (in a City Block, the Buffer's).
_Avoid_: hardcoded raw item list

**Side Output**:
The train-bound path carrying every Goal's target item not consumed internally by another Sub-Block, plus unconsumed Byproducts (the Compound Block's final products). It leaves on the Compound Block's east edge (in a City Block, the Buffer's).
_Avoid_: hardcoded output item list

**Pipe Network**:
The pipe routes of one fluid joined into one: those carrying it to the east edge together, the others (the train's, and those between Sub-Blocks) together, never a Sub-Block's input of it with its output. A route's pipes join one of its network's routed before it (an Annex's, one built before it) where they find a short way; joined, a route to the east edge goes there through theirs.
_Avoid_: a pipe to the train joined with pipes feeding consumers (it would draw off what they take)

**Tunnel**:
An underground belt (or pipe-to-ground) segment, used (1) reactively, whenever a path's straight route would cross a tile occupied by something it isn't connecting to, and (2) proactively as a compaction primitive — an inserter can sit directly adjacent to its assembler with a pole on the same line, because the feeding belt or pipe tunnels underneath both. Each hop's length, up to the underground entity's maximum reach, is chosen by the layout search for compactness. (3) Once the block is routed, three plain pipes or more in a straight line go underground: a pipe-to-ground at each end, nothing between. Plain pipes and pipe-to-grounds are of one material: those of different materials do not connect.
_Avoid_: tunnel as purely a crossing-avoidance fallback (it's also a compaction tool); a fixed hop length; a plain pipe of one material with a pipe-to-ground of another

**Lane**:
One of a belt's two sides, each carrying half the belt's throughput. The game puts a dropped item on the lane on the side of the belt's centre line its drop point lies (right on the line: the right lane, as the belt sees it; on an underground belt's hood: its belt). Straight inserters without custom vectors drop onto the lane farther from them, so a machine fills one lane and a belt fed from one side carries at most half a belt: as many machines as fit a lane on each side of it (five machines making 180/min each cannot fill one 900/min belt — three of them share a lane). With custom vectors (90° inserters switched on) every output inserter's lane is its Drop Offset's, so one row of machines, a Side Belt and a Head-on Belt fill both lanes, and a belt takes as many machines as fill it.
_Avoid_: treating a belt as one undivided stream

**Drop Offset**:
Where in its target tile an inserter drops: Inserter_Config sets it on a 3×3 grid, and it decides the drop's Lane. The module sets every output inserter's: a quarter tile off a straight belt's centre line, or a quarter tile toward a curve's inner corner (inner lane) or outer corner (outer lane) — the middle of a curve has no predictable lane. On a single-item belt the drops go left and right in turn — the lane its inserters fill less so far — unless one lane lets the belt carry more of what its machines make at full speed (each machine its share of its output: a Two-Way Output's row splits between its two belts as far as its inserters on each allow); then any drop moves over that lets the belt carry more. A lane fills by whole inserters, so a belt gets enough of them to split onto its two lanes and carry what its rows make: seven straight fast inserters move 1008/min, but four on one lane fill it (450) and three leave the other at 432; a full 900/min belt takes eight.

**Output Drop**:
Where a machine puts its products itself: a point just beside it that turns with it (the building's `vector_to_place_result`: Py's soil and sand extractors, casting units…), on its drop tile. A belt there takes them on the lane nearer the machine, so its row's output belt runs straight past the drop tiles of its face, with no output inserter: as many machines to a row as their drops fill a lane, whichever the belt passes first — or two rows facing one belt between them, a lane each. Where a row's drops may fill their lane before a machine's turn (one machine making more than a lane: a casting unit's 900 plates a minute on a yellow belt), 90° inserters in the belt's row support it, taking what its drop surely cannot onto the other lane. Nothing but its own output's belt may lie on a drop tile: another belt there would get its products. Designs and layouts with the fewest output inserters at such machines win, starving no more.
_Avoid_: output field, direct insertion (an inserter's is the Drop Offset)

**Belt Merge**:
Putting two items on one belt, one per Lane. Eligible only when both items already travel the same route (the same Side Input path feeding the same Sub-Blocks in the same order) — not any two unrelated belts — and only when each item's rate fits within one Lane. Parallel belts are judged per part: two single-item Side Inputs of one Sub-Block, each split into parallel belts, may share each part's belt when each item fits its Lane for the rows that belt feeds. The blueprint builds a merged Side Input's belt itself, a tile west of the block: each item comes in on a belt of its own from the north and the south, the two meeting head-on, so each lands on its own Lane (ADR 0037).
_Avoid_: merging belts that don't share a route

**Parallel Belts**:
One item on several belts, each serving some of a Sub-Block's machine rows with its share of the rate — when one belt cannot carry it all. A Side Input taken by one Sub-Block and an output nothing else takes split between the train and that Sub-Block, one belt chaining as many Copies' parts as it can carry; an Internal Path from one Sub-Block to one other runs on as many belts as its rate, its producer's lanes and its consumer's machines need (a belt feeds no more consumer machines than it carries for; no more belts than either end has machines), each taking a run of the producer's parts to a run of the consumer's: the consumer's runs about equal by machines, the producer's making about what each takes. A Side Input one belt cannot carry to all its consumers comes as its own route to each (their belts still share belts from the west edge: Fan-out).
Two belts of one Internal Path that bring their consumers too little and too much pass through a Splitter on the way; where no pairing does, the producers' end may have one belt more (two merge into one) or one fewer (one forks into two) than the consumers' end.
_Avoid_: merging parts on one belt (a part's belt carries one run of producers)

**Splitter**:
Two belts of one Internal Path side by side through a splitter between the producers and the consumers, lane to lane: 2 to 2, each consumer run gets what it takes from both belts' supply, so a belt of three producers' parts and a belt of one no longer starve the run fed by the one (paired greedily, the belt short the most with the partner that makes the Path Flow deliver the most); 2 to 1, a second producers' belt ends in it and both carry on as one; 1 to 2, one producers' belt feeds two consumer runs, shared by what each takes. Where no splitter fits, the belts go straight on. A splitter right after a Sub-Block's producers (or a Part's) filters off a byproduct (an item none of its consumers takes: Py's empty barrels, the stone from quartz crushers): that item goes out of its priority side on to the east edge, the rest on to the consumers. Where the byproduct and the rest take more than one belt, each of the Internal Path's belts has a filter splitter of its own, and no splitter joins them; their byproduct belts join one another (side-loading onto a lane with room) on the way to the east edge.
_Avoid_: balancer (only pairs are joined)

**Fan-out**:
A Side Input's belts into the copies of one column, or into several Sub-Blocks that each take it on a route of their own (Parts in Bands, or where one belt cannot carry it to them all) carrying the same items, coming from the west edge on as few belts as carry them all: one line runs past their entries in turn (across Sub-Blocks, the entries in columns: down the first, up the next), a splitter before each sending a belt off into it, and ends in the last; where the line carries less than the next entry takes, another belt from the west edge joins it through that entry's splitter. A splitter stands as near its entry as there is room, facing along the line or east, else (across Sub-Blocks) anywhere a few tiles from it, facing any way. Where no splitter finds room, belts come from the west edge on their own. An Internal Path into Parts of several Sub-Blocks fans out the same way from its producers: one line from where their belt leaves them past every consumer Part's entry, the last taking the line's end; where one line finds no way, a splitter right after the producers starts two, one each way; where neither does, one belt chains them as before.
_Avoid_: balancer; a belt of its own from the train for every copy that takes a fraction of one

**Circuit Wires**:
Red or green wires (or both) putting every pole and inserter of the block on one circuit network, the shortest that join them within reach (an inserter's 9 tiles, a pole's wire reach). A City Block's poles may carry it across. Only the blueprint and the map have them; the layout is the same.

**Inserter Clock**:
What an inserter moves while its machine runs at full speed, as whole items in whole seconds, in lowest terms: into a machine, every item on its belt the machine takes, added up (1 iron and 2 copper in 3 s: 1 in 1 s); out of one, the machine's products. Inserters on one belt into a machine, or out of one machine, share it evenly (two of them: 1 in 2 s each); those supporting an Output Drop share what the drop leaves them. The user gives a clock a signal; its inserters then work while that signal is above 0, a clock circuit outside the block driving it over the Circuit Wires. A clock without a signal leaves its inserters running freely.
_Avoid_: a clock per item (items on one belt add up); the plan's rate (the Count is rounded up, so machines run below full speed)

**Two-Way Output**:
A machine row dropping its output onto belts in both bands beside it, so a belt may take part of a row: nine machines fill six belts in rows of one, a belt taking a machine's whole output and half the next one's. The split is not fixed: an output inserter whose lane is full waits, so the machine's output goes to whichever belt has room (Path Flow). Rows are cut into belts so each belt can bring its consumers what they take, each row planned to give each of its belts a share (its load), its inserters sized for it; the short row stands where that works. A band between two rows holds a belt row for each row's half, or one both rows reach. Tried only where an Internal Path's belts cannot take a whole row each; a Sub-Block too big for one Module of them repeats Two-Way Copies. Machines standing alone in their rows may also put the half rows two tiles out (straight inserters), clear of the inserter row, so each belt runs straight past its drops.
_Avoid_: splitting one machine's output with a splitter

**Path Flow**:
What an Internal Path's belts deliver, as a max-flow: each producer machine makes up to its full rate (the Count's headroom, as far as its inputs keep up; together no more than the plan), its output inserters put up to their rate on the lanes their drops reach (a Drop Offset the module still sets, either; a drop onto the middle of a curve, the worse lane), each lane carries half a belt, Splitters join belts lane to lane, and each belt brings its run of consumers what they take. In the game backpressure settles on this: an inserter waits while its lane is full, a machine waits while its output is stuck, so items go wherever there is room. Designs are ranked by it before routing (from where their inserters drop) and after (from the lanes the routed belts give), and the Compound Block groups producers into belts, pairs them through Splitters and sets each belt's supply by it.
_Avoid_: fixed shares per machine; summing what each belt carries on its own

**Making Room**:
What the search does when a belt cannot be connected: the same candidate is tried again with the Sub-Blocks the link runs between spaced out (padding round each, doubling), then every corridor and gap widened too, until it connects or no longer fits.
_Avoid_: giving a candidate up because one link found no way

**Making Way**:
In a City Block, a Fixture standing where a machine of a Sub-Block would: that machine and its inserters are left out of their Copy, and as many machines are added elsewhere, so the Sub-Block keeps its Count — on the end of its core's last row where that has room, else standing apart, downstream of the stack as a Breakout's do (together, else each on its own, in the order their belt visits them); the Copy's belts run on past the gap. Never where the Fixture would stand on a belt, a pipe or anything else of the Copy, and for no more than a tenth of a Sub-Block's machines. Placement weighs each machine left out as the room of four; the layout is then built again with those machines left out, every Sub-Block where it stood, and where it fails, tried with every Fixture kept off the machines.
_Avoid_: building round a Fixture (what Placement did before), hole

**Strategy**:
How the layout search picks its candidates. Search places the Sub-Blocks tightly from the start and varies that. Spread places them a wide buffer apart first, so their links find room, then ever tighter, then packs the smaller Sub-Blocks beside the biggest. A build runs every strategy at once, each in a web worker of its own, from the same designs (each Sub-Block designed in a worker of its own first), and keeps the best layout any finds.
_Avoid_: algorithm, mode

**Refinement**:
Once a layout stands, each Sub-Block is slid 8, 4, 2 or 1 tiles every way, its box free to reach into a neighbour's empty corner (its entities never landing on another's), the Links routed again; a slide that shrinks the Compound Block is the new best, refined in turn. Breakouts take turns with the slides, and the machines they stand apart take their next best spots or slide on their own. The search keeps trying other designs and placements after.
_Avoid_: compaction (that is Squeeze)

**Breakout**:
Some of a Sub-Block's machines taken out of its rectangle, so the rest packs smaller, each standing apart in a gap of the Compound Block: one machine (of repeated Modules, the one for the machines left over, else one Copy), and where that packs no looser before routing, two or three together or each alone. Its machines left and those broken out are Modules of their own, designed like any other (the rest cutting an Internal Path into as many parts as the whole Sub-Block would, each broken-out machine joining one); they stand apart last in Placement, where they grow the block least and their Links run shortest, clear of the corridors other Links take, with a corridor and a column per belt between them and what they link to. Their belts chain like a neighbour's, downstream of the rest: a belt runs on from the rest through them, never back. Tried on every new best, one Sub-Block at a time, a trial after every two slides (never for a lone Sub-Block, which has no gaps); a trial is routed only where it packs no looser than the best before routing.
_Avoid_: detach (code word), split (Parallel Belts split a route)

**Pipe Row**:
A row of a Band kept for one fluid's pipe, joining every connection of that fluid in the Band. A connection elsewhere in the Band dives under the belts to a tap just before the Pipe Row. Pipe Rows of one fluid in different Bands join in a riser beside the Sub-Block. Pipe Rows of two fluids keep a row between them, except Between, where each dives under the other's connections.
_Avoid_: pipe lane (a Lane is one side of a belt)

**Fluids Between**:
Two rows of machines facing each other across a Band of their fluids' Pipe Rows, the second row the first's mirror image (turned half round and Mirrored), so each fluid's connections meet column for column. Their belts lie outside the pair (one Pipe Row per fluid, side by side), or between the Pipe Rows nearest the machines on either side. Pairs stack, the Band between two of them only as tall as their shared belts (none: they stand against each other). One row may stand so too, its Pipe Rows either side of its belts. Routed with no margin first: each fluid comes in straight along its row.
_Avoid_: sandwich, back to back

**Service Row**:
A row of a Band with no belt in it, left open so pipes can run between machines; long-handed inserters reach over it. The layout search leaves one wherever that is more compact.
_Avoid_: gap, spacer

**Minimal Pole Placement**:
The fewest poles of the chosen pole type (by default the one with the largest supply area) that fully cover every building's footprint and stay wire-connected as one network — computed from the Compound Block's real footprint and the pole's real supply/wire-reach, not a fixed step size or fixed canvas bounds. Scales to huge (modded) buildings because it's footprint-driven, not hardcoded. In a City Block, what its Fixture poles power needs no pole, the poles stand inside the Buffer, and they join the Fixture poles' network (two poles wire within the shorter reach of the two).
_Avoid_: fixed-step pole grid

**Starvation**:
A Sub-Block's demand isn't met because, walking an edge's consumers in belt order (closest to source first), remaining Lane throughput — or the producer's output, if lower — drops below that Sub-Block's demand before reaching it, even if the edge's total capacity ≥ total demand summed naively. Checked per edge (Internal Path / Side Input / Side Output, including Belt Merge lanes), not as one global demand-vs-supply sum. What a producer can put on a belt is counted per lane: each machine drops on the lanes its inserters reach, each lane carries half a belt (Path Flow). A machine also starves when its inserters for an item cannot move as much as it needs.
_Avoid_: aggregate demand ≤ aggregate supply (ignores belt order and per-edge capacity)

**Blueprint**:
The exported artifact for a Compound Block, provided two ways: the real importable Factorio string (`"0" + base64(zlib_deflate(JSON))`, paste-ready in-game) as the primary output, and the underlying raw JSON available alongside it for inspection/debugging. Built in a City Block from its blueprint, it is that blueprint — entities, tiles, wires, snap grid — with the Compound Block added.
_Avoid_: JSON-only export (not usable in-game)
