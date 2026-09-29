// Extracts every icon the catalog uses into sprites/:
//   npm run build-sprites -- <Factorio install folder> [mods folder]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSprites } from './sprites.mjs';

const [game, mods = `${process.env.HOME}/.factorio/mods`] = process.argv.slice(2);
if (!game) {
  console.error('usage: npm run build-sprites -- <Factorio install folder, the one holding data/> [mods folder]');
  process.exit(1);
}
const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const out = fileURLToPath(new URL('../sprites/', import.meta.url));
const { written, missing } = buildSprites(catalog.icons, { game, mods, out });
console.log(`sprites/: ${written} icons${missing.length ? `, ${missing.length} not found (e.g. ${missing.slice(0, 3).join(', ')})` : ''}`);
