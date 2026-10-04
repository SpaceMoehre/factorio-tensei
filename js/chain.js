// Production Chain: the Goals plus a Sub-Block for every ingredient the user chose to make in the
// block, recursively. Everything else a step needs is a Train Input: by default every ingredient
// of a Goal's recipe, and also items no recipe makes. A step's item that a step it feeds (or the
// step itself) takes again is a Recipe Loop: the block makes it for both and feeds the loop
// itself (a fluid comes back by train instead).

import { defaultModules, moduleOptions, machineEffect } from './modules.js';
import { assignFluidBoxes } from './fluidboxes.js';

const MAX_STEPS = 60;

// Which recipes make each item (best first) and which buildings can run each recipe (slowest
// first): a recipe named after the item, then one whose first product it is. Built once per
// catalog (thousands of recipes and buildings in a big mod set).
const optionsOf = new WeakMap();
export function recipeOptions(catalog) {
  if (optionsOf.has(catalog)) return optionsOf.get(catalog);
  // Buildings by crafting category, slowest first.
  const byCategory = new Map();
  const sorted = Object.values(catalog.buildings).sort((a, b) => a.craftingSpeed - b.craftingSpeed || a.name.localeCompare(b.name));
  for (const b of sorted) {
    for (const category of new Set(b.categories)) {
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(b);
    }
  }
  const buildingsFor = new Map();
  const producers = new Map();
  for (const recipe of Object.values(catalog.recipes)) {
    // A building runs the recipe where its fluid boxes take the recipe's fluids.
    const buildings = (byCategory.get(recipe.category) ?? []).filter(b => assignFluidBoxes(recipe, b));
    if (!buildings.length || !recipe.products.length) continue;
    buildingsFor.set(recipe.name, buildings.map(b => b.name));
    for (const p of recipe.products) {
      if (!producers.has(p.name)) producers.set(p.name, []);
      producers.get(p.name).push(recipe.name);
    }
  }
  const rank = (item, recipe) => (recipe === item ? 0 : catalog.recipes[recipe].products[0].name === item ? 1 : 2);
  for (const [item, recipes] of producers) recipes.sort((a, b) => rank(item, a) - rank(item, b) || a.localeCompare(b));
  const index = { producers, buildingsFor };
  optionsOf.set(catalog, index);
  return index;
}

// goals: [{ item, rate }] (per minute)
// options: { made: [item] made in the block rather than brought by train (Goals always are),
//            selections: { [item]: { recipe, building, modules? } }, index: recipeOptions(catalog) }
// A step's modules are the chosen ones its building takes, or else its building's default.
// Returns the chain's steps as solve() entries — each item's rate is its Goal rate plus what its
// consumers take, Recipe Loops included (each step makes what its consumers take, a machine's
// productivity counted) — the Train Inputs with the rate the chain needs and why each comes by
// train, and the Recipe Loops ({ item, into: the step taking it back, rate }). Loops that take
// more of their items than they make come by train instead, as fluids do.
export function expandChain(goals, catalog, options = {}) {
  return expand(goals, catalog, options, false) ?? expand(goals, catalog, options, true);
}

// The chain, its Recipe Loops fed in the block (or with `loopsByTrain`, by train); null when they
// cannot be (a loop takes more than it makes).
function expand(goals, catalog, { made = [], selections = {}, index = recipeOptions(catalog) }, loopsByTrain) {
  const makeHere = new Set([...made, ...goals.map(g => g.item)]);
  const steps = new Map();
  const trainInputs = new Map();
  const order = [];
  const onPath = new Set();
  const loops = [];
  const selectionFor = item => {
    const recipes = index.producers.get(item) ?? [];
    const wanted = selections[item];
    const recipe = recipes.includes(wanted?.recipe) ? wanted.recipe : recipes[0];
    if (!recipe) return null;
    const buildings = index.buildingsFor.get(recipe);
    const building = buildings.includes(wanted?.building) ? wanted.building : buildings[0];
    if (!catalog.buildings[building].moduleSlots) return { recipe, building };
    return { recipe, building, modules: wanted?.modules ? fitting(wanted.modules, recipe, building) : defaultModules(catalog, recipe, building) };
  };
  // The chosen modules this building takes, within its slots.
  const fitting = (modules, recipe, building) => {
    const options = moduleOptions(catalog, recipe, building);
    let free = catalog.buildings[building].moduleSlots;
    return modules.filter(m => options.includes(m.name)).flatMap(m => {
      const count = Math.min(m.count, free);
      free -= count;
      return count > 0 ? [{ name: m.name, count }] : [];
    });
  };
  const toTrain = (item, reason) => {
    if (!trainInputs.has(item)) trainInputs.set(item, { item, rate: 0, reason });
    return true;
  };
  // Depth first, so every step comes after all the steps it feeds (reversed post-order).
  // Returns true when the item comes by train for this consumer.
  const visit = (item, isGoal) => {
    if (steps.has(item)) return false;
    const selection = selectionFor(item);
    if (!isGoal && !makeHere.has(item)) return toTrain(item, selection ? 'import' : 'no recipe');
    if (!selection) {
      if (isGoal) throw new Error(`no recipe and building can produce “${item}”`);
      return toTrain(item, 'no recipe');
    }
    if (steps.size >= MAX_STEPS) throw new Error(`the chain needs more than ${MAX_STEPS} steps; bring more items by train`);
    onPath.add(item);
    const byTrain = new Set();
    for (const { name, type } of catalog.recipes[selection.recipe].ingredients) {
      // A step on the way here (or this one) makes it: a Recipe Loop, fed in the block (a fluid
      // by train).
      if (name === item || onPath.has(name)) {
        if (type === 'fluid' || loopsByTrain) byTrain.add(name) && toTrain(name, 'cycle');
        else loops.push({ item: name, into: item });
      } else if (visit(name, false)) byTrain.add(name);
    }
    onPath.delete(item);
    steps.set(item, { selection, byTrain });
    order.push(item);
    return false;
  };
  for (const goal of goals) visit(goal.item, true);

  // Each step makes its Goal rate plus what its consumers take: R = g + A R, A[s][t] what of s's
  // item one of t's takes (its recipe's amount over the item a craft makes, productivity
  // counted). Without Recipe Loops this is the steps in turn, consumers first; with them, a
  // linear system.
  const n = order.length;
  const at = new Map(order.map((item, k) => [item, k]));
  const recipeOf = item => catalog.recipes[steps.get(item).selection.recipe];
  const perCraft = order.map(item => {
    const { selection } = steps.get(item);
    const { productivity } = machineEffect(catalog, selection.recipe, selection.building, selection.modules);
    return recipeOf(item).products.find(p => p.name === item).amount * (1 + productivity);
  });
  const a = Array.from({ length: n }, () => new Float64Array(n));
  order.forEach((item, t) => {
    for (const { name, amount } of recipeOf(item).ingredients) {
      if (!steps.get(item).byTrain.has(name) && at.has(name)) a[at.get(name)][t] += amount / perCraft[t];
    }
  });
  const goal = new Float64Array(n);
  for (const g of goals) goal[at.get(g.item)] += g.rate;
  const rates = loops.length ? solve(a, goal)?.map(r => Math.round(r * 1e9) / 1e9) : consumersFirst(a, goal);
  if (!rates || rates.some(r => !Number.isFinite(r) || r < 0)) return null;
  order.forEach((item, t) => {
    for (const { name, amount } of recipeOf(item).ingredients) {
      if (steps.get(item).byTrain.has(name)) trainInputs.get(name).rate += amount * rates[t] / perCraft[t];
    }
  });
  // A step's ingredient that a step makes but comes by train (a loop's fluid, or a loop taking
  // more than it makes): the layout brings it by train too.
  const looping = item => [...steps.get(item).byTrain].filter(name => steps.has(name));
  return {
    entries: [...order].reverse().map(item => ({
      goal: { item, rate: rates[at.get(item)] }, selection: steps.get(item).selection,
      ...(looping(item).length ? { byTrain: looping(item) } : {}),
    })),
    trainInputs: [...trainInputs.values()],
    loops: loops.map(({ item, into }) => ({
      item, into, rate: recipeOf(into).ingredients.filter(i => i.name === item).reduce((sum, i) => sum + i.amount, 0) * rates[at.get(into)] / perCraft[at.get(into)],
    })),
  };
}

// x = b + A x for steps in post-order (each before the steps it feeds), no step feeding one
// before it: the consumers' take first, step by step.
function consumersFirst(a, b) {
  const x = [...b];
  for (let s = b.length - 1; s >= 0; s--) for (let t = s + 1; t < b.length; t++) x[s] += a[s][t] * x[t];
  return x;
}

// (I - A) x = b by Gaussian elimination with partial pivoting; null when singular.
function solve(a, b) {
  const n = b.length;
  const m = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0) - a[i][j]), b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || !m[r][c]) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}
