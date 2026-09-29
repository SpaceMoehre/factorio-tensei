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
  - one machine row or several, where facing rows may share the belts between them;
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
- **Inserter throughput:** Starvation also reports machines whose inserters cannot keep up. Rates come from each inserter's real swing speed in the catalog; this is an approximation.
- **Fuel:** burner machines take Fuel as one more input, at the rate their power draw needs. The Fuel item is a logistics setting (default: coal) and flows like any Side Input, including Belt Merge. Burner inserters are never used.
- **Blueprint:** includes custom pickup/drop vectors for 90° inserters.
- **Unchanged:** planning (Count, Byproducts), flows, Belt Merge rules, the Side Input and Side Output definitions, and the blueprint encoding.

## Catalog
`data/catalog.json` is generated from the game's own data dump (`factorio --dump-data`, Factorio 2.0.77 with the Pyanodons modset): recipes, buildings with crafting speeds, fluid connections and power draw (burners with effectivity and fuel categories), poles, belt tiers and underground reaches, inserters (vectors, rotation and extension speed, energy type, `allow_custom_vectors`) and fuel items with their fuel value. Regenerate after changing mods, and once for v2 (a catalog built before v2 has no inserter or fuel data and the app asks for a regenerated one):

```
factorio --dump-data
npm run build-catalog -- ~/.factorio/script-output/data-raw-dump.json
```

## Implementation
- `index.html` + `js/app.js`: Goals (item + rate) with a separate Recipe Selection (recipe + building, filtered to buildings that can run the recipe), logistics settings (belt, pipe-to-ground, pole, inserter and long-handed inserter — electric only —, Fuel, the 90° inserters toggle, search time), build and Stop, starvation report, Side Input/Output lists, blueprint string and JSON. The map redraws with every better layout and shows its area.
- `js/worker.js`: runs the search in a module Web Worker and posts each better layout; Stop terminates it and the page keeps the best one.
- `js/search.js`: the anytime layout search (ADR 0004). It builds a pool of locally valid variants per Sub-Block, then tries Compound Blocks — a sweep of each pool's most compact variants, then random changes to the best so far: variant, packing order, gaps, shelf width, margins, belt sharing between neighbours, routing order. Each candidate is fully routed, powered and checked by `validateBlock`; the best by inserter shortfall, then area, then entity count is kept. Deterministic for a seed and candidate count.
- `js/solve.js`: `solve()` runs the search for a candidate or time budget and returns the best Compound Block.
- `js/plan.js`: Goals → Sub-Blocks (Count, rates, Byproducts, Fuel). `js/flows.js`: Dependency Order, Internal Paths, Side Input, Side Output. `js/routes.js`: routes with Belt Merge.
- `js/layout/core.js`: one Sub-Block from a variant — rotation, one row or two facing rows with a shared middle band, which band and row each belt takes (up to 4 per face), gaps, pole slots. A small depth-first search picks inserter columns for one machine period (repeated for every machine) so every machine gets its share of each belt and every belt row stays passable.
- `js/layout/compound.js`: places cores, routes belts and pipes (rip-up and reroute on failure), places poles.
- `js/layout/router.js`: A* belts through waypoints and pipe trees; tunnels of any hop length up to the reach (ADR 0003), never interleaved on a line; a waypoint may hold a belt, a tunnel entrance or exit.
- `js/layout/pack.js` (shelf packing with chosen gaps and level rows for shared belts), `poles.js` (Minimal Pole Placement; poles may stand just north or south of the block), `grid.js`, `validity.js` (the rules every candidate and every test checks).
- `js/inserters.js`: approximate inserter throughput. One item per swing (no capacity bonus): a swing turns the hand 180° (90° for a 90° inserter) at the prototype's rotation speed while it extends between its pickup and drop distances; the slower of the two sets its time. Pickup and drop are ignored, so real rates run a few percent lower (fast 2.4/s estimated vs 2.31/s measured).
- `js/sim.js`: Starvation per route in belt order, plus machines whose inserters cannot move their share.
- `js/blueprint.js`: importable blueprint string + JSON, with pole wires and `pickup_position` / `drop_position` vectors on 90° inserters.
- `js/catalog-builder.js` + `scripts/build-catalog.mjs`: data dump → catalog. `scripts/measure.mjs`: samples recipes from the catalog and reports how many solve.
- `sprites/`: symlink to Factorio `base/graphics/icons/`; only base-game icons are shown.

## Testing
- `npm test`: Node test suite at the agreed seams — `planSubBlocks` (incl. Fuel), `buildFlows`, `solve` (every layout passes `validateBlock`: no overlaps, belt chains with tunnels within reach at their nearest partner, feeding and draining inserters, connected pipe networks, no fluid mixing, separate networks, powered and connected poles, no custom vectors when 90° inserters are off), the search's capabilities (a 5-belt Py recipe, Py nitrogen-mustard at 4 machines, inserter counts that scale with throughput, burner Fuel, Compactness never worse than v1 on fixed scenarios, determinism under a seed), the router, packing, poles, `simulate` (incl. inserter throughput), `inserterRate`, `encodeBlueprint`, `buildCatalog`.
- `npm run typecheck`: `tsc --checkJs` over all modules.
- `node scripts/measure.mjs [samples] [seed] [budgetMs]`: success rate, failure reasons and time on sampled catalog recipes at 2–4 machines.
- UI checked in headless Chromium (Playwright): build, progressive map updates with area, Stop, settings (inserters, Fuel, 90° toggle, search time), blueprint vectors, persistence, phone width.

## Known limitations
Measured with `scripts/measure.mjs` (300 sampled Pyanodons recipes at 2–4 machines, 3 s search each, vanilla inserter data standing in until the catalog is regenerated): 90.7% solve (v1: 79.3%).
- A row of machines reaches at most 4 belts per face (8 per Sub-Block with 90° inserters, 6 without). About 6% of sampled Pyanodons recipes need more after Belt Merge and are rejected with an error. Py cranes, and belts along the machines' left and right sides, are not used.
- About 3% fail on fluids: a connection boxed in by the machine's other connections and belts that the pipe cannot leave (a pipe tree starts only with a pipe or a straight dive at its first connection), or a pipe that cannot reach the rest of its network.
- Every machine in a row uses the same inserter columns (one period repeated); a layout that would need different columns per machine is not found.
- Inserter throughput assumes one item per swing (no inserter capacity research) and ignores pickup and drop time.
- Output inserters, 90° ones included, are assumed to fill only the far lane.
- The search is a randomised local search: it finds good layouts, not proven optimal ones, and harder blocks need more search time.
- Only burner machines take Fuel; machines burning fluids are not fed.
- Pole placement is locally minimal (no pole can be removed), not a proven global minimum.
- Icons for mod items are not shown.
- Custom/mod entity definitions are deferred (see Requirements).
