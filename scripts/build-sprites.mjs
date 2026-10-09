// Extracts every icon the catalog uses into sprites/:
//   npm run build-sprites -- <Factorio install folder> [mods folder]
// or, without the game, fills in the icons sprites/ lacks from an icon dump
// (factorio --dump-icon-sprites writes script-output/<type>/<name>.png):
//   npm run build-sprites -- --dump <script-output folder>
import { readFileSync, lstatSync, readlinkSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSprites, dumpedSprites } from './sprites.mjs';

const args = process.argv.slice(2);
const dump = args[0] === '--dump' ? args[1] : null;
const [game, mods = `${process.env.HOME}/.factorio/mods`] = dump ? [] : args;
if (!game && !dump) {
  console.error('usage: npm run build-sprites -- <Factorio install folder, the one holding data/> [mods folder]\n       npm run build-sprites -- --dump <script-output folder of factorio --dump-icon-sprites>');
  process.exit(1);
}
const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
// A catalog from before icons were named by mod (paths inside the base game's icons folder, which
// sprites/ was once a symbolic link to) names nothing to extract: rebuild it first.
if (!Object.values(catalog.icons).some(p => /^[^/]+\/graphics\//.test(p))) {
  console.error('data/catalog.json names its icons the old way (no mod folders): run npm run build-catalog first');
  process.exit(1);
}
// sprites/ is a folder of its own: a symbolic link there (from an old checkout) is removed, not
// written through into the folder it points to.
const link = fileURLToPath(new URL('../sprites', import.meta.url));
if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) {
  console.log(`sprites was a symbolic link to ${readlinkSync(link)}; it is a folder now`);
  unlinkSync(link);
}
const out = fileURLToPath(new URL('../sprites/', import.meta.url));
// The item groups' icons (the item picker's tabs) and the technologies' pictures the page shows
// (catalog.art), besides the icons.
const groups = Object.fromEntries((catalog.groups ?? []).filter(g => g.icon).map(g => [g.name, g.icon]));
const art = catalog.art ?? {};
if (dump) {
  for (const [what, icons, folders] of /** @type {[string, any, string[] | null][]} */ ([['icons', catalog.icons, null], ['item group icons', groups, ['item-group']], ['technology pictures', art, ['technology']]])) {
    const { written, missing } = dumpedSprites(icons, { dump, out, folders });
    console.log(`sprites/: ${written} ${what} from the dump${missing.length ? `, ${missing.length} it has none for (e.g. ${missing.slice(0, 3).join(', ')})` : ''}`);
  }
  process.exit(0);
}
const { written, missing } = buildSprites({ ...catalog.icons, ...Object.fromEntries(Object.entries(groups).map(([k, v]) => [`group:${k}`, v])), ...Object.fromEntries(Object.entries(art).map(([k, v]) => [`art:${k}`, v])) }, { game, mods, out });
console.log(`sprites/: ${written} icons${missing.length ? `, ${missing.length} not found (e.g. ${missing.slice(0, 3).join(', ')})` : ''}`);
