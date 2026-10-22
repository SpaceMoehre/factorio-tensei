import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCatalog } from '../js/catalog-builder.js';

// The game's names come from its locale dump (`factorio --dump-prototype-locale`) beside the data
// dump, or the path given second.
const [dumpPath = `${process.env.HOME}/.factorio/script-output/data-raw-dump.json`, localePath = join(dirname(dumpPath), 'prototype-locale.json')] = process.argv.slice(2);
const locale = existsSync(localePath) ? JSON.parse(readFileSync(localePath, 'utf8')) : null;
if (!locale) console.warn(`no ${localePath}: names are made of prototype names (run factorio --dump-prototype-locale)`);
const catalog = buildCatalog(JSON.parse(readFileSync(dumpPath, 'utf8')), locale);
writeFileSync(new URL('../data/catalog.json', import.meta.url), JSON.stringify(catalog));
const count = key => Object.keys(catalog[key]).length;
console.log(`catalog.json: ${count('recipes')} recipes, ${count('buildings')} buildings, ${count('inserters')} inserters, ${count('fuels')} fuels, ${Object.keys(catalog.names ?? {}).length} names`);
