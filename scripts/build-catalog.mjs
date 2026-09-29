import { readFileSync, writeFileSync } from 'node:fs';
import { buildCatalog } from '../js/catalog-builder.js';

const [dumpPath = `${process.env.HOME}/.factorio/script-output/data-raw-dump.json`] = process.argv.slice(2);
const catalog = buildCatalog(JSON.parse(readFileSync(dumpPath, 'utf8')));
writeFileSync(new URL('../data/catalog.json', import.meta.url), JSON.stringify(catalog));
const count = key => Object.keys(catalog[key]).length;
console.log(`catalog.json: ${count('recipes')} recipes, ${count('buildings')} buildings, ${count('inserters')} inserters, ${count('fuels')} fuels`);
