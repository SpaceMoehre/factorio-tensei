// Hand-authored subset of vanilla Factorio 2.0 data, in catalog.json shape.
export const catalog = {
  recipes: {
    'electronic-circuit': {
      name: 'electronic-circuit', category: 'crafting', time: 0.5,
      ingredients: [
        { type: 'item', name: 'iron-plate', amount: 1 },
        { type: 'item', name: 'copper-cable', amount: 3 },
      ],
      products: [{ type: 'item', name: 'electronic-circuit', amount: 1 }],
    },
    'copper-cable': {
      name: 'copper-cable', category: 'crafting', time: 0.5,
      ingredients: [{ type: 'item', name: 'copper-plate', amount: 1 }],
      products: [{ type: 'item', name: 'copper-cable', amount: 2 }],
    },
    'iron-gear-wheel': {
      name: 'iron-gear-wheel', category: 'crafting', time: 0.5,
      ingredients: [{ type: 'item', name: 'iron-plate', amount: 2 }],
      products: [{ type: 'item', name: 'iron-gear-wheel', amount: 1 }],
    },
    concrete: {
      name: 'concrete', category: 'crafting-with-fluid', time: 0.5,
      ingredients: [
        { type: 'item', name: 'lime', amount: 5 },
        { type: 'item', name: 'sand', amount: 10 },
        { type: 'item', name: 'gravel', amount: 10 },
        { type: 'fluid', name: 'water', amount: 100 },
      ],
      products: [{ type: 'item', name: 'concrete', amount: 5 }],
    },
    'pitch-distilation': {
      name: 'pitch-distilation', category: 'side-distilation', time: 2,
      ingredients: [{ type: 'fluid', name: 'tar', amount: 100 }],
      products: [{ type: 'fluid', name: 'pitch', amount: 50 }],
    },
    // Pyanodons data: its outputs use fluid boxes facing north, south and west.
    'tar-distilation': {
      name: 'tar-distilation', category: 'distilator', time: 2.5,
      ingredients: [{ type: 'fluid', name: 'tar', amount: 350 }],
      products: [
        { type: 'fluid', name: 'flue-gas', amount: 500 },
        { type: 'fluid', name: 'carbon-dioxide', amount: 100 },
        { type: 'fluid', name: 'aromatics', amount: 100 },
        { type: 'item', name: 'rich-clay', amount: 1 },
      ],
    },
    // Pyanodons data: three fluids enter side by side.
    'nitrogen-mustard': {
      name: 'nitrogen-mustard', category: 'wet-scrubber', time: 10,
      ingredients: [
        { type: 'fluid', name: 'hydrogen-chloride', amount: 50 },
        { type: 'fluid', name: 'nitrogen', amount: 200 },
        { type: 'fluid', name: 'chloroethanol', amount: 100 },
      ],
      products: [{ type: 'fluid', name: 'nitrogen-mustard', amount: 100 }],
    },
    // Pyanodons data: coke-oven-gas goes in and comes back out.
    'reheat-coke-gas': {
      name: 'reheat-coke-gas', category: 'heat-exchanger', time: 4,
      ingredients: [
        { type: 'fluid', name: 'coke-oven-gas', amount: 100 },
        { type: 'fluid', name: 'hot-molten-salt', amount: 50 },
      ],
      products: [
        { type: 'fluid', name: 'coke-oven-gas', amount: 95 },
        { type: 'fluid', name: 'molten-salt', amount: 50 },
      ],
    },
    'ore-sifting': {
      name: 'ore-sifting', category: 'crafting', time: 1,
      ingredients: [{ type: 'item', name: 'ore', amount: 2 }],
      products: [{ type: 'item', name: 'sand', amount: 1 }, { type: 'item', name: 'gravel', amount: 1 }],
    },
    biomass: {
      name: 'biomass', category: 'compost', time: 1,
      ingredients: [{ type: 'item', name: 'moss', amount: 1 }],
      products: [{ type: 'item', name: 'biomass', amount: 1 }],
    },
    'iron-plate': {
      name: 'iron-plate', category: 'smelting', time: 3.2,
      ingredients: [{ type: 'item', name: 'iron-ore', amount: 1 }],
      products: [{ type: 'item', name: 'iron-plate', amount: 1 }],
    },
    'advanced-oil-processing': {
      name: 'advanced-oil-processing', category: 'oil-processing', time: 5,
      ingredients: [
        { type: 'fluid', name: 'crude-oil', amount: 100 },
        { type: 'fluid', name: 'water', amount: 50 },
      ],
      products: [
        { type: 'fluid', name: 'heavy-oil', amount: 25 },
        { type: 'fluid', name: 'light-oil', amount: 45 },
        { type: 'fluid', name: 'petroleum-gas', amount: 55 },
      ],
    },
  },
  buildings: {
    'assembling-machine-2': {
      name: 'assembling-machine-2', size: { w: 3, h: 3 }, craftingSpeed: 0.75,
      categories: ['crafting', 'advanced-crafting', 'crafting-with-fluid'], energy: 'electric',
      fluidBoxes: [
        { production: 'input', connections: [{ x: 0, y: -1, direction: 0 }] },
        { production: 'output', connections: [{ x: 0, y: 1, direction: 8 }] },
      ],
    },
    'oil-refinery': {
      name: 'oil-refinery', size: { w: 5, h: 5 }, craftingSpeed: 1,
      categories: ['oil-processing'], energy: 'electric',
      fluidBoxes: [
        { production: 'input', connections: [{ x: -1, y: 2, direction: 8 }] },
        { production: 'input', connections: [{ x: 1, y: 2, direction: 8 }] },
        { production: 'output', connections: [{ x: -2, y: -2, direction: 0 }] },
        { production: 'output', connections: [{ x: 0, y: -2, direction: 0 }] },
        { production: 'output', connections: [{ x: 2, y: -2, direction: 0 }] },
      ],
    },
    'side-distilator': {
      name: 'side-distilator', size: { w: 3, h: 3 }, craftingSpeed: 1, categories: ['side-distilation'], energy: 'electric',
      fluidBoxes: [
        { production: 'input', connections: [{ x: -1, y: 0, direction: 12 }] },
        { production: 'output', connections: [{ x: 1, y: 0, direction: 4 }] },
      ],
    },
    // Pyanodons data.
    'wet-scrubber-mk01': {
      name: 'wet-scrubber-mk01', size: { w: 6, h: 6 }, craftingSpeed: 1, categories: ['wet-scrubber'], energy: 'electric',
      fluidBoxes: [
        { production: 'input', connections: [{ x: -2.5, y: -2.5, direction: 0 }] },
        { production: 'input', connections: [{ x: -0.5, y: -2.5, direction: 0 }] },
        { production: 'input', connections: [{ x: 1.5, y: -2.5, direction: 0 }] },
        { production: 'output', connections: [{ x: -0.5, y: 2.5, direction: 8 }] },
        { production: 'output', connections: [{ x: -2.5, y: 2.5, direction: 8 }] },
        { production: 'output', connections: [{ x: 1.5, y: 2.5, direction: 8 }] },
      ],
    },
    // Pyanodons data.
    'py-heat-exchanger': {
      name: 'py-heat-exchanger', size: { w: 7, h: 7 }, craftingSpeed: 2, categories: ['heat-exchanger'], energy: 'electric',
      fluidBoxes: [
        { production: 'output', connections: [{ x: 0, y: -3, direction: 0 }] },
        { production: 'output', connections: [{ x: -3, y: 0, direction: 12 }] },
        { production: 'input', connections: [{ x: 3, y: 0, direction: 4 }] },
        { production: 'input', connections: [{ x: 0, y: 3, direction: 8 }] },
      ],
    },
    // Pyanodons size: taller than a medium pole's wire reach.
    'compost-plant-mk01': {
      name: 'compost-plant-mk01', size: { w: 11, h: 11 }, craftingSpeed: 1, categories: ['compost'], energy: 'electric', fluidBoxes: [],
    },
    // Pyanodons data.
    distilator: {
      name: 'distilator', size: { w: 8, h: 8 }, craftingSpeed: 1, categories: ['distilator'], energy: 'electric',
      fluidBoxes: [
        { production: 'input', connections: [{ x: -1.5, y: -3.5, direction: 0 }] },
        { production: 'output', connections: [{ x: 1.5, y: -3.5, direction: 0 }] },
        { production: 'input', connections: [{ x: -1.5, y: 3.5, direction: 8 }] },
        { production: 'output', connections: [{ x: 1.5, y: 3.5, direction: 8 }] },
        { production: 'input', connections: [{ x: -3.5, y: -1.5, direction: 12 }] },
        { production: 'output', connections: [{ x: -3.5, y: 1.5, direction: 12 }] },
        { production: 'input', connections: [{ x: 3.5, y: -1.5, direction: 4 }] },
        { production: 'output', connections: [{ x: 3.5, y: 1.5, direction: 4 }] },
        { production: 'output', connections: [{ x: 3.5, y: 3.5, direction: 4 }] },
      ],
    },
    // Burns chemical fuel at 90kW (effectivity 1).
    'stone-furnace': {
      name: 'stone-furnace', size: { w: 2, h: 2 }, craftingSpeed: 1, categories: ['smelting'], energy: 'burner',
      energyUsage: 90000, effectivity: 1, fuelCategories: ['chemical'], fluidBoxes: [],
    },
  },
  fuels: {
    coal: { name: 'coal', fuelValue: 4000000, categories: ['chemical'] },
    'nuclear-fuel-cell': { name: 'nuclear-fuel-cell', fuelValue: 8000000000, categories: ['nuclear'] },
  },
  // Vanilla Factorio 2.0 prototypes; the owner's Inserter_Config mod allows custom vectors.
  inserters: {
    'fast-inserter': {
      name: 'fast-inserter', pickup: { x: 0, y: -1 }, insert: { x: 0, y: 1.2 },
      rotationSpeed: 0.04, extensionSpeed: 0.1, energy: 'electric', customVectors: true,
    },
    'long-handed-inserter': {
      name: 'long-handed-inserter', pickup: { x: 0, y: -2 }, insert: { x: 0, y: 2.2 },
      rotationSpeed: 0.02, extensionSpeed: 0.05, energy: 'electric', customVectors: true,
    },
    'burner-inserter': {
      name: 'burner-inserter', pickup: { x: 0, y: -1 }, insert: { x: 0, y: 1.2 },
      rotationSpeed: 0.013, extensionSpeed: 0.035, energy: 'burner', customVectors: true,
    },
  },
  poles: {
    'medium-electric-pole': { name: 'medium-electric-pole', size: { w: 1, h: 1 }, supplyRadius: 3.5, wireReach: 9 },
  },
  belts: {
    'transport-belt': { name: 'transport-belt', itemsPerSecond: 15, underground: { name: 'underground-belt', maxDistance: 5 } },
  },
  pipes: {
    'pipe-to-ground': { name: 'pipe-to-ground', maxDistance: 10 },
  },
};

export const logistics = {
  belt: 'transport-belt', pipe: 'pipe-to-ground', pole: 'medium-electric-pole',
  inserter: 'fast-inserter', longInserter: 'long-handed-inserter', fuel: 'coal', rightAngle: true,
};

// Exact Pyanodons entries from data/catalog.json. Py names its own electronic-circuit recipe the
// same as vanilla's, so it lives in a catalog of its own.
export const pyCatalog = {
  ...catalog,
  recipes: {
    ...catalog.recipes,
    'electronic-circuit': {
      name: 'electronic-circuit', category: 'chip', time: 4,
      ingredients: [
        { type: 'item', name: 'pcb1', amount: 1 }, { type: 'item', name: 'vacuum-tube', amount: 3 },
        { type: 'item', name: 'inductor1', amount: 3 }, { type: 'item', name: 'capacitor1', amount: 5 },
        { type: 'item', name: 'resistor1', amount: 6 }, { type: 'item', name: 'solder', amount: 2 },
        { type: 'item', name: 'battery-mk00', amount: 1 },
      ],
      products: [{ type: 'item', name: 'electronic-circuit', amount: 3 }],
    },
    'small-parts-01': {
      name: 'small-parts-01', category: 'crafting', time: 0.2,
      ingredients: [
        { type: 'item', name: 'iron-gear-wheel', amount: 1 }, { type: 'item', name: 'copper-cable', amount: 3 },
        { type: 'item', name: 'bolts', amount: 3 },
      ],
      products: [{ type: 'item', name: 'small-parts-01', amount: 2 }],
    },
    'py-science-pack-2': {
      name: 'py-science-pack-2', category: 'research', time: 180,
      ingredients: [
        { type: 'item', name: 'moss', amount: 400 }, { type: 'item', name: 'zipir-eggs', amount: 15 },
        { type: 'item', name: 'paragen', amount: 1 }, { type: 'item', name: 'solidified-sarcorus', amount: 2 },
        { type: 'item', name: 'alien-sample-02', amount: 1 }, { type: 'item', name: 'casein', amount: 30 },
        { type: 'fluid', name: 'arqad-honey', amount: 600 }, { type: 'fluid', name: 'flavonoids', amount: 100 },
        { type: 'item', name: 'plastic-bar', amount: 36 }, { type: 'item', name: 'flask', amount: 18 },
        { type: 'item', name: 'mechanical-parts-01', amount: 2 },
      ],
      products: [{ type: 'item', name: 'py-science-pack-2', amount: 18 }],
    },
    bolts: {
      name: 'bolts', category: 'crafting', time: 0.2,
      ingredients: [{ type: 'item', name: 'iron-stick', amount: 2 }],
      products: [{ type: 'item', name: 'bolts', amount: 2 }],
    },
    'iron-stick': {
      name: 'iron-stick', category: 'crafting', time: 0.5,
      ingredients: [{ type: 'item', name: 'iron-plate', amount: 1 }],
      products: [{ type: 'item', name: 'iron-stick', amount: 2 }],
    },
    fertilizer: {
      name: 'fertilizer', category: 'agitator', time: 5,
      ingredients: [
        { type: 'fluid', name: 'blood', amount: 30 }, { type: 'item', name: 'bones', amount: 6 },
        { type: 'item', name: 'urea', amount: 5 }, { type: 'item', name: 'ash', amount: 10 },
        { type: 'item', name: 'biomass', amount: 20 },
      ],
      products: [{ type: 'item', name: 'fertilizer', amount: 10 }],
    },
    'Moss-1': {
      name: 'Moss-1', category: 'moss', time: 100,
      ingredients: [{ type: 'fluid', name: 'muddy-sludge', amount: 100 }, { type: 'fluid', name: 'carbon-dioxide', amount: 100 }],
      products: [{ type: 'item', name: 'moss', amount: 8 }],
    },
    soil: {
      name: 'soil', category: 'soil-extraction', time: 8,
      ingredients: [{ type: 'fluid', name: 'water', amount: 800 }],
      products: [{ type: 'item', name: 'soil', amount: 16 }], allowProductivity: true,
    },
    'iron-plate-1': {
      name: 'iron-plate-1', category: 'casting', time: 4,
      ingredients: [{ type: 'fluid', name: 'molten-iron', amount: 100 }, { type: 'item', name: 'borax', amount: 3 }, { type: 'item', name: 'sand-casting', amount: 1 }],
      products: [{ type: 'item', name: 'iron-plate', amount: 60 }], allowProductivity: true,
    },
  },
  // Py farms run on plant and animal modules; module data as pyalienlife defines it
  // (prototypes/items/items.lua, prototypes/buildings/moss-farm.lua), with the 16 slots that the
  // catalog's crafting speed of 1/16 implies. Vanilla's speed module for comparison.
  modules: {
    moss: { name: 'moss', category: 'moss', tier: 1, effect: { pollution: 1, speed: 1 } },
    'moss-mk02': { name: 'moss-mk02', category: 'moss', tier: 2, effect: { pollution: 1, speed: 2 } },
    'speed-module': { name: 'speed-module', category: 'speed', tier: 1, effect: { speed: 0.2, consumption: 0.5 } },
    'productivity-module': { name: 'productivity-module', category: 'productivity', tier: 1, effect: { productivity: 0.04, consumption: 0.4, speed: -0.05 } },
  },
  buildings: {
    ...catalog.buildings,
    'moss-farm-mk01': {
      name: 'moss-farm-mk01', size: { w: 6, h: 6 }, craftingSpeed: 0.0625, categories: ['moss'], energy: 'electric', energyUsage: 100000,
      moduleSlots: 16, allowedEffects: ['speed', 'productivity', 'consumption', 'pollution', 'quality'], allowedModuleCategories: ['moss'],
      baseEffect: { speed: -1 }, speedLow: -0.9999,
      fluidBoxes: [
        { production: 'input', connections: [{ x: 1.5, y: -2.5, direction: 0 }] },
        { production: 'input', connections: [{ x: -1.5, y: -2.5, direction: 0 }] },
        { production: 'output', connections: [{ x: 1.5, y: 2.5, direction: 8 }] },
        { production: 'output', connections: [{ x: -1.5, y: 2.5, direction: 8 }] },
      ],
    },
    'agitator-mk01': {
      name: 'agitator-mk01', size: { w: 5, h: 5 }, craftingSpeed: 1, categories: ['agitator'], energy: 'electric', energyUsage: 1000000,
      fluidBoxes: [
        { production: 'input', connections: [{ x: 2, y: 0, direction: 4 }] },
        { production: 'input', connections: [{ x: 0, y: 2, direction: 8 }] },
        { production: 'output', connections: [{ x: -2, y: 0, direction: 12 }] },
        { production: 'output', connections: [{ x: 0, y: -2, direction: 0 }] },
      ],
    },
    'chipshooter-mk01': {
      name: 'chipshooter-mk01', size: { w: 5, h: 5 }, craftingSpeed: 1, categories: ['chip'], energy: 'electric', fluidBoxes: [],
    },
    'research-center-mk01': {
      name: 'research-center-mk01', size: { w: 10, h: 10 }, craftingSpeed: 1, categories: ['research', 'research-handcrafting'],
      energy: 'electric', energyUsage: 800000,
      fluidBoxes: [
        { production: 'input', connections: [{ x: 0.5, y: -4.5, direction: 0 }] },
        { production: 'input', connections: [{ x: -1.5, y: -4.5, direction: 0 }] },
        { production: 'input', connections: [{ x: 2.5, y: -4.5, direction: 0 }] },
        { production: 'output', connections: [{ x: 0.5, y: 4.5, direction: 8 }] },
        { production: 'output', connections: [{ x: -1.5, y: 4.5, direction: 8 }] },
        { production: 'output', connections: [{ x: 2.5, y: 4.5, direction: 8 }] },
      ],
    },
    'automated-factory-mk01': {
      name: 'automated-factory-mk01', size: { w: 7, h: 7 }, craftingSpeed: 1, categories: ['crafting', 'crafting-with-fluid', 'advanced-crafting'],
      energy: 'electric',
      fluidBoxes: [
        { production: 'input', connections: [{ x: 0, y: 3, direction: 8 }] },
        { production: 'input', connections: [{ x: 0, y: -3, direction: 0 }] },
        { production: 'output', connections: [{ x: 2, y: 3, direction: 8 }] },
      ],
    },
    // Output Drops: the soil extractor puts its soil on the tile south of it, the casting unit its
    // plates on the tile west of its second row.
    'soil-extractor-mk01': {
      name: 'soil-extractor-mk01', size: { w: 7, h: 7 }, craftingSpeed: 1, categories: ['soil-extraction'], energy: 'electric', energyUsage: 400000,
      drop: { x: 0, y: 3.51 },
      fluidBoxes: [{ production: 'input', connections: [{ x: 3, y: 0, direction: 4 }, { x: -3, y: 0, direction: 12 }] }],
    },
    'casting-unit-mk01': {
      name: 'casting-unit-mk01', size: { w: 7, h: 7 }, craftingSpeed: 1, categories: ['casting'], energy: 'electric', energyUsage: 500000,
      drop: { x: -3.51, y: -2 },
      fluidBoxes: [
        { production: 'input', connections: [{ x: 0, y: -3, direction: 0 }] },
        { production: 'input', connections: [{ x: 0, y: 3, direction: 8 }] },
        { production: 'input', connections: [{ x: 3, y: 0, direction: 4 }] },
        { production: 'input', connections: [{ x: 3, y: 2, direction: 4 }] },
        { production: 'output', connections: [{ x: -3, y: 0, direction: 12 }] },
      ],
    },
  },
  // Pyanodons' yellow belt: its underground reaches 9 tiles.
  belts: { 'transport-belt': { name: 'transport-belt', itemsPerSecond: 15, underground: { name: 'underground-belt', maxDistance: 9 } } },
};
