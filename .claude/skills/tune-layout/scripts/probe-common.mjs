// Shared by the probes: the setup's City Block, logistics and planner, from run.mjs's setup JSON.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(process.env.ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'));
const { decodeBlueprint, readCityBlock, siteOf } = await import(`${root}/js/city.js`);
const { planner } = await import(`${root}/js/maximize.js`);
// (A setup read as the page reads it; this repo's reading where the code under test has none.)
const { setupOf } = await import(`${root}/js/setup.js`).catch(() => import('../../../../js/setup.js'));
// (Parted by Consumer as the search parts them, where the code under test does.)
const { partByConsumer = (/** @type {any} */ e) => e } = await import(`${root}/js/plan.js`);
export const catalog = JSON.parse(readFileSync(`${root}/data/catalog.json`, 'utf8'));

// { site, logistics, plan, goals, choices (the Chain Choices), city, state (the setup itself),
// entriesFor(n, spare) } for a setup file.
export async function load(file) {
  const st = JSON.parse(readFileSync(file, 'utf8'));
  const { goals, choices, logistics, city } = setupOf(st, catalog);
  const site = !city.on ? null : siteOf(city.blueprint ? readCityBlock(await decodeBlueprint(city.blueprint), catalog) : { area: { x: 0, y: 0, w: city.w, h: city.h }, fixtures: [] }, city.buffer);
  // (Maximize's planner only in a City Block: a setup standing on its own is built.)
  const plan = site ? planner(goals, catalog, logistics, { ...choices, site }) : null;
  return { site, logistics, plan, goals, choices, city, state: st, entriesFor: (n, spare = {}) => partByConsumer(plan.chainOf(plan.goalsFor(n), spare).entries, catalog, logistics) };
}
