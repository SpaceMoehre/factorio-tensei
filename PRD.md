---
name: factorio-factory-block-blueprint-tool
description: Factorio factory block blueprint generator with dynamic sub-blocks, belt/pipe routing, simulation, and browser-tested UI.
metadata:
  type: project
  status: v2 (dynamic layout search) implemented
---

# Factorio Factory Block Blueprint Tool — PRD

## Goal
Create a web-based support tool that generates compact Factorio blueprints for complete factory blocks from a user-programmed recipe list (like FactoryPlanner).

See `CONTEXT.md` for the domain glossary (Goal, Sub-Block, Compound Block, Tunnel, Starvation, etc.) and `docs/adr/` for the non-obvious design decisions below.

## Requirements (from /grilling agreement, revised via /grill-with-docs)
- Predefined Factorio recipe catalog. Custom/mod entity definitions (user-defined recipes/buildings merged into the catalog) are **deferred to a later iteration** — v1 uses the predefined catalog only.
- Dynamic 2D packing of Sub-Blocks by real computed footprint (not a fixed-size grid cell), ordered via a dependency graph (topological sort on item overlap) — Sub-Blocks with no dependency relation pack independently.
- Assembler `count` per Sub-Block derived from real recipe/building throughput: `ceil(targetRate / ((building.craftingSpeed / recipe.time) * recipe.outputs[item] * 60))`. Multi-output recipes produce untracked Byproducts on other outputs.
- Internal/Side Input/Side Output belt & pipe paths carry the actual items implied by the configured Goals and Recipe Selections (not hardcoded item lists); solid vs. fluid chosen per item.
- Auto tunnel placement: reactive (crossing an occupied tile) and proactive (compaction — inserter placed directly against its assembler, pole on the same line, belt tunnels underneath). v1 makes every hop use the underground entity's maximum reach (ADR 0002); v2 lets the search choose the hop length (ADR 0003).
- Belt merging: only for items that already share a route (same edge), one item per Lane, when each item's real flow rate fits within one Lane.
- Minimal electricity pole placement: fewest poles (preferring largest-coverage type) that cover every building's footprint and stay wire-connected, computed from real footprint + real pole data — not a fixed step/canvas size. Scales to huge (modded) buildings.
- Client-side JS simulation that detects Starvation per edge, walking consumers in belt order so a downstream Sub-Block can starve even when aggregate capacity looks sufficient (see ADR 0001).
- Factorio blueprint export: real importable blueprint string (`"0" + base64(zlib_deflate(JSON))`), with the underlying raw JSON also available.
- Pan/zoom map-style preview of the Compound Block (not a static fixed-size SVG) — renders real per-Sub-Block dimensions and positions.
- Side input path (train) and output path (to train), per the Side Input/Output glossary definitions.

## v2: dynamic layout search (implemented)
v1 stamps a fixed template per Sub-Block. v2 replaces that with a search over layout variants that keeps the most compact valid Compound Block (ADR 0004). Where v2 differs from the requirements above, v2 wins.

- **Search:** an anytime search in a background worker. The default budget is about 10 s, the user can change it, and a Stop button keeps the best layout so far. The map shows the best layout found so far and its area.
- **Objective:** minimise Compactness — bounding-box area first, entity count as tie-break. A candidate counts only if it passes every validity rule the v1 tests check: no overlaps, connected belts and pipe networks, no fluid mixing or fused networks, and powered, connected poles.
- **Per Sub-Block, the search chooses:**
  - machine rotation;
  - one machine row or several stacked rows (chains), each row as long as its belts can feed; the band between two rows is shared, so both rows reach its belts;
  - parallel belts for a heavy item: a Side Input only this Sub-Block takes, or an output nothing else takes, may split into parts, each a belt from (or to) the train serving some of the rows; an Internal Path between two Sub-Blocks splits into as many belts as its rate needs, each linking a group of the producer's rows to a group of the consumer's; a Side Input one belt cannot carry to all its consumers comes to each on belts of its own;
  - which rows share a belt: rows facing a belt from both sides fill both its lanes (an output belt fed from one side carries half a belt), so a split part pairs its rows;
  - Belt Merge per part: two single-item Side Inputs may share the parts of one belt, one per Lane, when each fits its Lane for the rows that belt feeds;
  - pipe rows: a band row kept for a fluid, joining every connection of that fluid in the band. A connection elsewhere in the band dives under the belts to a tap just before the row and joins it on a tile that takes a plain pipe. Pipe rows of two fluids never touch; every second machine row may shift sideways within the gap, so facing rows' connections do not interleave;
  - which inputs and outputs go on which side;
  - gaps between machines;
  - how many inserters each item needs, from real inserter throughput.
- **Up to 4 belts per side**, as options the search can use (distance measured from the machine):

  ```
  d=4  B4 =================================  long inserter standing in row 2 (drops 2 tiles, into the machine)
  d=3  B3 =================================  long inserter in row 1
  d=2  B2 ===U   L2  P   u=================  B2 dives under row 2's inserters and poles
  d=1  B1 =U  F  i  L   u==================  B1 against the machine, dives under row 1's inserters;
                                             F = 90° inserter: picks from B1 beside it, drops into the machine
  d=0  ###############  machine
  ```
- **Per Compound Block, the search chooses:**
  - Sub-Block positions and gap widths, down to none where no path must pass;
  - neighbours sharing a belt when one's output is the other's input;
  - the order routes are laid out in.

  Dependency Order becomes a preference the search usually follows, not a rule.
- **Tunnels:** each hop may be any length up to the underground entity's maximum reach (ADR 0003, superseding ADR 0002).
- **Inserters:** the search uses fast and long-handed inserters, straight or at 90°.
  - The inserter tier is a logistics setting, like the belt tier. Only electric inserters are offered.
  - 90° inserters sit behind a toggle, on by default, because blueprints using them need the Inserter_Config mod.
  - Py cranes are out of scope for now.
- **Inserter throughput:** Starvation also reports machines whose inserters cannot keep up. Rates come from each inserter's real swing speed in the catalog times the hand size (items per swing, a logistics setting for inserter capacity research, default 1); this is an approximation.
- **Fuel:** burner machines take Fuel as one more input, at the rate their power draw needs. The Fuel item is a logistics setting (default: coal) and flows like any Side Input, including Belt Merge. Burner inserters are never used.
- **Blueprint:** includes custom pickup/drop vectors for 90° inserters, each machine's modules as item requests (one per slot, so robots bring Py farms' plants and animals along), and a display panel just outside the block where each Side Input enters and each Side Output leaves, showing its item's icon and name with the rate.
- **Modules:** every step of the Production Chain chooses its building's modules — the ones its categories, effects and recipe allow, up to its slots. They set the machine's speed (and so the Count), productivity (where the recipe allows it) and power draw (burner Fuel). A building that cannot run without modules (Py farms: -100% base speed) starts full of its lowest-tier plant or animal.
- **Unchanged:** planning (Count, Byproducts), flows, Belt Merge rules, the Side Input and Side Output definitions, and the blueprint encoding.

## v3: bottom-up layout (implemented)
v2 routed every belt of every Sub-Block for every candidate, so a big chain took minutes per candidate and the search often kept a starving layout. v3 designs each Sub-Block on its own first and only links them in the Compound Block (ADR 0005). Where v3 differs from v2, v3 wins.

- **Bottom-up:** every Sub-Block, from the leaves of the Production Chain up to the Goals, gets candidate designs: cores from v2's variants (rows, shared bands, parallel belts, Belt Merge, pipe rows) plus Side and Head-on Belts, each routed once as a **Module** in its own coordinates — every belt enters on its west edge and leaves on its east edge, every fluid reaches its west edge (input) or east edge (output). Only a Sub-Block's most promising design is routed before the first layout; the others when the search first tries them.
- **Huge Sub-Blocks repeat a Module:** more than 8 machines may, more than 40 must, be built as **Copies** of one Module — a pair of rows facing the belt between them (or one row), each row as long as makes the stack of Copies about square within what its busiest belt can feed (4 chains of 5 rather than one of 20). The machines left over make a smaller Module. Copies alternate with the Module routed the other way round: a belt it does not use up (paragen, flasks, …) snakes from Copy to Copy, turning beside the stack; one it uses up (moss) comes to each Copy on its own belt; an output to the train, and an Internal Path, snake through runs of Copies, as many Copies a belt as its lanes take.
- **All four sides of a machine:** a machine alone in its row may take belts on its west and east sides too — **Side Belts** one or two tiles out with straight inserters against the machine (machines stand apart to make room), and **Head-on Belts** meeting the machine square on, with 90° fast inserters either side of the end tile and long-handed ones beside the next tile (picking up or dropping on the adjacent tile, Inserter_Config vectors). A head-on output fills both lanes; a head-on input ends against the machine.
- **Lanes counted exactly:** once a Module is routed, every output inserter's lane is known from where it drops relative to the belt's travel. A 90° inserter dropping along its belt (from beside it in the belt's row) gets a drop point a quarter tile to one side, on the lane with less so far (custom vectors), so one row of machines fills both lanes; a Copy routed the other way round fills the other lane first, so a belt snaking through Copies gets both. What a run of machines can put on one belt is a max flow through its two lanes. Designs rank by Starvation including lanes, then area.
- **Internal Paths pair parts:** both ends of an Internal Path split it into the same number of parallel belts, worked out from the plan alone — as many as its rate and its producer's lanes need, at most as many as either end has machines — so modules designed on their own link up: a whole Module splits into exactly that many parts (its parts never chain into each other), Copies' belts snake through runs of Copies. Each belt links a run of producer parts to a run of consumer parts; the consumers' runs are about equal by machines and the producers' runs make about what each takes. A Head-on input ends its belt, so it serves only where each machine gets a belt of its own. Designs whose belts cannot chain are dropped before they are placed.
- **Side Belts run down several machines:** one part feeds as many machines of a stack as one belt can (an output: as fill one lane), crossing the bands between them underground.
- **Placement:** Goals east, each Sub-Block west of the ones it feeds and level with the entries it feeds, as far east as its consumers allow, sliding west, up or down around the ones placed already (the cost: area grown, link length, rows of others' Side Inputs it would block). Copies stack, a row apart where their edges would join different pipes; beside a stack stay a column for each belt turning between Copies and room for each fluid's trunk. The search varies corridors, gaps, the order and lift of Sub-Blocks, and each Sub-Block's design.
- **Links:** only the belts and pipes between Modules are routed in the Compound Block: from the west edge to each Copy's entry, from one Copy's exit to the next Copy's entry (straight on east, or turning beside a stack), on to the east edge; pipes join every Copy's stub of a fluid into one network. The tile in front of each entry and after each exit belongs to its link.
- **Squeeze and power:** rows and columns holding only straight belts or pipes and empty tiles are taken out (belts and tunnels get shorter), then poles are placed over the result.
- **Speed:** the router dives only where the tile ahead is blocked, keeps tiles in typed arrays, caps a leg's search by its distance and gives up early when a flood shows no way; pole placement keeps gains in buckets, joins components through a union-find from the smallest outward, and prunes with articulation points and a local check of whether a pole's neighbours stay connected without it; validity checks index inserters, tunnels and poles. Side Belt variants are a few canonical moves of the four busiest belts. The test suite runs in about 55 s instead of 270 s. Py small parts at 600/min with its four intermediates (14 automated factories, hand size 1): first valid layout in about 1 s, no Starvation, 1,540–1,660 tiles (67×23 in the app) after 10 s (v2: 1,568 tiles, starving the Side Output and bolts). 9000 moss/min (1,875 moss farms, the test fixture's modules): a valid, starvation-free, about square block (324×397) in about 8 s, its moss leaving on 18 belts snaking through pairs of Copies.
- **Default modules:** a Recipe Selection that names no modules plans with the step's default ones (a Py farm full of its first plant or animal), as the app starts it.
- **Unchanged:** planning, flows, routes and Belt Merge rules, validity rules, the simulation (lane capacities now come from the routed Modules), blueprint encoding, the map.

## Catalog
`data/catalog.json` is generated from the game's own data dump (`factorio --dump-data`, Factorio 2.0.77 with the Pyanodons modset): recipes, buildings with crafting speeds, fluid connections and power draw (burners with effectivity and fuel categories), poles, belt tiers and underground reaches, inserters (vectors, rotation and extension speed, energy type, `allow_custom_vectors`), fuel items with their fuel value, plain pipe types, and modules (module items with category and effect; each building's slots, allowed effects and categories and base effect; each recipe's module limits). A catalog built before modules were recorded offers none, and names each plain pipe after its pipe-to-ground. `scripts/py-farms.mjs` fills in the Py farms from the Pyanodons Alien Life source instead (`git clone https://github.com/pyanodon/pyalienlife`, then `node scripts/py-farms.mjs <that folder>`): it runs the mod's building, item and module-restriction prototypes in a Lua VM (fengari) with the data stage stubbed out, and writes every plant and animal module (category, tier, effect) and every farm's module slots, allowed module categories, base effect (-100% speed) and crafting speed (`py.farm_speed`, so a farm full of its first-tier plant or animal runs at its intended speed) into the catalog. The committed catalog carries this from pyalienlife master; a catalog rebuilt from the game's own dump has the same for the installed versions. Regenerate after changing mods, and once for v2 (a catalog built before v2 has no inserter or fuel data and the app asks for a regenerated one):

```
factorio --dump-data
npm run build-catalog -- ~/.factorio/script-output/data-raw-dump.json
npm run build-sprites -- <Factorio install folder, the one holding data/> [~/.factorio/mods]
```

`build-sprites` extracts every item and fluid icon the catalog names — base-game ones from the install, mod ones from the newest zip of each mod — into the git-ignored `sprites/` folder.

## Hosting
`.github/workflows/pages.yml` publishes the planner to GitHub Pages (https://spacemoehre.github.io/factorio-tensei/) on every push to master by force-pushing the built site to the `gh-pages` branch, which Pages serves; pushes to `claude/` branches build the site without publishing it. The site is `index.html`, `js/` and `data/`, plus icons: the workflow downloads the zips attached to every Pyanodons repository's latest release and `scripts/site-sprites.mjs` extracts from them the icons the catalog names by path, finding the rest by name (`graphics/icons/**/<item>.png`). It rewrites only the published copy of the catalog.

## Implementation
- `index.html` + `js/app.js`: Goals (item + rate) and the Production Chain overview: every step with its rate, machine count and Recipe Selection (recipe + building, filtered to buildings that can run the recipe), and every Train Input with its rate. A Goal's ingredients come by train; "Make here" on a Train Input makes it a step (its own ingredients then come by train), and "By train" turns a step back into a Train Input; each step's modules (a row per module type with its count) and the machine's speed with them (Py farms: their plants and animals), with what one machine makes a minute; logistics settings (belt, pipe, pipe-to-ground, pole, inserter and long-handed inserter — electric only —, Fuel, the 90° inserters toggle, search time), build and Stop, starvation report, Side Input/Output lists, blueprint string and JSON. The map redraws with every better layout and shows its area.
- `js/render.js`: pan/zoom canvas map (drag, wheel, fit) with hover details, item icons on machines, belts and pipes, and the copper wires between poles (`js/layout/wires.js`, shared with the blueprint).
- `js/worker.js`: runs the search in a module Web Worker and posts each better layout; Stop terminates it and the page keeps the best one.
- `js/search.js`: the anytime layout search, bottom-up (ADR 0004, 0005). It designs every Sub-Block in Dependency Order (leaves first), then tries Compound Blocks: first each Sub-Block's best design with a few placements, then each Sub-Block's other designs, then random changes to the best so far (a Sub-Block's design, corridor, gap, link-length weight, a Sub-Block's lift or order). Each candidate is placed, linked, squeezed, powered and checked by `validateBlock`; the best by Starvation, then area, then entity count is kept. Deterministic for a seed and candidate count.
- `js/design.js`: a Sub-Block's design candidates — v2's variants of its core (rows, shared bands, parallel belts sized by lanes, Belt Merge, pipe rows, outputs given the shared band first), Side and Head-on Belts for single machines, and for huge Sub-Blocks repeated Modules sized about square — ranked by Starvation (inserters, belts, lanes) and area, each routed as a Module when first needed.
- `js/solve.js`: `solve()` runs the search for a candidate or time budget and returns the best Compound Block.
- `js/chain.js`: Goals + the items chosen to be made here + Recipe Selections → the Production Chain (every step's rate, and the Train Inputs it needs), and the recipe and building options for each item.
- `js/plan.js`: Goals → Sub-Blocks (Count, rates, Byproducts, Fuel, modules). `js/modules.js`: which modules fit a building and recipe, the default ones, and their effect on speed, productivity and power. `js/flows.js`: Dependency Order, Internal Paths, Side Input, Side Output. `js/routes.js`: routes with Belt Merge.
- `js/layout/core.js`: one Sub-Block (or Module) from a variant — rotation, stacked machine rows with shared bands between them, which band and row each belt part and pipe row takes (up to 4 belts per face), Side and Head-on Belts beside single machines, row shift, gaps, pole slots, taps. A small depth-first search picks inserter columns for one machine period (repeated for every machine) so every machine gets its share of each belt and every belt row stays passable.
- `js/layout/module.js`: routes a core on its own as a Module (west to east, or with chosen parts east to west for alternate Copies), with risers for fluids in several bands, poles to prove it powers, each output inserter's lane, and where a Copy may drop its belt's head or tail.
- `js/layout/compose.js`: Copies of every Module and the global routes (parts chained into belts by capacity and lanes, Internal Paths balanced, pipes one network per route), then links and pipes routed between placed Copies (rip-up and reroute on failure). `js/layout/place.js`: the Placement. `js/layout/compact.js`: the Squeeze, then poles.
- `js/layout/router.js`: A* belts through waypoints and pipe trees; tunnels of any hop length up to the reach (ADR 0003), never interleaved on a line; a waypoint may hold a belt, a tunnel entrance or exit (an exit only where the belt can go on). A pipe tunnel never ends on or passes under a tile that must take a plain pipe (a connection on its pipe row, or where a tap joins it).
- `js/layout/poles.js` (Minimal Pole Placement; poles may stand just north or south of the block), `grid.js`, `validity.js` (the rules every candidate and every test checks).
- `js/inserters.js`: approximate inserter throughput. Hand-size items per swing: a swing turns the hand 180° (90° for a 90° inserter) at the prototype's rotation speed while it extends between its pickup and drop distances; the slower of the two sets its time. Pickup and drop are ignored, so real rates run a few percent lower (fast 2.4/s estimated vs 2.31/s measured).
- `js/sim.js`: Starvation per route in belt order, plus machines whose inserters cannot move their share.
- `js/blueprint.js`: importable blueprint string + JSON, with pole wires, `pickup_position` / `drop_position` vectors on 90° inserters, module requests on machines and display panels marking the train routes.
- `js/catalog-builder.js` + `scripts/build-catalog.mjs`: data dump → catalog. `scripts/py-farms.mjs`: Py farm modules and speeds from the pyalienlife source into the catalog. `scripts/measure.mjs`: samples recipes from the catalog and reports how many solve.
- `scripts/build-sprites.mjs` + `scripts/sprites.mjs`: extract the catalog's icons from the game and the mod zips into `sprites/`.

## Testing
- `npm test`: Node test suite at the agreed seams — `expandChain`, `planSubBlocks` (incl. Fuel, modules and their defaults), `buildFlows`, `solve` (every layout passes `validateBlock`: no overlaps, belt chains with tunnels within reach at their nearest partner, feeding and draining inserters, connected pipe networks, no fluid mixing, separate networks, powered and connected poles, no custom vectors when 90° inserters are off), the search's capabilities (Py science pack 2 at 450/min: 75 research centres in stacked rows with pipe rows and moss on 13 parallel yellow belts, no Starvation; Py small parts at 600/min with hand size 1, no Starvation; Py small parts at 1200/min, its Internal Paths paired part to part; 500 moss farms as Copies of one Module, about square, no Starvation; a 5-belt Py recipe, Py nitrogen-mustard at 4 machines, inserter counts that scale with throughput, burner Fuel, Compactness never worse than v1 on fixed scenarios, determinism under a seed), Modules (belts on all four sides of a machine, a Head-on output filling both lanes, every belt entering west and leaving east and trimmed per Copy, a Side Belt down several machines, 90° drops choosing their lane, lanes as a max flow), the router, poles and their wires, sprite extraction from mod zips, the Py farms read from the pyalienlife source, `simulate` (incl. inserter throughput), `inserterRate`, `encodeBlueprint`, `buildCatalog`.
- `npm run typecheck`: `tsc --checkJs` over all modules.
- `node scripts/measure.mjs [samples] [seed] [budgetMs]`: success rate, failure reasons and time on sampled catalog recipes at 2–4 machines.
- UI checked in headless Chromium (Playwright): Production Chain (small-parts-01: its ingredients by train, then bolts made here and back), recipe and building per step, a build with a made step, build, progressive map updates with area, icons, pole wires, Stop, settings (inserters, Fuel, 90° toggle, search time), modules per step and the machine speed they give (a moss farm on 5 moss: 0.333, 375 farms; on 15: 1, 125 farms; on 15 moss-mk04: 4, 32 farms), blueprint vectors, persistence, phone width.

## Known limitations
Measured with `scripts/measure.mjs` (300 sampled Pyanodons recipes at 2–4 machines with their default modules, 3 s search each, vanilla inserter data standing in until the catalog is regenerated): 92.7% solve, 2.8 s a recipe on average (v2: 90.7%, v1: 79.3%). Of the rest, 15 of 22 have more belts than fit around a small machine or no room for their inserters, 4 burn a fuel other than coal, 3 fail on fluids.
- A row of machines reaches at most 4 belts per face; a machine alone in its row also takes Side and Head-on Belts (up to 12 belts around it). Recipes needing more after Belt Merge are rejected with an error, and small machines (3×3 assemblers) with many ingredients often have no room for the inserters their belts need. Py cranes are not used.
- About 1% fail on fluids: a connection boxed in by the machine's other connections and belts that the pipe cannot leave, or a pipe that cannot reach the rest of its network.
- Every machine in a row uses the same inserter columns (one period repeated); a layout that would need different columns per machine is not found.
- Inserter throughput ignores pickup and drop time; the hand size is a setting.
- Straight output inserters fill only the far lane, and a drop onto a belt's curve counts on the worse lane. A machine making more than one lane holds (bolts at 600/min on yellow belts) needs a Head-on output or rows facing its belt from both sides; where the pairing of an Internal Path allows neither, it starves.
- An Internal Path feeds each consumer machine from one belt, and each belt from a run of producer machines: when the machines do not split evenly (13 iron-stick machines into 5 belts), some belts bring less than their consumers take. Py small parts at 1200/min with hand size 1 on yellow belts lays out in about 4 s but runs some 1,200/min short (bolts and iron sticks beyond a lane); at 2000/min, about 1,800/min short. Faster belts or a higher hand size make such blocks far easier.
- Splitters are not used: a Head-on input ends its belt, so it serves only where a machine gets a belt of its own; Side Belts serve the machines that share one.
- The search is a randomised local search: it finds good layouts, not proven optimal ones, and harder blocks need more search time. Py science pack 2 at 450/min: a starvation-free layout of some 18,900 tiles in about 12 s.
- Belts snaking through the Copies of a stack turn beside it, each in a lane of its own, at most (min(belt reach, pipe reach) − 2) / 2 of them per stack (one on vanilla yellow belts); beyond that every Copy gets its own belts. Copies may stand in several columns, but each column needs its own turning room, so one column usually wins.
- The Py farms in the committed catalog come from pyalienlife master; regenerate (`scripts/py-farms.mjs`, or the game's own dump) for the installed versions.
- Only burner machines take Fuel; machines burning fluids are not fed.
- In a recipe loop the Production Chain brings the looping item by train, but the layout still feeds it from its own Sub-Block when one makes it.
- Icons with several layers (tinted, overlaid) show only their first layer.
- Pole placement is locally minimal (no pole can be removed), not a proven global minimum.
- Custom/mod entity definitions are deferred (see Requirements).
