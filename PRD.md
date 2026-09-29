---
name: factorio-factory-block-blueprint-tool
description: Factorio factory block blueprint generator with dynamic sub-blocks, belt/pipe routing, simulation, and browser-tested UI.
metadata:
  type: project
  status: implemented
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
- Auto tunnel placement: reactive (crossing an occupied tile) and proactive (compaction — inserter placed directly against its assembler, pole on the same line, belt tunnels underneath). Tunnels always take the underground entity's maximum reach per hop (see ADR 0002).
- Belt merging: only for items that already share a route (same edge), one item per Lane, when each item's real flow rate fits within one Lane.
- Minimal electricity pole placement: fewest poles (preferring largest-coverage type) that cover every building's footprint and stay wire-connected, computed from real footprint + real pole data — not a fixed step/canvas size. Scales to huge (modded) buildings.
- Client-side JS simulation that detects Starvation per edge, walking consumers in belt order so a downstream Sub-Block can starve even when aggregate capacity looks sufficient (see ADR 0001).
- Factorio blueprint export: real importable blueprint string (`"0" + base64(zlib_deflate(JSON))`), with the underlying raw JSON also available.
- Pan/zoom map-style preview of the Compound Block (not a static fixed-size SVG) — renders real per-Sub-Block dimensions and positions.
- Side input path (train) and output path (to train), per the Side Input/Output glossary definitions.

## Catalog
`data/catalog.json` is generated from the game's own data dump (`factorio --dump-data`, Factorio 2.0.77 with the Pyanodons modset): 6,947 recipes and 645 buildings with crafting speeds, fluid connections, poles, belt tiers and underground reaches. Regenerate after changing mods with `npm run build-catalog -- <path to data-raw-dump.json>`.

## Implementation
- `index.html` + `js/app.js`: Goals (item + rate) with a separate Recipe Selection (recipe + building, filtered to buildings that can run the recipe), logistics settings, build, starvation report, Side Input/Output lists, blueprint string and JSON.
- `js/render.js`: pan/zoom canvas map (drag, wheel, fit) with hover details.
- `js/plan.js`: Goals → Sub-Blocks (Count, rates, Byproducts).
- `js/flows.js`: Dependency Order, Internal Paths, Side Input, Side Output.
- `js/solve.js`: routes (with Belt Merge), cores, packing, routing (rip-up and reroute on failure), poles → Compound Block.
- `js/layout/`: `core.js` (one Sub-Block's machines, inserters, belt rows, fluid connections), `pack.js` (shelf packing), `router.js` (A* belts and pipe trees with max-reach tunnels), `poles.js` (Minimal Pole Placement), `grid.js`.
- `js/sim.js`: Starvation per route in belt order.
- `js/blueprint.js`: importable blueprint string + JSON, with pole wires.
- `js/catalog-builder.js` + `scripts/build-catalog.mjs`: data dump → catalog.
- `sprites/`: symlink to Factorio `base/graphics/icons/`; only base-game icons are shown.

## Testing
- `npm test`: Node test suite at the agreed seams — `planSubBlocks`, `buildFlows`, `solve` (layout invariants: no overlaps, connected belts and pipe networks, exact-reach tunnels, no fluid mixing, powered and connected poles), `simulate`, `encodeBlueprint`, `buildCatalog`.
- `npm run typecheck`: `tsc --checkJs` over all modules.
- UI checked in headless Chromium (Playwright): build, map pan/zoom/hover, blueprint decode, errors, persistence, phone width.

## Known limitations
- A Sub-Block has at most 4 belt rows (near and far rows on each side, the reach of vanilla inserters). About 16–18% of Pyanodons recipes need more and are rejected with an error.
- Dense multi-fluid machines (several fluids entering side by side, boxed in by belts) sometimes cannot be routed, because every tunnel must use the full underground reach (ADR 0002). About 6% of sampled Pyanodons recipes.
- Pole placement is locally minimal (no pole can be removed), not a proven global minimum.
- Inserter throughput and burner fuel supply are not modelled.
- Icons for mod items are not shown.
- Custom/mod entity definitions are deferred (see Requirements).
