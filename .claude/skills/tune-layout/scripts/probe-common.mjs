// Shared by the probes: the setup's City Block, logistics and planner, from run.mjs's setup JSON.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(process.env.ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'));
const { decodeBlueprint, readCityBlock, siteOf } = await import(`${root}/js/city.js`);
const { planner } = await import(`${root}/js/maximize.js`);
export const catalog = JSON.parse(readFileSync(`${root}/data/catalog.json`, 'utf8'));

// { site, logistics, plan, goals, state (the setup itself), entriesFor(n, spare) } for a setup file.
export async function load(file) {
  const st = JSON.parse(readFileSync(file, 'utf8'));
  const city = { on: false, buffer: 2, w: 100, h: 100, ...st.city };
  if (st.blueprint && !city.blueprint) Object.assign(city, { on: true, blueprint: st.blueprint });
  const site = !city.on ? null : siteOf(city.blueprint ? readCityBlock(await decodeBlueprint(city.blueprint), catalog) : { area: { x: 0, y: 0, w: city.w, h: city.h }, fixtures: [] }, city.buffer);
  const { budget, ...logistics } = st.logistics;
  const goals = st.goals.filter(g => g.item && g.rate > 0);
  // (Maximize's planner only in a City Block: a setup standing on its own is built.)
  const plan = site ? planner(goals, catalog, logistics, { made: st.made ?? [], selections: st.selections ?? {}, uses: st.uses ?? [], exports: st.exports ?? [], voids: st.voids ?? [], site }) : null;
  return { site, logistics, plan, goals, state: st, entriesFor: (n, spare = {}) => plan.chainOf(plan.goalsFor(n), spare).entries };
}
