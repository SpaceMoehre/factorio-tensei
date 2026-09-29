// Gives the published site its icons from mod zips alone (no game install): the Pages workflow
// downloads the Pyanodons release zips into a mods folder, then runs
//   node scripts/site-sprites.mjs <mods folder> <site folder>
// Icons the catalog names by path are taken when a zip has them; every other item, fluid and
// entity is looked up by name (findIcons). The icons go to <site>/sprites/ and the site's copy of
// the catalog is pointed at them; data/catalog.json itself is never changed.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildSprites, findIcons } from './sprites.mjs';

const [mods, site] = process.argv.slice(2);
if (!mods || !site) {
  console.error('usage: node scripts/site-sprites.mjs <mods folder> <site folder>');
  process.exit(1);
}
const file = join(site, 'data/catalog.json');
const catalog = JSON.parse(readFileSync(file, 'utf8'));
const out = join(site, 'sprites');
const game = join(site, 'no-game');

const names = new Set();
for (const r of Object.values(catalog.recipes)) for (const x of [...r.ingredients, ...r.products]) names.add(x.name);
for (const group of ['buildings', 'inserters', 'poles', 'belts', 'pipes']) for (const name of Object.keys(catalog[group] ?? {})) names.add(name);

// Paths the catalog already names, where a zip has them.
const named = Object.fromEntries(Object.entries(catalog.icons ?? {}).filter(([name, path]) => names.has(name) && path.includes('/graphics/')));
const kept = {};
for (const [name, path] of Object.entries(named)) {
  if (buildSprites({ [name]: path }, { game, mods, out }).written) kept[name] = path;
}
const byName = findIcons([...names].filter(n => !kept[n]), mods);
const { missing } = buildSprites(byName, { game, mods, out });
rmSync(game, { recursive: true, force: true });
catalog.icons = { ...kept, ...Object.fromEntries(Object.entries(byName).filter(([, path]) => !missing.includes(path))) };
writeFileSync(file, JSON.stringify(catalog));

const found = Object.keys(catalog.icons).length;
const without = [...names].filter(n => !catalog.icons[n]);
console.log(`icons: ${found} of ${names.size} items, fluids and entities (${Object.keys(kept).length} by catalog path, ${found - Object.keys(kept).length} by name)`);
if (without.length) console.log(`without an icon (${without.length}), e.g.: ${without.slice(0, 20).join(', ')}`);
