// Production Chain: the Goals plus a Sub-Block for every ingredient the user chose to make in the
// block, recursively. Everything else a step needs is a Train Input: by default every ingredient
// of a Goal's recipe, and also items no recipe makes. A step's item that a step it feeds (or the
// step itself) takes again is a Recipe Loop: the block makes it for both and feeds the loop
// itself (a fluid comes back by train instead).

import { defaultModules, moduleOptions, machineEffect } from './modules.js';
import { assignFluidBoxes } from './fluidboxes.js';
import { fuelOf, laneRate } from './plan.js';
import { displayName } from './names.js';

const MAX_STEPS = 60;

// Which recipes make each item (best first) and which buildings can run each recipe (slowest
// first): a recipe named after the item, then one whose first product it is. Built once per
// catalog, Science Packs and TURD choices (thousands of recipes and buildings in a big mod set).
// sciencePacks: the packs the user researches with (ADR 0121): only recipes on at start or
// researched with them are offered (one no research unlocks, a mod's script's: Py's TURD upgrades,
// not); none given, every one. A building is offered while a recipe making it is.
// turds: Py's TURD upgrades chosen, { [upgrade technology]: its choice } (ADR 0122): a recipe a TURD
// choice unlocks is offered only where it is chosen (and its technology researched with the packs),
// one it replaces no longer; so too the buildings a choice replaces (Py's -turd machines, ADR 0123),
// and the buildings a chosen choice affects take its effect (`bonus`, by building: a selection's
// `bonus`, machineEffect's); none given, as above.
const optionsOf = new WeakMap();
export function recipeOptions(catalog, sciencePacks = null, turds = null) {
  const key = `${sciencePacks ? [...sciencePacks].sort().join() : '*'}|${turds ? Object.entries(turds).sort().join(';') : '*'}`;
  if (!optionsOf.has(catalog)) optionsOf.set(catalog, new Map());
  const kept = optionsOf.get(catalog);
  if (kept.has(key)) return kept.get(key);
  const owned = sciencePacks && new Set((catalog.sciencePacks ?? []).flatMap((p, i) => (sciencePacks.includes(p) ? [i] : [])));
  const researched = entry => !owned || !entry.unlock || entry.unlock.some(set => set.every(i => owned.has(i)));
  // TURD: every recipe a choice unlocks (or brings in its replacement), those the chosen ones do,
  // and those the chosen ones replace.
  const ofTurds = new Set();
  const granted = new Set();
  const replaced = new Set();
  // The same of buildings, and each building's effect from the chosen choices (summed).
  const turdMachines = new Set();
  const machinesGranted = new Set();
  const machinesReplaced = new Set();
  const bonus = new Map();
  // (A building a chosen choice replaces: its TURD building, by name, ADR 0129.)
  const replacedBy = new Map();
  if (turds) {
    for (const u of catalog.turds ?? []) {
      for (const c of u.choices) {
        const brought = [...c.unlock, ...Object.values(c.replace)];
        for (const r of brought) ofTurds.add(r);
        for (const b of Object.values(c.machines ?? {})) turdMachines.add(b);
        if (turds[u.name] !== c.name || !researched(u)) continue;
        for (const r of brought) granted.add(r);
        for (const r of Object.keys(c.replace)) replaced.add(r);
        for (const [old, now] of Object.entries(c.machines ?? {})) {
          machinesReplaced.add(old);
          machinesGranted.add(now);
          replacedBy.set(old, now);
        }
        for (const [b, effect] of Object.entries(c.effects ?? {})) {
          const sum = { ...bonus.get(b) };
          for (const [k, v] of Object.entries(effect)) sum[k] = (sum[k] ?? 0) + v;
          bonus.set(b, sum);
        }
      }
    }
  }
  const unlocked = recipe => {
    if (replaced.has(recipe.name)) return false;
    if (granted.has(recipe.name)) return true;
    // (A TURD recipe research unlocks too stays: Py's heatsink.)
    if (ofTurds.has(recipe.name) && recipe.unlock?.length === 0) return false;
    return researched(recipe);
  };
  const made = b => {
    if (machinesReplaced.has(b.name) || (turdMachines.has(b.name) && !machinesGranted.has(b.name))) return false;
    return !b.madeBy || b.madeBy.some(r => catalog.recipes[r] && unlocked(catalog.recipes[r]));
  };
  // Buildings by crafting category, slowest first.
  const byCategory = new Map();
  const sorted = Object.values(catalog.buildings).filter(made).sort((a, b) => a.craftingSpeed - b.craftingSpeed || a.name.localeCompare(b.name));
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
    if (!unlocked(recipe)) continue;
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
  const index = { producers, buildingsFor, consumers, bonus, replacedBy };
  kept.set(key, index);
  return index;
}

// goals: [{ item, rate }] (per minute)
// options: { made: [item] made in the block rather than brought by train (Goals always are),
//            selections: { [item]: { recipe, building, modules? } },
//            uses: [{ from?, item, recipe, building?, modules? }] Byproduct Uses: the step `from`
//              (a step's key: its item, or a Byproduct Use's key) gives all it makes of `item` to
//              a step of `recipe`, whose products go to the steps taking them (Supplied Items,
//              Recycled Byproducts) or leave by train (or go to Byproduct Uses of their own); one
//              whose step no longer makes the item, or whose recipe no longer takes it, is left
//              out. Without `from`, a General Use: one step of `recipe` takes all of `item` every
//              step (and Use) makes besides its own item, but where a Use names that step for it
//              (and a step of `recipe` itself), its key useKey(EVERY, item),
//            sciencePacks: the packs researched with, null for every one (ADR 0121),
//            turds: Py's TURD upgrades chosen, { [technology]: choice }, null for every one (ADR 0122),
//            index: recipeOptions(catalog, sciencePacks, turds),
//            extra: { [item]: rate } an Extension's: so much more of a step's item made, not taken
//              (its entry's goal.extra),
//            belt: the belt the block is built with, else logistics.belt (a Recycled Byproduct's
//              step must make no more solids than a lane of it carries),
//            exports: items made here leaving by train too, voids: fluids leaving destroyed,
//            valves: false for no Fed-back Fluids (Bands) }
// A step's modules are the chosen ones its building takes, or else its building's default.
// Returns the chain's steps as solve() entries — each item's rate is its Goal rate plus what its
// consumers take, Recipe Loops included (each step makes what its consumers take, a machine's
// productivity counted), less what Byproduct Uses supply of it, then the Byproduct Uses' (`use`:
// { key, from, item, sources? }: a General Use's `from` the step making most of its item, its
// `sources` every one; `goal.from` the entry they take the item from; `goal.joins`: item → the
// entry whose belt or pipe of it what they make of it joins — a Supplied Item's, or a General
// Use's other sources'), each making what all of its item takes — the Supplied Items ({ from,
// item, into, rate }), the Train Inputs with
// the rate the chain needs and why each comes by train, the Recipe Loops ({ item, into: the step
// taking it back, rate }), and the Byproducts ({ from, item, type, rate, recipes: those taking
// it }: what a step makes besides its item, a Byproduct Use's every product, but those used).
// Loops that take more of their items than they make come by train instead, as fluids do.
export function expandChain(goals, catalog, options = {}) {
  const chain = expand(goals, catalog, options, false) ?? expand(goals, catalog, options, true);
  if (chain) return chain;
  // No rates balance it even with the loops by train: what a Recipe Loop or a Byproduct Use feeds
  // back grows without end. Said with the Uses the chain balances without (ADR 0126).
  const uses = options.uses ?? [];
  const index = options.index ?? recipeOptions(catalog, options.sciencePacks ?? null, options.turds ?? null);
  const culprits = uses.filter(u => expand(goals, catalog, { ...options, index, uses: uses.filter(v => v !== u) }, true));
  const named = u => `${displayName(u.item)} by ${displayName(u.recipe)}`;
  throw new Error(culprits.length
    ? `no rates balance this chain: the Byproduct Uses feed back more than they take (each takes all of its item, its recipe's other ingredients by train); without the Use of ${culprits.map(named).join(' or ')} it balances`
    : 'no rates balance this chain: its Recipe Loops and Byproduct Uses feed back more than they take');
}

// Where a fluid fed back covers all its takers take (or more), what makes up the rest still
// makes this share of it: so a loop starts (Py's coalbed gas gives back all the water its vacuum
// pumps take) and keeps up (ADR 0062).
const TOP_UP = 0.01;

// The valves fluid fed back goes through (ADR 0062): the overflow valve letting a byproduct's
// spare off, the top-up valve letting what makes up the rest in; null where the catalog has
// none one can build (base 2.0's are hidden).
export function valvesOf(catalog) {
  const all = Object.values(catalog.valves ?? {});
  const overflow = all.find(v => v.mode === 'overflow');
  const topUp = all.find(v => v.mode === 'top-up');
  return overflow && topUp ? { overflow: overflow.name, topUp: topUp.name } : null;
}

// A General Use's `from` in its key: every step.
export const EVERY = '*';

// A Byproduct Use's key: the step it takes from and the item.
export function useKey(from, item) {
  return `${from} > ${item}`;
}

// The chain, its Recipe Loops fed in the block (or with `loopsByTrain`, by train); null when they
// cannot be (a loop takes more than it makes).
function expand(goals, catalog, { made = [], selections = {}, uses = [], sciencePacks = null, turds = null, index = recipeOptions(catalog, sciencePacks, turds), extra = {}, belt = null, exports = [], voids = [], valves = true, logistics = null }, loopsByTrain) {
  belt ??= logistics?.belt ?? null;
  const valved = valves && valvesOf(catalog) !== null;
  const makeHere = new Set([...made, ...goals.map(g => g.item)]);
  const steps = new Map();
  const trainInputs = new Map();
  const order = [];
  const onPath = new Set();
  const loops = [];
  // The Byproduct Uses in the chain, by key.
  const used = new Map();
  // The buildings the user chose, each with how many recipes it was chosen for.
  const chosen = new Map();
  // (One a chosen TURD choice replaces: its TURD building, ADR 0123.)
  const builtAs = b => index.replacedBy?.get(b) ?? b;
  for (const s of [...Object.values(selections), ...uses]) {
    if (s?.building && catalog.buildings[s.building]) chosen.set(builtAs(s.building), (chosen.get(builtAs(s.building)) ?? 0) + 1);
  }
  // A recipe's building and modules: the wanted ones where it takes them. Else a building the user
  // chose for another recipe that runs this one too (the one chosen for most, then the fastest),
  // else the fastest one researched (ADR 0129: Py's automated factory mk01 chosen for small parts
  // runs the gears too; none chosen, the mk04 where the packs unlock it).
  const selectionOf = (recipe, wanted) => {
    const buildings = index.buildingsFor.get(recipe);
    const mine = buildings.filter(b => chosen.has(b));
    const building = buildings.includes(wanted?.building) ? wanted.building
      : wanted?.building && buildings.includes(builtAs(wanted.building)) ? builtAs(wanted.building)
        : mine.length ? mine.reduce((best, b) => (chosen.get(b) >= chosen.get(best) ? b : best)) : buildings.at(-1);
    // (A TURD choice's effect on the building, ADR 0123.)
    const bonus = index.bonus?.get(building);
    if (!catalog.buildings[building].moduleSlots) return { recipe, building, ...(bonus ? { bonus } : {}) };
    return { recipe, building, modules: wanted?.modules ? fitting(wanted.modules, recipe, building) : defaultModules(catalog, recipe, building), ...(bonus ? { bonus } : {}) };
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
  // A recipe's ingredients as its building takes them: with the fuel its machines burn a craft (the
  // Fuel item, or the Liquid Fuel), an ingredient like any other, made in the block where the user
  // makes it, else by train (plan.js adds it to the Sub-Block's inputs). (Py's BOF burns the coal
  // its chain makes, ADR 0063.) Errors are plan.js's to report.
  const withFuel = new Map();
  const ingredientsFor = selection => {
    const key = `${selection.recipe}|${selection.building}|${JSON.stringify(selection.modules ?? [])}`;
    if (withFuel.has(key)) return withFuel.get(key);
    const recipe = catalog.recipes[selection.recipe];
    const building = catalog.buildings[selection.building];
    let fuel = null;
    try { fuel = logistics && fuelOf(building, catalog, logistics); } catch { fuel = null; }
    let list = recipe.ingredients;
    if (fuel) {
      const effect = machineEffect(catalog, selection.recipe, selection.building, selection.modules, selection.bonus);
      const amount = fuel.perMinute * effect.consumption * recipe.time / (building.craftingSpeed * effect.speed * 60);
      const type = building.energy === 'burner' ? 'item' : 'fluid';
      // (A fluid heating its machine comes at its temperature or hotter, ADR 0123.)
      const hot = fuel.temperature !== undefined ? { minTemperature: fuel.temperature } : {};
      list = list.some(i => i.name === fuel.name)
        ? list.map(i => (i.name === fuel.name ? { ...i, amount: i.amount + amount, ...hot } : i))
        : [...list, { type, name: fuel.name, amount, ...hot }];
    }
    withFuel.set(key, list);
    return list;
  };
  // Its products as its building makes them: with the fuel's Burnt Result (Py's ash), one for each
  // Fuel item burnt, a byproduct like any other (`burnt`: no productivity adds to it).
  const withAsh = new Map();
  const productsFor = selection => {
    const key = `${selection.recipe}|${selection.building}|${JSON.stringify(selection.modules ?? [])}`;
    if (withAsh.has(key)) return withAsh.get(key);
    const recipe = catalog.recipes[selection.recipe];
    const building = catalog.buildings[selection.building];
    let fuel = null;
    try { fuel = logistics && building.energy === 'burner' && fuelOf(building, catalog, logistics); } catch { fuel = null; }
    const burnt = fuel && catalog.fuels?.[fuel.name]?.burntResult;
    let list = recipe.products;
    if (burnt) {
      const effect = machineEffect(catalog, selection.recipe, selection.building, selection.modules, selection.bonus);
      const amount = fuel.perMinute * effect.consumption * recipe.time / (building.craftingSpeed * effect.speed * 60);
      list = [...list, { type: 'item', name: burnt, amount, burnt: true }];
    }
    withAsh.set(key, list);
    return list;
  };
  const toTrain = (item, reason) => {
    if (!trainInputs.has(item)) trainInputs.set(item, { item, rate: 0, reason });
    return true;
  };
  // Fluid temperatures (ADR 0067): what a recipe makes a fluid at (its default where it names
  // none), and whether an ingredient takes it at that.
  const heatOf = (recipe, name) => catalog.recipes[recipe].products.find(p => p.name === name)?.temperature ?? catalog.temperatures?.[name] ?? 15;
  const takesAt = (ingredient, t) => !ingredient || ((ingredient.minTemperature ?? -Infinity) <= t && t <= (ingredient.maxTemperature ?? Infinity));
  const ranged = ingredient => ingredient?.minTemperature !== undefined || ingredient?.maxTemperature !== undefined;
  const stepOf = key => steps.get(key) ?? used.get(key);
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
      if (isGoal) throw new Error(index !== recipeOptions(catalog) && recipeOptions(catalog).producers.has(item) ? `nothing the science packs and TURD upgrades chosen unlock makes “${item}”` : `no recipe and building can produce “${item}”`);
      return toTrain(item, 'no recipe');
    }
    tooMany();
    onPath.add(item);
    const byTrain = new Set();
    for (const ingredient of ingredientsFor(selection)) {
      const { name, type } = ingredient;
      // A step on the way here (or this one) makes it: a Recipe Loop, fed in the block (a fluid
      // by train).
      if (name === item || onPath.has(name)) {
        if (type === 'fluid' || loopsByTrain) byTrain.add(name) && toTrain(name, 'cycle');
        else loops.push({ item: name, into: item });
      } else if (visit(name, false)) byTrain.add(name);
      // (Its step makes it hotter or colder than it takes: by train, ADR 0067.)
      else if (ranged(ingredient) && steps.has(name) && !takesAt(ingredient, heatOf(steps.get(name).selection.recipe, name))) byTrain.add(name) && toTrain(name, 'temperature');
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
    return productsFor(step.selection).filter(p => !steps.has(key) || p.name !== key);
  };
  const named = uses.filter(u => u.from != null && u.from !== EVERY);
  // (A General Use's: every step and Use making it besides its own item, but one a Use names for
  // it, a step of its recipe and itself.)
  // (And a Use taking a fluid at a temperature only, from steps making it so, ADR 0067.)
  const fits = (u, from) => takesAt(catalog.recipes[u.recipe]?.ingredients.find(i => i.name === u.item), heatOf(stepOf(from).selection.recipe, u.item));
  const sourcesOf = (u, key) => [...order, ...used.keys()].filter(from => from !== key && stepOf(from).selection.recipe !== u.recipe
    && !named.some(v => v.from === from && v.item === u.item) && byproductsOf(from).some(p => p.name === u.item) && fits(u, from));
  const addUse = (u, from) => {
    const key = useKey(from ?? EVERY, u.item);
    if (used.has(key) || !index.consumers.get(u.item)?.includes(u.recipe) || !index.buildingsFor.has(u.recipe)) return false;
    // (A General Use of a fluid by a recipe a step or another Use runs already is that one's, not
    // a second step of it: the fluid is fed back to it as any byproduct would be, through valves,
    // the train bringing the rest (Py's purex antimony void taking the sb phosphate 2 and the
    // purex concentrate both, antimony phosphate the phosphoric acid; ADR 0130). A solid's stays
    // a step of its own: fed back it must cover all its step takes.)
    if (!from && valved && catalog.recipes[u.recipe].ingredients.some(i => i.name === u.item && i.type === 'fluid') && [...steps.values(), ...used.values()].some(s => s.selection.recipe === u.recipe)) return false;
    if (from ? !byproductsOf(from).some(p => p.name === u.item) || !fits(u, from) : !sourcesOf(u, key).length) return false;
    tooMany();
    const selection = selectionOf(u.recipe, u);
    const recipe = catalog.recipes[u.recipe];
    const others = recipe.products.filter(p => p.name !== u.item);
    const product = (others.find(p => p.name === u.recipe) ?? others[0] ?? recipe.products[0]).name;
    const byTrain = new Set();
    for (const { name } of ingredientsFor(selection)) if (name !== u.item && visit(name, false)) byTrain.add(name);
    // (`share`: of its item, the share its sources make that it takes, the rest leaving by train;
    // all of it where none is given, ADR 0126.)
    const share = u.share > 0 && u.share < 1 ? u.share : 1;
    used.set(key, { selection, byTrain, from, item: u.item, product, ...(share < 1 ? { share } : {}), ...(from ? {} : { general: u }) });
    return true;
  };
  for (let more = true; more;) {
    more = false;
    for (const u of named) more = addUse(u, u.from) || more;
    for (const u of uses.filter(u => u.from == null || u.from === EVERY)) more = addUse(u, null) || more;
  }
  // (A General Use's sources once every Use is in: the one making most of it named later.)
  for (const [key, u] of used) if (u.general) u.sources = sourcesOf(u.general, key);
  const sourcesOfUse = u => u.sources ?? [u.from];
  // Whether a Use takes the item step `key` makes.
  const takenBy = (key, item) => used.has(useKey(key, item)) || [...used.values()].some(u => u.sources && u.item === item && u.sources.includes(key));
  // (The share of it a Use takes: the rest leaves by train, ADR 0126.)
  const takenShare = (key, item) => {
    const u = used.get(useKey(key, item)) ?? [...used.values()].find(v => v.sources && v.item === item && v.sources.includes(key));
    return u ? u.share ?? 1 : 0;
  };

  // Each step makes its Goal rate plus what its consumers take: R = g + A R, A[s][t] what of s's
  // item one of t's takes (its recipe's amount over the item a craft makes, productivity
  // counted). A Byproduct Use's row is what of its item one of its step's gives it. Without
  // Recipe Loops or Uses this is the steps in turn, consumers first; with them, a linear system.
  const keys = [...order, ...used.keys()];
  const n = keys.length;
  const at = new Map(keys.map((key, k) => [key, k]));
  const itemOf = key => used.get(key)?.product ?? key;
  const ingredientsOf = key => ingredientsFor(stepOf(key).selection);
  const productsOf = key => productsFor(stepOf(key).selection);
  const productivity = keys.map(key => {
    const { selection } = stepOf(key);
    return 1 + machineEffect(catalog, selection.recipe, selection.building, selection.modules, selection.bonus).productivity;
  });
  const makes = (key, item) => productsOf(key).filter(p => p.name === item).reduce((sum, p) => sum + p.amount * (p.burnt ? 1 : productivity[at.get(key)]), 0);
  const perCraft = keys.map(key => makes(key, itemOf(key)));
  const a = Array.from({ length: n }, () => new Float64Array(n));
  keys.forEach((key, t) => {
    const use = used.get(key);
    for (const { name, amount } of ingredientsOf(key)) {
      if (use && name === use.item) continue;
      if (!stepOf(key).byTrain.has(name) && steps.has(name)) a[at.get(name)][t] += amount / perCraft[t];
    }
    if (use) {
      const takes = ingredientsOf(key).filter(i => i.name === use.item).reduce((sum, i) => sum + i.amount, 0);
      for (const source of sourcesOfUse(use)) {
        const from = at.get(source);
        a[t][from] += (use.share ?? 1) * makes(source, use.item) / perCraft[from] / takes * perCraft[t];
      }
    }
  });
  const goal = new Float64Array(n);
  for (const g of goals) goal[at.get(g.item)] += g.rate;
  // (An Extension's: made beyond what is taken, for an Annex to draw.)
  for (const [item, rate] of Object.entries(extra)) if (steps.has(item)) goal[at.get(item)] += rate;
  // Supplied Items: what a Byproduct Use makes of an item a step makes (no Use of its own taking
  // it) joins that step's on its way to the steps taking it, the step making so much less: a
  // row of A less what one of the Use's gives. A solid only where one lane of the belt carries
  // it (each of the Use's belts sends its share off onto a lane of the step's). One the step
  // would then make none of leaves by train.
  const lane = belt ? laneRate(catalog, belt) : Infinity;
  /** @type {any[]} */
  let supplies = [];
  for (const [key, u] of used) {
    for (const p of productsOf(key)) {
      if (p.name === u.item || !steps.has(p.name) || takenBy(key, p.name) || supplies.some(s => s.from === key && s.item === p.name)) continue;
      supplies.push({ from: key, item: p.name, type: p.type, per: makes(key, p.name) / perCraft[at.get(key)] });
    }
  }
  // A step's solid byproduct that another step makes as its item too (ADR 0128): a Supplied
  // Item as a Use's, that step making that much less (Py antimony: the grade 1 screeners' grade 2
  // joins the jaw crushers', the grade 3 screeners' grade 4 the secondary crushers'), not leaving
  // by train while a step makes it. One the step takes itself, through the steps before it (Py's
  // sb-dust's grade 4, the crushed antimony it takes made of it), too: its join in a loop is
  // tapped off into the steps taking it (ADR 0127).
  for (const key of order) {
    for (const p of productsOf(key)) {
      if (p.type !== 'item' || p.name === key || !steps.has(p.name) || takenBy(key, p.name)
        || supplies.some(s => s.from === key && s.item === p.name)) continue;
      supplies.push({ from: key, item: p.name, type: p.type, per: makes(key, p.name) / perCraft[at.get(key)] });
    }
  }
  // Fed-back fluids (ADR 0062): a fluid a step makes besides its item, that a step of the chain
  // makes for the steps taking it (no Goal's, none a Use takes), goes to those steps first, the
  // step making it making only the rest: through a top-up valve into the byproduct's pipe, its
  // spare off through an overflow valve. (Not a step's taking it itself.)
  // (Only to those taking it at the temperature it comes at, the step making it making theirs;
  // a step taking it itself only where it takes it so, ADR 0067.)
  if (valved) {
    for (const key of order) {
      for (const p of productsOf(key)) {
        const t = heatOf(stepOf(key).selection.recipe, p.name);
        if (p.type !== 'fluid' || p.name === key || !steps.has(p.name) || goals.some(g => g.item === p.name) || takenBy(key, p.name)
          || ingredientsOf(key).some(i => i.name === p.name && takesAt(i, t)) || supplies.some(s => s.from === key && s.item === p.name)) continue;
        const all = keys.filter(k => ingredientsOf(k).some(i => i.name === p.name) && !stepOf(k).byTrain.has(p.name));
        const takers = all.filter(k => k !== key && takesAt(ingredientsOf(k).find(i => i.name === p.name), t));
        if (!takers.length) continue;
        supplies.push({ from: key, item: p.name, type: 'fluid', per: makes(key, p.name) / perCraft[at.get(key)], valve: true, ...(takers.length < all.length ? { takers } : {}) });
      }
    }
  }
  const supply = (s, sign) => { a[at.get(s.item)][at.get(s.from)] -= sign * s.per; };
  // What a fluid fed back to some only (`takers`) is taken of by them, at the rates.
  const takenAt = s => s.takers.reduce((sum, k) => sum + ingredientsOf(k).filter(i => i.name === s.item).reduce((t, i) => t + i.amount, 0) * rates[at.get(k)] / perCraft[at.get(k)], 0);
  supplies.forEach(s => supply(s, 1));
  let rates;
  for (;;) {
    rates = loops.length || used.size || supplies.length ? solve(a, goal)?.map(r => Math.round(r * 1e9) / 1e9) : consumersFirst(a, goal);
    // (Fed back to some of those taking it only, ADR 0067: covering all they take.)
    const covers = s => s.takers && rates && s.per * rates[at.get(s.from)] > takenAt(s) * (1 - TOP_UP / 2);
    // (A solid more than a lane carries: not onto the step's belt but on a belt of its own into
    // those taking it, each its share off both, ADR 0068; once a step makes none of it, by
    // train as before.)
    for (const s of supplies) if (s.type === 'item' && rates && s.per * rates[at.get(s.from)] > lane * (1 + 1e-9)) s.own = true;
    const off = supplies.filter(s => !rates || !(rates[at.get(s.item)] > 1e-6) || covers(s));
    // (A fluid fed back covering all: so much less of it fed back that its step makes TOP_UP of
    // what is taken.)
    const over = rates ? off.filter(s => s.valve && !(s.cut > 4)) : [];
    for (const s of over) {
      const supplied = s.per * rates[at.get(s.from)];
      const need = s.takers ? takenAt(s) : rates[at.get(s.item)] + supplied;
      supply(s, -1);
      s.per *= need > 0 && supplied > 0 ? (1 - TOP_UP) * need / supplied : 0;
      s.cut = (s.cut ?? 0) + 1;
      supply(s, 1);
    }
    if (over.length) continue;
    if (!off.length) break;
    off.forEach(s => supply(s, -1));
    supplies = supplies.filter(s => !off.includes(s));
  }
  if (!rates || rates.some(r => !Number.isFinite(r) || r < 0)) return null;
  keys.forEach((key, t) => {
    for (const ingredient of ingredientsOf(key)) {
      const { name, amount } = ingredient;
      if (!stepOf(key).byTrain.has(name)) continue;
      const input = trainInputs.get(name);
      input.rate += amount * rates[t] / perCraft[t];
      // (What it must come at for those taking it, ADR 0067.)
      if (!ranged(ingredient)) continue;
      const min = Math.max(input.temperature?.min ?? -Infinity, ingredient.minTemperature ?? -Infinity);
      const max = Math.min(input.temperature?.max ?? Infinity, ingredient.maxTemperature ?? Infinity);
      input.temperature = { ...(min > -Infinity ? { min } : {}), ...(max < Infinity ? { max } : {}) };
    }
  });
  // Recycled Byproducts: an ingredient that would come by train though a step makes at least as
  // much of it besides its item is taken from that step instead (the one making most), what it
  // makes beyond leaving by train. A fluid only where the steps taking it do not feed that step
  // (a fluid fed back comes by train, as a Recipe Loop's does) — but where there are valves: then
  // a fluid fed back too, and one the step makes less of than they take, the train bringing the
  // rest (`topUp`) through a top-up valve into its pipe, its spare off through an overflow valve
  // (ADR 0062).
  const ratesOf = key => rates[at.get(key)] / perCraft[at.get(key)];
  // (Through what a step takes of another's item, a Use of its byproduct, what a Use supplies.)
  const gives = a => new Set([itemOf(a), ...supplies.filter(s => s.from === a).map(s => s.item)]);
  const feeds = (a, b, seen = new Set()) => a === b || (!seen.has(a) && seen.add(a)
    && keys.some(k => ((used.has(k) && sourcesOfUse(used.get(k)).includes(a)) || ingredientsOf(k).some(i => gives(a).has(i.name) && !stepOf(k).byTrain.has(i.name))) && feeds(k, b, seen)));
  // A General Use takes its item from the source making most of it, the others' joining that one's
  // belt or pipe of it.
  for (const u of used.values()) {
    if (!u.sources) continue;
    u.from = u.sources.reduce((best, k) => (makes(k, u.item) * ratesOf(k) > makes(best, u.item) * ratesOf(best) + 1e-9 ? k : best));
  }
  const recycled = [];
  const takesFrom = new Map();
  for (const input of [...trainInputs.values()]) {
    const item = input.item;
    const takers = keys.filter(k => stepOf(k).byTrain.has(item));
    const taken = takers.length ? ingredientsOf(takers[0]).find(i => i.name === item) : null;
    // (A fluid a loop takes back, or one its step makes at another temperature, where those taking
    // it take it at a temperature only: from a step making it so, ADR 0067.)
    if (input.reason !== 'import' && !(valved && ranged(taken) && ['cycle', 'temperature'].includes(input.reason))) continue;
    const fluid = taken.type === 'fluid';
    // (A General Use taking a share of it: the rest from its belt, every source's on it already,
    // each source its own part of what is taken, ADR 0126.)
    const pooled = !fluid && [...used.values()].find(u => u.sources && u.item === item && (u.share ?? 1) < 1 && !takers.includes(useKey(EVERY, item)));
    if (pooled) {
      const spare = pooled.sources.map(k => ({ key: k, rate: (1 - pooled.share) * makes(k, item) * ratesOf(k) }));
      const total = spare.reduce((sum, m) => sum + m.rate, 0);
      if (total >= input.rate * (1 - 1e-6)) {
        trainInputs.delete(item);
        for (const k of takers) {
          stepOf(k).byTrain.delete(item);
          takesFrom.set(k, { ...takesFrom.get(k), [item]: pooled.from });
        }
        const part = Math.min(1, input.rate / total);
        for (const m of spare) recycled.push({ item, from: m.key, into: takers, rate: m.rate * part, spare: m.rate * (1 - part), ...(m.key !== pooled.from ? { via: pooled.from } : {}) });
        continue;
      }
    }
    // (A Byproduct Use's product too.)
    // (What a Use leaves of it, where it takes a share only, ADR 0126.)
    const makers = keys.filter(k => !takers.includes(k) && takenShare(k, item) < 1 - 1e-9 && productsOf(k).some(p => p.name === item))
      .filter(k => !fluid || valved || !takers.some(t => feeds(t, k)))
      .filter(k => !fluid || takers.every(t => takesAt(ingredientsOf(t).find(i => i.name === item), heatOf(stepOf(k).selection.recipe, item))))
      .map(k => ({ key: k, rate: (1 - takenShare(k, item)) * makes(k, item) * ratesOf(k) }))
      .sort((a, b) => b.rate - a.rate);
    const from = makers[0];
    let part = !!from && from.rate < input.rate * (1 - 1e-9);
    if (!from || (part && !(fluid && valved))) continue;
    // (A loop's fluid the byproduct covers: the train still brings TOP_UP of it, so it starts.
    // One it gives back just what they take of, a closed loop (Py's molten salt: the heat
    // exchanger's back into the powerplants heating it), has no spare: the train only fills it,
    // and no overflow valve lets any off.)
    let closed = false;
    if (fluid && valved && !part && takers.some(t => feeds(t, from.key))) {
      closed = from.rate <= input.rate * (1 + 1e-9);
      from.rate = input.rate * (1 - TOP_UP);
      part = true;
    }
    // (Fed back, a solid only where one lane carries all its step makes, the item with the rest,
    // or from a Goal's step: an Internal Path's belts, joined by splitters, take no tap, so the
    // feedback is tapped off one of them; a Goal's belts on to the train each feed a belt of it.)
    const solid = new Set(productsOf(from.key).filter(p => p.type === 'item').map(p => p.name));
    if (!fluid && takers.some(t => feeds(t, from.key)) && !goals.some(g => g.item === from.key)
      && [...solid].reduce((sum, name) => sum + makes(from.key, name) * ratesOf(from.key), 0) > lane * (1 + 1e-9)) continue;
    const rate = part ? from.rate : input.rate;
    if (part) Object.assign(input, { rate: input.rate - from.rate, topUp: from.key, ...(closed ? { fill: true } : {}) });
    else trainInputs.delete(item);
    for (const k of takers) {
      stepOf(k).byTrain.delete(item);
      takesFrom.set(k, { ...takesFrom.get(k), [item]: from.key });
    }
    recycled.push({ item, from: from.key, into: takers, rate, spare: part ? 0 : Math.max(0, from.rate - input.rate), ...(fluid && valved ? { valve: true } : {}), ...(closed ? { closed } : {}) });
  }
  // (A fluid fed back: the steps taking it take it from the step whose byproduct it is.)
  for (const s of supplies.filter(s => s.valve)) {
    for (const k of s.takers ?? keys) {
      if (k !== s.item && ingredientsOf(k).some(i => i.name === s.item) && !stepOf(k).byTrain.has(s.item)) takesFrom.set(k, { ...takesFrom.get(k), [s.item]: s.from });
    }
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
  const joinsOf = key => {
    // (On a belt of its own into those taking it, `feeds`, ADR 0068.)
    const own = supplies.filter(s => s.from === key && s.own).map(s => [s.item, entryOf.get(s.item)]);
    const list = [
      ...supplies.filter(s => s.from === key && !s.valve && !s.own).map(s => [s.item, entryOf.get(s.item)]),
      ...[...used.values()].filter(u => u.sources?.includes(key) && u.from !== key).map(u => [u.item, entryOf.get(u.from)]),
    ];
    return { ...(list.length ? { joins: Object.fromEntries(list) } : {}), ...(own.length ? { feeds: Object.fromEntries(own) } : {}) };
  };
  // A step's fluids fed back (ADR 0062): their spare off through an overflow valve (`overflow`),
  // or none where the loop is closed (`closed`),
  // what makes up the rest through a top-up valve into their pipe (`topUp`: fluid → { from: the
  // entry making it, or 'side-input', rate }). What it makes that the user wants leaving by train
  // too (`exports`, its spare through a splitter or valve giving its consumers priority) and the
  // fluids it makes leaving by train that are destroyed instead (`voids`).
  const valvesOfStep = key => {
    const fed = [...supplies.filter(s => s.valve && s.from === key), ...recycled.filter(r => r.valve && r.from === key && !r.closed)];
    const closed = recycled.filter(r => r.closed && r.from === key).map(r => r.item);
    const topUp = [
      ...supplies.filter(s => s.valve && s.from === key).map(s => [s.item, { from: entryOf.get(s.item), rate: s.takers ? Math.max(0, takenAt(s) - s.per * rates[at.get(key)]) : rates[at.get(s.item)] }]),
      ...[...trainInputs.values()].filter(t => t.topUp === key).map(t => [t.item, { from: 'side-input', rate: t.rate }]),
    ];
    const products = new Set(productsOf(key).map(p => p.name));
    const out = exports.filter(i => i === itemOf(key));
    const gone = voids.filter(f => products.has(f) && productsOf(key).find(p => p.name === f).type === 'fluid' && !out.includes(f));
    return {
      ...(fed.length ? { overflow: [...new Set(fed.map(f => f.item))] } : {}),
      ...(closed.length ? { closed } : {}),
      ...(topUp.length ? { topUp: Object.fromEntries(topUp) } : {}),
      ...(out.length ? { exports: out } : {}),
      ...(gone.length ? { voids: gone } : {}),
    };
  };
  return {
    entries: [
      ...[...order].reverse().map(item => ({
        goal: { item, rate: rates[at.get(item)], ...fromOf(item), ...joinsOf(item), ...valvesOfStep(item), ...(extra[item] > 0 ? { extra: extra[item] } : {}) }, selection: steps.get(item).selection,
        ...(looping(item).length ? { byTrain: looping(item) } : {}),
      })),
      ...[...used].map(([key, u]) => ({
        goal: { item: u.product, rate: rates[at.get(key)], ...fromOf(key, { [u.item]: entryOf.get(u.from) }), ...joinsOf(key), ...valvesOfStep(key) }, selection: u.selection,
        use: { key, from: u.from, item: u.item, ...(u.sources ? { sources: u.sources } : {}), ...(u.share ? { share: u.share } : {}) },
      })),
    ],
    supplies: supplies.map(s => ({ from: s.from, item: s.item, into: s.item, rate: s.per * rates[at.get(s.from)], ...(s.valve ? { valve: true } : {}) })),
    trainInputs: [...trainInputs.values()],
    loops: loops.map(({ item, into }) => ({
      item, into, rate: ingredientsOf(into).filter(i => i.name === item).reduce((sum, i) => sum + i.amount, 0) * rates[at.get(into)] / perCraft[at.get(into)],
    })),
    recycled,
    // (What a Recycled Byproduct's step makes beyond what is taken back; none of a closed loop's,
    // all of it going round, ADR 0070.)
    byproducts: keys.flatMap((key, t) => byproductsOf(key).filter((p, k, all) => all.findIndex(q => q.name === p.name) === k && takenShare(key, p.name) < 1
      && !supplies.some(s => s.from === key && s.item === p.name) && !recycled.some(r => r.closed && r.from === key && r.item === p.name)).map(p => ({
      from: key, item: p.name, type: p.type,
      rate: (1 - takenShare(key, p.name)) * makes(key, p.name) * rates[t] / perCraft[t] - recycled.filter(r => r.from === key && r.item === p.name).reduce((sum, r) => sum + r.rate, 0),
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
