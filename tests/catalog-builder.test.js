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
        crafting_categories: ['cultivation'], energy_source: { type: 'electric' },
        fluid_boxes: [{
          production_type: 'input',
          pipe_connections: [{ flow_direction: 'input', direction: 0, position: [0, -2] }],
        }],
      },
    },
    furnace: {
      'stone-furnace': {
        name: 'stone-furnace', collision_box: [[-0.7, -0.7], [0.7, 0.7]], crafting_speed: 1,
        crafting_categories: ['smelting'], energy_source: { type: 'burner' },
      },
    },
  }));
  assert.deepEqual(buildings['py-cultivator'], {
    name: 'py-cultivator', size: { w: 6, h: 5 }, craftingSpeed: 1.5, categories: ['cultivation'],
    energy: 'electric',
    fluidBoxes: [{ production: 'input', connections: [{ x: 0, y: -2, direction: 0 }] }],
  });
  assert.deepEqual(buildings['stone-furnace'].size, { w: 2, h: 2 });
  assert.equal(buildings['stone-furnace'].energy, 'burner');
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

test('icons: items and fluids with base-game icons map to their file under sprites/', () => {
  const { icons } = buildCatalog(dataRaw({
    item: {
      'iron-gear-wheel': { name: 'iron-gear-wheel', icon: '__base__/graphics/icons/iron-gear-wheel.png' },
      pcb1: { name: 'pcb1', icon: '__pyhightechgraphics__/graphics/icons/pcb1.png' },
    },
    fluid: { water: { name: 'water', icon: '__base__/graphics/icons/fluid/water.png' } },
    tool: {
      'automation-science-pack': { name: 'automation-science-pack', icons: [{ icon: '__base__/graphics/icons/automation-science-pack.png' }] },
    },
  }));
  assert.deepEqual(icons, {
    'iron-gear-wheel': 'iron-gear-wheel.png', water: 'fluid/water.png', 'automation-science-pack': 'automation-science-pack.png',
  });
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
