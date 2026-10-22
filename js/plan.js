import { machineEffect, defaultModules } from './modules.js';
import { assignFluidBoxes } from './fluidboxes.js';

// logistics.fuel: the Fuel item burner machines burn (logistics.fuels: category → the one those
// that cannot burn it burn, burnerFuel); logistics.liquidFuel: the Liquid Fuel
// machines burning a fluid burn (unless their energy source takes one fluid only).
// An entry's byTrain: items it takes by train though a Sub-Block makes them (a Recipe Loop's).
// An entry's use: a Byproduct Use's (chain.js), its item made besides any step's (it takes its
// byproduct from the entry `goal.from` names, and what it makes of an item `goal.joins` names
// joins that entry's).
export function planSubBlocks(entries, catalog, logistics = {}) {
  const seen = new Set();
  return entries.map(({ goal, selection, byTrain = [], use }) => {
    if (!(goal.rate > 0)) throw new Error(`${goal.item}: the rate must be above 0`);
    // (A Sub-Block in parts, Bands, has an entry for each part.)
    if (seen.has(goal.item) && !goal.part && !use) throw new Error(`${goal.item} is a Goal more than once; combine them into one Goal`);
    if (!use) seen.add(goal.item);
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
    // (A fluid at the temperature it comes out at, ADR 0067.)
    const heat = p => (p.type === 'fluid' ? { temperature: p.temperature ?? catalog.temperatures?.[p.name] ?? 15 } : {});
    const outputs = recipe.products.map(p => ({ ...flow(p), rate: p.amount * (1 + effect.productivity) * craftsPerMinute, ...heat(p) }));
    const inputs = recipe.ingredients.map(flow);
    if (building.energy === 'burner') {
      // Machines burn fuel only while they work: the busy share of the Count.
      const name = burnerFuel(building, catalog, logistics);
      const perMachine = fuelPerMinute(building, catalog, name) * effect.consumption;
      const fuel = inputs.find(i => i.name === name);
      const rate = perMachine * goal.rate / perMachinePerMinute;
      if (fuel) fuel.rate += rate;
      else inputs.push({ name, type: 'item', rate });
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
      // (A Byproduct Use's Supplied Items: item → the Sub-Block whose route of it they join.)
      ...(goal.joins ? { joins: goal.joins } : {}),
      // (What it makes of an item another Sub-Block makes, more than a lane carries: on a belt of
      // its own into those taking it, `feeds`: item → that Sub-Block, ADR 0068.)
      ...(goal.feeds ? { feeds: goal.feeds } : {}),
      // (An Extension: so much of its item made beyond what is taken, for an Annex to draw.)
      ...(goal.extra ? { extra: goal.extra } : {}),
      // (Fluids fed back, ADR 0062: their spare off through an overflow valve, what makes up the
      // rest in through a top-up valve, topUp: fluid → { from: the Sub-Block or 'side-input',
      // rate }; items leaving by train besides, their consumers first; fluids leaving destroyed.)
      ...(goal.overflow ? { overflow: goal.overflow } : {}),
      // (A closed loop's fluid fed back: none spare, no overflow valve.)
      ...(goal.closed ? { closed: goal.closed } : {}),
      ...(goal.topUp ? { topUp: goal.topUp } : {}),
      ...(goal.exports ? { exports: goal.exports } : {}),
      ...(goal.voids ? { voids: goal.voids } : {}),
      ...(use ? { use: true } : {}),
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

// What a busy machine of the building burns a minute, besides its recipe: the Fuel item where it
// burns items, its Liquid Fuel where it burns a fluid; null where it burns nothing (the chain
// makes the fuel too where it is a step, chain.js).
export function fuelOf(building, catalog, logistics = {}) {
  if (building.energy === 'burner') {
    const name = burnerFuel(building, catalog, logistics);
    return { name, perMinute: fuelPerMinute(building, catalog, name) };
  }
  if (building.energy !== 'fluid') return null;
  const liquid = liquidFuelOf(building, catalog, logistics.liquidFuel);
  return { name: liquid.name, perMinute: building.energyUsage / (liquid.fuelValue * building.effectivity) * 60 };
}

// The Fuel item a burner burns: the Fuel, or where it cannot burn that (Py's biomass powerplant
// burns biomass only), the one chosen for a category it burns (`logistics.fuels`), else that
// category's of most energy.
export function burnerFuel(building, catalog, logistics = {}) {
  const fits = name => catalog.fuels?.[name]?.categories.some(c => building.fuelCategories?.includes(c));
  if (!catalog.fuels || !building.fuelCategories?.length || fits(logistics.fuel)) return logistics.fuel;
  const chosen = building.fuelCategories.map(c => logistics.fuels?.[c]).find(fits);
  return chosen ?? fuelsFor(catalog, building.fuelCategories[0])[0] ?? logistics.fuel;
}

// The Fuel items of a category, most energy first.
export function fuelsFor(catalog, category) {
  return Object.values(catalog.fuels ?? {}).filter(f => f.categories.includes(category))
    .sort((a, b) => b.fuelValue - a.fuelValue || a.name.localeCompare(b.name)).map(f => f.name);
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
