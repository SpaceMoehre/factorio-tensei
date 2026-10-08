import { simulate } from './sim.js';
import { expandChain, recipeOptions } from './chain.js';
import { machineEffect, moduleOptions } from './modules.js';
import { encodeBlueprint } from './blueprint.js';
import { clocksOf, clockLabel } from './clocks.js';
import { circuitPairs } from './layout/wires.js';
import { createMap, turnsSideways } from './render.js';
import { decodeBlueprint, readCityBlock, siteOf } from './city.js';
import { planner } from './maximize.js';
import { compactness, SQUARE, BEND } from './layout/score.js';

const STORAGE_KEY = 'factory-tensei:v1';
const SELECTS = ['belt', 'pipe', 'pole', 'inserter', 'longInserter', 'fuel', 'liquidFuel'];
// Virtual signals a clock may take: the catalog's (every one the game has), else the letters,
// digits, colours and a few symbols of Factorio 2.0. Without an icon, a letter, digit or colour
// is drawn as a glyph or a swatch.
/** @type {{ type: string, name: string, glyph?: string, swatch?: string }[]} */
const DRAWN = [
  ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].map(c => ({ name: `signal-${c}`, glyph: c })),
  ...Object.entries({ red: '#e53935', green: '#43a047', blue: '#1e88e5', yellow: '#fdd835', pink: '#ec407a', cyan: '#26c6da', white: '#f5f5f5', grey: '#9e9e9e', black: '#212121' })
    .map(([colour, swatch]) => ({ name: `signal-${colour}`, swatch })),
  { name: 'signal-check', glyph: '✓' }, { name: 'signal-info', glyph: 'i' }, { name: 'signal-dot', glyph: '•' },
].map(v => ({ ...v, type: 'virtual' }));
const TRAIN_REASON = { import: 'by train', 'no recipe': 'by train — nothing makes it', cycle: 'by train — a recipe loop that cannot feed itself (a fluid, or one taking more than it makes)' };
const $ = id => /** @type {any} */ (document.getElementById(id));

const raw = await fetch('data/catalog.json').then(r => r.arrayBuffer());
const catalog = JSON.parse(new TextDecoder().decode(raw));
// The catalog's fingerprint in a shared setup: the first 12 hex digits of its SHA-256.
let catalogId = null;
crypto.subtle?.digest('SHA-256', raw).then(d => { catalogId = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12); }, () => {});
// A catalog built before v2 has no inserters, power draw or fuel; the search needs all three.
const outdated = !catalog.inserters || !catalog.fuels;
if (outdated) Object.assign(catalog, { inserters: {}, fuels: {} });
const index = recipeOptions(catalog);
// A pipe-to-ground's plain pipe: the one named like it. Pipes of different materials do not
// connect, so the block takes both of one material (`pipe`, the pipe-to-ground, chosen; its
// `plainPipe` follows).
const plainOf = name => name.replace(/-to-ground$/, '');
const choices = {
  belt: Object.keys(catalog.belts), pole: Object.keys(catalog.poles),
  // Pipe-to-grounds with a plain pipe of their material (every one, in a catalog built before
  // plain pipes were recorded).
  pipe: Object.keys(catalog.pipes).filter(name => !catalog.plainPipes || catalog.plainPipes.includes(plainOf(name))),
  inserter: inserterNames(1), longInserter: inserterNames(2), fuel: Object.keys(catalog.fuels).sort(),
  // Liquid Fuels (a catalog built before them has none).
  liquidFuel: Object.keys(catalog.fluidFuels ?? {}).sort(),
};
const state = load() ?? { goals: [], logistics: {} };
state.logistics = { ...defaultLogistics(), ...state.logistics };
state.logistics.plainPipe = plainOf(state.logistics.pipe);
// What comes by train follows from the Goals' recipes; `made` lists the imports the user chose to
// make in the block instead. (Saves from before listed Train Inputs instead; that list is dropped.)
state.made ??= [];
delete state.inputs;
state.selections ??= {};
// Inserter Clocks: the signal chosen for each clock (by its key, "items/seconds"), kept from one
// build to the next.
state.clocks ??= {};
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
// The searches running: one worker for each strategy (a Maximize: one), each with how many
// layouts it tried and whether it is done.
let workers = [];
// The layout search's strategies, each run in a worker of its own, side by side (ADR 0013).
const STRATEGIES = ['search', 'spread'];
// The best layout the running (or last) search has sent, and how many layouts it had tried.
let best = null;
// The City Block read from its blueprint ({ area, fixtures, unknown, blueprint } or { error }),
// null without one; and what the running (or last) build used: the blueprint its Fixtures came
// from, whether it maximizes, and the try in progress.
let city = null;
// The shown block's Inserter Clocks (clocks.js), the clock whose signal is being picked, and the
// blueprint encoding last started.
let clocks = null;
let picking = null;
let encoding = 0;
let reading = 0;
let cityRead = Promise.resolve();
let built = null;

$('items').replaceChildren(...[...index.producers.keys()].sort().map(name => new Option(name)));
for (const key of SELECTS) {
  fillSelect($(key), choices[key], state.logistics[key], key === 'pipe' ? plainOf : undefined);
  $(key).addEventListener('change', () => {
    state.logistics[key] = $(key).value;
    if (key === 'pipe') state.logistics.plainPipe = plainOf($(key).value);
    save();
  });
}
$('circuit').value = state.logistics.circuit;
$('circuit').addEventListener('change', () => {
  state.logistics.circuit = $('circuit').value;
  save();
  // Only the blueprint and the map change: the block stays as it is.
  if (best) show(best.block, best.tried, best.found, best.score);
});
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
$('copy-setup').addEventListener('click', () => copy($('setup-json').value = setupText(), $('copy-setup')));
$('setup').addEventListener('toggle', () => { if ($('setup').open) $('setup-json').value = setupText(); });
$('picker-close').addEventListener('click', () => $('picker').close());
$('picker-none').addEventListener('click', () => choose(null));
$('picker-filter').addEventListener('input', filterPicker);
// A click on the backdrop closes it.
$('picker').addEventListener('click', e => { if (e.target === $('picker')) $('picker').close(); });
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
    pipe: prefer(choices.pipe, 'pipe-to-ground'),
    pole: poles[0].name,
    inserter: prefer(choices.inserter, 'fast-inserter'),
    longInserter: prefer(choices.longInserter, 'long-handed-inserter'),
    fuel: prefer(choices.fuel, 'coal'),
    liquidFuel: prefer(choices.liquidFuel, choices.liquidFuel.includes('natural-gas') ? 'natural-gas' : 'petroleum-gas'),
    rightAngle: true,
    handSize: 1,
    budget: 10,
    circuit: 'none',
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
  showFuels();
  renderForetell();
}

// Fuel and Liquid Fuel show only where a machine of the chain burns one: an item (a burner), or a
// fluid of the user's choice (one whose energy source takes any).
function showFuels() {
  const buildings = chain?.entries?.map(({ selection }) => catalog.buildings[selection.building]).filter(Boolean) ?? [];
  const burns = {
    fuel: buildings.some(b => b.energy === 'burner'),
    liquidFuel: buildings.some(b => b.energy === 'fluid' && !b.fuelFilter && !b.heats),
  };
  for (const [id, shown] of Object.entries(burns)) {
    $(id).hidden = !shown;
    /** @type {HTMLElement} */ (document.querySelector(`label[for="${id}"]`)).hidden = !shown;
  }
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
    // A Recipe Loop: what of this step's item goes back into the loop.
    const back = chain.loops.filter(l => l.item === goal.item);
    const loop = chainRows.get(`step:${goal.item}`).el.querySelector('.loop');
    loop.textContent = back.map(l => `↺ ${fmt(l.rate)}/min back into ${l.into === goal.item ? 'itself' : l.into} (a recipe loop)`).join(' · ');
    loop.hidden = !back.length;
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
    el('div', { className: 'hint loop', hidden: true }),
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
  for (const w of workers) w.worker.terminate();
  workers = [];
  best = null;
  built = { site, blueprint: site && city ? city.blueprint : null, maximize: Boolean(site && state.city.maximize), trying: null, foretold: null };
  map?.destroy();
  map = null;
  clocks = null;
  $('area').hidden = true;
  $('results').hidden = true;
  $('apply-row').hidden = true;
  $('bp-string').value = $('bp-json').value = '';
  $('empty').hidden = false;
  $('empty').textContent = 'Searching for a layout…';
  showStatus('', 'Searching…');
  $('stop').hidden = false;
  const goals = state.goals.filter(g => g.item && g.rate > 0);
  const started = Date.now();
  const job = { entries: chain.entries, logistics: logisticsOf(), seed: 1, site };
  // A build first designs each Sub-Block on its own, every one in a worker of its own at once;
  // the strategies then start from those designs.
  let designs = null;
  if (!built.maximize) {
    const ticket = built;
    $('empty').textContent = `Designing ${count(chain.entries.length, 'Sub-Block')}…`;
    try {
      designs = await designEach(job, ticket);
    } catch (e) {
      if (built !== ticket) return;
      return finish('Stopped', 0, e.message);
    }
    if (built !== ticket || !designs) return;
    $('empty').textContent = 'Searching for a layout…';
  }
  // A Maximize tries one rate after another in one worker; a build runs every strategy at once,
  // the best layout any of them finds shown (the others go on until the budget is spent).
  for (const strategy of built.maximize ? ['search'] : STRATEGIES) {
    const run = { worker: new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), tried: 0, done: false };
    workers.push(run);
    const tried = () => workers.reduce((sum, w) => sum + w.tried, 0);
    const over = (failure, above) => {
      run.done = true;
      run.worker.terminate();
      if (workers.every(w => w.done)) finish('Done', tried(), failure, above);
    };
    run.worker.onmessage = ({ data }) => {
      if (data.type === 'foretell') built.foretold = data;
      else if (data.type === 'try') trying(data);
      else if (data.type === 'best') {
        run.tried = data.tried;
        // A Maximize's every fit is a higher rate than the last: shown whatever its score.
        if (data.goals || !best || better(data.score, best.score)) show(data.block, tried(), data.goals ? { rate: data.rate, machines: data.machines, goals: data.goals } : null, data.score);
      } else if (data.type === 'done') {
        run.tried = data.tried;
        over(data.failure, data.above);
      } else over(data.message);
    };
    run.worker.onerror = e => over(e.message);
    run.worker.postMessage({
      ...job, strategy, designs,
      // The search time counts from the start, designing included (each strategy tries a layout
      // however little is left).
      budgetMs: Math.max(1, state.logistics.budget * 1000 - (Date.now() - started)),
      ...(built.maximize ? { maximize: { goals, made: state.made, selections: state.selections } } : {}),
    });
  }
}

// Each Sub-Block designed in a worker of its own, all at once: their candidates, by Sub-Block.
// Null once the build was stopped or started again (`ticket` no longer the build running).
function designEach(job, ticket) {
  return new Promise((resolve, reject) => {
    const lists = [];
    let left = job.entries.length;
    job.entries.forEach((_, index) => {
      const run = { worker: new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), tried: 0, done: false };
      workers.push(run);
      const end = () => {
        run.done = true;
        run.worker.terminate();
        workers = workers.filter(w => w !== run);
      };
      run.worker.onmessage = ({ data }) => {
        end();
        if (built !== ticket) return resolve(null);
        if (data.type !== 'designed') return reject(new Error(data.message));
        lists[data.index] = data.list;
        if (--left === 0) resolve(lists);
      };
      run.worker.onerror = e => {
        end();
        reject(new Error(e.message));
      };
      run.worker.postMessage({ ...job, design: index });
    });
  });
}

// Scores compare part by part (Starvation first): whether a beats b.
function better(a, b) {
  if (!b) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

// Maximize: the rate being tried, after the highest that fits so far (Filling: how many machines
// more than that).
function trying({ rate, machines, more }) {
  const item = state.goals.find(g => g.item && g.rate > 0)?.item;
  const filling = more ? `, ${fmt(more)} more than fit` : '';
  built.trying = `${more ? 'Filling up: trying' : 'Trying'} ${fmt(rate)}/min of ${item} (${count(machines, 'machine')}${filling})…`;
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

async function show(block, tried, found = null, rank = null) {
  best = { block, tried, found, score: rank };
  const { starvation } = simulate(block);
  const starving = new Set(starvation.map(s => s.subBlock).filter(sb => sb !== null));
  map?.destroy();
  $('empty').hidden = true;
  const circuit = state.logistics.circuit;
  map = createMap($('map'), block, {
    starving, onHover: describe, icon: name => (catalog.icons[name] ? `sprites/${catalog.icons[name]}` : null),
    circuit: circuit === 'none' ? null : { colors: circuit === 'both' ? ['red', 'green'] : [circuit], pairs: circuitPairs(block.entities, catalog, block.site?.fixtures ?? []) },
  });
  const { bounds, site } = block;
  // Compactness, as the search scores it: its parts, and the score.
  const score = compactness(block);
  const parts = `${site ? '' : `${score.square.toLocaleString('en')} off square · `}${score.empty.toLocaleString('en')} empty · ${count(score.bends, 'bend')} · score ${score.value.toLocaleString('en')}`;
  $('area').textContent = site
    ? `City block ${site.area.w} × ${site.area.h} · buffer ${site.buffer} · factory ${bounds.w} × ${bounds.h}${found ? ` · ${fmt(found.rate)}/min` : ''} · ${parts}`
    : `${bounds.w} × ${bounds.h} = ${(bounds.w * bounds.h).toLocaleString('en')} tiles · ${parts}`;
  $('area').title = `Compactness, lower is better: ${SQUARE === 1 ? '' : `${SQUARE} × `}the strip beyond a square, plus the tiles no machine, inserter or pole stands on, plus ${BEND} for every bend of a belt or pipe`;
  $('area').hidden = false;
  report(block, starvation, workers.some(w => !w.done) ? progress() : null);
  // A Recipe Loop's feedback fed in the block is no Side Input.
  fillFlows($('side-input'), block.routes.filter(r => r.source === 'side-input' && !(r.loop && r.fedBy !== undefined)));
  fillFlows($('side-output'), block.routes.filter(r => r.sink === 'side-output'), block);
  clocks = clocksOf(block, catalog);
  renderClocks();
  await writeBlueprint(block);
  if (best?.block !== block) return;
  $('results').hidden = false;
}

// The shown block's blueprint, with its Circuit Wires and the signals its inserters' clocks take.
async function writeBlueprint(block) {
  const mine = ++encoding;
  const { string, json } = await encodeBlueprint(block, catalog, built?.blueprint ?? null, { circuit: state.logistics.circuit, signals: state.clocks });
  if (mine !== encoding || best?.block !== block) return;
  $('bp-string').value = string;
  $('bp-json').value = JSON.stringify(JSON.parse(json), null, 2);
}

// Every clock of the shown block (fastest first): its signal (a button opening the picker), what
// it moves, the items its inserters move and how many run on it.
function renderClocks() {
  const ratios = clocks?.ratios ?? [];
  $('clocks-box').hidden = !ratios.length;
  $('clocks').replaceChildren(...ratios.map(r => {
    const signal = state.clocks[r.key];
    const label = clockLabel(r.key);
    const pick = el('button', {
      type: 'button', className: signal ? 'signal' : 'signal unset', title: signal ? `${signal.name} > 0` : 'Pick a signal',
      ariaLabel: `Signal for ${label}: ${signal?.name ?? 'none'}`,
    }, signal ? signalFace(signal) : el('span', { className: 'glyph', textContent: '+' }));
    pick.addEventListener('click', () => openPicker(r.key));
    return el('li', { title: `${fmt(r.items / r.seconds * 60)}/min each: ${r.names.join(', ')}` },
      pick, el('span', { className: 'label', textContent: label }), el('span', { className: 'what' }, ...r.names.map(iconOf)),
      el('span', { className: 'count', textContent: count(r.inserters, 'inserter') }));
  }));
  // Without Circuit Wires the signals reach no inserter until it is wired.
  $('clocks-wires').hidden = state.logistics.circuit !== 'none' || !ratios.some(r => state.clocks[r.key]);
}

// The signal picker: a modal of signal icons, virtual signals first, then the block's items and
// fluids, then every item and fluid the catalog's recipes name.
let blockSignals = null;
function openPicker(key) {
  picking = key;
  if (!blockSignals) {
    blockSignals = el('div', { className: 'signals' });
    const named = new Map();
    for (const r of Object.values(catalog.recipes)) for (const x of [...r.ingredients, ...r.products]) if (!named.has(x.name)) named.set(x.name, x.type);
    const all = [...named].sort((a, b) => a[0].localeCompare(b[0])).map(([name, type]) => ({ type, name }));
    $('picker-list').replaceChildren(
      el('h4', { textContent: 'Virtual signals' }), el('div', { className: 'signals' }, ...virtualSignals().map(signalTile)),
      el('h4', { textContent: 'In this block' }), blockSignals,
      el('h4', { textContent: 'All items and fluids' }), el('div', { className: 'signals' }, ...all.map(signalTile)));
  }
  // Each name once, where it first comes (a Map keeps its first key's place).
  const mine = new Map((best?.block.subBlocks ?? []).flatMap(sb => [...sb.outputs, ...sb.inputs])
    .map(f => [f.name, { type: f.type === 'fluid' ? 'fluid' : 'item', name: f.name }]));
  blockSignals.replaceChildren(...[...mine.values()].map(signalTile));
  const chosen = state.clocks[key];
  for (const tile of $('picker-list').querySelectorAll('button.signal')) {
    tile.setAttribute('aria-pressed', String(Boolean(chosen && tile.dataset.type === chosen.type && tile.dataset.name === chosen.name)));
  }
  $('picker-title').textContent = `Signal for ${clockLabel(key)}`;
  $('picker-none').disabled = !chosen;
  $('picker-filter').value = '';
  filterPicker();
  $('picker').showModal();
}

function signalTile(signal) {
  const tile = el('button', { type: 'button', className: 'signal', title: signal.name, ariaLabel: signal.name }, signalFace(signal));
  Object.assign(tile.dataset, { type: signal.type, name: signal.name });
  tile.addEventListener('click', () => choose(signal));
  return tile;
}

// A signal's icon: the catalog's, else a drawn glyph or swatch, else its name.
function signalFace(signal) {
  if (catalog.icons[signal.name]) return el('img', { src: `sprites/${catalog.icons[signal.name]}`, alt: '', loading: 'lazy' });
  const drawn = DRAWN.find(v => v.name === signal.name);
  if (drawn?.swatch) {
    const swatch = el('span', { className: 'swatch' });
    swatch.style.background = drawn.swatch;
    return swatch;
  }
  return el('span', drawn ? { className: 'glyph', textContent: drawn.glyph } : { className: 'glyph named', textContent: signal.name.replace(/^signal-/, '') });
}

// The virtual signals the picker offers: every one the catalog lists, else the drawn ones.
function virtualSignals() {
  return catalog.signals?.length ? catalog.signals.map(name => ({ type: 'virtual', name })) : DRAWN;
}

// Signals whose name holds the filter's words; a section with none left is hidden.
function filterPicker() {
  const words = $('picker-filter').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for (const grid of $('picker-list').querySelectorAll('.signals')) {
    let shown = 0;
    for (const tile of grid.children) {
      tile.hidden = !words.every(w => tile.dataset.name.toLowerCase().includes(w));
      if (!tile.hidden) shown++;
    }
    grid.hidden = grid.previousElementSibling.hidden = !shown;
  }
}

// The picked clock takes this signal (null: none, its inserters run freely).
function choose(signal) {
  if (signal) state.clocks[picking] = { type: signal.type, name: signal.name };
  else delete state.clocks[picking];
  save();
  $('picker').close();
  renderClocks();
  if (best) writeBlueprint(best.block);
}

function finish(how, tried = workers.reduce((sum, w) => sum + w.tried, 0) || (best?.tried ?? 0), error = null, above = null) {
  for (const w of workers) w.worker.terminate();
  workers = [];
  $('stop').hidden = true;
  if (built?.maximize) {
    $('apply-row').hidden = !best?.found;
    if (!best?.found) {
      $('results').hidden = true;
      $('empty').textContent = 'Nothing fits yet.';
      return showStatus('error', `Nothing fits the city block without starvation${error ? `: ${error}` : ''}. Give each try more time, or a bigger block.`);
    }
    const { rate, machines } = best.found;
    // Why the next rate up does not fit: the lowest that did not.
    const next = above?.reason ? ` ${fmt(above.rate)}/min does not fit: ${above.reason.replace(/\.$/, '')}.` : '';
    return report(best.block, simulate(best.block).starvation, `${how} after ${tried} layouts. Highest rate that fits: ${fmt(rate)}/min (${count(machines, 'machine')}).${next}`);
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
  const takes = (r, item) => r.consumers.reduce((sum, c) => sum + (block.subBlocks[c].inputs.find(x => x.name === item)?.rate ?? 0) * (r.share?.[c] ?? 1), 0);
  for (const r of routes) {
    for (const i of r.items) {
      // Leftover on an output route is what the consumers along it do not take (their share of
      // it, when the route is one of several parallel belts), and what a Recipe Loop's feedback
      // tapped off it takes back.
      const taken = block ? takes(r, i.item) + (r.taps ?? []).reduce((sum, id) => sum + takes(block.routes[id], i.item), 0) : 0;
      const k = `${i.item} (${r.kind})`;
      const line = lines.get(k) ?? { rate: 0, belts: 0 };
      line.rate += block ? Math.max(0, i.rate - taken) : i.rate;
      // A Fan-out's belts count once: the belt from the west edge.
      if (r.fedBy === undefined) line.belts++;
      lines.set(k, line);
    }
  }
  // An item nothing of leaves (a product all taken along the way) is no line.
  list.replaceChildren(...[...lines].filter(([, { rate }]) => !block || rate >= 0.05).map(([k, { rate, belts }]) => el('li', {},
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
  // Output Drop: the machine puts its products on the belt beside it, its inserters (if any)
  // take what that lane cannot.
  if (entity.drop) {
    const tile = `${Math.floor(entity.x + entity.drop.x)},${Math.floor(entity.y + entity.drop.y)}`;
    const belt = block.entities.some(e => (e.kind === 'belt' || e.kind === 'underground-belt') && `${e.x},${e.y}` === tile);
    parts.push(belt ? 'drops its products onto the belt beside it' : 'no belt at its drop: inserters take its products');
  }
  if (entity.dropping !== undefined) parts.push('supports its machine\'s drop');
  if (entity.kind === 'fixture') parts.push('city block (stays)');
  const clock = clocks?.of.get(entity);
  if (clock) parts.push(`clock: ${clockLabel(clock)}${state.clocks[clock] ? ` while ${state.clocks[clock].name} > 0` : ''}`);
  tip.textContent = parts.join(' · ');
}

function showStatus(kind, text) {
  const status = $('status');
  status.className = kind ? `status ${kind}` : 'status';
  status.textContent = text;
}

// The setup to share when describing a problem (Copy setup): the page's saved state (Goals, the
// items made here, Recipe Selections, logistics, City Block), the Production Chain it gives, the
// catalog's fingerprint and what the last build said.
function setupText() {
  const round = n => Math.round(n * 100) / 100;
  const steps = chain?.entries?.map(({ goal, selection }) => ({ item: goal.item, rate: round(goal.rate), ...selection }));
  const result = $('status').textContent ? {
    status: $('status').textContent,
    ...($('area').hidden ? {} : { map: $('area').textContent }),
    ...(best ? { subBlocks: best.block.subBlocks.map(sb => ({ item: sb.item, machines: sb.count, copies: sb.copies, box: `${sb.x},${sb.y} ${sb.w}×${sb.h}` })) } : {}),
  } : null;
  return JSON.stringify({
    catalog: catalogId, ...state,
    chain: chain?.error ? { error: chain.error } : chain && { steps, train: chain.trainInputs.map(t => ({ ...t, rate: round(t.rate) })), loops: chain.loops.map(l => ({ ...l, rate: round(l.rate) })) },
    ...(state.city.on && !$('city-foretell').hidden ? { foretold: $('city-foretell').textContent } : {}),
    result,
  }, null, 2);
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

function fillSelect(select, values, selected, label = v => v) {
  select.replaceChildren(...values.map(v => new Option(label(v), v, false, v === selected)));
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
