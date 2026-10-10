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
  // And which recipes take each item, by name (a Byproduct Use's choices).
  const consumers = new Map();
  for (const recipe of Object.values(catalog.recipes)) {
    // A building runs the recipe where its fluid boxes take the recipe's fluids.
    const buildings = (byCategory.get(recipe.category) ?? []).filter(b => assignFluidBoxes(recipe, b));
    if (!buildings.length || !recipe.products.length) continue;
    buildingsFor.set(recipe.name, buildings.map(b => b.name));
    for (const p of recipe.products) {
      if (!producers.has(p.name)) producers.set(p.name, []);
      producers.get(p.name).push(recipe.name);
    }
    for (const name of new Set(recipe.ingredients.map(i => i.name))) {
      if (!consumers.has(name)) consumers.set(name, []);
      consumers.get(name).push(recipe.name);
    }
  }
  for (const recipes of consumers.values()) recipes.sort();
  // (An offshore pump's water first: nothing simpler makes it.)
  const rank = (item, recipe) => (catalog.recipes[recipe].category === 'offshore' ? -1 : recipe === item ? 0 : catalog.recipes[recipe].products[0].name === item ? 1 : 2);
  for (const [item, recipes] of producers) recipes.sort((a, b) => rank(item, a) - rank(item, b) || a.localeCompare(b));
  const index = { producers, buildingsFor, consumers };
  optionsOf.set(catalog, index);
  return index;
}

// goals: [{ item, rate }] (per minute)
// options: { made: [item] made in the block rather than brought by train (Goals always are),
//            selections: { [item]: { recipe, building, modules? } },
//            uses: [{ from, item, recipe, building?, modules? }] Byproduct Uses: the step `from`
//              (a step's key: its item, or a Byproduct Use's key) gives all it makes of `item` to
//              a step of `recipe`, whose products leave by train (or go to Byproduct Uses of their
//              own); one whose step no longer makes the item, or whose recipe no longer takes it,
//              is left out,
//            index: recipeOptions(catalog),
//            extra: { [item]: rate } an Extension's: so much more of a step's item made, not taken
//              (its entry's goal.extra),
//            belt: the belt the block is built with (a Recycled Byproduct's step must make no more
//              solids than a lane of it carries) }
// A step's modules are the chosen ones its building takes, or else its building's default.
// Returns the chain's steps as solve() entries — each item's rate is its Goal rate plus what its
// consumers take, Recipe Loops included (each step makes what its consumers take, a machine's
// productivity counted), then the Byproduct Uses' (`use`: { key, from, item }; `goal.from` the
// entry they take the item from), each making what all of its item takes — the Train Inputs with
// the rate the chain needs and why each comes by train, the Recipe Loops ({ item, into: the step
// taking it back, rate }), and the Byproducts ({ from, item, type, rate, recipes: those taking
// it }: what a step makes besides its item, a Byproduct Use's every product, but those used).
// Loops that take more of their items than they make come by train instead, as fluids do.
export function expandChain(goals, catalog, options = {}) {
  return expand(goals, catalog, options, false) ?? expand(goals, catalog, options, true);
}

// A Byproduct Use's key: the step it takes from and the item.
export function useKey(from, item) {
  return `${from} > ${item}`;
}

// The chain, its Recipe Loops fed in the block (or with `loopsByTrain`, by train); null when they
// cannot be (a loop takes more than it makes).
function expand(goals, catalog, { made = [], selections = {}, uses = [], index = recipeOptions(catalog), extra = {}, belt = null }, loopsByTrain) {
  const makeHere = new Set([...made, ...goals.map(g => g.item)]);
  const steps = new Map();
  const trainInputs = new Map();
  const order = [];
  const onPath = new Set();
  const loops = [];
  // The Byproduct Uses in the chain, by key.
  const used = new Map();
  // A recipe's building and modules: the wanted ones where it takes them.
  const selectionOf = (recipe, wanted) => {
    const buildings = index.buildingsFor.get(recipe);
    const building = buildings.includes(wanted?.building) ? wanted.building : buildings[0];
    if (!catalog.buildings[building].moduleSlots) return { recipe, building };
    return { recipe, building, modules: wanted?.modules ? fitting(wanted.modules, recipe, building) : defaultModules(catalog, recipe, building) };
  };
  const selectionFor = item => {
    const recipes = index.producers.get(item) ?? [];
    const wanted = selections[item];
    const recipe = recipes.includes(wanted?.recipe) ? wanted.recipe : recipes[0];
    return recipe ? selectionOf(recipe, wanted) : null;
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
  const tooMany = () => {
    if (steps.size + used.size >= MAX_STEPS) throw new Error(`the chain needs more than ${MAX_STEPS} steps; bring more items by train`);
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
    tooMany();
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

  // Byproduct Uses, each once its step is in the chain (a Use's own may take from another Use);
  // their other ingredients come as any step's do. Each makes its recipe's product named after
  // it (else its first) that is not the item it takes.
  const byproductsOf = key => {
    const step = steps.get(key) ?? used.get(key);
    if (!step) return [];
    return catalog.recipes[step.selection.recipe].products.filter(p => !steps.has(key) || p.name !== key);
  };
  for (let more = true; more;) {
    more = false;
    for (const u of uses) {
      const key = useKey(u.from, u.item);
      if (used.has(key) || !byproductsOf(u.from).some(p => p.name === u.item) || !index.consumers.get(u.item)?.includes(u.recipe)) continue;
      if (!index.buildingsFor.has(u.recipe)) continue;
      tooMany();
      const selection = selectionOf(u.recipe, u);
      const recipe = catalog.recipes[u.recipe];
      const others = recipe.products.filter(p => p.name !== u.item);
      const product = (others.find(p => p.name === u.recipe) ?? others[0] ?? recipe.products[0]).name;
      const byTrain = new Set();
      for (const { name } of recipe.ingredients) if (name !== u.item && visit(name, false)) byTrain.add(name);
      used.set(key, { selection, byTrain, from: u.from, item: u.item, product });
      more = true;
    }
  }

  // Each step makes its Goal rate plus what its consumers take: R = g + A R, A[s][t] what of s's
  // item one of t's takes (its recipe's amount over the item a craft makes, productivity
  // counted). A Byproduct Use's row is what of its item one of its step's gives it. Without
  // Recipe Loops or Uses this is the steps in turn, consumers first; with them, a linear system.
  const keys = [...order, ...used.keys()];
  const n = keys.length;
  const at = new Map(keys.map((key, k) => [key, k]));
  const stepOf = key => steps.get(key) ?? used.get(key);
  const itemOf = key => used.get(key)?.product ?? key;
  const recipeOf = key => catalog.recipes[stepOf(key).selection.recipe];
  const productivity = keys.map(key => {
    const { selection } = stepOf(key);
    return 1 + machineEffect(catalog, selection.recipe, selection.building, selection.modules).productivity;
  });
  const makes = (key, item) => recipeOf(key).products.filter(p => p.name === item).reduce((sum, p) => sum + p.amount, 0) * productivity[at.get(key)];
  const perCraft = keys.map(key => makes(key, itemOf(key)));
  const a = Array.from({ length: n }, () => new Float64Array(n));
  keys.forEach((key, t) => {
    const use = used.get(key);
    for (const { name, amount } of recipeOf(key).ingredients) {
      if (use && name === use.item) continue;
      if (!stepOf(key).byTrain.has(name) && steps.has(name)) a[at.get(name)][t] += amount / perCraft[t];
    }
    if (use) {
      const takes = recipeOf(key).ingredients.filter(i => i.name === use.item).reduce((sum, i) => sum + i.amount, 0);
      const from = at.get(use.from);
      a[t][from] += makes(use.from, use.item) / perCraft[from] / takes * perCraft[t];
    }
  });
  const goal = new Float64Array(n);
  for (const g of goals) goal[at.get(g.item)] += g.rate;
  // (An Extension's: made beyond what is taken, for an Annex to draw.)
  for (const [item, rate] of Object.entries(extra)) if (steps.has(item)) goal[at.get(item)] += rate;
  const rates = loops.length || used.size ? solve(a, goal)?.map(r => Math.round(r * 1e9) / 1e9) : consumersFirst(a, goal);
  if (!rates || rates.some(r => !Number.isFinite(r) || r < 0)) return null;
  keys.forEach((key, t) => {
    for (const { name, amount } of recipeOf(key).ingredients) {
      if (stepOf(key).byTrain.has(name)) trainInputs.get(name).rate += amount * rates[t] / perCraft[t];
    }
  });
  // Recycled Byproducts: an ingredient that would come by train though a step makes at least as
  // much of it besides its item is taken from that step instead (the one making most), what it
  // makes beyond leaving by train. A fluid only where the steps taking it do not feed that step
  // (a fluid fed back comes by train, as a Recipe Loop's does).
  const ratesOf = key => rates[at.get(key)] / perCraft[at.get(key)];
  const feeds = (a, b, seen = new Set()) => a === b || (!seen.has(a) && seen.add(a)
    && keys.some(k => recipeOf(k).ingredients.some(i => i.name === itemOf(a) && !stepOf(k).byTrain.has(i.name)) && feeds(k, b, seen)));
  const recycled = [];
  const takesFrom = new Map();
  for (const input of [...trainInputs.values()]) {
    if (input.reason !== 'import') continue;
    const item = input.item;
    const takers = keys.filter(k => stepOf(k).byTrain.has(item));
    const fluid = recipeOf(takers[0]).ingredients.find(i => i.name === item).type === 'fluid';
    const makers = keys.filter(k => itemOf(k) !== item && !takers.includes(k) && !used.has(useKey(k, item)) && recipeOf(k).products.some(p => p.name === item))
      .filter(k => !fluid || !takers.some(t => feeds(t, k)))
      .map(k => ({ key: k, rate: makes(k, item) * ratesOf(k) }))
      .sort((a, b) => b.rate - a.rate);
    const from = makers[0];
    if (!from || from.rate < input.rate * (1 - 1e-9)) continue;
    // (A solid only where one lane carries all its step makes, the item with the rest: the
    // feedback is tapped off one output belt, every product on its far lane.)
    const lane = belt && catalog.belts?.[belt] ? catalog.belts[belt].itemsPerSecond * 30 : Infinity;
    const solid = new Set(recipeOf(from.key).products.filter(p => p.type === 'item').map(p => p.name));
    if (!fluid && [...solid].reduce((sum, name) => sum + makes(from.key, name) * ratesOf(from.key), 0) > lane * (1 + 1e-9)) continue;
    trainInputs.delete(item);
    for (const k of takers) {
      stepOf(k).byTrain.delete(item);
      takesFrom.set(k, { ...takesFrom.get(k), [item]: from.key });
    }
    recycled.push({ item, from: from.key, into: takers, rate: input.rate, spare: Math.max(0, from.rate - input.rate) });
  }
  // A step's ingredient that a step makes but comes by train (a loop's fluid, or a loop taking
  // more than it makes): the layout brings it by train too.
  const looping = item => [...steps.get(item).byTrain].filter(name => steps.has(name));
  // The entries: the steps, then the Byproduct Uses.
  const entryOf = new Map([...[...order].reverse(), ...used.keys()].map((key, k) => [key, k]));
  const fromOf = (key, from = {}) => {
    const taken = Object.entries(takesFrom.get(key) ?? {}).map(([item, k]) => [item, entryOf.get(k)]);
    return taken.length || Object.keys(from).length ? { from: { ...from, ...Object.fromEntries(taken) } } : {};
  };
  return {
    entries: [
      ...[...order].reverse().map(item => ({
        goal: { item, rate: rates[at.get(item)], ...fromOf(item), ...(extra[item] > 0 ? { extra: extra[item] } : {}) }, selection: steps.get(item).selection,
        ...(looping(item).length ? { byTrain: looping(item) } : {}),
      })),
      ...[...used].map(([key, u]) => ({
        goal: { item: u.product, rate: rates[at.get(key)], ...fromOf(key, { [u.item]: entryOf.get(u.from) }) }, selection: u.selection,
        use: { key, from: u.from, item: u.item },
      })),
    ],
    trainInputs: [...trainInputs.values()],
    loops: loops.map(({ item, into }) => ({
      item, into, rate: recipeOf(into).ingredients.filter(i => i.name === item).reduce((sum, i) => sum + i.amount, 0) * rates[at.get(into)] / perCraft[at.get(into)],
    })),
    recycled,
    // (What a Recycled Byproduct's step makes beyond what is taken back.)
    byproducts: keys.flatMap((key, t) => byproductsOf(key).filter((p, k, all) => all.findIndex(q => q.name === p.name) === k && !used.has(useKey(key, p.name))).map(p => ({
      from: key, item: p.name, type: p.type,
      rate: makes(key, p.name) * rates[t] / perCraft[t] - recycled.filter(r => r.from === key && r.item === p.name).reduce((sum, r) => sum + r.rate, 0),
      recipes: (index.consumers.get(p.name) ?? []).filter(r => index.buildingsFor.has(r)),
    })).filter(b => b.rate > 1e-9)),
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
