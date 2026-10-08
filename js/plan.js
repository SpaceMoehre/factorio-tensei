import { machineEffect, defaultModules } from './modules.js';
import { assignFluidBoxes } from './fluidboxes.js';

// logistics.fuel: the Fuel item burner machines burn; logistics.liquidFuel: the Liquid Fuel
// machines burning a fluid burn (unless their energy source takes one fluid only).
// An entry's byTrain: items it takes by train though a Sub-Block makes them (a Recipe Loop's).
export function planSubBlocks(entries, catalog, logistics = {}) {
  const seen = new Set();
  return entries.map(({ goal, selection, byTrain = [] }) => {
    if (!(goal.rate > 0)) throw new Error(`${goal.item}: the rate must be above 0`);
    // (A Sub-Block in parts, Bands, has an entry for each part.)
    if (seen.has(goal.item) && !goal.part) throw new Error(`${goal.item} is a Goal more than once; combine them into one Goal`);
    seen.add(goal.item);
    const recipe = catalog.recipes[selection.recipe];
    const building = catalog.buildings[selection.building];
    const liquid = building.energy === 'fluid' ? liquidFuelOf(building, catalog, logistics.liquidFuel) : null;
    const boxes = assignFluidBoxes(recipe, building, liquid?.name);
    if (!boxes) throw new Error(`${selection.building} cannot take the fluids of ${selection.recipe}${liquid ? ` and burn ${liquid.name}` : ''}`);
    // A selection that names no modules gets the step's default (a Py farm full of its first plant).
    const modules = selection.modules ?? defaultModules(catalog, selection.recipe, selection.building);
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
    if (liquid) {
      // The same for a Liquid Fuel, per unit of fluid: a pipe of its own into every machine.
      const perMachine = building.energyUsage / (liquid.fuelValue * building.effectivity) * 60 * effect.consumption;
      inputs.push({ name: liquid.name, type: 'fluid', rate: perMachine * goal.rate / perMachinePerMinute, fuel: true });
    }
    const count = Math.max(Math.ceil(goal.rate / perMachinePerMinute), goal.machines ?? 0);
    return {
      item: goal.item,
      rate: goal.rate,
      recipe: selection.recipe,
      building: selection.building,
      modules,
      // Which of the building's fluid boxes each fluid takes (fluidboxes.js).
      boxes,
      count,
      // How much faster than the plan needs its machines can run (the Count is rounded up): a
      // machine makes its share of every flow times this at full speed (as far as its inputs
      // keep up: design.js narrows it).
      headroom: count * perMachinePerMinute / goal.rate,
      inputs,
      outputs,
      byproducts: outputs.filter(o => o.name !== goal.item),
      ...(byTrain.length ? { byTrain } : {}),
      ...(goal.part ? { part: true } : {}),
      ...(goal.from ? { from: goal.from } : {}),
    };
  });
}

// The Liquid Fuel a machine burning a fluid burns: its energy source's own fluid, else the one
// chosen.
function liquidFuelOf(building, catalog, name) {
  if (!catalog.fluidFuels) throw new Error('catalog is missing liquid fuel data — regenerate it');
  if (building.heats) throw new Error(`${building.name} is heated by its fluid's temperature, which is not supported`);
  const fuel = catalog.fluidFuels[building.fuelFilter ?? name];
  if (!fuel) throw new Error(building.fuelFilter ? `${building.name} burns ${building.fuelFilter}, which has no fuel value` : `${building.name} burns a fluid; choose a Liquid Fuel`);
  return fuel;
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
