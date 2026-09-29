import { simulate } from './sim.js';
import { expandChain, recipeOptions } from './chain.js';
import { encodeBlueprint } from './blueprint.js';
import { createMap } from './render.js';

const STORAGE_KEY = 'factory-tensei:v1';
const SELECTS = ['belt', 'pipe', 'pole', 'inserter', 'longInserter', 'fuel'];
const TRAIN_REASON = { chosen: 'by train', 'no recipe': 'by train — nothing makes it', cycle: 'by train — a recipe loop' };
const $ = id => /** @type {any} */ (document.getElementById(id));

const catalog = await fetch('data/catalog.json').then(r => r.json());
// A catalog built before v2 has no inserters, power draw or fuel; the search needs all three.
const outdated = !catalog.inserters || !catalog.fuels;
if (outdated) Object.assign(catalog, { inserters: {}, fuels: {} });
const index = recipeOptions(catalog);
const choices = {
  belt: Object.keys(catalog.belts), pipe: Object.keys(catalog.pipes), pole: Object.keys(catalog.poles),
  inserter: inserterNames(1), longInserter: inserterNames(2), fuel: Object.keys(catalog.fuels).sort(),
};
const state = load() ?? { goals: [], logistics: {} };
state.logistics = { ...defaultLogistics(), ...state.logistics };
state.inputs ??= [];
state.selections ??= {};
// Goals used to carry their own recipe and building; they are now the chain's selections.
for (const g of state.goals) {
  if (g.recipe && !state.selections[g.item]) state.selections[g.item] = { recipe: g.recipe, building: g.building };
  delete g.recipe;
  delete g.building;
}
// The Production Chain for the current Goals, Train Inputs and selections, or why there is none.
/** @type {any} */
let chain = null;
// The chain's rows by step, with the choices each was drawn for.
const chainRows = new Map();
let map = null;
let worker = null;
// The best layout the running (or last) search has sent, and how many layouts it had tried.
let best = null;

$('items').replaceChildren(...[...index.producers.keys()].sort().map(name => new Option(name)));
$('all-items').replaceChildren(...allItems().map(name => new Option(name)));
for (const key of SELECTS) {
  fillSelect($(key), choices[key], state.logistics[key]);
  $(key).addEventListener('change', () => { state.logistics[key] = $(key).value; save(); });
}
$('right-angle').checked = state.logistics.rightAngle;
$('right-angle').addEventListener('change', () => { state.logistics.rightAngle = $('right-angle').checked; save(); });
$('budget').value = String(state.logistics.budget);
$('budget').addEventListener('change', () => { state.logistics.budget = Math.max(1, Number($('budget').value) || 10); save(); });
$('add-goal').addEventListener('click', () => {
  state.goals.push({ item: '', rate: 60 });
  renderGoals();
  save();
});
$('add-input').addEventListener('click', addInput);
$('new-input').addEventListener('keydown', e => { if (e.key === 'Enter') addInput(); });
$('calculate').addEventListener('click', build);
$('stop').addEventListener('click', () => finish('Stopped'));
$('copy-string').addEventListener('click', () => copy($('bp-string').value, $('copy-string')));
$('copy-json').addEventListener('click', () => copy($('bp-json').value, $('copy-json')));
$('zoom-in').addEventListener('click', () => map?.zoom(1.4));
$('zoom-out').addEventListener('click', () => map?.zoom(1 / 1.4));
$('fit').addEventListener('click', () => map?.fit());
$('empty').textContent = 'Add goals and build a factory block to see its map here.';
renderGoals();
renderInputs();
if (outdated) {
  $('calculate').disabled = true;
  showStatus('error', 'The catalog is missing inserter data — regenerate it (see PRD.md, Catalog).');
}

// Electric inserters (never burner ones) that pick up straight ahead, `reach` tiles out. Py's
// cranes reach diagonally and are not used.
function inserterNames(reach) {
  return Object.values(catalog.inserters)
    .filter(i => i.energy === 'electric' && i.pickup.x === 0 && Math.abs(Math.abs(i.pickup.y) - reach) < 1e-6)
    .map(i => i.name).sort();
}

function defaultLogistics() {
  const poles = Object.values(catalog.poles).sort((a, b) => b.supplyRadius - a.supplyRadius);
  const prefer = (list, name) => (list.includes(name) ? name : list[0]);
  return {
    belt: prefer(choices.belt, 'transport-belt'),
    pipe: prefer(choices.pipe, 'pipe-to-ground'),
    pole: poles[0].name,
    inserter: prefer(choices.inserter, 'fast-inserter'),
    longInserter: prefer(choices.longInserter, 'long-handed-inserter'),
    fuel: prefer(choices.fuel, 'coal'),
    rightAngle: true,
    budget: 10,
  };
}

function renderGoals() {
  $('goals').replaceChildren(...state.goals.map((goal, i) => goalRow(goal, i)));
  renderChain();
}

// A Goal is an item and a rate; how it is made is chosen in the Production Chain. Editing a Goal
// only redraws the chain, so the field being edited keeps its focus.
function goalRow(goal, i) {
  const row = el('div', { className: 'goal' });
  const icon = iconOf(goal.item);
  const item = el('input', { type: 'text', value: goal.item, placeholder: 'Item or fluid…', ariaLabel: 'Goal item' });
  item.setAttribute('list', 'items');
  const rate = el('input', { type: 'number', min: '0', step: 'any', value: String(goal.rate), title: 'Target rate per minute', ariaLabel: 'Goal rate per minute' });
  const remove = el('button', { type: 'button', className: 'icon', textContent: '×', title: 'Remove goal' });
  item.addEventListener('change', () => {
    goal.item = item.value.trim();
    icon.replaceWith(iconOf(goal.item));
    renderChain();
    save();
  });
  rate.addEventListener('change', () => { goal.rate = Number(rate.value); renderChain(); save(); });
  remove.addEventListener('click', () => { state.goals.splice(i, 1); renderGoals(); save(); });
  row.append(el('div', { className: 'goal-head' }, icon, item, rate, el('span', { textContent: '/min', className: 'hint' }), remove));
  return row;
}

function addInput() {
  const item = $('new-input').value.trim();
  if (item && !state.inputs.includes(item)) state.inputs.push(item);
  $('new-input').value = '';
  renderInputs();
  save();
}

function renderInputs() {
  $('inputs').replaceChildren(...state.inputs.map(item => {
    const remove = el('button', { type: 'button', className: 'icon', textContent: '×', title: `Make ${item} in the block` });
    remove.addEventListener('click', () => { state.inputs = state.inputs.filter(i => i !== item); renderInputs(); save(); });
    return el('span', { className: 'chip' }, iconOf(item), el('span', { textContent: item }), remove);
  }));
  renderChain();
}

// The Production Chain: every step with its rate, machines, recipe and building, and what comes
// by train. Rows are kept while their choices stay the same, so a click on one is never lost to
// a redraw.
function renderChain() {
  const goals = state.goals.filter(g => g.item && g.rate > 0);
  try {
    chain = goals.length ? expandChain(goals, catalog, { inputs: state.inputs, selections: state.selections, index }) : null;
  } catch (e) {
    chain = { error: e.message };
  }
  const list = $('chain');
  if (!chain || chain.error) {
    chainRows.clear();
    list.replaceChildren(el('p', { className: 'hint', textContent: chain?.error ?? 'Add a goal to see how it is made.' }));
    return;
  }
  const rows = [];
  const seen = new Set();
  for (const { goal, selection } of chain.entries) {
    const recipes = index.producers.get(goal.item);
    const buildings = index.buildingsFor.get(selection.recipe);
    const key = JSON.stringify(['step', goal.item, recipes, selection, buildings]);
    rows.push(reuse(`step:${goal.item}`, key, () => stepRow(goal.item, recipes, buildings, selection)));
    seen.add(`step:${goal.item}`);
    const building = catalog.buildings[selection.building];
    const recipe = catalog.recipes[selection.recipe];
    const perMachine = building.craftingSpeed / recipe.time * recipe.products.find(p => p.name === goal.item).amount * 60;
    chainRows.get(`step:${goal.item}`).el.querySelector('.rate').textContent = `${fmt(goal.rate)}/min · ${Math.ceil(goal.rate / perMachine - 1e-9)}×`;
  }
  for (const input of chain.trainInputs) {
    const key = JSON.stringify(['train', input.item, input.reason]);
    rows.push(reuse(`train:${input.item}`, key, () => trainRow(input)));
    seen.add(`train:${input.item}`);
    chainRows.get(`train:${input.item}`).el.querySelector('.rate').textContent = `${fmt(input.rate)}/min`;
  }
  for (const k of [...chainRows.keys()]) if (!seen.has(k)) chainRows.delete(k);
  if (rows.some((row, i) => list.children[i] !== row) || list.children.length !== rows.length) list.replaceChildren(...rows);
}

function reuse(id, key, make) {
  const cached = chainRows.get(id);
  if (cached?.key === key) return cached.el;
  const row = make();
  chainRows.set(id, { key, el: row });
  return row;
}

function stepRow(item, recipes, buildings, selection) {
  const recipe = el('select', { ariaLabel: `Recipe for ${item}` });
  fillSelect(recipe, recipes, selection.recipe);
  const building = el('select', { ariaLabel: `Building for ${item}` });
  fillSelect(building, buildings, selection.building);
  const choose = changes => { state.selections[item] = { ...selection, ...changes }; renderChain(); save(); };
  recipe.addEventListener('change', () => choose({ recipe: recipe.value, building: '' }));
  building.addEventListener('change', () => choose({ building: building.value }));
  const isGoal = state.goals.some(g => g.item === item);
  const train = el('button', { type: 'button', className: 'icon', textContent: '⇠', title: `Bring ${item} by train instead` });
  train.addEventListener('click', () => { state.inputs.push(item); renderInputs(); save(); });
  train.hidden = isGoal;
  return el('div', { className: 'step' },
    el('div', { className: 'step-head' }, iconOf(item), el('span', { className: 'name', textContent: item }), el('span', { className: 'rate' }), train),
    el('div', { className: 'selection' }, el('span', { textContent: 'Recipe' }), recipe, el('span', { textContent: 'Building' }), building));
}

function trainRow(input) {
  const make = el('button', { type: 'button', className: 'icon', textContent: '⇢', title: `Make ${input.item} in the block` });
  make.addEventListener('click', () => { state.inputs = state.inputs.filter(i => i !== input.item); renderInputs(); save(); });
  make.hidden = input.reason !== 'chosen';
  return el('div', { className: 'step train' },
    el('div', { className: 'step-head' }, iconOf(input.item), el('span', { className: 'name', textContent: input.item }), el('span', { className: 'rate' }), make),
    el('div', { className: 'hint', textContent: TRAIN_REASON[input.reason] }));
}

// Every item and fluid any recipe uses or makes.
function allItems() {
  const names = new Set();
  for (const r of Object.values(catalog.recipes)) for (const x of [...r.ingredients, ...r.products]) names.add(x.name);
  return [...names].sort();
}

// An item's icon from sprites/ (only its first mipmap is shown), or an empty square.
function iconOf(item) {
  const icon = el('span', { className: 'sprite', title: item });
  if (catalog.icons[item]) icon.style.backgroundImage = `url("sprites/${catalog.icons[item]}")`;
  return icon;
}

// Starts the layout search in a worker. Every better layout it finds replaces the map and the
// blueprint; Stop, or the end of the budget, keeps the best one found.
function build() {
  if (!chain) return showStatus('error', 'Add at least one goal.');
  if (chain.error) return showStatus('error', chain.error);
  worker?.terminate();
  best = null;
  map?.destroy();
  map = null;
  $('area').hidden = true;
  $('results').hidden = true;
  $('bp-string').value = $('bp-json').value = '';
  $('empty').hidden = false;
  $('empty').textContent = 'Searching for a layout…';
  showStatus('', 'Searching…');
  $('stop').hidden = false;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'best') show(data.block, data.tried);
    else if (data.type === 'done') finish('Done', data.tried, data.failure);
    else finish('Stopped', undefined, data.message);
  };
  worker.onerror = e => finish('Stopped', undefined, e.message);
  const { budget, ...logistics } = state.logistics;
  worker.postMessage({
    entries: chain.entries,
    logistics, budgetMs: budget * 1000, seed: 1,
  });
}

async function show(block, tried) {
  best = { block, tried };
  const { starvation } = simulate(block);
  const starving = new Set(starvation.map(s => s.subBlock).filter(sb => sb !== null));
  map?.destroy();
  $('empty').hidden = true;
  map = createMap($('map'), block, { starving, onHover: describe, icon: name => (catalog.icons[name] ? `sprites/${catalog.icons[name]}` : null) });
  $('area').textContent = `${block.bounds.w} × ${block.bounds.h} = ${block.bounds.w * block.bounds.h} tiles`;
  $('area').hidden = false;
  report(block, starvation, worker ? 'Searching…' : null);
  fillFlows($('side-input'), block.routes.filter(r => r.source === 'side-input'));
  fillFlows($('side-output'), block.routes.filter(r => r.sink === 'side-output'), block);
  const { string, json } = await encodeBlueprint(block, catalog);
  if (best?.block !== block) return;
  $('bp-string').value = string;
  $('bp-json').value = JSON.stringify(JSON.parse(json), null, 2);
  $('results').hidden = false;
}

function finish(how, tried = best?.tried ?? 0, error = null) {
  worker?.terminate();
  worker = null;
  $('stop').hidden = true;
  if (!best) {
    $('results').hidden = true;
    $('empty').textContent = 'No layout yet.';
    return showStatus('error', error ?? 'No layout found. Give the search more time.');
  }
  report(best.block, simulate(best.block).starvation, `${how} after ${tried} layouts.`);
}

function report(block, starvation, prefix) {
  const machines = block.entities.filter(e => e.kind === 'building').length;
  const size = `${machines} machines, ${block.bounds.w}×${block.bounds.h} tiles.`;
  const head = prefix ? `${prefix} Best: ${size}` : size;
  if (starvation.length) {
    const who = s => (s.subBlock === null ? 'Side Output' : block.subBlocks[s.subBlock].item);
    const why = s => (s.cause === 'inserters' ? ' (inserters too slow)' : '');
    const lines = starvation.map(s => `${who(s)} gets ${fmt(s.available)} of ${fmt(s.demand)} ${s.item}/min${why(s)}`);
    showStatus('warn', `${head}\nStarvation:\n• ${lines.join('\n• ')}`);
  } else {
    showStatus('ok', `${head} No starvation.`);
  }
  $('status').style.whiteSpace = 'pre-line';
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
  if (entity.vectors) parts.push('90° (Inserter_Config)');
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
    // Settings the catalog no longer offers fall back to their defaults.
    for (const key of SELECTS) if (!choices[key].includes(saved.logistics[key])) delete saved.logistics[key];
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
