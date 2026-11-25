// The chain's options with every step and Byproduct Use pinned to the slowest building that runs
// its recipe, as each was by default before ADR 0129: for tests laid out (and measured) so.
import { expandChain, recipeOptions } from '../../js/chain.js';

/**
 * @param {{ item: string, rate: number }[]} goals
 * @param {any} catalog
 * @param {any} options expandChain's
 * @returns {any} the options, every building chosen
 */
export function slowest(goals, catalog, options = {}) {
  const index = recipeOptions(catalog, options.sciencePacks ?? null, options.turds ?? null);
  const first = recipe => index.buildingsFor.get(recipe)[0];
  const chain = expandChain(goals, catalog, options);
  const selections = { ...options.selections };
  const uses = (options.uses ?? []).map(u => ({ ...u }));
  for (const e of /** @type {any[]} */ (chain.entries)) {
    if (e.use) {
      for (const u of uses) if (u.item === e.use.item && u.recipe === e.selection.recipe && !u.building) u.building = first(e.selection.recipe);
      continue;
    }
    const wanted = selections[e.goal.item];
    if (!wanted?.building) selections[e.goal.item] = { ...wanted, recipe: e.selection.recipe, building: first(e.selection.recipe) };
  }
  return { ...options, selections, uses };
}
