// Samples recipes from data/catalog.json, solves each at 2–4 machines and reports how many
// solve, why the rest fail, and how long it takes.
//   node scripts/measure.mjs [samples=300] [seed=1] [budgetMs]
import { readFileSync } from 'node:fs';
import { solve } from '../js/solve.js';

const [samples = 300, seed = 1, budget] = process.argv.slice(2).map(Number);
const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));

let state = seed;
const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const fluidBoxesFit = (b, r) => r.ingredients.filter(i => i.type === 'fluid').length <= b.fluidBoxes.filter(x => x.production !== 'output').length
  && r.products.filter(p => p.type === 'fluid').length <= b.fluidBoxes.filter(x => x.production !== 'input').length;
const runnable = Object.values(catalog.recipes).flatMap(r => {
  const buildings = Object.values(catalog.buildings)
    .filter(b => b.categories.includes(r.category) && fluidBoxesFit(b, r))
    .sort((a, b) => a.craftingSpeed - b.craftingSpeed || a.name.localeCompare(b.name));
  const product = r.products.find(p => p.amount > 0);
  return buildings.length && product ? [{ recipe: r, building: buildings[0], product }] : [];
});

const logistics = {
  belt: 'transport-belt', pipe: 'pipe-to-ground', pole: 'medium-electric-pole',
  inserter: 'fast-inserter', longInserter: 'long-handed-inserter', fuel: 'coal', rightAngle: true,
};
const reasons = new Map();
let solved = 0, total = 0, time = 0;
for (let n = 0; n < samples; n++) {
  const { recipe, building, product } = runnable[Math.floor(random() * runnable.length)];
  const count = 2 + Math.floor(random() * 3);
  const perMachine = building.craftingSpeed / recipe.time * product.amount * 60;
  const entry = { goal: { item: product.name, rate: perMachine * (count - 0.5) }, selection: { recipe: recipe.name, building: building.name } };
  const start = performance.now();
  try {
    solve([entry], catalog, logistics, budget ? { budgetMs: budget } : undefined);
    solved++;
  } catch (e) {
    const reason = e.message.replace(/^\S+(?=: | needs | is too| has no| burns)/, '<name>').replace(/-?\d+(\.\d+)?/g, '#');
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  time += performance.now() - start;
  total++;
}
console.log(`solved ${solved}/${total} (${(100 * solved / total).toFixed(1)}%), mean ${(time / total).toFixed(0)} ms per recipe`);
for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${reason}`);
