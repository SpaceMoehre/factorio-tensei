// Modules in a machine (Factorio 2.0 rules): which ones fit, which a step starts with, and what
// they do to its speed, productivity and power draw.
// A module list is [{ name, count }], at most the building's moduleSlots in all.

// Modules this building can hold for this recipe: its category allowed by the building (and the
// recipe, when it limits them), every effect it has allowed by the building, and productivity only
// where the recipe allows it. Lowest tier first.
export function moduleOptions(catalog, recipeName, buildingName) {
  const building = catalog.buildings[buildingName];
  const recipe = catalog.recipes[recipeName];
  if (!building?.moduleSlots || !catalog.modules) return [];
  return Object.values(catalog.modules)
    .filter(m => fits(m, building, recipe))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
    .map(m => m.name);
}

function fits(module, building, recipe) {
  if (building.allowedModuleCategories && !building.allowedModuleCategories.includes(module.category)) return false;
  if (recipe?.allowedModuleCategories && !recipe.allowedModuleCategories.includes(module.category)) return false;
  return Object.entries(module.effect).every(([effect, value]) => !value || (
    (!building.allowedEffects || building.allowedEffects.includes(effect)) && (effect !== 'productivity' || value < 0 || recipe?.allowProductivity)));
}

// Factorio's own module categories.
const GAME_CATEGORIES = new Set(['speed', 'productivity', 'efficiency', 'quality']);

// A building that cannot run without modules: a Py farm. For Factorio 2.1 Py gives a farm -100%
// base speed; for 2.0 it gives it no base effect but stops it by script while its slots are
// empty, and a farm's slots take nothing but its plants or animals, none of the game's own modules.
export function needsModules(building) {
  if (!building?.moduleSlots) return false;
  if ((building.baseEffect?.speed ?? 0) <= -1) return true;
  return !!building.allowedModuleCategories?.length && building.allowedModuleCategories.every(c => !GAME_CATEGORIES.has(c));
}

// A step starts without modules, unless its building cannot run without them; then every slot
// holds the lowest tier that speeds it up — the farm's first plant.
export function defaultModules(catalog, recipeName, buildingName) {
  const building = catalog.buildings[buildingName];
  if (!needsModules(building)) return [];
  const first = moduleOptions(catalog, recipeName, buildingName).find(name => catalog.modules[name].effect.speed > 0);
  return first ? [{ name: first, count: building.moduleSlots }] : [];
}

// Multipliers on the machine's speed and power draw, and its productivity bonus. Effects add up
// from the building's base effect and each module; speed and consumption stop at -80% (or the
// building's own lower speed limit), productivity counts only where the recipe allows it.
export function machineEffect(catalog, recipeName, buildingName, modules = []) {
  const building = catalog.buildings[buildingName];
  const recipe = catalog.recipes[recipeName];
  const total = { speed: 0, productivity: 0, consumption: 0, ...building.baseEffect };
  const slots = modules.reduce((sum, m) => sum + m.count, 0);
  if (slots > (building.moduleSlots ?? 0)) {
    throw new Error(`${building.name} has ${building.moduleSlots ?? 0} module slots, not ${slots}`);
  }
  for (const { name, count } of modules) {
    const module = catalog.modules?.[name];
    if (!module || !fits(module, building, recipe)) throw new Error(`${building.name} cannot take ${name} for ${recipeName}`);
    for (const [effect, value] of Object.entries(module.effect)) total[effect] = (total[effect] ?? 0) + value * count;
  }
  return {
    speed: Math.max(1 + total.speed, 1 + (building.speedLow ?? -0.8)),
    productivity: recipe.allowProductivity ? Math.min(3, Math.max(0, total.productivity)) : 0,
    consumption: Math.max(0.2, 1 + total.consumption),
  };
}
