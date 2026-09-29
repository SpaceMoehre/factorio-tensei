import { machineEffect } from './modules.js';

// logistics.fuel: the Fuel item burner machines burn.
export function planSubBlocks(entries, catalog, logistics = {}) {
  const seen = new Set();
  return entries.map(({ goal, selection }) => {
    if (!(goal.rate > 0)) throw new Error(`${goal.item}: the rate must be above 0`);
    if (seen.has(goal.item)) throw new Error(`${goal.item} is a Goal more than once; combine them into one Goal`);
    seen.add(goal.item);
    const recipe = catalog.recipes[selection.recipe];
    const building = catalog.buildings[selection.building];
    const modules = selection.modules ?? [];
    const effect = machineEffect(catalog, selection.recipe, selection.building, modules);
    // Productivity adds to every product of a craft.
    const perCraft = recipe.products.find(p => p.name === goal.item).amount * (1 + effect.productivity);
    const perMachinePerMinute = (building.craftingSpeed * effect.speed / recipe.time) * perCraft * 60;
    const craftsPerMinute = goal.rate / perCraft;
    const flow = ({ name, type, amount }) => ({ name, type, rate: amount * craftsPerMinute });
    const outputs = recipe.products.map(p => ({ ...flow(p), rate: p.amount * (1 + effect.productivity) * craftsPerMinute }));
    const inputs = recipe.ingredients.map(flow);
    if (building.energy === 'burner') {
      // Machines burn fuel only while they work: the busy share of the Count.
      const perMachine = fuelPerMinute(building, catalog, logistics.fuel) * effect.consumption;
      const fuel = inputs.find(i => i.name === logistics.fuel);
      const rate = perMachine * goal.rate / perMachinePerMinute;
      if (fuel) fuel.rate += rate;
      else inputs.push({ name: logistics.fuel, type: 'item', rate });
    }
    return {
      item: goal.item,
      rate: goal.rate,
      recipe: selection.recipe,
      building: selection.building,
      modules,
      count: Math.ceil(goal.rate / perMachinePerMinute),
      inputs,
      outputs,
      byproducts: outputs.filter(o => o.name !== goal.item),
    };
  });
}

// A busy burner machine burns energy_usage / (fuel_value × effectivity) fuel items per second.
function fuelPerMinute(building, catalog, fuelName) {
  const fuel = catalog.fuels?.[fuelName];
  if (building.energyUsage === undefined || !catalog.fuels) throw new Error('catalog is missing fuel data — regenerate it');
  if (!fuel) throw new Error(`${building.name} burns fuel; choose a Fuel item`);
  if (!fuel.categories.some(c => building.fuelCategories.includes(c))) {
    throw new Error(`${building.name} burns ${building.fuelCategories.join(' or ')} fuel, not ${fuelName}`);
  }
  return building.energyUsage / (fuel.fuelValue * building.effectivity) * 60;
}
