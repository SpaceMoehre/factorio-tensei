// Py's TURD upgrades (Alien Life's technology upgrades) from the Pyanodons source, for the catalog
// (ADR 0122, 0123): each upgrade technology, the buildings it affects (`affected`, in tier order) and
// its sub-technologies, the user choosing one of them, with the recipes each unlocks and those it
// replaces (old → new), the buildings it replaces, and whether it gives the affected buildings a
// module's effect (Py puts its hidden module, `<choice>-module` or `-mk0<tier>`, in a hidden beacon
// on each). The game's data dump names the
// upgrade technologies (`is_turd`) but not what each choice unlocks: Py's script does that.
//   git clone https://github.com/pyanodon/pyalienlife
//   node scripts/py-turds.mjs <pyalienlife folder> [out.json]
// Then npm run build-catalog: the catalog keeps the upgrades and recipes its dump has.
// Each upgrade file returns its table; its prototypes (inside `if data then`) are skipped.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import fengari from 'fengari';

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const [root, out = new URL('../data/py-turds.json', import.meta.url).pathname] = process.argv.slice(2);
const dir = root && join(root, 'prototypes', 'upgrades');
if (!dir || !existsSync(dir)) {
  console.error('usage: node scripts/py-turds.mjs <pyalienlife folder> [out.json]');
  process.exit(1);
}

// The upgrade file's table as JSON (a Lua serializer: tables as objects or arrays, strings,
// numbers, booleans).
const SERIALIZE = String.raw`
local function json(v)
  local t = type(v)
  if t == "table" then
    local n = #v
    local parts = {}
    if n > 0 then
      for i = 1, n do parts[i] = json(v[i]) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    for k, x in pairs(v) do parts[#parts + 1] = string.format("%q", tostring(k)) .. ":" .. json(x) end
    return "{" .. table.concat(parts, ",") .. "}"
  elseif t == "string" then return string.format("%q", v):gsub("\\\n", "\\n")
  elseif t == "number" or t == "boolean" then return tostring(v)
  else return "null" end
end
return json
`;

function upgradeOf(file) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  // No data stage: `if data then` skipped. Every mod counted installed.
  const prelude = 'data = nil; script = nil; mods = setmetatable({}, { __index = function() return true end })';
  const source = `${prelude}\nlocal json = (function() ${SERIALIZE} end)()\nlocal upgrade = (function() ${readFileSync(file, 'utf8')} end)()\nreturn upgrade and json(upgrade) or "null"`;
  if (lauxlib.luaL_loadstring(L, to_luastring(source)) !== lua.LUA_OK || lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
    throw new Error(`${file}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  }
  return JSON.parse(to_jsstring(lua.lua_tostring(L, -1)));
}

// (An empty Lua table comes as {}.)
const list = v => (Array.isArray(v) ? v : []);
const upgrades = [];
for (const name of readdirSync(dir).filter(f => f.endsWith('.lua')).sort()) {
  const upgrade = upgradeOf(join(dir, name));
  if (!upgrade?.master_tech?.name) continue;
  upgrades.push({
    name: upgrade.master_tech.name,
    affected: list(upgrade.affected_entities),
    choices: list(upgrade.sub_techs).map(sub => ({
      name: sub.name,
      unlock: list(sub.effects).filter(e => e.type === 'unlock-recipe').map(e => e.recipe),
      replace: Object.fromEntries(list(sub.effects).filter(e => e.type === 'recipe-replacement').map(e => [e.old, e.new])),
      machines: Object.fromEntries(list(sub.effects).filter(e => e.type === 'machine-replacement').map(e => [e.old, e.new])),
      modules: list(sub.effects).some(e => e.type === 'module-effects'),
    })),
  });
}
writeFileSync(out, `${JSON.stringify(upgrades.sort((a, b) => a.name.localeCompare(b.name)), null, 1)}\n`);
console.log(`${out}: ${upgrades.length} upgrades, ${upgrades.reduce((n, u) => n + u.choices.length, 0)} choices`);
