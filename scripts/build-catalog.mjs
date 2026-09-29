import { readFileSync, writeFileSync } from 'node:fs';
import { buildCatalog } from '../js/catalog-builder.js';

const [dumpPath = `${process.env.HOME}/.factorio/script-output/data-raw-dump.json`] = process.argv.slice(2);
const catalog = buildCatalog(JSON.parse(readFileSync(dumpPath, 'utf8')));
writeFileSync(new URL('../data/catalog.json', import.meta.url), JSON.stringify(catalog));
console.log(`catalog.json: ${Object.keys(catalog.recipes).length} recipes, ${Object.keys(catalog.buildings).length} buildings`);
