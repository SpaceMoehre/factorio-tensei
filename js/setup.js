// A setup: the page's saved state (or a tune-layout setup file, the same) read as a build takes
// it. The page and a run without it read it here alike, so both build with the same defaults.

// The settings the user picks from the catalog, each from a list of its own.
const SELECTS = ['belt', 'pipe', 'pole', 'inserter', 'longInserter', 'fuel', 'liquidFuel'];

// A pipe-to-ground's plain pipe: the one named like it. Pipes of different materials do not
// connect, so the block takes both of one material (`pipe`, the pipe-to-ground, chosen; its
// `plainPipe` follows).
export const plainOf = name => name.replace(/-to-ground$/, '');

// Electric inserters (never burner ones) that pick up straight ahead, `reach` tiles out. Py's
// cranes reach diagonally and are not used.
function inserterNames(catalog, reach) {
  return Object.values(catalog.inserters ?? {})
    .filter(i => i.energy === 'electric' && i.pickup.x === 0 && Math.abs(Math.abs(i.pickup.y) - reach) < 1e-6)
    .map(i => i.name).sort();
}

// What each logistics setting may be, from the catalog: { belt: [names], pipe, pole, inserter,
// longInserter, fuel, liquidFuel }.
export function logisticsOptions(catalog) {
  return {
    belt: Object.keys(catalog.belts), pole: Object.keys(catalog.poles),
    // Pipe-to-grounds with a plain pipe of their material (every one, in a catalog built before
    // plain pipes were recorded).
    pipe: Object.keys(catalog.pipes).filter(name => !catalog.plainPipes || catalog.plainPipes.includes(plainOf(name))),
    inserter: inserterNames(catalog, 1), longInserter: inserterNames(catalog, 2), fuel: Object.keys(catalog.fuels ?? {}).sort(),
    // Liquid Fuels (a catalog built before them has none).
    liquidFuel: Object.keys(catalog.fluidFuels ?? {}).sort(),
  };
}

// The logistics a setup takes where it sets none, the search's budget (seconds) among them.
export function defaultLogistics(catalog) {
  const options = logisticsOptions(catalog);
  const poles = Object.values(catalog.poles).sort((a, b) => b.supplyRadius - a.supplyRadius);
  const prefer = (list, name) => (list.includes(name) ? name : list[0]);
  return {
    belt: prefer(options.belt, 'transport-belt'),
    pipe: prefer(options.pipe, 'pipe-to-ground'),
    pole: poles[0].name,
    inserter: prefer(options.inserter, 'fast-inserter'),
    longInserter: prefer(options.longInserter, 'long-handed-inserter'),
    fuel: prefer(options.fuel, 'coal'),
    liquidFuel: prefer(options.liquidFuel, options.liquidFuel.includes('natural-gas') ? 'natural-gas' : 'petroleum-gas'),
    rightAngle: true,
    handSize: 1,
    budget: 10,
    circuit: 'none',
  };
}

// The saved state with every default filled in, as a copy (the saved state left as it was):
// logistics the catalog no longer offers fall back to their defaults; the Chain Choices default to
// none; the City Block to an empty 100 × 100 one, off (on with a blueprint at the top level, as a
// tune-layout setup has it); a Goal saved with its own recipe and building (as Goals used to carry
// them) gives them to the Recipe Selections.
export function normalized(saved, catalog) {
  const state = structuredClone(saved);
  const options = logisticsOptions(catalog);
  const logistics = { ...state.logistics };
  for (const key of SELECTS) if (key in logistics && !options[key].includes(logistics[key])) delete logistics[key];
  state.logistics = { ...defaultLogistics(catalog), ...logistics };
  state.logistics.plainPipe = plainOf(state.logistics.pipe);
  state.goals ??= [];
  state.made ??= [];
  state.selections ??= {};
  // Byproduct Uses: { from (a step's key), item, recipe, building?, modules? } (chain.js).
  state.uses ??= [];
  // Items made here the user wants leaving by train too, their consumers first; fluids that would
  // leave by train destroyed instead (a sinkhole, a gas vent) (ADR 0062).
  state.exports ??= [];
  state.voids ??= [];
  // The City Block to build in: its blueprint string (or a size, without one), the Buffer and
  // whether to look for the highest rate that fits.
  state.city = { on: false, blueprint: '', w: 100, h: 100, buffer: 2, maximize: false, ...state.city };
  if (state.blueprint && !state.city.blueprint) Object.assign(state.city, { on: true, blueprint: state.blueprint });
  delete state.blueprint;
  for (const g of state.goals) {
    if (g.recipe && !state.selections[g.item]) state.selections[g.item] = { recipe: g.recipe, building: g.building };
    delete g.recipe;
    delete g.building;
  }
  return state;
}

// What a build takes of a saved state: { goals (those with an item and a rate), choices (the
// Chain Choices: { made, selections, uses, exports, voids }), logistics (without the budget),
// budget (seconds), city ({ on, blueprint, w, h, buffer, maximize }) }.
export function setupOf(saved, catalog) {
  return setupFrom(normalized(saved, catalog));
}

// The same of a state normalized already (the page's own), read as it is.
export function setupFrom(state) {
  const { budget, ...logistics } = state.logistics;
  const { made, selections, uses, exports, voids } = state;
  return { goals: state.goals.filter(g => g.item && g.rate > 0), choices: { made, selections, uses, exports, voids }, logistics, budget, city: state.city };
}
