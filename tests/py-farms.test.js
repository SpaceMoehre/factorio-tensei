import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { moduleOptions, defaultModules, machineEffect } from '../js/modules.js';

// The shipped catalog carries the Py farms from pyalienlife (scripts/py-farms.mjs): a moss farm
// mk01 has 15 slots and -100% speed of its own, so moss is what runs it; 15 moss (+100% each)
// make it run at its crafting speed of 1/15 × 15 = 1, 15 moss-mk04 (+400% each) at 4.
test('the shipped catalog: moss in a moss farm\'s module slots speeds it up', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const farm = catalog.buildings['moss-farm-mk01'];
  assert.equal(farm.moduleSlots, 15);
  assert.deepEqual(farm.baseEffect, { speed: -1 });
  assert.deepEqual(moduleOptions(catalog, 'Moss-1', 'moss-farm-mk01'), ['moss', 'moss-mk02', 'moss-mk03', 'moss-mk04']);
  assert.deepEqual(defaultModules(catalog, 'Moss-1', 'moss-farm-mk01'), [{ name: 'moss', count: 15 }]);
  const speed = modules => farm.craftingSpeed * machineEffect(catalog, 'Moss-1', 'moss-farm-mk01', modules).speed;
  assert.ok(Math.abs(speed([{ name: 'moss', count: 15 }]) - 1) < 1e-9);
  assert.ok(Math.abs(speed([{ name: 'moss', count: 5 }]) - 1 / 3) < 1e-9);
  assert.ok(Math.abs(speed([{ name: 'moss-mk04', count: 15 }]) - 4) < 1e-9);
});

// A two-file mod in pyalienlife's shape: a farm whose slots and speed Lua works out, a building of
// another mod it changes through data.raw, and a plant module.
test('py-farms reads farm slots, speeds and modules from the mod source', () => {
  const root = mkdtempSync(join(tmpdir(), 'py-farms-'));
  mkdirSync(join(root, 'prototypes/buildings'), { recursive: true });
  mkdirSync(join(root, 'prototypes/items'), { recursive: true });
  writeFileSync(join(root, 'data.lua'), 'require "prototypes/buildings/test-farm"\nrequire "prototypes/items/items"\n');
  writeFileSync(join(root, 'prototypes/buildings/test-farm.lua'), `
local MODULE_SLOTS = 10
local FULL_CRAFTING_SPEED = 2
RECIPE { type = "recipe", name = "test-farm-mk01", results = {} }:add_unlock("botany")
ENTITY {
  type = "assembling-machine", name = "test-farm-mk01", module_slots = MODULE_SLOTS,
  allowed_effects = {"speed", "pollution"}, crafting_categories = {"testing"},
  effect_receiver = {base_effect = {speed = -1}, speed_limits = {low = -0.9999}},
  crafting_speed = py.farm_speed(MODULE_SLOTS, FULL_CRAFTING_SPEED),
  graphics_set = { animation = { layers = { { filename = "a.png", shift = util.by_pixel(0, 80) } } } },
}
data.raw["assembling-machine"]["test-farm-mk01"].allowed_module_categories = {"testplant"}
for tier = 2, 3 do
  ENTITY {
    type = "assembling-machine", name = "test-farm-mk0" .. tier, module_slots = MODULE_SLOTS * tier,
    effect_receiver = {base_effect = {speed = -1}},
    crafting_speed = py.farm_speed_derived(MODULE_SLOTS * tier, "test-farm-mk01"),
    allowed_module_categories = {"testplant"},
  }
end
data.raw["assembling-machine"]["other-mod-farm"].module_slots = 4
data.raw["assembling-machine"]["other-mod-farm"].crafting_speed = py.farm_speed(4, 1)
data.raw["assembling-machine"]["other-mod-farm"].effect_receiver = {base_effect = {speed = -1}}
`);
  writeFileSync(join(root, 'prototypes/items/items.lua'), `
ITEM { type = "module", name = "testplant", category = "testplant", tier = 1, effect = {speed = 1, pollution = 1} }
ITEM { type = "module", name = "testplant-mk02", category = "testplant", tier = 2, effect = {speed = 2, pollution = 1} }
`);
  const building = name => ({ name, size: { w: 6, h: 6 }, craftingSpeed: 0.5, categories: ['testing'], energy: 'electric', fluidBoxes: [] });
  const catalogPath = join(root, 'catalog.json');
  writeFileSync(catalogPath, JSON.stringify({
    recipes: {}, buildings: Object.fromEntries(['test-farm-mk01', 'test-farm-mk02', 'test-farm-mk03', 'other-mod-farm'].map(n => [n, building(n)])),
  }));
  execFileSync(process.execPath, [new URL('../scripts/py-farms.mjs', import.meta.url).pathname, root, catalogPath]);
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const mk1 = catalog.buildings['test-farm-mk01'];
  assert.deepEqual([mk1.moduleSlots, mk1.craftingSpeed, mk1.allowedModuleCategories, mk1.baseEffect, mk1.speedLow],
    [10, 0.2, ['testplant'], { speed: -1 }, -0.9999]);
  // A derived tier (py.farm_speed_derived) has twice the slots at the same speed per plant: full,
  // an mk02 runs at 0.2 × 20 = 4, twice a full mk01.
  assert.deepEqual([catalog.buildings['test-farm-mk02'].moduleSlots, catalog.buildings['test-farm-mk03'].moduleSlots], [20, 30]);
  assert.ok(Math.abs(catalog.buildings['test-farm-mk02'].craftingSpeed * 20 - 4) < 1e-9);
  assert.deepEqual([catalog.buildings['other-mod-farm'].moduleSlots, catalog.buildings['other-mod-farm'].craftingSpeed], [4, 0.25]);
  assert.deepEqual(catalog.modules.testplant, { name: 'testplant', category: 'testplant', tier: 1, effect: { speed: 1, pollution: 1 } });
  assert.deepEqual(catalog.modules['testplant-mk02'].effect, { speed: 2, pollution: 1 });
});
