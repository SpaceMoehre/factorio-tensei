// Extracts every icon the catalog uses into sprites/:
//   npm run build-sprites -- <Factorio install folder> [mods folder]
import { readFileSync, lstatSync, readlinkSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSprites } from './sprites.mjs';

const [game, mods = `${process.env.HOME}/.factorio/mods`] = process.argv.slice(2);
if (!game) {
  console.error('usage: npm run build-sprites -- <Factorio install folder, the one holding data/> [mods folder]');
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
const { written, missing } = buildSprites(catalog.icons, { game, mods, out });
console.log(`sprites/: ${written} icons${missing.length ? `, ${missing.length} not found (e.g. ${missing.slice(0, 3).join(', ')})` : ''}`);
