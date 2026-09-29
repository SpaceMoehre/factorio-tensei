import { solve } from './solve.js';
import { simulate } from './sim.js';
import { encodeBlueprint } from './blueprint.js';
import { createMap } from './render.js';

const STORAGE_KEY = 'factory-tensei:v1';
const $ = id => /** @type {any} */ (document.getElementById(id));

const catalog = await fetch('data/catalog.json').then(r => r.json());
const index = indexCatalog(catalog);
const state = load() ?? {
  goals: [],
  logistics: defaultLogistics(catalog),
};
let map = null;

$('items').replaceChildren(...[...index.producers.keys()].sort().map(name => new Option(name)));
fillSelect($('belt'), Object.keys(catalog.belts), state.logistics.belt);
fillSelect($('pipe'), Object.keys(catalog.pipes), state.logistics.pipe);
fillSelect($('pole'), Object.keys(catalog.poles), state.logistics.pole);
for (const key of ['belt', 'pipe', 'pole']) {
  $(key).addEventListener('change', () => { state.logistics[key] = $(key).value; save(); });
}
$('add-goal').addEventListener('click', () => {
  state.goals.push({ item: '', rate: 60, recipe: '', building: '' });
  renderGoals();
  save();
});
$('calculate').addEventListener('click', build);
$('copy-string').addEventListener('click', () => copy($('bp-string').value, $('copy-string')));
$('copy-json').addEventListener('click', () => copy($('bp-json').value, $('copy-json')));
$('zoom-in').addEventListener('click', () => map?.zoom(1.4));
$('zoom-out').addEventListener('click', () => map?.zoom(1 / 1.4));
$('fit').addEventListener('click', () => map?.fit());
$('empty').textContent = 'Add goals and build a factory block to see its map here.';
renderGoals();

// Recipes that produce each item, restricted to those some building can actually run.
function indexCatalog(catalog) {
  const buildingsFor = new Map();
  const producers = new Map();
  for (const recipe of Object.values(catalog.recipes)) {
    const buildings = Object.values(catalog.buildings)
      .filter(b => b.categories.includes(recipe.category) && hasFluidBoxes(b, recipe))
      .sort((a, b) => a.craftingSpeed - b.craftingSpeed || a.name.localeCompare(b.name));
    if (!buildings.length || !recipe.products.length) continue;
    buildingsFor.set(recipe.name, buildings.map(b => b.name));
    for (const p of recipe.products) {
      if (!producers.has(p.name)) producers.set(p.name, []);
      producers.get(p.name).push(recipe.name);
    }
  }
  for (const [item, recipes] of producers) {
    // Prefer the recipe named after the item, then recipes where it is the first product.
    recipes.sort((a, b) => rank(item, a) - rank(item, b) || a.localeCompare(b));
  }
  return { producers, buildingsFor };

  function rank(item, recipe) {
    if (recipe === item) return 0;
    return catalog.recipes[recipe].products[0].name === item ? 1 : 2;
  }
}

function hasFluidBoxes(building, recipe) {
  const inputs = building.fluidBoxes.filter(b => b.production !== 'output').length;
  const outputs = building.fluidBoxes.filter(b => b.production !== 'input').length;
  return recipe.ingredients.filter(i => i.type === 'fluid').length <= inputs
    && recipe.products.filter(p => p.type === 'fluid').length <= outputs;
}

function defaultLogistics(catalog) {
  const poles = Object.values(catalog.poles).sort((a, b) => b.supplyRadius - a.supplyRadius);
  return {
    belt: catalog.belts['transport-belt'] ? 'transport-belt' : Object.keys(catalog.belts)[0],
    pipe: catalog.pipes['pipe-to-ground'] ? 'pipe-to-ground' : Object.keys(catalog.pipes)[0],
    pole: poles[0].name,
  };
}

function renderGoals() {
  $('goals').replaceChildren(...state.goals.map((goal, i) => goalRow(goal, i)));
}

function goalRow(goal, i) {
  const row = el('div', { className: 'goal' });
  const icon = el('img', { alt: '' });
  if (catalog.icons[goal.item]) icon.src = `sprites/${catalog.icons[goal.item]}`;
  else icon.style.visibility = 'hidden';
  const item = el('input', { type: 'text', value: goal.item, placeholder: 'Item or fluid…', ariaLabel: 'Goal item' });
  item.setAttribute('list', 'items');
  const rate = el('input', { type: 'number', min: '0', step: 'any', value: String(goal.rate), title: 'Target rate per minute', ariaLabel: 'Goal rate per minute' });
  const remove = el('button', { type: 'button', className: 'icon', textContent: '×', title: 'Remove goal' });
  const head = el('div', { className: 'goal-head' }, icon, item, rate, el('span', { textContent: '/min', className: 'hint' }), remove);

  const recipes = index.producers.get(goal.item) ?? [];
  if (!recipes.includes(goal.recipe)) goal.recipe = recipes[0] ?? '';
  const buildings = index.buildingsFor.get(goal.recipe) ?? [];
  if (!buildings.includes(goal.building)) goal.building = buildings[0] ?? '';
  const recipe = el('select', { ariaLabel: 'Recipe' });
  fillSelect(recipe, recipes, goal.recipe);
  const building = el('select', { ariaLabel: 'Building' });
  fillSelect(building, buildings, goal.building);
  const selection = el('div', { className: 'selection' },
    el('span', { textContent: 'Recipe' }), recipe, el('span', { textContent: 'Building' }), building);

  item.addEventListener('change', () => { goal.item = item.value.trim(); goal.recipe = ''; goal.building = ''; renderGoals(); save(); });
  rate.addEventListener('change', () => { goal.rate = Number(rate.value); save(); });
  recipe.addEventListener('change', () => { goal.recipe = recipe.value; goal.building = ''; renderGoals(); save(); });
  building.addEventListener('change', () => { goal.building = building.value; save(); });
  remove.addEventListener('click', () => { state.goals.splice(i, 1); renderGoals(); save(); });
  row.append(head, selection);
  return row;
}

async function build() {
  const status = $('status');
  const goals = state.goals.filter(g => g.item);
  if (!goals.length) return showStatus('error', 'Add at least one goal.');
  const unknown = goals.find(g => !g.recipe || !g.building);
  if (unknown) return showStatus('error', `No recipe and building can produce “${unknown.item}”.`);
  showStatus('', 'Building…');
  await new Promise(r => setTimeout(r, 20));
  let block;
  try {
    block = solve(goals.map(g => ({
      goal: { item: g.item, rate: g.rate },
      selection: { recipe: g.recipe, building: g.building },
    })), catalog, state.logistics);
  } catch (e) {
    $('results').hidden = true;
    return showStatus('error', e.message);
  }
  const { starvation } = simulate(block);
  const starving = new Set(starvation.map(s => s.subBlock).filter(sb => sb !== null));
  map?.destroy();
  $('empty').hidden = true;
  map = createMap($('map'), block, { starving, onHover: describe });

  const machines = block.entities.filter(e => e.kind === 'building').length;
  if (starvation.length) {
    const who = s => (s.subBlock === null ? 'Side Output' : block.subBlocks[s.subBlock].item);
    const lines = starvation.map(s => `${who(s)} gets ${fmt(s.available)} of ${fmt(s.demand)} ${s.item}/min`);
    showStatus('warn', `Starvation:\n• ${lines.join('\n• ')}`);
  } else {
    showStatus('ok', `${machines} machines, ${block.bounds.w}×${block.bounds.h} tiles. No starvation.`);
  }
  status.style.whiteSpace = 'pre-line';
  fillFlows($('side-input'), block.routes.filter(r => r.source === 'side-input'));
  fillFlows($('side-output'), block.routes.filter(r => r.sink === 'side-output'), block);
  const { string, json } = await encodeBlueprint(block, catalog);
  $('bp-string').value = string;
  $('bp-json').value = JSON.stringify(JSON.parse(json), null, 2);
  $('results').hidden = false;
}

function fillFlows(list, routes, block) {
  const rows = routes.flatMap(r => r.items.map(i => {
    // Leftover on an output route is what the consumers along it do not take.
    const taken = block ? r.consumers.reduce((sum, c) => sum + (block.subBlocks[c].inputs.find(x => x.name === i.item)?.rate ?? 0), 0) : 0;
    const rate = block ? Math.max(0, i.rate - taken) : i.rate;
    return el('li', {}, el('span', { textContent: `${i.item} (${r.kind})` }), el('span', { textContent: `${fmt(rate)}/min` }));
  }));
  list.replaceChildren(...rows);
}

function describe(entity, block) {
  const tip = $('tooltip');
  if (!entity) return (tip.textContent = '');
  const parts = [entity.name];
  if (entity.recipe) parts.push(`recipe: ${entity.recipe}`);
  if (entity.fluid) parts.push(`fluid: ${entity.fluid}`);
  if (entity.route !== undefined && !entity.fluid) {
    parts.push(`carries: ${block.routes[entity.route].items.map(i => i.item).join(' + ')}`);
  }
  if (entity.underground) parts.push(`tunnel ${entity.underground === 'input' ? 'entrance' : 'exit'}`);
  tip.textContent = parts.join(' · ');
}

function showStatus(kind, text) {
  const status = $('status');
  status.className = kind ? `status ${kind}` : 'status';
  status.textContent = text;
}

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    flash(button, 'Copied');
  } catch {
    flash(button, 'Copy failed — select the text instead');
  }
}

function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1500);
}

function fillSelect(select, values, selected) {
  select.replaceChildren(...values.map(v => new Option(v, v, false, v === selected)));
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  if (props.ariaLabel) node.setAttribute('aria-label', props.ariaLabel);
  node.append(...children);
  return node;
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved?.goals || !saved?.logistics) return null;
    for (const key of ['belt', 'pipe', 'pole']) {
      const pool = { belt: catalog.belts, pipe: catalog.pipes, pole: catalog.poles }[key];
      if (!pool[saved.logistics[key]]) return null;
    }
    return saved;
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode); the page works without it.
  }
}
