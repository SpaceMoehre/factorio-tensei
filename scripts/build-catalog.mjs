import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { buildCatalog } from '../js/catalog-builder.js';

// The game's names come from its locale dump (`factorio --dump-prototype-locale`: a
// `<type>-locale.json` each, { names, descriptions }) beside the data dump; any it lacks (Py's TURD
// choices are not technologies in the game) from prototype-locale.json, the one
// scripts/mod-locale.mjs makes from the mods' locale files (ADR 0125), or the path given second.
const [dumpPath = `${process.env.HOME}/.factorio/script-output/data-raw-dump.json`, localePath = join(dirname(dumpPath), 'prototype-locale.json')] = process.argv.slice(2);
const game = Object.fromEntries(readdirSync(dirname(dumpPath)).filter(f => f.endsWith('-locale.json') && f !== basename(localePath))
  .map(f => [f.slice(0, -'-locale.json'.length), JSON.parse(readFileSync(join(dirname(dumpPath), f), 'utf8'))]));
const made = existsSync(localePath) ? JSON.parse(readFileSync(localePath, 'utf8')) : {};
const types = new Set([...Object.keys(made), ...Object.keys(game)]);
const locale = types.size ? Object.fromEntries([...types].map(t => [t, { names: { ...made[t]?.names, ...game[t]?.names } }])) : null;
if (!locale) console.warn(`no locale beside ${dumpPath}: names are made of prototype names (run factorio --dump-prototype-locale, or scripts/mod-locale.mjs on the mods' sources)`);
else console.log(`names: ${Object.keys(game).length ? `the game's (${Object.keys(game).length} types)` : 'none of the game\'s'}${Object.keys(made).length ? `, ${basename(localePath)} for the rest` : ''}`);
// Py's TURD upgrades (ADR 0122), as scripts/py-turds.mjs reads them from the Py source.
const turdsPath = new URL('../data/py-turds.json', import.meta.url);
const turds = existsSync(turdsPath) ? JSON.parse(readFileSync(turdsPath, 'utf8')) : null;
const catalog = buildCatalog(JSON.parse(readFileSync(dumpPath, 'utf8')), locale, turds);
writeFileSync(new URL('../data/catalog.json', import.meta.url), JSON.stringify(catalog));
const count = key => Object.keys(catalog[key]).length;
console.log(`catalog.json: ${count('recipes')} recipes, ${count('buildings')} buildings, ${count('inserters')} inserters, ${count('fuels')} fuels, ${Object.keys(catalog.names ?? {}).length} names`);
