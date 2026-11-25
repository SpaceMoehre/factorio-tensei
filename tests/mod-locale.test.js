import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localeKeys, modLocale } from '../js/mod-locale.js';
import { localeNames } from '../js/catalog-builder.js';

// The names the game shows, made from mods' locale files where its locale dump is not at hand
// (ADR 0125): Py's reo is "Rare earth oxides", not "Reo".
test('mod locale: each prototype named as the game names it', () => {
  const keys = localeKeys([
    '[item-name]\nreo=REO\n[entity-name]\ncompost-plant=Compost plant\n',
    '; a later mod\n[item-name]\nreo=Rare earth oxides\n[recipe-name]\nmixed=__1__ from __ITEM__reo__\n[technology-name]\nmining=Mining\ncags=C.A.G.S.\n[fluid-name]\nsyrup=Sweet syrup\n',
  ]);
  const raw = {
    item: {
      reo: { name: 'reo', stack_size: 100 },
      'compost-plant': { name: 'compost-plant', stack_size: 10, place_result: 'compost-plant' },
      lost: { name: 'lost', stack_size: 1 },
      boxed: { name: 'boxed', stack_size: 1, localised_name: ['', ['item-name.reo'], ' (boxed)'] },
    },
    'assembling-machine': { 'compost-plant': { name: 'compost-plant', collision_box: [[-1, -1], [1, 1]] } },
    fluid: { syrup: { name: 'syrup' } },
    recipe: {
      reo: { name: 'reo', results: [{ type: 'item', name: 'reo', amount: 1 }] },
      'syrup-2': { name: 'syrup-2', results: [{ type: 'fluid', name: 'syrup', amount: 1 }, { type: 'item', name: 'reo', amount: 1 }], main_product: 'syrup' },
      both: { name: 'both', results: [{ type: 'item', name: 'reo', amount: 1 }, { type: 'item', name: 'lost', amount: 1 }] },
      mixed: { name: 'mixed', results: [{ type: 'item', name: 'reo', amount: 1 }], localised_name: ['recipe-name.mixed', ['fluid-name.syrup']] },
    },
    technology: { 'mining-2': { name: 'mining-2' } },
  };
  const locale = modLocale(raw, keys);
  assert.deepEqual(locale.item.names, { reo: 'Rare earth oxides', 'compost-plant': 'Compost plant', boxed: 'Rare earth oxides (boxed)' });
  assert.deepEqual(locale.fluid.names, { syrup: 'Sweet syrup' });
  assert.deepEqual(locale.recipe.names, { reo: 'Rare earth oxides', 'syrup-2': 'Sweet syrup', mixed: 'Sweet syrup from Rare earth oxides' });
  assert.deepEqual(locale.technology.names, { 'mining-2': 'Mining 2', mining: 'Mining', cags: 'C.A.G.S.' });

  // In the catalog: a recipe's name kept where it is not its item's.
  const named = localeNames(raw, locale);
  assert.equal(named.names.reo, 'Rare earth oxides');
  assert.deepEqual(named.recipeNames, { 'syrup-2': 'Sweet syrup', mixed: 'Sweet syrup from Rare earth oxides' });
});
