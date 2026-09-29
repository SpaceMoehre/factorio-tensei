function expectedAmount(p) {
  const base = p.amount ?? (p.amount_min + p.amount_max) / 2;
  return (p.probability ?? 1) * (base + (p.extra_count_fraction ?? 0));
}

export function buildCatalog(raw) {
  const recipes = {};
  for (const r of Object.values(raw.recipe)) {
    if (r.hidden || r.parameter) continue;
    recipes[r.name] = {
      name: r.name,
      category: r.category ?? 'crafting',
      time: r.energy_required ?? 0.5,
      ingredients: list(r.ingredients).map(({ type, name, amount }) => ({ type, name, amount })),
      products: list(r.results).map(p => ({ type: p.type, name: p.name, amount: expectedAmount(p) })),
    };
  }
  const buildings = {};
  for (const b of [...Object.values(raw['assembling-machine']), ...Object.values(raw.furnace)]) {
    buildings[b.name] = {
      name: b.name,
      size: footprint(b.collision_box),
      craftingSpeed: b.crafting_speed,
      categories: b.crafting_categories,
      energy: b.energy_source.type,
      energyUsage: energy(b.energy_usage),
      ...(b.energy_source.type === 'burner' && {
        effectivity: b.energy_source.effectivity ?? 1,
        fuelCategories: fuelCategories(b.energy_source),
      }),
      fluidBoxes: (b.fluid_boxes ?? []).map(fb => ({
        production: fb.production_type,
        connections: fb.pipe_connections
          .filter(c => !c.connection_type || c.connection_type === 'normal')
          .map(c => {
            const [x, y] = c.position ?? c.positions[0];
            return { x, y, direction: c.direction };
          }),
      })),
    };
  }
  const poles = {};
  for (const p of Object.values(raw['electric-pole'])) {
    poles[p.name] = {
      name: p.name, size: footprint(p.collision_box),
      supplyRadius: p.supply_area_distance, wireReach: p.maximum_wire_distance,
    };
  }
  const belts = {};
  for (const b of Object.values(raw['transport-belt'])) {
    const ug = raw['underground-belt'][b.related_underground_belt];
    belts[b.name] = {
      name: b.name,
      itemsPerSecond: b.speed * 480,
      underground: ug ? { name: ug.name, maxDistance: ug.max_distance } : null,
    };
  }
  const pipes = {};
  for (const p of Object.values(raw['pipe-to-ground'])) {
    const ug = p.fluid_box.pipe_connections.find(c => c.connection_type === 'underground');
    pipes[p.name] = { name: p.name, maxDistance: ug.max_underground_distance };
  }
  const inserters = {};
  for (const i of Object.values(raw.inserter ?? {})) {
    inserters[i.name] = {
      name: i.name,
      pickup: vector(i.pickup_position ?? [0, -1]),
      insert: vector(i.insert_position ?? [0, 1.2]),
      rotationSpeed: i.rotation_speed,
      extensionSpeed: i.extension_speed,
      energy: i.energy_source.type,
      customVectors: i.allow_custom_vectors ?? false,
    };
  }
  const fuels = {};
  for (const type of ITEM_TYPES) {
    for (const p of Object.values(raw[type] ?? {})) {
      if (p.fuel_value) fuels[p.name] = { name: p.name, fuelValue: energy(p.fuel_value), categories: fuelCategories(p) };
    }
  }
  return { recipes, buildings, poles, belts, pipes, inserters, fuels, icons: baseIcons(raw) };
}

// Factorio 2.0 names one fuel category per item and a list per burner; mods may use either form.
function fuelCategories(p) {
  return p.fuel_categories ?? [p.fuel_category ?? 'chemical'];
}

// Vectors are dumped as [x, y] or { x, y }.
function vector(v) {
  return Array.isArray(v) ? { x: v[0], y: v[1] } : { x: v.x, y: v.y };
}

const SI = { '': 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15 };

// "150kW" → 150000 (watts), "4MJ" → 4000000 (joules).
function energy(text) {
  if (text === undefined) return undefined;
  const [, value, prefix] = /^([\d.]+)\s*([kMGTP]?)[WJ]$/.exec(text) ?? [];
  if (value === undefined) throw new Error(`unreadable energy value "${text}"`);
  return Math.round(Number(value) * SI[prefix]);
}

const ITEM_TYPES = [
  'item', 'fluid', 'tool', 'module', 'ammo', 'capsule', 'armor', 'gun', 'item-with-entity-data',
  'rail-planner', 'repair-tool', 'space-platform-starter-pack',
];
const BASE_ICONS = '__base__/graphics/icons/';

// sprites/ links to the base game's icon folder, so only base-game icons can be shown.
function baseIcons(raw) {
  const icons = {};
  for (const type of ITEM_TYPES) {
    for (const p of Object.values(raw[type] ?? {})) {
      const path = p.icon ?? p.icons?.[0]?.icon;
      if (path?.startsWith(BASE_ICONS)) icons[p.name] = path.slice(BASE_ICONS.length);
    }
  }
  return icons;
}

// The data-raw dump serializes empty Lua tables as {} rather than [].
function list(v) {
  return Array.isArray(v) ? v : [];
}

function footprint([[x1, y1], [x2, y2]]) {
  return { w: Math.ceil(x2 - x1), h: Math.ceil(y2 - y1) };
}
