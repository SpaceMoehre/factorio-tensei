import { simulate } from './sim.js';
import { expandChain, recipeOptions } from './chain.js';
import { machineEffect, moduleOptions } from './modules.js';
import { encodeBlueprint } from './blueprint.js';
import { createMap, turnsSideways } from './render.js';
import { decodeBlueprint, readCityBlock, siteOf } from './city.js';
import { planner } from './maximize.js';

const STORAGE_KEY = 'factory-tensei:v1';
const SELECTS = ['belt', 'plainPipe', 'pipe', 'pole', 'inserter', 'longInserter', 'fuel'];
const TRAIN_REASON = { import: 'by train', 'no recipe': 'by train — nothing makes it', cycle: 'by train — a recipe loop' };
const $ = id => /** @type {any} */ (document.getElementById(id));

const catalog = await fetch('data/catalog.json').then(r => r.json());
// A catalog built before v2 has no inserters, power draw or fuel; the search needs all three.
const outdated = !catalog.inserters || !catalog.fuels;
if (outdated) Object.assign(catalog, { inserters: {}, fuels: {} });
const index = recipeOptions(catalog);
const choices = {
  belt: Object.keys(catalog.belts), pipe: Object.keys(catalog.pipes), pole: Object.keys(catalog.poles),
  // A catalog built before plain pipes were recorded: the pipe named like each pipe-to-ground.
  plainPipe: catalog.plainPipes ?? Object.keys(catalog.pipes).map(name => name.replace(/-to-ground$/, '')),
  inserter: inserterNames(1), longInserter: inserterNames(2), fuel: Object.keys(catalog.fuels).sort(),
};
const state = load() ?? { goals: [], logistics: {} };
state.logistics = { ...defaultLogistics(), ...state.logistics };
// What comes by train follows from the Goals' recipes; `made` lists the imports the user chose to
// make in the block instead. (Saves from before listed Train Inputs instead; that list is dropped.)
state.made ??= [];
delete state.inputs;
state.selections ??= {};
// The City Block to build in: its blueprint string (or a size, without one), the Buffer and
// whether to look for the highest rate that fits.
state.city = { on: false, blueprint: '', w: 100, h: 100, buffer: 2, maximize: false, ...state.city };
// Goals used to carry their own recipe and building; they are now the chain's selections.
for (const g of state.goals) {
  if (g.recipe && !state.selections[g.item]) state.selections[g.item] = { recipe: g.recipe, building: g.building };
  delete g.recipe;
  delete g.building;
}
// The Production Chain for the current Goals, made items and selections, or why there is none.
/** @type {any} */
let chain = null;
// The chain's rows by step, with the choices each was drawn for.
const chainRows = new Map();
// Redrawing the chain removes the focused field, whose blur can fire another change mid-redraw;
// that redraw waits for this one to finish.
let drawing = false;
let map = null;
let worker = null;
// The best layout the running (or last) search has sent, and how many layouts it had tried.
let best = null;
// The City Block read from its blueprint ({ area, fixtures, unknown, blueprint } or { error }),
// null without one; and what the running (or last) build used: the blueprint its Fixtures came
// from, whether it maximizes, and the try in progress.
let city = null;
let reading = 0;
let cityRead = Promise.resolve();
let built = null;

$('items').replaceChildren(...[...index.producers.keys()].sort().map(name => new Option(name)));
for (const key of SELECTS) {
  fillSelect($(key), choices[key], state.logistics[key]);
  $(key).addEventListener('change', () => { state.logistics[key] = $(key).value; save(); });
}
$('right-angle').checked = state.logistics.rightAngle;
$('right-angle').addEventListener('change', () => { state.logistics.rightAngle = $('right-angle').checked; save(); });
$('handSize').value = String(state.logistics.handSize);
$('handSize').addEventListener('change', () => {
  state.logistics.handSize = Math.min(12, Math.max(1, Math.floor(Number($('handSize').value) || 1)));
  $('handSize').value = String(state.logistics.handSize);
  save();
});
$('budget').value = String(state.logistics.budget);
$('budget').addEventListener('change', () => { state.logistics.budget = Math.max(1, Number($('budget').value) || 10); save(); });
$('add-goal').addEventListener('click', () => {
  state.goals.push({ item: '', rate: 60 });
  renderGoals();
  save();
});
$('city-on').checked = state.city.on;
$('city-on').addEventListener('change', () => { state.city.on = $('city-on').checked; renderCity(); save(); });
$('city-bp').value = state.city.blueprint;
$('city-bp').addEventListener('input', () => { state.city.blueprint = $('city-bp').value.trim(); save(); readCity(); });
$('city-load').addEventListener('click', () => $('city-file').click());
$('city-file').addEventListener('change', async () => {
  const [file] = $('city-file').files;
  if (!file) return;
  state.city.blueprint = $('city-bp').value = (await file.text()).trim();
  $('city-file').value = '';
  save();
  readCity();
});
$('city-clear').addEventListener('click', () => { state.city.blueprint = $('city-bp').value = ''; save(); readCity(); });
for (const [id, field, least] of /** @type {[string, string, number][]} */ ([['city-w', 'w', 8], ['city-h', 'h', 8], ['city-buffer', 'buffer', 0]])) {
  $(id).addEventListener('change', () => {
    state.city[field] = Math.max(least, Math.floor(Number($(id).value) || 0));
    $(id).value = String(state.city[field]);
    renderForetell();
    save();
  });
}
$('city-buffer').value = String(state.city.buffer);
$('maximize').checked = state.city.maximize;
$('maximize').addEventListener('change', () => { state.city.maximize = $('maximize').checked; renderCity(); save(); });
$('apply-rate').addEventListener('click', applyRate);
readCity();
$('calculate').addEventListener('click', build);
$('stop').addEventListener('click', () => finish('Stopped'));
$('copy-string').addEventListener('click', () => copy($('bp-string').value, $('copy-string')));
$('copy-json').addEventListener('click', () => copy($('bp-json').value, $('copy-json')));
$('zoom-in').addEventListener('click', () => map?.zoom(1.4));
$('zoom-out').addEventListener('click', () => map?.zoom(1 / 1.4));
$('fit').addEventListener('click', () => map?.fit());
$('empty').textContent = 'Add goals and build a factory block to see its map here.';
renderGoals();
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
    plainPipe: prefer(choices.plainPipe, 'pipe'),
    pipe: prefer(choices.pipe, 'pipe-to-ground'),
    pole: poles[0].name,
    inserter: prefer(choices.inserter, 'fast-inserter'),
    longInserter: prefer(choices.longInserter, 'long-handed-inserter'),
    fuel: prefer(choices.fuel, 'coal'),
    rightAngle: true,
    handSize: 1,
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

// The Production Chain: every step with its rate, machines, recipe and building, and what comes
// by train. Rows are kept while their choices stay the same, so a click on one is never lost to
// a redraw.
function renderChain() {
  if (drawing) return void queueMicrotask(renderChain);
  drawing = true;
  try {
    drawChain();
  } finally {
    drawing = false;
  }
  renderForetell();
}

function drawChain() {
  const goals = state.goals.filter(g => g.item && g.rate > 0);
  try {
    chain = goals.length ? expandChain(goals, catalog, { made: state.made, selections: state.selections, index }) : null;
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
    const effect = machineEffect(catalog, selection.recipe, selection.building, selection.modules);
    const perMachine = building.craftingSpeed * effect.speed / recipe.time
      * recipe.products.find(p => p.name === goal.item).amount * (1 + effect.productivity) * 60;
    // The Count, and the machine's speed with its modules (Py farms: their plants and animals).
    chainRows.get(`step:${goal.item}`).el.querySelector('.rate').textContent = `${fmt(goal.rate)}/min · ${Math.ceil(goal.rate / perMachine - 1e-9)}×`;
    const machineSpeed = chainRows.get(`step:${goal.item}`).el.querySelector('.speed');
    machineSpeed.textContent = `${speed(building.craftingSpeed * effect.speed)}`
      + (effect.speed !== 1 ? ` (${speed(building.craftingSpeed)} × ${speed(effect.speed)} with modules)` : '') + ` · ${fmt(perMachine)}/min a machine`;
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
  // A new recipe or building starts from its own default modules.
  recipe.addEventListener('change', () => choose({ recipe: recipe.value, building: '', modules: undefined }));
  building.addEventListener('change', () => choose({ building: building.value, modules: undefined }));
  const isGoal = state.goals.some(g => g.item === item);
  const train = el('button', { type: 'button', className: 'swap', textContent: 'By train', title: `Bring ${item} by train instead` });
  train.addEventListener('click', () => { state.made = state.made.filter(i => i !== item); renderChain(); save(); });
  train.hidden = isGoal;
  return el('div', { className: 'step' },
    el('div', { className: 'step-head' }, iconOf(item), el('span', { className: 'name', textContent: item }), el('span', { className: 'rate' }), train),
    el('div', { className: 'selection' }, el('span', { textContent: 'Recipe' }), recipe, el('span', { textContent: 'Building' }), building,
      ...(selection.modules ? [el('span', { textContent: 'Modules' }), modulesEditor(item, selection, choose)] : []),
      el('span', { textContent: 'Speed' }), el('span', { className: 'speed hint' })));
}

// A step's modules: a row per module type with its count, and a button to add another type while
// slots are free. Farms start full of their first plant (js/modules.js).
function modulesEditor(item, selection, choose) {
  const slots = catalog.buildings[selection.building].moduleSlots;
  const options = moduleOptions(catalog, selection.recipe, selection.building);
  const modules = selection.modules;
  const used = modules.reduce((sum, m) => sum + m.count, 0);
  const set = list => choose({ modules: list.filter(m => m.count > 0) });
  const rows = modules.map((m, i) => {
    const name = el('select', { ariaLabel: `Module for ${item}` });
    fillSelect(name, options, m.name);
    name.addEventListener('change', () => set(modules.map((x, j) => (j === i ? { ...x, name: name.value } : x))));
    const count = el('input', { type: 'number', min: '0', max: String(slots - used + m.count), step: '1', value: String(m.count), ariaLabel: `${m.name} modules for ${item}` });
    count.addEventListener('change', () => {
      const n = Math.max(0, Math.min(slots - used + m.count, Math.floor(Number(count.value) || 0)));
      set(modules.map((x, j) => (j === i ? { ...x, count: n } : x)));
    });
    const remove = el('button', { type: 'button', className: 'icon', textContent: '×', title: `Remove ${m.name}` });
    remove.addEventListener('click', () => set(modules.filter((_, j) => j !== i)));
    return el('div', { className: 'module' }, iconOf(m.name), name, count, remove);
  });
  const add = el('button', { type: 'button', className: 'swap', textContent: '+ Module' });
  add.addEventListener('click', () => set([...modules, { name: options[0], count: slots - used }]));
  add.hidden = used >= slots || !options.length;
  return el('div', { className: 'modules' }, ...rows,
    el('div', { className: 'module' }, el('span', { className: 'hint', textContent: `${used} of ${slots} slots` }), add));
}

function trainRow(input) {
  const make = el('button', { type: 'button', className: 'swap', textContent: 'Make here', title: `Make ${input.item} in the block` });
  make.addEventListener('click', () => { state.made.push(input.item); renderChain(); save(); });
  make.hidden = input.reason !== 'import';
  return el('div', { className: 'step train' },
    el('div', { className: 'step-head' }, iconOf(input.item), el('span', { className: 'name', textContent: input.item }), el('span', { className: 'rate' }), make),
    el('div', { className: 'hint', textContent: TRAIN_REASON[input.reason] }));
}

// An item's icon from sprites/ (only its first mipmap is shown), or an empty square.
function iconOf(item) {
  const icon = el('span', { className: 'sprite', title: item });
  if (catalog.icons[item]) icon.style.backgroundImage = `url("sprites/${catalog.icons[item]}")`;
  return icon;
}

// The City Block from its blueprint string (none without one), shown in its section. A build
// waits for the last read.
function readCity() {
  const text = state.city.blueprint;
  const mine = ++reading;
  cityRead = (async () => {
    let read = null;
    if (text) {
      try {
        const blueprint = await decodeBlueprint(text);
        read = { ...readCityBlock(blueprint, catalog), blueprint };
      } catch (e) {
        read = { error: e.message };
      }
    }
    if (mine !== reading) return;
    city = read;
    renderCity();
  })();
  return cityRead;
}

function renderCity() {
  $('city').hidden = !state.city.on;
  const fromBlueprint = Boolean(city && !city.error);
  $('city-w').disabled = $('city-h').disabled = fromBlueprint;
  $('city-w').value = String(fromBlueprint ? city.area.w : state.city.w);
  $('city-h').value = String(fromBlueprint ? city.area.h : state.city.h);
  let info = 'No blueprint: an empty block of this size.';
  if (city?.error) info = `Not read: ${city.error}.`;
  else if (city) {
    const counts = new Map();
    for (const f of city.fixtures) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
    const most = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const list = most.slice(0, 6).map(([name, n]) => `${n} ${name}`).join(', ') + (most.length > 6 ? ', …' : '');
    info = `${city.area.w} × ${city.area.h} tiles; ${city.fixtures.length} entities stay${city.fixtures.length ? ` (${list})` : ''}.`
      + (city.unknown.length ? ` Size unknown, taken as one tile: ${city.unknown.join(', ')}.` : '');
  }
  $('city-info').textContent = info;
  $('calculate').textContent = state.city.on && state.city.maximize ? 'Find the highest rate' : 'Build factory block';
  renderForetell();
}

// The City Block's Site (from its blueprint, else its size), or why there is none.
function citySite() {
  try {
    return siteOf(city && !city.error ? city : { area: { x: 0, y: 0, w: state.city.w, h: state.city.h }, fixtures: [] }, state.city.buffer);
  } catch (e) {
    return { error: e.message };
  }
}

// The Foretelling (maximize.js planner), before any layout is searched: about how high a rate of
// the first Goal fits the City Block, and how much of its room the Goals' own rates take.
function renderForetell() {
  const text = state.city.on ? foretellLine() : null;
  $('city-foretell').hidden = !text;
  $('city-foretell').textContent = text ?? '';
}

function foretellLine() {
  const goals = state.goals.filter(g => g.item && g.rate > 0);
  const site = goals.length && chain && !chain.error && !city?.error ? citySite() : null;
  if (!site || site.error) return null;
  let plan;
  try {
    plan = planner(goals, catalog, logisticsOf(), { made: state.made, selections: state.selections, index, site });
  } catch {
    return null;
  }
  const { machines, rate } = plan.foretold();
  const item = goals[0].item;
  const fits = machines ? `about ${fmt(rate)}/min of ${item} fits (${count(machines, 'machine')})` : `not one machine of ${item} fits`;
  // The Goals' own rates: the tiles their Sub-Blocks span, and the square block (with its
  // Buffer) whose room that fills as full as a layout fills it.
  const need = plan.span(plan.asked);
  const side = Math.ceil(Math.sqrt(need / 0.85)) + 2 * state.city.buffer;
  return `Foretelling: ${fits}. ${fmt(goals[0].rate)}/min needs about ${need.toLocaleString('en')} tiles of its ${plan.room.toLocaleString('en')}`
    + ` (a block of about ${side} × ${side})${need > plan.room ? ' — more than it has' : ''}.`;
}

// The logistics settings the search takes (all but the search time).
function logisticsOf() {
  const { budget, ...logistics } = state.logistics;
  return logistics;
}

function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

// Starts the layout search in a worker. Every better layout it finds replaces the map and the
// blueprint; Stop, or the end of the budget, keeps the best one found. In a City Block it builds
// inside it, or (Maximize) looks for the highest rate that fits.
async function build() {
  if (!chain) return showStatus('error', 'Add at least one goal.');
  if (chain.error) return showStatus('error', chain.error);
  let site = null;
  if (state.city.on) {
    await cityRead;
    if (city?.error) return showStatus('error', `The city block's blueprint was not read: ${city.error}.`);
    site = citySite();
    if (site.error) return showStatus('error', site.error);
  }
  worker?.terminate();
  best = null;
  built = { site, blueprint: site && city ? city.blueprint : null, maximize: Boolean(site && state.city.maximize), trying: null, foretold: null };
  map?.destroy();
  map = null;
  $('area').hidden = true;
  $('results').hidden = true;
  $('apply-row').hidden = true;
  $('bp-string').value = $('bp-json').value = '';
  $('empty').hidden = false;
  $('empty').textContent = 'Searching for a layout…';
  showStatus('', 'Searching…');
  $('stop').hidden = false;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'foretell') built.foretold = data;
    else if (data.type === 'try') trying(data);
    else if (data.type === 'best') show(data.block, data.tried, data.goals ? { rate: data.rate, machines: data.machines, goals: data.goals } : null);
    else if (data.type === 'done') finish('Done', data.tried, data.failure);
    else finish('Stopped', undefined, data.message);
  };
  worker.onerror = e => finish('Stopped', undefined, e.message);
  const goals = state.goals.filter(g => g.item && g.rate > 0);
  worker.postMessage({
    entries: chain.entries,
    logistics: logisticsOf(), budgetMs: state.logistics.budget * 1000, seed: 1, site,
    ...(built.maximize ? { maximize: { goals, made: state.made, selections: state.selections } } : {}),
  });
}

// Maximize: the rate being tried, after the highest that fits so far.
function trying({ rate, machines }) {
  const item = state.goals.find(g => g.item && g.rate > 0)?.item;
  built.trying = `Trying ${fmt(rate)}/min of ${item} (${count(machines, 'machine')})…`;
  if (best) report(best.block, simulate(best.block).starvation, progress());
  else showStatus('', progress());
}

// What the status line says while searching.
function progress() {
  if (!built?.maximize) return 'Searching…';
  const told = built.foretold ? ` Foretold: about ${fmt(built.foretold.rate)}/min.` : '';
  const fits = best?.found ? ` Fits so far: ${fmt(best.found.rate)}/min.` : '';
  return `${built.trying ?? 'Searching…'}${told}${fits}`;
}

async function show(block, tried, found = null) {
  best = { block, tried, found };
  const { starvation } = simulate(block);
  const starving = new Set(starvation.map(s => s.subBlock).filter(sb => sb !== null));
  map?.destroy();
  $('empty').hidden = true;
  map = createMap($('map'), block, { starving, onHover: describe, icon: name => (catalog.icons[name] ? `sprites/${catalog.icons[name]}` : null) });
  const { bounds, site } = block;
  $('area').textContent = site
    ? `City block ${site.area.w} × ${site.area.h} · buffer ${site.buffer} · factory ${bounds.w} × ${bounds.h}${found ? ` · ${fmt(found.rate)}/min` : ''}`
    : `${bounds.w} × ${bounds.h} = ${bounds.w * bounds.h} tiles`;
  $('area').hidden = false;
  report(block, starvation, worker ? progress() : null);
  fillFlows($('side-input'), block.routes.filter(r => r.source === 'side-input'));
  fillFlows($('side-output'), block.routes.filter(r => r.sink === 'side-output'), block);
  const { string, json } = await encodeBlueprint(block, catalog, built?.blueprint ?? null);
  if (best?.block !== block) return;
  $('bp-string').value = string;
  $('bp-json').value = JSON.stringify(JSON.parse(json), null, 2);
  $('results').hidden = false;
}

function finish(how, tried = best?.tried ?? 0, error = null) {
  worker?.terminate();
  worker = null;
  $('stop').hidden = true;
  if (built?.maximize) {
    $('apply-row').hidden = !best?.found;
    if (!best?.found) {
      $('results').hidden = true;
      $('empty').textContent = 'Nothing fits yet.';
      return showStatus('error', `Nothing fits the city block without starvation${error ? `: ${error}` : ''}. Give each try more time, or a bigger block.`);
    }
    const { rate, machines } = best.found;
    return report(best.block, simulate(best.block).starvation, `${how} after ${tried} layouts. Highest rate that fits: ${fmt(rate)}/min (${count(machines, 'machine')}).`);
  }
  if (!best) {
    $('results').hidden = true;
    $('empty').textContent = 'No layout yet.';
    if (built?.site) {
      $('empty').textContent = 'Nothing fits yet.';
      return showStatus('error', `Nothing fits the city block${error ? `: ${error}` : ''}. ${foretellLine() ?? ''} Maximize finds the highest rate that fits.`);
    }
    return showStatus('error', error ?? 'No layout found. Give the search more time.');
  }
  report(best.block, simulate(best.block).starvation, `${how} after ${tried} layouts.`);
}

// Maximize: the Goals take the rates of the highest that fit.
function applyRate() {
  const goals = best?.found?.goals;
  if (!goals) return;
  for (const g of state.goals) g.rate = goals.find(x => x.item === g.item)?.rate ?? g.rate;
  $('apply-row').hidden = true;
  renderGoals();
  save();
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

// One line per item and kind, with how many parallel belts carry it when a route was split.
function fillFlows(list, routes, block) {
  const lines = new Map();
  for (const r of routes) {
    for (const i of r.items) {
      // Leftover on an output route is what the consumers along it do not take (their share of
      // it, when the route is one of several parallel belts).
      const taken = block ? r.consumers.reduce((sum, c) => sum + (block.subBlocks[c].inputs.find(x => x.name === i.item)?.rate ?? 0) * (r.share?.[c] ?? 1), 0) : 0;
      const k = `${i.item} (${r.kind})`;
      const line = lines.get(k) ?? { rate: 0, belts: 0 };
      line.rate += block ? Math.max(0, i.rate - taken) : i.rate;
      line.belts++;
      lines.set(k, line);
    }
  }
  list.replaceChildren(...[...lines].map(([k, { rate, belts }]) => el('li', {},
    el('span', { textContent: belts > 1 ? `${k} ×${belts}` : k }), el('span', { textContent: `${fmt(rate)}/min` }))));
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
  if (entity.vectors) parts.push(turnsSideways(entity) ? '90° (Inserter_Config)' : 'drop offset (Inserter_Config)');
  if (entity.kind === 'fixture') parts.push('city block (stays)');
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

function speed(n) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(3)));
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
