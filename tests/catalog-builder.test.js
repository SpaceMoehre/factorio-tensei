import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../js/catalog-builder.js';

const dataRaw = (extra = {}) => ({
  recipe: {}, 'assembling-machine': {}, furnace: {}, 'electric-pole': {},
  'transport-belt': {}, 'underground-belt': {}, 'pipe-to-ground': {}, item: {}, fluid: {},
  ...extra,
});

test('recipe: energy_required becomes time and category defaults to crafting', () => {
  const { recipes } = buildCatalog(dataRaw({
    recipe: {
      gear: {
        name: 'gear', energy_required: 0.5,
        ingredients: [{ type: 'item', name: 'iron-plate', amount: 2 }],
        results: [{ type: 'item', name: 'iron-gear-wheel', amount: 1 }],
      },
    },
  }));
  assert.deepEqual(recipes.gear, {
    name: 'gear', category: 'crafting', time: 0.5,
    ingredients: [{ type: 'item', name: 'iron-plate', amount: 2 }],
    products: [{ type: 'item', name: 'iron-gear-wheel', amount: 1 }],
  });
});

test('recipe: probabilistic, ranged and extra-count products become expected amounts per craft', () => {
  const { recipes } = buildCatalog(dataRaw({
    recipe: {
      sift: {
        name: 'sift', energy_required: 2, ingredients: [],
        results: [
          { type: 'item', name: 'tailings-dust', amount: 1, probability: 0.4 },
          { type: 'item', name: 'stone', amount_min: 1, amount_max: 3, probability: 0.5 },
          { type: 'item', name: 'gravel', amount: 2, extra_count_fraction: 0.25 },
        ],
      },
    },
  }));
  assert.deepEqual(recipes.sift.products.map(p => p.amount), [0.4, 1, 2.25]);
});

test('building: footprint from collision box, speed, categories, energy type and fluid connections', () => {
  const { buildings } = buildCatalog(dataRaw({
    'assembling-machine': {
      'py-cultivator': {
        name: 'py-cultivator', collision_box: [[-2.9, -2.4], [2.9, 2.4]], crafting_speed: 1.5,
        crafting_categories: ['cultivation'], energy_usage: '200kW', energy_source: { type: 'electric' },
        fluid_boxes: [{
          production_type: 'input',
          pipe_connections: [{ flow_direction: 'input', direction: 0, position: [0, -2] }],
        }],
      },
    },
    furnace: {
      'stone-furnace': {
        name: 'stone-furnace', collision_box: [[-0.7, -0.7], [0.7, 0.7]], crafting_speed: 1,
        crafting_categories: ['smelting'], energy_usage: '90kW', energy_source: { type: 'burner' },
      },
    },
  }));
  assert.deepEqual(buildings['py-cultivator'], {
    name: 'py-cultivator', size: { w: 6, h: 5 }, craftingSpeed: 1.5, categories: ['cultivation'],
    energy: 'electric', energyUsage: 200000,
    fluidBoxes: [{ production: 'input', connections: [{ x: 0, y: -2, direction: 0 }] }],
  });
  assert.deepEqual(buildings['stone-furnace'].size, { w: 2, h: 2 });
  assert.equal(buildings['stone-furnace'].energy, 'burner');
});

// Py's soil extractor puts its soil on the tile south of it; its legacy twin has no drop, and a
// derrick's drop point at its centre is none.
test('building: the point beside it where a machine puts its products itself (Output Drop)', () => {
  const machine = (name, vector) => ({
    name, collision_box: [[-3.3, -3.3], [3.3, 3.3]], crafting_speed: 1, crafting_categories: ['soil-extraction'],
    energy_usage: '400kW', energy_source: { type: 'electric' }, ...(vector && { vector_to_place_result: vector }),
  });
  const { buildings } = buildCatalog(dataRaw({
    'assembling-machine': {
      'soil-extractor-mk01': machine('soil-extractor-mk01', [0, 3.51]),
      'soil-extractor-mk01-legacy': machine('soil-extractor-mk01-legacy'),
      'oil-derrick-mk01': machine('oil-derrick-mk01', [0, 0]),
    },
  }));
  assert.deepEqual(buildings['soil-extractor-mk01'].drop, { x: 0, y: 3.51 });
  assert.equal(buildings['soil-extractor-mk01-legacy'].drop, undefined);
  assert.equal(buildings['oil-derrick-mk01'].drop, undefined);
});

test('logistics: poles, belt tiers with throughput and underground reach, pipe-to-ground reach', () => {
  const catalog = buildCatalog(dataRaw({
    'electric-pole': {
      'small-electric-pole': {
        name: 'small-electric-pole', collision_box: [[-0.15, -0.15], [0.15, 0.15]],
        supply_area_distance: 2.5, maximum_wire_distance: 7.5,
      },
    },
    'transport-belt': {
      'transport-belt': { name: 'transport-belt', speed: 0.03125, related_underground_belt: 'underground-belt' },
    },
    'underground-belt': { 'underground-belt': { name: 'underground-belt', max_distance: 5 } },
    'pipe-to-ground': {
      'pipe-to-ground': {
        name: 'pipe-to-ground',
        fluid_box: { pipe_connections: [{ direction: 0 }, { direction: 8, connection_type: 'underground', max_underground_distance: 10 }] },
      },
    },
  }));
  assert.deepEqual(catalog.poles['small-electric-pole'], {
    name: 'small-electric-pole', size: { w: 1, h: 1 }, supplyRadius: 2.5, wireReach: 7.5,
  });
  assert.deepEqual(catalog.belts['transport-belt'], {
    name: 'transport-belt', itemsPerSecond: 15, underground: { name: 'underground-belt', maxDistance: 5 },
  });
  assert.deepEqual(catalog.pipes['pipe-to-ground'], { name: 'pipe-to-ground', maxDistance: 10 });
});

test('recipe: Lua empty tables dumped as {} are treated as empty lists', () => {
  const { recipes } = buildCatalog(dataRaw({
    recipe: { void: { name: 'void', energy_required: 1, ingredients: {}, results: {} } },
  }));
  assert.deepEqual([recipes.void.ingredients, recipes.void.products], [[], []]);
});

test('icons: every item, fluid and virtual signal maps to its icon file under sprites/<mod>/, from the first icon layer', () => {
  const { icons } = buildCatalog(dataRaw({
    item: {
      'iron-gear-wheel': { name: 'iron-gear-wheel', icon: '__base__/graphics/icons/iron-gear-wheel.png' },
      pcb1: { name: 'pcb1', icon: '__pyhightechgraphics__/graphics/icons/pcb1.png' },
      blank: { name: 'blank' },
      'sap-extractor-mk01': { name: 'sap-extractor-mk01', icon: '__pyalienlifegraphics__/graphics/icons//sap-extractor-mk01.png' },
    },
    fluid: { water: { name: 'water', icon: '__base__/graphics/icons/fluid/water.png' } },
    tool: {
      'automation-science-pack': { name: 'automation-science-pack', icons: [{ icon: '__base__/graphics/icons/automation-science-pack.png' }, { icon: '__core__/x.png' }] },
    },
    'virtual-signal': { 'signal-A': { name: 'signal-A', icon: '__base__/graphics/icons/signal/signal_A.png' } },
  }));
  assert.deepEqual(icons, {
    'iron-gear-wheel': 'base/graphics/icons/iron-gear-wheel.png',
    pcb1: 'pyhightechgraphics/graphics/icons/pcb1.png',
    'sap-extractor-mk01': 'pyalienlifegraphics/graphics/icons/sap-extractor-mk01.png',
    water: 'base/graphics/icons/fluid/water.png',
    'automation-science-pack': 'base/graphics/icons/automation-science-pack.png',
    'signal-A': 'base/graphics/icons/signal/signal_A.png',
  });
});

// The game's virtual signals in its order: by subgroup, then each signal's own; never the
// wildcards, nor hidden or parameter ones.
test('signals: every virtual signal a condition may name, in the game\'s order', () => {
  const { signals } = buildCatalog(dataRaw({
    'item-subgroup': { 'virtual-signal-number': { name: 'virtual-signal-number', order: 'b' }, 'virtual-signal-letter': { name: 'virtual-signal-letter', order: 'c' }, shapes: { name: 'shapes', order: 'a' } },
    'virtual-signal': {
      'signal-B': { name: 'signal-B', subgroup: 'virtual-signal-letter', order: 'b' },
      'signal-A': { name: 'signal-A', subgroup: 'virtual-signal-letter', order: 'a' },
      'signal-1': { name: 'signal-1', subgroup: 'virtual-signal-number', order: 'b' },
      'signal-heart': { name: 'signal-heart', subgroup: 'shapes', order: 'x' },
      'signal-everything': { name: 'signal-everything', subgroup: 'shapes', order: 'a' },
      'signal-unknown': { name: 'signal-unknown', hidden: true },
      'signal-item-parameter': { name: 'signal-item-parameter', parameter: true },
      // Factorio 2.0's blueprint parameters: in their own subgroup.
      'signal-fuel-parameter': { name: 'signal-fuel-parameter', subgroup: 'parameters' },
    },
  }));
  assert.deepEqual(signals, ['signal-heart', 'signal-1', 'signal-A', 'signal-B']);
});

test('hidden and parameter recipes are not in the catalog', () => {
  const { recipes } = buildCatalog(dataRaw({
    recipe: {
      a: { name: 'a', hidden: true, energy_required: 1, results: [] },
      b: { name: 'b', parameter: true, energy_required: 1, results: [] },
    },
  }));
  assert.deepEqual(Object.keys(recipes), []);
});

// Vanilla Factorio 2.0 prototypes (base/prototypes/entity/entities.lua), with allow_custom_vectors
// as the Inserter_Config mod sets it. The basic inserter leaves its vectors at the defaults.
test('inserters: vectors, swing speeds, energy type and whether custom vectors are allowed', () => {
  const { inserters } = buildCatalog(dataRaw({
    inserter: {
      inserter: {
        name: 'inserter', rotation_speed: 0.014, extension_speed: 0.035, energy_source: { type: 'electric' }, allow_custom_vectors: true,
      },
      'long-handed-inserter': {
        name: 'long-handed-inserter', pickup_position: [0, -2], insert_position: [0, 2.2],
        rotation_speed: 0.02, extension_speed: 0.05, energy_source: { type: 'electric' }, allow_custom_vectors: true,
      },
      'burner-inserter': {
        name: 'burner-inserter', rotation_speed: 0.013, extension_speed: 0.035, energy_source: { type: 'burner' },
      },
    },
  }));
  assert.deepEqual(inserters['long-handed-inserter'], {
    name: 'long-handed-inserter', pickup: { x: 0, y: -2 }, insert: { x: 0, y: 2.2 },
    rotationSpeed: 0.02, extensionSpeed: 0.05, energy: 'electric', customVectors: true,
  });
  assert.deepEqual([inserters.inserter.pickup, inserters.inserter.insert], [{ x: 0, y: -1 }, { x: 0, y: 1.2 }]);
  assert.equal(inserters['burner-inserter'].energy, 'burner');
  assert.equal(inserters['burner-inserter'].customVectors, false);
});

// Stone furnace: 90kW burner at effectivity 1 burning chemical fuel; coal holds 4MJ.
test('energy: machine power draw in watts, burner effectivity and fuel categories; fuel items with their value in joules', () => {
  const catalog = buildCatalog(dataRaw({
    furnace: {
      'stone-furnace': {
        name: 'stone-furnace', collision_box: [[-0.7, -0.7], [0.7, 0.7]], crafting_speed: 1, crafting_categories: ['smelting'],
        energy_usage: '90kW', energy_source: { type: 'burner', fuel_categories: ['chemical'], effectivity: 1 },
      },
    },
    'assembling-machine': {
      'chipshooter-mk01': {
        name: 'chipshooter-mk01', collision_box: [[-2.4, -2.4], [2.4, 2.4]], crafting_speed: 1, crafting_categories: ['chip'],
        energy_usage: '1.5MW', energy_source: { type: 'electric' },
      },
      'bof-mk01': {
        name: 'bof-mk01', collision_box: [[-3.4, -3.4], [3.4, 3.4]], crafting_speed: 1, crafting_categories: ['bof'],
        energy_usage: '750kW', energy_source: { type: 'burner', fuel_category: 'chemical' },
      },
    },
    item: {
      coal: { name: 'coal', fuel_value: '4MJ', fuel_category: 'chemical' },
      'solid-fuel': { name: 'solid-fuel', fuel_value: '12MJ', fuel_categories: ['chemical'] },
      'iron-plate': { name: 'iron-plate' },
    },
  }));
  const furnace = catalog.buildings['stone-furnace'];
  assert.deepEqual([furnace.energyUsage, furnace.effectivity, furnace.fuelCategories], [90000, 1, ['chemical']]);
  assert.equal(catalog.buildings['chipshooter-mk01'].energyUsage, 1500000);
  assert.deepEqual([catalog.buildings['bof-mk01'].effectivity, catalog.buildings['bof-mk01'].fuelCategories], [1, ['chemical']]);
  assert.deepEqual(catalog.fuels, {
    coal: { name: 'coal', fuelValue: 4000000, categories: ['chemical'] },
    'solid-fuel': { name: 'solid-fuel', fuelValue: 12000000, categories: ['chemical'] },
  });
});

test('plain pipes: every pipe type, so the pipe can be chosen like its pipe-to-ground', () => {
  const catalog = buildCatalog(dataRaw({
    pipe: { pipe: { name: 'pipe' }, 'niobium-pipe': { name: 'niobium-pipe' }, 'hidden-pipe': { name: 'hidden-pipe', hidden: true } },
  }));
  assert.deepEqual(catalog.plainPipes, ['niobium-pipe', 'pipe']);
});

// Py's moss farm (pyalienlife prototypes/buildings/moss-farm.lua): 15 slots, speed 1/15, and a
// base effect of -100% speed, so it runs only on its moss modules (+100% speed each).
test('modules: module items with their effects; slots, allowed effects and categories and base effect per building; recipe limits', () => {
  const catalog = buildCatalog(dataRaw({
    'assembling-machine': {
      'moss-farm-mk01': {
        name: 'moss-farm-mk01', collision_box: [[-3.9, -3.9], [3.9, 3.9]], crafting_speed: 1 / 15, crafting_categories: ['moss'],
        energy_usage: '100kW', energy_source: { type: 'electric' }, module_slots: 15,
        allowed_effects: ['speed', 'productivity', 'consumption', 'pollution', 'quality'], allowed_module_categories: ['moss'],
        effect_receiver: { base_effect: { speed: -1 }, speed_limits: { low: -0.9999 } },
      },
    },
    module: {
      moss: { name: 'moss', category: 'moss', tier: 1, effect: { pollution: 1, speed: 1 } },
      'speed-module': { name: 'speed-module', category: 'speed', tier: 1, effect: { speed: 0.2, consumption: 0.5 } },
    },
    recipe: {
      'moss-1': {
        name: 'moss-1', category: 'moss', energy_required: 60, allowed_module_categories: ['moss'], allow_productivity: true,
        ingredients: [{ type: 'fluid', name: 'water', amount: 100 }], results: [{ type: 'item', name: 'moss', amount: 10 }],
      },
    },
  }));
  assert.deepEqual(catalog.modules, {
    moss: { name: 'moss', category: 'moss', tier: 1, effect: { pollution: 1, speed: 1 } },
    'speed-module': { name: 'speed-module', category: 'speed', tier: 1, effect: { speed: 0.2, consumption: 0.5 } },
  });
  const farm = catalog.buildings['moss-farm-mk01'];
  assert.deepEqual([farm.moduleSlots, farm.allowedEffects, farm.allowedModuleCategories, farm.baseEffect, farm.speedLow],
    [15, ['speed', 'productivity', 'consumption', 'pollution', 'quality'], ['moss'], { speed: -1 }, -0.9999]);
  const recipe = catalog.recipes['moss-1'];
  assert.deepEqual([recipe.allowedModuleCategories, recipe.allowProductivity], [['moss'], true]);
});

test('every entity with a collision box gets its tile footprint, for the entities of a city block', () => {
  const { footprints } = buildCatalog(dataRaw({
    roboport: { roboport: { name: 'roboport', collision_box: [[-1.7, -1.7], [1.7, 1.7]] } },
    'straight-rail': { 'straight-rail': { name: 'straight-rail', collision_box: [[-0.7, -0.99], [0.7, 0.99]], tile_width: 2, tile_height: 2 } },
    lamp: { 'small-lamp': { name: 'small-lamp', collision_box: [[-0.15, -0.15], [0.15, 0.15]] } },
  }));
  assert.deepEqual(footprints.roboport, { w: 4, h: 4 });
  assert.deepEqual(footprints['straight-rail'], { w: 2, h: 2 });
  assert.deepEqual(footprints['small-lamp'], { w: 1, h: 1 });
});
