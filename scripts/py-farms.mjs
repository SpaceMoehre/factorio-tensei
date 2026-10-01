// Py farm data from the Pyanodons source, for a catalog that lacks it (one built before module
// data was recorded) or to correct its farm speeds: every plant and animal module (category,
// tier, effect) and every farm building (module slots, which modules it takes, its built-in -100%
// speed and its crafting speed, from py.farm_speed). It runs the mods' building, item and
// module-restriction prototypes, and Alien Life's updates to the other Py mods' farms, in a Lua VM
// with Factorio's data stage stubbed out. Farms of other Py mods (the moondrop greenhouse of Py
// High Tech, the guar gum plantation of Py Petroleum Handling, the numal reef of Py Alternative
// Energy, ...) come from those mods cloned beside pyalienlife:
//   for m in pyalienlife pyhightech pypetroleumhandling pyalternativeenergy pycoalprocessing \
//     pyindustry pyfusionenergy pyrawores; do git clone https://github.com/pyanodon/$m; done
//   node scripts/py-farms.mjs <pyalienlife folder> [catalog.json]
// A catalog built from the game's own data dump (npm run build-catalog) already has all of this,
// for the mod versions actually installed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import fengari from 'fengari';

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const [root, catalogPath = new URL('../data/catalog.json', import.meta.url).pathname] = process.argv.slice(2);
if (!root || !existsSync(join(root, 'data.lua'))) {
  console.error('usage: node scripts/py-farms.mjs <pyalienlife folder> [catalog.json]');
  process.exit(1);
}
// The Py mods in the order the game loads them (dependencies first); those not cloned beside
// pyalienlife are left out.
const ORDER = ['pycoalprocessing', 'pyindustry', 'pyfusionenergy', 'pyrawores', 'pyhightech', 'pypetroleumhandling', 'pyalienlife', 'pyalternativeenergy'];
const folders = Object.fromEntries(ORDER.map(m => [m, m === 'pyalienlife' ? root : join(dirname(root), m)])
  .filter(([, dir]) => existsSync(join(dir, 'data.lua'))));

// Factorio's data stage, as much of it as the prototypes need: data.raw and data:extend, the Py
// prototype constructors (whose chained helpers do nothing here), py.farm_speed and
// py.farm_speed_derived as pypostprocessing defines them, and a permissive stand-in for every
// other global, so graphics and sound helpers never stop a file.
const PRELUDE = String.raw`
local P = {}
setmetatable(P, {
  __index = function() return P end, __newindex = function() end, __call = function() return P end,
  __add = function() return P end, __sub = function() return P end, __mul = function() return P end,
  __div = function() return P end, __unm = function() return P end, __concat = function() return "" end,
  __len = function() return 0 end, __lt = function() return false end, __le = function() return false end,
})
__P = P
-- A prototype's missing field reads as P too, so code touching fields another mod would have set
-- goes on.
local loose = { __index = function() return P end }
-- P stands for any list too: a loop over it ends at once.
function ipairs(t)
  if t == P then return function() return nil end, t, 0 end
  return function(list, i)
    local v = list[i + 1]
    if v == nil or v == P then return nil end
    return i + 1, v
  end, t, 0
end
local function vivify() return setmetatable({}, { __index = function(t, k) local v = setmetatable({}, loose) rawset(t, k, v) return v end }) end
data = { raw = setmetatable({}, { __index = function(t, k) local v = vivify() rawset(t, k, v) return v end }) }
function data.extend(self, list)
  if list == nil then list = self end
  for _, p in ipairs(list) do if type(p) == "table" and p.type and p.name then data.raw[p.type][p.name] = p end end
end
local chain = loose
local function register(p)
  if type(p) == "string" or p == P then return P end
  if type(p) == "table" and rawget(p, "type") and rawget(p, "name") then data.raw[p.type][p.name] = p end
  return setmetatable(p, chain)
end
-- RECIPE("name"):... and RECIPE.helper(...) alike.
for _, name in ipairs({ "ITEM", "ENTITY", "RECIPE", "FLUID", "TECHNOLOGY", "TILE", "RESOURCE", "ITEMGROUP", "ITEMSUBGROUP" }) do
  _G[name] = setmetatable({}, { __call = function(_, p) return register(p) end, __index = function() return P end })
end
py = setmetatable({}, { __index = function() return P end })
function py.farm_speed(num_slots, desired_speed, module_bonus)
  module_bonus = module_bonus or 1
  return desired_speed / (num_slots * module_bonus)
end
function py.farm_speed_derived(this_module_slots, base_entity_name, base_module_bonus, this_module_bonus)
  local mk1 = data.raw["assembling-machine"][base_entity_name]
  local base_module_slots = mk1.module_slots
  base_module_bonus = base_module_bonus or 1
  this_module_bonus = this_module_bonus or this_module_slots / base_module_slots * base_module_bonus
  local base_full_speed = mk1.crafting_speed * base_module_slots * base_module_bonus
  local this_full_speed = base_full_speed * (this_module_bonus / base_module_bonus) * (this_module_slots / base_module_slots)
  return this_full_speed / (this_module_slots * this_module_bonus)
end
util = setmetatable({ by_pixel = function(x, y) return { x / 32, y / 32 } end }, { __index = function() return P end })
function table.deepcopy(o, seen)
  if type(o) ~= "table" then return o end
  seen = seen or {}
  if seen[o] then return seen[o] end
  local c = {}
  seen[o] = c
  for k, v in pairs(o) do c[table.deepcopy(k, seen)] = table.deepcopy(v, seen) end
  return setmetatable(c, getmetatable(o))
end
function table.merge(a, b) for k, v in pairs(b) do a[k] = v end return a end
mods = { base = "2.0", pyalienlife = "3.0", pycoalprocessing = "3.0", pyfusionenergy = "3.0", pyindustry = "3.0",
  pyhightech = "3.0", pyrawores = "3.0", pypetroleumhandling = "3.0", pyalternativeenergy = "3.0", pypostprocessing = "3.0" }
settings = { startup = setmetatable({}, { __index = function() return { value = false } end }) }
feature_flags = setmetatable({}, { __index = function() return false end })
-- A path is relative to the mod whose file requires it, or names its mod: __pyhightech__/...
local loaded = {}
__mod = "pyalienlife"
function require(path)
  local mod, rest = path:match("^__([%w%-_]+)__[/.](.*)$")
  mod = mod or __mod
  rest = (rest or path):gsub("%.lua$", ""):gsub("%.", "/")
  local id = mod .. "/" .. rest
  if loaded[id] ~= nil then return loaded[id] end
  local src = __readfile(mod, rest .. ".lua")
  if not src then loaded[id] = P return P end
  local chunk, err = load(src, "@" .. id, "t", _ENV)
  if not chunk then __log("cannot load " .. id .. ": " .. tostring(err)) loaded[id] = P return P end
  local outer = __mod
  __mod = mod
  local ok, result = pcall(chunk)
  __mod = outer
  if not ok then __log("failed in " .. id .. ": " .. tostring(result)) result = P end
  if result == nil then result = true end
  loaded[id] = result
  return result
end
setmetatable(_G, { __index = function(t, k) return P end })
`;

// What the catalog needs, as JSON: modules, and the farms (machines whose own effect is -100% speed).
const EXTRACT = String.raw`
local function str(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    if c == '"' then return '\\"' elseif c == '\\' then return '\\\\' end
    return ''
  end) .. '"'
end
local function json(v, depth)
  depth = depth or 0
  local t = type(v)
  if t == "number" then if v ~= v or v == math.huge or v == -math.huge then return "null" end return string.format("%.17g", v) end
  if t == "string" then return str(v) end
  if t == "boolean" then return tostring(v) end
  if t ~= "table" or v == __P or depth > 4 then return "null" end
  if #v > 0 then
    local parts = {}
    for i = 1, #v do parts[#parts + 1] = json(rawget(v, i), depth + 1) end
    return "[" .. table.concat(parts, ",") .. "]"
  end
  local parts = {}
  for k, x in pairs(v) do
    if type(k) == "string" and type(x) ~= "function" then parts[#parts + 1] = str(k) .. ":" .. json(x, depth + 1) end
  end
  return "{" .. table.concat(parts, ",") .. "}"
end
local out = { modules = {}, farms = {} }
for _, m in pairs(rawget(data.raw, "module") or {}) do
  if type(m) == "table" then
    out.modules[#out.modules + 1] = { name = rawget(m, "name"), category = rawget(m, "category"), tier = rawget(m, "tier"), effect = rawget(m, "effect") }
  end
end
-- A farm: a machine that cannot run without modules (-100% speed of its own), or one that takes
-- plants or animals (module-restrictions). One another Py mod defines and Alien Life changes,
-- with that mod missing, has only the fields Alien Life sets: its key is its name.
for key, b in pairs(rawget(data.raw, "assembling-machine") or {}) do
  local receiver = type(b) == "table" and rawget(b, "effect_receiver")
  local base = type(receiver) == "table" and rawget(receiver, "base_effect")
  base = type(base) == "table" and base or nil
  if (base and rawget(base, "speed") == -1) or (type(b) == "table" and type(rawget(b, "allowed_module_categories")) == "table") then
    local limits = type(receiver) == "table" and rawget(receiver, "speed_limits") or nil
    out.farms[#out.farms + 1] = {
      name = rawget(b, "name") or key, module_slots = rawget(b, "module_slots"), crafting_speed = rawget(b, "crafting_speed"),
      allowed_effects = rawget(b, "allowed_effects"), allowed_module_categories = rawget(b, "allowed_module_categories"),
      base_effect = base, speed_low = type(receiver) == "table" and type(limits) == "table" and rawget(limits, "low") or nil,
    }
  end
end
return json(out)
`;

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const failures = [];
const jsFunction = (name, fn) => {
  lua.lua_pushjsfunction(L, fn);
  lua.lua_setglobal(L, to_luastring(name));
};
jsFunction('__readfile', state => {
  const dir = folders[to_jsstring(lauxlib.luaL_checkstring(state, 1))];
  const path = dir && join(dir, to_jsstring(lauxlib.luaL_checkstring(state, 2)));
  if (path && existsSync(path)) lua.lua_pushstring(state, to_luastring(readFileSync(path, 'utf8')));
  else lua.lua_pushnil(state);
  return 1;
});
jsFunction('__log', state => {
  failures.push(to_jsstring(lauxlib.luaL_checkstring(state, 1)));
  return 0;
});
const run = (source, name) => {
  if (lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(name)) !== lua.LUA_OK
    || lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
    throw new Error(`${name}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
  const result = lua.lua_isstring(L, -1) ? to_jsstring(lua.lua_tostring(L, -1)) : null;
  lua.lua_pop(L, 1);
  return result;
};
run(PRELUDE, 'prelude');

// The prototypes that make farms and their modules, in the order the game loads them: every
// mod's data stage, then every mod's updates — Alien Life's updates to the other Py mods give
// their farms (moondrop greenhouse, guar gum plantation, ...) slots and speeds.
const required = (dir, file) => (existsSync(join(dir, file)) ? [...readFileSync(join(dir, file), 'utf8').matchAll(/require\s*\(?\s*"([^"]+)"/g)].map(m => m[1]) : []);
const wanted = path => /prototypes[/.](buildings|items|updates)[/.]|module-categories|module-restrictions/.test(path) && !path.startsWith('__');
for (const stage of ['data.lua', 'data-updates.lua']) {
  for (const [mod, dir] of Object.entries(folders)) {
    const files = required(dir, stage).filter(wanted);
    // Alien Life's plants and animals: their item files are required from elsewhere.
    if (mod === 'pyalienlife' && stage === 'data.lua') {
      for (const items of ['items/items', 'items/items2', 'items/pyhightech-items', 'items/pyalternativeenergy-items']) {
        if (files.some(f => f.endsWith(items))) continue;
        const restrictions = files.findIndex(f => f.includes('module-restrictions'));
        files.splice(restrictions < 0 ? files.length : restrictions, 0, `prototypes/${items}`);
      }
    }
    for (const file of files) run(`require(${JSON.stringify(`__${mod}__/${file}`)})`, `${mod}/${file}`);
  }
}
const absent = ORDER.filter(m => !folders[m]);
if (absent.length) console.log(`not beside pyalienlife, so their farms are left as they are: ${absent.join(', ')}`);
const { modules, farms } = JSON.parse(run(EXTRACT, 'extract'));

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
catalog.modules ??= {};
for (const m of modules) {
  if (!m.name || !m.category) continue;
  catalog.modules[m.name] = { name: m.name, category: m.category, tier: m.tier ?? 1, effect: m.effect ?? {} };
}
let patched = 0;
const missing = [];
for (const f of farms) {
  const b = catalog.buildings[f.name];
  if (!b) { missing.push(f.name); continue; }
  if (!(f.module_slots > 0) || typeof f.crafting_speed !== 'number') { failures.push(`${f.name}: no slots or speed`); continue; }
  Object.assign(b, {
    craftingSpeed: f.crafting_speed,
    moduleSlots: f.module_slots,
    ...(f.allowed_effects && { allowedEffects: [f.allowed_effects].flat() }),
    ...(f.allowed_module_categories && { allowedModuleCategories: [f.allowed_module_categories].flat() }),
    ...(f.speed_low !== undefined && f.speed_low !== null && { speedLow: f.speed_low }),
  });
  // A farm that runs without modules (Py's own guar gum plantation mk03) has no base effect.
  if (f.base_effect) b.baseEffect = f.base_effect;
  else delete b.baseEffect;
  patched++;
}
writeFileSync(catalogPath, JSON.stringify(catalog));
console.log(`${modules.length} modules, ${patched} farms patched in ${catalogPath}`);
if (missing.length) console.log(`not in the catalog (${missing.length}): ${missing.join(', ')}`);
for (const f of failures) console.log(`warning: ${f}`);
