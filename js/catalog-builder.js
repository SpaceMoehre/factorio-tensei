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
  return { recipes, buildings, poles, belts, pipes, icons: baseIcons(raw) };
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
