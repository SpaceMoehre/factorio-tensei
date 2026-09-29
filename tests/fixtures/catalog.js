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
    biomass: {
      name: 'biomass', category: 'compost', time: 1,
      ingredients: [{ type: 'item', name: 'moss', amount: 1 }],
      products: [{ type: 'item', name: 'biomass', amount: 1 }],
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

export const logistics = { belt: 'transport-belt', pipe: 'pipe-to-ground', pole: 'medium-electric-pole' };
