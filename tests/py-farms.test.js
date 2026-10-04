import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { moduleOptions, defaultModules, machineEffect, needsModules } from '../js/modules.js';

// The shipped catalog is the game's own dump (Factorio 2.0 with Py for 2.0): a moss farm mk01 has
// 15 slots and no base effect, Py's script stopping it while they are empty, and a crafting speed
// of 1/16 (py.farm_speed: the farm counts as one moss), so 15 moss (+100% each) run it at
// 1/16 × (1 + 15) = 1, 5 moss at 6/16, 15 moss-mk04 (+400% each) at 61/16.
test('the shipped catalog: moss in a moss farm\'s module slots speeds it up', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const farm = catalog.buildings['moss-farm-mk01'];
  assert.equal(farm.moduleSlots, 15);
  assert.ok(needsModules(farm));
  assert.deepEqual(moduleOptions(catalog, 'Moss-1', 'moss-farm-mk01'), ['moss', 'moss-mk02', 'moss-mk03', 'moss-mk04']);
  assert.deepEqual(defaultModules(catalog, 'Moss-1', 'moss-farm-mk01'), [{ name: 'moss', count: 15 }]);
  const speed = modules => farm.craftingSpeed * machineEffect(catalog, 'Moss-1', 'moss-farm-mk01', modules).speed;
  assert.ok(Math.abs(speed([{ name: 'moss', count: 15 }]) - 1) < 1e-9);
  assert.ok(Math.abs(speed([{ name: 'moss', count: 5 }]) - 6 / 16) < 1e-9);
  assert.ok(Math.abs(speed([{ name: 'moss-mk04', count: 15 }]) - 61 / 16) < 1e-9);
});

// Every building that cannot run without modules offers its plants or animals for every recipe
// it runs — those of other Py mods too (Py High Tech's moondrop greenhouse, Py Petroleum
// Handling's guar gum plantation, Py Alternative Energy's numal reef).
test('the shipped catalog: every farm offers its plants or animals as modules', () => {
  const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const missing = [];
  for (const [name, b] of Object.entries(catalog.buildings)) {
    if (!needsModules(b)) continue;
    for (const r of Object.values(catalog.recipes).filter(r => b.categories.includes(r.category))) {
      if (!moduleOptions(catalog, r.name, name).length) missing.push(`${name}: ${r.name}`);
    }
  }
  assert.deepEqual(missing, []);
  for (const [farm, plant] of [['moondrop-greenhouse-mk01', 'moondrop'], ['guar-gum-plantation', 'guar'], ['numal-reef-mk01', 'numal'], ['cadaveric-arum-mk01', 'cadaveric-arum']]) {
    const recipe = Object.values(catalog.recipes).find(r => catalog.buildings[farm].categories.includes(r.category));
    assert.deepEqual(defaultModules(catalog, recipe.name, farm), [{ name: plant, count: catalog.buildings[farm].moduleSlots }], farm);
  }
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

// A farm another Py mod defines, cloned beside pyalienlife: Alien Life's updates to that mod
// (required only when it is installed) give it slots and a speed, in terms of its own mk01.
test('py-farms reads farms of other Py mods cloned beside pyalienlife', () => {
  const root = mkdtempSync(join(tmpdir(), 'py-farms-'));
  const life = join(root, 'pyalienlife'), tech = join(root, 'pyhightech');
  for (const dir of ['prototypes/items', 'prototypes/updates']) mkdirSync(join(life, dir), { recursive: true });
  mkdirSync(join(tech, 'prototypes/buildings'), { recursive: true });
  writeFileSync(join(life, 'data.lua'), 'require "prototypes/items/items"\n');
  writeFileSync(join(life, 'data-updates.lua'), 'if mods["pyhightech"] then\n  require "prototypes/updates/pyhightech-updates"\nend\n');
  writeFileSync(join(life, 'prototypes/items/items.lua'), 'ITEM { type = "module", name = "testdrop", category = "testdrop", tier = 1, effect = {speed = 1} }\n');
  writeFileSync(join(life, 'prototypes/updates/pyhightech-updates.lua'), `
local FULL_CRAFTING_SPEED = 1
TECHNOLOGY("epoxy"):remove_pack("chemical-science-pack")
require "__pyhightech__/prototypes/buildings/test-greenhouse-mk02"
for _, layer in ipairs(data.raw["assembling-machine"]["test-greenhouse-mk01"].graphics_set.layers) do layer.scale = 2 end
data.raw["assembling-machine"]["test-greenhouse-mk01"].effect_receiver = {base_effect = {speed = -1}}
data.raw["assembling-machine"]["test-greenhouse-mk01"].module_slots = 16
data.raw["assembling-machine"]["test-greenhouse-mk01"].crafting_speed = py.farm_speed(16, FULL_CRAFTING_SPEED)
data.raw["assembling-machine"]["test-greenhouse-mk01"].allowed_module_categories = {"testdrop"}
data.raw["assembling-machine"]["test-greenhouse-mk02"].effect_receiver = {base_effect = {speed = -1}}
data.raw["assembling-machine"]["test-greenhouse-mk02"].module_slots = 32
data.raw["assembling-machine"]["test-greenhouse-mk02"].crafting_speed = py.farm_speed_derived(32, "test-greenhouse-mk01")
data.raw["assembling-machine"]["test-greenhouse-mk02"].allowed_module_categories = {"testdrop"}
`);
  writeFileSync(join(tech, 'data.lua'), 'require "prototypes/buildings/test-greenhouse-mk01"\n');
  for (const tier of [1, 2]) {
    writeFileSync(join(tech, `prototypes/buildings/test-greenhouse-mk0${tier}.lua`),
      `ENTITY { type = "assembling-machine", name = "test-greenhouse-mk0${tier}", module_slots = ${tier}, crafting_speed = ${tier}, allowed_effects = {"speed"}, crafting_categories = {"moon"} }\n`);
  }
  const building = name => ({ name, size: { w: 6, h: 6 }, craftingSpeed: 1, categories: ['moon'], energy: 'electric', fluidBoxes: [] });
  const catalogPath = join(root, 'catalog.json');
  writeFileSync(catalogPath, JSON.stringify({ recipes: {}, buildings: { 'test-greenhouse-mk01': building('test-greenhouse-mk01'), 'test-greenhouse-mk02': building('test-greenhouse-mk02') } }));
  execFileSync(process.execPath, [new URL('../scripts/py-farms.mjs', import.meta.url).pathname, life, catalogPath]);
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const [mk1, mk2] = ['test-greenhouse-mk01', 'test-greenhouse-mk02'].map(n => catalog.buildings[n]);
  assert.deepEqual([mk1.moduleSlots, mk1.craftingSpeed, mk1.allowedModuleCategories, mk1.baseEffect], [16, 1 / 16, ['testdrop'], { speed: -1 }]);
  // Full of its plant, an mk02 runs at twice the mk01's speed.
  assert.deepEqual([mk2.moduleSlots, mk2.craftingSpeed * 32], [32, 2]);
});
