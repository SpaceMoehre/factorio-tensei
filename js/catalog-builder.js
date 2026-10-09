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
      // A fluid's fluidbox_index: the one input (output) box it takes, counted from 1 (fluidboxes.js).
      ingredients: list(r.ingredients).map(i => ({ type: i.type, name: i.name, amount: i.amount, ...(i.fluidbox_index && { fluidboxIndex: i.fluidbox_index }) })),
      products: list(r.results).map(p => ({ type: p.type, name: p.name, amount: expectedAmount(p), ...(p.fluidbox_index && { fluidboxIndex: p.fluidbox_index }) })),
      ...(r.allowed_module_categories && { allowedModuleCategories: list(r.allowed_module_categories) }),
      ...(r.allow_productivity && { allowProductivity: true }),
    };
  }
  const buildings = {};
  for (const b of [...Object.values(raw['assembling-machine']), ...Object.values(raw.furnace)]) {
    // Hidden: not built in this game (Py hides base's chemical plant and oil refinery for its own).
    if (b.hidden) continue;
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
      // Liquid Fuel: a machine burning a fluid (Py's glassworks and smelters) takes it through a
      // box of its energy source, the last of its fluidBoxes (production 'fuel'); its filter, where
      // it burns one fluid only. One heated by its fluid's temperature (burns_fluid false) burns
      // none (heats).
      ...(b.energy_source.type === 'fluid' && {
        effectivity: b.energy_source.effectivity ?? 1,
        ...(b.energy_source.burns_fluid ? {} : { heats: true }),
        ...(b.energy_source.fluid_box.filter && { fuelFilter: b.energy_source.fluid_box.filter }),
      }),
      // Modules: slots, which effects and categories fit, and the effect the machine has built in
      // (Py farms: -100% speed, so they run only on their plant and animal modules).
      ...(b.module_slots > 0 && {
        moduleSlots: b.module_slots,
        ...(b.allowed_effects && { allowedEffects: [b.allowed_effects].flat() }),
        ...(b.allowed_module_categories && { allowedModuleCategories: list(b.allowed_module_categories) }),
        ...(b.effect_receiver?.base_effect && { baseEffect: b.effect_receiver.base_effect }),
        ...(b.effect_receiver?.speed_limits?.low !== undefined && { speedLow: b.effect_receiver.speed_limits.low }),
      }),
      ...(dropPoint(b) && { drop: dropPoint(b) }),
      fluidBoxes: [
        ...(b.fluid_boxes ?? []).map(fb => fluidBox(fb, fb.production_type)),
        ...(b.energy_source.type === 'fluid' ? [fluidBox(b.energy_source.fluid_box, 'fuel')] : []),
      ],
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
  const plainPipes = Object.values(raw.pipe ?? {}).filter(p => !p.hidden).map(p => p.name).sort();
  const modules = {};
  for (const m of Object.values(raw.module ?? {})) {
    if (!m.hidden) modules[m.name] = { name: m.name, category: m.category, tier: m.tier ?? 1, effect: m.effect ?? {} };
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
  for (const type of ITEM_TYPES.filter(t => t !== 'fluid')) {
    for (const p of Object.values(raw[type] ?? {})) {
      if (p.fuel_value && energy(p.fuel_value) > 0) fuels[p.name] = { name: p.name, fuelValue: energy(p.fuel_value), categories: fuelCategories(p) };
    }
  }
  // Liquid Fuels: fluids with a fuel value, burnt per unit.
  const fluidFuels = {};
  for (const p of Object.values(raw.fluid ?? {})) {
    if (!p.hidden && p.fuel_value && energy(p.fuel_value) > 0) fluidFuels[p.name] = { name: p.name, fuelValue: energy(p.fuel_value) };
  }
  return { recipes, buildings, poles, belts, pipes, plainPipes, inserters, fuels, fluidFuels, modules, signals: virtualSignals(raw), icons: spriteIcons(raw), footprints: footprints(raw) };
}

// The virtual signals an Inserter Clock may take, in the game's order (by subgroup, then their
// own order): not the wildcards, nor hidden or parameter signals (a blueprint's parameters).
const WILDCARDS = ['signal-everything', 'signal-anything', 'signal-each'];
function virtualSignals(raw) {
  const ordered = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const group = s => raw['item-subgroup']?.[s.subgroup]?.order ?? '';
  return Object.values(raw['virtual-signal'] ?? {})
    .filter(s => !s.hidden && !s.parameter && s.subgroup !== 'parameters' && !WILDCARDS.includes(s.name))
    .sort((a, b) => ordered(group(a), group(b)) || ordered(a.order ?? '', b.order ?? '') || ordered(a.name, b.name))
    .map(s => s.name);
}

// Every entity's tile footprint facing north, so a City Block's blueprint can hold anything:
// from its collision box, or the tile size it names.
function footprints(raw) {
  const out = {};
  for (const group of Object.values(raw)) {
    for (const p of Object.values(group ?? {})) {
      if (!p?.name || !Array.isArray(p.collision_box) || out[p.name]) continue;
      const size = footprint(p.collision_box);
      out[p.name] = { w: p.tile_width ?? Math.max(1, size.w), h: p.tile_height ?? Math.max(1, size.h) };
    }
  }
  return out;
}

// A fluid box: its production type, filter and the connections pipes meet (their tiles' offsets
// from the centre facing north, the way they face, and `through` where fluid flows both ways
// there: two machines whose such connections face each other join without a pipe).
function fluidBox(fb, production) {
  return {
    production,
    ...(fb.filter && { filter: fb.filter }),
    connections: fb.pipe_connections
      .filter(c => !c.connection_type || c.connection_type === 'normal')
      .map(c => {
        const [x, y] = c.position ?? c.positions[0];
        return { x, y, direction: c.direction, ...((c.flow_direction ?? 'input-output') === 'input-output' && { through: true }) };
      }),
  };
}

// Where a machine puts its products itself (Output Drop: vector_to_place_result, Py's soil
// extractors and casting units), from its centre facing north: only a point beside the machine,
// where a belt can take them.
function dropPoint(b) {
  if (!b.vector_to_place_result) return null;
  const { x, y } = vector(b.vector_to_place_result);
  const { w, h } = footprint(b.collision_box);
  return Math.abs(x) >= w / 2 || Math.abs(y) >= h / 2 ? { x, y } : null;
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
// Icons as files under sprites/: "__pyhightechgraphics__/graphics/icons/pcb1.png" becomes
// "pyhightechgraphics/graphics/icons/pcb1.png" (scripts/build-sprites.mjs extracts them from the
// game and the mod zips). Layered icons show their first layer. Virtual signals' too, for the
// signals an Inserter Clock may take.
function spriteIcons(raw) {
  const icons = {};
  for (const type of [...ITEM_TYPES, 'virtual-signal']) {
    for (const p of Object.values(raw[type] ?? {})) {
      const path = p.icon ?? p.icons?.[0]?.icon;
      const match = /^__([^/]+)__\/(.+)$/.exec(path ?? '');
      // (Some mods name a folder twice: graphics/icons//sap-extractor-mk01.png.)
      if (match) icons[p.name] = `${match[1]}/${match[2].replace(/\/{2,}/g, '/')}`;
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
