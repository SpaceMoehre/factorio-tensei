// Production Chain: the Goals plus a Sub-Block for every ingredient the block makes itself,
// recursively, down to the Train Inputs — items the user brings by train, items no recipe
// makes, and items a recipe would have to make from themselves.

const MAX_STEPS = 60;

// Which recipes make each item (best first) and which buildings can run each recipe (slowest
// first): a recipe named after the item, then one whose first product it is.
export function recipeOptions(catalog) {
  const buildingsFor = new Map();
  const producers = new Map();
  for (const recipe of Object.values(catalog.recipes)) {
    const buildings = Object.values(catalog.buildings)
      .filter(b => b.categories.includes(recipe.category) && hasFluidBoxes(b, recipe))
      .sort((a, b) => a.craftingSpeed - b.craftingSpeed || a.name.localeCompare(b.name));
    if (!buildings.length || !recipe.products.length) continue;
    buildingsFor.set(recipe.name, buildings.map(b => b.name));
    for (const p of recipe.products) {
      if (!producers.has(p.name)) producers.set(p.name, []);
      producers.get(p.name).push(recipe.name);
    }
  }
  const rank = (item, recipe) => (recipe === item ? 0 : catalog.recipes[recipe].products[0].name === item ? 1 : 2);
  for (const [item, recipes] of producers) recipes.sort((a, b) => rank(item, a) - rank(item, b) || a.localeCompare(b));
  return { producers, buildingsFor };
}

function hasFluidBoxes(building, recipe) {
  const inputs = building.fluidBoxes.filter(b => b.production !== 'output').length;
  const outputs = building.fluidBoxes.filter(b => b.production !== 'input').length;
  return recipe.ingredients.filter(i => i.type === 'fluid').length <= inputs
    && recipe.products.filter(p => p.type === 'fluid').length <= outputs;
}

// goals: [{ item, rate }] (per minute)
// options: { inputs: [item] brought by train, selections: { [item]: { recipe, building } },
//            index: recipeOptions(catalog) }
// Returns the chain's steps as solve() entries — each item's rate is its Goal rate plus what its
// consumers take — and the Train Inputs with the rate the chain needs and why each comes by train.
export function expandChain(goals, catalog, { inputs = [], selections = {}, index = recipeOptions(catalog) } = {}) {
  const chosenInputs = new Set(inputs);
  const steps = new Map();
  const trainInputs = new Map();
  const order = [];
  const onPath = new Set();
  const selectionFor = item => {
    const recipes = index.producers.get(item) ?? [];
    const wanted = selections[item];
    const recipe = recipes.includes(wanted?.recipe) ? wanted.recipe : recipes[0];
    if (!recipe) return null;
    const buildings = index.buildingsFor.get(recipe);
    return { recipe, building: buildings.includes(wanted?.building) ? wanted.building : buildings[0] };
  };
  const toTrain = (item, reason) => {
    if (!trainInputs.has(item)) trainInputs.set(item, { item, rate: 0, reason });
    return true;
  };
  // Depth first, so every step comes after all the steps it feeds (reversed post-order).
  // Returns true when the item comes by train for this consumer.
  const visit = (item, isGoal) => {
    if (steps.has(item)) return false;
    if (onPath.has(item)) return toTrain(item, 'cycle');
    if (!isGoal && chosenInputs.has(item)) return toTrain(item, 'chosen');
    const selection = selectionFor(item);
    if (!selection) {
      if (isGoal) throw new Error(`no recipe and building can produce “${item}”`);
      return toTrain(item, 'no recipe');
    }
    if (steps.size >= MAX_STEPS) throw new Error(`the chain needs more than ${MAX_STEPS} steps; bring more items by train`);
    onPath.add(item);
    const byTrain = new Set();
    for (const { name } of catalog.recipes[selection.recipe].ingredients) {
      if (name === item ? toTrain(item, 'cycle') : visit(name, false)) byTrain.add(name);
    }
    onPath.delete(item);
    // A Goal met earlier as a chosen Train Input is made here after all.
    if (trainInputs.get(item)?.reason === 'chosen') trainInputs.delete(item);
    steps.set(item, { selection, rate: 0, byTrain });
    order.push(item);
    return false;
  };
  for (const goal of goals) visit(goal.item, true);

  for (const goal of goals) steps.get(goal.item).rate += goal.rate;
  for (const item of [...order].reverse()) {
    const { selection, rate, byTrain } = steps.get(item);
    const recipe = catalog.recipes[selection.recipe];
    const crafts = rate / recipe.products.find(p => p.name === item).amount;
    for (const { name, amount } of recipe.ingredients) {
      (byTrain.has(name) ? trainInputs.get(name) : steps.get(name)).rate += amount * crafts;
    }
  }
  return {
    entries: [...order].reverse().map(item => ({ goal: { item, rate: steps.get(item).rate }, selection: steps.get(item).selection })),
    trainInputs: [...trainInputs.values()],
  };
}
