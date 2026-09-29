export function planSubBlocks(entries, catalog) {
  const seen = new Set();
  return entries.map(({ goal, selection }) => {
    if (!(goal.rate > 0)) throw new Error(`${goal.item}: the rate must be above 0`);
    if (seen.has(goal.item)) throw new Error(`${goal.item} is a Goal more than once; combine them into one Goal`);
    seen.add(goal.item);
    const recipe = catalog.recipes[selection.recipe];
    const building = catalog.buildings[selection.building];
    const perCraft = recipe.products.find(p => p.name === goal.item).amount;
    const perMachinePerMinute = (building.craftingSpeed / recipe.time) * perCraft * 60;
    const craftsPerMinute = goal.rate / perCraft;
    const flow = ({ name, type, amount }) => ({ name, type, rate: amount * craftsPerMinute });
    const outputs = recipe.products.map(flow);
    return {
      item: goal.item,
      rate: goal.rate,
      recipe: selection.recipe,
      building: selection.building,
      count: Math.ceil(goal.rate / perMachinePerMinute),
      inputs: recipe.ingredients.map(flow),
      outputs,
      byproducts: outputs.filter(o => o.name !== goal.item),
    };
  });
}
